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
            logWithTimestamp(`[Discord Alert] Failed to send alert for job ${jobAddress}. Status: ${response.status}, Body: ${responseBody}`); // Enhanced logging
            throw new Error(`Failed to send Discord alert. Status: ${response.status}, Body: ${responseBody}`);
        }

        logWithTimestamp(`Alert sent to Discord for job ${jobAddress}.`);
    } catch (error) {
        console.error(`[Discord Alert] Error sending Discord alert for job ${jobAddress}:`, error); // Enhanced logging with job address
        throw error;
    }
}

export async function sendDiscordInitializationMessage(): Promise<void> { // Added export keyword here
    const webhookUrl = DISCORD_WEBHOOK_URL;

    if (webhookUrl.trim().toUpperCase() === 'LOCAL') {
        logWithTimestamp(`[Discord Init - LOCAL MODE] Application started in local mode. Initialization message suppressed.`);
        return;
    }
    if (!webhookUrl) {
        logWithTimestamp("Discord webhook URL not configured, initialization message not sent.");
        return;
    }

    const message = {
        content: "🚀 keep3r-beep3r application started successfully."
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });
        if (!response.ok) {
            console.error(`Failed to send Discord initialization message. Status: ${response.status}`);
        } else {
            logWithTimestamp("Discord initialization message sent successfully.");
        }
    } catch (error) {
        console.error("Error sending Discord initialization message:", error);
    }
}
