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
import { handleEntregas, expirarEntregas, prepararPendientes } from './routes/entregas.js';
import { codigoDeRuta } from './entregas-core.js';
import { syncToSheets, backupChecklistToR2 } from './cron.js';
import { err } from './auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Entregas-Key'
};

const RUTAS_CONTRATOS = [
  'listarContratos','obtenerContrato','crearContrato','actualizarEstatus',
  'actualizarContratoUpsell','ocultarContrato','eliminarContrato','reservarContrato','guardarNotasInternas',
  'marcarSesionCompletada','guardarProduccion','guardarEntrega','revocarEntrega',
  'prepararEntrega','guardarConfigEntrega','publicarEntrega',
  'agregarFotoEntrega','iniciarSubidaVideo','confirmarVideoEntrega','previewEntrega',
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
      // Sistema de entregas (R129). Solo se activa en el subdominio propio o bajo /ver/,
      // asi que el comportamiento de contratos.inmueblesaudiovisuales.com no cambia.
      // OJO: sin la extension .html. Cloudflare Assets responde 307 a *.html para
      // mandarte a la ruta corta, asi que pedir el .html aqui devuelve el redirect
      // en vez del contenido.
      const esHostEntregas = url.hostname.startsWith('entregas.');
      let servir = null;
      if (esHostEntregas && (path === '/' || path === '/e' || path.startsWith('/e/'))) {
        servir = '/entregas';                            // portal de control
      } else if (path.startsWith('/ver/') || esHostEntregas) {
        // Enlace del cliente. El codigo es el ultimo segmento tras el ultimo guion;
        // el folio que va delante es decorativo y puede cambiar sin romper el enlace.
        // Archivo propio, NO entrega.html: esa sigue sirviendo al sistema R123 hasta
        // que Bruno decida el corte. Los dos conviven sin pisarse.
        const ruta = path.startsWith('/ver/') ? path.slice(4) : path;
        if (codigoDeRuta(ruta)) servir = '/entregas-cliente';
      }
      if (servir) {
        const assetRes = await env.ASSETS.fetch(new Request(new URL(servir, url), request));
        const headers = new Headers(assetRes.headers);
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        headers.set('Pragma', 'no-cache');
        return new Response(assetRes.body, { status: assetRes.status, headers });
      }

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

    if (action.startsWith('e/')) {
      // Namespace propio del sistema de entregas. No puede chocar con las acciones
      // existentes (publicarEntrega, obtenerEntrega, revocarEntrega... son de R123).
      response = await handleEntregas(request, env, ctx, action.slice(2));
    } else if (RUTAS_CONTRATOS.includes(action)) {
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
    // El de cada minuto SOLO prepara galerias. Meter aqui la sincronizacion o el
    // respaldo los correria 60 veces por hora sin ninguna razon.
    if (event.cron === '* * * * *') {
      ctx.waitUntil(
        prepararPendientes(env).catch(e => console.error('R131 prepararPendientes falló:', e.message))
      );
      return;
    }
    ctx.waitUntil(syncToSheets(env));
    ctx.waitUntil(backupChecklistToR2(env));
    // R129 — Vacia el material de las entregas vencidas. Si esto deja de correr,
    // R2 crece para siempre y la promesa de los 14 días deja de cumplirse.
    ctx.waitUntil(
      expirarEntregas(env).catch(e => console.error('R129 expirarEntregas falló:', e.message))
    );
  }
};
