import { ethers, Filter } from 'ethers';
import * as ethereum from './ethereum';
import { logWithTimestamp } from './utils';
import { IGNORED_ARGS_MESSAGES, UNWORKED_BLOCKS_THRESHOLD } from './config'; // Import UNWORKED_BLOCKS_THRESHOLD
import { sendDiscordAlert } from './alerting'; // Import sendDiscordAlert

export interface JobState {
    address: string;
    lastWorkedBlock: bigint;
    lastCheckedBlock: bigint;
    consecutiveUnworkedBlocks: bigint;
    lastUpdateTime: number;
}

export const jobStates: Map<string, JobState> = new Map();
const jobContracts: Map<string, ethers.Contract> = new Map();

export async function getActiveJobs(): Promise<string[]> {
    try {
        const numJobs: bigint = await ethereum.sequencerContract.numJobs();
        const jobs: string[] = [];

        for (let i = BigInt(0); i < numJobs; i = i + BigInt(1)) {
            const jobAddress: string = await ethereum.sequencerContract.jobAt(i);
            jobs.push(jobAddress);
        }

        return jobs;
    } catch (error) {
        console.error("Error fetching active jobs:", error);
        throw error;
    }
}

export async function checkIfJobWasWorked(
    jobAddress: string,
    fromBlock: bigint,
    toBlock: bigint,
    provider: ethers.Provider
): Promise<boolean> {
    try {
        const jobContract = new ethers.Contract(jobAddress, ethereum.jobInterface, provider);
        const workEventFragment = ethereum.jobInterface.getEvent("Work");
        if (!workEventFragment) {
            console.error(`Event 'Work' not found in job interface for job ${jobAddress}.`);
            return false;
        }

        const workEventSignature = workEventFragment.topicHash;
        const filter: Filter = {
            address: jobAddress,
            topics: [workEventSignature],
            fromBlock: Number(fromBlock),
            toBlock: Number(toBlock)
        };

        const events = await provider.getLogs(filter);
        return events.length > 0;
    } catch (error) {
        console.error(`Error fetching Work events for job ${jobAddress} from block ${fromBlock} to ${toBlock}:`, error); // Enhanced logging with block range
        return false;
    }
}

export async function initializeJobStates(jobs: string[]): Promise<void> {
    logWithTimestamp('Initializing job states...');
    const currentBlock = BigInt(await ethereum.multicallProvider.getBlockNumber());
    const fromBlock = currentBlock >= BigInt(1000) ? currentBlock - BigInt(1000) : BigInt(0);

    logWithTimestamp(`Fetching Work events from block ${fromBlock.toString()} to ${currentBlock.toString()} for ${jobs.length} jobs...`);

    const workEventFragment = ethereum.jobInterface.getEvent("Work");
    if (!workEventFragment) {
        throw new Error("Event 'Work' not found in job interface.");
    }
    const workEventSignature = workEventFragment.topicHash;
    logWithTimestamp(`[Initialization] Work Event Signature: ${workEventSignature}`);
    const filter: Filter = {
        address: jobs,
        topics: [workEventSignature],
        fromBlock: Number(fromBlock),
        toBlock: Number(currentBlock),
    };
    logWithTimestamp(`[Initialization] Event filter: ${JSON.stringify(filter)}`);

    try {
        logWithTimestamp(`[Initialization] Fetching logs with filter...`);
        const events = await ethereum.multicallProvider.provider.getLogs(filter); // Use underlying provider for getLogs
        if (!events) {
            throw new Error('Failed to fetch Work events from the blockchain');
        }
        logWithTimestamp(`[Initialization] Fetched ${events.length} Work events from the blockchain.`);
        const lastWorkedBlocks = new Map<string, bigint>();

        for (const event of events) {
            const jobAddress = event.address.toLowerCase();
            const eventBlockNumber = BigInt(event.blockNumber);

            if (!lastWorkedBlocks.has(jobAddress) || eventBlockNumber > lastWorkedBlocks.get(jobAddress)!) {
                lastWorkedBlocks.set(jobAddress, eventBlockNumber);
            }
        }

        for (const jobAddress of jobs) {
            const jobContract = new ethers.Contract(jobAddress, ethereum.jobInterface, ethereum.multicallProvider.provider); // Use underlying provider here
            jobContracts.set(jobAddress, jobContract);
        }

        const networkIdentifier: string = await ethereum.sequencerContract.getMaster();

        const workableResults = await Promise.all(
            jobs.map(async (jobAddress) => {
                const jobContract = jobContracts.get(jobAddress)!;
                logWithTimestamp(`[Initialization] Calling workable() for job ${jobAddress}`);
                return await jobContract.workable(networkIdentifier, { provider: ethereum.multicallProvider });
            })
        );
        logWithTimestamp(`[Initialization] Received workable() results.`);

        for (let i = 0; i < jobs.length; i++) {
            const jobAddress = jobs[i];
            const normalizedAddress = jobAddress.toLowerCase();
            const lastWorkedBlock = lastWorkedBlocks.get(normalizedAddress);
            let consecutiveUnworkedBlocks: bigint;

            if (lastWorkedBlock) {
                consecutiveUnworkedBlocks = currentBlock - lastWorkedBlock;
                logWithTimestamp(`[Initialization] Job ${jobAddress} last worked at block: ${lastWorkedBlock.toString()}`);
            } else {
                consecutiveUnworkedBlocks = currentBlock - fromBlock;
                logWithTimestamp(`[Initialization] Job ${jobAddress} NOT worked in the last ${fromBlock.toString()} blocks.`);
            }

            const workableResult = workableResults[i];
            const canWork = workableResult[0];
            const argsBytes = workableResult[1];
            let argsString: string | null = null;

            try {
                argsString = new TextDecoder().decode(ethers.getBytes(argsBytes));
            } catch (e) {
                argsString = `Non-UTF8 args: ${argsBytes}`;
            }
            logWithTimestamp(`[Initialization] workable() result for job ${jobAddress}: ${JSON.stringify({ canWork: canWork, args: argsString })}`);

            jobStates.set(jobAddress, {
                address: jobAddress,
                lastWorkedBlock: lastWorkedBlock ?? fromBlock,
                lastCheckedBlock: currentBlock - BigInt(1),
                consecutiveUnworkedBlocks,
                lastUpdateTime: Date.now()
            });

            // Only log initialization status, don't send alerts during init
            if (consecutiveUnworkedBlocks >= UNWORKED_BLOCKS_THRESHOLD) {
                if (argsString && IGNORED_ARGS_MESSAGES.includes(argsString)) {
                    logWithTimestamp(`[Alert suppressed - Initialization] Job ${jobAddress} unworked for ${consecutiveUnworkedBlocks.toString()} blocks due to ignored reason: ${argsString}`);
                } else {
                    logWithTimestamp(`[Initialization] Job ${jobAddress} has been unworked for ${consecutiveUnworkedBlocks.toString()} blocks`);
                }
            }
        }

        logWithTimestamp(`Initialization complete. Job states have been set up for ${jobStates.size} jobs.`);
    } catch (error) {
        console.error("Error initializing job states:", error);
        throw error;
    }
}

export function cleanupInactiveJobs(maxJobAge: number): void {
    const currentTime = Date.now();

    for (const [address, state] of jobStates.entries()) {
        if (currentTime - state.lastUpdateTime > maxJobAge) {
            logWithTimestamp(`Removing inactive job: ${address}`);
            jobStates.delete(address);
        }
    }
}

export { jobContracts, IGNORED_ARGS_MESSAGES };
