'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  SocketEvents,
  type GameState,
  type DiceRolledPayload,
  type PlayerJoinedPayload,
  type PairsAssignedPayload,
  type RoundResultPayload,
  type GameUpdatePayload,
  type GameOverPayload,
  type ErrorPayload,
} from '@dado-triple/shared-types';

const SERVER_URL = 'http://localhost:4000';
const ROOM_ID = 'debug-room';

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export default function DebugWebPage() {
  // ── Estado ──────────────────────────────────────────────────────────────
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((entry: string) => {
    setLogs((prev) => [...prev, `[${timestamp()}] ${entry}`]);
  }, []);

  // ── Conexión y Listeners ────────────────────────────────────────────────
  useEffect(() => {
    const s = io(SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    s.on('connect', () => {
      setIsConnected(true);
      addLog(`CONECTADO (id: ${s.id})`);
    });

    s.on('disconnect', (reason) => {
      setIsConnected(false);
      addLog(`DESCONECTADO: ${reason}`);
    });

    // ── Eventos del juego ─────────────────────────────────────────────
    s.on(SocketEvents.PLAYER_JOINED, (data: PlayerJoinedPayload) => {
      addLog(`PLAYER_JOINED: ${data.player.name} (total: ${data.totalPlayers})`);
    });

    s.on(SocketEvents.PLAYER_LEFT, (data: { playerId: string }) => {
      addLog(`PLAYER_LEFT: ${data.playerId}`);
    });

    s.on(SocketEvents.GAME_START, () => {
      addLog('GAME_START');
    });

    s.on(SocketEvents.PAIRS_ASSIGNED, (data: PairsAssignedPayload) => {
      const pairStr = data.pairs
        .map((p) => `${p.player1Id} vs ${p.player2Id}`)
        .join(', ');
      addLog(`PAIRS_ASSIGNED ronda ${data.round}: ${pairStr}${data.bye ? ` | bye: ${data.bye}` : ''}`);
    });

    s.on(SocketEvents.DICE_ROLLED, (data: DiceRolledPayload) => {
      addLog(`DICE_ROLLED: [${data.dice.join(',')}] combo=${data.combo} score=${data.score} (player: ${data.playerId})`);
    });

    s.on(SocketEvents.ROUND_RESULT, (data: RoundResultPayload) => {
      addLog(`ROUND_RESULT: ${data.scores.player1} vs ${data.scores.player2} → ganador: ${data.winnerId ?? 'empate'}`);
    });

    s.on(SocketEvents.GAME_UPDATE, (data: GameUpdatePayload) => {
      setGameState(data.state);
      addLog(`GAME_UPDATE: status=${data.state.status} ronda=${data.state.round} jugadores=${data.state.players.length}`);
    });

    s.on(SocketEvents.GAME_OVER, (data: GameOverPayload) => {
      addLog(`GAME_OVER: ganador=${data.winnerId} scores=${JSON.stringify(data.finalScores)}`);
    });

    s.on(SocketEvents.ERROR, (data: ErrorPayload) => {
      addLog(`ERROR: ${data.message}${data.code ? ` (${data.code})` : ''}`);
    });

    setSocket(s);

    return () => {
      s.removeAllListeners();
      s.close();
    };
  }, [addLog]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Derivar playerId del gameState
  useEffect(() => {
    if (!gameState || !username.trim()) return;
    const me = gameState.players.find((p) => p.name === username.trim());
    if (me && me.id !== playerId) {
      setPlayerId(me.id);
      addLog(`Player ID asignado: ${me.id}`);
    }
  }, [gameState, username, playerId, addLog]);

  // ── Acciones ────────────────────────────────────────────────────────────
  const joinGame = () => {
    if (!socket || !username.trim()) return;
    socket.emit(SocketEvents.JOIN_GAME, { playerName: username.trim(), roomId: ROOM_ID });
    addLog(`→ JOIN_GAME emitido (username: ${username.trim()})`);
  };

  const markReady = () => {
    if (!socket || !playerId) return;
    socket.emit(SocketEvents.PLAYER_READY, { roomId: ROOM_ID, playerId });
    addLog('→ PLAYER_READY emitido');
  };

  const rollDice = () => {
    if (!socket || !playerId) return;
    socket.emit(SocketEvents.ROLL_DICE, { roomId: ROOM_ID, playerId });
    addLog('→ ROLL_DICE emitido');
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-6 font-sans">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-primary mb-2">Dado Triple — Web Debug Console</h1>
        <div className={`inline-block px-4 py-1 rounded-full text-xs font-mono ${isConnected ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-red-900/50 text-red-400 border border-red-700'}`}>
          SOCKET: {isConnected ? 'CONECTADO' : 'DESCONECTADO'} | ID: {socket?.id ?? '—'}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Columna Izquierda: Conexión y Controles */}
        <div className="space-y-6">
          {/* SECCIÓN 1: CONEXIÓN */}
          <section className="bg-[#16213e] p-5 rounded-xl border border-gray-800">
            <h2 className="text-[#e94560] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="bg-[#e94560] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
              Unirse al Juego
            </h2>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Nombre de usuario"
                className="bg-[#0f3460] border border-gray-700 text-white rounded-lg px-4 py-2 outline-none focus:border-[#e94560] transition-colors"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <button
                onClick={joinGame}
                disabled={!isConnected || !username.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 transition-all font-bold py-2 rounded-lg"
              >
                UNIRSE AL JUEGO
              </button>
            </div>
          </section>

          {/* SECCIÓN 2: CONTROLES */}
          {isConnected && playerId && (
            <section className="bg-[#16213e] p-5 rounded-xl border border-gray-800 animate-in fade-in duration-500">
              <h2 className="text-[#e94560] font-bold text-lg mb-4 flex items-center gap-2">
                <span className="bg-[#e94560] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                Controles de Juego
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={markReady}
                  className="bg-green-600 hover:bg-green-500 font-bold py-3 rounded-lg transition-colors shadow-lg"
                >
                  ESTOY LISTO
                </button>
                <button
                  onClick={rollDice}
                  className="bg-amber-600 hover:bg-amber-500 font-bold py-3 rounded-lg transition-colors shadow-lg"
                >
                  LANZAR DADOS
                </button>
              </div>
            </section>
          )}

          {/* SECCIÓN 3: ESTADO CRUDO */}
          <section className="bg-[#16213e] p-5 rounded-xl border border-gray-800 h-[300px] flex flex-col">
            <h2 className="text-[#e94560] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="bg-[#e94560] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
              GameState (raw)
            </h2>
            <div className="bg-[#0a0a1a] rounded-lg p-4 flex-1 overflow-auto font-mono text-[11px] text-green-500 border border-black scrollbar-hide">
              <pre>{gameState ? JSON.stringify(gameState, null, 2) : '(sin estado aún)'}</pre>
            </div>
          </section>
        </div>

        {/* Columna Derecha: Logs */}
        <section className="bg-[#16213e] p-5 rounded-xl border border-gray-800 flex flex-col h-[650px]">
          <h2 className="text-[#e94560] font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-[#e94560] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">4</span>
            Event Logs ({logs.length})
          </h2>
          <div className="bg-[#0a0a1a] rounded-lg p-4 flex-1 overflow-y-auto font-mono text-[11px] text-green-400 border border-black space-y-1">
            {logs.length === 0 ? (
              <div className="text-gray-600 italic">(esperando eventos...)</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="border-b border-gray-900 pb-1">
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
