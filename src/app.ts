import { getActiveJobs, initializeJobStates, cleanupInactiveJobs, jobStates } from './job_manager';
import { processNewBlocks } from './block_processor';
import { multicallProvider } from './ethereum';
import { BLOCK_CHECK_INTERVAL, BLOCK_BATCH_INTERVAL_MINUTES, MAX_JOB_AGE } from './config';
import { logWithTimestamp } from './utils';

let lastProcessedBlock: bigint | null = null;

async function setupIntervals() {
    const batchIntervalMs = BLOCK_BATCH_INTERVAL_MINUTES * 60 * 1000;

    setInterval(async () => {
        try {
            if (lastProcessedBlock !== null) {
                const result = await processNewBlocks(lastProcessedBlock, BLOCK_BATCH_INTERVAL_MINUTES, BLOCK_CHECK_INTERVAL);
                lastProcessedBlock = result.lastProcessedBlock;
            } else {
                logWithTimestamp("[Interval] lastProcessedBlock is not initialized yet.");
            }
        } catch (error) {
            logWithTimestamp(`[Interval Error] Error in processNewBlocks interval: ${error}`);
            console.error("Error in processNewBlocks interval:", error); // Keep console.error for more critical errors
        }
    }, batchIntervalMs);

    setInterval(() => {
        try {
            cleanupInactiveJobs(MAX_JOB_AGE);
        } catch (error) {
            logWithTimestamp(`[Interval Error] Error in cleanupInactiveJobs interval: ${error}`);
            console.error("Error in cleanupInactiveJobs interval:", error); // Keep console.error for more critical errors
        }
    }, BLOCK_CHECK_INTERVAL * 4);
}


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

        setupIntervals(); // Start the intervals

    } catch (error) {
        logWithTimestamp(`[Fatal Error] Application initialization failed: ${error}`);
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

export { main };
