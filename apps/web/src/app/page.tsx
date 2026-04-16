'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SocketEvents,
  type DiceRolledPayload,
  type ErrorPayload,
  type GameOverPayload,
  type GameState,
  type GameUpdatePayload,
  type PairsAssignedPayload,
  type PlayerJoinedPayload,
  type RealtimeTransport,
  type RoomCreatedPayload,
  type RoomSummary,
  type RoomsListPayload,
  type RoundResultPayload,
} from '@dado-triple/shared-types';
import { createRealtimeClient, type RealtimeClient } from '@/lib/realtime-client';

const REALTIME_TRANSPORT: RealtimeTransport =
  process.env.NEXT_PUBLIC_REALTIME_TRANSPORT === 'socket.io' ? 'socket.io' : 'websocket';
const DEFAULT_SERVER_URL =
  REALTIME_TRANSPORT === 'websocket' ? 'ws://18.218.158.112:5000' : 'http://18.218.158.112:4000';
const SERVER_URL =
  normalizeRealtimeUrl(
    REALTIME_TRANSPORT,
    process.env.NEXT_PUBLIC_REALTIME_URL ?? DEFAULT_SERVER_URL,
  );

function normalizeRealtimeUrl(transport: RealtimeTransport, rawUrl: string): string {
  const url = rawUrl.trim();

  if (transport === 'websocket') {
    if (url.startsWith('http://')) {
      return `ws://${url.slice('http://'.length)}`;
    }

    if (url.startsWith('https://')) {
      return `wss://${url.slice('https://'.length)}`;
    }

    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return url;
    }

    if (url.startsWith('ws:')) {
      return `ws://${url.slice('ws:'.length).replace(/^\/+/, '')}`;
    }

    if (url.startsWith('wss:')) {
      return `wss://${url.slice('wss:'.length).replace(/^\/+/, '')}`;
    }

    return `ws://${url.replace(/^\/+/, '')}`;
  }

  if (url.startsWith('ws://')) {
    return `http://${url.slice('ws://'.length)}`;
  }

  if (url.startsWith('wss://')) {
    return `https://${url.slice('wss://'.length)}`;
  }

  if (url.startsWith('socket.io://')) {
    return `http://${url.slice('socket.io://'.length)}`;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return `http://${url.replace(/^\/+/, '')}`;
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export default function ObserverWebPage() {
  const [socket, setSocket] = useState<RealtimeClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [observedRoomId, setObservedRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const pendingAutoObserveCreatedRoomRef = useRef(false);

  const addLog = useCallback((entry: string) => {
    setLogs((prev) => [...prev, `[${timestamp()}] ${entry}`]);
  }, []);

  const requestRooms = useCallback(
    (client: RealtimeClient) => {
      client.send(SocketEvents.LIST_ROOMS, { includeFinished: true });
      addLog('-> LIST_ROOMS emitido');
    },
    [addLog],
  );

  const joinAsObserver = useCallback(
    (nextRoomId: string, clientOverride?: RealtimeClient) => {
      const activeClient = clientOverride ?? socket;
      const normalizedRoomId = nextRoomId.trim();

      if (!activeClient || !normalizedRoomId) {
        return;
      }

      setRoomId(normalizedRoomId);
      setObservedRoomId(normalizedRoomId);
      setGameState(null);
      activeClient.send(SocketEvents.JOIN_AS_OBSERVER, { roomId: normalizedRoomId });
      addLog(`-> JOIN_AS_OBSERVER emitido (sala: ${normalizedRoomId})`);
    },
    [addLog, socket],
  );

  // TEMP QA WEB ONLY:
  // Este handler existe solo para pruebas mientras no se tenga la app mobile disponible.
  // En la entrega final, la web NO debe crear salas. Para volver al comportamiento final:
  // 1. Eliminar esta funcion.
  // 2. Eliminar el ref `pendingAutoObserveCreatedRoomRef`.
  // 3. Eliminar el listener `SocketEvents.ROOM_CREATED`.
  // 4. Eliminar el boton "CREAR SALA (PRUEBA)" del JSX.
  const createRoomForTesting = useCallback(() => {
    if (!socket || !isConnected) {
      return;
    }

    pendingAutoObserveCreatedRoomRef.current = true;
    socket.send(SocketEvents.CREATE_ROOM, {
      roomId: roomId.trim() || undefined,
    });
    addLog(
      `-> CREATE_ROOM emitido desde web (modo temporal de prueba)${
        roomId.trim() ? ` | roomId=${roomId.trim()}` : ''
      }`,
    );
  }, [addLog, isConnected, roomId, socket]);

  useEffect(() => {
    const client = createRealtimeClient({
      url: SERVER_URL,
      transport: REALTIME_TRANSPORT,
      onOpen: ({ connectionId: nextConnectionId, transport }) => {
        setIsConnected(true);
        setConnectionId(nextConnectionId);
        addLog(`CONECTADO via ${transport}${nextConnectionId ? ` (id: ${nextConnectionId})` : ''}`);
        requestRooms(client);
      },
      onClose: ({ reason, transport }) => {
        setIsConnected(false);
        setConnectionId(null);
        addLog(`DESCONECTADO via ${transport}: ${reason ?? 'sin detalle'}`);
      },
      onError: (message) => {
        addLog(`ERROR DE CONEXION: ${message}`);
      },
    });

    const unsubscribers = [
      // TEMP QA WEB ONLY:
      // Este listener permite que la web cree una sala y se meta como observador
      // automaticamente para pruebas de integracion. En la entrega final debe eliminarse
      // junto con `createRoomForTesting` y el boton de crear sala.
      client.on(SocketEvents.ROOM_CREATED, (data: RoomCreatedPayload) => {
        setRoomId(data.room.roomId);
        setRooms((currentRooms) => {
          const nextRooms = currentRooms.filter((room) => room.roomId !== data.room.roomId);
          nextRooms.unshift(data.room);
          return nextRooms;
        });
        addLog(`ROOM_CREATED: ${data.room.roomId}`);

        if (pendingAutoObserveCreatedRoomRef.current) {
          pendingAutoObserveCreatedRoomRef.current = false;
          joinAsObserver(data.room.roomId, client);
        }
      }),
      client.on(SocketEvents.ROOMS_LIST, (data: RoomsListPayload) => {
        setRooms(data.rooms);
        addLog(`ROOMS_LIST: ${data.rooms.length} sala(s) disponibles`);
      }),
      client.on(SocketEvents.PLAYER_JOINED, (data: PlayerJoinedPayload) => {
        addLog(`PLAYER_JOINED: ${data.player.name} (total: ${data.totalPlayers})`);
      }),
      client.on(SocketEvents.PLAYER_LEFT, (data: { playerId: string }) => {
        addLog(`PLAYER_LEFT: ${data.playerId}`);
      }),
      client.on(SocketEvents.GAME_START, () => {
        addLog('GAME_START');
      }),
      client.on(SocketEvents.PAIRS_ASSIGNED, (data: PairsAssignedPayload) => {
        const pairStr = data.pairs
          .map((pair) => `${pair.player1Id} vs ${pair.player2Id}`)
          .join(', ');
        addLog(
          `PAIRS_ASSIGNED ronda ${data.round}: ${pairStr}${data.bye ? ` | bye: ${data.bye}` : ''}`,
        );
      }),
      client.on(SocketEvents.DICE_ROLLED, (data: DiceRolledPayload) => {
        addLog(
          `DICE_ROLLED: [${data.dice.join(',')}] combo=${data.combo} score=${data.score} (player: ${data.playerId})`,
        );
      }),
      client.on(SocketEvents.ROUND_RESULT, (data: RoundResultPayload) => {
        addLog(
          `ROUND_RESULT: ${data.scores.player1} vs ${data.scores.player2} -> ganador: ${data.winnerId ?? 'empate'}`,
        );
      }),
      client.on(SocketEvents.GAME_UPDATE, (data: GameUpdatePayload) => {
        setGameState(data.state);
        addLog(
          `GAME_UPDATE: status=${data.state.status} ronda=${data.state.round} jugadores=${data.state.players.length}`,
        );
      }),
      client.on(SocketEvents.GAME_OVER, (data: GameOverPayload) => {
        addLog(`GAME_OVER: ganador=${data.winnerId} scores=${JSON.stringify(data.finalScores)}`);
      }),
      client.on(SocketEvents.ERROR, (data: ErrorPayload) => {
        addLog(`ERROR: ${data.message}${data.code ? ` (${data.code})` : ''}`);
      }),
    ];

    client.connect();
    setSocket(client);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      client.disconnect(1000, 'Component unmounted');
    };
  }, [addLog, requestRooms]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-6 font-sans">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2">Dado Triple - Web Observer Console</h1>
        <div
          className={`inline-block px-4 py-1 rounded-full text-xs font-mono ${
            isConnected
              ? 'bg-green-900/50 text-green-400 border border-green-700'
              : 'bg-red-900/50 text-red-400 border border-red-700'
          }`}
        >
          SOCKET: {isConnected ? 'CONECTADO' : 'DESCONECTADO'} | ROL: OBSERVER | SALA:{' '}
          {observedRoomId ?? '-'} | MODO: {REALTIME_TRANSPORT.toUpperCase()} | ID:{' '}
          {connectionId ?? '-'}
        </div>
        <div className="mt-2 text-xs text-slate-400 font-mono">URL activa: {SERVER_URL}</div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 max-w-7xl mx-auto">
        <div className="space-y-6">
          <section className="bg-[#16213e] p-5 rounded-xl border border-gray-800">
            <h2 className="text-[#e94560] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="bg-[#e94560] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
              Salas disponibles
            </h2>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Codigo de sala"
                  className="flex-1 bg-[#0f3460] border border-gray-700 text-white rounded-lg px-4 py-2 outline-none focus:border-[#e94560] transition-colors"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                />
                <button
                  // TEMP QA WEB ONLY:
                  // Borrar este boton en la entrega final para que la web vuelva a ser solo observador.
                  onClick={createRoomForTesting}
                  disabled={!socket || !isConnected}
                  className="bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  CREAR SALA (PRUEBA)
                </button>
                <button
                  onClick={() => socket && requestRooms(socket)}
                  disabled={!socket || !isConnected}
                  className="bg-slate-700 hover:bg-slate-600 disabled:bg-gray-700 disabled:text-gray-500 font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  ACTUALIZAR
                </button>
                <button
                  onClick={() => joinAsObserver(roomId)}
                  disabled={!socket || !isConnected || !roomId.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  OBSERVAR
                </button>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                La web solo observa. Puede listar salas existentes, entrar como observador y
                ver el estado en tiempo real, pero no ejecutar acciones de juego.
              </p>
              <p className="text-xs text-amber-300 font-mono">
                Modo temporal de prueba: la web puede crear sala solo para validar el socket
                mientras no se tenga disponible la app mobile.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {rooms.length === 0 ? (
                <div className="col-span-full rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                  No hay salas listadas todavia. Crea una desde mobile o pulsa actualizar.
                </div>
              ) : (
                rooms.map((room) => (
                  <article
                    key={room.roomId}
                    className="rounded-xl border border-slate-700 bg-[#0f3460] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-white">{room.roomId}</h3>
                        <p className="text-xs text-slate-300 font-mono">
                          estado={room.status} round={room.round}/{room.maxRounds}
                        </p>
                      </div>
                      <button
                        onClick={() => joinAsObserver(room.roomId)}
                        disabled={!socket || !isConnected}
                        className="rounded-lg bg-[#e94560] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#ff5f79] disabled:bg-gray-700 disabled:text-gray-500"
                      >
                        VER PARTIDA
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-200">
                      <div className="rounded-lg bg-[#16213e] px-3 py-2">
                        Jugadores: {room.playerCount}
                      </div>
                      <div className="rounded-lg bg-[#16213e] px-3 py-2">
                        Observadores: {room.observerCount}
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-300">
                      {room.playerNames.length > 0
                        ? `Jugadores: ${room.playerNames.join(', ')}`
                        : 'Aun no hay jugadores en la sala.'}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="bg-[#16213e] p-5 rounded-xl border border-gray-800 h-[320px] flex flex-col">
            <h2 className="text-[#e94560] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="bg-[#e94560] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
              Estado observado
            </h2>
            <div className="bg-[#0a0a1a] rounded-lg p-4 flex-1 overflow-auto font-mono text-[11px] text-green-500 border border-black">
              <pre>{gameState ? JSON.stringify(gameState, null, 2) : '(sin estado aun)'}</pre>
            </div>
          </section>
        </div>

        <section className="bg-[#16213e] p-5 rounded-xl border border-gray-800 flex flex-col h-[720px]">
          <h2 className="text-[#e94560] font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-[#e94560] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
            Event Logs ({logs.length})
          </h2>
          <div className="bg-[#0a0a1a] rounded-lg p-4 flex-1 overflow-y-auto font-mono text-[11px] text-green-400 border border-black space-y-1">
            {logs.length === 0 ? (
              <div className="text-gray-600 italic">(esperando eventos...)</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="border-b border-gray-900 pb-1">
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
