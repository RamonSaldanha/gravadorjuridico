import { useState, useRef } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton, Button, SegmentedButtons, Divider } from 'react-native-paper';
import { AudioModule, type RecordingOptions, createAudioPlayer } from 'expo-audio';
import { IOSOutputFormat, AudioQuality } from 'expo-audio/src/RecordingConstants';
import { Paths, File, Directory } from 'expo-file-system';
import { colors } from '../src/constants/theme';

type AudioProfile = 'raw' | 'voice_comm' | 'voice_recog';

const PROFILES: Record<AudioProfile, { label: string; description: string; preset: RecordingOptions }> = {
  raw: {
    label: 'Sem processamento',
    description: 'Áudio cru do microfone, sem filtros (padrão anterior)',
    preset: {
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 256000,
      android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
      ios: {
        outputFormat: IOSOutputFormat.MPEG4AAC,
        audioQuality: AudioQuality.MAX,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: { mimeType: 'audio/webm', bitsPerSecond: 256000 },
    },
  },
  voice_comm: {
    label: 'Comunicação de voz',
    description: 'Cancelamento de eco + AGC (similar ao WhatsApp)',
    preset: {
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 256000,
      android: { outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: 'voice_communication' },
      ios: {
        outputFormat: IOSOutputFormat.MPEG4AAC,
        audioQuality: AudioQuality.MAX,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: { mimeType: 'audio/webm', bitsPerSecond: 256000 },
    },
  },
  voice_recog: {
    label: 'Reconhecimento de voz',
    description: 'Otimizado para transcrição por IA',
    preset: {
      extension: '.m4a',
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 96000,
      android: { outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: 'voice_recognition' },
      ios: {
        outputFormat: IOSOutputFormat.MPEG4AAC,
        audioQuality: AudioQuality.HIGH,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: { mimeType: 'audio/webm', bitsPerSecond: 96000 },
    },
  },
};

function getTestDir(): Directory {
  const dir = new Directory(Paths.cache, 'audio_test');
  if (!dir.exists) dir.create();
  return dir;
}

type TestResult = {
  profile: AudioProfile;
  uri: string;
  duration: number;
  fileSize: number;
};

export default function AudioTestScreen() {
  const [selectedProfile, setSelectedProfile] = useState<AudioProfile>('voice_comm');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  const recorderRef = useRef<any>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  async function startTest() {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) return;

    await AudioModule.setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
    });

    const profile = PROFILES[selectedProfile];
    const recorder = new AudioModule.AudioRecorder(profile.preset);
    await recorder.prepareToRecordAsync();
    recorderRef.current = recorder;

    setDuration(0);
    durationRef.current = 0;
    setIsRecording(true);

    recorder.record();

    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);
    }, 1000);
  }

  async function stopTest() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = recorderRef.current;
    if (!recorder) return;

    const uri = recorder.uri;
    await recorder.stop();
    recorderRef.current = null;
    setIsRecording(false);

    if (!uri) return;

    const sourceUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    const sourceFile = new File(sourceUri);
    if (!sourceFile.exists) return;

    const testDir = getTestDir();
    const destFile = new File(testDir, `test_${selectedProfile}_${Date.now()}.m4a`);
    sourceFile.move(destFile);

    const fileSize = destFile.size || 0;

    setResults(prev => [
      {
        profile: selectedProfile,
        uri: destFile.uri,
        duration: durationRef.current,
        fileSize,
      },
      ...prev,
    ]);
  }

  async function playResult(index: number) {
    // Stop any currently playing audio
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }

    const result = results[index];
    if (!result) return;

    await AudioModule.setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });

    const player = createAudioPlayer(result.uri);
    playerRef.current = player;
    setIsPlaying(true);
    setPlayingIndex(index);

    player.addListener('playbackStatusUpdate', (status: any) => {
      if (!status.isLoaded || status.didJustFinish) {
        setIsPlaying(false);
        setPlayingIndex(null);
      }
    });

    player.play();
  }

  function stopPlayback() {
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }
    setIsPlaying(false);
    setPlayingIndex(null);
  }

  function clearResults() {
    stopPlayback();
    const testDir = getTestDir();
    if (testDir.exists) {
      testDir.delete();
      testDir.create();
    }
    setResults([]);
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  const profileInfo = PROFILES[selectedProfile];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile selector */}
        <Text style={styles.sectionTitle}>Perfil de captura</Text>
        <SegmentedButtons
          value={selectedProfile}
          onValueChange={(v) => setSelectedProfile(v as AudioProfile)}
          buttons={[
            { value: 'raw', label: 'Cru' },
            { value: 'voice_comm', label: 'VoIP' },
            { value: 'voice_recog', label: 'STT' },
          ]}
          style={styles.segmented}
          density="small"
        />
        <Text style={styles.profileDesc}>{profileInfo.description}</Text>

        {/* Recording controls */}
        <View style={styles.recordSection}>
          <Text style={styles.timer}>{formatDuration(duration)}</Text>
          {!isRecording ? (
            <IconButton
              icon="microphone"
              size={40}
              iconColor={colors.onPrimary}
              style={styles.recordButton}
              onPress={startTest}
            />
          ) : (
            <IconButton
              icon="stop"
              size={40}
              iconColor="#ffffff"
              style={styles.stopButton}
              onPress={stopTest}
            />
          )}
          <Text style={styles.hint}>
            {isRecording ? 'Gravando... Fale normalmente' : 'Grave um trecho de teste (5-10s)'}
          </Text>
        </View>

        <Divider style={styles.divider} />

        {/* Results */}
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionTitle}>Gravações de teste</Text>
          {results.length > 0 && (
            <Button mode="text" compact onPress={clearResults} textColor={colors.error}>
              Limpar
            </Button>
          )}
        </View>

        {results.length === 0 ? (
          <Text style={styles.emptyText}>
            Grave trechos com diferentes perfis e compare a qualidade reproduzindo cada um.
          </Text>
        ) : (
          results.map((result, index) => (
            <View key={result.uri} style={styles.resultCard}>
              <View style={styles.resultInfo}>
                <Text style={styles.resultProfile}>{PROFILES[result.profile].label}</Text>
                <Text style={styles.resultMeta}>
                  {formatDuration(result.duration)} · {formatBytes(result.fileSize)}
                </Text>
              </View>
              <IconButton
                icon={playingIndex === index ? 'stop' : 'play'}
                size={28}
                iconColor={colors.primary}
                onPress={() => playingIndex === index ? stopPlayback() : playResult(index)}
              />
            </View>
          ))
        )}

        {/* Tips */}
        <View style={styles.tipsSection}>
          <Text style={styles.sectionTitle}>Dicas</Text>
          <Text style={styles.tipText}>
            {'• '}
            <Text style={{ fontWeight: 'bold' }}>VoIP (Comunicação)</Text>
            {' — Ativa cancelamento de eco e controle de ganho. Ideal para a maioria dos casos.'}
          </Text>
          <Text style={styles.tipText}>
            {'• '}
            <Text style={{ fontWeight: 'bold' }}>STT (Reconhecimento)</Text>
            {' — Otimizado para reconhecimento de fala. Melhor para transcrição em ambientes silenciosos.'}
          </Text>
          <Text style={styles.tipText}>
            {'• '}
            <Text style={{ fontWeight: 'bold' }}>Cru</Text>
            {' — Sem processamento. Útil como referência para comparação.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.onSurface,
    marginBottom: 8,
  },
  segmented: {
    marginBottom: 8,
  },
  profileDesc: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 16,
  },
  recordSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  timer: {
    fontSize: 32,
    fontWeight: '300',
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
    marginBottom: 12,
  },
  recordButton: {
    backgroundColor: colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  stopButton: {
    backgroundColor: colors.error,
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  hint: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 8,
  },
  divider: {
    marginVertical: 16,
    backgroundColor: colors.outline,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 20,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingLeft: 16,
    paddingVertical: 4,
    marginBottom: 8,
  },
  resultInfo: {
    flex: 1,
  },
  resultProfile: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  resultMeta: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  tipsSection: {
    marginTop: 24,
  },
  tipText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 8,
  },
});
