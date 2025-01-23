import fetch from 'node-fetch';
import { DISCORD_WEBHOOK_URL } from './config';
import { logWithTimestamp } from './utils';

export async function sendDiscordAlert(
    jobAddress: string,
    unworkedBlocks: bigint,
    currentBlock: bigint,
    argsString: string | null
): Promise<void> {
    const webhookUrl = DISCORD_WEBHOOK_URL;

    if (webhookUrl.trim().toUpperCase() === 'LOCAL') {
        logWithTimestamp(`[Discord Alert - LOCAL MODE] Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks.toString()} blocks (current block: ${currentBlock.toString()}). Reason: ${argsString}`);
        return;
    }

    const message = {
        content: `🚨 Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks.toString()} blocks (current block: ${currentBlock.toString()}). Reason: ${argsString}`
    };

    logWithTimestamp(`Discord Webhook URL: ${webhookUrl}`);

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        const responseBody = await response.text();

        if (!response.ok) {
            throw new Error(`Failed to send Discord alert. Status: ${response.status}, Body: ${responseBody}`);
        }

        logWithTimestamp(`Alert sent to Discord for job ${jobAddress}.`);
    } catch (error) {
        console.error("Error sending Discord alert:", error);
        throw error;
    }
}
