# Keep3r Beep3r

## Project Overview

Keep3r Beep3r is a NodeJS application that monitors MakerDAO's automated jobs and sends Discord alerts if a job hasn't been worked for a certain number of consecutive blocks. The application is packaged in a Docker container for easy deployment.

By default, alerts are suppressed for jobs that are not workable due to the following reasons (as indicated by the `workable()` function): "No ilks ready", "Flap not possible", "No distribution", and "No work to do", and "shouldUpdate is false".  This is because these reasons often represent normal waiting states for the jobs. Alerts are still triggered for other reasons or when no specific reason is provided by the `workable()` function.

**Alert Suppression Feature Details:**

The application implements an alert suppression feature to reduce noise from expected job states.  When a job is found to be unworkable, the `workable()` function often returns a reason as a text string in the `args` field. The `keep3r-beep3r` application checks these reason strings against a predefined list of ignored messages. If the reason matches an ignored message, a Discord alert is suppressed.

**Customizing Ignored Alert Reasons:**

You can customize the list of ignored reasons by modifying the `IGNORED_ARGS_MESSAGES` array in `src/index.ts`.  To add or remove reasons, simply edit the array:

```typescript
// Define args messages to ignore for alerts
const IGNORED_ARGS_MESSAGES = [
    "No ilks ready",
    "Flap not possible",
    "No distribution",
    "No work to do",
    "shouldUpdate is false"
];
```

Add or remove strings from this array to tailor the alert suppression behavior to your specific monitoring needs.  Ensure that each string in the array exactly matches the reason string returned by the `workable()` function of the jobs you are monitoring.

## Prerequisites

- Node.js (version 16 or later)
- Docker
- An Ethereum RPC URL
- A Discord webhook URL

## Setup Instructions

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd keep3r-beep3r
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   Create a `.env` file in the root directory with the following content:

   ```
   ETHEREUM_RPC_URL=YOUR_ETHEREUM_RPC_URL
   DISCORD_WEBHOOK_URL=YOUR_DISCORD_WEBHOOK_URL
   UNWORKED_BLOCKS_THRESHOLD=1000 # Number of blocks a job can be unworked before an alert is sent (default: 1000)
   BLOCK_CHECK_INTERVAL=15000    # Interval in milliseconds to check for new blocks (default: 15000)
   BLOCK_BATCH_INTERVAL=5       # Interval in minutes to batch process blocks (default: 5 minutes)
   MAX_JOB_AGE=86400000         # Maximum age in milliseconds for a job to be considered active (default: 24 hours)
   ```

   Replace placeholders with actual values. You can adjust `UNWORKED_BLOCKS_THRESHOLD`, `BLOCK_CHECK_INTERVAL`, `BLOCK_BATCH_INTERVAL`, and `MAX_JOB_AGE` as needed.

   **Environment Variable Details:**

   *   `ETHEREUM_RPC_URL`:  Your Ethereum RPC endpoint URL.  This is necessary to connect to the Ethereum network and interact with smart contracts.
   *   `DISCORD_WEBHOOK_URL`: The Discord webhook URL where alerts will be sent.  If set to `LOCAL`, alerts will be logged to the console instead of sending to Discord (useful for local testing).
   *   `UNWORKED_BLOCKS_THRESHOLD`:  The number of consecutive blocks a job can remain unworked before an alert is triggered.  The default is 1000 blocks.  You may want to lower this value for testing or for more frequent alerts.
   *   `BLOCK_CHECK_INTERVAL`:  The interval in milliseconds at which the application checks for new blocks on the Ethereum network. The default is 15000 milliseconds (15 seconds).
   *   `BLOCK_BATCH_INTERVAL`: The interval in minutes at which blocks are processed in batches.  The default is 5 minutes.  This controls how frequently the application processes blocks and checks for job status updates.
   *   `MAX_JOB_AGE`: The maximum age in milliseconds for a job to be considered active and monitored. Jobs that haven't been updated within this timeframe are considered inactive and are removed from monitoring. The default is 24 hours (86400000 milliseconds).

## Building the Application

1. **Build the TypeScript code:**

   ```bash
   npm run build
   ```

2. **Build the Docker image:**

   ```bash
   docker build -t keep3r-beep3r .
   ```

## Running the Application

1. **Running locally:**

   ```bash
   npm start
   ```

2. **Running with Docker:**

   ```bash
   docker run --rm --env-file .env keep3r-beep3r
   ```

## Testing

Run tests using:

```bash
npm test
```

## Additional Information

- Ensure your Ethereum RPC URL and Discord webhook URL are correctly configured.
- The `UNWORKED_BLOCKS_THRESHOLD` in the `.env` file determines how many blocks a job can remain unworked before an alert is triggered. The default is 1000 blocks, but you can adjust this value. For testing purposes, you may want to lower this threshold.
- The `BLOCK_BATCH_INTERVAL` in the `.env` file determines the interval in minutes at which blocks are processed in batches. The default is 5 minutes. Adjust this value to control the frequency of block processing and alerts.
- The application now includes alert suppression for common "not workable" reasons. See the "Alert Suppression Feature Details" section in this README and the `IGNORED_ARGS_MESSAGES` array in `src/index.ts` for the list of suppressed reasons and how to customize it.
- For further improvements, consider implementing more comprehensive tests and integrating a more robust logging library for better observability.

Let me know if you would like me to proceed with these changes, or if you have any other modifications in mind!