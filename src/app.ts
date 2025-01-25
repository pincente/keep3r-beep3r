import { getActiveJobs, initializeJobStates, cleanupInactiveJobs, jobStates } from './job_manager';
import { processNewBlocks } from './block_processor';
import { multicallProvider } from './ethereum';
import { BLOCK_CHECK_INTERVAL, BLOCK_BATCH_INTERVAL_MINUTES, MAX_JOB_AGE } from './config';
import { logWithTimestamp } from './utils';
import { sendDiscordInitializationMessage } from './alerting'; // Import the new function

let lastProcessedBlock: bigint | null = null;
let blockProcessingInterval: NodeJS.Timeout | null = null;
let cleanupJobsInterval: NodeJS.Timeout | null = null;


async function setupIntervals() {
    const batchIntervalMs = BLOCK_BATCH_INTERVAL_MINUTES * 60 * 1000;

    blockProcessingInterval = setInterval(async () => {
        try {
            logWithTimestamp("[Interval] Starting processNewBlocks interval execution."); // Added start log
            if (lastProcessedBlock !== null) {
                const result = await processNewBlocks(lastProcessedBlock, BLOCK_BATCH_INTERVAL_MINUTES, BLOCK_CHECK_INTERVAL);
                lastProcessedBlock = result.lastProcessedBlock;
            } else {
                logWithTimestamp("[Interval] lastProcessedBlock is not initialized yet.");
            }
            logWithTimestamp("[Interval] Finished processNewBlocks interval execution."); // Added finish log
        } catch (error) {
            logWithTimestamp(`[Interval Error] Error in processNewBlocks interval: ${error}`);
            console.error("Error in processNewBlocks interval:", error); // Keep console.error for more critical errors
        }
    }, batchIntervalMs);
    logWithTimestamp(`[Interval Setup] processNewBlocks interval set to ${BLOCK_BATCH_INTERVAL_MINUTES} minutes.`);


    cleanupJobsInterval = setInterval(() => {
        try {
            logWithTimestamp("[Interval] Starting cleanupInactiveJobs interval execution."); // Added start log
            cleanupInactiveJobs(MAX_JOB_AGE);
            logWithTimestamp("[Interval] Finished cleanupInactiveJobs interval execution."); // Added finish log
        } catch (error) {
            logWithTimestamp(`[Interval Error] Error in cleanupInactiveJobs interval: ${error}`);
            console.error("Error in cleanupInactiveJobs interval:", error); // Keep console.error for more critical errors
        }
    }, BLOCK_CHECK_INTERVAL * 4);
    logWithTimestamp(`[Interval Setup] cleanupInactiveJobs interval set to ${BLOCK_CHECK_INTERVAL * 4} ms.`);
    logWithTimestamp("[Interval Setup] All intervals have been set up."); // Added log to confirm all intervals are set
}


async function main() {
    logWithTimestamp("[App] Starting main application..."); // Added start log
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

        await sendDiscordInitializationMessage(); // Send initialization message

        setupIntervals(); // Start the intervals
        logWithTimestamp("[App] Intervals setup completed.");
        logWithTimestamp("[App] Application initialization completed successfully."); // More explicit success log
        logWithTimestamp("[App] Entering main application loop. Intervals are now running."); // Added log to indicate main loop entry


    } catch (error) {
        logWithTimestamp(`[Fatal Error] Application initialization failed: ${error}`);
        console.error("Fatal error during application initialization:", error); // More descriptive error log
        if (blockProcessingInterval) clearInterval(blockProcessingInterval); // Clear intervals in case of fatal error
        if (cleanupJobsInterval) clearInterval(cleanupJobsInterval);
        process.exit(1);
    }
    logWithTimestamp("[App] Main function finished execution. This line should NOT be logged in normal operation."); // Added finish log (should not reach here in normal operation due to intervals)
}

// Global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    logWithTimestamp(`[Unhandled Rejection] Promise: ${promise}, Reason: ${reason}`);
    // Optionally, decide if you want to exit the process here. For now, let's log and continue.
});


export { main };
