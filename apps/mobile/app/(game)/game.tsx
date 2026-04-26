import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  SocketEvents,
  type DiceRolledPayload,
  type DiceValues,
  type GameOverPayload,
  type GameUpdatePayload,
  type PairsAssignedPayload,
  type PlayerJoinedPayload,
  type RoundResultPayload,
} from '@dado-triple/shared-types';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useAuthContext } from '../../src/context/auth-context';
import { useGameState } from '../../src/hooks/use-game-state';
import { useRealtime } from '../../src/hooks/use-realtime';
import { useSocketEvents } from '../../src/hooks/use-socket-events';
import { Fonts } from '../../constants/theme';

const MIN_REQUIRED_PLAYERS = 2;

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { client, isConnected, connectionError } = useRealtime();
  const { state, dispatch } = useGameState();
  const { playerName } = useAuthContext();
  const [isRolling, setIsRolling] = useState(false);
  const [isReadyPending, setIsReadyPending] = useState(false);
  const [observedRollPlayerIds, setObservedRollPlayerIds] = useState<string[]>([]);
  const [roundTransitionMessage, setRoundTransitionMessage] = useState<{
    title: string;
    subtitle: string;
  } | null>(null);
  const [connectionBanner, setConnectionBanner] = useState<{
    tone: 'info' | 'success';
    title: string;
    subtitle: string;
  } | null>(null);

  // Listen for game updates
  useSocketEvents(SocketEvents.GAME_UPDATE, (payload: GameUpdatePayload) => {
    dispatch({
      type: 'UPDATE_GAME_STATE',
      payload: {
        players: payload.state.players,
        pairs: payload.state.pairs,
        byePlayerId: payload.state.byePlayerId,
        currentTurnPlayerId: payload.state.currentTurnPlayerId,
        status: payload.state.status,
        round: payload.state.round,
        maxRounds: payload.state.maxRounds,
      },
    });
  });

  useSocketEvents(SocketEvents.PLAYER_JOINED, (payload: PlayerJoinedPayload) => {
    dispatch({ type: 'ADD_PLAYER', payload: payload.player });
  });

  useSocketEvents(SocketEvents.PLAYER_LEFT, (payload) => {
    dispatch({ type: 'REMOVE_PLAYER', payload: payload.playerId });
  });

  // Listen for dice rolled
  useSocketEvents(SocketEvents.DICE_ROLLED, (payload: DiceRolledPayload) => {
    dispatch({
      type: 'SET_CURRENT_DICE',
      payload: {
        dice: payload.dice,
        combo: payload.combo,
        score: payload.score,
      },
    });
    setObservedRollPlayerIds((currentIds) =>
      currentIds.includes(payload.playerId) ? currentIds : [...currentIds, payload.playerId],
    );
    setIsRolling(false);
  });

  // Listen for game start
  useSocketEvents(SocketEvents.GAME_START, () => {
    dispatch({ type: 'GAME_START' });
    setObservedRollPlayerIds([]);
    setIsReadyPending(false);
  });

  useSocketEvents(SocketEvents.ROUND_RESULT, (_payload: RoundResultPayload) => {
    dispatch({ type: 'ROUND_RESULT', payload: { round: state.round } });
    setRoundTransitionMessage({
      title: 'Round Completed',
      subtitle: 'Calculating outcomes and preparing the next matchup...',
    });
  });

  // Listen for pairs assigned
  useSocketEvents(SocketEvents.PAIRS_ASSIGNED, (payload: PairsAssignedPayload) => {
    dispatch({
      type: 'SET_PAIRS',
      payload: payload.pairs,
    });
    setObservedRollPlayerIds([]);

    if (payload.round > 1) {
      setRoundTransitionMessage({
        title: `Round ${payload.round}`,
        subtitle: 'New pairings locked in. Launch when ready.',
      });
    }
  });

  // Listen for game over
  useSocketEvents(SocketEvents.GAME_OVER, (payload: GameOverPayload) => {
    dispatch({
      type: 'GAME_OVER',
      payload: {
        finalScores: payload.finalScores,
        winnerId: payload.winnerId,
      },
    });
    setObservedRollPlayerIds([]);
    setRoundTransitionMessage(null);
  });

  const currentPlayer = state.players.find((p) => p.name === playerName);
  const fallbackTurnPlayerId = state.pairs
    .flatMap((pair) => [pair.player1Id, pair.player2Id])
    .find((playerId) => !observedRollPlayerIds.includes(playerId)) ?? null;
  const effectiveTurnPlayerId = state.currentTurnPlayerId ?? fallbackTurnPlayerId;
  const currentTurnPlayer = state.players.find((player) => player.id === effectiveTurnPlayerId) ?? null;
  const effectiveCurrentPlayerIsReady = currentPlayer?.isReady ?? isReadyPending;
  const readyPlayersCount = state.players.filter((player) => player.isReady).length;
  const displayedReadyPlayersCount = readyPlayersCount + (isReadyPending && !currentPlayer?.isReady ? 1 : 0);
  const waitingPlayersCount = Math.max(state.players.length - displayedReadyPlayersCount, 0);
  const minimumPlayersProgress = Math.min(state.players.length, MIN_REQUIRED_PLAYERS);
  const lobbyStatusText =
    state.players.length < MIN_REQUIRED_PLAYERS
      ? `${displayedReadyPlayersCount} player${displayedReadyPlayersCount === 1 ? '' : 's'} ready • ${minimumPlayersProgress}/${MIN_REQUIRED_PLAYERS} minimum players in room`
      : `${displayedReadyPlayersCount}/${state.players.length} players ready`;
  const readyButtonLabel = effectiveCurrentPlayerIsReady
    ? waitingPlayersCount > 0
      ? `Waiting for ${waitingPlayersCount} more ${waitingPlayersCount === 1 ? 'player' : 'players'}...`
      : 'Ready. Starting game...'
    : 'Mark Ready';
  const canCurrentPlayerRoll =
    state.status === 'playing' &&
    !!currentPlayer &&
    effectiveTurnPlayerId === currentPlayer.id &&
    !isRolling;
  const rollButtonLabel = !currentPlayer
    ? 'Waiting for player sync'
    : effectiveTurnPlayerId === currentPlayer.id
      ? 'Roll Dice'
      : currentTurnPlayer
        ? `Waiting for ${currentTurnPlayer.name}`
        : 'Waiting for next turn';

  useEffect(() => {
    if (currentPlayer?.isReady || state.status !== 'waiting') {
      setIsReadyPending(false);
    }
  }, [currentPlayer?.isReady, state.status]);

  useEffect(() => {
    if (!roomId || state.roomId === roomId) {
      return;
    }

    dispatch({ type: 'UPDATE_GAME_STATE', payload: { roomId } });
  }, [dispatch, roomId, state.roomId]);

  useEffect(() => {
    if (!client || !isConnected || !roomId || !playerName) {
      return;
    }

    client.send(SocketEvents.JOIN_GAME, {
      roomId,
      playerName,
    });
  }, [client, isConnected, playerName, roomId]);

  useEffect(() => {
    if (!roundTransitionMessage) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setRoundTransitionMessage(null);
    }, 2200);

    return () => clearTimeout(timeoutId);
  }, [roundTransitionMessage]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    if (!isConnected) {
      setConnectionBanner({
        tone: 'info',
        title: 'Reconnecting...',
        subtitle: connectionError ?? 'Trying to recover your link to the room.',
      });
      return;
    }

    setConnectionBanner({
      tone: 'success',
      title: 'Reconnected to room',
      subtitle: `Connected again to ${roomId}.`,
    });
  }, [connectionError, isConnected, roomId]);

  useEffect(() => {
    if (!connectionBanner || connectionBanner.tone !== 'success') {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setConnectionBanner(null);
    }, 1800);

    return () => clearTimeout(timeoutId);
  }, [connectionBanner]);

  const handleReady = () => {
    if (!client || !roomId || !currentPlayer) return;

    setIsReadyPending(true);
    dispatch({
      type: 'SET_PLAYERS',
      payload: state.players.map((player) =>
        player.id === currentPlayer.id ? { ...player, isReady: true } : player,
      ),
    });

    client.send(SocketEvents.PLAYER_READY, {
      roomId,
      playerId: currentPlayer.id,
    });
  };

  const handleRoll = () => {
    if (!client || !roomId || !currentPlayer) return;

    setIsRolling(true);
    client.send(SocketEvents.ROLL_DICE, {
      roomId,
      playerId: currentPlayer.id,
    });
  };

  const handleBackToRooms = () => {
    dispatch({ type: 'RESET_GAME' });
    router.replace('/rooms' as never);
  };

  const renderDice = (dice: DiceValues | null) => {
    if (!dice) return null;

    return (
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          justifyContent: 'center',
          marginVertical: 16,
        }}
      >
        {dice.map((value, idx) => (
          <View
            key={idx}
            style={{
              width: 60,
              height: 60,
              borderRadius: 8,
              backgroundColor: '#007AFF',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <ThemedText style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>
              {value}
            </ThemedText>
          </View>
        ))}
      </View>
    );
  };

  return (
    <ThemedView style={{ flex: 1, paddingHorizontal: 16 }}>
      {connectionBanner ? (
        <View pointerEvents="none" style={styles.connectionBannerOverlay}>
          <View
            style={[
              styles.connectionBannerCard,
              connectionBanner.tone === 'success'
                ? styles.connectionBannerSuccess
                : styles.connectionBannerInfo,
            ]}
          >
            <ThemedText
              darkColor={connectionBanner.tone === 'success' ? '#041017' : '#F4FBFF'}
              lightColor={connectionBanner.tone === 'success' ? '#041017' : '#102A43'}
              style={styles.connectionBannerTitle}
            >
              {connectionBanner.title}
            </ThemedText>
            <ThemedText
              darkColor={connectionBanner.tone === 'success' ? '#07303C' : '#A7C5D6'}
              lightColor={connectionBanner.tone === 'success' ? '#07303C' : '#48697D'}
              style={styles.connectionBannerSubtitle}
            >
              {connectionBanner.subtitle}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {roundTransitionMessage ? (
        <View pointerEvents="none" style={styles.roundCompletedOverlay}>
          <View style={styles.roundCompletedCard}>
            <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.roundCompletedKicker}>
              MATCHFLOW UPDATE
            </ThemedText>
            <ThemedText darkColor="#F4FBFF" lightColor="#102A43" style={styles.roundCompletedTitle}>
              {roundTransitionMessage.title}
            </ThemedText>
            <ThemedText darkColor="#A7C5D6" lightColor="#48697D" style={styles.roundCompletedSubtitle}>
              {roundTransitionMessage.subtitle}
            </ThemedText>
          </View>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Round Info */}
        <View style={{ marginVertical: 16 }}>
          <ThemedText type="subtitle">
            Round {state.round} / {state.maxRounds}
          </ThemedText>
          <ThemedText style={{ fontSize: 14, marginTop: 4 }}>
            Status: {state.status}
          </ThemedText>
        </View>

        {/* Players List */}
        <ThemedText type="subtitle" style={{ marginTop: 20, marginBottom: 12 }}>
          Players
        </ThemedText>
        <View style={styles.readyCounterCard}>
          <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.readyCounterLabel}>
            LOBBY STATUS
          </ThemedText>
          <ThemedText darkColor="#F4FBFF" lightColor="#102A43" style={styles.readyCounterValue}>
            {lobbyStatusText}
          </ThemedText>
        </View>
        {state.players.map((player) => (
          <View
            key={player.id}
            style={[
              styles.playerCard,
              player.name === playerName ? styles.playerCardCurrent : undefined,
            ]}
          >
            <View>
              <ThemedText darkColor="#F4FBFF" lightColor="#102A43" style={styles.playerName}>
                {player.name} {player.isReady || (player.name === playerName && isReadyPending) ? '✓' : ''}
              </ThemedText>
              <ThemedText darkColor="#89A8BA" lightColor="#4D697A" style={styles.playerStatus}>
                {state.byePlayerId === player.id
                  ? 'Bye this round'
                  : player.isReady || (player.name === playerName && isReadyPending)
                    ? 'Ready'
                    : 'Not ready'}
              </ThemedText>
            </View>
            <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.playerScore}>
              {player.score}
            </ThemedText>
          </View>
        ))}

        {/* Dice Display */}
        {state.lastRollResult && (
          <>
            <ThemedText type="subtitle" style={{ marginTop: 20, marginBottom: 8 }}>
              Last Roll
            </ThemedText>
            {renderDice(state.lastRollResult.dice)}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <ThemedText>
                Combo: {state.lastRollResult.combo.toUpperCase()}
              </ThemedText>
              <ThemedText style={{ fontWeight: 'bold', fontSize: 18 }}>
                Score: {state.lastRollResult.score}
              </ThemedText>
            </View>
          </>
        )}

        {/* Action Buttons */}
        {state.status === 'waiting' && (
          <View style={styles.readySection}>
            <TouchableOpacity
              onPress={handleReady}
              disabled={effectiveCurrentPlayerIsReady}
              style={[
                styles.readyButton,
                effectiveCurrentPlayerIsReady ? styles.readyButtonWaiting : styles.readyButtonActive,
              ]}
            >
              <ThemedText
                darkColor={effectiveCurrentPlayerIsReady ? '#D6E6EF' : '#041017'}
                lightColor={effectiveCurrentPlayerIsReady ? '#102A43' : '#041017'}
                style={styles.readyButtonText}
              >
                {readyButtonLabel}
              </ThemedText>
            </TouchableOpacity>

            <ThemedText darkColor="#96B6C7" lightColor="#48697D" style={styles.readyHint}>
              {effectiveCurrentPlayerIsReady
                ? 'Your status is locked in. The game starts automatically when the lobby is ready.'
                : 'Mark yourself ready to let the room start once enough players are prepared.'}
            </ThemedText>
          </View>
        )}

        {state.status === 'playing' && (
          <View style={styles.rollSection}>
          <TouchableOpacity
            onPress={handleRoll}
            disabled={!canCurrentPlayerRoll}
            style={{
              backgroundColor: canCurrentPlayerRoll ? '#007AFF' : '#1F3645',
              paddingVertical: 14,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: 24,
              marginBottom: 10,
            }}
          >
            {isRolling ? (
              <ActivityIndicator color="white" />
            ) : (
              <ThemedText style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                🎲 {rollButtonLabel}
              </ThemedText>
            )}
          </TouchableOpacity>
          <ThemedText darkColor="#96B6C7" lightColor="#48697D" style={styles.readyHint}>
            {currentTurnPlayer
              ? `${currentTurnPlayer.name} is the active player for this throw.`
              : 'Waiting for the server to assign the next throw.'}
          </ThemedText>
          </View>
        )}

        {state.status === 'finished' && (
          <TouchableOpacity
            onPress={handleBackToRooms}
            style={{
              backgroundColor: '#007AFF',
              paddingVertical: 14,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: 24,
              marginBottom: 20,
            }}
          >
            <ThemedText style={{ color: 'white', fontWeight: 'bold' }}>
              Game Over - Back to Rooms
            </ThemedText>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  connectionBannerOverlay: {
    position: 'absolute',
    top: 22,
    left: 16,
    right: 16,
    zIndex: 30,
  },
  connectionBannerCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  connectionBannerInfo: {
    backgroundColor: 'rgba(9, 19, 30, 0.96)',
    borderColor: 'rgba(123, 247, 255, 0.22)',
  },
  connectionBannerSuccess: {
    backgroundColor: '#7BF7FF',
    borderColor: 'rgba(123, 247, 255, 0.4)',
  },
  connectionBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.rounded,
  },
  connectionBannerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  roundCompletedOverlay: {
    position: 'absolute',
    top: 92,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  roundCompletedCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(7, 16, 24, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.28)',
    shadowColor: '#40E9FF',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  roundCompletedKicker: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  roundCompletedTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    fontFamily: Fonts.rounded,
  },
  roundCompletedSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  playerCard: {
    backgroundColor: 'rgba(11, 19, 31, 0.9)',
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.12)',
  },
  playerCardCurrent: {
    borderLeftColor: '#7BF7FF',
    borderColor: 'rgba(123, 247, 255, 0.28)',
  },
  playerName: {
    fontWeight: '700',
    fontSize: 16,
  },
  playerStatus: {
    marginTop: 2,
    fontSize: 12,
  },
  playerScore: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  readyCounterCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(11, 19, 31, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.16)',
  },
  readyCounterLabel: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  readyCounterValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  readySection: {
    marginTop: 24,
    marginBottom: 20,
  },
  rollSection: {
    marginBottom: 20,
  },
  readyButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  readyButtonActive: {
    backgroundColor: '#7BF7FF',
  },
  readyButtonWaiting: {
    backgroundColor: '#1F3645',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.18)',
  },
  readyButtonText: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: Fonts.mono,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  readyHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
