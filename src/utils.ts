export function logWithTimestamp(message: string, level: string = 'info') {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
}
