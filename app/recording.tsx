import { useRef, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView, Pressable } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useRecorder, formatDuration } from '../src/hooks/useRecorder';
import { createRecording, updateTranscription, updateTitle } from '../src/database/recordings';
import { generateTitle } from '../src/services/ai';
import { getSettings } from '../src/services/settings';
import { colors } from '../src/constants/theme';

export default function RecordingScreen() {
  const router = useRouter();
  const {
    isRecording,
    isPaused,
    duration,
    liveTranscription,
    isLiveTranscriptionOn,
    toggleLiveTranscription,
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
              const dateStr = now.toLocaleDateString('pt-BR');
              const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const title = `Atendimento ${dateStr} ${timeStr}`;

              const id = await createRecording(title, result.uri, result.duration, result.audioParts);

              // Save real-time transcription if available
              if (result.transcription) {
                await updateTranscription(id, result.transcription);
              }

              // Generate AI title in background (non-blocking)
              if (result.transcription) {
                getSettings().then(settings => {
                  if (!settings.apiKey) return;
                  generateTitle(
                    settings.provider,
                    settings.apiKey,
                    result.transcription,
                    settings.dossierModel
                  ).then(aiTitle => {
                    if (aiTitle) {
                      const finalTitle = `${aiTitle} — ${dateStr} ${timeStr}`;
                      updateTitle(id, finalTitle);
                    }
                  }).catch(() => {});
                }).catch(() => {});
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
        {hasStarted ? (
          <Pressable onPress={toggleLiveTranscription} style={styles.transcriptionHeader}>
            <Text style={styles.transcriptionHeaderLabel}>Transcrição em tempo real</Text>
            <View style={[styles.toggleBadge, !isLiveTranscriptionOn && styles.toggleBadgeOff]}>
              <Text style={styles.toggleBadgeText}>
                {isLiveTranscriptionOn ? 'ON' : 'OFF'}
              </Text>
            </View>
          </Pressable>
        ) : (
          <Text style={styles.transcriptionLabel}>
            A transcrição aparecerá aqui durante a gravação
          </Text>
        )}
        <ScrollView
          ref={scrollRef}
          style={styles.transcriptionScroll}
          contentContainerStyle={styles.transcriptionContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!hasStarted ? null : !isLiveTranscriptionOn ? (
            <Text style={styles.transcriptionPlaceholder}>
              Transcrição em tempo real desativada{'\n'}(economizando tokens)
            </Text>
          ) : liveTranscription ? (
            <Text style={styles.transcriptionText}>{liveTranscription}</Text>
          ) : (
            <Text style={styles.transcriptionPlaceholder}>
              Transcrevendo em tempo real...
            </Text>
          )}
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
  transcriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  transcriptionHeaderLabel: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  transcriptionLabel: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 8,
  },
  toggleBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  toggleBadgeOff: {
    backgroundColor: colors.outline,
  },
  toggleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
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
