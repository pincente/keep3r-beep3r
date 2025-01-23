import { sendDiscordAlert } from './alerting';

test('sendDiscordAlert should be a function', () => {
  expect(typeof sendDiscordAlert).toBe('function');
});
