import path from 'path';

export const PROFILE_ROOT = path.join(__dirname, '../runtime');
export const SERVER_PROFILE_DIR = path.join(PROFILE_ROOT, 'solarwinds-servers-profile');
export const NETWORK_PROFILE_DIR = path.join(PROFILE_ROOT, 'solarwinds-networks-profile');
export const SERVER_STORAGE_STATE_PATH = path.join(PROFILE_ROOT, 'solarwinds-servers-storage-state.json');
export const NETWORK_STORAGE_STATE_PATH = path.join(PROFILE_ROOT, 'solarwinds-networks-storage-state.json');
