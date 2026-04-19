'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Gamepad2,
  Wifi,
  WifiOff,
  Server,
  Plus,
  RefreshCw,
  Eye,
  Activity,
  Terminal,
  Users,
  Swords,
  Hash,
  X,
  Dices,
  Trophy,
  Clock,
  UserCheck
} from 'lucide-react';
import {
  SocketEvents,
  type DiceRolledPayload,
  type ErrorPayload,
  type GameOverPayload,
  type GameState,
  type GameUpdatePayload,
  type PairsAssignedPayload,
  type PlayerJoinedPayload,
  type RoomCreatedPayload,
  type RoomSummary,
  type RoomsListPayload,
  type RoundResultPayload,
} from '@dado-triple/shared-types';
import { createRealtimeClient, type RealtimeClient } from '@/lib/realtime-client';

const SERVER_URL = 'ws://18.218.158.112:5000';
const REALTIME_TRANSPORT_LABEL = 'WEBSOCKET';

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export default function ObserverWebPage() {
  const [socket, setSocket] = useState<RealtimeClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [observedRoomId, setObservedRoomId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const logsContainerRef = useRef<HTMLDivElement>(null);
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
      setIsModalOpen(true);
      setGameState(null);
      activeClient.send(SocketEvents.JOIN_AS_OBSERVER, { roomId: normalizedRoomId });
      addLog(`-> JOIN_AS_OBSERVER emitido (sala: ${normalizedRoomId})`);
    },
    [addLog, socket],
  );

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
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTo({
        top: logsContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [logs]);

  const closeObserverModal = () => {
    setIsModalOpen(false);
    // Maintain observation state in background or reset it based on preference
  };

  return (
    <div className="min-h-screen bg-[#0b1021] text-[#faf9f6] p-4 lg:p-10 font-sans selection:bg-[#b026ff]/40 relative overflow-hidden flex flex-col">
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#b026ff] rounded-full blur-[200px] opacity-15 pointer-events-none animate-pulse"></div>
      <div className="absolute -bottom-32 -right-32 w-[700px] h-[700px] bg-[#00ff88] rounded-full blur-[200px] opacity-10 pointer-events-none transition-opacity duration-1000"></div>

      <header className="mb-12 text-center relative z-10 flex flex-col items-center justify-center animate-[fadeIn_0.5s_ease-out]">
        <div className="inline-flex items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 shadow-[0_0_30px_rgba(176,38,255,0.2)] mb-6 backdrop-blur-xl group cursor-default">
          <Gamepad2 className="w-10 h-10 text-[#b026ff] group-hover:scale-110 group-hover:text-[#faf9f6] transition-all duration-500 mr-4 drop-shadow-[0_0_10px_rgba(176,38,255,0.5)]" />
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#faf9f6] to-[#b026ff] tracking-tight">
            Dado Triple
          </h1>
        </div>
        <div className="w-full flex justify-center mt-2">
          <div
            className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-full text-sm font-bold backdrop-blur-md border ${
              isConnected
                ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30 shadow-[0_0_20px_rgba(0,255,136,0.2)]'
                : 'bg-red-500/10 text-red-400 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
            } transition-all duration-300`}
          >
            {isConnected ? <Wifi className="w-4 h-4 animate-pulse" /> : <WifiOff className="w-4 h-4" />}
            <span className="tracking-widest uppercase">
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
            <span className="opacity-50 mx-1">|</span>
            <span className="text-[#faf9f6]/90 font-mono">{connectionId ?? 'N/A'}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 max-w-[1500px] mx-auto w-full relative z-10 flex-1">
        <div className="xl:col-span-8 flex flex-col gap-8">
          <section className="bg-[#0f152d]/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-[#b026ff]/30 hover:shadow-[0_0_40px_rgba(176,38,255,0.15)] flex flex-col h-full group">
            <div className="flex flex-col mb-8">
              <h2 className="text-[#b026ff] font-bold text-2xl flex items-center gap-3 drop-shadow-[0_0_8px_rgba(176,38,255,0.5)] tracking-wide">
                <Server className="w-7 h-7 text-[#faf9f6]" />
                Directorio de Servidores
              </h2>
            </div>
            
            <div className="flex flex-col lg:flex-row gap-4 mb-8">
               <div className="relative flex-1 group/input">
                 <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within/input:text-[#b026ff] transition-colors" />
                 <input
                  type="text"
                  placeholder="ID de conexión remota"
                  className="w-full bg-[#0a0e20] border border-white/10 text-[#faf9f6] rounded-xl pl-12 pr-4 py-4 outline-none focus:border-[#b026ff] focus:ring-1 focus:ring-[#b026ff] transition-all placeholder-white/30 font-bold tracking-wider"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 lg:flex gap-3">
                <button
                  onClick={createRoomForTesting}
                  disabled={!socket || !isConnected}
                  className="bg-[#0a0e20] hover:bg-[#b026ff]/20 text-[#b026ff] border border-[#b026ff]/40 disabled:opacity-40 disabled:cursor-not-allowed font-bold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(176,38,255,0.3)] hover:-translate-y-1"
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden md:inline">CREAR</span>
                </button>
                <button
                  onClick={() => socket && requestRooms(socket)}
                  disabled={!socket || !isConnected}
                  className="bg-[#0a0e20] hover:bg-white/10 text-[#faf9f6] border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed font-bold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_10px_20px_rgba(255,255,255,0.05)] hover:-translate-y-1"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span className="hidden md:inline">SYNC</span>
                </button>
                <button
                  onClick={() => joinAsObserver(roomId)}
                  disabled={!socket || !isConnected || !roomId.trim()}
                  className="bg-gradient-to-r from-[#b026ff] to-[#8a2be2] hover:from-[#d175ff] hover:to-[#a45cf7] shadow-[0_0_25px_rgba(176,38,255,0.5)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 hover:-translate-y-1"
                >
                  <Eye className="w-5 h-5" />
                  <span className="hidden md:inline">OBSERVAR</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-5 content-start flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
              {rooms.length === 0 ? (
                <div className="col-span-full rounded-3xl border-2 border-dashed border-white/10 p-16 text-center text-white/30 font-bold flex flex-col items-center justify-center gap-5 bg-[#0a0e20]/50 h-full">
                  <Server className="w-16 h-16 opacity-30 animate-pulse" />
                  <span className="tracking-widest">TRANSMISIÓN NO DISPONIBLE</span>
                </div>
              ) : (
                rooms.map((room) => (
                  <article
                    key={room.roomId}
                    className="group/card rounded-3xl border border-white/5 bg-[#0a0e20] p-6 hover:bg-[#131a38] hover:border-[#b026ff]/60 transition-all duration-300 flex flex-col justify-between min-h-[190px] shadow-lg hover:shadow-[0_10px_30px_rgba(176,38,255,0.2)] hover:-translate-y-1 overflow-hidden relative"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-[100px] pointer-events-none group-hover/card:bg-[#b026ff]/10 transition-colors"></div>
                    <div>
                      <div className="flex justify-between items-start mb-4 relative z-10">
                        <h3 className="font-extrabold text-xl text-[#faf9f6] truncate pr-3 flex items-center gap-2">
                          {room.roomId}
                        </h3>
                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold tracking-widest uppercase border ${room.status === 'playing' ? 'bg-[#b026ff]/20 text-[#b026ff] border-[#b026ff]/40 shadow-[0_0_15px_rgba(176,38,255,0.3)] animate-pulse' : 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30'}`}>
                          {room.status}
                        </span>
                      </div>
                      <div className="text-xs text-white/70 mb-5 bg-white/5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 font-medium">
                        <Swords className="w-4 h-4 text-[#b026ff]" />
                        RONDA <span className="font-bold text-white">{room.round}</span> <span className="text-white/30">/</span> {room.maxRounds}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-auto relative z-10">
                      <div className="flex gap-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1 flex items-center gap-1"><Users className="w-3 h-3"/> PLY</span>
                          <span className="text-[#faf9f6]/90 font-mono text-lg font-bold">{room.playerCount}</span>
                        </div>
                        <div className="w-[1px] h-full bg-white/10 mx-1"></div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1 flex items-center gap-1"><Eye className="w-3 h-3"/> OBS</span>
                          <span className="text-[#faf9f6]/90 font-mono text-lg font-bold">{room.observerCount}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => joinAsObserver(room.roomId)}
                        disabled={!socket || !isConnected}
                        className="rounded-2xl bg-white/5 border border-white/10 p-3 text-xs font-bold text-[#faf9f6] transition-all duration-300 group-hover/card:bg-[#b026ff] group-hover/card:border-[#b026ff] group-hover/card:shadow-[0_0_15px_rgba(176,38,255,0.6)] disabled:opacity-30 disabled:pointer-events-none hover:!scale-110"
                      >
                         <Eye className="w-6 h-6"/>
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="xl:col-span-4 flex flex-col h-full">
          <section className="bg-[#0f152d]/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] h-[85vh] max-h-[900px] flex flex-col transition-all duration-500 hover:border-white/20">
            <h2 className="text-[#faf9f6] font-bold text-2xl mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Terminal className="w-7 h-7 text-[#00ff88]" />
                <span>Auditoría Eventos</span>
              </div>
              <span className="bg-[#00ff88]/10 text-[#00ff88] py-1.5 px-4 rounded-full text-xs font-black border border-[#00ff88]/30 tracking-widest shadow-[0_0_15px_rgba(0,255,136,0.2)]">
                {logs.length} EVT
              </span>
            </h2>
            <div ref={logsContainerRef} className="bg-[#0a0e20] border border-white/5 rounded-2xl p-5 flex-1 overflow-y-auto custom-scrollbar space-y-3 relative shadow-inner">
               <div className="absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-[#0a0e20] to-transparent pointer-events-none sticky z-10"></div>
               
              {logs.length === 0 ? (
                <div className="text-white/20 text-sm h-full flex flex-col items-center justify-center font-bold gap-3">
                  <Terminal className="w-12 h-12 opacity-30" />
                  ESPERANDO TELEMETRÍA...
                </div>
              ) : (
                logs.map((log, index) => {
                  const isError = log.includes('ERROR');
                  const isSuccess = log.includes('CONECTADO') || log.includes('ganador') || log.includes('ROOM');
                  return (
                    <div 
                      key={index} 
                      className={`text-[12px] font-mono leading-relaxed p-4 rounded-2xl border transition-colors break-words
                        ${isError ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 
                          isSuccess ? 'bg-[#00ff88]/10 text-[#00ff88]/90 border-[#00ff88]/20 shadow-[0_0_10px_rgba(0,255,136,0.1)]' : 
                          'bg-white/5 text-[#faf9f6]/70 border-white/5 hover:bg-white/10'}
                      `}
                    >
                      <span className="opacity-40 mr-2 select-none font-black">&gt;</span>{log}
                    </div>
                  );
                })
              )}
              <div className="h-4" />
              <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-[#0a0e20] to-transparent pointer-events-none sticky z-10"></div>
            </div>
          </section>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-10 bg-black/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]">
          <div className="bg-[#0f152d] border border-[#b026ff]/30 rounded-[40px] w-full max-w-6xl h-full max-h-[85vh] shadow-[0_0_80px_rgba(176,38,255,0.2)] flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#b026ff] rounded-full blur-[150px] opacity-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#00ff88] rounded-full blur-[150px] opacity-10 pointer-events-none"></div>
            
            <div className="relative z-10 border-b border-white/10 bg-black/20 p-6 lg:px-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#b026ff]/20 border border-[#b026ff]/40 flex items-center justify-center shadow-[0_0_15px_rgba(176,38,255,0.3)]">
                  <Activity className="w-6 h-6 text-[#b026ff]" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white flex items-center gap-2">
                    SALÓN DE OBSERVACIÓN
                  </h2>
                  <p className="text-[#00ff88] font-mono text-xs tracking-widest font-bold opacity-80 uppercase mt-1">
                    ROOM: {observedRoomId} {gameState && `| ${gameState.status}`}
                  </p>
                </div>
              </div>
              <button 
                onClick={closeObserverModal}
                className="w-12 h-12 bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 border border-transparent hover:border-red-500/30 rounded-full flex items-center justify-center transition-all duration-300 group"
              >
                <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
              </button>
            </div>

            <div className="relative z-10 flex-1 p-6 lg:p-10 overflow-y-auto custom-scrollbar flex flex-col">
              {!gameState ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-pulse">
                  <Gamepad2 className="w-24 h-24 text-white/10" />
                  <p className="text-white/40 tracking-widest font-bold text-lg">SINCRONIZANDO ESTADO CUÁNTICO...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
                  
                  <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-black/30 border border-white/5 rounded-3xl p-6 group hover:border-[#00ff88]/20 transition-all shadow-inner">
                       <h3 className="text-white/40 font-black tracking-widest text-xs mb-6 uppercase flex items-center gap-2">
                         <Clock className="w-4 h-4" /> Progreso Temporal
                       </h3>
                       <div className="flex items-end gap-2">
                         <span className="text-6xl font-black text-[#faf9f6]">{gameState.round}</span>
                         <span className="text-2xl font-bold text-white/30 mb-2">/ {gameState.maxRounds}</span>
                       </div>
                       <div className="w-full h-2 bg-white/5 rounded-full mt-4 overflow-hidden">
                         <div 
                           className="h-full bg-gradient-to-r from-[#00ff88] to-[#b026ff] rounded-full transition-all duration-700" 
                           style={{ width: `${Math.min((gameState.round / gameState.maxRounds) * 100, 100)}%` }}
                         ></div>
                       </div>
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-3xl p-6 flex-1 shadow-inner h-full overflow-hidden flex flex-col">
                      <h3 className="text-white/40 font-black tracking-widest text-xs mb-4 uppercase flex items-center gap-2">
                        <UserCheck className="w-4 h-4" /> Jugadores [{gameState.players.length}]
                      </h3>
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                        {gameState.players.length === 0 ? (
                           <div className="text-white/20 text-center py-8 font-bold text-sm">SALA VACÍA</div>
                        ) : (
                          gameState.players.map((p: any, i) => (
                            <div key={i} className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5">
                              <span className="font-bold text-white text-sm truncate pr-2 max-w-[150px]">{p.name || p.id}</span>
                              <div className="bg-black/50 px-3 py-1.5 rounded-lg border border-white/10 font-mono text-[#00ff88] text-xs font-bold">
                                {p.score ?? 0} PTS
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-8 flex flex-col gap-6">
                    
                    <div className="bg-black/40 border border-[#b026ff]/20 rounded-3xl p-8 lg:px-12 flex flex-col items-center justify-center min-h-[250px] shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_0_50px_rgba(176,38,255,0.05)] relative overflow-hidden">
                      <h3 className="text-[#b026ff] font-black tracking-widest text-sm mb-8 uppercase flex items-center gap-2 absolute top-6 left-8 opacity-70">
                        <Dices className="w-5 h-5" /> Combinación Actual
                      </h3>
                      {(!gameState.currentDice || gameState.currentDice.every(d => d === 0)) ? (
                        <div className="text-white/10 font-black text-2xl tracking-[0.2em] mt-6">ESPERANDO TIRO</div>
                      ) : (
                        <div className="flex gap-6 mt-6">
                          {gameState.currentDice.map((val, idx) => (
                            <div key={idx} className="w-24 h-24 lg:w-32 lg:h-32 bg-gradient-to-br from-white/10 to-white/5 border-2 border-white/10 rounded-3xl flex items-center justify-center shadow-[0_15px_30px_rgba(0,0,0,0.5),inset_0_2px_10px_rgba(255,255,255,0.2)] animate-[fadeIn_0.5s_ease-out]">
                              <span className="text-6xl lg:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 drop-shadow-lg">
                                {val}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-3xl p-6 flex-1 shadow-inner relative overflow-hidden flex flex-col">
                      <h3 className="text-white/40 font-black tracking-widest text-xs mb-4 uppercase flex items-center gap-2">
                        <Swords className="w-4 h-4" /> Enfrentamientos
                      </h3>
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                        {(!gameState.pairs || gameState.pairs.length === 0) ? (
                          <div className="text-white/20 text-center py-12 font-bold text-sm h-full flex items-center justify-center">FASES NO ASIGNADAS</div>
                        ) : (
                          gameState.pairs.map((pair: any, idx) => {
                            const p1 = gameState.players.find((p:any) => p.id === pair.player1Id);
                            const p2 = gameState.players.find((p:any) => p.id === pair.player2Id);
                            return (
                              <div key={idx} className="flex items-center justify-between bg-black/40 p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-[#b026ff]"></div>
                                <div className="flex-1 flex flex-col text-left pl-2">
                                  <span className="font-bold text-white text-sm">{p1?.name || pair.player1Id}</span>
                                </div>
                                <div className="mx-4 w-8 h-8 rounded-full bg-[#b026ff]/20 text-[#b026ff] flex items-center justify-center font-black text-xs shrink-0 shadow-[0_0_10px_rgba(176,38,255,0.2)]">VS</div>
                                <div className="flex-1 flex flex-col text-right pr-2">
                                  <span className="font-bold text-white text-sm">{p2?.name || pair.player2Id}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    
                  </div>
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          margin: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(176,38,255,0.3);
          border-radius: 8px;
          border: 2px solid rgba(0,0,0,0.3);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(176,38,255,0.5);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
