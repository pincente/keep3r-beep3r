import { getActiveJobs, initializeJobStates, jobStates, JobState, checkIfJobWasWorked } from './job_manager';
import { sequencerContract, multicallProvider } from './ethereum';
import { ethers } from 'ethers';

// Explicitly mock sequencerContract and multicallProvider
const mockedSequencerContract = {
    numJobs: jest.fn(),
    jobAt: jest.fn(),
    getMaster: jest.fn(),
} as any; // Use 'any' to avoid type errors during assignment

const mockedMulticallProvider = {
    provider: {
        getBlockNumber: jest.fn(),
        getLogs: jest.fn(),
    },
    getBlockNumber: jest.fn(),
} as any; // Use 'any' to avoid type errors during assignment


jest.mock('./ethereum', () => {
    return {
        sequencerContract: mockedSequencerContract,
        multicallProvider: mockedMulticallProvider,
    };
});

describe('job_manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jobStates.clear(); // Clear jobStates before each test
    });

    test('getActiveJobs should return an array of job addresses', async () => {
        mockedSequencerContract.numJobs.mockResolvedValue(BigInt(2));
        mockedSequencerContract.jobAt
            .mockResolvedValueOnce('0xJobAddress1')
            .mockResolvedValueOnce('0xJobAddress2');

        const jobs = await getActiveJobs();
        expect(jobs).toEqual(['0xJobAddress1', '0xJobAddress2']);
        expect(mockedSequencerContract.numJobs).toHaveBeenCalledTimes(1);
        expect(mockedSequencerContract.jobAt).toHaveBeenCalledTimes(2);
    });

    test('getActiveJobs should handle errors when fetching jobs', async () => {
        mockedSequencerContract.numJobs.mockRejectedValue(new Error('RPC Error'));

        await expect(getActiveJobs()).rejects.toThrow('Error fetching active jobs');
    });

    test('initializeJobStates should initialize job states correctly', async () => {
        const jobs = ['0x123', '0x456'];
        mockedMulticallProvider.getBlockNumber.mockResolvedValue(21684850); // Mock getBlockNumber
        mockedSequencerContract.getMaster.mockResolvedValue('0xNetworkIdentifier'); // Mock getMaster

        await initializeJobStates(jobs);
        expect(jobStates.size).toBe(jobs.length);
        jobs.forEach(job => {
            expect(jobStates.has(job)).toBe(true);
        });
    });

    describe('checkIfJobWasWorked', () => {
        it('should return true if Work events are found', async () => {
            const mockLog = { blockNumber: 123 } as ethers.Log; // Minimal Log object
            jest.spyOn(mockedMulticallProvider.provider, 'getLogs').mockResolvedValueOnce([mockLog, mockLog]); // Mock with some events
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = mockedMulticallProvider.provider;

            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(true);
            expect(mockedMulticallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });

        it('should return false if no Work events are found', async () => {
            jest.spyOn(mockedMulticallProvider.provider, 'getLogs').mockResolvedValueOnce([]); // Mock with no events
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = mockedMulticallProvider.provider;


            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(false);
            expect(mockedMulticallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });

        it('should handle errors when fetching Work events', async () => {
            jest.spyOn(mockedMulticallProvider.provider, 'getLogs').mockRejectedValueOnce(new Error('RPC Error'));
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = mockedMulticallProvider.provider;


            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(false); // Should return false on error
            expect(mockedMulticallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });
    });
});
