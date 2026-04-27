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
  url: string;
  reason?: string;
}

export interface CreateRealtimeClientOptions {
  url: string;
  connectionTimeoutMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
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
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let isManualDisconnect = false;

  const clearConnectionTimeout = () => {
    if (!connectionTimeout) {
      return;
    }

    clearTimeout(connectionTimeout);
    connectionTimeout = null;
  };

  const clearReconnectTimeout = () => {
    if (!reconnectTimeout) {
      return;
    }

    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  };

  const scheduleReconnect = (reason: string) => {
    if (isManualDisconnect || reconnectTimeout) {
      return;
    }

    const maxReconnectAttempts = options.maxReconnectAttempts ?? 0;
    if (reconnectAttempts >= maxReconnectAttempts) {
      options.onError?.(
        `Se agotaron los intentos de reconexion WebSocket. Ultimo motivo: ${reason}`,
      );
      return;
    }

    reconnectAttempts += 1;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, options.reconnectDelayMs ?? 0);
  };

  const connect = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    isManualDisconnect = false;
    clearConnectionTimeout();

    const nextSocket = new WebSocket(options.url);
    socket = nextSocket;

    const timeoutMs = options.connectionTimeoutMs ?? 0;
    if (timeoutMs > 0) {
      connectionTimeout = setTimeout(() => {
        if (socket === nextSocket && nextSocket.readyState === WebSocket.CONNECTING) {
          options.onError?.('La conexion WebSocket excedio el tiempo limite de espera.');
          nextSocket.close(4000, 'connection-timeout');
        }
      }, timeoutMs);
    }

    nextSocket.onopen = () => {
      clearConnectionTimeout();
      clearReconnectTimeout();
      reconnectAttempts = 0;
      options.onOpen?.({
        transport: 'websocket',
        connectionId: null,
        url: options.url,
      });
    };

    nextSocket.onclose = (event: any) => {
      if (socket === nextSocket) {
        socket = null;
      }

      clearConnectionTimeout();

      const reason = formatWebSocketCloseReason(event);
      options.onClose?.({
        transport: 'websocket',
        connectionId: null,
        reason,
        url: options.url,
      });

      scheduleReconnect(reason);
    };

    nextSocket.onerror = (event: any) => {
      options.onError?.('No fue posible conectar con el WebSocket nativo.', event);
    };

    nextSocket.onmessage = (event: any) => {
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
      isManualDisconnect = true;
      clearConnectionTimeout();
      clearReconnectTimeout();

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

function formatWebSocketCloseReason(event: { code?: number; reason?: string } | undefined): string {
  if (!event) {
    return 'closed';
  }

  if (event.reason) {
    return `code ${event.code ?? 'unknown'}: ${event.reason}`;
  }

  if (typeof event.code === 'number') {
    return `code ${event.code}`;
  }

  return 'closed';
}
