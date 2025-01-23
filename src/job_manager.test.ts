import { getActiveJobs, initializeJobStates, jobStates, JobState, checkIfJobWasWorked } from './job_manager';
import { sequencerContract, multicallProvider } from './ethereum';
import { ethers } from 'ethers';


// Helper function to create mock contract methods
const createMockContractMethod = (mockImplementation: (...args: any[]) => any, methodName: string) => {
    const mockFn = jest.fn().mockImplementation(mockImplementation) as jest.Mock & { fragment: any };
    mockFn.fragment = { name: methodName }; // Minimal fragment
    return mockFn;
};


// Mock sequencerContract and provider for testing
jest.mock('./ethereum', () => {
    return {
        sequencerContract: {
            numJobs: createMockContractMethod(() => Promise.resolve(BigInt(2)), 'numJobs'),
            jobAt: createMockContractMethod(() => Promise.resolve('0xJobAddress1'), 'jobAt'),
            getMaster: createMockContractMethod(() => Promise.resolve('0xNetworkIdentifier'), 'getMaster')
        },
        multicallProvider: {
            provider: {
                getLogs: createMockContractMethod(() => Promise.resolve([]), 'getLogs')
            },
            getBlockNumber: createMockContractMethod(() => Promise.resolve(21684850), 'getBlockNumber')
        }
    };
});

describe('job_manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jobStates.clear(); // Clear jobStates before each test
    });

    test('getActiveJobs should return an array of job addresses', async () => {
        (sequencerContract.numJobs as jest.Mock).mockResolvedValue(BigInt(2));
        (sequencerContract.jobAt as jest.Mock).mockResolvedValueOnce('0xJobAddress1');
        (sequencerContract.jobAt as jest.Mock).mockResolvedValueOnce('0xJobAddress2');

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
