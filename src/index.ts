import { getActiveJobs, initializeJobStates, cleanupInactiveJobs, jobStates } from './job_manager';
import { processNewBlocks } from './block_processor';
import { multicallProvider } from './ethereum';
import { BLOCK_CHECK_INTERVAL, BLOCK_BATCH_INTERVAL_MINUTES, MAX_JOB_AGE } from './config';
import { logWithTimestamp } from './utils';

let lastProcessedBlock: bigint | null = null;

async function main() {
    try {
        const network = await multicallProvider.getNetwork();
        logWithTimestamp(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);

        const blockNumber = await multicallProvider.getBlockNumber();
        logWithTimestamp(`Current block number: ${blockNumber}`);

        const activeJobs = await getActiveJobs();
        logWithTimestamp(`Active Jobs: ${activeJobs}`);

        await initializeJobStates(activeJobs);
        lastProcessedBlock = BigInt(await multicallProvider.getBlockNumber());
        logWithTimestamp(`Last processed block initialized to: ${lastProcessedBlock.toString()} (current block after init)`);
        logWithTimestamp(`Job states initialized: ${JSON.stringify(Array.from(jobStates.values()).map(state => ({ ...state, lastWorkedBlock: state.lastWorkedBlock.toString(), consecutiveUnworkedBlocks: state.consecutiveUnworkedBlocks.toString(), lastCheckedBlock: state.lastCheckedBlock.toString() }))) }`);
        logWithTimestamp(`Block batch interval: ${BLOCK_BATCH_INTERVAL_MINUTES} minute(s)`);


        const batchIntervalMs = BLOCK_BATCH_INTERVAL_MINUTES * 60 * 1000;

        setInterval(async () => {
            if (lastProcessedBlock !== null) {
                const result = await processNewBlocks(lastProcessedBlock, BLOCK_BATCH_INTERVAL_MINUTES, BLOCK_CHECK_INTERVAL);
                lastProcessedBlock = result.lastProcessedBlock;
            } else {
                logWithTimestamp("lastProcessedBlock is not initialized yet.");
            }
        }, batchIntervalMs);

        setInterval(() => {
            cleanupInactiveJobs(MAX_JOB_AGE);
        }, BLOCK_CHECK_INTERVAL * 4);

    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => {
    logWithTimestamp('Received SIGTERM. Cleaning up...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logWithTimestamp('Received SIGINT. Cleaning up...');
    process.exit(0);
});

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
