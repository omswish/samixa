import fs from 'fs';
import path from 'path';

const DEFAULT_RUNTIME_ROOT = process.env.ITDASH_RUNTIME_ROOT
  || path.join(process.env.PROGRAMDATA || path.resolve(__dirname, '../../../runtime_data'), 'UAIL', 'itdash');

const LEGACY_RUNTIME_ROOT = path.resolve(__dirname, '../runtime');

export const PROFILE_ROOT = path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'solarwinds');
export const DEBUG_ROOT = path.join(DEFAULT_RUNTIME_ROOT, 'debug', 'solarwinds');
export const SERVER_PROFILE_DIR = path.join(PROFILE_ROOT, 'solarwinds-servers-profile');
export const NETWORK_PROFILE_DIR = path.join(PROFILE_ROOT, 'solarwinds-networks-profile');
export const SERVER_STORAGE_STATE_PATH = path.join(PROFILE_ROOT, 'solarwinds-servers-storage-state.json');
export const NETWORK_STORAGE_STATE_PATH = path.join(PROFILE_ROOT, 'solarwinds-networks-storage-state.json');
export const LEGACY_SERVER_PROFILE_DIR = path.join(LEGACY_RUNTIME_ROOT, 'solarwinds-servers-profile');
export const LEGACY_NETWORK_PROFILE_DIR = path.join(LEGACY_RUNTIME_ROOT, 'solarwinds-networks-profile');
export const LEGACY_SERVER_STORAGE_STATE_PATH = path.join(LEGACY_RUNTIME_ROOT, 'solarwinds-servers-storage-state.json');
export const LEGACY_NETWORK_STORAGE_STATE_PATH = path.join(LEGACY_RUNTIME_ROOT, 'solarwinds-networks-storage-state.json');

let prepared = false;

function migrateLegacyFile(legacyPath: string, targetPath: string) {
  if (fs.existsSync(targetPath) || !fs.existsSync(legacyPath)) {
    return;
  }

  fs.copyFileSync(legacyPath, targetPath);
}

export function prepareRuntimeStorage() {
  if (prepared) {
    return;
  }

  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  fs.mkdirSync(DEBUG_ROOT, { recursive: true });
  migrateLegacyFile(LEGACY_SERVER_STORAGE_STATE_PATH, SERVER_STORAGE_STATE_PATH);
  migrateLegacyFile(LEGACY_NETWORK_STORAGE_STATE_PATH, NETWORK_STORAGE_STATE_PATH);
  prepared = true;
}
