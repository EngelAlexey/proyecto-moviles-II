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
  type RealtimeTransport,
} from '@dado-triple/shared-types';
import {
  createRealtimeClient,
  type RealtimeEndpoint,
  type RealtimeClient,
} from './src/lib/realtime-client';

const EXPLICIT_REALTIME_TRANSPORT: RealtimeTransport =
  process.env.EXPO_PUBLIC_REALTIME_TRANSPORT === 'socket.io' ? 'socket.io' : 'websocket';
const EXPLICIT_REALTIME_URL = process.env.EXPO_PUBLIC_REALTIME_URL;
const DEFAULT_AWS_ENDPOINTS: RealtimeEndpoint[] = [
  { transport: 'websocket', url: 'ws://3.18.110.24:5000' },
  { transport: 'socket.io', url: 'http://3.18.110.24:4000' },
];
const REALTIME_ENDPOINTS = buildRealtimeEndpoints(
  EXPLICIT_REALTIME_TRANSPORT,
  EXPLICIT_REALTIME_URL,
  DEFAULT_AWS_ENDPOINTS,
);
const PRIMARY_ENDPOINT = REALTIME_ENDPOINTS[0];
const REALTIME_FALLBACKS = REALTIME_ENDPOINTS.slice(1);
const ROOM_ID = 'debug-room';

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function buildRealtimeEndpoints(
  preferredTransport: RealtimeTransport,
  explicitUrl: string | undefined,
  defaults: RealtimeEndpoint[],
): RealtimeEndpoint[] {
  const endpoints: RealtimeEndpoint[] = [];

  if (explicitUrl) {
    endpoints.push({
      transport: preferredTransport,
      url: normalizeRealtimeUrl(preferredTransport, explicitUrl),
    });
  }

  const prioritizedDefaults = [...defaults].sort((left, right) => {
    if (left.transport === right.transport) {
      return 0;
    }

    if (left.transport === preferredTransport) {
      return -1;
    }

    if (right.transport === preferredTransport) {
      return 1;
    }

    return 0;
  });

  for (const endpoint of prioritizedDefaults) {
    endpoints.push({
      ...endpoint,
      url: normalizeRealtimeUrl(endpoint.transport, endpoint.url),
    });
  }

  return endpoints.filter((endpoint, index, list) => {
    return (
      list.findIndex((candidate) => {
        return candidate.transport === endpoint.transport && candidate.url === endpoint.url;
      }) === index
    );
  });
}

function normalizeRealtimeUrl(transport: RealtimeTransport, url: string): string {
  if (transport === 'websocket') {
    if (url.startsWith('http://')) {
      return `ws://${url.slice('http://'.length)}`;
    }

    if (url.startsWith('https://')) {
      return `wss://${url.slice('https://'.length)}`;
    }
  }

  if (transport === 'socket.io') {
    if (url.startsWith('ws://')) {
      return `http://${url.slice('ws://'.length)}`;
    }

    if (url.startsWith('wss://')) {
      return `https://${url.slice('wss://'.length)}`;
    }
  }

  return url;
}

export default function App() {
  const [socket, setSocket] = useState<RealtimeClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [activeTransport, setActiveTransport] = useState<RealtimeTransport | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const logsRef = useRef<ScrollView>(null);

  const addLog = useCallback((entry: string) => {
    setLogs((prev) => [...prev, `[${timestamp()}] ${entry}`]);
  }, []);

  useEffect(() => {
    const client = createRealtimeClient({
      url: PRIMARY_ENDPOINT.url,
      transport: PRIMARY_ENDPOINT.transport,
      fallbacks: REALTIME_FALLBACKS,
      onOpen: ({ connectionId: nextConnectionId, transport, url }) => {
        setIsConnected(true);
        setConnectionId(nextConnectionId);
        setActiveTransport(transport);
        setActiveUrl(url);
        addLog(
          `CONECTADO via ${transport} -> ${url}${nextConnectionId ? ` (id: ${nextConnectionId})` : ''}`,
        );
      },
      onClose: ({ reason, transport, url }) => {
        setIsConnected(false);
        setConnectionId(null);
        setActiveTransport(null);
        setActiveUrl(url);
        addLog(`DESCONECTADO via ${transport} -> ${url}: ${reason ?? 'sin detalle'}`);
      },
      onError: (message) => {
        addLog(`ERROR DE CONEXION: ${message}`);
      },
    });

    const unsubscribers = [
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
          .map((p) => `${p.player1Id} vs ${p.player2Id}`)
          .join(', ');
        addLog(`PAIRS_ASSIGNED ronda ${data.round}: ${pairStr}${data.bye ? ` | bye: ${data.bye}` : ''}`);
      }),
      client.on(SocketEvents.DICE_ROLLED, (data: DiceRolledPayload) => {
        addLog(`DICE_ROLLED: [${data.dice.join(',')}] combo=${data.combo} score=${data.score} (player: ${data.playerId})`);
      }),
      client.on(SocketEvents.ROUND_RESULT, (data: RoundResultPayload) => {
        addLog(`ROUND_RESULT: ${data.scores.player1} vs ${data.scores.player2} -> ganador: ${data.winnerId ?? 'empate'}`);
      }),
      client.on(SocketEvents.GAME_UPDATE, (data: GameUpdatePayload) => {
        setGameState(data.state);
        addLog(`GAME_UPDATE: status=${data.state.status} ronda=${data.state.round} jugadores=${data.state.players.length}`);
      }),
      client.on(SocketEvents.GAME_OVER, (data: GameOverPayload) => {
        addLog(`GAME_OVER: ganador=${data.winnerId} scores=${JSON.stringify(data.finalScores)}`);
      }),
      client.on(SocketEvents.ERROR, (data: ErrorPayload) => {
        addLog(`ERROR: ${data.message}${data.code ? ` (${data.code})` : ''}`);
      }),
    ];

    addLog(`Intentando conectar con ${PRIMARY_ENDPOINT.transport} -> ${PRIMARY_ENDPOINT.url}`);
    if (REALTIME_FALLBACKS.length > 0) {
      addLog(
        `Fallbacks configurados: ${REALTIME_FALLBACKS.map((endpoint) => `${endpoint.transport} -> ${endpoint.url}`).join(' | ')}`,
      );
    }

    client.connect();
    setSocket(client);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      client.disconnect(1000, 'Component unmounted');
    };
  }, [addLog]);

  useEffect(() => {
    logsRef.current?.scrollToEnd({ animated: true });
  }, [logs]);

  const joinGame = () => {
    if (!socket || !username.trim()) return;
    socket.send(SocketEvents.JOIN_GAME, { playerName: username.trim(), roomId: ROOM_ID });
    addLog(`-> JOIN_GAME emitido (username: ${username.trim()})`);
  };

  const markReady = () => {
    if (!socket || !playerId) return;
    socket.send(SocketEvents.PLAYER_READY, { roomId: ROOM_ID, playerId });
    addLog('-> PLAYER_READY emitido');
  };

  const rollDice = () => {
    if (!socket || !playerId) return;
    socket.send(SocketEvents.ROLL_DICE, { roomId: ROOM_ID, playerId });
    addLog('-> ROLL_DICE emitido');
  };

  useEffect(() => {
    if (!gameState || !username.trim()) return;
    const me = gameState.players.find((p) => p.name === username.trim());
    if (me && me.id !== playerId) {
      setPlayerId(me.id);
      addLog(`Player ID asignado: ${me.id}`);
    }
  }, [gameState, username, playerId, addLog]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Dado Triple - Debug UI</Text>
      <Text style={styles.status}>
        Socket: {isConnected ? 'CONECTADO' : 'DESCONECTADO'} | Preferido: {PRIMARY_ENDPOINT.transport.toUpperCase()} | Activo: {(activeTransport ?? PRIMARY_ENDPOINT.transport).toUpperCase()} | ID: {connectionId ?? '-'}
      </Text>
      <Text style={styles.status}>
        URL activa: {activeUrl ?? PRIMARY_ENDPOINT.url}
      </Text>

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. GameState (raw)</Text>
        <ScrollView style={styles.rawBox} nestedScrollEnabled>
          <Text style={styles.mono}>
            {gameState ? JSON.stringify(gameState, null, 2) : '(sin estado aun)'}
          </Text>
        </ScrollView>
      </View>

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
