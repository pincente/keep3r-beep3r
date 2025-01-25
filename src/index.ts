import { logWithTimestamp } from './utils';
import { main } from './app'; // Import the main function from app.ts

console.log("Starting index.ts - before main() call"); // ADDED: Very early log

process.on('SIGTERM', () => {
    logWithTimestamp('Received SIGTERM. Cleaning up...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logWithTimestamp('Received SIGINT. Cleaning up...');
    process.exit(0);
});

main().catch(error => {
    logWithTimestamp(`[Unhandled Error] Main function threw an error: ${error.message}`);
    console.error(error);
    process.exit(1);
});

console.log("Finished index.ts - after main() call (this should not be logged in normal operation)"); // ADDED: Log after main call
