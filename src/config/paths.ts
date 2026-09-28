import fs from 'fs';
import path from 'path';
import os from 'os';

export const WORKING_DIR = process.cwd();
export const CONFIG_DIR = path.join(os.homedir(), '.harnessly');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
export const HISTORY_PATH = path.join(CONFIG_DIR, 'history.json');
export const LOG_DIR = path.join(CONFIG_DIR, 'logs');
export const LOG_PATH = path.join(LOG_DIR, `harnessly-${new Date().toISOString().slice(0, 10)}.log`);

export function ensureDir(dir: string = CONFIG_DIR) {
    fs.mkdirSync(dir, { recursive: true });
}
