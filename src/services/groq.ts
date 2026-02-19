import Groq from 'groq-sdk';
import { File as FSFile } from 'expo-file-system';
import { DOSSIER_PROMPT, TimestampedSegment } from '../constants/ai';

export async function transcribeWithGroq(
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<string> {
  const file = new FSFile(audioFilePath);
  if (!file.exists) throw new Error('Arquivo de áudio não encontrado');

  const formData = new FormData();
  formData.append('file', {
    uri: audioFilePath,
    type: 'audio/m4a',
    name: 'audio.m4a',
  } as any);
  formData.append('model', model);
  formData.append('language', 'pt');
  formData.append('response_format', 'text');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro na transcrição Groq: ${error}`);
  }

  return response.text();
}

export async function transcribeWithGroqTimestamped(
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<{ segments: TimestampedSegment[]; plainText: string }> {
  const file = new FSFile(audioFilePath);
  if (!file.exists) throw new Error('Arquivo de áudio não encontrado');

  const formData = new FormData();
  formData.append('file', {
    uri: audioFilePath,
    type: 'audio/m4a',
    name: 'audio.m4a',
  } as any);
  formData.append('model', model);
  formData.append('language', 'pt');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro na transcrição Groq: ${error}`);
  }

  const data = await response.json();
  const segments: TimestampedSegment[] = (data.segments || []).map((seg: any) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text?.trim() || '',
  }));
  return { segments, plainText: data.text || '' };
}

export async function generateDossierWithGroq(
  apiKey: string,
  transcription: string,
  model: string
): Promise<string> {
  const client = new Groq({ apiKey });

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: DOSSIER_PROMPT + transcription,
      },
    ],
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || 'Erro ao gerar dossiê.';
}
