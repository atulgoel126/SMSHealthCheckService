import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class SmsHealthCheckServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'SmsHealthCheckVpc', {
      maxAzs: 2,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis cluster',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis cluster',
      allowAllOutbound: true,
    });

    const redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      clusterName: 'sms-health-check-redis',
      engine: 'redis',
      cacheNodeType: 'cache.t3.micro',
      numCacheNodes: 1,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
    });

    const lambdaFunction = new lambda.Function(this, 'SmsHealthCheckLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-ingestion'),
      environment: {
        REDIS_ENDPOINT: redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: redisCluster.attrRedisEndpointPort,
        TTL_MINUTES: '30',
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Allow the Lambda function to connect to the Redis cluster
    redisSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(vpc.vpcCidrBlock),
        ec2.Port.tcp(6379),
        'Allow Lambda to connect to Redis'
    );

    const smsVendorRule = new events.Rule(this, 'SmsVendorRule', {
      eventPattern: {
        source: ['sms.service'],
        detailType: ['SMS Vendor Call'],
      },
    });

    const verifySmsRule = new events.Rule(this, 'VerifySmsRule', {
      eventPattern: {
        source: ['api.gateway'],
        detailType: ['/verifySMS Endpoint Invoked'],
      },
    });

    // Add the Lambda function as a target for both rules
    smsVendorRule.addTarget(new targets.LambdaFunction(lambdaFunction));
    verifySmsRule.addTarget(new targets.LambdaFunction(lambdaFunction));

    // Create a new Lambda function for processing Redis records
    const processingLambda = new lambda.Function(this, 'SmsHealthCheckProcessingLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-processing'),
      environment: {
        REDIS_ENDPOINT: redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: redisCluster.attrRedisEndpointPort,
        PROCESSING_INTERVAL_MINUTES: '1', // Reduced from 2 minutes to 1.
        ERROR_THRESHOLD_PERCENT: '2', // Configurable threshold percentage. Ideally 2% error is problematic.
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Allow the processing Lambda function to connect to the Redis cluster
    redisSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(vpc.vpcCidrBlock),
        ec2.Port.tcp(6379),
        'Allow Processing Lambda to connect to Redis'
    );

    // Since we are using Eventrgdige anyway, use this to invoke the processing function every 30 seconds. This is our 'update' window.
    const processingRule = new events.Rule(this, 'ProcessingRule', {
      schedule: events.Schedule.rate(cdk.Duration.seconds(30)),
    });

    processingRule.addTarget(new targets.LambdaFunction(processingLambda));
  }
}