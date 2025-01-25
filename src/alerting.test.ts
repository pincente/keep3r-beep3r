import { sendDiscordAlert } from './alerting';
import fetch, { Response } from 'node-fetch';

jest.mock('node-fetch');

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('sendDiscordAlert', () => {
    const jobAddress = '0xJobAddress';
    const unworkedBlocks = BigInt(1000);
    const currentBlock = BigInt(2000);
    const argsString = 'Test reason';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should send a Discord alert successfully', async () => {
        const response = new Response('', { status: 200, statusText: 'OK' });
        mockedFetch.mockResolvedValue(response);

        await sendDiscordAlert(jobAddress, unworkedBlocks, currentBlock, argsString);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `🚨 Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks.toString()} blocks (current block: ${currentBlock.toString()}). Reason: ${argsString}`
            }),
        }));
    });

    it('should handle network errors gracefully', async () => {
        mockedFetch.mockRejectedValue(new Error('Network error'));

        await expect(sendDiscordAlert(jobAddress, unworkedBlocks, currentBlock, argsString)).rejects.toThrow('Network error');
    });

    it('should log a message when DISCORD_WEBHOOK_URL is set to LOCAL', async () => {
        process.env.DISCORD_WEBHOOK_URL = 'LOCAL';
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await sendDiscordAlert(jobAddress, unworkedBlocks, currentBlock, argsString);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Discord Alert - LOCAL MODE]'));
        consoleSpy.mockRestore();
    });
});
