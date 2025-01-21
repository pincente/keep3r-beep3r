import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import sequencerAbi from './abis/sequencerAbi.json';

// Load environment variables from .env file
dotenv.config();

// Define the Sequencer contract address
const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';
import * as dotenv from 'dotenv';

const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, sequencerAbi, provider);

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
    } catch (error) {
        console.error("Error connecting to Ethereum network:", error);
    }
}

// Run the main function
main();
