import { EventBridgeEvent, Context } from 'aws-lambda';
import * as Redis from 'ioredis';

const redis = new Redis({
    host: process.env.REDIS_ENDPOINT,
    port: parseInt(process.env.REDIS_PORT || '6379'),
});

const PROCESSING_INTERVAL_MINUTES = parseInt(process.env.PROCESSING_INTERVAL_MINUTES || '2');
const ERROR_THRESHOLD_PERCENT = parseInt(process.env.ERROR_THRESHOLD_PERCENT || '10');

interface SmsRecord {
    phonenumber: string;
    smsProvider: string;
    timestamp: number;
}

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

                // Analyze vendor-specific errors
                const vendorErrors = analyzeVendorErrors(loginRecords, verifyPhoneNumbers);
                logVendorErrors(vendorErrors);
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

function analyzeVendorErrors(loginRecords: string[], verifyPhoneNumbers: string[]): Map<string, { total: number, errors: number }> {
    const vendorErrors = new Map<string, { total: number, errors: number }>();

    loginRecords.forEach(record => {
        const { phonenumber, smsProvider } = JSON.parse(record) as SmsRecord;

        if (!vendorErrors.has(smsProvider)) {
            vendorErrors.set(smsProvider, { total: 0, errors: 0 });
        }

        const vendorStats = vendorErrors.get(smsProvider)!;
        vendorStats.total++;

        if (!verifyPhoneNumbers.includes(phonenumber)) {
            vendorStats.errors++;
        }
    });

    return vendorErrors;
}

function logVendorErrors(vendorErrors: Map<string, { total: number, errors: number }>) {
    console.log('Vendor-specific error analysis:');

    const vendorErrorRates = Array.from(vendorErrors.entries()).map(([vendor, stats]) => ({
        vendor,
        errorRate: (stats.errors / stats.total) * 100
    }));

    vendorErrorRates.sort((a, b) => b.errorRate - a.errorRate);

    vendorErrorRates.forEach(({ vendor, errorRate }) => {
        console.log(`${vendor}: ${errorRate.toFixed(2)}% error rate`);
    });

    const worstVendor = vendorErrorRates[0];
    console.log(`The SMS vendor with the highest error rate is ${worstVendor.vendor} with ${worstVendor.errorRate.toFixed(2)}% errors.`);
}