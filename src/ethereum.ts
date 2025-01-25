import { ethers, getDefaultProvider } from 'ethers';
import sequencerAbi from './abis/sequencerAbi.json';
import jobAbi from './abis/IJobAbi.json';
import { ETHEREUM_RPC_URL } from './config';
import { logWithTimestamp } from './utils'; // Import logWithTimestamp

// Import MulticallWrapper using require
const multicallProviderLib = require('ethers-multicall-provider');
const MulticallWrapper = multicallProviderLib.MulticallWrapper; // Use MulticallWrapper
import { MulticallProvider } from 'ethers-multicall-provider'; // Import MulticallProvider type


let provider;
export let multicallProvider: MulticallProvider; // Export multicallProvider with type annotation

try {
    provider = getDefaultProvider(ETHEREUM_RPC_URL);
    multicallProvider = MulticallWrapper.wrap(provider) as MulticallProvider; // Type assertion here as well
    logWithTimestamp("Successfully connected to Ethereum provider."); // Log successful connection
    // Initialize contracts after multicallProvider is ready
    initializeContracts();
} catch (error) {
    logWithTimestamp(`Error connecting to Ethereum provider: ${error}`); // Log connection error
    console.error("Fatal error connecting to Ethereum provider:", error);
    process.exit(1); // Exit if provider connection fails
    logWithTimestamp('Contracts initialized successfully.');
}


export const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';
let sequencerContract: ethers.Contract;
let jobInterface: ethers.Interface;

export function initializeContracts() {
    logWithTimestamp(`Initializing contracts...`);

    logWithTimestamp(`SEQUENCER_ADDRESS: ${SEQUENCER_ADDRESS}`);
    if (!SEQUENCER_ADDRESS) {
        throw new Error('SEQUENCER_ADDRESS is undefined');
    }

    logWithTimestamp(`sequencerAbi: ${JSON.stringify(sequencerAbi)}`);
    if (!sequencerAbi) {
        throw new Error('sequencerAbi is undefined');
    }

    logWithTimestamp(`multicallProvider is ${multicallProvider ? 'initialized' : 'not initialized'}`);
    if (!multicallProvider) {
        throw new Error('multicallProvider is undefined');
    }

    // Now initialize the contracts
    jobInterface = new ethers.Interface(jobAbi);
}

export { sequencerContract, jobInterface };
