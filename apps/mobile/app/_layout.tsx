import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import 'react-native-reanimated';

import { AuthProvider, useAuthContext } from '../src/context/auth-context';
import { GameProvider } from '../src/context/game-context';
import { RealtimeProvider } from '../src/context/realtime-context';
import { useColorScheme } from '../hooks/use-color-scheme';

function RootLayoutNav() {
  const { isLoading } = useAuthContext();

  if (isLoading) {
    return null; // Show splash screen
  }

  return (
    <Stack>
      <Stack.Screen
        name="(auth)"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="(game)"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="modal"
        options={{
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RealtimeProvider>
        <AuthProvider>
          <GameProvider>
            <RootLayoutNav />
          </GameProvider>
        </AuthProvider>
      </RealtimeProvider>
    </ThemeProvider>
  );
}
