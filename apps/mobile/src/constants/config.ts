import { REALTIME_SERVER_URL } from '../lib/realtime-config';

export const SERVER_URL = REALTIME_SERVER_URL;
export const CONNECTION_TIMEOUT_MS = 30000;
export const RECONNECT_DELAY_MS = 3000;
export const MAX_RECONNECT_ATTEMPTS = 10;
export const STORAGE_KEYS = {
  PLAYER_NAME: 'dado_triple_player_name',
};
