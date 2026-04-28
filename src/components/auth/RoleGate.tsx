import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { can, type Capability } from '../../auth/permissions';

interface Props {
  capability: Capability;
  organizacionId?: string | null;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renderiza children solo si la sesión actual posee la capability.
 * Centraliza chequeos de RBAC en la UI.
 */
export function RoleGate({ capability, organizacionId, fallback = null, children }: Props) {
  const { session } = useAuth();
  if (!can(session, capability, { organizacionId })) return <>{fallback}</>;
  return <>{children}</>;
}
