import { GoogleGenerativeAI } from '@google/generative-ai';
import { File as FSFile } from 'expo-file-system';
import { DOSSIER_PROMPT, TimestampedSegment } from '../constants/ai';

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function transcribeWithGemini(
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const file = new FSFile(audioFilePath);
  const buffer = await file.arrayBuffer();
  const audioBase64 = bufferToBase64(buffer);

  const result = await genModel.generateContent([
    {
      inlineData: {
        mimeType: 'audio/m4a',
        data: audioBase64,
      },
    },
    {
      text: 'Transcreva este áudio na íntegra em português. Retorne APENAS a transcrição, sem comentários adicionais.',
    },
  ]);

  return result.response.text();
}

export async function transcribeWithGeminiTimestamped(
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<{ segments: TimestampedSegment[]; plainText: string }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const file = new FSFile(audioFilePath);
  const buffer = await file.arrayBuffer();
  const audioBase64 = bufferToBase64(buffer);

  const result = await genModel.generateContent([
    {
      inlineData: {
        mimeType: 'audio/m4a',
        data: audioBase64,
      },
    },
    {
      text: `Transcreva este áudio em português com timestamps. Retorne APENAS um JSON com o formato:
{"segments": [{"start": 0.0, "end": 3.5, "text": "texto aqui"}], "text": "texto completo aqui"}

Onde start/end são segundos decimais. Retorne o JSON puro sem markdown.`,
    },
  ]);

  const raw = result.response.text();
  try {
    const data = JSON.parse(raw);
    const segments: TimestampedSegment[] = (data.segments || []).map((seg: any) => ({
      start: Number(seg.start) || 0,
      end: Number(seg.end) || 0,
      text: (seg.text || '').trim(),
    }));
    return { segments, plainText: data.text || segments.map(s => s.text).join(' ') };
  } catch {
    // Fallback if Gemini doesn't return valid JSON
    return { segments: [{ start: 0, end: 0, text: raw.trim() }], plainText: raw.trim() };
  }
}

export async function generateDossierWithGemini(
  apiKey: string,
  transcription: string,
  model: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const result = await genModel.generateContent(DOSSIER_PROMPT + transcription);

  return result.response.text();
}
