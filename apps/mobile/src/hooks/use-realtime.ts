import { useRealtimeContext } from '../context/realtime-context';

/**
 * Hook to access RealtimeClient
 */
export function useRealtime() {
  const { client, isConnected, connectionError } = useRealtimeContext();

  return {
    client,
    isConnected,
    connectionError,
  };
}
