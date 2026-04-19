import { Stack } from 'expo-router';

export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#09131E',
        },
        headerTintColor: '#F4FBFF',
        headerTitleStyle: {
          color: '#F4FBFF',
          fontSize: 20,
          fontWeight: '700',
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: '#050B11',
        },
      }}
    >
      <Stack.Screen
        name="rooms"
        options={{
          title: 'Available Rooms',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="game"
        options={{
          title: 'Game Board',
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="results"
        options={{
          title: 'Round Results',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="history"
        options={{
          title: 'Game History',
          headerTitleAlign: 'center',
        }}
      />
    </Stack>
  );
}
