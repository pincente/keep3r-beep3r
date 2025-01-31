import { processNewBlocks, processBlockNumber } from './block_processor';

import { initializeJobStates, jobStates, JobState, checkIfJobWasWorked, jobContracts } from './job_manager';
import { sequencerContract, multicallProvider, jobInterface } from './ethereum';
import { sendDiscordAlert } from './alerting';
import { ETHEREUM_RPC_URL, DISCORD_WEBHOOK_URL, BLOCK_CHECK_INTERVAL, BLOCK_BATCH_INTERVAL_MINUTES, UNWORKED_BLOCKS_THRESHOLD, MAX_JOB_AGE, IGNORED_ARGS_MESSAGES } from './config';
import { ethers } from 'ethers';
import * as jobManager from './job_manager';

type MockJobContract = jest.Mocked<ethers.Contract>;


// Mock modules and functions
jest.mock('./ethereum', () => {
    const originalModule = jest.requireActual('./ethereum');
    return {
        ...originalModule,
        sequencerContract: {
            getMaster: jest.fn().mockResolvedValue('0xNetworkIdentifier'),
        },
        multicallProvider: {
            getBlockNumber: jest.fn().mockResolvedValue(21684850),
            provider: {
                getBlockNumber: jest.fn().mockResolvedValue(21684850),
                getLogs: jest.fn().mockResolvedValue([]),
            },
        },
        jobInterface: {
            getEvent: jest.fn().mockReturnValue({ topicHash: '0xWorkEventTopicHash' }),
        },
    };
});
jest.mock('./job_manager', () => {
    const originalModule = jest.requireActual('./job_manager');
    return {
        ...originalModule,
        jobContracts: new Map(),
        checkIfJobWasWorked: jest.fn().mockResolvedValue(false), // Mock checkIfJobWasWorked here
        jobStates: new Map(),
    };
});
jest.mock('./alerting', () => ({
    sendDiscordAlert: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./config', () => ({
    UNWORKED_BLOCKS_THRESHOLD: BigInt(10), // Mock threshold
    IGNORED_ARGS_MESSAGES: ["No ilks ready", "shouldUpdate is false"] // Mock ignored messages
}));
jest.mock('./utils', () => ({
    logWithTimestamp: jest.fn() // mock logWithTimestamp
}));


describe('block_processor', () => {
    const jobs = ['0xJobAddress1', '0xJobAddress2'];
    let mockContract1: MockJobContract;
    let mockContract2: MockJobContract;
    let workableSpy1: jest.SpyInstance;
    let workableSpy2: jest.SpyInstance;
    let checkIfJobWasWorkedMock: jest.MockedFunction<typeof jobManager.checkIfJobWasWorked>;


    beforeEach(async () => {
        jest.clearAllMocks();
        jobStates.clear();
        jobContracts.clear();

        // Initialize job states before each test
        await initializeJobStates(jobs);

        mockContract1 = new ethers.Contract(jobs[0], [], multicallProvider) as MockJobContract;
        mockContract2 = new ethers.Contract(jobs[1], [], multicallProvider) as MockJobContract;
        jobContracts.set(jobs[0], mockContract1);
        jobContracts.set(jobs[1], mockContract2);

        workableSpy1 = jest.spyOn(mockContract1, 'workable');
        workableSpy2 = jest.spyOn(mockContract2, 'workable');
        workableSpy1.mockResolvedValue([false, '0x']); // default mock for job1
        workableSpy2.mockResolvedValue([true, '0x']);  // default mock for job2

        checkIfJobWasWorkedMock = jobManager.checkIfJobWasWorked as jest.MockedFunction<typeof jobManager.checkIfJobWasWorked>;
        checkIfJobWasWorkedMock.mockResolvedValue(false); // default mock for checkIfJobWasWorked

        // Mock getMaster, getBlockNumber already in module mock
    });


    describe('processBlockNumber', () => {
        it('should call workable for each job and update job state when workable is false and job was not worked', async () => {
            workableSpy1.mockResolvedValueOnce([false, '0x']); // workable returns false for job1
            workableSpy2.mockResolvedValueOnce([true, '0x']);  // workable returns true for job2
            checkIfJobWasWorkedMock.mockResolvedValueOnce(false); // No Work event

            await processBlockNumber(BigInt(21684851));

            expect(workableSpy1).toHaveBeenCalledTimes(1);
            expect(workableSpy2).toHaveBeenCalledTimes(1);

            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(BigInt(1001)); // Incremented for job1
            expect(jobStates.get(jobs[1])!.consecutiveUnworkedBlocks).toBe(BigInt(1));     // Incremented for job2
            expect(jobStates.get(jobs[0])!.lastCheckedBlock).toEqual(BigInt(21684851));
            expect(jobStates.get(jobs[1])!.lastCheckedBlock).toEqual(BigInt(21684851));
        });


        it('should call sendDiscordAlert when consecutiveUnworkedBlocks exceeds threshold and reason is not ignored', async () => {
            jobStates.get(jobs[0])!.consecutiveUnworkedBlocks = UNWORKED_BLOCKS_THRESHOLD; // Set consecutiveUnworkedBlocks to threshold
            workableSpy1.mockResolvedValueOnce([false, ethers.toUtf8Bytes('SomeReason')]); // workable returns false with reason
            checkIfJobWasWorkedMock.mockResolvedValueOnce(false);

            await processBlockNumber(BigInt(21684852));

            expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
            expect(sendDiscordAlert).toHaveBeenCalledWith(jobs[0], UNWORKED_BLOCKS_THRESHOLD + BigInt(1), BigInt(21684852), 'SomeReason');
            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(BigInt(0)); // Reset after alert
        });

        it('should suppress Discord alert when reason is in IGNORED_ARGS_MESSAGES', async () => {
            jobStates.get(jobs[0])!.consecutiveUnworkedBlocks = UNWORKED_BLOCKS_THRESHOLD;
            workableSpy1.mockResolvedValueOnce([false, ethers.toUtf8Bytes('No ilks ready')]); // Reason is ignored
            checkIfJobWasWorkedMock.mockResolvedValueOnce(false);

            await processBlockNumber(BigInt(21684853));

            expect(sendDiscordAlert).not.toHaveBeenCalled(); // Alert should be suppressed
            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(UNWORKED_BLOCKS_THRESHOLD + BigInt(1)); // Counter still increments
        });

        it('should reset consecutiveUnworkedBlocks to 0 if job was worked', async () => {
            workableSpy1.mockResolvedValueOnce([false, '0x']); // Not workable
            checkIfJobWasWorkedMock.mockResolvedValueOnce(true); // Job was worked

            await processBlockNumber(BigInt(21684854));

            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(BigInt(0)); // Reset to 0
            expect(jobStates.get(jobs[0])!.lastWorkedBlock).toEqual(BigInt(21684854)); // lastWorkedBlock updated
        });

        it('should handle non-utf8 args gracefully', async () => {
            workableSpy1.mockResolvedValueOnce([false, ethers.getBytes(Uint8Array.from([0x80]))]); // Invalid UTF-8 byte
            checkIfJobWasWorkedMock.mockResolvedValueOnce(false);
            jobStates.get(jobs[0])!.consecutiveUnworkedBlocks = UNWORKED_BLOCKS_THRESHOLD;


            await processBlockNumber(BigInt(21684855));

            expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
            const alertArgs = (sendDiscordAlert as jest.Mock).mock.calls[0];
            expect(alertArgs[3]).toContain('Non-UTF8 args:'); // Alert sent with non-UTF8 message
            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(BigInt(0)); // Reset after alert
        });
    });

    describe('processNewBlocks', () => {
        it('should process blocks in batches and update lastProcessedBlock', async () => {
            jest.spyOn(multicallProvider.provider, 'getBlockNumber').mockResolvedValue(21684860); // Mock later block number

            let lastBlock = BigInt(21684850); // Initial lastProcessedBlock

            const result = await processNewBlocks(lastBlock, 5, BLOCK_CHECK_INTERVAL); // 5 minute batch interval

            expect(multicallProvider.provider.getBlockNumber).toHaveBeenCalled();
            expect(result.lastProcessedBlock).toBeGreaterThan(lastBlock); // lastProcessedBlock should be updated
        });

        it('should not process blocks if already processing', async () => {
            let processingBlocks = false;
            const originalProcessingBlocksDescriptor = Object.getOwnPropertyDescriptor(global, 'processingBlocks');
            Object.defineProperty(global, 'processingBlocks', {
                value: processingBlocks,
                writable: true,
            });

            processingBlocks = true; // Simulate already processing

            const initialLastProcessedBlock = BigInt(21684850);
            const result = await processNewBlocks(initialLastProcessedBlock, 5, BLOCK_CHECK_INTERVAL);

            expect(multicallProvider.provider.getBlockNumber).not.toHaveBeenCalled(); // Should not process new blocks
            expect(result.lastProcessedBlock).toEqual(initialLastProcessedBlock); // lastProcessedBlock should not be updated

            // Restore original descriptor if it existed
            if (originalProcessingBlocksDescriptor) {
                Object.defineProperty(global, 'processingBlocks', originalProcessingBlocksDescriptor);
            } else {
                delete (global as any).processingBlocks;
            }
        });
    });
});
