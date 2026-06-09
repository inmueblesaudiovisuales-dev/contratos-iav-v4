import { handleContratos } from './routes/contratos.js';
import { handlePortal } from './routes/portal.js';
import { handleAbonos } from './routes/abonos.js';
import { handlePaquetes } from './routes/paquetes.js';
import { handleStats } from './routes/stats.js';
import { handleChecklist } from './routes/checklist.js';
import { handleArchivos } from './routes/archivos.js';
import { handleRevision } from './routes/revision.js';
import { handleEquipo } from './routes/equipo.js';
import { handleClientes } from './routes/clientes.js';
import { handleTrabajos } from './routes/trabajos.js';
import { handleActividades } from './routes/actividades.js';
import { handleConfig } from './routes/config.js';
import { syncToSheets, backupChecklistToR2 } from './cron.js';
import { err } from './auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key'
};

const RUTAS_CONTRATOS = [
  'listarContratos','obtenerContrato','crearContrato','actualizarEstatus',
  'actualizarContratoUpsell','ocultarContrato','eliminarContrato','reservarContrato','guardarNotasInternas',
  'marcarSesionCompletada','guardarProduccion','guardarEntrega','revocarEntrega',
  'prepararEntrega','guardarConfigEntrega','publicarEntrega',
  'guardarCaracteristicas','reagendarPropiedad','exportarCSV','enviarRecordatorio',
  'guardarNotaPropiedad','actualizarCarpeta','actualizarPdfUrl','actualizarCalendarEvent',
  'actualizarExpress','guardarFormatoPropiedad'
];

const RUTAS_PORTAL = ['obtenerPortal','firmaCliente','guardarResena','guardarConfiguracion','obtenerEntrega'];
const RUTAS_ABONOS = ['registrarAbono','listarAbonos'];
const RUTAS_PAQUETES = ['listarPaquetes','listarPaquetesTodos','crearPaquete','editarPaquete','togglePaquete'];
const RUTAS_CHECKLIST = ['obtenerChecklist','guardarChecklist'];
const RUTAS_ARCHIVOS = ['subirArchivo','subirArchivoAdmin','subirArchivoCliente','listarArchivosCliente'];
const RUTAS_REVISION = ['obtenerRevision','guardarRevision'];
const RUTAS_EQUIPO       = ['obtenerEquipo','marcarProduccion'];
const RUTAS_CLIENTES    = ['crearCliente','listarClientes','obtenerCliente','actualizarCliente','borrarCliente','buscarClientePorTelefono'];
const RUTAS_TRABAJOS    = ['crearTrabajo','listarTrabajos','actualizarTrabajo','actualizarEstatusTrabajo'];
const RUTAS_ACTIVIDADES = ['agendarLlamada','agregarNota','listarActividades','listarActividadesPendientes','agendarLlamadaRapida','marcarActividad'];
const RUTAS_CONFIG      = ['obtenerConfig','obtenerConfigAdmin','guardarConfig','obtenerConfigGuia'];

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      const assetRes = await env.ASSETS.fetch(request);
      const isHtml = path.endsWith('.html') || path === '/' || !path.includes('.');
      if (!isHtml) return assetRes;
      const headers = new Headers(assetRes.headers);
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      return new Response(assetRes.body, { status: assetRes.status, headers });
    }

    const action = path.replace('/api/', '');
    let response;

    if (RUTAS_CONTRATOS.includes(action)) {
      response = await handleContratos(request, env, ctx, action);
    } else if (RUTAS_PORTAL.includes(action)) {
      response = await handlePortal(request, env, ctx, action);
    } else if (RUTAS_ABONOS.includes(action)) {
      response = await handleAbonos(request, env, ctx, action);
    } else if (RUTAS_PAQUETES.includes(action)) {
      response = await handlePaquetes(request, env, ctx, action);
    } else if (action === 'listarStats') {
      response = await handleStats(request, env, ctx);
    } else if (RUTAS_CHECKLIST.includes(action)) {
      response = await handleChecklist(request, env, ctx, action);
    } else if (RUTAS_ARCHIVOS.includes(action)) {
      response = await handleArchivos(request, env, ctx, action);
    } else if (RUTAS_REVISION.includes(action)) {
      response = await handleRevision(request, env, ctx, action);
    } else if (RUTAS_EQUIPO.includes(action)) {
      response = await handleEquipo(request, env, ctx, action);
    } else if (RUTAS_CLIENTES.includes(action)) {
      response = await handleClientes(request, env, ctx, action);
    } else if (RUTAS_TRABAJOS.includes(action)) {
      response = await handleTrabajos(request, env, ctx, action);
    } else if (RUTAS_ACTIVIDADES.includes(action)) {
      response = await handleActividades(request, env, ctx, action);
    } else if (RUTAS_CONFIG.includes(action)) {
      response = await handleConfig(request, env, ctx, action);
    } else {
      response = err('Acción no encontrada', 404);
    }

    const headers = new Headers(response.headers);
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, headers });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncToSheets(env));
    ctx.waitUntil(backupChecklistToR2(env));
  }
};
