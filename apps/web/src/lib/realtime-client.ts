import { io, type Socket as SocketIOSocket } from 'socket.io-client';
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
  onConnectionId?: (connectionId: string) => void;
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

export function createRealtimeClient(
  options: CreateRealtimeClientOptions,
  transport = 'WEBSOCKET',
): RealtimeClient {
  const registry = createRegistry();
  if (transport.toUpperCase() === 'SOCKET.IO') {
    return createSocketIOClient(options, registry);
  }
  return createWebSocketClient(options, registry);
}

// ─── Socket.IO transport ──────────────────────────────────────────────────────

function createSocketIOClient(
  options: CreateRealtimeClientOptions,
  registry: ReturnType<typeof createRegistry>,
): RealtimeClient {
  let socket: SocketIOSocket | null = null;
  let connectionId: string | null = null;

  const connect = () => {
    if (socket?.connected) return;

    socket = io(options.url, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      connectionId = socket?.id ?? null;
      if (connectionId) {
        options.onConnectionId?.(connectionId);
      }
      options.onOpen?.({ transport: 'websocket', connectionId });
    });

    socket.on('disconnect', (reason) => {
      options.onClose?.({ transport: 'websocket', connectionId, reason });
      connectionId = null;
    });

    socket.on('connect_error', (err) => {
      options.onError?.('No fue posible conectar con Socket.IO.', err);
    });

    for (const event of SERVER_SOCKET_EVENTS) {
      socket.on(event, (payload: ServerSocketEventMap[typeof event]) => {
        registry.emit(event as ServerSocketEvent, payload);
      });
    }
  };

  return {
    connect,
    disconnect: () => {
      socket?.disconnect();
      socket = null;
    },
    getConnectionId: () => connectionId,
    on: (event, listener) => registry.on(event, listener),
    send: (event, payload) => {
      if (!socket?.connected) {
        options.onError?.('No hay una conexion Socket.IO abierta para enviar mensajes.');
        return;
      }
      socket.emit(event, payload);
    },
  };
}

// ─── WebSocket nativo transport ───────────────────────────────────────────────

function createWebSocketClient(
  options: CreateRealtimeClientOptions,
  registry: ReturnType<typeof createRegistry>,
): RealtimeClient {
  let socket: WebSocket | null = null;
  let connectionId: string | null = null;

  const connect = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    socket = new WebSocket(options.url);

    socket.onopen = () => {
      options.onOpen?.({ transport: 'websocket', connectionId: null });
    };

    socket.onclose = (event) => {
      options.onClose?.({
        transport: 'websocket',
        connectionId,
        reason: event.reason || 'closed',
      });
      connectionId = null;
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

      if (parsed.event === 'connection_ack') {
        const payload = parsed.payload as { connectionId?: unknown };
        if (typeof payload.connectionId === 'string' && payload.connectionId.trim()) {
          connectionId = payload.connectionId;
          options.onConnectionId?.(connectionId);
        }
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
    getConnectionId: () => connectionId,
    on: (event, listener) => registry.on(event, listener),
    send: (event, payload) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        options.onError?.('No hay una conexion WebSocket abierta para enviar mensajes.');
        return;
      }
      socket.send(serializeSocketMessage({ event, payload } as ClientSocketMessage));
    },
  };
}
