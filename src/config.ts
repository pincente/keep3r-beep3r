import * as dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = ['ETHEREUM_RPC_URL', 'DISCORD_WEBHOOK_URL'] as const;
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing ${envVar} in environment variables.`);
    }
}

export const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL!;
export const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!;
export const BLOCK_CHECK_INTERVAL = parseInt(process.env.BLOCK_CHECK_INTERVAL || '15000');
export const BLOCK_BATCH_INTERVAL_MINUTES = parseInt(process.env.BLOCK_BATCH_INTERVAL || '5');
export const UNWORKED_BLOCKS_THRESHOLD = BigInt(process.env.UNWORKED_BLOCKS_THRESHOLD || '1000');
export const MAX_JOB_AGE = parseInt(process.env.MAX_JOB_AGE || '86400000');
export const IGNORED_ARGS_MESSAGES = [
    "No ilks ready",
    "Flap not possible",
    "No distribution",
    "No work to do",
    "shouldUpdate is false"
];
