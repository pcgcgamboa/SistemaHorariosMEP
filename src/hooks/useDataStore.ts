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
 */

function usePersistedList<T extends { organizacionId: string }>(
  loader: () => T[],
  saver: (v: T[]) => void,
  tenantId: string | null,
) {
  // Estado interno = TODOS los items (todos los tenants).
  const [all, setAll] = useState<T[]>(() => loader());
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const initialised = useRef(false);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      return;
    }
    saver(all);
    setDirty(true);
    setVersion((v) => v + 1);
  }, [all, saver]);

  const items = useMemo(
    () => (tenantId === null ? all : all.filter((x) => x.organizacionId === tenantId)),
    [all, tenantId],
  );

  const markClean = useCallback(() => setDirty(false), []);

  return { all, setAll, items, dirty, version, markClean };
}

function requireTenant(tenantId: string | null): string {
  if (!tenantId) {
    throw new Error(
      'No hay organización activa. SUPER_ADMIN debe seleccionar una organización antes de modificar datos.',
    );
  }
  return tenantId;
}

export function useProfesores(tenantId: string | null) {
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Profesor>(
    loadProfesores,
    saveProfesores,
    tenantId,
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
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => {
      setAll((prev) => prev.filter((x) => x.id !== id));
    },
    [setAll],
  );

  /** Reemplaza solo los items del tenant activo. */
  const replaceAll = useCallback(
    (data: Profesor[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((p) => ({ ...p, organizacionId: p.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
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
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Marca>(
    loadMarcas,
    saveMarcas,
    tenantId,
  );

  const add = useCallback(
    (m: Creatable<Marca>) => {
      const orgId = m.organizacionId || requireTenant(tenantId);
      setAll((prev) => [...prev, { ...m, organizacionId: orgId }]);
    },
    [setAll, tenantId],
  );

  const addMany = useCallback(
    (newMarks: Creatable<Marca>[]) => {
      const orgId = requireTenant(tenantId);
      const stamped: Marca[] = newMarks.map((m) => ({ ...m, organizacionId: m.organizacionId ?? orgId }));
      setAll((prev) => [...prev, ...stamped]);
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => setAll((prev) => prev.filter((x) => x.id !== id)),
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
    },
    [setAll, tenantId],
  );

  const replaceAll = useCallback(
    (data: Marca[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((m) => ({ ...m, organizacionId: m.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
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
    replaceAll,
    dirty,
    version,
    markClean,
  };
}

export function useExcepciones(tenantId: string | null) {
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Excepcion>(
    loadExcepciones,
    saveExcepciones,
    tenantId,
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
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => setAll((prev) => prev.filter((x) => x.id !== id)),
    [setAll],
  );

  const replaceAll = useCallback(
    (data: Excepcion[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((e) => ({ ...e, organizacionId: e.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
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
  const { all, setAll, items, dirty, version, markClean } =
    usePersistedList<ObservacionOverride>(loadObservaciones, saveObservaciones, tenantId);

  const setOverride = useCallback(
    (
      profesorId: string,
      fecha: string,
      accion: 'limpiar' | 'cambiar' | null,
      texto?: string,
    ) => {
      const orgId = requireTenant(tenantId);
      setAll((prev) => {
        const idx = prev.findIndex(
          (o) => o.profesorId === profesorId && o.fecha === fecha && o.organizacionId === orgId,
        );
        if (accion === null) {
          return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
        }
        const entry: ObservacionOverride = {
          id: idx === -1 ? `o${Date.now()}-${Math.random().toString(36).slice(2, 5)}` : prev[idx].id,
          organizacionId: orgId,
          profesorId,
          fecha,
          accion,
          ...(accion === 'cambiar' ? { texto: texto ?? '' } : {}),
        };
        if (idx === -1) return [...prev, entry];
        const copy = prev.slice();
        copy[idx] = entry;
        return copy;
      });
    },
    [setAll, tenantId],
  );

  const replaceAll = useCallback(
    (data: ObservacionOverride[]) => {
      const orgId = requireTenant(tenantId);
      const stamped = data.map((o) => ({ ...o, organizacionId: o.organizacionId ?? orgId }));
      setAll((prev) => [...prev.filter((x) => x.organizacionId !== orgId), ...stamped]);
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

  useEffect(() => {
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
      return [...prev, nuevaConfiguracionPara(tenantId, institucionFallback)];
    });
  }, [tenantId, institucionFallback]);

  const config = useMemo<Configuracion | null>(
    () => (tenantId ? configs.find((c) => c.organizacionId === tenantId) ?? null : null),
    [configs, tenantId],
  );

  const update = useCallback(
    (patch: Partial<Configuracion>) => {
      const orgId = requireTenant(tenantId);
      setConfigs((prev) => {
        const idx = prev.findIndex((c) => c.organizacionId === orgId);
        if (idx === -1) {
          const base = nuevaConfiguracionPara(orgId, institucionFallback);
          return [...prev, { ...base, ...patch, organizacionId: orgId }];
        }
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], ...patch, organizacionId: orgId };
        return copy;
      });
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
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Periodo>(
    loadPeriodos,
    savePeriodos,
    tenantId,
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
    },
    [setAll, tenantId],
  );

  const remove = useCallback(
    (id: string) => setAll((prev) => prev.filter((x) => x.id !== id)),
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
  const { all, setAll, items, dirty, version, markClean } = usePersistedList<Incidente>(
    loadIncidentes,
    saveIncidentes,
    tenantId,
  );

  const setIncidente = useCallback(
    (profesorId: string, fecha: string, tipo: TipoIncidente | null, descripcion?: string) => {
      const orgId = requireTenant(tenantId);
      setAll((prev) => {
        const idx = prev.findIndex(
          (x) =>
            x.organizacionId === orgId && x.profesorId === profesorId && x.fecha === fecha,
        );
        if (tipo === null) {
          return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
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
        if (idx === -1) return [...prev, entry];
        const copy = prev.slice();
        copy[idx] = entry;
        return copy;
      });
    },
    [setAll, tenantId],
  );

  const removeById = useCallback(
    (id: string) => setAll((prev) => prev.filter((x) => x.id !== id)),
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
