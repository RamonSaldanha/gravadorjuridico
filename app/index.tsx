import { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { FAB, Card, Text, IconButton, Chip, Divider } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { getAllRecordings, deleteRecording, getAudioParts, Recording } from '../src/database/recordings';
import { formatDuration } from '../src/hooks/useRecorder';
import { colors } from '../src/constants/theme';
import { File as FSFile } from 'expo-file-system';

export default function HomeScreen() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadRecordings();
    }, [])
  );

  async function loadRecordings() {
    const data = await getAllRecordings();
    setRecordings(data);
  }

  function getStatusChips(recording: Recording) {
    const chips = [];
    if (recording.transcription) {
      chips.push(<Chip key="t" icon="text" compact textStyle={styles.chipText} style={[styles.chip, styles.chipTranscription]}>Transcrito</Chip>);
    }
    if (recording.dialogue) {
      chips.push(<Chip key="d" icon="forum" compact textStyle={styles.chipText} style={[styles.chip, styles.chipDialogue]}>Diálogo</Chip>);
    }
    if (recording.dossier) {
      chips.push(<Chip key="do" icon="check-circle" compact textStyle={styles.chipText} style={[styles.chip, styles.chipDossier]}>Dossiê</Chip>);
    }
    if (chips.length === 0) {
      chips.push(<Chip key="r" icon="microphone" compact textStyle={styles.chipText} style={[styles.chip, styles.chipRecorded]}>Gravado</Chip>);
    }
    return chips;
  }

  function handleDelete(recording: Recording) {
    Alert.alert(
      'Excluir gravação',
      `Deseja excluir "${recording.title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete the main audio file
              const mainFile = new FSFile(recording.file_path);
              if (mainFile.exists) mainFile.delete();

              // Delete chunk parts if they exist
              const parts = getAudioParts(recording);
              for (const partUri of parts) {
                if (partUri === recording.file_path) continue;
                const file = new FSFile(partUri);
                if (file.exists) file.delete();
              }
            } catch {}
            await deleteRecording(recording.id);
            loadRecordings();
          },
        },
      ]
    );
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <View style={styles.container}>
      {recordings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎙️</Text>
          <Text style={styles.emptyTitle}>Nenhuma gravação</Text>
          <Text style={styles.emptySubtitle}>
            Toque no botão abaixo para iniciar sua primeira gravação
          </Text>
        </View>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Card
              style={styles.card}
              onPress={() => router.push(`/detail/${item.id}`)}
            >
              <Card.Content style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {formatDate(item.created_at)} • {formatDuration(item.duration)}
                    </Text>
                  </View>
                  <IconButton
                    icon="delete-outline"
                    iconColor={colors.error}
                    size={20}
                    onPress={() => handleDelete(item)}
                  />
                </View>
                <View style={styles.chipRow}>
                  {getStatusChips(item)}
                </View>
              </Card.Content>
            </Card>
          )}
        />
      )}

      <FAB
        icon="microphone"
        label="Gravar"
        style={styles.fab}
        color={colors.onPrimary}
        onPress={() => router.push('/recording')}
      />

      <FAB
        icon="cog"
        style={styles.fabSettings}
        size="small"
        color={colors.onSurface}
        onPress={() => router.push('/settings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  cardContent: {
    paddingVertical: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onSurface,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    height: 28,
  },
  chipText: {
    fontSize: 11,
  },
  chipRecorded: {
    backgroundColor: colors.surfaceVariant,
  },
  chipTranscription: {
    backgroundColor: '#1a4a3a',
  },
  chipDialogue: {
    backgroundColor: '#1a3a4a',
  },
  chipDossier: {
    backgroundColor: '#3d3878',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.onSurface,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: colors.primary,
  },
  fabSettings: {
    position: 'absolute',
    left: 16,
    bottom: 24,
    backgroundColor: colors.surfaceVariant,
  },
});
