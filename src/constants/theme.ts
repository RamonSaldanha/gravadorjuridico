import { MD3DarkTheme } from 'react-native-paper';

export const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6c63ff',
    primaryContainer: '#3d3878',
    secondary: '#03dac6',
    secondaryContainer: '#005047',
    background: '#1a1a2e',
    surface: '#16213e',
    surfaceVariant: '#1f2b47',
    error: '#cf6679',
    onPrimary: '#ffffff',
    onSecondary: '#000000',
    onBackground: '#e8e8e8',
    onSurface: '#e8e8e8',
    onSurfaceVariant: '#c0c0c0',
    outline: '#444466',
    elevation: {
      level0: 'transparent',
      level1: '#1e2a4a',
      level2: '#22305a',
      level3: '#263668',
      level4: '#2a3c76',
      level5: '#2e4284',
    },
  },
};

export const colors = theme.colors;
