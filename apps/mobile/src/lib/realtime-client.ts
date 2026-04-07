import { io, type Socket } from 'socket.io-client';
import {
  SERVER_SOCKET_EVENTS,
  parseSocketMessage,
  serializeSocketMessage,
  type ClientSocketMessage,
  type ClientSocketEvent,
  type ClientSocketEventMap,
  type RealtimeTransport,
  type ServerSocketEvent,
  type ServerSocketEventMap,
} from '@dado-triple/shared-types';

export interface LifecycleMeta {
  transport: RealtimeTransport;
  connectionId: string | null;
  reason?: string;
}

export interface CreateRealtimeClientOptions {
  url: string;
  transport: RealtimeTransport;
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

  if (options.transport === 'websocket') {
    return createWebSocketClient(options, registry);
  }

  return createSocketIoClient(options, registry);
}

function createSocketIoClient(
  options: CreateRealtimeClientOptions,
  registry: ReturnType<typeof createRegistry>,
): RealtimeClient {
  const socket: Socket = io(options.url, {
    transports: ['websocket'],
    autoConnect: false,
  });

  socket.on('connect', () => {
    options.onOpen?.({
      transport: 'socket.io',
      connectionId: socket.id ?? null,
    });
  });

  socket.on('disconnect', (reason) => {
    options.onClose?.({
      transport: 'socket.io',
      connectionId: socket.id ?? null,
      reason,
    });
  });

  socket.on('connect_error', (error) => {
    options.onError?.('No fue posible conectar con Socket.IO.', error);
  });

  for (const event of SERVER_SOCKET_EVENTS) {
    socket.on(event, (payload) => {
      registry.emit(event, payload as never);
    });
  }

  return {
    connect: () => socket.connect(),
    disconnect: () => socket.disconnect(),
    getConnectionId: () => socket.id ?? null,
    on: (event, listener) => registry.on(event, listener),
    send: (event, payload) => {
      socket.emit(event, payload);
    },
  };
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

    socket = new WebSocket(options.url);

    socket.onopen = () => {
      options.onOpen?.({
        transport: 'websocket',
        connectionId: null,
      });
    };

    socket.onclose = (event: any) => {
      options.onClose?.({
        transport: 'websocket',
        connectionId: null,
        reason: event?.reason || 'closed',
      });
    };

    socket.onerror = (event: any) => {
      options.onError?.('No fue posible conectar con el WebSocket nativo.', event);
    };

    socket.onmessage = (event: any) => {
      const raw = typeof event?.data === 'string' ? event.data : String(event?.data);
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
