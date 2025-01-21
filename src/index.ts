import { ethers } from 'ethers';
import sequencerAbi from './abis/sequencerAbi.json';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Retrieve the Ethereum RPC URL from environment variables
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL;

if (!ETHEREUM_RPC_URL) {
    throw new Error("Missing ETHEREUM_RPC_URL in environment variables.");
}

// Create the Ethereum provider
const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);

async function main() {
    try {
        // Fetch network information
        const network = await provider.getNetwork();
        console.log(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);

        // Fetch the current block number
        const blockNumber = await provider.getBlockNumber();
        console.log(`Current block number: ${blockNumber}`);
    } catch (error) {
        console.error("Error connecting to Ethereum network:", error);
    }
}

// Run the main function
main();
