#!/usr/bin/env node
import { cac } from 'cac';
import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { Agent, createModel, type ApprovalCallback } from './core/agent';
import { appendHistory, getConfig, saveConfig } from './config/config';
import { getSessionTokens } from './core/harness';
import { SelectProvider, Welcome, type ProviderConfig } from './cli/ui';
import { formatMarkdown } from './cli/markdown';
import { handleError } from './cli/errors';
import { handleCommand } from './cli/commands';

function createPrompt() {
    let rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return {
        ask(query: string): Promise<string | null> {
            return new Promise((resolve) => {
                rl.question(query, (answer) => resolve(answer));
                rl.once('close', () => resolve(null));
            });
        },
        close() { rl.close(); },
        release() { rl.close(); },
        reacquire() { rl = readline.createInterface({ input: process.stdin, output: process.stdout }); }
    };
}

const cli = cac('harnessly');

const ENV_PROVIDERS: { envKey: string; provider: ProviderConfig['provider']; model: string; extra?: Record<string, string> }[] = [
    { envKey: 'OPENAI_API_KEY', provider: 'OpenAI', model: 'gpt-4o' },
    { envKey: 'ANTHROPIC_API_KEY', provider: 'Anthropic', model: 'claude-sonnet-4-5' },
    { envKey: 'AZURE_API_KEY', provider: 'Azure', model: 'gpt-4o', extra: { resourceName: 'AZURE_RESOURCE_NAME' } },
    { envKey: 'GOOGLE_API_KEY', provider: 'Google', model: 'gemini-2.5-flash' },
];

function tryEnvConfig(): ProviderConfig | null {
    for (const p of ENV_PROVIDERS) {
        const apiKey = process.env[p.envKey];
        if (!apiKey) continue;
        if (p.extra) {
            const extraVals: Record<string, string> = {};
            for (const [k, envVar] of Object.entries(p.extra)) {
                if (!process.env[envVar]) continue;
                extraVals[k] = process.env[envVar]!;
            }
            if (Object.keys(extraVals).length < Object.keys(p.extra).length) continue;
            return { provider: p.provider, apiKey, model: p.model, ...extraVals };
        }
        return { provider: p.provider, apiKey, model: p.model };
    }
    return null;
}

cli.command('', 'Start the coding agent').action(async () => {
    Welcome();
    let config = getConfig();
    if(!config){
        config = tryEnvConfig() ?? await SelectProvider();
        saveConfig(config);
    } else {
        console.log(chalk.dim(`  Provider: ${config.provider} | Model: ${config.model || 'default'}`));
        console.log(chalk.dim(`  Working dir: ${process.cwd()}\n`));
    }

    let model = createModel(config);
    const prompt = createPrompt();

    let spinner: any = null;

    // Graceful Ctrl+C handling — stop spinner, close prompt, exit cleanly
    let isShuttingDown = false;
    const handleInterrupt = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        if (spinner) spinner.stop();
        prompt.close();
        console.log(chalk.dim('\n  Interrupted. Goodbye!\n'));
        process.exit(0);
    };
    process.on('SIGINT', handleInterrupt);
    process.on('SIGTERM', handleInterrupt);

    const DESTRUCTIVE = new Set(['writeFile', 'runCommand']);

    const approval: ApprovalCallback = async (toolName, args) => {
        if (!DESTRUCTIVE.has(toolName)) return true;
        if (spinner) spinner.stop();
        const detail = formatArgs(args);
        console.log(chalk.yellow(`\n  ⚠ ${toolName}(${detail})`));
        const answer = await prompt.ask(chalk.yellow('  Allow? [y/N] '));
        const approved = answer?.trim().toLowerCase() === 'y';
        if (spinner && approved) spinner.start('Thinking...');
        return approved;
    };

    let agent = new Agent(model, { approval });
    let currentModel = model;

    while(true) {
        const input = await prompt.ask(chalk.cyan('>>> '));
        if(input === null || input === 'exit' || input === '/exit') {
            prompt.close();
            console.log(chalk.dim('\nGoodbye!\n'));
            break;
        }

        if(!input.trim()) continue;

        const cmd = input.trim();

        if(cmd.startsWith('/')) {
            const handled = await handleCommand(cmd, {
                agent,
                model: currentModel,
                config,
                approval,
                prompt,
                setAgent: (a) => { agent = a; },
                setConfig: (c) => { config = c; currentModel = createModel(c); },
            });
            if (handled) continue;
            console.log(chalk.red(`\n  Unknown command: ${cmd} | /help for available commands\n`));
            continue;
        }

        appendHistory(cmd);
        spinner = ora({ text: 'Thinking...', color: 'cyan' }).start();

        const onToolCall = (toolName: string, args: any) => {
            spinner.stop();
            console.log(chalk.dim(` ${toolName}(${formatArgs(args)})`));
            spinner.start('Thinking...');
        };

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            const { textStream, done } = await agent.ask({ userMessage: input, onToolCall, signal: controller.signal });
            let firstChunk = true;

            // Suppress AI SDK's internal error logging to stderr
            const originalStderrWrite = process.stderr.write.bind(process.stderr);
            process.stderr.write = (() => true) as any;

            try {
                let buffer = '';
                for await (const chunk of textStream) {
                    if (firstChunk) {
                        spinner.stop();
                        firstChunk = false;
                    }
                    buffer += chunk;
                }
                if (firstChunk) {
                    spinner.stop();
                }
                const fallbackText = await done();
                if (fallbackText) {
                    buffer += fallbackText;
                }
                if (buffer.trim()) {
                    process.stdout.write(`\n${chalk.green('Harnessly:')}\n`);
                    process.stdout.write(formatMarkdown(buffer) + '\n');
                } else {
                    process.stdout.write('\n');
                }
                const usage = getSessionTokens();
                console.log(chalk.dim(`  tokens: ${usage.totalTokens.toLocaleString()} | /help for commands`));
                process.stdout.write('\n');
            } finally {
                process.stderr.write = originalStderrWrite;
                clearTimeout(timeout);
            }
        } catch (err: any) {
            spinner?.stop();
            spinner = null;
            handleError(err);
        }
    }
});

function formatArgs(args: any): string {
    if (args.filePath) return args.filePath;
    if (args.command) return args.command;
    if (args.dirPath) return args.dirPath;
    if (args.pattern) return args.pattern;
    return JSON.stringify(args).slice(0, 60);
}

cli.help();
cli.version('1.0.3');
cli.parse();