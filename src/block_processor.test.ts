import { processNewBlocks, processBlockNumber } from './block_processor';

import { initializeJobStates, jobStates, JobState, checkIfJobWasWorked, jobContracts } from './job_manager';
import { sequencerContract, multicallProvider, jobInterface } from './ethereum';
import { sendDiscordAlert } from './alerting';
import { ETHEREUM_RPC_URL, DISCORD_WEBHOOK_URL, BLOCK_CHECK_INTERVAL, BLOCK_BATCH_INTERVAL_MINUTES, UNWORKED_BLOCKS_THRESHOLD, MAX_JOB_AGE, IGNORED_ARGS_MESSAGES } from './config';
import { ethers } from 'ethers';
import * as jobManager from './job_manager';

interface MockJobContract {
  workable: jest.MockedFunction<() => Promise<[boolean, string]>>;
  // Add other methods if needed
}



// Mock modules and functions
jest.mock('./ethereum', () => ({
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
}));
jest.mock('./job_manager', () => {
    const originalModule = jest.requireActual('./job_manager');
    return {
        ...originalModule,
        jobContracts: new Map(),
        checkIfJobWasWorked: jest.fn().mockResolvedValue(false),
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

    beforeEach(async () => {
        jest.clearAllMocks();
        jobStates.clear();
        jobContracts.clear();

        // Initialize job states before each test
        await initializeJobStates(jobs);
        for (const jobAddress of jobs) {
            const mockContract: MockJobContract = {
                workable: jest.fn().mockResolvedValue([false, '0x']),
            } as unknown as ethers.Contract;
            jobContracts.set(jobAddress, mockContract);
        }
        // Mock getMaster, getBlockNumber already in module mock
    });


    describe('processBlockNumber', () => {
        it('should call workable for each job and update job state when workable is false and job was not worked', async () => {
            jobContracts.get(jobs[0])!.workable.mockResolvedValue([false, '0x']); // workable returns false for job1
            jobContracts.get(jobs[1])!.workable.mockResolvedValue([true, '0x']);  // workable returns true for job2
            const checkIfJobWasWorkedMock = jobManager.checkIfJobWasWorked as jest.Mock;
            checkIfJobWasWorkedMock.mockResolvedValue(false); // No Work event

            await processBlockNumber(BigInt(21684851));

            expect(jobContracts.get(jobs[0])!.workable).toHaveBeenCalledTimes(1);
            expect(jobContracts.get(jobs[1])!.workable).toHaveBeenCalledTimes(1);

            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(BigInt(1001)); // Incremented for job1
            expect(jobStates.get(jobs[1])!.consecutiveUnworkedBlocks).toBe(BigInt(1));     // Incremented for job2
            expect(jobStates.get(jobs[0])!.lastCheckedBlock).toEqual(BigInt(21684851));
            expect(jobStates.get(jobs[1])!.lastCheckedBlock).toEqual(BigInt(21684851));
        });


        it('should call sendDiscordAlert when consecutiveUnworkedBlocks exceeds threshold and reason is not ignored', async () => {
            jobStates.get(jobs[0])!.consecutiveUnworkedBlocks = UNWORKED_BLOCKS_THRESHOLD; // Set consecutiveUnworkedBlocks to threshold
            jobContracts.get(jobs[0])!.workable.mockResolvedValue([false, ethers.toUtf8Bytes('SomeReason')]); // workable returns false with reason
            checkIfJobWasWorked.mockResolvedValue(false);

            await processBlockNumber(BigInt(21684852));

            expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
            expect(sendDiscordAlert).toHaveBeenCalledWith(jobs[0], UNWORKED_BLOCKS_THRESHOLD + BigInt(1), BigInt(21684852), 'SomeReason');
            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(BigInt(0)); // Reset after alert
        });

        it('should suppress Discord alert when reason is in IGNORED_ARGS_MESSAGES', async () => {
            jobStates.get(jobs[0])!.consecutiveUnworkedBlocks = UNWORKED_BLOCKS_THRESHOLD;
            jobContracts.get(jobs[0])!.workable.mockResolvedValue([false, ethers.toUtf8Bytes('No ilks ready')]); // Reason is ignored
            checkIfJobWasWorked.mockResolvedValue(false);

            await processBlockNumber(BigInt(21684853));

            expect(sendDiscordAlert).not.toHaveBeenCalled(); // Alert should be suppressed
            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(UNWORKED_BLOCKS_THRESHOLD + BigInt(1)); // Counter still increments
        });

        it('should reset consecutiveUnworkedBlocks to 0 if job was worked', async () => {
            jobContracts.get(jobs[0])!.workable.mockResolvedValue([false, '0x']); // Not workable
            checkIfJobWasWorked.mockResolvedValue(true); // Job was worked

            await processBlockNumber(BigInt(21684854));

            expect(jobStates.get(jobs[0])!.consecutiveUnworkedBlocks).toBe(BigInt(0)); // Reset to 0
            expect(jobStates.get(jobs[0])!.lastWorkedBlock).toEqual(BigInt(21684854)); // lastWorkedBlock updated
        });

        it('should handle non-utf8 args gracefully', async () => {
            jobContracts.get(jobs[0])!.workable.mockResolvedValue([false, ethers.getBytes(Uint8Array.from([0x80]))]); // Invalid UTF-8 byte
            checkIfJobWasWorked.mockResolvedValue(false);
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
            (multicallProvider.provider.getBlockNumber as jest.Mock).mockResolvedValue(21684860); // Mock later block number

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
