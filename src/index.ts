import { ethers, Filter, Log } from 'ethers';
import * as dotenv from 'dotenv';

import sequencerAbi from './abis/sequencerAbi.json';
import fetch from 'node-fetch'; // Make sure to import fetch

import jobAbi from './abis/IJobAbi.json';

// Load environment variables from .env file
dotenv.config();

// Retrieve the Ethereum RPC URL from environment variables
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL;

if (!ETHEREUM_RPC_URL) {
  throw new Error("Missing ETHEREUM_RPC_URL in environment variables.");
}

// Create the Ethereum provider
const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);

// Define the Sequencer contract address
const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';

const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, sequencerAbi, provider);

export interface JobState {
    address: string;
    lastWorkedBlock: bigint;
    lastCheckedBlock: bigint;
    consecutiveUnworkedBlocks: number;
}

// Define the sendDiscordAlert function
export async function sendDiscordAlert(jobAddress: string, unworkedBlocks: number, currentBlock: number): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error("Discord webhook URL not configured.");
        return;
    }

    const message = {
        content: `🚨 Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks} blocks (current block: ${currentBlock}).`
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });
        if (!response.ok) {
            console.error(`Failed to send Discord alert. Status: ${response.status}`);
        } else {
            console.log(`Alert sent to Discord for job ${jobAddress}.`);
        }
    } catch (error) {
        console.error("Error sending Discord alert:", error);
    }
}

export const jobStates: Map<string, JobState> = new Map();

export async function getActiveJobs(): Promise<string[]> {
    const numJobs: bigint = await sequencerContract.numJobs();
    const numJobsNumber = Number(numJobs);
    const jobs: string[] = [];

    for (let i = 0; i < numJobsNumber; i++) {
        const jobAddress: string = await sequencerContract.jobAt(i);
        jobs.push(jobAddress);
    }

    return jobs;
}


export async function checkIfJobWasWorked(jobAddress: string, fromBlock: number, toBlock: number): Promise<number | null> { // Changed return type to number | null
    const jobContract = new ethers.Contract(jobAddress, jobAbi, provider);

    // Get the event filter for the Work event
    const workEventFilter = jobContract.filters.Work();

    try {
        // Fetch the logs for the Work event between fromBlock and toBlock
        const events = await jobContract.queryFilter(workEventFilter, fromBlock, toBlock);

        if (events.length > 0) {
            // Return the block number of the most recent Work event
            const lastEvent = events[events.length - 1];
            return lastEvent.blockNumber;
        } else {
            // No Work events found in the specified block range
            return null;
        }
    } catch (error) {
        console.error(`Error fetching Work events for job ${jobAddress}:`, error);
        return null;
    }
}


export async function initializeJobStates(jobs: string[]): Promise<void> {
    const currentBlock: bigint = await provider.getBlockNumber();
    const fromBlock = currentBlock >= BigInt(1000) ? currentBlock - BigInt(1000) : BigInt(0);

    // Create a filter for all Work events from the jobs
    const workEventSignature = ethers.id("Work(bytes32,address)");
    const filter: Filter = {
        address: jobs,
        topics: [workEventSignature],
        fromBlock: Number(fromBlock),
        toBlock: Number(currentBlock),
    };

    // Fetch all Work events in the last 1000 blocks for all jobs
    let events: Log[] = [];
    try {
        events = await provider.getLogs(filter);
    } catch (error) {
        console.error(`Error fetching Work events:`, error);
    }

    // Map to store the last worked block for each job
    const lastWorkedBlocks: { [address: string]: bigint } = {};

    for (const event of events) { // 'event' is now correctly inferred as ethers.providers.Log
        const jobAddress = event.address.toLowerCase();
        if (!lastWorkedBlocks[jobAddress] || event.blockNumber > lastWorkedBlocks[jobAddress]) {
            lastWorkedBlocks[jobAddress] = event.blockNumber;
        }
    }

    for (const jobAddress of jobs) {
        const normalizedAddress = jobAddress.toLowerCase();
        const lastWorkedBlock = lastWorkedBlocks[normalizedAddress] ?? null;

        let consecutiveUnworkedBlocks: number;

        if (lastWorkedBlock !== null) {
            consecutiveUnworkedBlocks = currentBlock - lastWorkedBlock;
        } else {
            consecutiveUnworkedBlocks = 1000;
        }

        jobStates.set(jobAddress, {
            address: jobAddress,
            lastWorkedBlock: lastWorkedBlock ?? fromBlock,
            lastCheckedBlock: currentBlock,
            consecutiveUnworkedBlocks,
        });
    }
}

async function main() {
    try {
        // Fetch network information
        const network = await provider.getNetwork();
        console.log(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);

        // Fetch the current block number
        const blockNumber = await provider.getBlockNumber();
        console.log(`Current block number: ${blockNumber}`);
        // Fetch and display active jobs from the Sequencer contract
        const activeJobs = await getActiveJobs();
        console.log('Active Jobs:', activeJobs);
        // Initialize job states
        await initializeJobStates(activeJobs);
        console.log('Initialized Job States:', Array.from(jobStates.values()));
    } catch (error) {
        console.error("Error connecting to Ethereum network:", error);
    }
    // Start processing new blocks at intervals
    setInterval(async () => {
        await processNewBlock();
    }, 15000); // Poll every 15 seconds (adjust as needed)
}


export async function processNewBlock(): Promise<void> {
    const currentBlock: bigint = await provider.getBlockNumber();
    console.log(`Processing block ${currentBlock.toString()}`);

    const networkIdentifier = ethers.ZeroHash; // Use the appropriate network identifier

    for (const jobState of jobStates.values()) {
        try {
            const jobContract = new ethers.Contract(jobState.address, jobAbi, provider);
            const result = await jobContract.workable(networkIdentifier);
            const canWork = result[0];
            const args = result[1];

            if (!canWork) {
                // Job has been worked recently
                jobState.lastWorkedBlock = currentBlock;
                jobState.consecutiveUnworkedBlocks = 0;
            } else {
                // Job needs work; increment unworked blocks
                const blocksSinceLastCheck = Number(currentBlock - jobState.lastCheckedBlock);
                jobState.consecutiveUnworkedBlocks += blocksSinceLastCheck;
            }

            jobState.lastCheckedBlock = currentBlock;

            // Check if the job hasn't been worked for 1000 consecutive blocks
            if (jobState.consecutiveUnworkedBlocks >= 1000) {
                await sendDiscordAlert(jobState.address, jobState.consecutiveUnworkedBlocks, Number(currentBlock));
                // Reset the counter or implement logic to avoid repeated alerts
                jobState.consecutiveUnworkedBlocks = 0;
            }

            // Log job state (optional)
            console.log(`Job ${jobState.address}:`, jobState);
        } catch (error) {
            console.error(`Error processing job ${jobState.address}:`, error);
        }
    }
}

// Run the main function
main();
