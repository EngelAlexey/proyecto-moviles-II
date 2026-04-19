import { useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Fonts } from '../../constants/theme';
import { useAuthContext } from '../../src/context/auth-context';

export default function LoginScreen() {
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setPlayerName: savePlayerName } = useAuthContext();

  const handleJoin = async () => {
    if (!playerName.trim()) {
      setError('Please enter a player name');
      return;
    }

    if (playerName.length < 2 || playerName.length > 20) {
      setError('Name must be 2-20 characters');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await savePlayerName(playerName.trim());
      router.replace('/rooms' as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <ThemedView style={styles.screen}>
        <View style={styles.backgroundOrbPrimary} />
        <View style={styles.backgroundOrbSecondary} />

        <View style={styles.content}>
          <View style={styles.heroBadge}>
            <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.heroBadgeText}>
              NEON LOBBY
            </ThemedText>
          </View>

          <ThemedText type="title" darkColor="#F4FBFF" lightColor="#0D1B2A" style={styles.title}>
            Dado Triple
          </ThemedText>

          <ThemedText darkColor="#A9C6D8" lightColor="#335C67" style={styles.subtitle}>
            Enter your callsign and sync into the next live room.
          </ThemedText>

          <View style={styles.panel}>
            <ThemedText darkColor="#7BF7FF" lightColor="#0A7EA4" style={styles.fieldLabel}>
              PLAYER ID
            </ThemedText>

            <TextInput
              style={styles.input}
              placeholder="Player name..."
              value={playerName}
              onChangeText={setPlayerName}
              editable={!isLoading}
              maxLength={20}
              placeholderTextColor="#6C8A9D"
              selectionColor="#7BF7FF"
            />

            {error ? (
              <ThemedText lightColor="#B42318" darkColor="#FF8A8A" style={styles.errorText}>
                {error}
              </ThemedText>
            ) : null}

            <TouchableOpacity
              onPress={handleJoin}
              disabled={isLoading}
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            >
              {isLoading ? (
                <ActivityIndicator color="#041017" />
              ) : (
                <Text style={styles.primaryButtonText}>Join Game</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backgroundOrbPrimary: {
    position: 'absolute',
    top: 90,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(55, 210, 255, 0.12)',
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    bottom: 110,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(147, 88, 255, 0.10)',
  },
  heroBadge: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.45)',
    backgroundColor: 'rgba(8, 16, 24, 0.7)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 18,
  },
  heroBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 14,
    fontFamily: Fonts.rounded,
    letterSpacing: 1.2,
    fontSize: 38,
    lineHeight: 42,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 30,
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    borderRadius: 22,
    padding: 22,
    backgroundColor: 'rgba(11, 19, 31, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.22)',
    shadowColor: '#40E9FF',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  fieldLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 2.2,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(123, 247, 255, 0.35)',
    backgroundColor: 'rgba(19, 31, 48, 0.95)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    fontSize: 17,
    color: '#F4FBFF',
    fontFamily: Fonts.mono,
  },
  errorText: {
    marginBottom: 14,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#7BF7FF',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#041017',
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    fontFamily: Fonts.mono,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
