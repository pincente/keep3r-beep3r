import fetch from 'node-fetch';
import { DISCORD_WEBHOOK_URL } from './config';
import { logWithTimestamp } from './utils';

// Interface for different message types
interface DiscordMessage {
    content: string;
    embeds?: Array<{
        title?: string;
        description?: string;
        color?: number;
        fields?: Array<{
            name: string;
            value: string;
            inline?: boolean;
        }>;
    }>;
}

async function sendDiscordMessage(message: DiscordMessage): Promise<void> {
    const webhookUrl = DISCORD_WEBHOOK_URL;

    if (webhookUrl.trim().toUpperCase() === 'LOCAL') {
        logWithTimestamp(`[Discord - LOCAL MODE] ${message.content}`);
        return;
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        const responseBody = await response.text();

        if (!response.ok) {
            logWithTimestamp(`[Discord] Failed to send message. Status: ${response.status}, Body: ${responseBody}`);
            throw new Error(`Failed to send Discord message. Status: ${response.status}, Body: ${responseBody}`);
        }

        logWithTimestamp(`[Discord] Message sent successfully.`);
    } catch (error) {
        console.error(`[Discord] Error sending message:`, error);
        throw error;
    }
}

export async function sendDiscordAlert(
    jobAddress: string,
    unworkedBlocks: bigint,
    currentBlock: bigint,
    argsString: string | null
): Promise<void> {
    // Don't send regular job alerts for system messages
    if (jobAddress === 'SYSTEM') {
        return;
    }

    const message: DiscordMessage = {
        content: '',  // Add empty content to satisfy interface
        embeds: [{
            title: '🚨 Job Alert',
            color: 0xFF0000, // Red
            fields: [
                {
                    name: 'Job Address',
                    value: jobAddress,
                    inline: true
                },
                {
                    name: 'Unworked Blocks',
                    value: unworkedBlocks.toString(),
                    inline: true
                },
                {
                    name: 'Current Block',
                    value: currentBlock.toString(),
                    inline: true
                }
            ]
        }]
    };

    if (argsString) {
        message.embeds![0].fields!.push({
            name: 'Reason',
            value: argsString
        });
    }

    await sendDiscordMessage(message);
}

export async function sendDiscordSystemMessage(content: string, isError: boolean = false): Promise<void> {
    const message: DiscordMessage = {
        content: '',  // Add empty content to satisfy interface
        embeds: [{
            description: content,
            color: isError ? 0xFF0000 : 0x00FF00 // Red for errors, Green for success
        }]
    };

    await sendDiscordMessage(message);
}

export async function sendDiscordInitializationMessage(): Promise<void> {
    await sendDiscordSystemMessage('🚀 keep3r-beep3r monitoring system starting up...');
}
