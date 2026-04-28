import type { FolderSyncState } from '../hooks/useFolderSync';

/**
 * Indicador de auto-guardado.
 *
 * El sistema persiste TODA mutación al instante en la estructura interna
 * (localStorage namespaced por tenant: `sistemaControlReloj.tenants.<orgId>.<entidad>`).
 * Por tanto no hay "cambios sin guardar" desde la perspectiva del usuario.
 *
 * Esta barra cumple dos funciones:
 *  - Comunicar pasivamente que los datos están guardados.
 *  - Permitir conectar una carpeta del disco como espejo opcional (jerárquico:
 *    `global/`, `tenants/<orgId>/...`).
 */
interface Props {
  sync: FolderSyncState;
  onConnectFolder: () => void;
  onRequestAccess: () => void;
  onDisconnect: () => void;
}

export function SaveBar({ sync, onConnectFolder, onRequestAccess, onDisconnect }: Props) {
  // Carpeta espejo activa: muestra estado de sincronización.
  if (sync.folderName && !sync.needsPermission) {
    return (
      <div className="save-bar save-bar-ok" role="status">
        <div className="save-bar-msg">
          <span className="save-bar-icon">📁</span>
          Auto-guardado interno · espejo en <strong>{sync.folderName}</strong>
          {sync.saving && <span className="save-bar-status">sincronizando…</span>}
          {!sync.saving && sync.lastSavedAt && (
            <span className="save-bar-status">
              último espejo {sync.lastSavedAt.toLocaleTimeString('es-CR')}
            </span>
          )}
          {sync.lastError && <span className="save-bar-error">⚠ {sync.lastError}</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDisconnect}>
          Desconectar carpeta
        </button>
      </div>
    );
  }

  // Carpeta espejo seleccionada pero sin permiso vigente.
  if (sync.folderName && sync.needsPermission) {
    return (
      <div className="save-bar save-bar-warn" role="status">
        <div className="save-bar-msg">
          <span className="save-bar-icon">⚠</span>
          La carpeta espejo <strong>{sync.folderName}</strong> requiere permiso. Los datos
          siguen auto-guardándose internamente.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={onRequestAccess}>
            Otorgar acceso
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDisconnect}>
            Desconectar
          </button>
        </div>
      </div>
    );
  }

  // Sin carpeta: solo indicador de auto-guardado interno (+ opción de conectar espejo).
  return (
    <div className="save-bar save-bar-info" role="status">
      <div className="save-bar-msg">
        <span className="save-bar-icon">💾</span>
        Los cambios se guardan automáticamente en la estructura interna del sistema.
      </div>
      {sync.supported && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onConnectFolder}>
          Conectar carpeta espejo (opcional)
        </button>
      )}
    </div>
  );
}
