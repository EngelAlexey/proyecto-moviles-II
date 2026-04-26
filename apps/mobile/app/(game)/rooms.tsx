import { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SocketEvents, type RoomSummary } from '@dado-triple/shared-types';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Fonts } from '../../constants/theme';
import { useAuthContext } from '../../src/context/auth-context';
import { useGameState } from '../../src/hooks/use-game-state';
import { useRealtime } from '../../src/hooks/use-realtime';
import { useSocketEvents } from '../../src/hooks/use-socket-events';

export default function RoomsScreen() {
  const router = useRouter();
  const { client, isConnected } = useRealtime();
  const { state, dispatch } = useGameState();
  const { playerName, logout } = useAuthContext();
  const [isLoading, setIsLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [maxRounds, setMaxRounds] = useState('5');

  // Listen for rooms list
  useSocketEvents(SocketEvents.ROOMS_LIST, (payload) => {
    dispatch({ type: 'SET_ACTIVE_ROOMS', payload: payload.rooms });
    setIsLoading(false);
  });

  // Listen for room created
  useSocketEvents(SocketEvents.ROOM_CREATED, (payload) => {
    dispatch({
      type: 'CREATE_ROOM',
      payload: {
        roomId: payload.room.roomId,
        sessionId: payload.room.sessionId,
        room: payload.room,
      },
    });
  });

  // Request rooms on mount
  useEffect(() => {
    if (client && isConnected) {
      setIsLoading(true);
      client.send(SocketEvents.LIST_ROOMS, { includeFinished: false });
    }
  }, [client, isConnected]);

  const handleCreateRoom = async () => {
    try {
      const rounds = parseInt(maxRounds) || 5;
      if (rounds < 1 || rounds > 20) {
        Alert.alert('Invalid', 'Max rounds must be between 1 and 20');
        return;
      }

      if (!client) return;

      client.send(SocketEvents.CREATE_ROOM, {
        maxRounds: rounds,
      });

      setCreateModalVisible(false);
      setMaxRounds('5');
    } catch {
      Alert.alert('Error', 'Failed to create room');
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    try {
      if (!client || !playerName) return;

      client.send(SocketEvents.JOIN_GAME, {
        roomId,
        playerName,
      });

      router.push({ pathname: '/game', params: { roomId } } as never);
    } catch {
      Alert.alert('Error', 'Failed to join room');
    }
  };

  const handleSwitchPlayer = async () => {
    try {
      dispatch({ type: 'RESET_GAME' });
      await logout();
      router.replace('/login' as never);
    } catch {
      Alert.alert('Error', 'Failed to switch player');
    }
  };

  const renderRoomItem = ({ item }: { item: RoomSummary }) => (
    <TouchableOpacity
      onPress={() => handleJoinRoom(item.roomId)}
      style={styles.roomCard}
    >
      <View style={styles.roomHeaderRow}>
        <ThemedText type="subtitle" darkColor="#F3FAFF" lightColor="#071A24" style={styles.roomTitle}>
          Room {item.roomId}
        </ThemedText>
        <View style={styles.statusChip}>
          <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.statusChipText}>
            {item.status}
          </ThemedText>
        </View>
      </View>

      <ThemedText darkColor="#A7C5D6" lightColor="#36586B" style={styles.roomMeta}>
        Players: {item.playerCount}/10 | Round: {item.round}
      </ThemedText>

      <ThemedText darkColor="#718A99" lightColor="#4C6674" style={styles.roomHint}>
        {item.playerCount < 2
          ? `Need ${2 - item.playerCount} more ${2 - item.playerCount === 1 ? 'player' : 'players'} to start.`
          : 'Ready to start once everyone marks ready.'}
      </ThemedText>
    </TouchableOpacity>
  );

  if (!isConnected) {
    return (
      <ThemedView style={styles.screen}>
        <View style={styles.centerState}>
          <ThemedText darkColor="#F4FBFF" lightColor="#102A43" style={styles.connectingText}>
            Syncing with command server...
          </ThemedText>
        <ActivityIndicator size="large" style={{ marginTop: 16 }} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <View style={styles.headerBlock}>
        <View style={styles.headerTopRow}>
          <View style={styles.playerBadge}>
            <ThemedText darkColor="#D9FBFF" lightColor="#0B1F2A" style={styles.playerBadgeText}>
              {playerName ? `Player: ${playerName}` : 'Player not set'}
            </ThemedText>
          </View>
          <TouchableOpacity onPress={handleSwitchPlayer} style={styles.switchPlayerButton}>
            <ThemedText darkColor="#041017" lightColor="#041017" style={styles.switchPlayerButtonText}>
              Change Player
            </ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.kicker}>
          ACTIVE MATCH NETWORK
        </ThemedText>
        <ThemedText darkColor="#F4FBFF" lightColor="#0B1F2A" style={styles.heading}>
          Available Rooms
        </ThemedText>
        <ThemedText darkColor="#9BB8C8" lightColor="#47697C" style={styles.subheading}>
          Join a live room or open a fresh arena.
        </ThemedText>
        <View style={styles.ruleBanner}>
          <ThemedText darkColor="#D9FBFF" lightColor="#0B1F2A" style={styles.ruleBannerText}>
            Minimum 2 players required to start a game.
          </ThemedText>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <>
          <FlatList
            data={state.activeRooms}
            renderItem={renderRoomItem}
            keyExtractor={(item) => item.roomId}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <ThemedText darkColor="#A7C5D6" lightColor="#335C67" style={styles.emptyText}>
                No active rooms. Create one!
              </ThemedText>
            }
            ListFooterComponent={
              <TouchableOpacity
                onPress={() => setCreateModalVisible(true)}
                style={styles.createButton}
              >
                <ThemedText darkColor="#041017" lightColor="#041017" style={styles.createButtonText}>
                  Create New Room
                </ThemedText>
              </TouchableOpacity>
            }
          />

          <Modal visible={createModalVisible} transparent animationType="slide">
            <ThemedView style={styles.modalBackdrop}>
              <ThemedView style={styles.modalCard}>
                <ThemedText type="subtitle" darkColor="#F4FBFF" lightColor="#0B1F2A" style={styles.modalTitle}>
                  Create New Room
                </ThemedText>

                <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.modalLabel}>
                  MAX ROUNDS (1-20)
                </ThemedText>
                <TextInput
                  style={styles.modalInput}
                  placeholder="5"
                  value={maxRounds}
                  onChangeText={setMaxRounds}
                  keyboardType="number-pad"
                  placeholderTextColor="#6C8A9D"
                  selectionColor="#7BF7FF"
                />

                <View style={styles.modalButtonRow}>
                  <TouchableOpacity
                    onPress={() => setCreateModalVisible(false)}
                    style={styles.secondaryButton}
                  >
                    <ThemedText darkColor="#D7E5EE" lightColor="#102A43" style={styles.secondaryButtonText}>
                      Cancel
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleCreateRoom}
                    style={styles.primaryButton}
                  >
                    <ThemedText darkColor="#041017" lightColor="#041017" style={styles.primaryButtonText}>
                      Create
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </ThemedView>
            </ThemedView>
          </Modal>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: 0,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(74, 214, 255, 0.14)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: 40,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(98, 81, 255, 0.12)',
  },
  headerBlock: {
    marginBottom: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  playerBadge: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(16, 31, 46, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.18)',
  },
  playerBadgeText: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    letterSpacing: 0.8,
  },
  switchPlayerButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#7BF7FF',
  },
  switchPlayerButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.mono,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 6,
  },
  heading: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: Fonts.rounded,
    fontWeight: '700',
  },
  subheading: {
    marginTop: 8,
    fontSize: 15,
  },
  ruleBanner: {
    marginTop: 14,
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(22, 43, 58, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.2)',
  },
  ruleBannerText: {
    fontSize: 13,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
  listContent: {
    paddingBottom: 24,
  },
  roomCard: {
    backgroundColor: 'rgba(10, 19, 31, 0.92)',
    borderRadius: 18,
    padding: 18,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.16)',
    shadowColor: '#40E9FF',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  roomHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  roomTitle: {
    flex: 1,
    fontFamily: Fonts.rounded,
  },
  statusChip: {
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.22)',
    backgroundColor: 'rgba(14, 36, 49, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusChipText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  roomMeta: {
    fontSize: 14,
    marginTop: 10,
  },
  roomHint: {
    fontSize: 12,
    marginTop: 6,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingText: {
    fontSize: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  createButton: {
    backgroundColor: '#7BF7FF',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 20,
  },
  createButtonText: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontFamily: Fonts.mono,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 8, 14, 0.68)',
  },
  modalCard: {
    backgroundColor: '#091420',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    minHeight: 220,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.18)',
  },
  modalTitle: {
    marginBottom: 18,
    fontFamily: Fonts.rounded,
  },
  modalLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.32)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#F4FBFF',
    backgroundColor: '#102030',
    fontFamily: Fonts.mono,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#1A2837',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.16)',
  },
  secondaryButtonText: {
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#7BF7FF',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: Fonts.mono,
  },
});
