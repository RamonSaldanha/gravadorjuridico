export type AIProvider = 'openai' | 'gemini' | 'groq';

export interface AIModel {
  id: string;
  name: string;
  description: string;
}

export interface AIProviderConfig {
  id: AIProvider;
  name: string;
  transcriptionModels: AIModel[];
  dossierModels: AIModel[];
}

export const AI_PROVIDERS: Record<AIProvider, AIProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    transcriptionModels: [
      { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', description: 'Rápido e econômico (recomendado)' },
      { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe', description: 'Mais preciso' },
      { id: 'whisper-1', name: 'Whisper', description: 'Modelo legado' },
    ],
    dossierModels: [
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Mais inteligente, 1M tokens de contexto' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Rápido e econômico (recomendado)' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: 'Mais rápido e barato' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Legado — sendo descontinuado' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Legado — sendo descontinuado' },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    transcriptionModels: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Última geração, rápido (recomendado)' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: 'Última geração, mais preciso — mais lento' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Rápido e econômico' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Mais preciso, reasoning avançado' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Legado — aposentado em mar/2026' },
    ],
    dossierModels: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Última geração, rápido (recomendado)' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: 'Última geração, mais preciso' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Rápido e econômico' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Reasoning avançado, mais preciso' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Legado — aposentado em mar/2026' },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    transcriptionModels: [
      { id: 'whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo', description: 'Melhor equilíbrio velocidade/qualidade (recomendado)' },
      { id: 'whisper-large-v3', name: 'Whisper Large V3', description: 'Maior precisão, multilíngue' },
      { id: 'distil-whisper-large-v3-en', name: 'Distil-Whisper V3', description: 'Mais rápido e barato (apenas inglês)' },
    ],
    dossierModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Bom equilíbrio geral' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', description: 'Última geração, rápido' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', description: 'Última geração, mais capaz' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B', description: 'Excelente em raciocínio e análise' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Mais rápido e econômico' },
    ],
  },
};

// Types for timestamped transcription and diarization
export interface TimestampedSegment {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

export interface DiarizedSegment {
  speaker: string;  // "Advogado", "Cliente", etc.
  start: string;    // "00:00" (MM:SS)
  end: string;      // "00:05"
  text: string;
}

export interface DiarizedTranscription {
  diarized: true;
  segments: DiarizedSegment[];
  plainText: string;
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function isDiarizedTranscription(value: string | null): DiarizedTranscription | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.diarized === true && Array.isArray(parsed.segments)) {
      return parsed as DiarizedTranscription;
    }
  } catch {}
  return null;
}

export const DIARIZATION_PROMPT = `Você é um assistente especializado em análise de diálogos jurídicos. Abaixo está a transcrição timestamped de um atendimento jurídico (consulta entre advogado e cliente).

Sua tarefa:
1. Identificar quem está falando em cada trecho (normalmente "Advogado" e "Cliente", mas pode haver mais interlocutores)
2. Agrupar falas contínuas do mesmo falante em um único segmento
3. Usar o contexto para identificar os falantes (o advogado geralmente faz perguntas, orienta e usa linguagem técnica; o cliente narra fatos e faz perguntas leigas)

Retorne APENAS um JSON array válido (sem markdown, sem comentários) com o seguinte formato:
[
  {"speaker": "Advogado", "start": "00:00", "end": "00:08", "text": "Bom dia, como posso ajudar?"},
  {"speaker": "Cliente", "start": "00:09", "end": "00:22", "text": "Eu tenho um problema com meu contrato de trabalho..."}
]

Regras:
- Use timestamps no formato MM:SS
- Agrupe falas consecutivas do mesmo falante
- Mantenha a transcrição fiel ao original
- Se não conseguir distinguir falantes, use "Interlocutor 1", "Interlocutor 2", etc.

TRANSCRIÇÃO TIMESTAMPED:
`;

export const DOSSIER_PROMPT = `Você é um assistente jurídico especializado. Com base na transcrição abaixo de um atendimento jurídico, elabore um dossiê estruturado contendo:

## DOSSIÊ DO ATENDIMENTO

### 1. IDENTIFICAÇÃO DAS PARTES
- Identifique todas as partes mencionadas (cliente, advogado, testemunhas, partes adversas, etc.)

### 2. RESUMO DOS FATOS
- Relate cronologicamente os fatos narrados durante o atendimento

### 3. QUESTÕES JURÍDICAS IDENTIFICADAS
- Liste as questões jurídicas relevantes identificadas na conversa

### 4. DOCUMENTOS MENCIONADOS
- Liste todos os documentos citados durante o atendimento

### 5. PROVIDÊNCIAS E ENCAMINHAMENTOS
- Liste as ações a serem tomadas, prazos mencionados e próximos passos

### 6. OBSERVAÇÕES IMPORTANTES
- Destaque pontos críticos, contradições ou informações que merecem atenção especial

---

TRANSCRIÇÃO DO ATENDIMENTO:
`;
