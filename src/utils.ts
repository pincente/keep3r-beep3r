export function logWithTimestamp(message: string, level: string = 'info') {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
