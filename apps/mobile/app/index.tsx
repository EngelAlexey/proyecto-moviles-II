import { Redirect } from 'expo-router';

import { useAuthContext } from '../src/context/auth-context';

export default function IndexScreen() {
  const { playerName, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  return <Redirect href={playerName ? '/rooms' : '/login'} />;
}