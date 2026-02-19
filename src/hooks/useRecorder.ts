import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioModule, type RecordingOptions } from 'expo-audio';
import { IOSOutputFormat, AudioQuality } from 'expo-audio/src/RecordingConstants';
import { Paths, File, Directory } from 'expo-file-system';
import { transcribeAudio } from '../services/ai';
import { getSettings } from '../services/settings';

const CHUNK_DURATION_MS = 5000; // 5 seconds per chunk

/**
 * Preset de alta qualidade para a gravação completa (arquivo final).
 * 256 kbps AAC, 44.1 kHz, mono — ótima fidelidade com tamanho razoável.
 */
const FULL_RECORDING_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 256000,
  },
};

/**
 * Preset leve para chunks de transcrição em tempo real.
 * 64 kbps AAC, 16 kHz, mono — suficiente para APIs de STT
 * e reduz latência de upload significativamente.
 */
const CHUNK_RECORDING_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64000,
  },
};

function ensureFileUri(path: string): string {
  if (path.startsWith('file://')) return path;
  return `file://${path}`;
}

function getRecordingsDir(): Directory {
  const dir = new Directory(Paths.document, 'recordings');
  if (!dir.exists) dir.create();
  return dir;
}

function getChunksDir(): Directory {
  const dir = new Directory(Paths.cache, 'chunks');
  if (!dir.exists) dir.create();
  return dir;
}

async function createRecorder(preset: RecordingOptions = FULL_RECORDING_PRESET) {
  const recorder = new AudioModule.AudioRecorder(preset);
  await recorder.prepareToRecordAsync();
  return recorder;
}

export function useRecorder() {
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [finalUri, setFinalUri] = useState<string | null>(null);
  const [liveTranscription, setLiveTranscription] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const recorderRef = useRef<any>(null);
  const fullRecorderRef = useRef<any>(null);
  const chunkFilesRef = useRef<string[]>([]);
  const transcriptionRef = useRef('');
  const isStoppingRef = useRef(false);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setDuration((prev) => {
        const next = prev + 1;
        durationRef.current = next;
        return next;
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopChunkTimer = useCallback(() => {
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      stopChunkTimer();
    };
  }, [stopTimer, stopChunkTimer]);

  const saveCurrentChunk = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    const uri = recorder.uri;
    if (!uri) return null;

    await recorder.stop();

    const sourceUri = ensureFileUri(uri);
    const sourceFile = new File(sourceUri);
    if (!sourceFile.exists) return null;

    const chunksDir = getChunksDir();
    const chunkFile = new File(chunksDir, `chunk_${Date.now()}.m4a`);
    sourceFile.move(chunkFile);

    chunkFilesRef.current.push(chunkFile.uri);
    return chunkFile.uri;
  }, []);

  const transcribeChunk = useCallback(async (chunkUri: string) => {
    try {
      const settings = await getSettings();
      if (!settings.apiKey) return;

      const text = await transcribeAudio(
        settings.provider,
        settings.apiKey,
        chunkUri,
        settings.transcriptionModel
      );

      if (text && text.trim()) {
        transcriptionRef.current += (transcriptionRef.current ? ' ' : '') + text.trim();
        setLiveTranscription(transcriptionRef.current);
      }
    } catch (error) {
      console.log('[RECORDER] Chunk transcription error:', error);
    }
  }, []);

  const rotateChunk = useCallback(async () => {
    if (isStoppingRef.current || isPaused) return;

    try {
      const chunkUri = await saveCurrentChunk();

      // Start new chunk recorder immediately
      const newRecorder = await createRecorder(CHUNK_RECORDING_PRESET);
      recorderRef.current = newRecorder;
      newRecorder.record();

      // Transcribe saved chunk in background
      if (chunkUri) {
        transcribeChunk(chunkUri);
      }
    } catch (error) {
      console.log('[RECORDER] Chunk rotation error:', error);
    }
  }, [saveCurrentChunk, transcribeChunk, isPaused]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    return status.granted;
  }, []);

  const startRecording = useCallback(async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      throw new Error('Permissão de microfone negada');
    }

    // Reset state
    setDuration(0);
    durationRef.current = 0;
    setFinalUri(null);
    setIsPaused(false);
    setLiveTranscription('');
    transcriptionRef.current = '';
    chunkFilesRef.current = [];
    isStoppingRef.current = false;

    // Clean old chunks
    const chunksDir = getChunksDir();
    if (chunksDir.exists) {
      chunksDir.delete();
      chunksDir.create();
    }

    // Start the FULL recorder (runs continuously for the entire session)
    try {
      const fullRecorder = await createRecorder(FULL_RECORDING_PRESET);
      fullRecorderRef.current = fullRecorder;
      fullRecorder.record();
      console.log('[RECORDER] Full recorder started (256kbps AAC)');
    } catch (error) {
      console.log('[RECORDER] Full recorder failed to start:', error);
      fullRecorderRef.current = null;
    }

    // Start the chunk recorder (rotates every 5s for live transcription)
    const chunkRecorder = await createRecorder(CHUNK_RECORDING_PRESET);
    recorderRef.current = chunkRecorder;
    chunkRecorder.record();

    setIsRecording(true);
    startTimer();

    // Start chunk rotation timer
    chunkTimerRef.current = setInterval(() => {
      rotateChunk();
    }, CHUNK_DURATION_MS);
  }, [requestPermissions, startTimer, rotateChunk]);

  const pauseRecording = useCallback(async () => {
    // Pause both recorders
    const fullRecorder = fullRecorderRef.current;
    if (fullRecorder) fullRecorder.pause();

    const recorder = recorderRef.current;
    if (recorder) recorder.pause();

    setIsPaused(true);
    stopTimer();
    stopChunkTimer();
  }, [stopTimer, stopChunkTimer]);

  const resumeRecording = useCallback(async () => {
    // Resume both recorders
    const fullRecorder = fullRecorderRef.current;
    if (fullRecorder) fullRecorder.record();

    const recorder = recorderRef.current;
    if (recorder) recorder.record();

    setIsPaused(false);
    startTimer();

    chunkTimerRef.current = setInterval(() => {
      rotateChunk();
    }, CHUNK_DURATION_MS);
  }, [startTimer, rotateChunk]);

  const stopRecording = useCallback(async (): Promise<{
    fullUri: string;
    uri: string;
    duration: number;
    transcription: string;
    audioParts: string[];
  }> => {
    isStoppingRef.current = true;
    stopTimer();
    stopChunkTimer();

    const currentDuration = durationRef.current;
    const recordingsDir = getRecordingsDir();
    const timestamp = Date.now();

    // 1. Stop the full recorder and save the integral file
    let fullFileUri = '';
    const fullRecorder = fullRecorderRef.current;
    if (fullRecorder) {
      try {
        const fullUri = fullRecorder.uri;
        await fullRecorder.stop();

        if (fullUri) {
          const sourceUri = ensureFileUri(fullUri);
          const sourceFile = new File(sourceUri);
          if (sourceFile.exists) {
            const destFile = new File(recordingsDir, `gravacao_${timestamp}_full.m4a`);
            sourceFile.move(destFile);
            fullFileUri = destFile.uri;
            console.log('[RECORDER] Full recording saved:', fullFileUri);
          }
        }
      } catch (error) {
        console.log('[RECORDER] Error saving full recording:', error);
      }
      fullRecorderRef.current = null;
    }

    // 2. Save the last chunk and transcribe it
    const recorder = recorderRef.current;
    if (recorder) {
      const lastChunkUri = await saveCurrentChunk();
      if (lastChunkUri) {
        await transcribeChunk(lastChunkUri);
      }
      recorderRef.current = null;
    }

    // 3. Move all chunks to recordings directory
    const allChunks = chunkFilesRef.current;
    const savedParts: string[] = [];

    for (let i = 0; i < allChunks.length; i++) {
      const chunkFile = new File(allChunks[i]);
      if (chunkFile.exists) {
        const partNum = String(i + 1).padStart(3, '0');
        const destFile = new File(recordingsDir, `gravacao_${timestamp}_${partNum}.m4a`);
        chunkFile.move(destFile);
        savedParts.push(destFile.uri);
      }
    }

    // Use full recording as primary; fall back to first chunk
    const primaryUri = fullFileUri || (savedParts.length > 0 ? savedParts[0] : '');

    setFinalUri(primaryUri);
    setIsRecording(false);
    setIsPaused(false);

    return {
      fullUri: fullFileUri,
      uri: primaryUri,
      duration: currentDuration,
      transcription: transcriptionRef.current,
      audioParts: savedParts,
    };
  }, [stopTimer, stopChunkTimer, saveCurrentChunk, transcribeChunk]);

  return {
    isRecording,
    isPaused,
    duration,
    uri: finalUri,
    liveTranscription,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}
