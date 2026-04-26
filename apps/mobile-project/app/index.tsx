import { Redirect } from 'expo-router';

import { useAuthContext } from '../src/context/auth-context';

export default function IndexScreen() {
  const { isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  return <Redirect href="/login" />;
}