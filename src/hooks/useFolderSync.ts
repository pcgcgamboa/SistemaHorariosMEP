import { useCallback, useEffect, useRef, useState } from 'react';
import {
  disconnectFolder,
  ensurePermission,
  getStoredFolder,
  isFileSystemAccessSupported,
  pickDataFolder,
  writeJsonToFolder,
} from '../storage/fileSystem';

export interface SyncableDataset {
  /**
   * Path relativo dentro de la carpeta sincronizada. Admite subcarpetas con
   * `/`, e.g. `tenants/org-lsjm/profesores.json` o `global/users.json`.
   * Las carpetas intermedias se crean automáticamente.
   */
  path: string;
  data: unknown;
  /** Token que se incrementa al mutar el dato; auto-save lee esto. */
  version: number;
}

export interface FolderSyncState {
  supported: boolean;
  folderName: string | null;
  needsPermission: boolean;
  lastSavedAt: Date | null;
  lastError: string | null;
  saving: boolean;
}

const SAVE_DEBOUNCE_MS = 600;

export function useFolderSync(datasets: SyncableDataset[]) {
  const [state, setState] = useState<FolderSyncState>({
    supported: isFileSystemAccessSupported(),
    folderName: null,
    needsPermission: false,
    lastSavedAt: null,
    lastError: null,
    saving: false,
  });

  // Restore previously chosen folder on mount
  useEffect(() => {
    if (!isFileSystemAccessSupported()) return;
    getStoredFolder().then((info) => {
      if (info) {
        setState((s) => ({
          ...s,
          folderName: info.name,
          needsPermission: info.needsPermission,
        }));
      }
    });
  }, []);

  const connectFolder = useCallback(async () => {
    try {
      const info = await pickDataFolder();
      if (info) {
        setState((s) => ({
          ...s,
          folderName: info.name,
          needsPermission: false,
          lastError: null,
        }));
      }
    } catch (err) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        setState((s) => ({ ...s, lastError: e.message }));
      }
    }
  }, []);

  const requestAccess = useCallback(async () => {
    try {
      const ok = await ensurePermission();
      setState((s) => ({ ...s, needsPermission: !ok, lastError: null }));
    } catch (err) {
      setState((s) => ({ ...s, lastError: (err as Error).message }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectFolder();
    setState((s) => ({
      ...s,
      folderName: null,
      needsPermission: false,
      lastSavedAt: null,
      lastError: null,
    }));
  }, []);

  // Auto-save debounced
  const versions = datasets.map((d) => d.version).join('-');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    if (!state.folderName || state.needsPermission) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setState((s) => ({ ...s, saving: true, lastError: null }));
      try {
        for (const ds of datasets) {
          await writeJsonToFolder(ds.path, ds.data);
        }
        setState((s) => ({ ...s, saving: false, lastSavedAt: new Date() }));
      } catch (err) {
        const e = err as Error;
        setState((s) => ({
          ...s,
          saving: false,
          lastError: e.message,
          // If permission was revoked, flag it
          needsPermission: e.name === 'NotAllowedError' ? true : s.needsPermission,
        }));
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, state.folderName, state.needsPermission]);

  return { state, connectFolder, requestAccess, disconnect };
}
