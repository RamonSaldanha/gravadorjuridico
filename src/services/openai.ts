import OpenAI from 'openai';
import { File as FSFile } from 'expo-file-system';
import { DOSSIER_PROMPT, TimestampedSegment } from '../constants/ai';

/**
 * Android's MediaRecorder produces files with ftyp brand "3gp4" instead of
 * standard M4A/MP4 brands. OpenAI rejects 3GP files. This function patches
 * the ftyp major brand from "3gp4" to "isom" (generic ISO MP4) so OpenAI
 * accepts it. The audio content is identical — only 4 header bytes change.
 */
async function patchFileIfNeeded(filePath: string): Promise<void> {
  const file = new FSFile(filePath);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check if ftyp brand is "3gp4" (bytes 8-11: 0x33 0x67 0x70 0x34)
  if (bytes[8] === 0x33 && bytes[9] === 0x67 && bytes[10] === 0x70 && bytes[11] === 0x34) {
    // Patch to "isom" (0x69 0x73 0x6F 0x6D) — generic ISO base media
    bytes[8] = 0x69;  // i
    bytes[9] = 0x73;  // s
    bytes[10] = 0x6F; // o
    bytes[11] = 0x6D; // m

    // Write patched file back
    file.write(bytes);
    console.log('[OPENAI] Patched 3gp4 → isom');
  }
}

export async function transcribeWithOpenAI(
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<string> {
  const file = new FSFile(audioFilePath);
  if (!file.exists) throw new Error('Arquivo de áudio não encontrado');

  // Patch 3GP header to MP4 so OpenAI accepts it
  await patchFileIfNeeded(audioFilePath);

  const formData = new FormData();
  formData.append('file', {
    uri: audioFilePath,
    type: 'audio/mp4',
    name: 'audio.mp4',
  } as any);
  formData.append('model', model);
  formData.append('language', 'pt');
  formData.append('response_format', 'text');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro na transcrição OpenAI: ${error}`);
  }

  return response.text();
}

export async function transcribeWithOpenAITimestamped(
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<{ segments: TimestampedSegment[]; plainText: string }> {
  const file = new FSFile(audioFilePath);
  if (!file.exists) throw new Error('Arquivo de áudio não encontrado');

  await patchFileIfNeeded(audioFilePath);

  // verbose_json only works with whisper-1
  const useVerbose = model === 'whisper-1';

  const formData = new FormData();
  formData.append('file', {
    uri: audioFilePath,
    type: 'audio/mp4',
    name: 'audio.mp4',
  } as any);
  formData.append('model', useVerbose ? 'whisper-1' : model);
  formData.append('language', 'pt');
  formData.append('response_format', useVerbose ? 'verbose_json' : 'text');
  if (useVerbose) {
    formData.append('timestamp_granularities[]', 'segment');
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro na transcrição OpenAI: ${error}`);
  }

  if (useVerbose) {
    const data = await response.json();
    const segments: TimestampedSegment[] = (data.segments || []).map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text?.trim() || '',
    }));
    return { segments, plainText: data.text || '' };
  }

  // Fallback: no timestamps available
  const text = await response.text();
  return { segments: [{ start: 0, end: 0, text: text.trim() }], plainText: text.trim() };
}

export async function generateDossierWithOpenAI(
  apiKey: string,
  transcription: string,
  model: string
): Promise<string> {
  const client = new OpenAI({ apiKey });

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
