import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../src/constants/theme';

export default function RootLayout() {
  return (
    <PaperProvider theme={theme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'Gravador Jurídico' }}
        />
        <Stack.Screen
          name="recording"
          options={{ title: 'Gravando', headerBackTitle: 'Voltar' }}
        />
        <Stack.Screen
          name="detail/[id]"
          options={{ title: 'Detalhes', headerBackTitle: 'Voltar' }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: 'Configurações', headerBackTitle: 'Voltar' }}
        />
        <Stack.Screen
          name="audio-test"
          options={{ title: 'Teste de Áudio', headerBackTitle: 'Voltar' }}
        />
      </Stack>
    </PaperProvider>
  );
}
