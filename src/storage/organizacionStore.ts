import organizacionesIniciales from '../data/organizaciones.json';
import type { Organizacion } from '../types';
import { globalKey, globalPath, STORAGE_ROOT } from './tenantRepository';

const KEY_ORGS = globalKey('organizaciones');

/** Path lógico para el espejo en disco. */
export const ORGS_PATH = globalPath('organizaciones');

function migrateLegacyOrgsKey(): void {
  const legacyKey = `${STORAGE_ROOT}.organizaciones`;
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return;
  if (!localStorage.getItem(KEY_ORGS)) {
    localStorage.setItem(KEY_ORGS, raw);
  }
  localStorage.removeItem(legacyKey);
}

export function loadOrganizaciones(): Organizacion[] {
  migrateLegacyOrgsKey();
  const raw = localStorage.getItem(KEY_ORGS);
  if (!raw) {
    const seed = organizacionesIniciales as Organizacion[];
    localStorage.setItem(KEY_ORGS, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw) as Organizacion[];
  } catch {
    return organizacionesIniciales as Organizacion[];
  }
}

export function saveOrganizaciones(orgs: Organizacion[]): void {
  localStorage.setItem(KEY_ORGS, JSON.stringify(orgs));
}
