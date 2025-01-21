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
    lastCheckedBlock: number;
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

// **Add the getActiveJobs function here**
export async function getActiveJobs(): Promise<string[]> {
    const numJobs = await sequencerContract.numJobs();
    const numJobsBN = ethers.BigNumber.from(numJobs);
    const jobs: string[] = [];

    for (let i = 0; i < numJobsBN.toNumber(); i++) {
        const jobAddress: string = await sequencerContract.jobAt(i);
        jobs.push(jobAddress);
    }

    return jobs;
}

async function getLastWorkedBlock(jobAddress: string, fromBlock: number, toBlock: number): Promise<number | null> {
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
            return null;
        }
    } catch (error) {
        console.error(`Error fetching Work events for job ${jobAddress}:`, error);
        return null;
    }
}

async function initializeJobStates(jobs: string[]): Promise<void> {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 1000 >= 0 ? currentBlock - 1000 : 0;

    for (const jobAddress of jobs) {
        const lastWorkedBlock = await getLastWorkedBlock(jobAddress, fromBlock, currentBlock);

        let consecutiveUnworkedBlocks = 0;

        if (lastWorkedBlock !== null) {
            // Job was worked in the last 1000 blocks
            consecutiveUnworkedBlocks = currentBlock - lastWorkedBlock;
        } else {
            // Job was not worked in the last 1000 blocks
            consecutiveUnworkedBlocks = 1000;
        }

        jobStates.set(jobAddress, {
            address: jobAddress,
            lastCheckedBlock: currentBlock,
            consecutiveUnworkedBlocks: consecutiveUnworkedBlocks,
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


async function processNewBlock(): Promise<void> {
    const currentBlock = await provider.getBlockNumber();
    console.log(`Processing block ${currentBlock}`);

    const networkIdentifier = ethers.constants.HashZero; // Use the appropriate network identifier

    for (const jobState of jobStates.values()) {
        try {
            const jobContract = new ethers.Contract(jobState.address, jobAbi, provider);
            const [canWork, args] = await jobContract.workable(networkIdentifier);

            let blocksSinceLastCheck = currentBlock - jobState.lastCheckedBlock;

            // Ensure we don't query more than 1000 blocks
            if (blocksSinceLastCheck > 1000) {
                blocksSinceLastCheck = 1000;
            }

            if (!canWork) {
                // Job does not need work, so it has been worked recently
                jobState.consecutiveUnworkedBlocks = 0;
            } else {
                // Job needs work, so increment unworked blocks
                jobState.consecutiveUnworkedBlocks += blocksSinceLastCheck;
            }

            jobState.lastCheckedBlock = currentBlock;

            // Check if the job hasn't been worked for 1000 consecutive blocks
            if (jobState.consecutiveUnworkedBlocks >= 1000) {
                await sendDiscordAlert(jobState.address, jobState.consecutiveUnworkedBlocks, currentBlock);
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
