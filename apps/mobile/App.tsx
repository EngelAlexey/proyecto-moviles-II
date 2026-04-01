import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
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

/**
 * 💡 TIP: Si pruebas en un dispositivo físico, cambia 'localhost' por la IP local de tu PC 
 * (ej: 'http://192.168.1.100:4000'). Si usas emulador Android, usa 'http://10.0.2.2:4000'.
 */
const SERVER_URL = 'http://localhost:4000'; 
const ROOM_ID = 'debug-room';

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export default function App() {
  // ── Estado ──────────────────────────────────────────────────────────────
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const logsRef = useRef<ScrollView>(null);

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

    s.on('disconnect', (reason: string) => {
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
    logsRef.current?.scrollToEnd({ animated: true });
  }, [logs]);

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

  // Derivar playerId del gameState cuando el jugador se une
  useEffect(() => {
    if (!gameState || !username.trim()) return;
    const me = gameState.players.find((p) => p.name === username.trim());
    if (me && me.id !== playerId) {
      setPlayerId(me.id);
      addLog(`Player ID asignado: ${me.id}`);
    }
  }, [gameState, username, playerId, addLog]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Dado Triple — Debug UI</Text>
      <Text style={styles.status}>
        Socket: {isConnected ? 'CONECTADO' : 'DESCONECTADO'} | ID: {socket?.id ?? '—'}
      </Text>

      {/* ── Sección 1: Conexión ──────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Unirse</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre de usuario"
          placeholderTextColor="#888"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <Button title="Unirse al Juego" onPress={joinGame} disabled={!isConnected || !username.trim()} />
      </View>

      {/* ── Sección 2: Controles de Juego ────────────────────────────── */}
      {isConnected && playerId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Controles</Text>
          <View style={styles.row}>
            <View style={styles.btnWrap}>
              <Button title="Estoy Listo" onPress={markReady} />
            </View>
            <View style={styles.btnWrap}>
              <Button title="Lanzar Dados" onPress={rollDice} />
            </View>
          </View>
        </View>
      )}

      {/* ── Sección 3: Estado Crudo ──────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. GameState (raw)</Text>
        <ScrollView style={styles.rawBox} nestedScrollEnabled>
          <Text style={styles.mono}>
            {gameState ? JSON.stringify(gameState, null, 2) : '(sin estado aún)'}
          </Text>
        </ScrollView>
      </View>

      {/* ── Sección 4: Logs ──────────────────────────────────────────── */}
      <View style={[styles.section, styles.logsSection]}>
        <Text style={styles.sectionTitle}>4. Event Logs ({logs.length})</Text>
        <ScrollView ref={logsRef} style={styles.rawBox} nestedScrollEnabled>
          {logs.length === 0 ? (
            <Text style={styles.mono}>(esperando eventos...)</Text>
          ) : (
            logs.map((log, i) => (
              <Text key={i} style={styles.mono}>{log}</Text>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ── Estilos mínimos ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 12,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
  status: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
  },
  section: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#e94560',
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0f3460',
    color: '#fff',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  btnWrap: {
    flex: 1,
  },
  rawBox: {
    backgroundColor: '#0a0a1a',
    borderRadius: 6,
    padding: 8,
    maxHeight: 120,
  },
  logsSection: {
    flex: 1,
  },
  mono: {
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});
