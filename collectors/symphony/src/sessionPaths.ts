import fs from 'fs';
import path from 'path';

const DEFAULT_RUNTIME_ROOT = process.env.ITDASH_RUNTIME_ROOT
  || path.join(process.env.PROGRAMDATA || path.resolve(__dirname, '../../../runtime_data'), 'UAIL', 'itdash');

const LEGACY_RUNTIME_ROOT = path.resolve(__dirname, '../runtime');

export const PROFILE_ROOT = path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'symphony');
export const DEBUG_ROOT = path.join(DEFAULT_RUNTIME_ROOT, 'debug', 'symphony');
export const STORAGE_STATE_PATH = path.join(PROFILE_ROOT, 'symphony-storage-state.json');
export const LEGACY_PROFILE_DIR = path.join(__dirname, '../../edge-profile');
export const LEGACY_STORAGE_STATE_PATH = path.join(LEGACY_RUNTIME_ROOT, 'symphony-storage-state.json');

let prepared = false;

export function prepareRuntimeStorage() {
  if (prepared) {
    return;
  }

  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  fs.mkdirSync(DEBUG_ROOT, { recursive: true });

  if (!fs.existsSync(STORAGE_STATE_PATH) && fs.existsSync(LEGACY_STORAGE_STATE_PATH)) {
    fs.copyFileSync(LEGACY_STORAGE_STATE_PATH, STORAGE_STATE_PATH);
  }

  prepared = true;
}
