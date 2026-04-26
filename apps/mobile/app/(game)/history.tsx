import { View, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useGameState } from '../../src/hooks/use-game-state';

type HistoryEntry = {
  sessionId: string;
  finalScores: Record<string, number>;
  winnerId: string;
  createdAt: Date;
};

export default function HistoryScreen() {
  const router = useRouter();
  const { state } = useGameState();

  const renderGameItem = ({ item, index }: { item: HistoryEntry; index: number }) => {
    const scores = Object.entries(item.finalScores).map(([name, score]) => ({
      name,
      score: score as number,
    }));

    const sortedScores = scores.sort((a, b) => b.score - a.score);

    return (
      <View
        style={{
          backgroundColor: '#f0f0f0',
          borderRadius: 8,
          padding: 12,
          marginVertical: 8,
        }}
      >
        <ThemedText style={{ fontWeight: 'bold', marginBottom: 8 }}>
          Game #{state.gameHistory.length - index}
        </ThemedText>

        <ThemedText style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          {new Date(item.createdAt).toLocaleString()}
        </ThemedText>

        {sortedScores.map((entry, idx) => (
          <View
            key={entry.name}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 4,
            }}
          >
            <ThemedText>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {entry.name}
            </ThemedText>
            <ThemedText style={{ fontWeight: 'bold' }}>{entry.score}</ThemedText>
          </View>
        ))}
      </View>
    );
  };

  return (
    <ThemedView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
      {state.gameHistory.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ThemedText style={{ fontSize: 16 }}>No games played yet</ThemedText>
        </View>
      ) : (
        <FlatList
          data={state.gameHistory}
          renderItem={renderGameItem}
          keyExtractor={(item) => item.sessionId}
          ListFooterComponent={
            <TouchableOpacity
              onPress={() => router.replace('/rooms' as never)}
              style={{
                backgroundColor: '#007AFF',
                paddingVertical: 14,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 20,
                marginBottom: 20,
              }}
            >
              <ThemedText style={{ color: 'white', fontWeight: 'bold' }}>
                Back to Rooms
              </ThemedText>
            </TouchableOpacity>
          }
        />
      )}
    </ThemedView>
  );
}
