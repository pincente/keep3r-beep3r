import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

import sequencerAbi from './abis/sequencerAbi.json';
import jobAbi from './abis/IJobAbi.json';
import fetch from 'node-fetch'; // Make sure to import fetch

// Load environment variables from .env file
dotenv.config();

// Retrieve the Ethereum RPC URL from environment variables
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL;

if (!ETHEREUM_RPC_URL) {
  throw new Error("Missing ETHEREUM_RPC_URL in environment variables.");
}

// Create the Ethereum provider
const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);

// Define the Sequencer contract address
const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';

const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, sequencerAbi, provider);

interface JobState {
    address: string;
    lastWorkedBlock: number;
    consecutiveUnworkedBlocks: number;
}

// Define the sendDiscordAlert function
async function sendDiscordAlert(jobAddress: string, unworkedBlocks: number, currentBlock: number): Promise<void> {
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

const jobStates: Map<string, JobState> = new Map();

async function initializeJobStates(jobs: string[]): Promise<void> {
    const currentBlock = await provider.getBlockNumber();
    for (const jobAddress of jobs) {
        jobStates.set(jobAddress, {
            address: jobAddress,
            lastWorkedBlock: currentBlock,
            consecutiveUnworkedBlocks: 0,
        });
    }
}

// Function to fetch active jobs
async function getActiveJobs(): Promise<string[]> {
    const numJobs = await sequencerContract.numJobs();
    const jobs: string[] = [];

    for (let i = 0; i < numJobs.toNumber(); i++) {
        const jobAddress = await sequencerContract.jobAt(i);
        jobs.push(jobAddress);
    }

    return jobs;
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

async function checkIfJobWasWorked(jobAddress: string, fromBlock: number, toBlock: number): Promise<boolean> {
    try {
        const jobContract = new ethers.Contract(jobAddress, jobAbi, provider);

        // Get the transaction filter for the 'work' function
        const workFunctionFragment = jobContract.interface.getFunction('work');
        const workFunctionSignature = jobContract.interface.getSighash(workFunctionFragment);

        // Create a filter for transactions to the job address calling 'work'
        const filter = {
            fromBlock: fromBlock + 1, // Exclude 'fromBlock' to prevent double counting
            toBlock: toBlock,
            to: jobAddress,
            topics: [workFunctionSignature],
        };

        // Query the blockchain for matching transactions
        const logs = await provider.getLogs(filter);

        return logs.length > 0;
    } catch (error) {
        console.error(`Error checking if job ${jobAddress} was worked:`, error);
        return false;
    }
}

async function processNewBlock(): Promise<void> {
    const currentBlock = await provider.getBlockNumber();
    console.log(`Processing block ${currentBlock}`);

    for (const jobState of jobStates.values()) {
        // Placeholder for actual logic to check if the job was worked
        const jobWasWorked = await checkIfJobWasWorked(jobState.address, jobState.lastWorkedBlock, currentBlock);

        if (jobWasWorked) {
            jobState.lastWorkedBlock = currentBlock;
            jobState.consecutiveUnworkedBlocks = 0;
        } else {
            jobState.consecutiveUnworkedBlocks += (currentBlock - jobState.lastWorkedBlock);
        }

        // Check if the job hasn't been worked for 1000 consecutive blocks
        if (jobState.consecutiveUnworkedBlocks >= 1000) {
            await sendDiscordAlert(jobState.address, jobState.consecutiveUnworkedBlocks, currentBlock);
            // Reset the counter or implement logic to avoid repeated alerts
            jobState.consecutiveUnworkedBlocks = 0;
        }

        // Log job state (optional)
        console.log(`Job ${jobState.address}:`, jobState);
    }
}

// Run the main function
main();