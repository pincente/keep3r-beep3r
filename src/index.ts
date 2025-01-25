import { logWithTimestamp } from './utils';
import { main } from './app'; // Import the main function from app.ts

process.on('SIGTERM', () => {
    logWithTimestamp('Received SIGTERM. Cleaning up...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logWithTimestamp('Received SIGINT. Cleaning up...');
    process.exit(0);
});

main().catch((error) => { // Keep the catch here to handle top-level errors during startup
    console.error("Fatal error at startup:", error);
    process.exit(1);
});
