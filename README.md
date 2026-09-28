# Harnessly

> A harnessed AI coding agent that works inside your terminal.

[![npm version](https://img.shields.io/npm/v/harnessly)](https://www.npmjs.com/package/harnessly)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Harnessly works inside a local workspace: it reads and edits files, runs commands, searches code, and carries a task through validation. Conversations, config, history, logs, and traces remain on your machine under `~/.harnessly/`.

The project is a TypeScript monorepo with a single runtime shared across all surfaces. The CLI is the primary client of the core harness layer — guardrails, observability, and error recovery.

Local-first does not mean offline: model requests send the content needed for a task to the providers you configure. Harnessly does not operate a hosted account or synchronization backend.

### Quick Start

```bash
npx harnessly
```

That's it. On first run, pick your provider, paste your API key, and start coding.

## Features

### Agent
- **Multi-provider support** — OpenAI, Azure, Anthropic, Google, or any custom OpenAI-compatible endpoint
- **Streaming responses** — Token-by-token output with markdown formatting
- **Conversation memory** — Maintains context across turns with auto-summarization
- **Up to 15 tool calls per turn** — Chained reasoning with tool feedback

### Harness (Safety & Observability)
- **Guardrails**
  - Command safety — 12 dangerous command patterns blocked (`rm -rf /`, `format`, `mkfs`, `dd`, `shutdown`, etc.)
  - Directory scoping — All file operations restricted to working directory
  - Path containment — Prevents path traversal (`../` attacks)
- **Approval flow** — Destructive tools (`writeFile`, `runCommand`) prompt for user approval before execution. Non-destructive tools auto-approve.
- **Observability**
  - Step logging — Every tool call logged to `~/.harnessly/logs/` with timestamp, input, result, and duration
  - Token tracking — Cumulative session token usage (input, output, total)
- **Error recovery** — Automatic retry with exponential backoff (1s, 2s, 4s) on transient API failures (timeout, rate limit, ECONNRESET, 429, 503)

## Installation

```bash
npm install -g harnessly
```

Or run without installing:

```bash
npx harnessly
```

## Usage

```bash
harnessly
```

### First Run Setup

On first run, Harnessly will prompt you to:
1. Select your AI provider (OpenAI, Azure, Anthropic, Google, or Custom)
2. Enter your API key (masked input)
3. Choose a model (or use the default)

Your config is saved at `~/.harnessly/config.json` so you only need to set it up once.

### Environment Variables (Alternative to Setup)

Skip the setup wizard by setting environment variables:

```bash
# OpenAI
export OPENAI_API_KEY=sk-...
harnessly

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
harnessly

# Google
export GOOGLE_API_KEY=...
harnessly

# Azure
export AZURE_API_KEY=...
export AZURE_RESOURCE_NAME=my-resource
harnessly
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/about` | About Harnessly |
| `/tokens` | Display session token usage |
| `/logs` | Show log file path |
| `/clear` | Clear conversation history and reset tokens |
| `/config` | Switch provider or model |
| `/history` | Show recent prompt history |
| `/cls` | Clear the terminal screen |
| `/exit` | Exit Harnessly |

## Examples

```
>>> read the package.json and tell me what dependencies I have

>>> create a new file called utils.ts with a debounce function
  ⚠ writeFile(utils.ts)
  Allow? [y/N] y

>>> run the tests and fix any failures
  ⚠ runCommand(npm test)
  Allow? [y/N] y

>>> search for all TODO comments in the project
```

## Available Tools

| Tool | Description | Approval Required |
|------|-------------|-------------------|
| `readFile` | Read the contents of any file | No |
| `writeFile` | Create or overwrite a file | Yes |
| `listDirectory` | List files and folders in a directory | No |
| `runCommand` | Execute any shell command (30s timeout) | Yes |
| `searchFiles` | Search for text patterns across files | No |

## How It Works

```
┌─────────────────────────────────────────┐
│           HARNESS LAYER                 │
│  ┌───────────────────────────────────┐  │
│  │         AGENT (LLM)               │  │
│  │  ┌─────┐  ┌──────┐  ┌──────────┐  │  │
│  │  │Tools│  │Memory│  │Reasoning │  │  │
│  │  └─────┘  └──────┘  └──────────┘  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Guardrails   ✅ Observability          │
│  Approval     ✅ Token Tracking         │
│  Retry        ✅ Step Logging         │
└─────────────────────────────────────────┘
```

1. You type a message in the terminal
2. Harnessly sends it to your chosen AI model along with tool definitions
3. The AI model decides which tools to use and calls them
4. **Harness layer checks**: Is this tool destructive? → Prompt user. Is this command dangerous? → Block. Is this path outside working dir? → Deny.
5. Approved tool calls execute and results go back to the model
6. The model can chain up to 15 tool calls per turn
7. Final response is formatted with markdown and displayed with token usage

## Configuration

Config is stored at `~/.harnessly/config.json`:

```json
{
  "provider": "OpenAI",
  "apiKey": "sk-...",
  "model": "gpt-4o"
}
```

To reconfigure, delete the config file and restart Harnessly, or use `/config` to switch providers.

## Project Structure

```
src/
  index.ts              # Entry point — CLI setup, main loop, stream handling
  core/
    agent.ts            # AI agent — model creation, streaming, tool execution
    tools.ts            # Tool definitions — readFile, writeFile, runCommand, etc.
    harness.ts          # Safety, logging, retry, token tracking
  cli/
    commands.ts         # Slash commands (/config, /clear, /help, etc.)
    errors.ts           # Error handler with user-friendly messages
    markdown.ts         # Markdown-to-terminal formatter
    ui.ts               # Provider selection, welcome banner
  config/
    config.ts           # Config + history persistence
    paths.ts            # Shared path constants
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Start from build
npm start
```

## Tech Stack

- **AI SDK v7** (Vercel) — model integration, tool execution, and `toolApproval`
- **Zod v4** — tool input schema validation
- **clack/prompts** — terminal UI components
- **cac** — CLI framework
- **chalk** — terminal styling
- **ora** — loading spinners

## License

MIT

## Author

Vomesh ([@VomeshAtukuri](https://github.com/VomeshAtukuri))
