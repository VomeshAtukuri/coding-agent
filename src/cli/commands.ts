import chalk from 'chalk';
import { Agent, createModel, type ApprovalCallback } from '../core/agent';
import { clearHistory, deleteConfig, getHistory, saveConfig } from '../config/config';
import { getSessionTokens, resetSessionTokens, getLogPath } from '../core/harness';
import { SelectProvider, type ProviderConfig } from './ui';

export interface CommandContext {
    agent: Agent;
    model: any;
    config: ProviderConfig;
    approval: ApprovalCallback;
    prompt: { release: () => void; reacquire: () => void; ask: (q: string) => Promise<string | null> };
    setAgent: (agent: Agent) => void;
    setConfig: (config: ProviderConfig) => void;
}

export function printHelp() {
    console.log('');
    console.log(chalk.cyan('  Available commands:'));
    console.log(chalk.dim('    /help     - Show this help'));
    console.log(chalk.dim('    /about    - About the CLI agent'));
    console.log(chalk.dim('    /config   - Change provider/model'));
    console.log(chalk.dim('    /clear    - Reset conversation'));
    console.log(chalk.dim('    /cls      - Clear screen'));
    console.log(chalk.dim('    /history  - Show recent prompts'));
    console.log(chalk.dim('    /tokens   - Show token usage'));
    console.log(chalk.dim('    /logs     - Show log file path'));
    console.log(chalk.dim('    /exit     - Quit Harnessly'));
    console.log('');
}

export async function handleCommand(cmd: string, ctx: CommandContext): Promise<boolean> {
    switch (cmd) {
        case '/about': {
            console.log('');
            console.log(chalk.cyan.bold('  Harnessly'));
            console.log(chalk.dim('  A harnessed AI coding agent'));
            console.log('');
            console.log(chalk.dim('  Harnessly works inside a local workspace: it reads and edits files,'));
            console.log(chalk.dim('  runs commands, searches code, and carries a task through validation.'));
            console.log(chalk.dim('  Conversations, config, history, logs, and traces remain on your'));
            console.log(chalk.dim('  machine under ~/.harnessly/.'));
            console.log('');
            console.log(chalk.dim('  The project is a TypeScript monorepo with a single runtime shared'));
            console.log(chalk.dim('  across all surfaces. The CLI is the primary client of the core'));
            console.log(chalk.dim('  harness layer — guardrails, observability, and error recovery.'));
            console.log('');
            console.log(chalk.dim('  Local-first does not mean offline: model requests send the'));
            console.log(chalk.dim('  content needed for a task to the providers you configure.'));
            console.log(chalk.dim('  Harnessly does not operate a hosted account or sync backend.'));
            console.log('');
            return true;
        }
        case '/config': {
            ctx.prompt.release();
            deleteConfig();
            const config = await SelectProvider();
            saveConfig(config);
            ctx.setConfig(config);
            const model = createModel(config);
            ctx.setAgent(new Agent(model, { approval: ctx.approval }));
            ctx.prompt.reacquire();
            console.log(chalk.green('  Config updated!\n'));
            return true;
        }
        case '/clear': {
            ctx.setAgent(new Agent(ctx.model, { approval: ctx.approval }));
            clearHistory();
            resetSessionTokens();
            console.log(chalk.dim('  Conversation cleared.\n'));
            return true;
        }
        case '/history': {
            const history = getHistory();
            if (history.length === 0) {
                console.log(chalk.dim('  No history yet.\n'));
            } else {
                console.log(chalk.dim('  Recent prompts:'));
                history.slice(-10).forEach((h, i) => {
                    console.log(chalk.dim(`    ${i + 1}. ${h}`));
                });
                console.log('');
            }
            return true;
        }
        case '/tokens': {
            const usage = getSessionTokens();
            console.log(chalk.dim(`  Tokens: ${usage.totalTokens.toLocaleString()} (in: ${usage.inputTokens.toLocaleString()}, out: ${usage.outputTokens.toLocaleString()})\n`));
            return true;
        }
        case '/logs': {
            console.log(chalk.dim(`  Log file: ${getLogPath()}\n`));
            return true;
        }
        case '/cls': {
            console.clear();
            return true;
        }
        case '/help': {
            printHelp();
            return true;
        }
        default:
            return false;
    }
}
