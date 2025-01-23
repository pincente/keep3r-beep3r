import { ethers, Filter, Log } from 'ethers';
import * as dotenv from 'dotenv';
import sequencerAbi from './abis/sequencerAbi.json';
import jobAbi from './abis/IJobAbi.json';
import fetch from 'node-fetch';

// Load environment variables from .env file
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['ETHEREUM_RPC_URL', 'DISCORD_WEBHOOK_URL'] as const;
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing ${envVar} in environment variables.`);
    }
}

// Create the Ethereum provider
const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

// Define the Sequencer contract address
const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';
const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, sequencerAbi, provider);

// Constants
const BLOCK_CHECK_INTERVAL = parseInt(process.env.BLOCK_CHECK_INTERVAL || '15000');
const UNWORKED_BLOCKS_THRESHOLD = BigInt(process.env.UNWORKED_BLOCKS_THRESHOLD || '10'); // Reduced for testing
const MAX_JOB_AGE = parseInt(process.env.MAX_JOB_AGE || '86400000'); // 24 hours in ms

// Define args messages to ignore for alerts
const IGNORED_ARGS_MESSAGES = [
    "No ilks ready",
    "Flap not possible",
    "No distribution",
    "No work to do"
];

export interface JobState {
    address: string;
    lastWorkedBlock: bigint;
    lastCheckedBlock: bigint;
    consecutiveUnworkedBlocks: bigint;
    lastUpdateTime: number; // Timestamp for cleanup purposes
}

export const jobStates: Map<string, JobState> = new Map();
const jobContracts: Map<string, ethers.Contract> = new Map();
let lastProcessedBlock: bigint;

export async function sendDiscordAlert(
    jobAddress: string,
    unworkedBlocks: bigint,
    currentBlock: bigint,
    argsString: string | null
): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error("Discord webhook URL not configured.");
    }

    if (webhookUrl.trim().toUpperCase() === 'LOCAL') {
        console.log(`[Discord Alert - LOCAL MODE] Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks.toString()} blocks (current block: ${currentBlock.toString()}). Reason: ${argsString}`);
        return; // Skip actual Discord webhook call in local mode
    }

    const message = {
        content: `🚨 Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks.toString()} blocks (current block: ${currentBlock.toString()}). Reason: ${argsString}`
    };

    console.log(`Discord Webhook URL: ${webhookUrl}`);

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        const responseBody = await response.text();

        if (!response.ok) {
            throw new Error(`Failed to send Discord alert. Status: ${response.status}, Body: ${responseBody}`);
        }

        console.log(`Alert sent to Discord for job ${jobAddress}.`);
    } catch (error) {
        console.error("Error sending Discord alert:", error);
        throw error;
    }
}

export async function getActiveJobs(): Promise<string[]> {
    try {
        const numJobs: bigint = await sequencerContract.numJobs();
        const jobs: string[] = [];

        for (let i = BigInt(0); i < numJobs; i = i + BigInt(1)) {
            const jobAddress: string = await sequencerContract.jobAt(i);
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
    toBlock: bigint
): Promise<boolean> {
    const jobContract = new ethers.Contract(jobAddress, jobAbi, provider);
    const workEventFragment = jobContract.interface.getEvent("Work");
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

    try {
        const events = await provider.getLogs(filter);
        return events.length > 0;
    } catch (error) {
        console.error(`Error fetching Work events for job ${jobAddress}:`, error);
        return false;
    }
}

export async function initializeJobStates(jobs: string[]): Promise<void> {
    console.log('Initializing job states...');
    const currentBlock = BigInt(await provider.getBlockNumber());
    const fromBlock = currentBlock >= BigInt(1000) ? currentBlock - BigInt(1000) : BigInt(0);

    console.log(`Fetching Work events from block ${fromBlock.toString()} to ${currentBlock.toString()} for ${jobs.length} jobs...`);

    const jobInterface = new ethers.Interface(jobAbi);
    const workEventFragment = jobInterface.getEvent("Work");

    if (!workEventFragment) {
        throw new Error("Event 'Work' not found in job interface.");
    }

    const workEventSignature = workEventFragment.topicHash;

    const filter: Filter = {
        address: jobs,
        topics: [workEventSignature],
        fromBlock: Number(fromBlock),
        toBlock: Number(currentBlock),
    };

    try {
        const events = await provider.getLogs(filter);
        console.log(`Fetched ${events.length} Work events from the blockchain.`);
        const lastWorkedBlocks = new Map<string, bigint>();

        for (const event of events) {
            const jobAddress = event.address.toLowerCase();
            const eventBlockNumber = BigInt(event.blockNumber);

            if (!lastWorkedBlocks.has(jobAddress) || eventBlockNumber > lastWorkedBlocks.get(jobAddress)!) {
                lastWorkedBlocks.set(jobAddress, eventBlockNumber);
            }
        }

        for (const jobAddress of jobs) {
            const jobContract = new ethers.Contract(jobAddress, jobAbi, provider);
            jobContracts.set(jobAddress, jobContract);
            const normalizedAddress = jobAddress.toLowerCase();
            const lastWorkedBlock = lastWorkedBlocks.get(normalizedAddress);
            let consecutiveUnworkedBlocks: bigint;

            if (lastWorkedBlock) {
                // Job was worked within the last 1000 blocks
                consecutiveUnworkedBlocks = currentBlock - lastWorkedBlock;
            } else {
                // Job has not been worked in the last 1000 blocks (or possibly ever)
                consecutiveUnworkedBlocks = currentBlock - fromBlock;
            }

            jobStates.set(jobAddress, {
                address: jobAddress,
                lastWorkedBlock: lastWorkedBlock ?? fromBlock,
                lastCheckedBlock: currentBlock,
                consecutiveUnworkedBlocks,
                lastUpdateTime: Date.now()
            });
        }

        console.log(`Initialization complete. Job states have been set up for ${jobStates.size} jobs.`);
    } catch (error) {
        console.error("Error initializing job states:", error);
        throw error;
    }
}

export async function processBlockNumber(blockNumber: bigint): Promise<void> {
    // Get the networkIdentifier from the Sequencer contract
    const networkIdentifier: string = await sequencerContract.getMaster();
    console.log(`networkIdentifier: ${networkIdentifier}`);

    if (networkIdentifier === ethers.ZeroHash) {
        console.warn(`No active master network at block ${blockNumber}. Skipping job processing.`);
        return;
    }

    const jobPromises = Array.from(jobStates.values()).map(async (jobState) => {
        try {
            const jobContract = jobContracts.get(jobState.address)!;
            const result = await jobContract.workable(networkIdentifier);
            const canWork: boolean = result[0]; // Access the first element (boolean)
            const argsBytes: string = result[1];    // Access the second element (bytes)
            let argsString: string | null = null;

            try {
                argsString = new TextDecoder().decode(ethers.getBytes(argsBytes));
            } catch (e) {
                argsString = `Non-UTF8 args: ${argsBytes}`;
            }


            console.log(`workable() result for job ${jobState.address}:`, {
                canWork: canWork,
                args: argsString
            });

            const previousCheckedBlock = jobState.lastCheckedBlock;
            jobState.lastCheckedBlock = blockNumber;

            if (canWork) {
                // Job needs work; increment unworked blocks
                jobState.consecutiveUnworkedBlocks += BigInt(1);
            } else {
                // Job cannot be worked; check if it was worked recently
                const wasWorked = await checkIfJobWasWorked(
                    jobState.address,
                    previousCheckedBlock + BigInt(1),
                    blockNumber
                );

                if (wasWorked) {
                    // Job was worked recently
                    jobState.lastWorkedBlock = blockNumber;
                    jobState.consecutiveUnworkedBlocks = BigInt(0);
                } else {
                    // Job was not worked; increment unworked blocks
                    jobState.consecutiveUnworkedBlocks += blockNumber - previousCheckedBlock;
                }
            }

            jobState.lastUpdateTime = Date.now();

            if (jobState.consecutiveUnworkedBlocks >= UNWORKED_BLOCKS_THRESHOLD) {
                // Check if argsString is in the ignore list
                if (argsString && IGNORED_ARGS_MESSAGES.includes(argsString)) {
                    console.log(`[Alert suppressed] Job ${jobState.address} unworked for ${jobState.consecutiveUnworkedBlocks.toString()} blocks due to ignored reason: ${argsString}`);
                } else {
                    await sendDiscordAlert(
                        jobState.address,
                        jobState.consecutiveUnworkedBlocks,
                        blockNumber,
                        argsString // Pass argsString to sendDiscordAlert
                    );
                    // Reset counter after alert to avoid repeated alerts
                    jobState.consecutiveUnworkedBlocks = BigInt(0);
                }
            }

            console.log(`Job ${jobState.address} state updated:`, {
                lastWorkedBlock: jobState.lastWorkedBlock.toString(),
                consecutiveUnworkedBlocks: jobState.consecutiveUnworkedBlocks.toString(),
                lastCheckedBlock: jobState.lastCheckedBlock.toString()
            });
        } catch (error) {
            console.error(`Error processing job ${jobState.address} at block ${blockNumber}:`, error);
        }
    });

    await Promise.all(jobPromises);
}

export async function processNewBlocks(): Promise<void> {
    try {
        const currentBlock = BigInt(await provider.getBlockNumber());

        if (!lastProcessedBlock) {
            lastProcessedBlock = currentBlock - BigInt(1);
        }

        for (let block = lastProcessedBlock + BigInt(1); block <= currentBlock; block = block + BigInt(1)) {
            await processBlockNumber(block);
        }

        lastProcessedBlock = currentBlock;
    } catch (error) {
        console.error("Error processing new blocks:", error);
    }
}

function cleanupInactiveJobs(): void {
    const currentTime = Date.now();

    for (const [address, state] of jobStates.entries()) {
        if (currentTime - state.lastUpdateTime > MAX_JOB_AGE) {
            console.log(`Removing inactive job: ${address}`);
            jobStates.delete(address);
        }
    }
}

async function main() {
    try {
        const network = await provider.getNetwork();
        console.log(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);

        const blockNumber = await provider.getBlockNumber();
        console.log(`Current block number: ${blockNumber}`);

        const activeJobs = await getActiveJobs();
        console.log('Active Jobs:', activeJobs);

        await initializeJobStates(activeJobs);
        console.log('Job states initialized:', Array.from(jobStates.values()));

        setInterval(async () => {
            await processNewBlocks();
        }, BLOCK_CHECK_INTERVAL);

        setInterval(() => {
            cleanupInactiveJobs();
        }, BLOCK_CHECK_INTERVAL * 4);

    } catch (error) {
        console.error("Error in main process:", error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Cleaning up...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT. Cleaning up...');
    process.exit(0);
});

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
