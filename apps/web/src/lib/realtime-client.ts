import {
  SERVER_SOCKET_EVENTS,
  parseSocketMessage,
  serializeSocketMessage,
  type ClientSocketMessage,
  type ClientSocketEvent,
  type ClientSocketEventMap,
  type ServerSocketEvent,
  type ServerSocketEventMap,
} from '@dado-triple/shared-types';

export interface LifecycleMeta {
  transport: 'websocket';
  connectionId: string | null;
  reason?: string;
}

export interface CreateRealtimeClientOptions {
  url: string;
  onOpen?: (meta: LifecycleMeta) => void;
  onClose?: (meta: LifecycleMeta) => void;
  onError?: (message: string, cause?: unknown) => void;
}

export interface RealtimeClient {
  connect: () => void;
  disconnect: (code?: number, reason?: string) => void;
  getConnectionId: () => string | null;
  on: <Event extends ServerSocketEvent>(
    event: Event,
    listener: (payload: ServerSocketEventMap[Event]) => void,
  ) => () => void;
  send: <Event extends ClientSocketEvent>(
    event: Event,
    payload: ClientSocketEventMap[Event],
  ) => void;
}

function createRegistry() {
  const listeners = new Map<ServerSocketEvent, Set<(payload: unknown) => void>>();

  return {
    emit<Event extends ServerSocketEvent>(event: Event, payload: ServerSocketEventMap[Event]) {
      listeners.get(event)?.forEach((listener) => {
        listener(payload);
      });
    },
    on<Event extends ServerSocketEvent>(
      event: Event,
      listener: (payload: ServerSocketEventMap[Event]) => void,
    ) {
      const eventListeners = listeners.get(event) ?? new Set<(payload: unknown) => void>();
      eventListeners.add(listener as (payload: unknown) => void);
      listeners.set(event, eventListeners);

      return () => {
        eventListeners.delete(listener as (payload: unknown) => void);
      };
    },
  };
}

export function createRealtimeClient(options: CreateRealtimeClientOptions): RealtimeClient {
  const registry = createRegistry();
  return createWebSocketClient(options, registry);
}

function createWebSocketClient(
  options: CreateRealtimeClientOptions,
  registry: ReturnType<typeof createRegistry>,
): RealtimeClient {
  let socket: WebSocket | null = null;

  const connect = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      socket = new WebSocket(options.url);
    } catch (error) {
      socket = null;
      options.onError?.(
        `No fue posible inicializar el WebSocket para ${options.url}.`,
        error,
      );
      return;
    }

    socket.onopen = () => {
      options.onOpen?.({
        transport: 'websocket',
        connectionId: null,
      });
    };

    socket.onclose = (event) => {
      options.onClose?.({
        transport: 'websocket',
        connectionId: null,
        reason: event.reason || 'closed',
      });
    };

    socket.onerror = (event) => {
      options.onError?.('No fue posible conectar con el WebSocket nativo.', event);
    };

    socket.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      const parsed = parseSocketMessage(raw);

      if (!parsed) {
        options.onError?.('Se recibio un mensaje WebSocket invalido.', raw);
        return;
      }

      if (!SERVER_SOCKET_EVENTS.includes(parsed.event as ServerSocketEvent)) {
        return;
      }

      registry.emit(
        parsed.event as ServerSocketEvent,
        parsed.payload as ServerSocketEventMap[ServerSocketEvent],
      );
    };
  };

  return {
    connect,
    disconnect: (code, reason) => {
      socket?.close(code, reason);
      socket = null;
    },
    getConnectionId: () => null,
    on: (event, listener) => registry.on(event, listener),
    send: (event, payload) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        options.onError?.('No hay una conexion WebSocket abierta para enviar mensajes.');
        return;
      }

      const message = {
        event,
        payload,
      } as ClientSocketMessage;

      socket.send(serializeSocketMessage(message));
    },
  };
}
