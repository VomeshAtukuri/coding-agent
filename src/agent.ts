import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  generateText,
  streamText,
  stepCountIs,
  type ModelMessage,
  type LanguageModel,
} from 'ai';
import type { ProviderConfig } from './ui';
import { createTools } from './tools';
import { trackTokens, withRetry } from './harness';

function getEnvKeyName(provider: string): string {
  switch (provider) {
    case 'OpenAI': return 'OPENAI_API_KEY';
    case 'Anthropic': return 'ANTHROPIC_API_KEY';
    case 'Azure': return 'AZURE_API_KEY';
    case 'Custom': return 'CUSTOM_API_KEY';
    default: return `${provider.toUpperCase()}_API_KEY`;
  }
}

function getEnvKey(provider: string): string | undefined {
  return process.env[getEnvKeyName(provider)];
}

export type ApprovalCallback = (toolName: string, args: any) => Promise<boolean>;

interface AskArgs {
  userMessage: string;
  onToolCall?: (toolName: string, args: unknown) => void;
  signal?: AbortSignal;
}

interface AgentOptions {
  approval?: ApprovalCallback;
}

const MAX_MESSAGES = 25;
// Keep the last N *complete* turns when summarizing, never a raw slice —
// see trimToCompleteTurns() for why a raw slice is unsafe.
const KEEP_RECENT_MESSAGES = 4;

const SYSTEM_PROMPT = `You are a powerful coding agent running in the user's terminal.
You have access to tools that let you read files, write files, run shell commands, list directories, and search code.

Working directory: ${process.cwd()}

Guidelines:
- When asked to do something, USE your tools to accomplish it. Don't just suggest code — actually make changes.
- Read files before modifying them to understand the current state.
- After making changes, verify them if possible (e.g. run tests, check output).
- Be concise in your responses. Show what you did, not lengthy explanations.
- If a task requires multiple steps, do them all in one turn.`;

export function createModel(config: ProviderConfig): LanguageModel {
  const { provider, model, resourceName, baseURL } = config;

  const apiKey = config.apiKey || getEnvKey(provider);
  if (!apiKey) {
    throw new Error(`No API key found. Set ${getEnvKeyName(provider)} env var or run setup.`);
  }

  switch (provider) {
    case 'OpenAI': {
      const openai = createOpenAI({ apiKey });
      return openai.chat(model || 'gpt-4o');
    }
    case 'Azure': {
      const azure = createAzure({ resourceName: resourceName!, apiKey });
      return azure.chat(model || 'gpt-4o');
    }
    case 'Anthropic': {
      // Anthropic's API isn't OpenAI-compatible — use the dedicated provider,
      // not createOpenAI (which would call OpenAI's endpoint with the wrong key/shape).
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model || 'claude-sonnet-4-5');
    }
    case 'Custom': {
      const custom = createOpenAI({ apiKey, baseURL });
      return custom.chat(model || 'custom-model');
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * A tool-result message must always immediately follow the assistant message
 * that requested it. Slicing `messages.slice(-N)` blindly can land in the
 * middle of such a pair and produce an invalid history. This walks backward
 * from the end and only stops at a safe boundary (a user message, or an
 * assistant message with no pending tool calls).
 */
function trimToCompleteTurns(history: ModelMessage[], keep: number): ModelMessage[] {
  if (history.length <= keep) return history.slice();

  let start = history.length - keep;
  while (start > 0) {
    const msg = history[start];
    const prev = history[start - 1];
    const prevIsToolCall =
      prev.role === 'assistant' &&
      Array.isArray(prev.content) &&
      prev.content.some((p: any) => p.type === 'tool-call');
    const isDanglingToolResult = msg.role === 'tool' || prevIsToolCall;
    if (!isDanglingToolResult) break;
    start--;
  }
  return history.slice(start);
}

export class Agent {
  private messages: ModelMessage[] = [];
  private model: LanguageModel;
  private tools: ReturnType<typeof createTools>;
  private approval?: ApprovalCallback;
  
  constructor(model: LanguageModel, options?: AgentOptions) {
    this.model = model;
    this.tools = createTools();
    this.approval = options?.approval;
  }

  getHistory(): readonly ModelMessage[] {
    return this.messages;
  }

  private async summarize() {
    const transcript = this.messages
      .map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n');

    const { text: summary } = await generateText({
      model: this.model,
      system:
        'You are a summarizer. Condense the following conversation into a brief summary. ' +
        'Include: what the user asked, what tools were used, what files were changed, and the current state. ' +
        'Be concise but preserve all important context.',
      prompt: transcript,
    });

    const recent = trimToCompleteTurns(this.messages, KEEP_RECENT_MESSAGES);
    this.messages = [
      { role: 'user', content: `[Previous conversation summary]: ${summary}` },
      ...recent,
    ];
  }

  async ask({ userMessage, onToolCall, signal }: AskArgs) {
    this.messages.push({ role: 'user', content: userMessage });

    try {
      const result = await withRetry(() => Promise.resolve(streamText({
        model: this.model,
        system: SYSTEM_PROMPT,
        messages: this.messages,
        tools: this.tools,
        stopWhen: stepCountIs(8),
        abortSignal: signal,
        toolApproval: this.approval ? async ({ toolCall }: any) => {
          const approved = await this.approval!(toolCall.toolName, toolCall.input);
          return approved ? 'approved' as const : 'denied' as const;
        } : undefined,
        onStepFinish: ({ toolCalls }) => {
          for (const tc of toolCalls ?? []) {
            onToolCall?.(tc.toolName, tc.input);
          }
        },
      })));

      return {
        textStream: result.textStream,
        done: async () => {
          try {
            const response = await result.response;
            this.messages.push(...response.messages);

            // Track token usage
            const usage = await result.totalUsage;
            trackTokens(usage);

            if (this.messages.length > MAX_MESSAGES) {
              await this.summarize();
            }
          } catch (err) {
            this.messages.pop();
            throw err;
          }
        },
      };
    } catch (err) {
      // Roll back the optimistic push so a failed call doesn't corrupt history.
      this.messages.pop();
      throw err;
    }
  }
}