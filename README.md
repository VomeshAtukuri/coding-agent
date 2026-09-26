# Devra

A powerful AI-powered coding agent that runs in your terminal. Devra can read files, write files, run commands, and search code — all driven by natural language.

## Features

- **Multi-provider support** — OpenAI, Azure, Anthropic, or any custom OpenAI-compatible endpoint
- **File operations** — Read, write, and list files and directories
- **Command execution** — Run shell commands (git, npm, etc.) directly
- **Code search** — Search for patterns across your codebase
- **Conversation memory** — Maintains context across multiple turns
- **Interactive CLI** — Beautiful terminal UI with spinners and live tool call feedback

## Installation

```bash
npm install -g devra
```

## Usage

```bash
devra
```

On first run, Devra will prompt you to:
1. Select your AI provider (OpenAI, Azure, Anthropic, or Custom)
2. Enter your API key
3. Choose a model (or use the default)

Your config is saved at `~/.coding-agent/config.json` so you only need to set it up once.

## Examples

```
> read the package.json and tell me what dependencies I have

> create a new file called utils.ts with a debounce function

> run the tests and fix any failures

> search for all TODO comments in the project
```

## Available Tools

| Tool | Description |
|------|-------------|
| `readFile` | Read the contents of any file |
| `writeFile` | Create or overwrite a file (creates directories automatically) |
| `listDirectory` | List files and folders in a directory |
| `runCommand` | Execute any shell command (30s timeout) |
| `searchFiles` | Search for text patterns across files |

## How It Works

1. You type a message in the terminal
2. Devra sends it to your chosen AI model along with tool definitions
3. The AI model decides which tools to use and calls them
4. Tool results go back to the model for further reasoning
5. The model can chain up to 25 tool calls per turn
6. Once done, the final response is displayed

## Configuration

Config is stored at `~/.coding-agent/config.json`:

```json
{
  "provider": "OpenAI",
  "apiKey": "sk-...",
  "model": "gpt-4o"
}
```

To reconfigure, delete the config file and restart Devra.

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

- **AI SDK v7** (Vercel) — model integration and tool execution
- **Zod v4** — tool input schema validation
- **clack/prompts** — terminal UI components
- **cac** — CLI framework
- **chalk** — terminal styling
- **ora** — loading spinners

## License

ISC

## Author

Vomesh
