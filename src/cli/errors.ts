import chalk from 'chalk';

interface ErrorRule {
    match: (err: any) => boolean;
    render: (err: any) => void;
}

const RULES: ErrorRule[] = [
    {
        match: (err) => err.name === 'AbortError' || /abort/i.test(err.message || ''),
        render: () => console.log(chalk.red(`\n  ✖ Request timed out after 60s. Try again.\n`)),
    },
    {
        match: (err) => err.statusCode === 401 || err.status === 401 || /invalid.*key|unauthorized|access denied/i.test(err.message || ''),
        render: () => {
            console.log(chalk.red(`\n  ✖ Authentication failed. Your API key is invalid or expired.`));
            console.log(chalk.dim(`    Run /config to update your API key.\n`));
        },
    },
    {
        match: (err) => err.statusCode === 429 || err.status === 429 || /rate limit/i.test(err.message || ''),
        render: () => console.log(chalk.red(`\n  ✖ Rate limit exceeded. Wait a moment and try again.\n`)),
    },
    {
        match: (err) => err.statusCode === 403 || err.status === 403 || /forbidden|permission/i.test(err.message || ''),
        render: () => console.log(chalk.red(`\n  ✖ Access forbidden. Check your subscription and permissions.\n`)),
    },
    {
        match: (err) => {
            const code = err.statusCode || err.status;
            return code === 500 || code === 503 || /server error|service unavailable/i.test(err.message || '');
        },
        render: (err) => {
            const code = err.statusCode || err.status;
            console.log(chalk.red(`\n  ✖ Provider server error (${code}). Try again in a moment.\n`));
        },
    },
    {
        match: (err) => /timeout|socket hang up|ECONNRESET|ENOTFOUND/i.test(err.message || ''),
        render: () => console.log(chalk.red(`\n  ✖ Network error. Check your internet connection.\n`)),
    },
    {
        match: (err) => /No output generated/i.test(err.message || ''),
        render: () => console.log(chalk.red(`\n  ✖ No response generated. The provider may have returned an error.\n`)),
    },
];

export function handleError(err: any) {
    for (const rule of RULES) {
        if (rule.match(err)) {
            rule.render(err);
            return;
        }
    }
    const msg = err.message || 'Unknown error';
    console.log(chalk.red(`\n  ✖ Error: ${msg}\n`));
}
