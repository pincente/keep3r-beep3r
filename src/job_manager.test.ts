import { getActiveJobs, initializeJobStates, jobStates, JobState, checkIfJobWasWorked } from './job_manager';

import { sequencerContract } from './ethereum';

const sequencerContractMock = sequencerContract as jest.Mocked<typeof sequencerContract>;

import { multicallProvider } from './ethereum';

const multicallProviderMock = multicallProvider as jest.Mocked<typeof multicallProvider>;
import { ethers } from 'ethers';


// Mock sequencerContract and provider for testing
jest.mock('./ethereum', () => {
    const originalModule = jest.requireActual('./ethereum');
    return {
        ...originalModule,
        sequencerContract: {
            numJobs: jest.fn().mockResolvedValue(BigInt(2)),
            jobAt: jest.fn()
                .mockResolvedValueOnce('0xJobAddress1')
                .mockResolvedValueOnce('0xJobAddress2'),
            getMaster: jest.fn().mockResolvedValue('0xNetworkIdentifier'),
        },
        multicallProvider: {
            provider: {
                getBlockNumber: jest.fn().mockResolvedValue(21684850),
                getLogs: jest.fn().mockResolvedValue([]),
            },
            getBlockNumber: jest.fn().mockResolvedValue(21684850),
        },
    };
});

describe('job_manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jobStates.clear(); // Clear jobStates before each test
    });

    test('getActiveJobs should return an array of job addresses', async () => {
        (sequencerContract.numJobs as jest.Mock).mockResolvedValue(BigInt(2));
        (sequencerContract.jobAt as jest.Mock)
            .mockResolvedValueOnce('0xJobAddress1')
            .mockResolvedValueOnce('0xJobAddress2');

        const jobs = await getActiveJobs();
        expect(jobs).toEqual(['0xJobAddress1', '0xJobAddress2']);
        expect(sequencerContract.numJobs).toHaveBeenCalledTimes(1);
        expect(sequencerContract.jobAt).toHaveBeenCalledTimes(2);
    });

    test('getActiveJobs should handle errors when fetching jobs', async () => {
        (sequencerContract.numJobs as jest.Mock).mockRejectedValue(new Error('RPC Error'));

        await expect(getActiveJobs()).rejects.toThrow('Error fetching active jobs');
    });

    test('initializeJobStates should initialize job states correctly', async () => {
        const jobs = ['0x123', '0x456'];
        (multicallProvider.getBlockNumber as jest.Mock).mockResolvedValue(21684850); // Mock getBlockNumber
        (sequencerContract.getMaster as jest.Mock).mockResolvedValue('0xNetworkIdentifier'); // Mock getMaster

        await initializeJobStates(jobs);
        expect(jobStates.size).toBe(jobs.length);
        jobs.forEach(job => {
            expect(jobStates.has(job)).toBe(true);
        });
    });

    describe('checkIfJobWasWorked', () => {
        it('should return true if Work events are found', async () => {
            const mockLog = { blockNumber: 123 } as ethers.Log; // Minimal Log object
            jest.spyOn(multicallProvider.provider, 'getLogs').mockResolvedValueOnce([mockLog, mockLog]); // Mock with some events
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = multicallProvider.provider;

            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(true);
            expect(multicallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });

        it('should return false if no Work events are found', async () => {
            jest.spyOn(multicallProvider.provider, 'getLogs').mockResolvedValueOnce([]); // Mock with no events
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = multicallProvider.provider;


            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(false);
            expect(multicallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });

        it('should handle errors when fetching Work events', async () => {
            jest.spyOn(multicallProvider.provider, 'getLogs').mockRejectedValueOnce(new Error('RPC Error'));
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = multicallProvider.provider;


            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(false); // Should return false on error
            expect(multicallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });
    });
});
