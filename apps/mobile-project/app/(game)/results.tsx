import { View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useGameState } from '../../src/hooks/use-game-state';

export default function ResultsScreen() {
  const router = useRouter();
  const { state } = useGameState();

  return (
    <ThemedView style={{ flex: 1, paddingHorizontal: 16 }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={{ marginVertical: 16, textAlign: 'center' }}>
          Round {state.round - 1} Results
        </ThemedText>

        {/* Players Final Scores */}
        <ThemedText type="subtitle" style={{ marginTop: 20, marginBottom: 12 }}>
          Final Standings
        </ThemedText>
        {state.players.map((player) => (
          <View
            key={player.id}
            style={{
              backgroundColor: '#f0f0f0',
              borderRadius: 8,
              padding: 12,
              marginVertical: 4,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <ThemedText style={{ fontWeight: 'bold' }}>{player.name}</ThemedText>
            <ThemedText style={{ fontSize: 16, fontWeight: 'bold' }}>
              {player.score}
            </ThemedText>
          </View>
        ))}

        <TouchableOpacity
          onPress={() => router.push('/game' as never)}
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
            Next Round
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}
