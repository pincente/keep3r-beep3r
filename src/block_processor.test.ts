import { processNewBlocks } from './block_processor';
import { initializeJobStates, jobStates, JobState } from './job_manager';

test('processNewBlocks should update job states', async () => {
  const jobs = ['0x123', '0x456'];
  await initializeJobStates(jobs);
  await processNewBlocks(BigInt(0), 5, 15000); // Added parameters for processNewBlocks
  jobStates.forEach((state: JobState) => {
    expect(state.lastCheckedBlock).toBeGreaterThan(0);
  });
});
