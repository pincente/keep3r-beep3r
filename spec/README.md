# Challenge: Automation Workable Alert

## **Context**

MakerDAO has several jobs which require onchain automation. In interest of decentralisation they have built a `Sequencer`(https://github.com/makerdao/dss-cron/blob/master/src/Sequencer.sol), in charge of supporting multiple Keeper Networks to work.

Keeper Networks will be required to watch the `activeJobs` array in the `Sequencer` and find all instances of available jobs. All jobs will be deployed contracts which implement the IJob interface (https://github.com/makerdao/dss-cron/blob/master/src/interfaces/IJob.sol).

It is important that the `work` function succeeds **if and only if** the `workable` function returns a valid execution.

## Contracts

Sequencer: https://etherscan.io/address/0x238b4E35dAed6100C6162fAE4510261f88996EC9#code

## Challenge goal

Choose one of the following:

### Option 1: AWS Lambda Function

- Objective: Develop an AWS Lambda function using TypeScript.
- Functionality: The function should run every 5 minutes and send a Discord alert if any Maker job hasn’t been worked for the past 10 consecutive blocks.

### Option 2: NodeJS Process with Docker

- Objective: Develop a long-running NodeJS process using TypeScript.
- Functionality: The process should send a Discord alert if any Maker job hasn’t been worked for the past 1000 consecutive blocks.
- Deployment: Use Docker for the deployment.

## Mandatory Requirements

Regardless of the chosen option, you must utilize the following methods from the Sequencer contract:

- `numJobs()`
- `jobAt(uint256 _index)`

If you choose **Option 2**, you may query 1000 blocks only during the initial setup to bootstrap the system. After this initial query, you must never query 1000 blocks at once again, and must always query fewer than 1000 blocks at a time.

## Criteria

At Wonderland we strive for excellence in every single thing we do. That’s why while looking at your challenge, besides working correctly, we will also take into account:

- **Efficiency**: Can you reduce those RPC calls? 👀
- **Best practices**: Good error handling, a modular code structure, and overall awesome code.
- **Tests, tests, and tests**: You should at least write unit tests to cover the key functionalities.
- **Documentation**: Does your README explain how to run your project and what it does? Is your code clear and explained?

## Deliverables

A GitHub repository containing the developed code, including instructions on how to set up and run the application.

## Expectations

We expect this challenge to take between 10 to 16 hours of work.
