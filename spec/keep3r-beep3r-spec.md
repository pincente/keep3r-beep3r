# keep3r-beep3r Specification - Option 2: NodeJS Process with Docker for LLM Assistance

This specification is designed to guide an LLM coding assistant (like Aider) through the development of `keep3r-beep3r` in a step-by-step manner. Each step focuses on a specific functionality, allowing for incremental development and easier management of the codebase.

## Project Goal
Develop a long-running NodeJS process using TypeScript and Docker that monitors MakerDAO's automated jobs and sends Discord alerts if any job hasn't been worked for the past 1000 consecutive blocks.

## Core Requirements
- Monitor the MakerDAO Sequencer contract at `0x238b4E35dAed6100C6162fAE4510261f88996EC9`.
- Send Discord alerts via a webhook.
- Utilize the `numJobs()` and `jobAt()` methods of the Sequencer contract.
- Adhere to the principle of querying fewer than 1000 blocks at a time after the initial bootstrap.

---

## Step 1: Project Setup and Initial Dependencies

**Goal:** Set up the basic NodeJS project with TypeScript and install essential dependencies.

**Tasks:**
1. **Create a new NodeJS project:**
   ```bash
   npm init -y
   ```
2. **Initialize TypeScript:**
   ```bash
   npm install typescript --save-dev
   npx tsc --init
   ```
   - Configure `tsconfig.json` with appropriate settings (e.g., `outDir`, `rootDir`, `strict`).
3. **Install essential dependencies:**
   ```bash
   npm install ethers node-fetch dotenv
   npm install @types/node-fetch --save-dev
   ```
4. **Create basic project structure:**
   - Create a `src` directory.
   - Create an `index.ts` file in the `src` directory.
   - Create a `.env` file for environment variables.

**Verification:**
- Ensure `package.json`, `tsconfig.json`, `src/index.ts`, and `.env` files exist.
- Ensure dependencies are listed in `package.json`.

---

## Step 2: Environment Configuration and Ethereum Provider Setup

**Goal:** Load environment variables and set up the Ethereum provider using `ethers.js`.

**Tasks:**
1. **Install `dotenv`:** (Already done in Step 1, but ensure it's there).
2. **Configure `.env`:** Add the following environment variables to `.env`:
   ```
   ETHEREUM_RPC_URL=YOUR_ETHEREUM_RPC_URL
   DISCORD_WEBHOOK_URL=YOUR_DISCORD_WEBHOOK_URL
   ```
   *(Replace placeholders with actual values)*
3. **Create an `ethers.js` provider:** In `src/index.ts`, implement code to:
   - Import `ethers` from `ethers`.
   - Load environment variables using `dotenv`.
   - Create a new `ethers.providers.JsonRpcProvider` using `process.env.ETHEREUM_RPC_URL`.

**Code Snippet (`src/index.ts`):**
```typescript
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

async function main() {
  console.log("Connected to Ethereum network.");
  const blockNumber = await provider.getBlockNumber();
  console.log(`Current block number: ${blockNumber}`);
}

main().catch(console.error);
```

**Verification:**
- Running `npx ts-node src/index.ts` should connect to the Ethereum network and print the current block number.

---

## Step 3: Sequencer Contract Interaction - Fetching Jobs

**Goal:** Implement functionality to interact with the Sequencer contract and fetch the list of active jobs.

**Tasks:**
1. **Define the Sequencer contract ABI:** Create an array or import the ABI for the Sequencer contract.
2. **Create a contract instance:** Instantiate an `ethers.Contract` object using the Sequencer address and ABI.
3. **Implement a function to fetch active jobs:**
   - Call `numJobs()` to get the number of jobs.
   - Iterate from `0` to `numJobs() - 1`.
   - Call `jobAt(index)` for each index to get the job address.
   - Return an array of job addresses.

**Code Snippet (`src/index.ts`):**
```typescript
// ... (imports and provider setup)

const SEQUENCER_ADDRESS = '0x238b4E35dAed6100C6162fAE4510261f88996EC9';
const SEQUENCER_ABI = [
  "function numJobs() external view returns (uint256)",
  "function jobAt(uint256 _index) external view returns (address)"
];

const sequencerContract = new ethers.Contract(SEQUENCER_ADDRESS, SEQUENCER_ABI, provider);

async function getActiveJobs(): Promise<string[]> {
  const numJobs = await sequencerContract.numJobs();
  const jobs: string[] = [];
  for (let i = 0; i < numJobs.toNumber(); i++) {
    const jobAddress = await sequencerContract.jobAt(i);
    jobs.push(jobAddress);
  }
  return jobs;
}

async function main() {
  // ... (previous main function code)
  const activeJobs = await getActiveJobs();
  console.log("Active Jobs:", activeJobs);
}

main().catch(console.error);
```

**Verification:**
- Running `npx ts-node src/index.ts` should now print the list of active job addresses.

---

## Step 4: Implementing Job State Management

**Goal:** Create a mechanism to track the state of each job, including the last worked block.

**Tasks:**
1. **Define the `JobState` interface:**
   ```typescript
   interface JobState {
       address: string;
       lastWorkedBlock: number;
       consecutiveUnworkedBlocks: number;
   }
   ```
2. **Initialize job states:**
   - Fetch the initial list of active jobs.
   - For each job, create a `JobState` object.
   - For the initial `lastWorkedBlock`, you can either:
     - Query the last block the job's `work` function was called (more complex, can be a simplification for this challenge).
     - Or, for simplicity in this step, initialize `lastWorkedBlock` to the current block number or `0`.
3. **Store job states:** Use a `Map` or an object to store the `JobState` for each job, keyed by the job address.

**Code Snippet (`src/index.ts`):**
```typescript
// ... (previous code)

interface JobState {
    address: string;
    lastWorkedBlock: number;
    consecutiveUnworkedBlocks: number;
}

const jobStates: Map<string, JobState> = new Map();

async function initializeJobStates(jobs: string[]): Promise<void> {
  const currentBlock = await provider.getBlockNumber();
  for (const jobAddress of jobs) {
    jobStates.set(jobAddress, {
      address: jobAddress,
      lastWorkedBlock: currentBlock, // Simplified initialization
      consecutiveUnworkedBlocks: 0,
    });
  }
}

async function main() {
  // ... (previous main function code)
  await initializeJobStates(activeJobs);
  console.log("Initial Job States:", jobStates);
}

main().catch(console.error);
```

**Verification:**
- Running `npx ts-node src/index.ts` should now print the initialized job states.

---

## Step 5: Monitoring New Blocks and Updating Job States

**Goal:** Implement the core logic to monitor new blocks and update the `lastWorkedBlock` and `consecutiveUnworkedBlocks` for each job.

**Tasks:**
1. **Implement a block processing function:** This function will be called for each new block.
2. **Fetch current block number.**
3. **For each active job:**
   - **(Simplified for this step):** Assume a job is "worked" if the current block number is greater than its `lastWorkedBlock`. In a real scenario, you would need to check for events or other on-chain indicators.
   - If worked, update `lastWorkedBlock` to the current block and reset `consecutiveUnworkedBlocks` to 0.
   - If not worked, increment `consecutiveUnworkedBlocks`.

**Code Snippet (`src/index.ts`):**
```typescript
// ... (previous code)

async function processNewBlock(): Promise<void> {
  const currentBlock = await provider.getBlockNumber();
  for (const jobState of jobStates.values()) {
    // Simplified "worked" check
    if (currentBlock > jobState.lastWorkedBlock) {
      jobState.lastWorkedBlock = currentBlock;
      jobState.consecutiveUnworkedBlocks = 0;
    } else {
      jobState.consecutiveUnworkedBlocks++;
    }
  }
  console.log(`Processed block ${currentBlock}. Job States:`, jobStates);
}

async function main() {
  // ... (previous main function code)
  await initializeJobStates(activeJobs);

  // Example of calling the block processing function periodically
  setInterval(processNewBlock, 15000); // Run every 15 seconds
}

main().catch(console.error);
```

**Verification:**
- Running the script should now periodically process new blocks and update the job states. (Note: This is a simplified version; in reality, you'd need a more accurate way to determine if a job was worked).

---

## Step 6: Implementing Discord Alerting

**Goal:** Send Discord alerts when a job's `consecutiveUnworkedBlocks` reaches the threshold (1000).

**Tasks:**
1. **Implement a function to send Discord messages:**
   - Use `node-fetch` to make a POST request to the Discord webhook URL.
   - Construct the message payload.
2. **Modify the block processing function:**
   - After updating job states, check if any job's `consecutiveUnworkedBlocks` is 1000 or more.
   - If so, send a Discord alert for that job.

**Code Snippet (`src/index.ts`):**
```typescript
// ... (previous code)
import fetch from 'node-fetch';

async function sendDiscordAlert(jobAddress: string, unworkedBlocks: number, currentBlock: number): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("Discord webhook URL not configured.");
    return;
  }

  const message = {
    content: `🚨 Alert! Job ${jobAddress} hasn't been worked for ${unworkedBlocks} blocks (current block: ${currentBlock}).`
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      console.error(`Failed to send Discord alert. Status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error sending Discord alert:", error);
  }
}

async function processNewBlock(): Promise<void> {
  const currentBlock = await provider.getBlockNumber();
  for (const jobState of jobStates.values()) {
    // ... (previous block processing logic)
    if (jobState.consecutiveUnworkedBlocks >= 1000) {
      await sendDiscordAlert(jobState.address, jobState.consecutiveUnworkedBlocks, currentBlock);
      // Optionally, reset the counter or add a flag to avoid repeated alerts
    }
  }
  // ...
}
```

**Verification:**
- Ensure your Discord webhook URL is configured. Running the script should send alerts to your Discord channel when a job reaches the threshold (this will take time with the 1000 block threshold).

---

## Step 7: Dockerization

**Goal:** Create a Dockerfile to containerize the application.

**Tasks:**
1. **Create a `Dockerfile` in the project root:**
   ```dockerfile
   FROM node:16-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm install --production
   COPY . .
   RUN npm run build
   CMD ["node", "dist/index.js"]
   ```
2. **Add a build script to `package.json`:**
   ```json
   "scripts": {
     "build": "npx tsc",
     "start": "node dist/index.js"
   },
   ```
3. **Build the Docker image:**
   ```bash
   docker build -t keep3r-beep3r .
   ```
4. **Run the Docker container:**
   ```bash
   docker run -d -e ETHEREUM_RPC_URL="YOUR_ETHEREUM_RPC_URL" -e DISCORD_WEBHOOK_URL="YOUR_DISCORD_WEBHOOK_URL" keep3r-beep3r
   ```

**Verification:**
- The Docker image should build successfully.
- The Docker container should run without errors and perform the monitoring and alerting tasks.

---

## Step 8: Implementing `workable()` Check (Refinement)

**Goal:**  Refine the block processing logic to use the `workable()` function of the job contracts to determine if a job was actually worked.

**Tasks:**
1. **Define the `IJob` interface ABI:** Get the ABI for the `IJob` interface.
2. **Modify the block processing function:**
   - For each job, create a contract instance using its address and the `IJob` ABI.
   - Call the `workable()` function of the job contract.
   - **Crucially, the challenge states `work` succeeds IF AND ONLY IF `workable` returns a valid execution. We can't directly observe `work` calls easily. A pragmatic approach here is to assume that if `workable()` returns successfully in a block, the job *was likely* worked in that block or a preceding block.**
   - If `workable()` returns successfully, update `lastWorkedBlock`.

**Note:** This step involves more complex asynchronous operations and error handling.

---

## Step 9: Error Handling and Observability (Refinement)

**Goal:** Implement robust error handling and logging.

**Tasks:**
1. **Add error handling to RPC calls and Discord alerts.**
2. **Implement logging using `console.log` or a dedicated logging library.**
3. **Consider adding health check endpoints.**

---

## Step 10: Testing (Crucial Throughout)

**Goal:** Write unit and integration tests for the key functionalities.

**Tasks:**
1. **Write unit tests for state management logic.**
2. **Write integration tests for the end-to-end workflow (simulating block updates and checking for alerts).**

---

## Future Steps (Beyond Core Requirements)
- Implement more sophisticated chain reorg handling.
- Add more comprehensive monitoring and metrics.
- Explore different alerting mechanisms.
- Optimize RPC calls further.