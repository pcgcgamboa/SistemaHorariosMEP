/**
 * File System Access API wrapper.
 *
 * Allows the app to write JSON files directly to a folder on the user's disk,
 * persisting the directory handle in IndexedDB so it survives reloads.
 *
 * Falls back gracefully (returns null / throws "no soportado") in browsers
 * that lack support (Firefox, Safari) — callers must use the manual download
 * flow instead.
 */

const DB_NAME = 'sistemaControlReloj.fs';
const STORE = 'handles';
const KEY_DIR = 'dataFolder';

// FileSystemDirectoryHandle is part of the File System Access API.
// We type it loosely to avoid lib.dom incompatibilities across TS versions.
type DirHandle = {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  queryPermission(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  values?: () => AsyncIterableIterator<unknown>;
};

type FileHandle = {
  createWritable(): Promise<WritableFileStream>;
  getFile(): Promise<File>;
};

type WritableFileStream = {
  write(data: string | Blob | BufferSource): Promise<void>;
  close(): Promise<void>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>;
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// ----- Tiny IndexedDB wrapper for the directory handle -----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ----- Public API -----

let cachedHandle: DirHandle | null = null;

/** Prompt the user to select a folder. Stores the handle for future use. */
export async function pickDataFolder(): Promise<{ name: string } | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error(
      'Tu navegador no soporta escritura directa a carpetas. Use Chrome o Edge para activar el guardado automático.',
    );
  }
  const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
  cachedHandle = handle;
  await idbSet(KEY_DIR, handle);
  return { name: handle.name };
}

/** Restore the previously saved handle. May require re-prompting for permission. */
export async function getStoredFolder(): Promise<{ name: string; needsPermission: boolean } | null> {
  if (!isFileSystemAccessSupported()) return null;
  if (!cachedHandle) {
    const stored = await idbGet<DirHandle>(KEY_DIR);
    if (!stored) return null;
    cachedHandle = stored;
  }
  const perm = await cachedHandle.queryPermission({ mode: 'readwrite' });
  return { name: cachedHandle.name, needsPermission: perm !== 'granted' };
}

/** Re-request permission for the stored folder (must be in user-gesture). */
export async function ensurePermission(): Promise<boolean> {
  if (!cachedHandle) {
    const stored = await idbGet<DirHandle>(KEY_DIR);
    if (!stored) return false;
    cachedHandle = stored;
  }
  let perm = await cachedHandle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    perm = await cachedHandle.requestPermission({ mode: 'readwrite' });
  }
  return perm === 'granted';
}

/** Disconnect the folder. */
export async function disconnectFolder(): Promise<void> {
  cachedHandle = null;
  await idbDelete(KEY_DIR);
}

/**
 * Resuelve un path relativo (con `/`) bajo la carpeta raíz creando los
 * subdirectorios necesarios. Devuelve el handle del directorio que contiene
 * el archivo y el nombre final.
 */
async function resolvePath(
  relPath: string,
  create: boolean,
): Promise<{ dir: DirHandle; filename: string } | null> {
  if (!cachedHandle) return null;
  const segments = relPath.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const filename = segments.pop() as string;
  let dir: DirHandle = cachedHandle;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return { dir, filename };
}

/**
 * Escribe un JSON a un path relativo (admite subcarpetas, e.g.
 * `tenants/org-lsjm/profesores.json`). Crea los directorios faltantes.
 */
export async function writeJsonToFolder(relPath: string, data: unknown): Promise<void> {
  if (!cachedHandle) throw new Error('No hay carpeta conectada');
  const resolved = await resolvePath(relPath, true);
  if (!resolved) throw new Error(`Path inválido: ${relPath}`);
  const fileHandle = await resolved.dir.getFileHandle(resolved.filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/** Lee un JSON desde un path relativo. Devuelve null si no existe. */
export async function readJsonFromFolder<T>(relPath: string): Promise<T | null> {
  if (!cachedHandle) return null;
  try {
    const resolved = await resolvePath(relPath, false);
    if (!resolved) return null;
    const fileHandle = await resolved.dir.getFileHandle(resolved.filename, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
