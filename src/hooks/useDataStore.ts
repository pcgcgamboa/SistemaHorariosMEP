import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadConfiguraciones,
  loadExcepciones,
  loadIncidentes,
  loadMarcas,
  loadObservaciones,
  loadPeriodos,
  loadProfesores,
  nuevaConfiguracionPara,
  saveConfiguraciones,
  saveExcepciones,
  saveIncidentes,
  saveMarcas,
  saveObservaciones,
  savePeriodos,
  saveProfesores,
} from '../storage/datastore';
import { supabaseEnabled } from '../storage/supabase';
import {
  configuracionRepoSb,
  excepcionesRepoSb,
  incidentesRepoSb,
  marcasRepoSb,
  observacionesRepoSb,
  periodosRepoSb,
  profesoresRepoSb,
} from '../storage/supabaseRepos';
import type { TenantScopedRepo } from '../storage/supabaseRepo';
import type {
  Configuracion,
  Creatable,
  Excepcion,
  Incidente,
  Marca,
  ObservacionOverride,
  Periodo,
  Profesor,
  TipoIncidente,
} from '../types';

/**
 * Datos tenant-scoped.
 *
 * Cada hook recibe `tenantId` (la organización activa según la sesión):
 * - `tenantId === null`  → vista consolidada (solo SUPER_ADMIN). Lectura de
 *                          todos los tenants; las mutaciones lanzan error
 *                          (no hay tenant al que asignar el dato).
 * - `tenantId === '...'` → filtra y inyecta automáticamente el tenant.
 *
 * Cutover suave a Supabase (opción A):
 *  - Si `supabaseEnabled` es true → carga, escribe y se suscribe en Supabase.
 *    El localStorage NO se actualiza (la fuente de verdad es la DB; usar el
 *    mirror sería peligroso por el cascade-delete de `saveAllTenants`).
 *  - Si es false → comportamiento histórico con localStorage, sin cambios.
 */

/**
 * Descriptor del backend remoto que se le pasa a `usePersistedList`.
 * Permite cargar inicialmente, suscribirse a cambios en tiempo real, y
 * (para los hooks superiores) emitir mutaciones granulares.
 */
interface BackendDescriptor<T> {
  loadForTenant: (orgId: string) => Promise<T[]>;
  loadAll: () => Promise<T[]>;
  subscribe: (orgId: string | null, cb: (items: T[]) => void) => () => void;
}

function descriptorFor<T extends { id: string; organizacionId: string }>(
  repo: TenantScopedRepo<T>,
): BackendDescriptor<T> {
  return {
    loadForTenant: (orgId) => repo.loadForTenant(orgId),
    loadAll: () => repo.loadAll(),
    subscribe: (orgId, cb) => repo.subscribe(orgId, cb),
  };
}

/** Helper: dispara una promesa async de Supabase y loguea errores sin romper la UI. */
function fireBackend(p: Promise<unknown>, ctx: string): void {
  p.catch((err) => {

    console.error(`[supabase ${ctx}]`, err);
  });
}

function usePersistedList<T extends { id: string; organizacionId: string }>(
  loader: () => T[],
  saver: (v: T[]) => void,
  tenantId: string | null,
  backend?: BackendDescriptor<T>,
) {
  const useBackend = Boolean(backend);
  // Carga inicial síncrona desde localStorage (primer paint instantáneo,
  // incluso si después Supabase sobrescribe con la versión autoritativa).
  const [all, setAll] = useState<T[]>(() => loader());
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(useBackend);
  const initialised = useRef(false);

  // --- Modo Supabase: load async + subscribe realtime ---
  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const items = tenantId
          ? await backend.loadForTenant(tenantId)
          : await backend.loadAll();
        if (!cancelled) {
          setAll(items);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {

          console.error('[usePersistedList] backend load falló:', err);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, backend]);

  useEffect(() => {
    if (!backend) return;
    const unsub = backend.subscribe(tenantId, (items) => setAll(items));
    return unsub;
  }, [tenantId, backend]);

  // --- Modo localStorage: mirror en cada cambio (cascade-aware) ---
  useEffect(() => {
    if (useBackend) return; // En Supabase, no espejamos a localStorage.
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    saver(all);
    setDirty(true);
    setVersion((v) => v + 1);
  }, [all, saver, useBackend]);

  // En modo Supabase, igual incrementamos `version` para el indicador del SaveBar.
  useEffect(() => {
    if (!useBackend) return;
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    setVersion((v) => v + 1);
  }, [all, useBackend]);

  const items = useMemo(
    () => (tenantId === null ? all : all.filter((x) => x.organizacionId === tenantId)),
    [all, tenantId],
  );

  const markClean = useCallback(() => setDirty(false), []);

  return { all, setAll, items, dirty, version, markClean, loading };
}

function requireTenant(tenantId: string | null): string {
  if (!tenantId) {
    throw new Error(
      'No hay organización activa. SUPER_ADMIN debe seleccionar una organización antes de modificar datos.',
    );
  }
  return tenantId;
}

// ============================================================================
// Hooks por entidad
// ============================================================================

export function useProfesores(tenantId: string | null) {
  const backend = useMemo(
    () => (supabaseEnabled ? descriptorFor(profesoresRepoSb) : undefined),
    [],
  );
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Profesor>(
    loadProfesores,
    saveProfesores,
    tenantId,
    backend,
  );

  const upsert = useCallback(
    (p: Creatable<Profesor>) => {
      const orgId = p.organizacionId || requireTenant(tenantId);
      const next: Profesor = { ...p, organizacionId: orgId };
      setAll((prev) => {
        const idx = prev.findIndex((x) => x.id === next.id);
        if (idx === -1) return [...prev, next].sort((a, b) => a.nombre.localeCompare(b.nombre));
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      });
      if (supabaseEnabled) fireBackend(profesoresRepoSb.upsert(next), 'profesores.upsert');
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => {
      setAll((prev) => prev.filter((x) => x.id !== id));
      if (supabaseEnabled) fireBackend(profesoresRepoSb.remove(id), 'profesores.remove');
    },
    [setAll],
  );

  /** Reemplaza solo los items del tenant activo. */
  const replaceAll = useCallback(
    (data: Profesor[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((p) => ({ ...p, organizacionId: p.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
      if (supabaseEnabled) {
        fireBackend(
          (async () => {
            await profesoresRepoSb.removeAllForTenant(orgId);
            await profesoresRepoSb.insertMany(stamped);
          })(),
          'profesores.replaceAll',
        );
      }
    },
    [setAll, tenantId],
  );

  return {
    profesores: items,
    profesoresAll: all,
    upsert,
    remove,
    replaceAll,
    dirty,
    version,
    markClean,
  };
}

export function useMarcas(tenantId: string | null) {
  const backend = useMemo(
    () => (supabaseEnabled ? descriptorFor(marcasRepoSb) : undefined),
    [],
  );
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Marca>(
    loadMarcas,
    saveMarcas,
    tenantId,
    backend,
  );

  const add = useCallback(
    (m: Creatable<Marca>) => {
      const orgId = m.organizacionId || requireTenant(tenantId);
      const next: Marca = { ...m, organizacionId: orgId };
      setAll((prev) => [...prev, next]);
      if (supabaseEnabled) fireBackend(marcasRepoSb.upsert(next), 'marcas.add');
    },
    [setAll, tenantId],
  );

  const addMany = useCallback(
    (newMarks: Creatable<Marca>[]) => {
      const orgId = requireTenant(tenantId);
      const stamped: Marca[] = newMarks.map((m) => ({ ...m, organizacionId: m.organizacionId ?? orgId }));
      setAll((prev) => [...prev, ...stamped]);
      if (supabaseEnabled) fireBackend(marcasRepoSb.insertMany(stamped), 'marcas.addMany');
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => {
      setAll((prev) => prev.filter((x) => x.id !== id));
      if (supabaseEnabled) fireBackend(marcasRepoSb.remove(id), 'marcas.remove');
    },
    [setAll],
  );

  /** Borra todas las marcas del tenant activo cuya fecha caiga en [fechaInicio, fechaFin]. */
  const removeManyByRange = useCallback(
    (fechaInicio: string, fechaFin: string) => {
      const orgId = requireTenant(tenantId);
      setAll((prev) =>
        prev.filter((m) => {
          if (m.organizacionId !== orgId) return true;
          const d = m.fechaHora.slice(0, 10);
          return !(d >= fechaInicio && d <= fechaFin);
        }),
      );
      if (supabaseEnabled) {
        fireBackend(marcasRepoSb.removeByRange(orgId, fechaInicio, fechaFin), 'marcas.removeByRange');
      }
    },
    [setAll, tenantId],
  );

  /** Borra todas las marcas del tenant activo asociadas a un nombre de colaborador. */
  const removeManyByNombre = useCallback(
    (nombre: string) => {
      const orgId = requireTenant(tenantId);
      setAll((prev) => prev.filter((m) => !(m.organizacionId === orgId && m.nombre === nombre)));
      if (supabaseEnabled) fireBackend(marcasRepoSb.removeByNombre(orgId, nombre), 'marcas.removeByNombre');
    },
    [setAll, tenantId],
  );

  /**
   * Reasigna marcas de un colaborador a otro. Las marcas se identifican por
   * el nombre origen y se reescriben con el nombre destino (las marcas se
   * unen a un Profesor por igualdad de `nombre`).
   */
  const reassignByNombre = useCallback(
    (nombreOrigen: string, nombreDestino: string) => {
      const orgId = requireTenant(tenantId);
      if (nombreOrigen === nombreDestino) return;
      setAll((prev) =>
        prev.map((m) =>
          m.organizacionId === orgId && m.nombre === nombreOrigen
            ? { ...m, nombre: nombreDestino }
            : m,
        ),
      );
      if (supabaseEnabled) {
        fireBackend(
          marcasRepoSb.reassignByNombre(orgId, nombreOrigen, nombreDestino),
          'marcas.reassignByNombre',
        );
      }
    },
    [setAll, tenantId],
  );

  const replaceAll = useCallback(
    (data: Marca[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((m) => ({ ...m, organizacionId: m.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
      if (supabaseEnabled) {
        fireBackend(
          (async () => {
            await marcasRepoSb.removeAllForTenant(orgId);
            await marcasRepoSb.insertMany(stamped);
          })(),
          'marcas.replaceAll',
        );
      }
    },
    [setAll, tenantId],
  );

  return {
    marcas: items,
    marcasAll: all,
    add,
    addMany,
    remove,
    removeManyByRange,
    removeManyByNombre,
    reassignByNombre,
    replaceAll,
    dirty,
    version,
    markClean,
  };
}

export function useExcepciones(tenantId: string | null) {
  const backend = useMemo(
    () => (supabaseEnabled ? descriptorFor(excepcionesRepoSb) : undefined),
    [],
  );
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Excepcion>(
    loadExcepciones,
    saveExcepciones,
    tenantId,
    backend,
  );

  const upsert = useCallback(
    (e: Creatable<Excepcion>) => {
      const orgId = e.organizacionId || requireTenant(tenantId);
      const next: Excepcion = { ...e, organizacionId: orgId };
      setAll((prev) => {
        const idx = prev.findIndex((x) => x.id === next.id);
        if (idx === -1)
          return [...prev, next].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      });
      if (supabaseEnabled) fireBackend(excepcionesRepoSb.upsert(next), 'excepciones.upsert');
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => {
      setAll((prev) => prev.filter((x) => x.id !== id));
      if (supabaseEnabled) fireBackend(excepcionesRepoSb.remove(id), 'excepciones.remove');
    },
    [setAll],
  );

  const replaceAll = useCallback(
    (data: Excepcion[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((e) => ({ ...e, organizacionId: e.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
      if (supabaseEnabled) {
        fireBackend(
          (async () => {
            await excepcionesRepoSb.removeAllForTenant(orgId);
            await excepcionesRepoSb.insertMany(stamped);
          })(),
          'excepciones.replaceAll',
        );
      }
    },
    [setAll, tenantId],
  );

  return {
    excepciones: items,
    excepcionesAll: all,
    upsert,
    remove,
    replaceAll,
    dirty,
    version,
    markClean,
  };
}

export function useObservaciones(tenantId: string | null) {
  const backend = useMemo(
    () => (supabaseEnabled ? descriptorFor(observacionesRepoSb) : undefined),
    [],
  );
  const { all, setAll, items, dirty, version, markClean } =
    usePersistedList<ObservacionOverride>(loadObservaciones, saveObservaciones, tenantId, backend);

  const setOverride = useCallback(
    (
      profesorId: string,
      fecha: string,
      accion: 'limpiar' | 'cambiar' | null,
      texto?: string,
    ) => {
      const orgId = requireTenant(tenantId);
      let entryToUpsert: ObservacionOverride | null = null;
      let idToDelete: string | null = null;

      setAll((prev) => {
        const idx = prev.findIndex(
          (o) => o.profesorId === profesorId && o.fecha === fecha && o.organizacionId === orgId,
        );
        if (accion === null) {
          if (idx === -1) return prev;
          idToDelete = prev[idx].id;
          return prev.filter((_, i) => i !== idx);
        }
        const entry: ObservacionOverride = {
          id: idx === -1 ? `o${Date.now()}-${Math.random().toString(36).slice(2, 5)}` : prev[idx].id,
          organizacionId: orgId,
          profesorId,
          fecha,
          accion,
          ...(accion === 'cambiar' ? { texto: texto ?? '' } : {}),
        };
        entryToUpsert = entry;
        if (idx === -1) return [...prev, entry];
        const copy = prev.slice();
        copy[idx] = entry;
        return copy;
      });

      if (supabaseEnabled) {
        if (idToDelete) fireBackend(observacionesRepoSb.remove(idToDelete), 'observaciones.remove');
        if (entryToUpsert) fireBackend(observacionesRepoSb.upsert(entryToUpsert), 'observaciones.upsert');
      }
    },
    [setAll, tenantId],
  );

  const replaceAll = useCallback(
    (data: ObservacionOverride[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((o) => ({ ...o, organizacionId: o.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
      if (supabaseEnabled) {
        fireBackend(
          (async () => {
            await observacionesRepoSb.removeAllForTenant(orgId);
            await observacionesRepoSb.insertMany(stamped);
          })(),
          'observaciones.replaceAll',
        );
      }
    },
    [setAll, tenantId],
  );

  return {
    observaciones: items,
    observacionesAll: all,
    setOverride,
    replaceAll,
    dirty,
    version,
    markClean,
  };
}

/**
 * Configuración una-por-tenant.
 *
 * - `config` siempre devuelve la del tenant activo (creándola implícita si
 *   no existe). Si tenantId es null, devuelve null.
 * - `update` muta la del tenant activo.
 */
export function useConfiguracion(tenantId: string | null, institucionFallback: string) {
  const [configs, setConfigs] = useState<Configuracion[]>(() => loadConfiguraciones());
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const initialised = useRef(false);

  // Carga inicial async desde Supabase (sobrescribe el load de localStorage).
  useEffect(() => {
    if (!supabaseEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await configuracionRepoSb.loadAll();
        if (!cancelled) setConfigs(items);
      } catch (err) {

        console.error('[useConfiguracion] backend load falló:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror a localStorage solo cuando NO usamos Supabase.
  useEffect(() => {
    if (supabaseEnabled) {
      // En Supabase: solo incrementamos version para el SaveBar.
      if (!initialised.current) {
        initialised.current = true;
        return;
      }
      setVersion((v) => v + 1);
      return;
    }
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    saveConfiguraciones(configs);
    setDirty(true);
    setVersion((v) => v + 1);
  }, [configs]);

  // Asegura que exista una config para el tenant activo.
  useEffect(() => {
    if (!tenantId) return;
    setConfigs((prev) => {
      if (prev.some((c) => c.organizacionId === tenantId)) return prev;
      const nueva = nuevaConfiguracionPara(tenantId, institucionFallback);
      if (supabaseEnabled) fireBackend(configuracionRepoSb.upsert(nueva), 'configuracion.upsert(init)');
      return [...prev, nueva];
    });
  }, [tenantId, institucionFallback]);

  const config = useMemo<Configuracion | null>(
    () => (tenantId ? configs.find((c) => c.organizacionId === tenantId) ?? null : null),
    [configs, tenantId],
  );

  const update = useCallback(
    (patch: Partial<Configuracion>) => {
      const orgId = requireTenant(tenantId);
      let nextConfig: Configuracion | null = null;
      setConfigs((prev) => {
        const idx = prev.findIndex((c) => c.organizacionId === orgId);
        if (idx === -1) {
          const base = nuevaConfiguracionPara(orgId, institucionFallback);
          nextConfig = { ...base, ...patch, organizacionId: orgId };
          return [...prev, nextConfig];
        }
        const copy = prev.slice();
        nextConfig = { ...copy[idx], ...patch, organizacionId: orgId };
        copy[idx] = nextConfig;
        return copy;
      });
      if (supabaseEnabled && nextConfig) {
        fireBackend(configuracionRepoSb.upsert(nextConfig), 'configuracion.upsert');
      }
    },
    [tenantId, institucionFallback],
  );

  const markClean = useCallback(() => setDirty(false), []);

  return { config, configs, update, dirty, version, markClean };
}

/**
 * Periodos de marcas registrados.
 *
 * Cada importación masiva (Excel del reloj) crea un Periodo con su rango y
 * un nombre legible. La detección de "existente vs nuevo" se hace en
 * `utils/periodo.ts` en base a solapamiento de rangos.
 */
export function usePeriodos(tenantId: string | null) {
  const backend = useMemo(
    () => (supabaseEnabled ? descriptorFor(periodosRepoSb) : undefined),
    [],
  );
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Periodo>(
    loadPeriodos,
    savePeriodos,
    tenantId,
    backend,
  );

  const upsert = useCallback(
    (p: Creatable<Periodo>) => {
      const orgId = p.organizacionId || requireTenant(tenantId);
      const next: Periodo = {
        ...p,
        organizacionId: orgId,
        actualizadoEn: new Date().toISOString(),
      };
      setAll((prev) => {
        const idx = prev.findIndex((x) => x.id === next.id);
        if (idx === -1)
          return [...prev, next].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      });
      if (supabaseEnabled) fireBackend(periodosRepoSb.upsert(next), 'periodos.upsert');
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => {
      setAll((prev) => prev.filter((x) => x.id !== id));
      if (supabaseEnabled) fireBackend(periodosRepoSb.remove(id), 'periodos.remove');
    },
    [setAll],
  );

  return {
    periodos: items,
    periodosAll: all,
    upsert,
    remove,
    dirty,
    version,
    markClean,
  };
}

/**
 * Incidentes (eventos por funcionario × día) tenant-scoped.
 *
 * `setIncidente(profesorId, fecha, tipo, descripcion?)`:
 *   - Si `tipo === null` → borra el incidente del día.
 *   - Si existe uno para (profesor, fecha) → lo actualiza (upsert por clave natural).
 *   - Si no existe → lo crea.
 */
export function useIncidentes(tenantId: string | null) {
  const backend = useMemo(
    () => (supabaseEnabled ? descriptorFor(incidentesRepoSb) : undefined),
    [],
  );
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Incidente>(
    loadIncidentes,
    saveIncidentes,
    tenantId,
    backend,
  );

  const setIncidente = useCallback(
    (profesorId: string, fecha: string, tipo: TipoIncidente | null, descripcion?: string) => {
      const orgId = requireTenant(tenantId);
      let entryToUpsert: Incidente | null = null;
      let idToDelete: string | null = null;

      setAll((prev) => {
        const idx = prev.findIndex(
          (x) =>
            x.organizacionId === orgId && x.profesorId === profesorId && x.fecha === fecha,
        );
        if (tipo === null) {
          if (idx === -1) return prev;
          idToDelete = prev[idx].id;
          return prev.filter((_, i) => i !== idx);
        }
        const now = new Date().toISOString();
        const entry: Incidente = {
          id: idx === -1 ? `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : prev[idx].id,
          organizacionId: orgId,
          profesorId,
          fecha,
          tipo,
          descripcion: descripcion?.trim() || undefined,
          creadoEn: idx === -1 ? now : prev[idx].creadoEn,
          actualizadoEn: now,
        };
        entryToUpsert = entry;
        if (idx === -1) return [...prev, entry];
        const copy = prev.slice();
        copy[idx] = entry;
        return copy;
      });

      if (supabaseEnabled) {
        if (idToDelete) fireBackend(incidentesRepoSb.remove(idToDelete), 'incidentes.remove');
        if (entryToUpsert) fireBackend(incidentesRepoSb.upsert(entryToUpsert), 'incidentes.upsert');
      }
    },
    [setAll, tenantId],
  );

  const removeById = useCallback(
    (id: string) => {
      setAll((prev) => prev.filter((x) => x.id !== id));
      if (supabaseEnabled) fireBackend(incidentesRepoSb.remove(id), 'incidentes.remove');
    },
    [setAll],
  );

  return {
    incidentes: items,
    incidentesAll: all,
    setIncidente,
    remove: removeById,
    dirty,
    version,
    markClean,
  };
}
