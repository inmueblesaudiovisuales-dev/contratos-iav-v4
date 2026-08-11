// Logica pura del sistema de entregas. Sin I/O, sin D1, sin fetch.
// Todo lo que vive aqui tiene test en entregas-core.test.js.

// ── Codigo publico ────────────────────────────────────────────────────────────
// Alfabeto sin caracteres ambiguos (0/O, 1/l/I) y SIN guiones: el guion es el
// separador que usa codigoDeRuta() para sacar el codigo de la URL.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
export const LARGO_CODIGO = 10;

// ~49.5 bits de entropia. Es el unico candado del enlace del cliente, por eso no
// puede derivarse del folio: IAV-2608.08-A es adivinable por fecha.
export function generarCodigo(rnd) {
  const bytes = new Uint8Array(LARGO_CODIGO);
  if (rnd) rnd(bytes); else crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < LARGO_CODIGO; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}

// La ruta publica lleva el folio por delante para que Bruno la reconozca, pero el
// folio es DECORATIVO: reagendarPropiedad regenera el folio de la propiedad 1
// (contratos.js:743) y eso rompería cualquier enlace ya enviado si buscaramos por el.
export function rutaPublica(folio, codigo) {
  const f = String(folio || '').trim();
  return f ? `/${f}-${codigo}` : `/${codigo}`;
}

// Saca el codigo de una ruta publica. Siempre es el ultimo segmento tras el ultimo
// guion, y el folio puede traer sus propios guiones (IAV-2608.08-A).
export function codigoDeRuta(pathname) {
  const limpio = String(pathname || '').replace(/^\/+|\/+$/g, '');
  if (!limpio || limpio.includes('/')) return '';
  const partes = limpio.split('-');
  const cand = partes[partes.length - 1];
  return esCodigoValido(cand) ? cand : '';
}

export function esCodigoValido(s) {
  if (typeof s !== 'string' || s.length !== LARGO_CODIGO) return false;
  for (const ch of s) if (!ALFABETO.includes(ch)) return false;
  return true;
}

// ── Entregables desde el paquete ──────────────────────────────────────────────
const POR_PAQUETE = {
  'RES-COMBO': ['fotos', 'video', 'tour'],
  'TER-COMBO': ['fotos', 'video'],
  'IND-FOTO' : ['fotos'],
  'IND-VIDEO': ['video'],
  'IND-360'  : ['tour']
};
const PLANTILLA = {
  fotos: { tipo: 'fotos',  nombre: 'Fotografías' },
  video: { tipo: 'video',  nombre: 'Video cinemático' },
  tour : { tipo: 'enlace', nombre: 'Tour 360' }
};
// Add-ons del catalogo que SI producen un entregable propio.
// ADD-ASESOR y ADD-EXPRESS no aparecen: el asesor va dentro del video y express es
// una promesa de tiempo, no una pieza que se entregue aparte.
const POR_ADICIONAL = {
  'ADD-COMOLLEGAR': { tipo: 'video',  nombre: 'Video cómo llegar' },
  'ADD-LANDING'   : { tipo: 'enlace', nombre: 'Landing page' },
  'ADD-FOLLETO'   : { tipo: 'enlace', nombre: 'Folleto digital' }
};

// Saca las claves del catalogo que aplican a una propiedad concreta.
// Formato de adicionales_json documentado en docs/ARQUITECTURA.md:
//   "ADD-X"                              -> ofrecido (el cliente aun no lo acepta)
//   { clave, precio }                    -> acordado, va en el precio
//   { clave, precio, numPropiedad }      -> acordado solo para esa propiedad
//   { nombre, precio, ... }              -> personalizado, no es del catalogo
// Solo sembramos los ACORDADOS: lo ofrecido todavia puede no comprarse.
export function clavesAcordadas(adicionales, numPropiedad) {
  const lista = Array.isArray(adicionales) ? adicionales : [];
  const out = [];
  for (const a of lista) {
    if (typeof a === 'string') continue;          // ofrecido, no acordado
    if (!a || typeof a !== 'object') continue;
    if (!a.clave) continue;                        // personalizado, sin clave de catalogo
    if (a.ofrecido) continue;                      // ofrecido explicitamente
    if (a.numPropiedad != null && Number(a.numPropiedad) !== Number(numPropiedad)) continue;
    out.push(a.clave);
  }
  return out;
}

export function parsearAdicionales(json) {
  if (Array.isArray(json)) return json;
  try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

// Siembra los renglones de una entrega a partir de lo que se vendio.
// Un paquete desconocido cae al set completo: es preferible que Bruno borre un
// renglon de mas a que se le olvide entregar algo que si vendio.
export function entregablesSembrados(paqueteBase, adicionales, numPropiedad) {
  const claves = POR_PAQUETE[paqueteBase] || ['fotos', 'video', 'tour'];
  const items = claves.map(k => ({ ...PLANTILLA[k] }));
  for (const clave of clavesAcordadas(adicionales, numPropiedad)) {
    const extra = POR_ADICIONAL[clave];
    if (extra && !items.some(i => i.nombre === extra.nombre)) items.push({ ...extra });
  }
  return items.map((i, idx) => ({ ...i, orden: idx, completo: 0, valor: '' }));
}

// ── Reloj ─────────────────────────────────────────────────────────────────────
// Monterrey es UTC-6 fijo: Mexico elimino el horario de verano en 2022 y Nuevo Leon
// no es municipio fronterizo, asi que no hay excepcion que seguir.
export const OFFSET_MTY_MS = -6 * 3600 * 1000;

// El corte cae al FINAL del dia en Monterrey, no a la hora exacta de liberacion.
// Asi "tienes 14 dias" no se muere a las 6 de la tarde del dia 14 ni depende de la
// hora en que Bruno registro el pago.
export function calcularExpiracion(fechaLiberadaISO, dias = 14) {
  const t = new Date(fechaLiberadaISO).getTime();
  if (!Number.isFinite(t)) return null;
  const mty = new Date(t + OFFSET_MTY_MS);
  const finMtyUTC = Date.UTC(
    mty.getUTCFullYear(), mty.getUTCMonth(), mty.getUTCDate() + dias, 23, 59, 59, 0
  );
  return new Date(finMtyUTC - OFFSET_MTY_MS).toISOString();
}

// Dias completos que le quedan al cliente. 0 = vence hoy. Negativo = ya vencio.
export function diasRestantes(fechaExpiraISO, ahoraISO) {
  if (!fechaExpiraISO) return null;
  const fin = new Date(fechaExpiraISO).getTime();
  const hoy = new Date(ahoraISO || Date.now()).getTime();
  if (!Number.isFinite(fin) || !Number.isFinite(hoy)) return null;
  const diaMty = d => Math.floor((d + OFFSET_MTY_MS) / 86400000);
  return diaMty(fin) - diaMty(hoy);
}

export function estaVencida(fechaExpiraISO, ahoraISO) {
  if (!fechaExpiraISO) return false;
  const fin = new Date(fechaExpiraISO).getTime();
  const hoy = new Date(ahoraISO || Date.now()).getTime();
  return Number.isFinite(fin) && Number.isFinite(hoy) && hoy > fin;
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

// "22 de agosto". La fecha pesa mas que el contador para el cliente, por eso va
// primero en el portal y el "te quedan N dias" queda como refuerzo.
export function fechaLegible(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mty = new Date(t + OFFSET_MTY_MS);
  return `${mty.getUTCDate()} de ${MESES[mty.getUTCMonth()]}`;
}

// ── Maquina de estados ────────────────────────────────────────────────────────
export const ESTADOS = ['borrador', 'publicada', 'liberada', 'pausada', 'expirada'];

export function entregaCompleta(entregables) {
  const l = Array.isArray(entregables) ? entregables : [];
  return l.length > 0 && l.every(e => !!e.completo);
}

export function faltantes(entregables) {
  return (Array.isArray(entregables) ? entregables : [])
    .filter(e => !e.completo).map(e => e.nombre);
}

// Solo se libera lo que ya se publico. Si el cliente liquida ANTES de que Bruno
// publique, no se libera una entrega vacia: queda pagada y se libera sola en el
// momento de publicar (ver debeLiberarAlPublicar).
export function debeLiberarAlPagar(entrega) {
  return !!entrega && entrega.estado === 'publicada';
}

export function debeLiberarAlPublicar(saldoPendiente, pagadoManual) {
  if (pagadoManual) return true;
  return saldoPendiente != null && Number(saldoPendiente) <= 0;
}

// Un entregable de tipo enlace se cumple con pegar la URL; los demas con subir
// al menos un archivo.
export function entregableCumplido(entregable, numArchivos) {
  if (!entregable) return false;
  if (entregable.tipo === 'enlace') return !!String(entregable.valor || '').trim();
  return (numArchivos || 0) > 0;
}

// ── Cliente ───────────────────────────────────────────────────────────────────
// De un cliente ligado NO se copia nada: nombre, telefono y correo se leen en vivo
// de la tabla clientes para que no existan dos versiones divergiendo. Si el cliente
// se borro en admin, caemos a lo que haya guardado localmente y si no a un texto
// neutro — nunca a "undefined" en la cara del usuario.
export function datosCliente(eCliente, clienteAdmin) {
  const e = eCliente || {};
  const a = clienteAdmin || null;
  if (e.cliente_id && a) {
    return { nombre: a.nombre || '', telefono: a.telefono || '', correo: a.correo || '', ligado: true };
  }
  return {
    nombre: e.nombre || (e.cliente_id ? 'Cliente eliminado' : ''),
    telefono: e.telefono || '',
    correo: e.correo || '',
    ligado: !!e.cliente_id
  };
}

// ── Agrupacion para la lista ──────────────────────────────────────────────────
// Tres grupos, en el orden en que a Bruno le importan: lo que le falta hacer,
// lo que espera pago, y lo que trae reloj corriendo.
export function grupoDeEntrega(estado) {
  if (estado === 'borrador') return 'pendientes';
  if (estado === 'publicada') return 'con_cliente';
  if (estado === 'liberada' || estado === 'pausada') return 'liberadas';
  return 'historial';
}

// Urgencia: primero lo que vence antes; sin reloj, lo mas viejo primero.
export function ordenarEntregas(lista, ahoraISO) {
  return [...(lista || [])].sort((a, b) => {
    const da = diasRestantes(a.fecha_expira, ahoraISO);
    const db = diasRestantes(b.fecha_expira, ahoraISO);
    if (da != null && db != null) return da - db;
    if (da != null) return -1;
    if (db != null) return 1;
    return String(a.fecha_sesion || a.fecha_creacion || '')
      .localeCompare(String(b.fecha_sesion || b.fecha_creacion || ''));
  });
}
