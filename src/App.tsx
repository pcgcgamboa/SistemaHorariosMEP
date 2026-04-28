import { useEffect, useMemo, useState } from 'react';
import { Layout, type Vista } from './components/Layout';
import { DetalleAsistenciaView } from './components/DetalleAsistenciaView';
import { ProfesoresView } from './components/ProfesoresView';
import { MarcasView } from './components/MarcasView';
import { ConfiguracionView } from './components/ConfiguracionView';
import { OrganizacionesView } from './components/organizations/OrganizacionesView';
import { UsuariosView } from './components/users/UsuariosView';
import { ReporteMensualView } from './components/reporte/ReporteMensualView';
import { LoginPage } from './components/auth/LoginPage';
import { SaveBar } from './components/SaveBar';
import {
  useConfiguracion,
  useExcepciones,
  useIncidentes,
  useMarcas,
  useObservaciones,
  usePeriodos,
  useProfesores,
} from './hooks/useDataStore';
import { useFolderSync, type SyncableDataset } from './hooks/useFolderSync';
import { useOrganizaciones } from './hooks/useOrganizaciones';
import { useAuth } from './auth/AuthContext';
import { tenantActivo } from './auth/permissions';
import { repositories } from './storage/datastore';
import { USERS_PATH } from './storage/authStore';
import { ORGS_PATH } from './storage/organizacionStore';
import './App.css';

function AppAutenticada() {
  const { session, logout, cambiarOrganizacionActiva, users, usersVersion } = useAuth();
  if (!session) return null;

  const isSuperAdmin = session.user.rol === 'SUPER_ADMIN';
  const tenantId = tenantActivo(session);
  const [vista, setVista] = useState<Vista>(
    isSuperAdmin && tenantId === null ? 'organizaciones' : 'detalle',
  );

  const {
    orgs,
    version: vOrgs,
    crear: crearOrg,
    actualizar: actualizarOrg,
    eliminar: eliminarOrg,
    buscarPorId,
  } = useOrganizaciones();
  const orgActiva = buscarPorId(tenantId);

  const {
    profesores, profesoresAll, upsert, remove, replaceAll: replaceProfes,
    version: vProfes,
  } = useProfesores(tenantId);

  const {
    marcas, marcasAll, add, addMany, remove: removeMarca,
    removeManyByRange: removeMarcasRange, replaceAll: replaceMarcas,
    version: vMarcas,
  } = useMarcas(tenantId);

  const {
    periodos, periodosAll, upsert: upsertPeriodo, remove: removePeriodo,
    version: vPeriodos,
  } = usePeriodos(tenantId);

  const {
    incidentes, incidentesAll, setIncidente,
    version: vIncidentes,
  } = useIncidentes(tenantId);

  const {
    excepciones, excepcionesAll, upsert: upsertExc, remove: removeExc, replaceAll: replaceExc,
    version: vExc,
  } = useExcepciones(tenantId);

  const {
    observaciones, observacionesAll, setOverride,
    version: vObs,
  } = useObservaciones(tenantId);

  const {
    config, configs, update: updateConfig,
    version: vConfig,
  } = useConfiguracion(tenantId, orgActiva?.nombre ?? '');

  // Si el tenant fue eliminado por SUPER_ADMIN, salir al switcher.
  useEffect(() => {
    if (!isSuperAdmin) return;
    if (tenantId && !orgActiva) {
      cambiarOrganizacionActiva(null);
      setVista('organizaciones');
    }
  }, [isSuperAdmin, tenantId, orgActiva, cambiarOrganizacionActiva]);

  // Si el SUPER_ADMIN está en vista global y selecciona una vista de datos, redirigir a Organizaciones.
  useEffect(() => {
    const vistasTenant: Vista[] = ['detalle', 'reporte', 'profesores', 'marcas', 'configuracion'];
    if (!tenantId && vistasTenant.includes(vista) && isSuperAdmin) {
      setVista('organizaciones');
    }
  }, [tenantId, vista, isSuperAdmin]);

  // ---- Folder sync (carpeta espejo: jerarquía global/ + tenants/<orgId>/...) ----
  const syncDatasets: SyncableDataset[] = useMemo(() => {
    const out: SyncableDataset[] = [
      { path: USERS_PATH, data: users, version: usersVersion },
      { path: ORGS_PATH, data: orgs, version: vOrgs },
    ];
    for (const o of orgs) {
      const orgId = o.id;
      out.push(
        {
          path: repositories.profesores.pathFor(orgId),
          data: profesoresAll.filter((p) => p.organizacionId === orgId),
          version: vProfes,
        },
        {
          path: repositories.marcas.pathFor(orgId),
          data: marcasAll.filter((m) => m.organizacionId === orgId),
          version: vMarcas,
        },
        {
          path: repositories.excepciones.pathFor(orgId),
          data: excepcionesAll.filter((e) => e.organizacionId === orgId),
          version: vExc,
        },
        {
          path: repositories.observaciones.pathFor(orgId),
          data: observacionesAll.filter((x) => x.organizacionId === orgId),
          version: vObs,
        },
        {
          path: repositories.configuracion.pathFor(orgId),
          data: configs.filter((c) => c.organizacionId === orgId),
          version: vConfig,
        },
        {
          path: repositories.periodos.pathFor(orgId),
          data: periodosAll.filter((p) => p.organizacionId === orgId),
          version: vPeriodos,
        },
        {
          path: repositories.incidentes.pathFor(orgId),
          data: incidentesAll.filter((i) => i.organizacionId === orgId),
          version: vIncidentes,
        },
      );
    }
    return out;
  }, [
    users, usersVersion,
    orgs, vOrgs,
    profesoresAll, vProfes,
    marcasAll, vMarcas,
    excepcionesAll, vExc,
    observacionesAll, vObs,
    configs, vConfig,
    periodosAll, vPeriodos,
    incidentesAll, vIncidentes,
  ]);

  const { state: syncState, connectFolder, requestAccess, disconnect } = useFolderSync(syncDatasets);

  const sinTenant = tenantId === null;

  return (
    <Layout
      vista={vista}
      onChangeVista={setVista}
      session={session}
      organizaciones={orgs}
      organizacionActiva={orgActiva ?? null}
      onCambiarOrganizacion={cambiarOrganizacionActiva}
      onLogout={logout}
    >
      <SaveBar
        sync={syncState}
        onConnectFolder={connectFolder}
        onRequestAccess={requestAccess}
        onDisconnect={disconnect}
      />

      {vista === 'organizaciones' && isSuperAdmin && (
        <OrganizacionesView
          organizaciones={orgs}
          profesores={profesoresAll}
          marcas={marcasAll}
          onCrear={crearOrg}
          onActualizar={actualizarOrg}
          onEliminar={eliminarOrg}
        />
      )}

      {vista === 'usuarios' && isSuperAdmin && (
        <UsuariosView organizaciones={orgs} />
      )}

      {sinTenant && vista !== 'organizaciones' && vista !== 'usuarios' && (
        <EmptyTenantState />
      )}

      {!sinTenant && config && vista === 'detalle' && (
        <DetalleAsistenciaView
          profesores={profesores}
          marcas={marcas}
          excepciones={excepciones}
          incidentes={incidentes}
          config={config}
          observaciones={observaciones}
          onSetObservacion={setOverride}
        />
      )}
      {!sinTenant && vista === 'reporte' && (
        <ReporteMensualView
          profesores={profesores}
          incidentes={incidentes}
          excepciones={excepciones}
          periodos={periodos}
          onSetIncidente={setIncidente}
        />
      )}
      {!sinTenant && vista === 'profesores' && (
        <ProfesoresView
          profesores={profesores}
          onUpsert={upsert}
          onRemove={remove}
          onReplaceAll={replaceProfes}
        />
      )}
      {!sinTenant && vista === 'marcas' && (
        <MarcasView
          profesores={profesores}
          marcas={marcas}
          periodos={periodos}
          tenantId={tenantId}
          onAdd={add}
          onAddMany={addMany}
          onRemove={removeMarca}
          onRemoveManyByRange={removeMarcasRange}
          onReplaceAll={replaceMarcas}
          onUpsertPeriodo={upsertPeriodo}
          onRemovePeriodo={removePeriodo}
        />
      )}
      {!sinTenant && config && vista === 'configuracion' && (
        <ConfiguracionView
          config={config}
          onUpdateConfig={updateConfig}
          excepciones={excepciones}
          onUpsertExcepcion={upsertExc}
          onRemoveExcepcion={removeExc}
          onReplaceExcepciones={replaceExc}
        />
      )}
    </Layout>
  );
}

function EmptyTenantState() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden>🏢</div>
      <h3>Selecciona una organización</h3>
      <p>
        Estás en la vista global. Para gestionar profesores, marcas o configuración,
        elige una organización en el selector del encabezado.
      </p>
    </div>
  );
}

export default function App() {
  const { ready, session } = useAuth();
  if (!ready) {
    return (
      <div className="auth-shell">
        <div className="auth-card">Cargando…</div>
      </div>
    );
  }
  if (!session) return <LoginPage />;
  return <AppAutenticada />;
}
