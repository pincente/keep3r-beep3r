import { ethers, Filter, Log, getDefaultProvider } from 'ethers'; // Import getDefaultProvider
import * * as dotenv from 'dotenv';
import sequencerAbi from './abis/sequencerAbi.json';
import jobAbi from './abis/IJobAbi.json';
import fetch from 'node-fetch';

// Import MulticallWrapper using require
const multicallProviderLib = require('ethers-multicall-provider');
const MulticallWrapper = multicallProviderLib.MulticallWrapper; // Use MulticallWrapper

// Load environment variables from .env file
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['ETHEREUM_RPC_URL', 'DISCORD_WEBHOOK_URL'] as const;
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing ${envVar} in environment variables.`);
    }
}

// Create the Ethereum provider and wrap it with MulticallWrapper
const provider = getDefaultProvider(process.env.ETHEREUM_RPC_URL); // Use getDefaultProvider
const multicallProvider = MulticallWrapper.wrap(provider); // Wrap the provider

// Define the Sequencer contract address
const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';
const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, sequencerAbi, multicallProvider); // Use wrapped provider

// Constants
const BLOCK_CHECK_INTERVAL = parseInt(process.env.BLOCK_CHECK_INTERVAL || '15000');
const UNWORKED_BLOCKS_THRESHOLD = BigInt(process.env.UNWORKED_BLOCKS_THRESHOLD || '10'); // Reduced for testing
const MAX_JOB_AGE = parseInt(process.env.MAX_JOB_AGE || '86400000'); // 24 hours in ms

// Define args messages to ignore for alerts
const IGNORED_ARGS_MESSAGES = [
    "No ilks ready",
    "Flap not possible",
    "No distribution",
    "No work to do",
    "shouldUpdate is false"
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

function logWithTimestamp(message: string) { // Helper function for timestamped logs
    console.log(`[${new Date().toISOString()}] ${message}`);
}


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
        logWithTimestamp(`[Discord Alert - LOCAL MODE] Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks.toString()} blocks (current block: ${currentBlock.toString()}). Reason: ${argsString}`);
        return; // Skip actual Discord webhook call in local mode
    }

    const message = {
        content: `🚨 Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks.toString()} blocks (current block: ${currentBlock.toString()}). Reason: ${argsString}`
    };

    logWithTimestamp(`Discord Webhook URL: ${webhookUrl}`);

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

        logWithTimestamp(`Alert sent to Discord for job ${jobAddress}.`);
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
    const jobContract = new ethers.Contract(jobAddress, jobAbi, provider); // Use regular provider here - important to use regular provider, not multicall one for event logs
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
        const events = await provider.getLogs(filter); // Use regular provider here - important to use regular provider, not multicall one for event logs
        return events.length > 0;
    } catch (error) {
        console.error(`Error fetching Work events for job ${jobAddress}:`, error);
        return false;
    }
}

export async function initializeJobStates(jobs: string[]): Promise<void> {
    logWithTimestamp('Initializing job states...');
    const currentBlock = BigInt(await provider.getBlockNumber());
    const fromBlock = currentBlock >= BigInt(1000) ? currentBlock - BigInt(1000) : BigInt(0);

    logWithTimestamp(`Fetching Work events from block ${fromBlock.toString()} to ${currentBlock.toString()} for ${jobs.length} jobs...`);

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
        const events = await provider.getLogs(filter); // Use regular provider here - important to use regular provider, not multicall one for event logs
        logWithTimestamp(`Fetched ${events.length} Work events from the blockchain.`);
        const lastWorkedBlocks = new Map<string, bigint>();

        for (const event of events) {
            const jobAddress = event.address.toLowerCase();
            const eventBlockNumber = BigInt(event.blockNumber);

            if (!lastWorkedBlocks.has(jobAddress) || eventBlockNumber > lastWorkedBlocks.get(jobAddress)!) {
                lastWorkedBlocks.set(jobAddress, eventBlockNumber);
            }
        }

        for (const jobAddress of jobs) {
            const jobContract = new ethers.Contract(jobAddress, jobAbi, provider); // Use regular provider here - important to use regular provider, not multicall one for event logs
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

        logWithTimestamp(`Initialization complete. Job states have been set up for ${jobStates.size} jobs.`);
    } catch (error) {
        console.error("Error initializing job states:", error);
        throw error;
    }
}

export async function processBlockNumber(blockNumber: bigint): Promise<void> {
    logWithTimestamp(`[Block ${blockNumber.toString()}] Starting processBlockNumber`); // Log start of block processing
    // Get the networkIdentifier from the Sequencer contract
    const networkIdentifier: string = await sequencerContract.getMaster();
    logWithTimestamp(`[Block ${blockNumber.toString()}] Network Identifier: ${networkIdentifier}`);

    if (networkIdentifier === ethers.ZeroHash) {
        logWithTimestamp(`[Block ${blockNumber.toString()}] No active master network. Skipping job processing.`);
        return;
    }

    const jobStatesArray = Array.from(jobStates.values());

    logWithTimestamp(`[Block ${blockNumber.toString()}] Fetching workable() results for ${jobStatesArray.length} jobs using Multicall...`); // Log multicall start
    // Directly call workable on each jobContract through multicallProvider
    const workableResults = await Promise.all(
        jobStatesArray.map(async (jobState) => {
            const jobContract = jobContracts.get(jobState.address)!; // Get jobContract from map
            return await jobContract.workable(networkIdentifier, { provider: multicallProvider }); // Call workable with multicallProvider as option
        })
    );
    logWithTimestamp(`[Block ${blockNumber.toString()}] Received workable() results.`); // Log multicall end


    for (let i = 0; i < jobStatesArray.length; i++) {
        const jobState = jobStatesArray[i];
        const result = workableResults[i];
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
                logWithTimestamp(`[Alert suppressed] Job ${jobState.address} unworked for ${jobState.consecutiveUnworkedBlocks.toString()} blocks due to ignored reason: ${argsString}`); // More informative log - ADDED JOB ADDRESS AND BLOCK COUNT
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

        // Modified log line to convert BigInts to strings
        logWithTimestamp(`[Block ${blockNumber.toString()}] Job ${jobState.address} state updated: ${JSON.stringify({ lastWorkedBlock: jobState.lastWorkedBlock.toString(), consecutiveUnworkedBlocks: jobState.consecutiveUnworkedBlocks.toString(), lastCheckedBlock: jobState.lastCheckedBlock.toString() })}`);
    }

    logWithTimestamp(`[Block ${blockNumber.toString()}] Finished processBlockNumber`); // Log end of block processing

}


export async function processNewBlocks(): Promise<void> {
    logWithTimestamp("[processNewBlocks] Starting processNewBlocks"); // ADD LOG
    try {
        // Modified line: Use underlying provider to get block number
        const currentBlock = BigInt(await multicallProvider.provider.getBlockNumber());
        logWithTimestamp(`[processNewBlocks] Current block: ${currentBlock.toString()}`); // ADD LOG
        logWithTimestamp(`[processNewBlocks] Last processed block: ${lastProcessedBlock ? lastProcessedBlock.toString() : 'N/A'}`); // ADD LOG


        if (!lastProcessedBlock) {
            lastProcessedBlock = currentBlock - BigInt(1);
            logWithTimestamp(`[processNewBlocks] Initializing lastProcessedBlock to: ${lastProcessedBlock.toString()}`); // ADD LOG
        }

        for (let block = lastProcessedBlock + BigInt(1); block <= currentBlock; block = block + BigInt(1)) {
            logWithTimestamp(`[processNewBlocks] Processing block: ${block.toString()}`); // ADD LOG
            await processBlockNumber(block);
            lastProcessedBlock = block; // UPDATE lastProcessedBlock HERE!
        }

        logWithTimestamp(`[processNewBlocks] lastProcessedBlock updated to: ${lastProcessedBlock.toString()}`); // ADD LOG - Now logged after loop

    } catch (error) {
        console.error("Error processing new blocks:", error);
    }
    logWithTimestamp("[processNewBlocks] Finished processNewBlocks"); // ADD LOG
}

function cleanupInactiveJobs(): void {
    const currentTime = Date.now();

    for (const [address, state] of jobStates.entries()) {
        if (currentTime - state.lastUpdateTime > MAX_JOB_AGE) {
            logWithTimestamp(`Removing inactive job: ${address}`);
            jobStates.delete(address);
        }
    }
}

async function main() {
    try {
        const network = await multicallProvider.getNetwork(); // Use multicallProvider to get network - important to use multicall provider
        logWithTimestamp(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);

        const blockNumber = await multicallProvider.getBlockNumber(); // Use multicallProvider to get block number - important to use multicall provider
        logWithTimestamp(`Current block number: ${blockNumber}`);

        const activeJobs = await getActiveJobs();
        logWithTimestamp(`Active Jobs: ${activeJobs}`);

        await initializeJobStates(activeJobs);
        // Modified log line to convert BigInts to strings
        logWithTimestamp(`Job states initialized: ${JSON.stringify(Array.from(jobStates.values()).map(state => ({ ...state, lastWorkedBlock: state.lastWorkedBlock.toString(), consecutiveUnworkedBlocks: state.consecutiveUnworkedBlocks.toString(), lastCheckedBlock: state.lastCheckedBlock.toString() }))) }`);


        setInterval(async () => {
            await processNewBlocks();
        }, BLOCK_CHECK_INTERVAL);

        setInterval(() => {
            cleanupInactiveJobs();
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
