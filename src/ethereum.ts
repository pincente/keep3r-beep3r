import { ethers, getDefaultProvider } from 'ethers';
import sequencerAbi from './abis/sequencerAbi.json';
import jobAbi from './abis/IJobAbi.json';
import { ETHEREUM_RPC_URL } from './config';

// Import MulticallWrapper using require
const multicallProviderLib = require('ethers-multicall-provider');
const MulticallWrapper = multicallProviderLib.MulticallWrapper; // Use MulticallWrapper

const provider = getDefaultProvider(ETHEREUM_RPC_URL);
export const multicallProvider = MulticallWrapper.wrap(provider);
export const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';
export const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, sequencerAbi, multicallProvider);
export const jobInterface = new ethers.Interface(jobAbi);
