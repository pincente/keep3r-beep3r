import { ethers, getDefaultProvider } from 'ethers';
import sequencerAbi from './abis/sequencerAbi.json';
import jobAbi from './abis/IJobAbi.json';
import { ETHEREUM_RPC_URL } from './config';
import { logWithTimestamp } from './utils'; // Import logWithTimestamp

// Import MulticallWrapper using require
const multicallProviderLib = require('ethers-multicall-provider');
const MulticallWrapper = multicallProviderLib.MulticallWrapper; // Use MulticallWrapper

let provider;
let multicallProvider;

try {
    provider = getDefaultProvider(ETHEREUM_RPC_URL);
    multicallProvider = MulticallWrapper.wrap(provider);
    logWithTimestamp("Successfully connected to Ethereum provider."); // Log successful connection
} catch (error) {
    logWithTimestamp(`Error connecting to Ethereum provider: ${error}`); // Log connection error
    console.error("Fatal error connecting to Ethereum provider:", error);
    process.exit(1); // Exit if provider connection fails
}


export const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';
export const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, sequencerAbi, multicallProvider);
export const jobInterface = new ethers.Interface(jobAbi);
