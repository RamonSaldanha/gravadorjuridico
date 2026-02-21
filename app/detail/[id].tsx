import { useCallback, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, ToastAndroid, TextInput, Pressable } from 'react-native';
import { Text, Button, Card, ActivityIndicator, SegmentedButtons, IconButton } from 'react-native-paper';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { createAudioPlayer, useAudioPlayerStatus, AudioPlayer } from 'expo-audio';
import { getRecording, updateTranscription, updateDialogue, updateDossier, updateTitle, Recording } from '../../src/database/recordings';
import { transcribeAudio, transcribeAudioWithTimestamps, diarizeTranscription, generateDossier } from '../../src/services/ai';
import { getSettings } from '../../src/services/settings';
import { formatDuration } from '../../src/hooks/useRecorder';
import { DiarizedSegment, DiarizedTranscription, isDiarizedTranscription } from '../../src/constants/ai';
import { colors } from '../../src/constants/theme';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

// ─── Audio Player (single file) ───

function AudioPlayerBar({ filePath, onShare }: { filePath: string; onShare: () => void }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [player, setPlayer] = useState<AudioPlayer | null>(null);

  useEffect(() => {
    if (!filePath) return;
    const p = createAudioPlayer({ uri: filePath });
    playerRef.current = p;
    setPlayer(p);
    return () => { p.release(); };
  }, [filePath]);

  if (!player) return null;

  return <AudioPlayerControls player={player} onShare={onShare} />;
}

function AudioPlayerControls({ player, onShare }: { player: AudioPlayer; onShare: () => void }) {
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const currentSec = Math.floor(status.currentTime ?? 0);
  const totalSec = Math.floor(status.duration ?? 0);

  return (
    <Card style={styles.playerCard}>
      <Card.Content style={styles.playerContent}>
        <Text style={styles.playerTime}>
          {formatDuration(currentSec)} / {formatDuration(totalSec)}
        </Text>
        <View style={styles.playerControls}>
          <IconButton
            icon="rewind-10"
            size={24}
            iconColor={colors.onSurface}
            onPress={() => player.seekTo(Math.max(0, currentSec - 10))}
          />
          <IconButton
            icon={isPlaying ? 'pause-circle' : 'play-circle'}
            size={40}
            iconColor={colors.primary}
            onPress={() => isPlaying ? player.pause() : player.play()}
          />
          <IconButton
            icon="fast-forward-10"
            size={24}
            iconColor={colors.onSurface}
            onPress={() => player.seekTo(Math.min(totalSec, currentSec + 10))}
          />
          <IconButton
            icon="share-variant"
            size={22}
            iconColor={colors.onSurfaceVariant}
            onPress={onShare}
          />
        </View>
      </Card.Content>
    </Card>
  );
}

// ─── Chat View ───

function ChatView({ segments }: { segments: DiarizedSegment[] }) {
  const speakerColors: Record<string, { bg: string; text: string; align: 'flex-start' | 'flex-end' }> = {};
  const palette = [
    { bg: colors.primary + '20', text: colors.primary },
    { bg: colors.secondary + '20', text: colors.secondary },
    { bg: '#E8F5E9', text: '#2E7D32' },
    { bg: '#FFF3E0', text: '#E65100' },
  ];

  let colorIdx = 0;
  segments.forEach(seg => {
    if (!speakerColors[seg.speaker]) {
      const color = palette[colorIdx % palette.length];
      speakerColors[seg.speaker] = {
        bg: color.bg,
        text: color.text,
        align: colorIdx === 0 ? 'flex-end' : 'flex-start',
      };
      colorIdx++;
    }
  });

  return (
    <View style={chatStyles.container}>
      {segments.map((seg, idx) => {
        const sc = speakerColors[seg.speaker];
        const isRight = sc.align === 'flex-end';
        const showSpeaker = idx === 0 || segments[idx - 1].speaker !== seg.speaker;

        return (
          <View key={idx} style={[chatStyles.row, { justifyContent: sc.align }]}>
            <View style={[chatStyles.bubble, { backgroundColor: sc.bg, maxWidth: '85%' }]}>
              {showSpeaker && (
                <Text style={[chatStyles.speaker, { color: sc.text }]}>{seg.speaker}</Text>
              )}
              <Text style={chatStyles.messageText}>{seg.text}</Text>
              <Text style={[chatStyles.timestamp, { textAlign: isRight ? 'right' : 'left' }]}>
                {seg.start}{seg.end && seg.end !== seg.start ? ` - ${seg.end}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ───

type TabValue = 'transcription' | 'dialogue' | 'dossier';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [tab, setTab] = useState<TabValue>('transcription');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isDiarizing, setIsDiarizing] = useState(false);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadRecording();
    }, [id])
  );

  async function loadRecording() {
    if (!id) return;
    const data = await getRecording(parseInt(id));
    setRecording(data);
  }

  const isBusy = isTranscribing || isDiarizing || isGeneratingDossier;

  function startEditingTitle() {
    if (!recording) return;
    setEditTitle(recording.title);
    setIsEditingTitle(true);
  }

  async function saveTitle() {
    if (!recording) return;
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== recording.title) {
      await updateTitle(recording.id, trimmed);
      await loadRecording();
    }
    setIsEditingTitle(false);
  }

  // ─── Actions ───

  async function handleTranscribe() {
    if (!recording) return;
    const settings = await getSettings();
    if (!settings.apiKey) {
      Alert.alert('Configuração necessária', 'Configure sua chave de API em Configurações.');
      return;
    }

    setIsTranscribing(true);
    try {
      setProgressText('Transcrevendo áudio na íntegra...');
      const transcription = await transcribeAudio(
        settings.provider,
        settings.apiKey,
        recording.file_path,
        settings.transcriptionModel
      );
      await updateTranscription(recording.id, transcription);
      await loadRecording();
      setTab('transcription');
      Alert.alert('Sucesso', 'Transcrição concluída!');
    } catch (error: any) {
      Alert.alert('Erro na transcrição', error.message || 'Falha ao transcrever');
    } finally {
      setIsTranscribing(false);
      setProgressText('');
    }
  }

  async function handleDiarize() {
    if (!recording) return;
    const settings = await getSettings();
    if (!settings.apiKey) {
      Alert.alert('Configuração necessária', 'Configure sua chave de API em Configurações.');
      return;
    }

    setIsDiarizing(true);
    try {
      // Step 1: Transcribe full audio with timestamps
      setProgressText('Transcrevendo áudio na íntegra...');
      const result = await transcribeAudioWithTimestamps(
        settings.provider,
        settings.apiKey,
        recording.file_path,
        settings.transcriptionModel
      );

      // Step 2: Diarize with LLM
      setProgressText('Identificando interlocutores...');
      const diarizedSegments = await diarizeTranscription(
        settings.provider,
        settings.apiKey,
        result.segments,
        settings.dossierModel
      );

      const diarizedResult: DiarizedTranscription = {
        diarized: true,
        segments: diarizedSegments,
        plainText: result.plainText || '',
      };

      await updateDialogue(recording.id, JSON.stringify(diarizedResult));

      // Also save plain transcription if not exists
      if (!recording.transcription) {
        await updateTranscription(recording.id, diarizedResult.plainText);
      }

      await loadRecording();
      setTab('dialogue');
      Alert.alert('Sucesso', 'Diálogo gerado com identificação de interlocutores!');
    } catch (error: any) {
      Alert.alert('Erro na diarização', error.message || 'Falha ao gerar diálogo');
    } finally {
      setIsDiarizing(false);
      setProgressText('');
    }
  }

  async function handleGenerateDossier() {
    if (!recording) return;
    const settings = await getSettings();
    if (!settings.apiKey) {
      Alert.alert('Configuração necessária', 'Configure sua chave de API em Configurações.');
      return;
    }

    setIsGeneratingDossier(true);
    try {
      // If no transcription yet, transcribe full audio first
      let transcriptionText = recording.transcription;
      if (!transcriptionText) {
        setProgressText('Transcrevendo áudio na íntegra...');
        transcriptionText = await transcribeAudio(
          settings.provider,
          settings.apiKey,
          recording.file_path,
          settings.transcriptionModel
        );
        await updateTranscription(recording.id, transcriptionText);
      }

      setProgressText('Gerando dossiê...');
      const dossier = await generateDossier(
        settings.provider,
        settings.apiKey,
        transcriptionText,
        settings.dossierModel
      );

      await updateDossier(recording.id, dossier);
      await loadRecording();
      setTab('dossier');
      Alert.alert('Sucesso', 'Dossiê gerado!');
    } catch (error: any) {
      Alert.alert('Erro ao gerar dossiê', error.message || 'Falha ao gerar o dossiê');
    } finally {
      setIsGeneratingDossier(false);
      setProgressText('');
    }
  }

  // ─── Copy & Share ───

  function getActiveTabText(): string | null {
    if (!recording) return null;
    if (tab === 'transcription') return recording.transcription;
    if (tab === 'dialogue') {
      const d = isDiarizedTranscription(recording.dialogue);
      if (!d) return null;
      return d.segments.map(s => `[${s.start}] ${s.speaker}: ${s.text}`).join('\n');
    }
    if (tab === 'dossier') return recording.dossier;
    return null;
  }

  async function handleCopy() {
    const text = getActiveTabText();
    if (!text) return;
    await Clipboard.setStringAsync(text);
    ToastAndroid.show('Copiado!', ToastAndroid.SHORT);
  }

  async function handleShareAudio() {
    if (!recording?.file_path) return;
    try {
      await Sharing.shareAsync(recording.file_path, {
        mimeType: 'audio/m4a',
        dialogTitle: `Áudio - ${recording.title}`,
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível compartilhar o áudio');
    }
  }

  async function handleExportPDF() {
    if (!recording) return;

    let contentHtml: string;
    let title: string;

    if (tab === 'dossier' && recording.dossier) {
      title = 'Dossiê';
      contentHtml = `<div>${recording.dossier.replace(/\n/g, '<br/>')}</div>`;
    } else if (tab === 'dialogue' && recording.dialogue) {
      title = 'Diálogo';
      const d = isDiarizedTranscription(recording.dialogue);
      if (d) {
        contentHtml = d.segments.map(seg =>
          `<div style="margin-bottom: 12px;">
            <strong style="color: #6c63ff;">${seg.speaker}</strong>
            <span style="color: #999; font-size: 12px; margin-left: 8px;">${seg.start}${seg.end && seg.end !== seg.start ? ` - ${seg.end}` : ''}</span>
            <p style="margin: 4px 0 0 0;">${seg.text}</p>
          </div>`
        ).join('');
      } else {
        contentHtml = `<div>${recording.dialogue.replace(/\n/g, '<br/>')}</div>`;
      }
    } else {
      title = 'Transcrição';
      contentHtml = `<div>${(recording.transcription || '').replace(/\n/g, '<br/>')}</div>`;
    }

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            h1 { color: #1a1a2e; border-bottom: 2px solid #6c63ff; padding-bottom: 8px; }
            .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
          </style>
        </head>
        <body>
          <h1>${title} - ${recording.title}</h1>
          <p class="meta">
            Data: ${new Date(recording.created_at).toLocaleDateString('pt-BR')} |
            Duração: ${formatDuration(recording.duration)}
          </p>
          ${contentHtml}
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `${title} - ${recording.title}`,
      });
    } catch {
      Alert.alert('Erro', 'Falha ao exportar PDF');
    }
  }

  // ─── Render ───

  if (!recording) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const hasTranscription = !!recording.transcription;
  const hasDialogue = !!recording.dialogue;
  const hasDossier = !!recording.dossier;
  const hasAnyContent = hasTranscription || hasDialogue || hasDossier;
  const diarized = isDiarizedTranscription(recording.dialogue);
  const activeTabHasContent = getActiveTabText();

  return (
    <View style={styles.container}>
      {/* Info Card */}
      <Card style={styles.infoCard}>
        <Card.Content>
          {isEditingTitle ? (
            <View style={styles.titleEditRow}>
              <TextInput
                style={styles.titleInput}
                value={editTitle}
                onChangeText={setEditTitle}
                onSubmitEditing={saveTitle}
                onBlur={saveTitle}
                autoFocus
                selectTextOnFocus
              />
              <IconButton
                icon="check"
                size={20}
                iconColor={colors.primary}
                onPress={saveTitle}
                style={{ margin: 0 }}
              />
            </View>
          ) : (
            <Pressable onPress={startEditingTitle} style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>{recording.title}</Text>
              <IconButton
                icon="pencil-outline"
                size={16}
                iconColor={colors.onSurfaceVariant}
                style={{ margin: 0 }}
                onPress={startEditingTitle}
              />
            </Pressable>
          )}
          <Text style={styles.meta}>
            {new Date(recording.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            {' • '}{formatDuration(recording.duration)}
          </Text>
        </Card.Content>
      </Card>

      {/* Audio Player */}
      <AudioPlayerBar filePath={recording.file_path} onShare={handleShareAudio} />

      {/* Action Buttons */}
      <View style={styles.actions}>
        <Text style={styles.actionsLabel}>Gerar:</Text>
        <View style={styles.actionsRow}>
          <Button
            mode="contained"
            onPress={handleTranscribe}
            loading={isTranscribing}
            disabled={isBusy}
            style={styles.actionButton}
            buttonColor={colors.primary}
            compact
          >
            Transcrição
          </Button>
          <Button
            mode="contained"
            onPress={handleDiarize}
            loading={isDiarizing}
            disabled={isBusy}
            style={styles.actionButton}
            buttonColor="#2E7D32"
            compact
          >
            Diálogo
          </Button>
          <Button
            mode="contained"
            onPress={handleGenerateDossier}
            loading={isGeneratingDossier}
            disabled={isBusy}
            style={styles.actionButton}
            buttonColor={colors.secondary}
            textColor={colors.onSecondary}
            compact
          >
            Dossiê
          </Button>
        </View>
      </View>

      {/* Tabs + Content */}
      {hasAnyContent && (
        <>
          <SegmentedButtons
            value={tab}
            onValueChange={(v) => setTab(v as TabValue)}
            buttons={[
              { value: 'transcription', label: 'Transcrição', disabled: !hasTranscription },
              { value: 'dialogue', label: 'Diálogo', disabled: !hasDialogue },
              { value: 'dossier', label: 'Dossiê', disabled: !hasDossier },
            ]}
            style={styles.tabs}
          />

          <View style={styles.contentHeader}>
            {activeTabHasContent && (
              <IconButton
                icon="content-copy"
                size={20}
                iconColor={colors.primary}
                onPress={handleCopy}
                style={styles.copyButton}
              />
            )}
          </View>

          <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
            {tab === 'transcription' && (
              <Text style={styles.contentText}>{recording.transcription}</Text>
            )}
            {tab === 'dialogue' && diarized && (
              <ChatView segments={diarized.segments} />
            )}
            {tab === 'dossier' && (
              <Text style={styles.contentText}>{recording.dossier}</Text>
            )}
          </ScrollView>

          <Button
            mode="outlined"
            icon="file-pdf-box"
            onPress={handleExportPDF}
            style={styles.exportButton}
            textColor={colors.primary}
          >
            Exportar PDF
          </Button>
        </>
      )}

      {/* Empty / Loading States */}
      {!hasAnyContent && !isBusy && (
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText}>
            Use os botões acima para transcrever, gerar diálogo ou dossiê
          </Text>
        </View>
      )}

      {isBusy && (
        <View style={styles.emptyContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.emptyText}>
            {progressText || (isTranscribing ? 'Transcrevendo...' : isDiarizing ? 'Gerando diálogo...' : 'Gerando dossiê...')}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───

const chatStyles = StyleSheet.create({
  container: { gap: 6 },
  row: { flexDirection: 'row', paddingHorizontal: 4 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  speaker: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  messageText: { fontSize: 14, lineHeight: 20, color: colors.onSurface },
  timestamp: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4, opacity: 0.7 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.onSurface,
    flex: 1,
  },
  titleEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.onSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
  },
  meta: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  playerCard: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    marginBottom: 12,
  },
  playerContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  playerTime: {
    fontSize: 14,
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  playerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginBottom: 12,
  },
  actionsLabel: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    borderRadius: 8,
    flex: 1,
  },
  tabs: {
    marginBottom: 8,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  copyButton: {
    margin: 0,
  },
  contentScroll: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
  },
  contentContainer: {
    padding: 16,
  },
  contentText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.onSurface,
  },
  exportButton: {
    borderColor: colors.primary,
    borderRadius: 8,
    marginBottom: 8,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
