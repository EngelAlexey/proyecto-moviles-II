'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import {
  CONNECTION_TIMEOUT_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY_MS,
  SERVER_URL,
} from '../constants/config';
import {
  createRealtimeClient,
  type LifecycleMeta,
  type RealtimeClient,
} from '../lib/realtime-client';

export interface RealtimeContextValue {
  client: RealtimeClient | null;
  isConnected: boolean;
  connectionError: string | null;
}

export const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

export interface RealtimeProviderProps {
  children: ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [client, setClient] = useState<RealtimeClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const rtClient = createRealtimeClient({
      url: SERVER_URL,
      connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
      reconnectDelayMs: RECONNECT_DELAY_MS,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      onOpen: (): void => {
        setIsConnected(true);
        setConnectionError(null);
        console.log('[Realtime] Connected to server');
      },
      onClose: (meta: LifecycleMeta): void => {
        setIsConnected(false);
        console.log('[Realtime] Disconnected:', meta.reason);
      },
      onError: (message, cause): void => {
        setConnectionError(message);
        console.error('[Realtime] Error:', message, cause);
      },
    });

    setClient(rtClient);
    rtClient.connect();

    return () => {
      rtClient.disconnect();
    };
  }, []);

  const value: RealtimeContextValue = {
    client,
    isConnected,
    connectionError,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeContext() {
  const context = React.useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtimeContext must be used within RealtimeProvider');
  }
  return context;
}
