import { multicallProvider } from './ethereum';
import { startHealthServer } from './health';
import { getActiveJobs, initializeJobStates, cleanupInactiveJobs, jobStates } from './job_manager';
import { processNewBlocks } from './block_processor';
import { BLOCK_CHECK_INTERVAL, BLOCK_BATCH_INTERVAL_MINUTES, MAX_JOB_AGE } from './config';
import { logWithTimestamp } from './utils';
import { sendDiscordInitializationMessage } from './alerting'; // Import the new function

let lastProcessedBlock: bigint | null = null;
let blockProcessingInterval: NodeJS.Timeout | null = null;
let cleanupJobsInterval: NodeJS.Timeout | null = null;


async function setupIntervals() {
    logWithTimestamp("[Interval Setup] Starting setupIntervals function...", "info"); // START LOG
    const batchIntervalMs = BLOCK_BATCH_INTERVAL_MINUTES * 60 * 1000;

    blockProcessingInterval = setInterval(async () => {
        try {
            logWithTimestamp("[Interval] Starting processNewBlocks interval execution.", "info"); // Added start log
            if (lastProcessedBlock !== null) {
                const result = await processNewBlocks(lastProcessedBlock, BLOCK_BATCH_INTERVAL_MINUTES, BLOCK_CHECK_INTERVAL);
                lastProcessedBlock = result.lastProcessedBlock;
            } else {
                logWithTimestamp("[Interval] lastProcessedBlock is not initialized yet.");
            }
            logWithTimestamp("[Interval] Finished processNewBlocks interval execution.", "info"); // Added finish log
        } catch (error) {
            logWithTimestamp(`[Interval Error] Error in processNewBlocks interval: ${error}`, "error");
            console.error("Error in processNewBlocks interval:", error); // Keep console.error for more critical errors
        }
    }, batchIntervalMs);
    logWithTimestamp(`[Interval Setup] processNewBlocks interval set to ${BLOCK_BATCH_INTERVAL_MINUTES} minutes.`);

    cleanupJobsInterval = setInterval(() => {
        try {
            logWithTimestamp("[Interval] Starting cleanupInactiveJobs interval execution.", "info"); // Added start log
            cleanupInactiveJobs(MAX_JOB_AGE);
            logWithTimestamp("[Interval] Finished cleanupInactiveJobs interval execution.", "info"); // Added finish log
        } catch (error) {
            logWithTimestamp(`[Interval Error] Error in cleanupInactiveJobs interval: ${error}`, "error");
            console.error("Error in cleanupInactiveJobs interval:", error); // Keep console.error for more critical errors
        }
    }, BLOCK_CHECK_INTERVAL * 4);
    logWithTimestamp(`[Interval Setup] cleanupInactiveJobs interval set to ${BLOCK_CHECK_INTERVAL * 4} ms.`);
    logWithTimestamp("[Interval Setup] All intervals have been set up."); // Added log to confirm all intervals are set
    logWithTimestamp("[Interval Setup] setupIntervals function completed SUCCESSFULLY."); // SUCCESS LOG
}


async function main() {
    logWithTimestamp("[App] Starting main application...", "info"); // Added start log
    logWithTimestamp("[App] Calling multicallProvider.getNetwork()...", "info"); // STEP LOG
    try {
        const network = await multicallProvider.getNetwork();
        logWithTimestamp(`[App] Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`, "success"); // SUCCESS LOG
        logWithTimestamp("[App] Calling multicallProvider.getBlockNumber()...", "info"); // STEP LOG

        const blockNumber = await multicallProvider.getBlockNumber();
        logWithTimestamp(`[App] Current block number: ${blockNumber}`, "success"); // SUCCESS LOG
        logWithTimestamp("[App] Calling getActiveJobs()...", "info"); // STEP LOG

        const activeJobs = await getActiveJobs();
        logWithTimestamp(`[App] Active Jobs: ${activeJobs}`, "success"); // SUCCESS LOG
        logWithTimestamp("[App] Calling initializeJobStates()...", "info"); // STEP LOG

        await initializeJobStates(activeJobs);
        logWithTimestamp("[App] initializeJobStates() completed.", "success"); // SUCCESS LOG
        logWithTimestamp("[App] Calling multicallProvider.getBlockNumber() again for lastProcessedBlock init...", "info"); // STEP LOG

        lastProcessedBlock = BigInt(await multicallProvider.getBlockNumber());
        logWithTimestamp(`[App] Last processed block initialized to: ${lastProcessedBlock.toString()} (current block after init)`, "success"); // SUCCESS LOG
        logWithTimestamp(`[App] Job states initialized: ${JSON.stringify(Array.from(jobStates.values()).map(state => ({ ...state, lastWorkedBlock: state.lastWorkedBlock.toString(), consecutiveUnworkedBlocks: state.consecutiveUnworkedBlocks.toString(), lastCheckedBlock: state.lastCheckedBlock.toString() }))) }`, "success");
        logWithTimestamp(`[App] Block batch interval: ${BLOCK_BATCH_INTERVAL_MINUTES} minute(s)`, "info");
        logWithTimestamp("[App] Calling sendDiscordInitializationMessage()...", "info"); // STEP LOG

        logWithTimestamp("[App] Starting health check server...", "info");
        startHealthServer();
        logWithTimestamp("[App] Health check server started successfully.", "success");

        logWithTimestamp("[App] Calling setupIntervals()...", "info"); // STEP LOG
        try {
            await setupIntervals(); // Start the intervals
            logWithTimestamp("[App] setupIntervals() completed SUCCESSFULLY.", "success"); // SUCCESS LOG
        } catch (intervalsError) {
            logWithTimestamp(`[App] ERROR in setupIntervals(): ${intervalsError}`, "error"); // ERROR LOG for intervals setup
            console.error("Error during setupIntervals:", intervalsError);
            if (blockProcessingInterval) clearInterval(blockProcessingInterval);
            if (cleanupJobsInterval) clearInterval(cleanupJobsInterval);
            process.exit(1);
        }


        logWithTimestamp("[App] Intervals setup completed.", "success");
        logWithTimestamp("[App] Application initialization completed successfully.", "success"); // More explicit success log
        logWithTimestamp("[App] Entering main application loop. Intervals are now running.", "info"); // Added log to indicate main loop entry

        // Keep the main function running indefinitely
        await new Promise<void>(() => {}); // Prevents main() from completing

        // The following line will not be reached
        // logWithTimestamp("[App] Main function finished execution. This line should NOT be logged in normal operation.");
    } catch (error) {
        logWithTimestamp(`[Fatal Error] Application initialization failed: ${error}`, "fatal");
        console.error("Fatal error during application initialization:", error); // More descriptive error log
        if (blockProcessingInterval) clearInterval(blockProcessingInterval); // Clear intervals in case of fatal error
        if (cleanupJobsInterval) clearInterval(cleanupJobsInterval);
        process.exit(1);
    }
}

// Global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    logWithTimestamp(`[Unhandled Rejection] Promise: ${promise}, Reason: ${reason}`, "error");
    // Optionally, decide if you want to exit the process here. For now, let's log and continue.
});


export { main };
