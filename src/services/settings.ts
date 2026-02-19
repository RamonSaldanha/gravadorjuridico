import * as SecureStore from 'expo-secure-store';
import { AIProvider } from '../constants/ai';

const KEYS = {
  PROVIDER: 'ai_provider',
};

function providerKey(provider: AIProvider, field: string): string {
  return `ai_${field}_${provider}`;
}

export interface AppSettings {
  provider: AIProvider;
  apiKey: string;
  transcriptionModel: string;
  dossierModel: string;
}

export async function getSettings(): Promise<AppSettings> {
  const provider = ((await SecureStore.getItemAsync(KEYS.PROVIDER)) as AIProvider | null) || 'openai';
  const apiKey = (await SecureStore.getItemAsync(providerKey(provider, 'api_key'))) || '';
  const transcriptionModel = (await SecureStore.getItemAsync(providerKey(provider, 'transcription_model'))) || '';
  const dossierModel = (await SecureStore.getItemAsync(providerKey(provider, 'dossier_model'))) || '';

  return { provider, apiKey, transcriptionModel, dossierModel };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await SecureStore.setItemAsync(KEYS.PROVIDER, settings.provider);
  await SecureStore.setItemAsync(providerKey(settings.provider, 'api_key'), settings.apiKey);
  await SecureStore.setItemAsync(providerKey(settings.provider, 'transcription_model'), settings.transcriptionModel);
  await SecureStore.setItemAsync(providerKey(settings.provider, 'dossier_model'), settings.dossierModel);
}

export async function getSettingsForProvider(provider: AIProvider): Promise<AppSettings> {
  const apiKey = (await SecureStore.getItemAsync(providerKey(provider, 'api_key'))) || '';
  const transcriptionModel = (await SecureStore.getItemAsync(providerKey(provider, 'transcription_model'))) || '';
  const dossierModel = (await SecureStore.getItemAsync(providerKey(provider, 'dossier_model'))) || '';

  return { provider, apiKey, transcriptionModel, dossierModel };
}
