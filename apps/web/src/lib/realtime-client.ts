import { io, type Socket } from 'socket.io-client';
import {
  SERVER_SOCKET_EVENTS,
  type ClientSocketMessage,
  type ClientSocketEvent,
  type ClientSocketEventMap,
  type ServerSocketEvent,
  type ServerSocketEventMap,
} from '@dado-triple/shared-types';

export interface LifecycleMeta {
  transport: 'websocket' | 'polling';
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
  
  let socket: Socket | null = null;

  const connect = () => {
    if (socket && socket.connected) {
      return;
    }

    socket = io(options.url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      const id = socket?.id || null;
      let transportName = 'websocket';
      if (socket && socket.io && socket.io.engine && socket.io.engine.transport) {
        transportName = socket.io.engine.transport.name;
      }
      
      options.onOpen?.({
        transport: transportName as 'websocket' | 'polling',
        connectionId: id,
      });
    });

    socket.on('disconnect', (reason) => {
      options.onClose?.({
        transport: 'websocket',
        connectionId: null,
        reason: reason,
      });
    });

    socket.on('connect_error', (error) => {
      options.onError?.('No fue posible conectar con el servidor en tiempo real.', error);
    });

    SERVER_SOCKET_EVENTS.forEach((eventName) => {
      socket?.on(eventName, (payload) => {
        registry.emit(eventName, payload);
      });
    });
  };

  return {
    connect,
    disconnect: () => {
      socket?.disconnect();
      socket = null;
    },
    getConnectionId: () => socket?.id || null,
    on: (event, listener) => registry.on(event, listener),
    send: (event, payload) => {
      if (!socket || !socket.connected) {
        options.onError?.('No hay una conexion abierta para enviar mensajes.');
        return;
      }

      socket.emit(event, payload);
    },
  };
}
