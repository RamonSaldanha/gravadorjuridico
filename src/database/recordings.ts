import * as SQLite from 'expo-sqlite';

export interface Recording {
  id: number;
  title: string;
  file_path: string;
  audio_parts: string | null;
  duration: number;
  transcription: string | null;
  dialogue: string | null;
  dossier: string | null;
  created_at: string;
  updated_at: string;
}

export function getAudioParts(recording: Recording): string[] {
  if (recording.audio_parts) {
    try {
      return JSON.parse(recording.audio_parts);
    } catch {}
  }
  return [recording.file_path];
}

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('gravador_juridico.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      audio_parts TEXT,
      duration INTEGER NOT NULL DEFAULT 0,
      transcription TEXT,
      dialogue TEXT,
      dossier TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
  // Migrations for existing databases
  try { await db.execAsync(`ALTER TABLE recordings ADD COLUMN audio_parts TEXT`); } catch {}
  try { await db.execAsync(`ALTER TABLE recordings ADD COLUMN dialogue TEXT`); } catch {}
  return db;
}

export async function getAllRecordings(): Promise<Recording[]> {
  const database = await getDatabase();
  return database.getAllAsync<Recording>(
    'SELECT * FROM recordings ORDER BY created_at DESC'
  );
}

export async function getRecording(id: number): Promise<Recording | null> {
  const database = await getDatabase();
  return database.getFirstAsync<Recording>(
    'SELECT * FROM recordings WHERE id = ?',
    [id]
  );
}

export async function createRecording(
  title: string,
  filePath: string,
  duration: number,
  audioParts?: string[]
): Promise<number> {
  const database = await getDatabase();
  const partsJson = audioParts && audioParts.length > 0 ? JSON.stringify(audioParts) : null;
  const result = await database.runAsync(
    'INSERT INTO recordings (title, file_path, duration, audio_parts) VALUES (?, ?, ?, ?)',
    [title, filePath, duration, partsJson]
  );
  return result.lastInsertRowId;
}

export async function updateTitle(
  id: number,
  title: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE recordings SET title = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    [title, id]
  );
}

export async function updateTranscription(
  id: number,
  transcription: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE recordings SET transcription = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    [transcription, id]
  );
}

export async function updateDialogue(
  id: number,
  dialogue: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE recordings SET dialogue = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    [dialogue, id]
  );
}

export async function updateDossier(
  id: number,
  dossier: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE recordings SET dossier = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    [dossier, id]
  );
}

export async function deleteRecording(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM recordings WHERE id = ?', [id]);
}
