import { EventBridgeEvent, Context } from 'aws-lambda';
import * as Redis from 'ioredis';

const redis = new Redis({
    host: process.env.REDIS_ENDPOINT,
    port: parseInt(process.env.REDIS_PORT || '6379'),
});

const PROCESSING_INTERVAL_MINUTES = parseInt(process.env.PROCESSING_INTERVAL_MINUTES || '2');
const ERROR_THRESHOLD_PERCENT = parseInt(process.env.ERROR_THRESHOLD_PERCENT || '10');

export async function handler(event: EventBridgeEvent<string, any>, context: Context) {
    try {
        const targetTimestamp = getTargetTimestamp();
        const key = `logins_${targetTimestamp}`;

        const loginRecords = await redis.smembers(key);
        const verifyPhoneNumbers = await redis.smembers('verify_phoneNumber');

        const totalCalls = loginRecords.length;
        const verifiedCalls = verifyPhoneNumbers.length;
        const unverifiedCalls = totalCalls - verifiedCalls;

        if (totalCalls > 0) {
            const errorPercentage = (unverifiedCalls / totalCalls) * 100;

            if (errorPercentage > ERROR_THRESHOLD_PERCENT) {
                console.log(`Error percentage (${errorPercentage.toFixed(2)}%) exceeds threshold of ${ERROR_THRESHOLD_PERCENT}%`);
                // Here you can implement additional logic, such as sending alerts or logging to a monitoring system
            } else {
                console.log(`Error percentage (${errorPercentage.toFixed(2)}%) is within acceptable range`);
            }
        } else {
            console.log('No SMS calls recorded in the processing interval');
        }

        // Clean up processed records
        await redis.del(key);
        await redis.del('verify_phoneNumber');

    } catch (error) {
        console.error('Error processing records:', error);
    }
}

function getTargetTimestamp(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() - PROCESSING_INTERVAL_MINUTES);
    return `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, '0')}${now.getUTCDate().toString().padStart(2, '0')}${now.getUTCHours().toString().padStart(2, '0')}${now.getUTCMinutes().toString().padStart(2, '0')}`;
}