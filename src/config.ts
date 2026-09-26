import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProviderConfig } from './ui';

const CONFIG_DIR = path.join(os.homedir(), '.coding-agent');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const HISTORY_PATH = path.join(CONFIG_DIR, 'history.json');

function ensureDir() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// ─── Config ──────────────────────────────────────────────

export function getConfig(): ProviderConfig | null {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch {
        // corrupted config — treat as missing
    }
    return null;
}

export function saveConfig(config: ProviderConfig) {
    ensureDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function deleteConfig() {
    try { fs.unlinkSync(CONFIG_PATH); } catch {}
}

// ─── Session History (optional persistence) ──────────────

export function getHistory(): string[] {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
        }
    } catch {}
    return [];
}

export function appendHistory(entry: string) {
    ensureDir();
    const history = getHistory();
    history.push(entry);
    // keep last 100 entries
    const trimmed = history.slice(-100);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2));
}

export function getConfigDir() {
    return CONFIG_DIR;
}

export function clearHistory() {
    try { fs.unlinkSync(HISTORY_PATH); } catch {}
}
