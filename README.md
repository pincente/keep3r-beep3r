# Keep3r Beep3r

## Project Overview

Keep3r Beep3r is a NodeJS application that monitors MakerDAO's automated jobs and sends Discord alerts if any job hasn't been worked for the past 1000 consecutive blocks. The application is packaged in a Docker container for easy deployment.

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
   ```

   Replace placeholders with actual values.

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
   docker run -d -e ETHEREUM_RPC_URL="..." -e DISCORD_WEBHOOK_URL="..." keep3r-beep3r
   ```

## Testing

Run tests using:

```bash
npm test
```

## Additional Information

- Ensure your Ethereum RPC URL and Discord webhook URL are correctly configured.
- For further improvements, consider implementing Multicall for efficiency and integrating a logging library for better observability.
# Keep3r Beep3r

## Overview

Keep3r Beep3r is a long-running NodeJS process using TypeScript and Docker that monitors MakerDAO's automated jobs. It sends Discord alerts if any job hasn't been worked for the past 1000 consecutive blocks.

## Prerequisites

- Node.js (version 16 or later)
- Docker (for containerization)
- An Ethereum RPC URL
- A Discord webhook URL

## Setup

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

   ```plaintext
   ETHEREUM_RPC_URL=YOUR_ETHEREUM_RPC_URL
   DISCORD_WEBHOOK_URL=YOUR_DISCORD_WEBHOOK_URL
   ```

   Replace `YOUR_ETHEREUM_RPC_URL` and `YOUR_DISCORD_WEBHOOK_URL` with your actual URLs.

4. **Build the application:**

   ```bash
   npm run build
   ```

5. **Run the application:**

   ```bash
   npm start
   ```

## Docker

1. **Build the Docker image:**

   ```bash
   docker build -t keep3r-beep3r .
   ```

2. **Run the Docker container:**

   ```bash
   docker run -d -e ETHEREUM_RPC_URL="YOUR_ETHEREUM_RPC_URL" -e DISCORD_WEBHOOK_URL="YOUR_DISCORD_WEBHOOK_URL" keep3r-beep3r
   ```

## Testing

Run the tests using Jest:

```bash
npm test
```

## License

This project is licensed under the ISC License.
