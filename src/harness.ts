import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Directory Scoping ───────────────────────────────────

const WORKING_DIR = process.cwd();

function isWithinWorkingDir(targetPath: string): boolean {
    const resolved = path.resolve(targetPath);
    const relative = path.relative(WORKING_DIR, resolved);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function checkPath(filePath: string): { allowed: boolean; reason?: string } {
    if (!isWithinWorkingDir(filePath)) {
        return {
            allowed: false,
            reason: `Path "${filePath}" is outside the working directory (${WORKING_DIR}). Access denied.`,
        };
    }
    return { allowed: true };
}

// ─── Command Safety ───────────────────────────────────────

const DANGEROUS_PATTERNS: { pattern: RegExp; reason: string }[] = [
    { pattern: /\brm\s+-rf\s+\//i, reason: 'Recursive delete from root' },
    { pattern: /\brm\s+-rf\s+~/i, reason: 'Recursive delete of home directory' },
    { pattern: /\brm\s+-rf\s+\.\./i, reason: 'Recursive delete of parent directory' },
    { pattern: /\bdel\s+\/s/i, reason: 'Windows recursive delete' },
    { pattern: /\bformat\s+[a-z]:/i, reason: 'Disk format command' },
    { pattern: /\bmkfs/i, reason: 'Filesystem format command' },
    { pattern: /\bdd\s+if=/i, reason: 'Raw disk write command' },
    { pattern: /\b:()\{.*\|.*&\};:/i, reason: 'Fork bomb' },
    { pattern: /\bshutdown\b/i, reason: 'System shutdown command' },
    { pattern: /\breboot\b/i, reason: 'System reboot command' },
    { pattern: /\btaskkill\s+\/f/i, reason: 'Force kill all processes' },
    { pattern: /\breg\s+delete/i, reason: 'Registry deletion' },
];

export function checkCommand(command: string): { allowed: boolean; reason?: string } {
    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
            return { allowed: false, reason: `Blocked: ${reason}` };
        }
    }
    return { allowed: true };
}

// ─── Step Logging (Observability) ────────────────────────

const LOG_DIR = path.join(os.homedir(), '.coding-agent', 'logs');
const LOG_PATH = path.join(LOG_DIR, `devra-${new Date().toISOString().slice(0, 10)}.log`);

interface LogEntry {
    timestamp: string;
    tool: string;
    input: any;
    result: string;
    durationMs: number;
}

function ensureLogDir() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function logToolCall(entry: LogEntry) {
    ensureLogDir();
    const line = `[${entry.timestamp}] ${entry.tool} (${entry.durationMs}ms)\n  input: ${JSON.stringify(entry.input).slice(0, 200)}\n  result: ${entry.result.slice(0, 200)}\n\n`;
    fs.appendFileSync(LOG_PATH, line);
}

export function getLogPath() {
    return LOG_PATH;
}

// ─── Token Tracking (Observability) ───────────────────────

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

let sessionTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export function trackTokens(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
    sessionTokens.inputTokens += usage.inputTokens ?? 0;
    sessionTokens.outputTokens += usage.outputTokens ?? 0;
    sessionTokens.totalTokens += usage.totalTokens ?? 0;
}

export function getSessionTokens(): TokenUsage {
    return { ...sessionTokens };
}

export function resetSessionTokens() {
    sessionTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

// ─── Retry Logic (Error Recovery) ─────────────────────────

export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            lastError = err;
            if (attempt === maxRetries) break;
            // Only retry on transient errors (timeout, rate limit, network)
            const isTransient =
                err.message?.includes('timeout') ||
                err.message?.includes('rate limit') ||
                err.message?.includes('ECONNRESET') ||
                err.message?.includes('socket hang up') ||
                err.statusCode === 429 ||
                err.statusCode === 503;
            if (!isTransient) break;
            const delay = baseDelayMs * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
