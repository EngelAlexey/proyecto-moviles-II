const DEFAULT_REALTIME_URL = 'ws://3.142.78.130:5000';
const DEFAULT_REALTIME_TRANSPORT = 'websocket';

function normalizeTransportLabel(value: string | undefined): string {
  return (value ?? DEFAULT_REALTIME_TRANSPORT).trim().toUpperCase();
}

// Cambios futuros del host realtime:
// 1. apps/mobile/.env         -> valor local real
// 2. apps/mobile/.env.example -> referencia compartida
// 3. No editar App.tsx para rotaciones normales de IP
export const REALTIME_SERVER_URL =
  process.env.EXPO_PUBLIC_REALTIME_URL?.trim() || DEFAULT_REALTIME_URL;

export const REALTIME_TRANSPORT_LABEL = normalizeTransportLabel(
  process.env.EXPO_PUBLIC_REALTIME_TRANSPORT,
);
