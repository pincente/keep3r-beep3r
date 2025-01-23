import { getActiveJobs, initializeJobStates, jobStates, JobState, checkIfJobWasWorked } from './job_manager';
import { sequencerContract, multicallProvider } from './ethereum';
import { ethers } from 'ethers';
import { Mock } from 'jest-mock'; // Import Mock type

// Mock sequencerContract and provider for testing
jest.mock('./ethereum', () => ({
    sequencerContract: {
        numJobs: jest.fn() as Mock<any, any>, // Explicitly cast to Mock
        jobAt: jest.fn() as Mock<any, any>,   // Explicitly cast to Mock
        getMaster: jest.fn() as Mock<any, any> // Mock getMaster as it's used in initializeJobStates - Explicitly cast to Mock
    },
    multicallProvider: {
        provider: {
            getLogs: jest.fn()
        },
        getBlockNumber: jest.fn() // Mock getBlockNumber for multicallProvider
    }
}));

describe('job_manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jobStates.clear(); // Clear jobStates before each test
    });

    test('getActiveJobs should return an array of job addresses', async () => {
        (sequencerContract.numJobs as Mock<any, any>).mockResolvedValue(BigInt(2)); // Explicitly cast to Mock
        (sequencerContract.jobAt as Mock<any, any>).mockResolvedValueOnce('0xJobAddress1'); // Explicitly cast to Mock
        (sequencerContract.jobAt as Mock<any, any>).mockResolvedValueOnce('0xJobAddress2'); // Explicitly cast to Mock

        const jobs = await getActiveJobs();
        expect(jobs).toEqual(['0xJobAddress1', '0xJobAddress2']);
        expect(sequencerContract.numJobs).toHaveBeenCalledTimes(1);
        expect(sequencerContract.jobAt).toHaveBeenCalledTimes(2);
    });

    test('getActiveJobs should handle errors when fetching jobs', async () => {
        (sequencerContract.numJobs as Mock<any, any>).mockRejectedValue(new Error('RPC Error')); // Explicitly cast to Mock

        await expect(getActiveJobs()).rejects.toThrow('Error fetching active jobs');
    });

    test('initializeJobStates should initialize job states correctly', async () => {
        const jobs = ['0x123', '0x456'];
        (multicallProvider.getBlockNumber as jest.Mock).mockResolvedValue(21684850); // Mock getBlockNumber
        (sequencerContract.getMaster as Mock<any, any>).mockResolvedValue('0xNetworkIdentifier'); // Mock getMaster - Explicitly cast to Mock

        await initializeJobStates(jobs);
        expect(jobStates.size).toBe(jobs.length);
        jobs.forEach(job => {
            expect(jobStates.has(job)).toBe(true);
        });
    });

    describe('checkIfJobWasWorked', () => {
        it('should return true if Work events are found', async () => {
            (multicallProvider.provider.getLogs as jest.Mock).mockResolvedValueOnce(['event1', 'event2']); // Mock with some events
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = { getLogs: multicallProvider.provider.getLogs } as any; // Type assertion for mock

            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(true);
            expect(multicallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });

        it('should return false if no Work events are found', async () => {
            (multicallProvider.provider.getLogs as jest.Mock).mockResolvedValueOnce([]); // Mock with no events
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = { getLogs: multicallProvider.provider.getLogs } as any; // Type assertion for mock


            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(false);
            expect(multicallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });

        it('should handle errors when fetching Work events', async () => {
            (multicallProvider.provider.getLogs as jest.Mock).mockRejectedValueOnce(new Error('RPC Error'));
            const jobAddress = '0xJobAddress';
            const fromBlock = BigInt(100);
            const toBlock = BigInt(200);
            const providerMock = { getLogs: multicallProvider.provider.getLogs } as any; // Type assertion for mock


            const wasWorked = await checkIfJobWasWorked(jobAddress, fromBlock, toBlock, providerMock);
            expect(wasWorked).toBe(false); // Should return false on error
            expect(multicallProvider.provider.getLogs).toHaveBeenCalledTimes(1);
        });
    });
});
