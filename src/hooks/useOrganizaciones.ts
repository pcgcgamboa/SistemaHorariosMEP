import { useCallback, useEffect, useState } from 'react';
import type { Organizacion } from '../types';
import { loadOrganizaciones, saveOrganizaciones } from '../storage/organizacionStore';
import { purgarTenant } from '../storage/datastore';

/**
 * Estado y CRUD de organizaciones (tenants).
 *
 * Las reglas de RBAC (sólo SUPER_ADMIN puede mutar) se aplican en la capa UI
 * vía RoleGate; este hook expone las operaciones puras.
 *
 * Eliminar una organización dispara `purgarTenant`, que en cascada borra los
 * datos asociados (profesores, marcas, excepciones, observaciones, config).
 */
export function useOrganizaciones() {
  const [orgs, setOrgs] = useState<Organizacion[]>(() => loadOrganizaciones());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    saveOrganizaciones(orgs);
    setVersion((v) => v + 1);
  }, [orgs]);

  const crear = useCallback(
    (data: Omit<Organizacion, 'id' | 'creadaEn' | 'actualizadaEn'>): Organizacion => {
      const now = new Date().toISOString();
      const nueva: Organizacion = {
        ...data,
        id: `org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        creadaEn: now,
        actualizadaEn: now,
      };
      setOrgs((prev) => [...prev, nueva]);
      return nueva;
    },
    [],
  );

  const actualizar = useCallback(
    (id: string, patch: Partial<Omit<Organizacion, 'id' | 'creadaEn'>>) => {
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, ...patch, actualizadaEn: new Date().toISOString() } : o,
        ),
      );
    },
    [],
  );

  /** Elimina la organización y sus datos asociados (cascade). */
  const eliminar = useCallback((id: string) => {
    setOrgs((prev) => prev.filter((o) => o.id !== id));
    purgarTenant(id);
  }, []);

  const buscarPorId = useCallback(
    (id: string | null): Organizacion | undefined => (id ? orgs.find((o) => o.id === id) : undefined),
    [orgs],
  );

  return { orgs, version, crear, actualizar, eliminar, buscarPorId };
}
