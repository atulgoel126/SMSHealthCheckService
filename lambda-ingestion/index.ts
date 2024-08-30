import { EventBridgeEvent, Context } from 'aws-lambda';
import * as Redis from 'ioredis';

const redis = new Redis({
    host: process.env.REDIS_ENDPOINT,
    port: parseInt(process.env.REDIS_PORT || '6379'),
});

const TTL_MINUTES = parseInt(process.env.TTL_MINUTES || '30');

export async function handler(event: EventBridgeEvent<string, any>, context: Context) {
    try {
        if (event['detail-type'] === 'SMS Vendor Call') {
            await handleSmsVendorCall(event.detail);
        } else if (event['detail-type'] === 'Verify SMS Endpoint Invoked') {
            await handleVerifySmsEndpoint(event.detail);
        }
    } catch (error) {
        console.error('Error processing event:', error);
    }
}

async function handleSmsVendorCall(detail: any) {
    const { phonenumber, smsProvider, timestamp } = detail;
    const key = `logins_${getMinuteTimestamp(timestamp)}`;

    await redis.sadd(key, JSON.stringify({ phonenumber, smsProvider, timestamp }));
    await redis.expire(key, TTL_MINUTES * 60);
}

async function handleVerifySmsEndpoint(detail: any) {
    const { phonenumber } = detail;
    const key = 'verify_phoneNumber';

    await redis.sadd(key, phonenumber);
    await redis.expire(key, TTL_MINUTES * 60);
}

function getMinuteTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}${(date.getUTCMonth() + 1).toString().padStart(2, '0')}${date.getUTCDate().toString().padStart(2, '0')}${date.getUTCHours().toString().padStart(2, '0')}${date.getUTCMinutes().toString().padStart(2, '0')}`;
}