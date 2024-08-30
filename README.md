# SMS Health Check Service

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Components](#components)
    - [CDK Stack](#cdk-stack)
    - [Event Processing Lambda](#event-processing-lambda)
    - [Health Check Processing Lambda](#health-check-processing-lambda)
    - [Redis Cluster](#redis-cluster)
4. [Lambda Invocations](#lambda-invocations)
5. [Setup and Deployment](#setup-and-deployment)
6. [Configuration](#configuration)
7. [Monitoring and Alerts](#monitoring-and-alerts)

## Project Overview

The SMS Health Check Service is an AWS-based solution designed to monitor and analyze the health of SMS sending operations. It tracks SMS vendor calls and verification attempts, calculates error rates, and identifies problematic SMS vendors.

Key features:
- Real-time tracking of SMS vendor calls and verification attempts
- Periodic processing to calculate error rates
- Identification of SMS vendors with high error rates
- Configurable error thresholds and processing intervals

## Architecture

The service uses a serverless architecture built on AWS, leveraging the following services:
- AWS Lambda for event processing and periodic health checks
- Amazon EventBridge for event routing and scheduled tasks
- Amazon ElastiCache (Redis) for short-term data storage
- Amazon VPC for network isolation

## Components

### CDK Stack

The infrastructure is defined as code using the AWS CDK. The main stack (`SmsHealthCheckServiceStack`) creates all necessary resources:
- VPC
- Redis cluster
- Lambda functions
- EventBridge rules

File: `lib/sms-health-check-service-stack.ts`

### Event Processing Lambda

This Lambda function processes incoming events related to SMS vendor calls and verification attempts.

File: `lambda-ingestion/index.ts`

Key responsibilities:
- Handle 'SMS Vendor Call' events
- Handle 'Verify SMS Endpoint Invoked' events
- Store event data in Redis

### Health Check Processing Lambda

This Lambda function performs periodic health checks on the SMS operations.

File: `lambda-processing/index.ts`

Key responsibilities:
- Calculate overall error rates
- Analyze vendor-specific error rates
- Identify the SMS vendor with the highest error rate
- Log results and potential alerts

### Redis Cluster

An ElastiCache Redis cluster is used for short-term storage of SMS-related events.

Key data structures:
- `logins_<timestamp>`: Set of SMS vendor call events
- `verify_phoneNumber`: Set of verified phone numbers

## Lambda Invocations

### Event Processing Lambda

This Lambda is invoked by two EventBridge rules:

1. SMS Vendor Call Rule
    - Source: 'sms.service'
    - Detail Type: 'SMS Vendor Call'
    - Event pattern:
      ```json
      {
        "source": ["sms.service"],
        "detailType": ["SMS Vendor Call"]
      }
      ```

2. Verify SMS Rule
    - Source: 'api.gateway'
    - Detail Type: 'Verify SMS Endpoint Invoked'
    - Event pattern:
      ```json
      {
        "source": ["api.gateway"],
        "detailType": ["Verify SMS Endpoint Invoked"]
      }
      ```

When invoked, this Lambda processes the event and stores relevant data in Redis.

### Health Check Processing Lambda

This Lambda is invoked by a scheduled EventBridge rule:

- Schedule: Every 10 seconds (configurable)
- Rule name: 'ProcessingRule'

When invoked, this Lambda:
1. Retrieves data from Redis for the target time window
2. Calculates error rates (overall and per vendor)
3. Logs results and potential alerts

## Setup and Deployment

1. Ensure you have the AWS CDK installed and configured.
2. Clone this repository.
3. Install dependencies:
   ```
   npm install
   ```
4. Build the project:
   ```
   npm run build
   ```
5. Deploy the stack:
   ```
   cdk deploy
   ```

## Configuration

The following environment variables can be configured in the CDK stack:

- Event Processing Lambda:
    - `TTL_MINUTES`: Time-to-live for Redis keys (default: 30)

- Health Check Processing Lambda:
    - `PROCESSING_INTERVAL_MINUTES`: Time window for processing (default: 2)
    - `ERROR_THRESHOLD_PERCENT`: Error rate threshold for alerts (default: 10)

To modify these, update the `environment` property of the respective Lambda in `lib/sms-health-check-service-stack.ts`.

## Monitoring and Alerts

- CloudWatch Logs are used for logging from both Lambda functions.
- For production use, consider setting up CloudWatch Alarms based on error rates or Lambda execution metrics.
