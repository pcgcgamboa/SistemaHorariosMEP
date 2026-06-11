import { useEffect, useState } from 'react';
import type { FolderSyncState } from '../hooks/useFolderSync';

/**
 * Indicador de auto-guardado.
 *
 * El sistema persiste TODA mutación al instante en la estructura interna
 * (localStorage namespaced por tenant: `sistemaControlReloj.tenants.<orgId>.<entidad>`).
 * Por tanto no hay "cambios sin guardar" desde la perspectiva del usuario.
 *
 * Esta barra cumple tres funciones:
 *  - Comunicar que los datos están guardados, con marca de tiempo dinámica.
 *  - Ofrecer un botón "Guardar ahora" (fuerza flush del espejo de carpeta
 *    si está conectado; siempre confirma el guardado interno).
 *  - Permitir conectar una carpeta del disco como espejo opcional (jerárquico:
 *    `global/`, `tenants/<orgId>/...`).
 */
interface Props {
  sync: FolderSyncState;
  /** Último timestamp en que cambió cualquier dato. null = sin cambios aún. */
  lastChangeAt: Date | null;
  onConnectFolder: () => void;
  onRequestAccess: () => void;
  onDisconnect: () => void;
  onSaveNow: () => void | Promise<void>;
}

export function SaveBar({
  sync,
  lastChangeAt,
  onConnectFolder,
  onRequestAccess,
  onDisconnect,
  onSaveNow,
}: Props) {
  // Refresca el "hace Xs" cada 5 segundos para que el indicador no quede
  // congelado tras una mutación.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastChangeAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [lastChangeAt]);

  const relativo = formatRelativo(lastChangeAt);

  // Carpeta espejo activa: muestra estado de sincronización.
  if (sync.folderName && !sync.needsPermission) {
    return (
      <div className="save-bar save-bar-ok" role="status">
        <div className="save-bar-msg">
          <span className="save-bar-icon">✓</span>
          <strong>Datos actualizados</strong>
          {relativo && <span className="save-bar-status">· {relativo}</span>}
          <span className="save-bar-status">
            · espejo en <strong>{sync.folderName}</strong>
          </span>
          {sync.saving && <span className="save-bar-status">· sincronizando…</span>}
          {!sync.saving && sync.lastSavedAt && (
            <span className="save-bar-status">
              · último espejo {sync.lastSavedAt.toLocaleTimeString('es-CR')}
            </span>
          )}
          {sync.lastError && <span className="save-bar-error">⚠ {sync.lastError}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void onSaveNow()}
            disabled={sync.saving}
          >
            Guardar ahora
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDisconnect}>
            Desconectar carpeta
          </button>
        </div>
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
          siguen auto-guardándose internamente
          {relativo && <> · {relativo}</>}.
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

  // Sin carpeta: indicador de auto-guardado interno + Guardar ahora + opción de espejo.
  return (
    <div className="save-bar save-bar-info" role="status">
      <div className="save-bar-msg">
        <span className="save-bar-icon">✓</span>
        <strong>Datos actualizados</strong>
        {relativo
          ? <span className="save-bar-status">· {relativo}</span>
          : <span className="save-bar-status">· auto-guardado al instante</span>
        }
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void onSaveNow()}
          title="Confirma que todos los cambios están guardados"
        >
          Guardar ahora
        </button>
        {sync.supported && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onConnectFolder}>
            Conectar carpeta espejo (opcional)
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "hace 3 s", "hace 2 min", "a las 14:32". Devuelve null si no hay marca.
 */
function formatRelativo(d: Date | null): string | null {
  if (!d) return null;
  const segundos = Math.floor((Date.now() - d.getTime()) / 1000);
  if (segundos < 5) return 'guardado ahora';
  if (segundos < 60) return `guardado hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `guardado hace ${minutos} min`;
  return `guardado a las ${d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`;
}
