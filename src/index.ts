#!/usr/bin/env node
import { cac } from 'cac';
import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { Agent, createModel, type ApprovalCallback } from './agent';
import { appendHistory, clearHistory, deleteConfig, getConfig, getHistory, saveConfig } from './config';
import { getSessionTokens, resetSessionTokens, getLogPath } from './harness';
import { SelectProvider, Welcome, type ProviderConfig } from './ui';

function createPrompt() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return {
        ask(query: string): Promise<string | null> {
            return new Promise((resolve) => {
                rl.question(query, (answer) => resolve(answer));
                rl.once('close', () => resolve(null));
            });
        },
        close() { rl.close(); }
    };
}

const cli = cac('harnessly');

function tryEnvConfig(): ProviderConfig | null {
    if (process.env.OPENAI_API_KEY) {
        return { provider: 'OpenAI', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' };
    }
    if (process.env.ANTHROPIC_API_KEY) {
        return { provider: 'Anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-sonnet-4-5' };
    }
    if (process.env.AZURE_API_KEY && process.env.AZURE_RESOURCE_NAME) {
        return { provider: 'Azure', apiKey: process.env.AZURE_API_KEY, model: 'gpt-4o', resourceName: process.env.AZURE_RESOURCE_NAME };
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

    while(true) {
        const input = await prompt.ask(chalk.cyan('>>> '));
        if(input === null || input === 'exit' || input === '/exit') {
            prompt.close();
            console.log(chalk.dim('\nGoodbye!\n'));
            break;
        }

        if(!input.trim()) continue;

        const cmd = input.trim();

        if(cmd === '/config') {
            deleteConfig();
            config = await SelectProvider();
            saveConfig(config);
            model = createModel(config);
            agent = new Agent(model, { approval });
            console.log(chalk.green('  Config updated!\n'));
            continue;
        }

        if(cmd === '/clear') {
            agent = new Agent(model, { approval });
            clearHistory();
            resetSessionTokens();
            console.log(chalk.dim('  Conversation cleared.\n'));
            continue;
        }

        if(cmd === '/history') {
            const history = getHistory();
            if(history.length === 0) {
                console.log(chalk.dim('  No history yet.\n'));
            } else {
                console.log(chalk.dim('  Recent prompts:'));
                history.slice(-10).forEach((h, i) => {
                    console.log(chalk.dim(`    ${i + 1}. ${h}`));
                });
                console.log('');
            }
            continue;
        }

        if(cmd === '/tokens') {
            const usage = getSessionTokens();
            console.log(chalk.dim(`  Tokens: ${usage.totalTokens.toLocaleString()} (in: ${usage.inputTokens.toLocaleString()}, out: ${usage.outputTokens.toLocaleString()})\n`));
            continue;
        }

        if(cmd === '/logs') {
            console.log(chalk.dim(`  Log file: ${getLogPath()}\n`));
            continue;
        }

        if(cmd === '/help') {
            console.log('');
            console.log(chalk.cyan('  Available commands:'));
            console.log(chalk.dim('    /help     - Show this help'));
            console.log(chalk.dim('    /config   - Change provider/model'));
            console.log(chalk.dim('    /clear    - Reset conversation'));
            console.log(chalk.dim('    /history  - Show recent prompts'));
            console.log(chalk.dim('    /tokens   - Show token usage'));
            console.log(chalk.dim('    /logs     - Show log file path'));
            console.log(chalk.dim('    /exit     - Quit Harnessly'));
            console.log('');
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
            const { textStream, done } = await agent.ask({ userMessage: input, onToolCall });
            let firstChunk = true;
            for await (const chunk of textStream) {
                if (firstChunk) {
                    spinner.stop();
                    process.stdout.write(`\n${chalk.green('Harnessly:')} `);
                    firstChunk = false;
                }
                process.stdout.write(chunk);
            }
            if (firstChunk) spinner.stop();
            process.stdout.write('\n');
            await done();
            const usage = getSessionTokens();
            console.log(chalk.dim(`  tokens: ${usage.totalTokens.toLocaleString()} | /help for commands`));
            process.stdout.write('\n');
        } catch (err: any) {
            spinner?.stop();
            spinner = null;
            console.log(chalk.red(`\nError: ${err.message}\n`));
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
cli.version('1.0.1');
cli.parse();