import type {
  ServerSocketEvent,
  ServerSocketEventMap,
} from '@dado-triple/shared-types';

/**
 * Utilidad para tipear eventos socket de forma segura
 */
export function createTypedEventHandler<Event extends ServerSocketEvent>(
  event: Event,
) {
  return {
    event,
    handler: (payload: ServerSocketEventMap[Event]) => {
      // Handler function
    },
  };
}

/**
 * Validar que un payload coincida con el tipo esperado
 */
export function validateSocketPayload<Event extends ServerSocketEvent>(
  event: Event,
  payload: unknown,
): payload is ServerSocketEventMap[Event] {
  return typeof payload === 'object' && payload !== null;
}
