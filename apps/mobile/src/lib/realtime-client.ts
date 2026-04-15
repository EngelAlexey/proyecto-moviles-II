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
  url: string;
  reason?: string;
}

export interface RealtimeEndpoint {
  url: string;
  transport: RealtimeTransport;
}

export interface CreateRealtimeClientOptions {
  url: string;
  transport: RealtimeTransport;
  fallbacks?: RealtimeEndpoint[];
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
  const endpoints = dedupeEndpoints([
    { url: options.url, transport: options.transport },
    ...(options.fallbacks ?? []),
  ]);

  if (endpoints.length === 1) {
    return createTransportClient(options, registry);
  }

  return createFailoverClient(options, registry, endpoints);
}

function dedupeEndpoints(endpoints: RealtimeEndpoint[]): RealtimeEndpoint[] {
  const seen = new Set<string>();

  return endpoints.filter((endpoint) => {
    const key = `${endpoint.transport}:${endpoint.url}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createTransportClient(
  options: CreateRealtimeClientOptions,
  registry: ReturnType<typeof createRegistry>,
): RealtimeClient {
  if (options.transport === 'websocket') {
    return createWebSocketClient(options, registry);
  }

  return createSocketIoClient(options, registry);
}

function createFailoverClient(
  options: CreateRealtimeClientOptions,
  registry: ReturnType<typeof createRegistry>,
  endpoints: RealtimeEndpoint[],
): RealtimeClient {
  let activeClient: RealtimeClient | null = null;
  let currentConnectionId: string | null = null;
  let manualDisconnect = false;
  let attemptVersion = 0;

  const connectToEndpoint = (index: number) => {
    if (manualDisconnect || index >= endpoints.length) {
      activeClient = null;
      currentConnectionId = null;
      return;
    }

    const endpoint = endpoints[index];
    const version = ++attemptVersion;
    let opened = false;
    let advanced = false;

    const advanceToNextEndpoint = () => {
      if (advanced || manualDisconnect || version !== attemptVersion) {
        return;
      }

      advanced = true;
      activeClient?.disconnect(4000, 'Failover');
      activeClient = null;
      currentConnectionId = null;
      connectToEndpoint(index + 1);
    };

    const client = createTransportClient(
      {
        ...options,
        ...endpoint,
        fallbacks: undefined,
        onOpen: (meta) => {
          if (version !== attemptVersion || manualDisconnect) {
            return;
          }

          opened = true;
          activeClient = client;
          currentConnectionId = meta.connectionId;
          options.onOpen?.({
            ...meta,
            url: endpoint.url,
          });
        },
        onClose: (meta) => {
          if (version !== attemptVersion) {
            return;
          }

          currentConnectionId = null;
          options.onClose?.({
            ...meta,
            url: endpoint.url,
          });

          if (!opened) {
            advanceToNextEndpoint();
          }
        },
        onError: (message, cause) => {
          if (version !== attemptVersion) {
            return;
          }

          options.onError?.(`${message} [${endpoint.transport} ${endpoint.url}]`, cause);

          if (!opened) {
            advanceToNextEndpoint();
          }
        },
      },
      registry,
    );

    activeClient = client;
    client.connect();
  };

  return {
    connect: () => {
      manualDisconnect = false;
      currentConnectionId = null;
      activeClient?.disconnect(4000, 'Reconnect');
      activeClient = null;
      connectToEndpoint(0);
    },
    disconnect: (code, reason) => {
      manualDisconnect = true;
      attemptVersion += 1;
      currentConnectionId = null;
      activeClient?.disconnect(code, reason);
      activeClient = null;
    },
    getConnectionId: () => activeClient?.getConnectionId() ?? currentConnectionId,
    on: (event, listener) => registry.on(event, listener),
    send: (event, payload) => {
      if (!activeClient) {
        options.onError?.('No hay un transporte conectado disponible para enviar mensajes.');
        return;
      }

      activeClient.send(event, payload);
    },
  };
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
      url: options.url,
    });
  });

  socket.on('disconnect', (reason) => {
    options.onClose?.({
      transport: 'socket.io',
      connectionId: socket.id ?? null,
      reason,
      url: options.url,
    });
  });

  socket.on('connect_error', (error) => {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    options.onError?.(`No fue posible conectar con Socket.IO${detail}.`, error);
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
        url: options.url,
      });
    };

    socket.onclose = (event: any) => {
      options.onClose?.({
        transport: 'websocket',
        connectionId: null,
        reason: formatWebSocketCloseReason(event),
        url: options.url,
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
