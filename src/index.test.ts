import { getActiveJobs, initializeJobStates, processNewBlock, sendDiscordAlert } from './index';

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

test('processNewBlock should update job states', async () => {
  const jobs = ['0x123', '0x456'];
  await initializeJobStates(jobs);
  await processNewBlock();
  jobStates.forEach(state => {
    expect(state.lastCheckedBlock).toBeGreaterThan(0);
  });
});

test('sendDiscordAlert should be a function', () => {
  expect(typeof sendDiscordAlert).toBe('function');
});
