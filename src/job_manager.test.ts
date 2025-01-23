import { getActiveJobs, initializeJobStates, jobStates, JobState } from './job_manager';

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
