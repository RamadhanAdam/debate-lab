// Step 1: Load environment variables and import the SDK

// Load environment variables from .env file
require('dotenv').config();

// Import CopilotClient and RuntimeConnection from the Github Copilot SDK
// RuntimeConnection lets us explicitly tell the SDK how to connect to the Copilot CLI
// Without this the SDK tries to find the CLI automatically and fails on some systems
const { CopilotClient, RuntimeConnection } = require('@github/copilot-sdk');

// Built in Node.js module for running shell commands
const { execSync } = require('child_process');

// Built in Node.js module for reading and writing files
const fs = require('fs');

// Built in Node.js module for reading terminal input
const readline = require('readline');

// Get the GitHub token directly from the GitHub CLI keychain
// We delete GITHUB_TOKEN and GH_TOKEN from the environment first
// to force gh to use its own stored credentials instead of our environment variables
// This is more reliable than reading from .env
function getGitHubCliToken() {
    try {
        const env = { ...process.env };
        delete env.GITHUB_TOKEN;
        delete env.GH_TOKEN;

        return execSync('gh auth token', { env, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        throw new Error('GitHub CLI is not authenticated. Run: gh auth login -h github.com');
    }
}

const githubToken = getGitHubCliToken();

// Step 2: Create the CopilotClient instance with our logged-in GitHub user
// gitHubToken: the token we got from the GitHub CLI
// RuntimeConnection.forStdio: explicitly tells the SDK where the Copilot CLI is installed
// execSync('which copilot') finds the exact path of the copilot binary on this machine
const client = new CopilotClient({
    gitHubToken: githubToken,
    connection: RuntimeConnection.forStdio({
        path: execSync('which copilot')
            .toString()
            .trim(),
    }),
});

// Step 3: Define and run the main function
// Start the client connection to GitHub

// Step 3b: Helper function to read input from the terminal

// Helper function to read input from the terminal
// Using process.stdout.write instead of console.log to avoid
// conflicts with the streaming output from the agents
function promptUser(question) {
    return new Promise((resolve) => {
        process.stdout.write(question);
        process.stdin.setEncoding('utf8');
        process.stdin.resume();
        process.stdin.once('data', (data) => {
            process.stdin.pause();
            resolve(data.toString().trim());
        });
    });
}

// We use async because we are making API calls that take time to complete
async function main(){

    // Start the client, this establishes the connecton with github
    await client.start()

    //Step 4: Create a session with our four specialized agents
    const session = await client.createSession({
        gitHubToken: githubToken,

        // The AI model to use
        model : "gpt-4.1",
        

        //defining our agents
        customAgents : [

            // Agent 1 : Researcher 
            // Read only , understands what is in the codebase
            {
                name : "researcher",
                description : "Reads and understands the codebase, asnwers questions about struture and methodology. Never modifies anything.",
                tools : ["grep", "glob", "view"],
                prompt : "You are a research analyst. Your job is to thoroughly read and undersstand codebase. Explain what the code does, how it is structured, whta methodology is being used, and what the results show. You never modify any files.",
            },

            // Agent 2: Methods Reviewer
            // Scrutinizes the technical methodology
            {
                name : "methods-reviewer",
                description : "Reviews technical methodology, experiment design, baselines, and evaluation metrics for soundness. ",
                tools: ["grep", "glob", "view"],
                prompt: "You are a strict technical peer reviewer. Your job is to scrutinize the methodology. Ask: is the approach technically sound, are the experiments designed correctly, are the baselines fair, are the evaluation metrics appropriate for this task, is anything missing from the experimental setup. Be tough but constructive.",
            },

            // Agent 3: Critical Reviewer
            // Scrutinizes claims and conclusions
            {
                name: "critical-reviewer",
                description: "Reviews claims, conclusions, and whether results actually support what the author is arguing.",
                tools: ["grep", "glob", "view"],
                prompt: "You are a critical peer reviewer. Your job is to scrutinize the claims and conclusions. Ask: do the results actually support what is being claimed, are there alternative explanations for the results, are the limitations honestly stated, is anything overstated or understated, are the contributions clearly differentiated from prior work. Be rigorous.",
            },

            // Agent 4: Editor
            // Takes feedback and suggests concrete fixes
            // infer: false means it only runs when explicitly asked
            {
                name: "editor",
                description: "Takes reviewer feedback and suggests concrete fixes to code, methodology, and writing.",
                tools: ["grep", "glob", "view", "edit", "bash"],
                prompt: "You are a research editor. Your job is to take feedback from the reviewers and suggest concrete fixes. Do not just repeat the problems, give specific solutions: rewrite this section like this, change this code to this, add this experiment, fix this evaluation mistake. Be specific and actionable.",
                infer: false,
            },

        ],

        // Ask for permission before the agent does anything
        // You must type yes or no in the terminal for every action
        onPermissionRequest: async (request) => {
            console.log(`\nAgent wants to: ${request.kind}`);
            console.log(`Description: ${request.description ?? 'no description provided'}`);
            
            // Ask you to approve or deny in the terminal
            const answer = await promptUser('Approve? (yes/no): ');

            if (answer.toLowerCase() == 'yes' ) {
                return {kind: "approved"};
            } else {
                return {kind: "denied" };
            }
        },

    });

// Step 5: Listen to agent events so we can see what is happening in real time
    // This runs every time an agent does something, like starting, finishing, or failing
    session.on((event) => {
        
        switch (event.type) {
            
            // When the runtime picks an agent for the task
            case "subagent.selected":
                console.log(`\n Agent selected: ${event.data.agentDisplayName}`);
                console.log(`   Tools available: ${event.data.tools?.join(", ") ?? "all"}`);
                break;

            // When the agent actually starts working
            case "subagent.started":
                console.log(`\n▶ Agent started: ${event.data.agentDisplayName}`);
                break;

            // When the agent finishes successfully
            case "subagent.completed":
                console.log(`\n Agent completed: ${event.data.agentDisplayName}`);
                break;

            // When the agent fails
            case "subagent.failed":
                console.log(`\n Agent failed: ${event.data.agentDisplayName}`);
                console.log(`   Error: ${event.data.error}`);
                break;

            // When the runtime moves away from the current agent
            case "subagent.deselected":
                console.log(`\n Agent deselected, returning to main session`);
                break;
        }
    });

    // Step 6: Send a task to the session and wait for the full response
    // sendAndWait sends the prompt and blocks until all agents finish
    console.log("\n Sending task to agents...\n");

    const response = await session.sendAndWait({
        prompt: "Please review this repository. Start by researching the codebase structure and methodology, then have the methods reviewer and critical reviewer scrutinize it, and finally summarize the key issues found.",
    });

    // Print the final response to the terminal
    console.log("\n Final Response:\n");
   console.log(response?.data.content)

    // Step 7: Sve the response as a markdown file in the repo
    // This creates a permanent record of the review
    const timestamp = new Date().toISOString().replace(/[:.]/g,  '-');
    const filename = `review-${timestamp}.md`;

    // Create the reviews directory if it does not exist
    if (!fs.existsSync('./reviews')) {
        fs.mkdirSync('./reviews');
    }

    // Write the review to a markdown file
    fs.writeFileSync(`./reviews/${filename}`, 
        `# Research Review\n\n` +
        `**Date:** ${new Date().toLocaleString()}\n\n` +
        `## Review Output\n\n` +
        response?.data.content
    );

    console.log(`\n Review saved to reviews/${filename}`);

    // Step 8: Close the session and stop the client
    // disconnect() closes the session cleanly
    // stop() shuts down the client connection entirely
    await session.disconnect();
    await client.stop();

    console.log(' Session closed cleanly.')
}

// Step 9: Run main function and catch any errors
// If anything goes wrong, print the error clearly instead of crashing silently
main().catch((error) => {
    console.error("\n ⚠️  Something went wrong: ");
    console.error(error.message);
    process.exit(1);
});
