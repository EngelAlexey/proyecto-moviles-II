import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';

export default function NotFoundScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Ruta no encontrada</ThemedText>
      <ThemedText style={styles.description}>
        La pantalla solicitada no existe o la navegacion llego a una ruta invalida.
      </ThemedText>
      <Link href="/" style={styles.link}>
        Ir al inicio
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  description: {
    textAlign: 'center',
  },
  link: {
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});