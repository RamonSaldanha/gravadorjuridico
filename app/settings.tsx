import { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, RadioButton, Card, Divider, Switch } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { getSettings, getSettingsForProvider, saveSettings, AppSettings } from '../src/services/settings';
import { AI_PROVIDERS, AIProvider } from '../src/constants/ai';
import { colors } from '../src/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>({
    provider: 'openai',
    apiKey: '',
    transcriptionModel: 'gpt-4o-mini-transcribe',
    dossierModel: 'gpt-4.1-mini',
    liveTranscriptionEnabled: true,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  async function loadSettings() {
    const saved = await getSettings();
    setSettings(saved);
  }

  async function handleProviderChange(provider: string) {
    const p = provider as AIProvider;
    const config = AI_PROVIDERS[p];
    const saved = await getSettingsForProvider(p);
    setSettings({
      provider: p,
      apiKey: saved.apiKey,
      transcriptionModel: saved.transcriptionModel || config.transcriptionModels[0].id,
      dossierModel: saved.dossierModel || config.dossierModels[0].id,
    });
  }

  async function handleSave() {
    if (!settings.apiKey.trim()) {
      Alert.alert('Atenção', 'Insira sua chave de API antes de salvar.');
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings(settings);
      Alert.alert('Sucesso', 'Configurações salvas!');
    } catch (error) {
      Alert.alert('Erro', 'Falha ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  }

  const providerConfig = AI_PROVIDERS[settings.provider];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Provedor de IA</Text>
      <SegmentedButtons
        value={settings.provider}
        onValueChange={handleProviderChange}
        buttons={[
          { value: 'openai', label: 'OpenAI' },
          { value: 'gemini', label: 'Gemini' },
          { value: 'groq', label: 'Groq' },
        ]}
        style={styles.segmented}
      />

      <Text style={styles.sectionTitle}>Chave de API ({providerConfig.name})</Text>
      <TextInput
        mode="outlined"
        value={settings.apiKey}
        onChangeText={(text) => setSettings({ ...settings, apiKey: text })}
        placeholder={`Cole sua chave de API ${providerConfig.name}`}
        secureTextEntry={!showApiKey}
        right={
          <TextInput.Icon
            icon={showApiKey ? 'eye-off' : 'eye'}
            onPress={() => setShowApiKey(!showApiKey)}
          />
        }
        style={styles.input}
        outlineColor={colors.outline}
        activeOutlineColor={colors.primary}
        textColor={colors.onSurface}
        placeholderTextColor={colors.onSurfaceVariant}
      />

      <Divider style={styles.divider} />

      <Text style={styles.sectionTitle}>Modelo de Transcrição</Text>
      <Card style={styles.card}>
        <RadioButton.Group
          value={settings.transcriptionModel}
          onValueChange={(value) => setSettings({ ...settings, transcriptionModel: value })}
        >
          {providerConfig.transcriptionModels.map((model) => (
            <RadioButton.Item
              key={model.id}
              label={`${model.name} — ${model.description}`}
              value={model.id}
              labelStyle={styles.radioLabel}
              color={colors.primary}
              uncheckedColor={colors.onSurfaceVariant}
            />
          ))}
        </RadioButton.Group>
      </Card>

      <Text style={styles.sectionTitle}>Modelo do Dossiê</Text>
      <Card style={styles.card}>
        <RadioButton.Group
          value={settings.dossierModel}
          onValueChange={(value) => setSettings({ ...settings, dossierModel: value })}
        >
          {providerConfig.dossierModels.map((model) => (
            <RadioButton.Item
              key={model.id}
              label={`${model.name} — ${model.description}`}
              value={model.id}
              labelStyle={styles.radioLabel}
              color={colors.primary}
              uncheckedColor={colors.onSurfaceVariant}
            />
          ))}
        </RadioButton.Group>
      </Card>

      <Divider style={styles.divider} />

      <Text style={styles.sectionTitle}>Gravação</Text>
      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.switchTitle}>Transcrição em tempo real</Text>
            <Text style={styles.switchDescription}>
              Transcreve durante a gravação (consome tokens)
            </Text>
          </View>
          <Switch
            value={settings.liveTranscriptionEnabled}
            onValueChange={(value) => setSettings({ ...settings, liveTranscriptionEnabled: value })}
            color={colors.primary}
          />
        </View>
      </Card>

      <Button
        mode="contained"
        onPress={handleSave}
        loading={isSaving}
        style={styles.saveButton}
        buttonColor={colors.primary}
      >
        Salvar Configurações
      </Button>

      <Button
        mode="outlined"
        icon="microphone-settings"
        onPress={() => router.push('/audio-test')}
        style={styles.audioTestButton}
        textColor={colors.onSurface}
      >
        Teste de Qualidade de Áudio
      </Button>

      <Card style={styles.helpCard}>
        <Card.Content>
          <Text style={styles.helpTitle}>Como obter sua chave de API?</Text>
          {settings.provider === 'openai' && (
            <Text style={styles.helpText}>
              Acesse platform.openai.com → API Keys → Create new secret key
            </Text>
          )}
          {settings.provider === 'gemini' && (
            <Text style={styles.helpText}>
              Acesse aistudio.google.com → Get API Key → Create API key
            </Text>
          )}
          {settings.provider === 'groq' && (
            <Text style={styles.helpText}>
              Acesse console.groq.com → API Keys → Create API key
            </Text>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 8,
    marginTop: 16,
  },
  segmented: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
  },
  divider: {
    marginVertical: 16,
    backgroundColor: colors.outline,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 8,
  },
  radioLabel: {
    fontSize: 13,
    color: colors.onSurface,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  switchLabel: {
    flex: 1,
    marginRight: 12,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  switchDescription: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  saveButton: {
    marginTop: 24,
    borderRadius: 8,
    paddingVertical: 4,
  },
  audioTestButton: {
    marginTop: 24,
    borderRadius: 8,
    borderColor: colors.outline,
  },
  helpCard: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    marginTop: 24,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 4,
  },
  helpText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },
});
