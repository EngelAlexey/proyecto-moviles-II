import { useEffect } from 'react';
import { useRealtime } from './use-realtime';
import type { ServerSocketEvent, ServerSocketEventMap } from '@dado-triple/shared-types';

/**
 * Hook to listen to socket events with automatic cleanup
 */
export function useSocketEvents<Event extends ServerSocketEvent>(
  event: Event,
  handler: (payload: ServerSocketEventMap[Event]) => void,
) {
  const { client } = useRealtime();

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.on(event, handler);

    return () => {
      unsubscribe();
    };
  }, [client, event, handler]);
}
