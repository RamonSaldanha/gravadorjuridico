import { useRef, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useRecorder, formatDuration } from '../src/hooks/useRecorder';
import { createRecording, updateTranscription } from '../src/database/recordings';
import { colors } from '../src/constants/theme';

export default function RecordingScreen() {
  const router = useRouter();
  const {
    isRecording,
    isPaused,
    duration,
    liveTranscription,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useRecorder();

  const [hasStarted, setHasStarted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function handleStart() {
    try {
      await startRecording();
      setHasStarted(true);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível iniciar a gravação');
    }
  }

  async function handleStop() {
    Alert.alert(
      'Encerrar gravação',
      'Deseja encerrar e salvar esta gravação?',
      [
        { text: 'Continuar gravando', style: 'cancel' },
        {
          text: 'Encerrar',
          onPress: async () => {
            setIsSaving(true);
            try {
              const result = await stopRecording();
              const now = new Date();
              const title = `Atendimento ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

              const id = await createRecording(title, result.uri, result.duration, result.audioParts);

              // Save real-time transcription if available
              if (result.transcription) {
                await updateTranscription(id, result.transcription);
              }

              router.replace(`/detail/${id}`);
            } catch (error: any) {
              Alert.alert('Erro', error.message || 'Falha ao salvar gravação');
              setIsSaving(false);
            }
          },
        },
      ]
    );
  }

  async function handlePauseResume() {
    if (isPaused) {
      await resumeRecording();
    } else {
      await pauseRecording();
    }
  }

  return (
    <View style={styles.container}>
      {/* Timer */}
      <View style={styles.topSection}>
        <View style={styles.timerRow}>
          <View style={[styles.recordDot, isRecording && !isPaused && styles.recordDotActive]} />
          <Text style={styles.timerText}>{formatDuration(duration)}</Text>
          <Text style={styles.statusLabel}>
            {!hasStarted ? 'Pronto' : isPaused ? 'Pausado' : 'Gravando'}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {!hasStarted ? (
            <IconButton
              icon="microphone"
              size={48}
              iconColor={colors.onPrimary}
              style={styles.recordButton}
              onPress={handleStart}
            />
          ) : (
            <View style={styles.activeControls}>
              <IconButton
                icon={isPaused ? 'play' : 'pause'}
                size={32}
                iconColor={colors.onSurface}
                style={styles.controlButton}
                onPress={handlePauseResume}
              />
              <IconButton
                icon="stop"
                size={48}
                iconColor="#ffffff"
                style={styles.stopButton}
                onPress={handleStop}
                disabled={isSaving}
              />
              <View style={{ width: 48 }} />
            </View>
          )}
        </View>
      </View>

      {/* Live transcription */}
      <View style={styles.transcriptionSection}>
        <Text style={styles.transcriptionLabel}>
          {hasStarted ? 'Transcrição em tempo real' : 'A transcrição aparecerá aqui durante a gravação'}
        </Text>
        <ScrollView
          ref={scrollRef}
          style={styles.transcriptionScroll}
          contentContainerStyle={styles.transcriptionContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {liveTranscription ? (
            <Text style={styles.transcriptionText}>{liveTranscription}</Text>
          ) : hasStarted ? (
            <Text style={styles.transcriptionPlaceholder}>
              Transcrevendo em tempo real...
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  topSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  recordDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.outline,
  },
  recordDotActive: {
    backgroundColor: colors.error,
  },
  timerText: {
    fontSize: 36,
    fontWeight: '300',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  statusLabel: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  controls: {
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: colors.primary,
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  activeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    backgroundColor: colors.surfaceVariant,
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  stopButton: {
    backgroundColor: colors.error,
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  transcriptionSection: {
    flex: 1,
    marginTop: 12,
  },
  transcriptionLabel: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 8,
    textAlign: 'center',
  },
  transcriptionScroll: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  transcriptionContent: {
    padding: 16,
    flexGrow: 1,
  },
  transcriptionText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.onSurface,
  },
  transcriptionPlaceholder: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 40,
  },
});
