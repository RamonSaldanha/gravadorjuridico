import { AIProvider, TimestampedSegment, DiarizedSegment, DIARIZATION_PROMPT, formatTimestamp } from '../constants/ai';
import { transcribeWithOpenAI, generateDossierWithOpenAI, transcribeWithOpenAITimestamped } from './openai';
import { transcribeWithGemini, generateDossierWithGemini, transcribeWithGeminiTimestamped } from './gemini';
import { transcribeWithGroq, generateDossierWithGroq, transcribeWithGroqTimestamped } from './groq';

export async function transcribeAudio(
  provider: AIProvider,
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<string> {
  switch (provider) {
    case 'openai':
      return transcribeWithOpenAI(apiKey, audioFilePath, model);
    case 'gemini':
      return transcribeWithGemini(apiKey, audioFilePath, model);
    case 'groq':
      return transcribeWithGroq(apiKey, audioFilePath, model);
    default:
      throw new Error(`Provedor não suportado: ${provider}`);
  }
}

export async function transcribeAudioWithTimestamps(
  provider: AIProvider,
  apiKey: string,
  audioFilePath: string,
  model: string
): Promise<{ segments: TimestampedSegment[]; plainText: string }> {
  switch (provider) {
    case 'openai':
      return transcribeWithOpenAITimestamped(apiKey, audioFilePath, model);
    case 'gemini':
      return transcribeWithGeminiTimestamped(apiKey, audioFilePath, model);
    case 'groq':
      return transcribeWithGroqTimestamped(apiKey, audioFilePath, model);
    default:
      throw new Error(`Provedor não suportado: ${provider}`);
  }
}

export async function generateDossier(
  provider: AIProvider,
  apiKey: string,
  transcription: string,
  model: string
): Promise<string> {
  switch (provider) {
    case 'openai':
      return generateDossierWithOpenAI(apiKey, transcription, model);
    case 'gemini':
      return generateDossierWithGemini(apiKey, transcription, model);
    case 'groq':
      return generateDossierWithGroq(apiKey, transcription, model);
    default:
      throw new Error(`Provedor não suportado: ${provider}`);
  }
}

export async function generateTitle(
  provider: AIProvider,
  apiKey: string,
  transcription: string,
  model: string
): Promise<string> {
  const prompt = `Com base na transcrição abaixo de uma reunião jurídica, gere um título curto (máximo 8 palavras) que resuma o assunto.
O título deve começar com "Reunião" e mencionar o tema principal ou a pessoa envolvida.
Exemplos: "Reunião sobre financiamento imobiliário", "Reunião de Fulana sobre golpe".
Retorne APENAS o título, sem aspas, sem explicações.

TRANSCRIÇÃO:
${transcription}`;

  switch (provider) {
    case 'openai':
      return (await generateDossierWithOpenAI(apiKey, prompt, model)).trim();
    case 'gemini':
      return (await generateDossierWithGemini(apiKey, prompt, model)).trim();
    case 'groq':
      return (await generateDossierWithGroq(apiKey, prompt, model)).trim();
    default:
      throw new Error(`Provedor não suportado: ${provider}`);
  }
}

export async function diarizeTranscription(
  provider: AIProvider,
  apiKey: string,
  segments: TimestampedSegment[],
  model: string
): Promise<DiarizedSegment[]> {
  // Format timestamped segments for the LLM
  const formattedSegments = segments
    .filter(s => s.text.trim())
    .map(s => `[${formatTimestamp(s.start)} - ${formatTimestamp(s.end)}] "${s.text}"`)
    .join('\n');

  const prompt = DIARIZATION_PROMPT + formattedSegments;

  let response: string;
  switch (provider) {
    case 'openai':
      response = await generateDossierWithOpenAI(apiKey, prompt, model);
      break;
    case 'gemini':
      response = await generateDossierWithGemini(apiKey, prompt, model);
      break;
    case 'groq':
      response = await generateDossierWithGroq(apiKey, prompt, model);
      break;
    default:
      throw new Error(`Provedor não suportado: ${provider}`);
  }

  // Parse JSON from LLM response (may be wrapped in markdown code block)
  const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : parsed.segments || [];
    return arr.map((seg: any) => ({
      speaker: seg.speaker || 'Desconhecido',
      start: seg.start || '00:00',
      end: seg.end || '00:00',
      text: seg.text || '',
    }));
  } catch {
    console.log('[DIARIZE] Failed to parse LLM response:', response.substring(0, 200));
    throw new Error('Falha ao interpretar resposta da diarização. Tente novamente.');
  }
}
