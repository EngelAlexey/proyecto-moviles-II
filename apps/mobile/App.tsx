import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  type DiceRolledPayload,
  type ErrorPayload,
  type GameOverPayload,
  type GameState,
  type GameUpdatePayload,
  type PairsAssignedPayload,
  type PlayerJoinedPayload,
  type RoomCreatedPayload,
  type RoundResultPayload,
} from '@dado-triple/shared-types';
import { createRealtimeClient, type RealtimeClient } from './src/lib/realtime-client';

const SERVER_URL = 'ws://18.218.158.112:5000';
const REALTIME_TRANSPORT_LABEL = 'WEBSOCKET';

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export default function App() {
  const [socket, setSocket] = useState<RealtimeClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [activeTransport, setActiveTransport] = useState<'websocket' | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const logsRef = useRef<ScrollView>(null);
  const usernameRef = useRef('');
  const autoJoinCreatedRoomRef = useRef(false);

  const addLog = useCallback((entry: string) => {
    setLogs((prev) => [...prev, `[${timestamp()}] ${entry}`]);
  }, []);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  const emitJoinGame = useCallback(
    (client: RealtimeClient, nextRoomId: string, nextUsername: string) => {
      const normalizedRoomId = nextRoomId.trim();
      const normalizedUsername = nextUsername.trim();

      if (!normalizedRoomId) {
        addLog('ERROR DE SALA: ingresa o crea una sala valida.');
        return;
      }

      if (!normalizedUsername) {
        addLog('ERROR DE JUGADOR: ingresa tu nombre antes de unirte.');
        return;
      }

      setRoomId(normalizedRoomId);
      setPlayerId(null);
      setGameState(null);
      client.send(SocketEvents.JOIN_GAME, {
        playerName: normalizedUsername,
        roomId: normalizedRoomId,
      });
      addLog(`-> JOIN_GAME emitido (sala: ${normalizedRoomId}, jugador: ${normalizedUsername})`);
    },
    [addLog],
  );

  useEffect(() => {
    const client = createRealtimeClient({
      url: SERVER_URL,
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
        setPlayerId(null);
        addLog(`DESCONECTADO via ${transport} -> ${url}: ${reason ?? 'sin detalle'}`);
      },
      onError: (message) => {
        addLog(`ERROR DE CONEXION: ${message}`);
      },
    });

    const unsubscribers = [
      client.on(SocketEvents.ROOM_CREATED, (data: RoomCreatedPayload) => {
        setRoomId(data.room.roomId);
        setGameState(data.state);
        setPlayerId(null);
        addLog(`ROOM_CREATED: ${data.room.roomId}`);

        if (autoJoinCreatedRoomRef.current && usernameRef.current.trim()) {
          autoJoinCreatedRoomRef.current = false;
          emitJoinGame(client, data.room.roomId, usernameRef.current);
          return;
        }

        autoJoinCreatedRoomRef.current = false;
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

    addLog(`Intentando conectar con websocket -> ${SERVER_URL}`);
    client.connect();
    setSocket(client);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      client.disconnect(1000, 'Component unmounted');
    };
  }, [addLog, emitJoinGame]);

  useEffect(() => {
    logsRef.current?.scrollToEnd({ animated: true });
  }, [logs]);

  useEffect(() => {
    if (!gameState || !username.trim()) {
      return;
    }

    const me = gameState.players.find((player) => player.name === username.trim());
    if (me && me.id !== playerId) {
      setPlayerId(me.id);
      addLog(`Player ID asignado: ${me.id}`);
    }
  }, [gameState, username, playerId, addLog]);

  const createRoom = () => {
    if (!socket || !isConnected) {
      addLog('ERROR DE CONEXION: conecta el socket antes de crear una sala.');
      return;
    }

    const requestedRoomId = roomId.trim() || undefined;
    autoJoinCreatedRoomRef.current = Boolean(username.trim());
    setPlayerId(null);
    setGameState(null);
    socket.send(SocketEvents.CREATE_ROOM, {
      roomId: requestedRoomId,
    });
    addLog(
      `-> CREATE_ROOM emitido${requestedRoomId ? ` (roomId solicitado: ${requestedRoomId})` : ''}`,
    );
  };

  const joinGame = () => {
    if (!socket) {
      return;
    }

    emitJoinGame(socket, roomId, username);
  };

  const markReady = () => {
    const normalizedRoomId = roomId.trim();
    if (!socket || !playerId || !normalizedRoomId) {
      return;
    }

    socket.send(SocketEvents.PLAYER_READY, { roomId: normalizedRoomId, playerId });
    addLog('-> PLAYER_READY emitido');
  };

  const rollDice = () => {
    const normalizedRoomId = roomId.trim();
    if (!socket || !playerId || !normalizedRoomId) {
      return;
    }

    socket.send(SocketEvents.ROLL_DICE, { roomId: normalizedRoomId, playerId });
    addLog('-> ROLL_DICE emitido');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Dado Triple - Mobile Player Console</Text>
      <Text style={styles.status}>
        Socket: {isConnected ? 'CONECTADO' : 'DESCONECTADO'} | Rol: PLAYER | Sala:{' '}
        {roomId || '-'} | Modo: {REALTIME_TRANSPORT_LABEL} | Activo:{' '}
        {(activeTransport ?? 'websocket').toUpperCase()} | ID:{' '}
        {connectionId ?? '-'}
      </Text>
      <Text style={styles.status}>URL activa: {activeUrl ?? SERVER_URL}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Crear o unirse como jugador</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre del jugador"
          placeholderTextColor="#888"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Codigo de sala (opcional para crear)"
          placeholderTextColor="#888"
          value={roomId}
          onChangeText={setRoomId}
          autoCapitalize="none"
        />
        <View style={styles.row}>
          <View style={styles.btnWrap}>
            <Button title="Crear sala" onPress={createRoom} disabled={!isConnected} />
          </View>
          <View style={styles.btnWrap}>
            <Button
              title="Unirse"
              onPress={joinGame}
              disabled={!isConnected || !username.trim() || !roomId.trim()}
            />
          </View>
        </View>
        <Text style={styles.helperText}>
          Mobile es la unica app que juega. Puedes crear una sala nueva y entrar como
          jugador, o unirte a una existente usando su codigo.
        </Text>
      </View>

      {isConnected && playerId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Controles del jugador</Text>
          <View style={styles.row}>
            <View style={styles.btnWrap}>
              <Button title="Estoy listo" onPress={markReady} />
            </View>
            <View style={styles.btnWrap}>
              <Button title="Lanzar dados" onPress={rollDice} />
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. Estado de la partida</Text>
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
            logs.map((log, index) => (
              <Text key={index} style={styles.mono}>
                {log}
              </Text>
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
  helperText: {
    color: '#8da2cf',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
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
    maxHeight: 140,
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
