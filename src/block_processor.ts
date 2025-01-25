import { ethers } from 'ethers';
import { multicallProvider, sequencerContract, jobInterface } from './ethereum';
import { jobStates, jobContracts, checkIfJobWasWorked, IGNORED_ARGS_MESSAGES, JobState } from './job_manager';
import { sendDiscordAlert } from './alerting';
import { logWithTimestamp } from './utils';
import { UNWORKED_BLOCKS_THRESHOLD } from './config';

export async function processBlockNumber(blockNumber: bigint): Promise<void> {
    logWithTimestamp(`[Block ${blockNumber.toString()}] Starting processBlockNumber`);
    let networkIdentifier: string | null = null; // Initialize to null
    try {
        networkIdentifier = await sequencerContract.getMaster();
        logWithTimestamp(`[Block ${blockNumber.toString()}] Network Identifier: ${networkIdentifier}`);
    } catch (error) {
        console.error(`[Block ${blockNumber.toString()}] Error fetching Network Identifier:`, error); // Enhanced logging
        logWithTimestamp(`[Block ${blockNumber.toString()}] Error details: ${error}`); // Include error details in log
        return; // Skip job processing for this block if network identifier fetch fails
    }


    if (networkIdentifier === null || networkIdentifier === ethers.ZeroHash) { // Check for null as well
        logWithTimestamp(`[Block ${blockNumber.toString()}] No active master network (or error fetching). Skipping job processing.`); // More informative log
        return;
    }

    const jobStatesArray = Array.from(jobStates.values());

    logWithTimestamp(`[Block ${blockNumber.toString()}] Fetching workable() results for ${jobStatesArray.length} jobs using Multicall...`);
    const workableCalls = jobStatesArray.map(jobState => {
        const jobContract = jobContracts.get(jobState.address)!;
        return jobContract.workable(networkIdentifier!, { provider: multicallProvider }); // Non-null assertion because of null check above
    });

    let workableResults: any[] | null = null; // Initialize to null
    try {
        workableResults = await Promise.all(workableCalls); // Execute all workable calls in parallel
    } catch (error) {
        console.error(`[Block ${blockNumber.toString()}] Error in multicall workable() calls:`, error); // Enhanced logging
        logWithTimestamp(`[Block ${blockNumber.toString()}] Error details: ${error}`); // Include error details in log
        return; // Skip job processing for this block if workable calls fail
    }

    if (workableResults === null) { // Check for null workableResults
        logWithTimestamp(`[Block ${blockNumber.toString()}] workableResults is null, skipping job processing.`); // Added log for null workableResults
        return;
    }


    logWithTimestamp(`[Block ${blockNumber.toString()}] Received workable() results.`);

    for (let i = 0; i < jobStatesArray.length; i++) {
        const jobState = jobStatesArray[i];
        const result = workableResults[i];
        if (!result) { // Check if result is undefined or null
            logWithTimestamp(`[Block ${blockNumber.toString()}] No workable result for job ${jobState.address} at index ${i}. Skipping.`);
            continue; // Skip to the next job if result is missing
        }
        const canWork: boolean = result[0];
        const argsBytes: string = result[1];
        let argsString: string | null = null;

        try {
            argsString = new TextDecoder().decode(ethers.getBytes(argsBytes));
        } catch (e) {
            argsString = `Non-UTF8 args: ${argsBytes}`;
        }

        logWithTimestamp(`[Block ${blockNumber.toString()}] workable() result for job ${jobState.address}: ${JSON.stringify({ canWork: canWork, args: argsString })}`);

        const previousCheckedBlock = jobState.lastCheckedBlock;
        jobState.lastCheckedBlock = blockNumber;

        if (canWork) {
            jobState.consecutiveUnworkedBlocks += BigInt(1);
        } else {
            const wasWorked = await checkIfJobWasWorked(
                jobState.address,
                previousCheckedBlock + BigInt(1),
                blockNumber,
                multicallProvider.provider // Use underlying provider for event logs
            );

            if (wasWorked) {
                jobState.lastWorkedBlock = blockNumber;
                jobState.consecutiveUnworkedBlocks = BigInt(0);
            } else {
                jobState.consecutiveUnworkedBlocks += blockNumber - previousCheckedBlock;
            }
        }

        jobState.lastUpdateTime = Date.now();

        if (jobState.consecutiveUnworkedBlocks >= UNWORKED_BLOCKS_THRESHOLD) {
            if (argsString && IGNORED_ARGS_MESSAGES.includes(argsString)) {
                logWithTimestamp(`[Alert suppressed] Job ${jobState.address} unworked for ${jobState.consecutiveUnworkedBlocks.toString()} blocks due to ignored reason: ${argsString}`);
            } else {
                await sendDiscordAlert(
                    jobState.address,
                    jobState.consecutiveUnworkedBlocks,
                    blockNumber,
                    argsString
                );
                jobState.consecutiveUnworkedBlocks = BigInt(0);
            }
        }

        // Modified log line to convert BigInts to strings
        logWithTimestamp(`[Block ${blockNumber.toString()}] Job ${jobState.address} state updated: ${JSON.stringify({ lastWorkedBlock: jobState.lastWorkedBlock.toString(), consecutiveUnworkedBlocks: jobState.consecutiveUnworkedBlocks.toString(), lastCheckedBlock: jobState.lastCheckedBlock.toString() })}`);
    }

    logWithTimestamp(`[Block ${blockNumber.toString()}] Finished processBlockNumber`);
}

export async function processNewBlocks(lastProcessedBlock: bigint, blockBatchIntervalMinutes: number, blockCheckInterval: number): Promise<{ lastProcessedBlock: bigint }> {
    let processingBlocks = false;
    if (processingBlocks) {
        logWithTimestamp("[processNewBlocks] Already processing blocks, skipping this interval.");
        return { lastProcessedBlock };
    }
    processingBlocks = true;
    logWithTimestamp(`[processNewBlocks] Starting processNewBlocks. Interval: ${blockBatchIntervalMinutes} minutes`); // Added interval log here
    try {
        const currentBlock = BigInt(await multicallProvider.provider.getBlockNumber());
        logWithTimestamp(`[processNewBlocks] Current block: ${currentBlock.toString()}`);
        logWithTimestamp(`[processNewBlocks] Last processed block: ${lastProcessedBlock ? lastProcessedBlock.toString() : 'N/A'}`);

        if (!lastProcessedBlock) {
            lastProcessedBlock = currentBlock - BigInt(1);
            logWithTimestamp(`[processNewBlocks] Initializing lastProcessedBlock to: ${lastProcessedBlock.toString()}`);
        }

        const blockBatchIntervalBlocks = Math.max(1, Math.floor((blockBatchIntervalMinutes * 60 * 1000) / blockCheckInterval));

        for (let block = lastProcessedBlock + BigInt(1); block <= currentBlock; block = block + BigInt(blockBatchIntervalBlocks)) {
            const toBlock = block + BigInt(blockBatchIntervalBlocks) - BigInt(1) > currentBlock ? currentBlock : block + BigInt(blockBatchIntervalBlocks) - BigInt(1);
            logWithTimestamp(`[processNewBlocks] Processing blocks from: ${block.toString()} to ${toBlock.toString()}`);
            for (let b = block; b <= toBlock; b = b + BigInt(1)) {
                await processBlockNumber(b);
                lastProcessedBlock = b;
            }
        }


        logWithTimestamp(`[processNewBlocks] lastProcessedBlock updated to: ${lastProcessedBlock.toString()}`);
        logWithTimestamp(`[processNewBlocks] Waiting for next interval. Interval: ${blockBatchIntervalMinutes} minute(s)`);

    } catch (error) {
        console.error("Error processing new blocks:", error);
        logWithTimestamp(`[processNewBlocks] Error details: ${error}`); // Include error details in log
    } finally {
        processingBlocks = false;
        logWithTimestamp("[processNewBlocks] Finished processNewBlocks");
    }
    return { lastProcessedBlock };
}
