import { getActiveJobs, initializeJobStates, jobStates, JobState } from './job_manager';
import { processNewBlocks } from './block_processor';
import { sendDiscordAlert } from './alerting';

test('getActiveJobs should be a function', () => {
  expect(typeof getActiveJobs).toBe('function');
});

test('initializeJobStates should initialize job states correctly', async () => {
  const jobs = ['0x123', '0x456'];
  await initializeJobStates(jobs);
  expect(jobStates.size).toBe(jobs.length);
  jobs.forEach(job => {
    expect(jobStates.has(job)).toBe(true);
  });
});

test('processNewBlocks should update job states', async () => {
  const jobs = ['0x123', '0x456'];
  await initializeJobStates(jobs);
  await processNewBlocks(BigInt(0), 5, 15000); // Added parameters for processNewBlocks
  jobStates.forEach((state: JobState) => {
    expect(state.lastCheckedBlock).toBeGreaterThan(0);
  });
});

test('sendDiscordAlert should be a function', () => {
  expect(typeof sendDiscordAlert).toBe('function');
});
