# Keep3r Beep3r

## Project Overview

Keep3r Beep3r is a NodeJS application that monitors MakerDAO's automated jobs and sends Discord alerts if a job hasn't been worked for a certain number of consecutive blocks. The application is packaged in a Docker container for easy deployment.

By default, alerts are suppressed for jobs that are not workable due to the following reasons (as indicated by the `workable()` function): "No ilks ready", "Flap not possible", "No distribution", and "No work to do".  This is because these reasons often represent normal waiting states for the jobs. Alerts are still triggered for other reasons or when no specific reason is provided by the `workable()` function.  You can customize the list of ignored reasons by modifying the `IGNORED_ARGS_MESSAGES` array in `src/index.ts`.

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
   MAX_JOB_AGE=86400000         # Maximum age in milliseconds for a job to be considered active (default: 24 hours)
   ```

   Replace placeholders with actual values. You can adjust `UNWORKED_BLOCKS_THRESHOLD`, `BLOCK_CHECK_INTERVAL`, and `MAX_JOB_AGE` as needed.

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
- The application now includes alert suppression for common "not workable" reasons. See the `IGNORED_ARGS_MESSAGES` array in `src/index.ts` for the list of suppressed reasons and how to customize it.
- For further improvements, consider implementing Multicall for efficiency and integrating a logging library for better observability.
