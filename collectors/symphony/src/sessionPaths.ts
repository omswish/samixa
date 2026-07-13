import path from 'path';

export const PROFILE_ROOT = path.join(__dirname, '../runtime');
export const DEBUG_ROOT = path.join(PROFILE_ROOT, 'debug');
export const STORAGE_STATE_PATH = path.join(PROFILE_ROOT, 'symphony-storage-state.json');
export const LEGACY_PROFILE_DIR = path.join(__dirname, '../../edge-profile');
