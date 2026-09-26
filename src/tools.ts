import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
    checkPath,
    checkCommand,
    logToolCall,
} from './harness';

const MAX_OUTPUT_LENGTH = 10000;

function truncate(text: string, limit = MAX_OUTPUT_LENGTH): string {
    if (text.length <= limit) return text;
    const half = Math.floor(limit / 2);
    return text.slice(0, half) + `\n\n... [truncated ${text.length - limit} chars] ...\n\n` + text.slice(-half);
}

export function createTools() {
    function timedExecute(toolName: string, input: any, fn: () => string): string {
        const start = Date.now();
        const result = fn();
        const durationMs = Date.now() - start;
        logToolCall({
            timestamp: new Date().toISOString(),
            tool: toolName,
            input,
            result,
            durationMs,
        });
        return result;
    }

    return {
        readFile: tool({
            description: 'Read the contents of a file at the given path',
            inputSchema: z.object({
                filePath: z.string().describe('Path to the file to read'),
            }),
            execute: async ({ filePath }) => {
                const pathCheck = checkPath(filePath);
                if (!pathCheck.allowed) return pathCheck.reason!;

                return timedExecute('readFile', { filePath }, () => {
                    try {
                        const absolutePath = path.resolve(filePath);
                        const content = fs.readFileSync(absolutePath, 'utf-8');
                        return truncate(content);
                    } catch (e: any) {
                        return `Error reading file: ${e.message}`;
                    }
                });
            },
        }),

        writeFile: tool({
            description: 'Write content to a file. Creates the file and directories if they do not exist.',
            inputSchema: z.object({
                filePath: z.string().describe('Path to the file to write'),
                content: z.string().describe('Content to write to the file'),
            }),
            execute: async ({ filePath, content }) => {
                const pathCheck = checkPath(filePath);
                if (!pathCheck.allowed) return pathCheck.reason!;

                return timedExecute('writeFile', { filePath, content }, () => {
                    try {
                        const absolutePath = path.resolve(filePath);
                        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
                        fs.writeFileSync(absolutePath, content);
                        return `File written successfully: ${absolutePath}`;
                    } catch (e: any) {
                        return `Error writing file: ${e.message}`;
                    }
                });
            },
        }),

        listDirectory: tool({
            description: 'List files and directories at the given path',
            inputSchema: z.object({
                dirPath: z.string().describe('Path to the directory to list').default('.'),
            }),
            execute: async ({ dirPath }) => {
                const pathCheck = checkPath(dirPath);
                if (!pathCheck.allowed) return pathCheck.reason!;

                return timedExecute('listDirectory', { dirPath }, () => {
                    try {
                        const absolutePath = path.resolve(dirPath);
                        const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
                        return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
                    } catch (e: any) {
                        return `Error listing directory: ${e.message}`;
                    }
                });
            },
        }),

        runCommand: tool({
            description: 'Run a shell command and return its output. Use this for git, npm, or any CLI command.',
            inputSchema: z.object({
                command: z.string().describe('The shell command to execute'),
            }),
            execute: async ({ command }) => {
                const cmdCheck = checkCommand(command);
                if (!cmdCheck.allowed) return cmdCheck.reason!;

                return timedExecute('runCommand', { command }, () => {
                    try {
                        const output = execSync(command, {
                            encoding: 'utf-8',
                            timeout: 30000,
                            cwd: process.cwd(),
                        });
                        return truncate(output || '(no output)');
                    } catch (e: any) {
                        return `Command failed: ${e.message}\n${e.stdout || ''}${e.stderr || ''}`;
                    }
                });
            },
        }),

        searchFiles: tool({
            description: 'Search for a text pattern across files in a directory (like grep)',
            inputSchema: z.object({
                pattern: z.string().describe('Text or regex pattern to search for'),
                dirPath: z.string().describe('Directory to search in').default('.'),
            }),
            execute: async ({ pattern, dirPath }) => {
                const pathCheck = checkPath(dirPath);
                if (!pathCheck.allowed) return pathCheck.reason!;

                return timedExecute('searchFiles', { pattern, dirPath }, () => {
                    try {
                        const output = execSync(
                            `findstr /s /n /i "${pattern}" "${path.resolve(dirPath)}\\*"`,
                            { encoding: 'utf-8', timeout: 15000 }
                        );
                        return truncate(output || 'No matches found.');
                    } catch (e: any) {
                        if (e.status === 1) return 'No matches found.';
                        return `Search error: ${e.message}`;
                    }
                });
            },
        }),
    };
}
