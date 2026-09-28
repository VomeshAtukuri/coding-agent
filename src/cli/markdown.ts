import chalk from 'chalk';

export function formatMarkdown(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];

    let inCodeBlock = false;

    for (const line of lines) {
        // Code block fences
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                inCodeBlock = false;
                result.push(chalk.dim('  ──────────────────────────────'));
            } else {
                inCodeBlock = true;
                result.push(chalk.dim('  ──────────────────────────────'));
            }
            continue;
        }

        if (inCodeBlock) {
            result.push(chalk.dim('  ' + line));
            continue;
        }

        // Headers
        if (/^#{1,3}\s/.test(line)) {
            const level = line.match(/^(#{1,3})/)?.[1].length ?? 1;
            const content = line.replace(/^#{1,3}\s/, '');
            if (level === 1) {
                result.push(chalk.bold.cyan(formatInline(content)));
            } else {
                result.push(chalk.bold(formatInline(content)));
            }
            continue;
        }

        // Bullet points (- or *)
        if (/^\s*[-*]\s/.test(line)) {
            const content = line.replace(/^\s*[-*]\s/, '');
            result.push(`  ${chalk.gray('•')} ${formatInline(content)}`);
            continue;
        }

        // Numbered lists
        if (/^\s*\d+\.\s/.test(line)) {
            const num = line.match(/^\s*(\d+)\./)?.[1] ?? '';
            const content = line.replace(/^\s*\d+\.\s/, '');
            result.push(`  ${chalk.gray(num + '.')} ${formatInline(content)}`);
            continue;
        }

        // Empty line
        if (line.trim() === '') {
            result.push('');
            continue;
        }

        // Regular text
        result.push(formatInline(line));
    }

    return result.join('\n');
}

function formatInline(text: string): string {
    return text
        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, (_, m) => chalk.bold(m))
        .replace(/__(.+?)__/g, (_, m) => chalk.bold(m))
        // Italic: *text* or _text_
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, m) => chalk.italic(m))
        // Inline code: `code`
        .replace(/`(.+?)`/g, (_, m) => chalk.cyan(m))
        // Links: [text](url)
        .replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => `${chalk.blue.underline(label)} ${chalk.gray(`(${url})`)}`);
}
