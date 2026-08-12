// Sistema de Entregas (R129). Rutas bajo /api/e/*.
//
// Independiente del admin: tablas propias (e_*), pagina propia, llave propia.
// Comparte la base D1 unicamente para poder leer el saldo del contrato en vivo,
// que es lo que dispara la liberacion automatica.

import { query, queryOne, run, batch, uuid, now } from '../db.js';
import { ok, err } from '../auth.js';
import {
  generarCodigo, rutaPublica, entregablesSembrados, parsearAdicionales,
  calcularExpiracion, diasRestantes, estaVencida, fechaLegible,
  entregaCompleta, faltantes, entregableCumplido,
  debeLiberarAlPagar, debeLiberarAlPublicar,
  datosCliente, grupoDeEntrega, ordenarEntregas
} from '../entregas-core.js';
import {
  llaveR2, guardarEnR2, copiarAStream, perfilWatermark, streamListo,
  borrarMediaDeEntrega, firmar, verificarFirma, esImagen, esVideo, nombreDescarga,
  cabecerasRango
} from '../entregas-media.js';
import { armarZip, tamanoZip, cabeEnZip, nombreZip, crcDeStream } from '../entregas-zip.js';

const WA_BASE = 'https://wa.me/5218127174207';

// La marca de agua vive en R2 y se dibuja al servir. Cambiar este archivo cambia
// TODAS las entregas, viejas y nuevas, al instante: ya no hay nada quemado.
const LLAVE_MARCA = 'sistema/marca-agua.png';
const OPACIDAD_MARCA = 0.6;   // calibrada por Bruno sobre una foto real
// repeat tilea el PNG a su tamaño NATIVO, que en una foto de 1000px deja el texto
// gigante. width es una fraccion del ancho de la foto.
// 0.45 reproduce de cerca lo que Bruno calibro (texto grande, separacion 2.0x).
// Se compara en vivo con ?m=.
const ANCHO_MARCA = 0.45;
// Ancho de pantalla de referencia al que esa fraccion se ve bien.
const ANCHO_REF = 375;

// Una fraccion fija se ve bien en el hero y se vuelve ruido ilegible en una
// miniatura: el 45% de una celda de 160px es texto de 70px. Lo que tiene que
// quedar constante es el tamaño FISICO del texto en pantalla, no su proporcion.
// Por eso el cliente manda el ancho real de despliegue (d) y aqui se compensa.
// TOPE CRITICO en 0.95, no en 1 ni mas: Cloudflare lee width <= 1 como FRACCION y
// > 1 como PIXELES. Con width:1 el overlay mide un pixel y la marca de agua
// desaparece sin error — la imagen sale limpia y nadie se entera. Verificado: a
// partir de 1.00 la respuesta es identica byte por byte a no dibujar nada.
export const TOPE_MARCA = 0.95;
export function fraccionMarca(anchoDespliegue, base) {
  const b = base || ANCHO_MARCA;
  const d = Number(anchoDespliegue);
  if (!Number.isFinite(d) || d <= 0) return Math.min(TOPE_MARCA, b);
  return Math.min(TOPE_MARCA, Math.max(0.25, b * (ANCHO_REF / d)));
}

// El sistema acepta su propia llave si esta configurada, y ademas la del admin para
// que funcione desde el dia uno sin tener que crear un secreto nuevo. Falla cerrado:
// si ninguna coincide, 401.
function requireEntregas(request, env) {
  const kE = request.headers.get('X-Entregas-Key');
  const kA = request.headers.get('X-Admin-Key');
  const url = new URL(request.url);
  const kQ = url.searchParams.get('k');
  const propia = env.ENTREGAS_KEY;
  if (propia && (kE === propia || kQ === propia)) return null;
  if (env.ADMIN_KEY && (kA === env.ADMIN_KEY || kE === env.ADMIN_KEY || kQ === env.ADMIN_KEY)) return null;
  return err('No autorizado', 401);
}

// ── Helpers de dominio ────────────────────────────────────────────────────────

export function baseEntregas(env) {
  return env.ENTREGAS_BASE_URL || 'https://entregas.inmueblesaudiovisuales.com';
}

async function codigoLibre(db) {
  for (let i = 0; i < 8; i++) {
    const c = generarCodigo();
    const existe = await queryOne(db, 'SELECT id FROM e_entregas WHERE codigo=?', [c]);
    if (!existe) return c;
  }
  throw new Error('No se pudo generar un codigo unico');
}

async function evento(db, entregaId, tipo, detalle = '') {
  try {
    await run(db,
      'INSERT INTO e_eventos (id, e_entrega_id, tipo, detalle, fecha) VALUES (?,?,?,?,?)',
      [uuid(), entregaId, tipo, detalle, now()]);
  } catch (e) {
    console.error('e_eventos falló', e.message);   // la bitacora nunca tumba la operacion
  }
}

// Devuelve (creando si hace falta) el e_cliente ligado a un cliente del admin.
// De los ligados NO se copia nombre/telefono/correo: se leen en vivo.
async function eClienteDeAdmin(db, clienteId) {
  if (!clienteId) return null;
  const ya = await queryOne(db, 'SELECT * FROM e_clientes WHERE cliente_id=?', [clienteId]);
  if (ya) return ya;
  const id = uuid();
  await run(db,
    `INSERT INTO e_clientes (id, cliente_id, nombre, telefono, correo, origen, fecha_creacion)
     VALUES (?,?,'','','','admin',?)`, [id, clienteId, now()]);
  return await queryOne(db, 'SELECT * FROM e_clientes WHERE id=?', [id]);
}

async function resolverCliente(db, eClienteId) {
  const e = await queryOne(db, 'SELECT * FROM e_clientes WHERE id=?', [eClienteId]);
  if (!e) return { nombre: '', telefono: '', correo: '', ligado: false };
  const admin = e.cliente_id
    ? await queryOne(db, 'SELECT nombre, telefono, correo FROM clientes WHERE id=?', [e.cliente_id])
    : null;
  return { ...datosCliente(e, admin), e_cliente_id: e.id, cliente_id: e.cliente_id || '' };
}

// Saldo vigente del contrato ligado. null cuando la entrega es suelta.
async function saldoDeEntrega(db, entrega) {
  if (!entrega.contrato_token) return null;
  const c = await queryOne(db,
    'SELECT saldo_pendiente, precio_total, folio FROM contratos WHERE token=?', [entrega.contrato_token]);
  return c ? c.saldo_pendiente : null;
}

async function folioDeEntrega(db, entrega) {
  if (!entrega.contrato_token) return '';
  const c = await queryOne(db, 'SELECT folio FROM contratos WHERE token=?', [entrega.contrato_token]);
  return (c && c.folio) || '';
}

// Recalcula el flag "completo" de un entregable segun lo que realmente tiene.
async function refrescarEntregable(db, entregableId) {
  const e = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
  if (!e) return;
  const c = await queryOne(db,
    'SELECT COUNT(*) AS n FROM e_archivos WHERE e_entregable_id=?', [entregableId]);
  const completo = entregableCumplido(e, (c && c.n) || 0) ? 1 : 0;
  if (completo !== e.completo) {
    await run(db, 'UPDATE e_entregables SET completo=? WHERE id=?', [completo, entregableId]);
  }
}

// Genera (una sola vez) la copia reducida que usa la galeria. Ver r131 para el porque.
// Es idempotente y silenciosa: si falla, la galeria cae al original y solo va lenta.
const ANCHO_WEB = 2000;
async function generarDerivado(env, db, archivo) {
  if (!archivo || !archivo.r2_key || archivo.r2_key_web) return null;
  if (esVideo(archivo.mime)) return null;
  try {
    const obj = await env.ENTREGAS_ORIGINALES.get(archivo.r2_key);
    if (!obj) return null;
    const out = await env.IMAGES.input(obj.body)
      .transform({ width: ANCHO_WEB, fit: 'scale-down' })
      .output({ format: 'image/jpeg', quality: 86 });
    const key = archivo.r2_key + '.web.jpg';
    await env.ENTREGAS_ORIGINALES.put(key, out.response().body,
      { httpMetadata: { contentType: 'image/jpeg' } });
    await run(db, 'UPDATE e_archivos SET r2_key_web=? WHERE id=?', [key, archivo.id]);
    return key;
  } catch (ex) {
    console.error('generarDerivado falló', archivo.id, ex.message);
    return null;
  }
}

// El CRC32 del original, calculado UNA vez. Sin esto no se puede armar el ZIP sin
// leer los bytes en JavaScript, y leerlos revienta el limite de CPU del Worker
// (medido: el archivo se cortaba a los 32 MB de 476).
async function asegurarCrc(env, db, archivo) {
  if (!archivo || !archivo.r2_key) return false;
  if (Number(archivo.crc32) >= 0) return true;
  try {
    const obj = await env.ENTREGAS_ORIGINALES.get(archivo.r2_key);
    if (!obj) return false;
    const { crc } = await crcDeStream(obj.body);
    // SQLite guarda enteros con signo; el CRC es de 32 bits sin signo. Se guarda
    // tal cual y se vuelve a leer con >>> 0 al usarlo.
    await run(db, 'UPDATE e_archivos SET crc32=? WHERE id=?', [crc, archivo.id]);
    return true;
  } catch (ex) {
    console.error('asegurarCrc falló', archivo.id, ex.message);
    return false;
  }
}

async function entregablesDe(db, entregaId) {
  const { results } = await query(db,
    `SELECT e.*, (SELECT COUNT(*) FROM e_archivos a WHERE a.e_entregable_id = e.id) AS num_archivos
     FROM e_entregables e WHERE e.e_entrega_id=? ORDER BY e.orden, e.rowid`, [entregaId]);
  return results || [];
}

// ── Siembra automatica desde el contrato ──────────────────────────────────────
// La llama crearContrato. SIEMPRE va envuelta en try/catch del lado del llamador:
// si esto falla, el contrato debe crearse igual.
export async function sembrarEntregasDeContrato(db, contrato, propiedades) {
  const eCliente = await eClienteDeAdmin(db, contrato.cliente_id);
  if (!eCliente) return { creadas: 0 };
  const adicionales = parsearAdicionales(contrato.adicionales_json);
  let creadas = 0;

  for (const p of propiedades) {
    const yaHay = await queryOne(db,
      'SELECT id FROM e_entregas WHERE contrato_token=? AND num_propiedad=?',
      [contrato.token, p.num_propiedad]);
    if (yaHay) continue;

    const id = uuid();
    const codigo = await codigoLibre(db);
    // La direccion es el mejor titulo. Sin ella cae al folio, que Bruno reconoce;
    // usar el nombre del cliente lo repetiria en pantalla (ya sale abajo).
    const titulo = p.direccion || contrato.folio ||
      `Propiedad ${p.num_propiedad}` || 'Propiedad';
    await run(db,
      `INSERT INTO e_entregas
        (id, e_cliente_id, contrato_token, num_propiedad, codigo, titulo, direccion,
         estado, fecha_sesion, fecha_creacion)
       VALUES (?,?,?,?,?,?,?, 'borrador', ?, ?)`,
      [id, eCliente.id, contrato.token, p.num_propiedad, codigo, titulo,
       p.direccion || '', p.fecha_sesion || '', now()]);

    const paquete = p.paquete || contrato.paquete_base || '';
    const items = entregablesSembrados(paquete, adicionales, p.num_propiedad);
    if (items.length) {
      await batch(db, items.map(it => ({
        sql: `INSERT INTO e_entregables (id, e_entrega_id, tipo, nombre, orden, completo, valor)
              VALUES (?,?,?,?,?,0,'')`,
        params: [uuid(), id, it.tipo, it.nombre, it.orden]
      })));
    }
    await evento(db, id, 'creada', `Sembrada del contrato · propiedad ${p.num_propiedad}`);
    creadas++;
  }
  return { creadas };
}

// ── Liberacion ────────────────────────────────────────────────────────────────
// Al liberar se manda hacer una SEGUNDA copia del video en Stream, esta sin marca.
// Las fotos no la necesitan: su mosaico se dibuja al vuelo y basta con dejar de
// dibujarlo. El video si, porque Stream quema la marca al codificar y no hay forma
// de quitarla despues.
//
// Stream jala el original de R2 del lado del servidor, asi que Bruno no vuelve a
// subir nada. Y solo pasa cuando ya se pago: lo que nunca se liquida no gasta de mas.
async function pedirVideoLimpio(db, env, entregaId) {
  const { results } = await query(db,
    `SELECT * FROM e_archivos WHERE e_entrega_id=? AND stream_uid<>'' AND stream_uid_limpio=''`,
    [entregaId]);
  let pedidos = 0;
  for (const a of (results || [])) {
    if (!a.r2_key) continue;
    try {
      const f = await firmar(env, 'origen:' + a.id, 1800);
      const origen = `${baseEntregas(env)}/api/e/origen?a=${a.id}&f=${encodeURIComponent(f)}`;
      // Sin watermarkUid: esta copia va limpia a proposito.
      const r = await copiarAStream(env, origen, `limpio-${a.id}`, null);
      await run(db, 'UPDATE e_archivos SET stream_uid_limpio=? WHERE id=?', [r.uid, a.id]);
      pedidos++;
    } catch (ex) {
      // No es fatal: el cliente sigue viendo la copia con marca y descargando limpio.
      console.error('copia limpia de video falló', a.id, ex.message);
    }
  }
  return pedidos;
}

async function liberar(db, env, entrega, motivo) {
  const ts = now();
  const expira = calcularExpiracion(ts, entrega.dias_vigencia || 14);
  await run(db,
    `UPDATE e_entregas SET estado='liberada', fecha_liberada=?, fecha_expira=? WHERE id=?`,
    [ts, expira, entrega.id]);
  await evento(db, entrega.id, 'liberada', motivo || '');
  if (env) {
    const n = await pedirVideoLimpio(db, env, entrega.id);
    if (n) await evento(db, entrega.id, 'video_limpio', `${n} video(s) recodificándose sin marca`);
  }
  return { fecha_liberada: ts, fecha_expira: expira };
}

// La llama registrarAbono cuando el saldo llega a cero. Envuelta en try/catch por
// el llamador: un fallo aqui NUNCA debe impedir que se registre el pago.
export async function liberarPorPago(db, contratoToken, env) {
  const { results } = await query(db,
    `SELECT * FROM e_entregas WHERE contrato_token=?`, [contratoToken]);
  let liberadas = 0;
  for (const e of (results || [])) {
    if (!debeLiberarAlPagar(e)) continue;   // solo lo ya publicado
    await liberar(db, env, e, 'Saldo liquidado');
    liberadas++;
  }
  return { liberadas };
}

// ── Expiracion (F6) ───────────────────────────────────────────────────────────
// La corre el cron horario. Es lo que hace que "14 dias" signifique algo y, de paso,
// lo que mantiene plano el costo de R2: sin esto el bucket crece para siempre.
//
// Se borra el MATERIAL, no el registro: e_entregas y e_eventos sobreviven para saber
// que le entregaste a quien y cuando. La liga del tour tambien sobrevive — vive en
// CloudPano, no ocupa nada, y el recorrido sigue existiendo aunque la entrega expire.
export async function expirarEntregas(env) {
  const db = env.DB;
  const ahora = now();
  const { results } = await query(db,
    `SELECT * FROM e_entregas WHERE estado='liberada' AND fecha_expira IS NOT NULL`);
  const resumen = { revisadas: (results || []).length, expiradas: 0, r2: 0, images: 0, stream: 0, fallos: 0 };

  for (const e of (results || [])) {
    if (!estaVencida(e.fecha_expira, ahora)) continue;
    const { results: archivos } = await query(db,
      'SELECT * FROM e_archivos WHERE e_entrega_id=?', [e.id]);
    let borrado = { r2: 0, images: 0, stream: 0, fallos: 0 };
    try {
      borrado = await borrarMediaDeEntrega(env, archivos || []);
    } catch (err2) {
      console.error('expirar: borrarMedia falló', e.id, err2.message);
      borrado.fallos++;
    }
    resumen.r2 += borrado.r2; resumen.images += borrado.images;
    resumen.stream += borrado.stream; resumen.fallos += borrado.fallos;

    // Si algo no se pudo borrar, NO se marca expirada: se reintenta la proxima hora.
    // Marcarla igual dejaria basura pagandose en R2 sin que nadie se entere.
    if (borrado.fallos > 0) {
      await evento(db, e.id, 'expirada', `Borrado parcial, se reintenta (${borrado.fallos} fallos)`);
      continue;
    }
    await batch(db, [
      { sql: 'DELETE FROM e_archivos WHERE e_entrega_id=?', params: [e.id] },
      { sql: `UPDATE e_entregas SET estado='expirada', fecha_expirada=? WHERE id=?`, params: [ahora, e.id] }
    ]);
    await evento(db, e.id, 'expirada',
      `Material borrado: ${borrado.r2} de R2, ${borrado.images} de Images, ${borrado.stream} de Stream`);
    resumen.expiradas++;
  }
  return resumen;
}

// Cascada manual: D1 ignora las foreign keys.
// PRIMERO el material, DESPUES los registros. En ese orden y no al reves: los
// registros son lo unico que sabe donde vive cada archivo, asi que borrarlos antes
// deja huerfanos en R2 y en Stream que ya nadie puede encontrar — y que se siguen
// pagando para siempre. Paso exactamente eso hasta el 12 ago 2026.
//
// Si el borrado del material falla, los registros se borran igual: dejar la entrega
// a medias seria peor. Lo que no se pudo borrar se registra en el log.
async function borrarEntregaCascada(db, env, entregaId) {
  if (env) {
    try {
      const { results: archivos } = await query(db,
        'SELECT * FROM e_archivos WHERE e_entrega_id=?', [entregaId]);
      const r = await borrarMediaDeEntrega(env, archivos || []);
      if (r.fallos) console.error('borrarEntregaCascada: quedaron', r.fallos, 'huérfanos en', entregaId);
    } catch (ex) {
      console.error('borrarEntregaCascada media', entregaId, ex.message);
    }
  }
  await batch(db, [
    { sql: 'DELETE FROM e_eventos WHERE e_entrega_id=?', params: [entregaId] },
    { sql: 'DELETE FROM e_archivos WHERE e_entrega_id=?', params: [entregaId] },
    { sql: 'DELETE FROM e_entregables WHERE e_entrega_id=?', params: [entregaId] },
    { sql: 'DELETE FROM e_entregas WHERE id=?', params: [entregaId] }
  ]);
}

// La llama eliminarContrato para no dejar entregas huerfanas apuntando a un
// contrato que ya no existe.
export async function borrarEntregasDeContrato(db, contratoToken, env) {
  const { results } = await query(db,
    'SELECT id FROM e_entregas WHERE contrato_token=?', [contratoToken]);
  for (const e of (results || [])) await borrarEntregaCascada(db, env, e.id);
  return { borradas: (results || []).length };
}

// ── Payload publico (lo que ve el cliente) ────────────────────────────────────
// Regla dura: si la entrega NO esta liberada, este objeto no puede contener ninguna
// URL de descarga del material original. Es el gate de F4.
async function payloadPublico(db, env, entrega) {
  const cliente = await resolverCliente(db, entrega.e_cliente_id);
  const items = await entregablesDe(db, entrega.id);
  const { results: archivos } = await query(db,
    'SELECT * FROM e_archivos WHERE e_entrega_id=? ORDER BY orden, rowid', [entrega.id]);

  const liberada = entrega.estado === 'liberada';
  const vencida = estaVencida(entrega.fecha_expira, now());

  const base = {
    ok: true,
    estado: vencida && liberada ? 'expirada' : entrega.estado,
    titulo: entrega.titulo,
    direccion: entrega.direccion,
    cliente: cliente.nombre,
    tourUrl: entrega.tour_url || '',
    waLink: WA_BASE,
    liberada: liberada && !vencida,
    entregables: items.map(i => ({ tipo: i.tipo, nombre: i.nombre })),
  };

  // Las fotos se piden al propio Worker, que las saca de R2 y decide ahi si les
  // dibuja el mosaico o no segun el estado de la entrega. El cliente nunca recibe
  // una URL que apunte al original limpio.
  base.fotos = (archivos || [])
    .filter(a => a.r2_key && !esVideo(a.mime))
    .map(a => ({ id: a.id, nombre: a.nombre, destacado: !!a.destacado }));
  // TODOS los videos, no solo el primero. Antes se mandaba uno y los demas
  // quedaban invisibles para el cliente aunque si aparecieran en las descargas:
  // veia un video y bajaba tres.
  const vids = (archivos || []).filter(a => a.stream_uid);
  base.videos = [];
  for (const v of vids) {
    // Por defecto va la copia con marca. Solo se cambia a la limpia cuando la
    // entrega esta liberada Y Stream confirma que ya termino de codificarla:
    // apuntar antes deja al cliente con un reproductor muerto.
    let uid = v.stream_uid;
    if (liberada && !vencida && v.stream_uid_limpio) {
      if (v.estado === 'limpio_listo') {
        uid = v.stream_uid_limpio;
      } else if (await streamListo(env, v.stream_uid_limpio)) {
        uid = v.stream_uid_limpio;
        // Se anota para no volver a preguntarle a Stream en cada visita.
        await run(db, `UPDATE e_archivos SET estado='limpio_listo' WHERE id=?`, [v.id]);
      }
    }
    // Al cliente se le muestra el nombre del ENTREGABLE ("Video cinemático"), no el
    // del archivo: "IAV-2607.17-A-v2.mp4" no le dice nada a nadie. Si hay varios
    // videos en el mismo entregable se numeran para poder distinguirlos.
    const suyo = items.filter(i => i.id === v.e_entregable_id)[0];
    const hermanos = vids.filter(x => x.e_entregable_id === v.e_entregable_id);
    let nombre = (suyo && suyo.nombre) || 'Video';
    if (hermanos.length > 1) nombre += ' ' + (hermanos.indexOf(v) + 1);
    base.videos.push({ id: v.id, uid, nombre, conMarca: uid === v.stream_uid });
  }
  if (base.videos.length) {
    base.streamCustomer = env.STREAM_CUSTOMER_CODE || '';
    // Se conserva `video` a secas por si algun navegador quedo con la version
    // anterior de la pagina en cache.
    base.video = base.videos[0];
  }

  // ESTE es el gate. Las ligas firmadas solo existen si la entrega esta liberada y
  // vigente; en cualquier otro estado el payload no lleva NADA descargable.
  if (liberada && !vencida) {
    base.fechaLimite = fechaLegible(entrega.fecha_expira);
    base.diasRestantes = diasRestantes(entrega.fecha_expira, now());
    const descargas = [];
    for (const a of (archivos || [])) {
      if (!a.r2_key) continue;
      const f = await firmar(env, 'bajar:' + a.id, 900);
      // El video se lista con el nombre que el cliente ya vio arriba; las fotos
      // conservan el suyo, que ahi si es util al guardarlas.
      const vv = esVideo(a.mime) ? base.videos.filter(x => x.id === a.id)[0] : null;
      descargas.push({
        id: a.id, nombre: (vv && vv.nombre) || a.nombre, bytes: a.bytes, mime: a.mime,
        tipo: esVideo(a.mime) ? 'video' : 'foto',
        url: `/api/e/bajar?a=${a.id}&f=${encodeURIComponent(f)}`
      });
    }
    base.descargas = descargas;

    // Un solo archivo con todas las fotos. Es la accion principal de la pagina:
    // sin esto, "descargar todo" son 45 clics.
    const fotos = (archivos || []).filter(a => a.r2_key && !esVideo(a.mime));
    if (fotos.length) {
      const fz = await firmar(env, 'zip:' + entrega.id, 900);
      base.zip = {
        url: `/api/e/zip?e=${entrega.id}&f=${encodeURIComponent(fz)}`,
        archivos: fotos.length,
        // Aproximado: es lo que dice la base. Sirve para escribirlo en el boton;
        // el tamano exacto se mide contra R2 al momento de armarlo.
        bytes: fotos.reduce((s, a) => s + (Number(a.bytes) || 0), 0)
      };
    }
  }
  return base;
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function handleEntregas(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);

  // ---- Publico (sin llave): lo que abre el cliente con su enlace ----
  if (action === 'publica') {
    const codigo = url.searchParams.get('codigo') || '';
    if (!codigo) return err('Enlace inválido', 400);
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE codigo=?', [codigo]);
    if (!e) return err('Entrega no encontrada', 404);
    if (e.estado === 'borrador') {
      return ok({ ok: true, estado: 'borrador', waLink: WA_BASE, tourUrl: '' });
    }
    if (e.estado === 'pausada') {
      return ok({ ok: true, estado: 'pausada', waLink: WA_BASE, tourUrl: e.tour_url || '' });
    }
    if (e.estado === 'expirada') {
      // El material ya no existe, pero la liga del 360 si: vive en CloudPano y no
      // ocupa nada. Cerrarla del todo le quitaria al cliente algo que sigue vivo.
      return ok({ ok: true, estado: 'expirada', waLink: WA_BASE, tourUrl: e.tour_url || '',
                  titulo: e.titulo });
    }
    ctx.waitUntil(evento(db, e.id, 'vista', ''));
    return ok(await payloadPublico(db, env, e));
  }

  // ---- Foto de la galeria: se transforma AL SERVIR ----
  // Esta es la pieza que hace que solo exista UNA copia de cada foto. El original
  // limpio vive en R2; el mosaico se dibuja aqui, al vuelo, con el binding de Images.
  // Consecuencias:
  //   - una sola subida por foto
  //   - la marca de agua deja de ser irreversible: es un parametro, no un archivo
  //   - al liberar, la MISMA foto se sirve sin mosaico, sin guardar una segunda copia
  if (action === 'foto') {
    const archivoId = url.searchParams.get('a') || '';
    const ancho = Math.min(2400, Math.max(120, Number(url.searchParams.get('w')) || 800));
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a || !a.r2_key) return err('Foto no encontrada', 404);
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [a.e_entrega_id]);
    if (!e) return err('Entrega no encontrada', 404);
    // Al cliente solo se le sirve lo publicado o liberado. Bruno si necesita ver
    // los borradores: es como comprueba lo que acaba de subir antes de publicar.
    if (e.estado !== 'publicada' && e.estado !== 'liberada') {
      if (requireEntregas(request, env)) return err('No disponible', 403);
    }

    // El mosaico se quita SOLO si esta liberada y vigente. Esa es la unica condicion.
    const limpia = e.estado === 'liberada' && !estaVencida(e.fecha_expira, now());

    // CACHE. Sin esto cada peticion vuelve a decodificar un JPEG de 10 MB, redimensionarlo
    // y dibujarle el mosaico. Una cuadricula dispara varias a la vez y el Worker revienta
    // su limite de recursos (error 1102 de Cloudflare) — pasa con fotos reales, no con
    // imagenes de prueba chicas.
    //
    // El ESTADO va en la llave: si no, al liberar se seguiria sirviendo la version con
    // marca que quedo cacheada, y el cliente pagaria para ver lo mismo.
    const cache = caches.default;
    const llaveCache = new Request(
      `${url.origin}/api/e/foto?a=${archivoId}&w=${ancho}&st=${limpia ? 'limpia' : 'marcada'}`,
      { method: 'GET' });
    const cacheada = await cache.match(llaveCache);
    if (cacheada) return cacheada;

    // Se transforma la copia REDUCIDA, no el original de 10 MB: esa es la diferencia
    // entre servir la galeria y que el Worker reviente su limite de recursos.
    // Si el derivado aun no existe se cae al original y se manda a generar en segundo
    // plano, para que la proxima vista ya vaya por el camino barato.
    const llaveLectura = a.r2_key_web || a.r2_key;
    const obj = await env.ENTREGAS_ORIGINALES.get(llaveLectura);
    if (!obj) return err('Foto no encontrada', 404);
    if (!a.r2_key_web) ctx.waitUntil(generarDerivado(env, db, a));

    try {
      let pipe = env.IMAGES.input(obj.body).transform({ width: ancho, fit: 'scale-down' });
      if (!limpia) {
        const marca = await env.ENTREGAS_ORIGINALES.get(LLAVE_MARCA);
        if (marca) {
          // d = ancho real en pantalla, para que el texto salga del mismo tamaño
          // fisico en el hero y en una miniatura. ?m= fuerza la base sin redesplegar.
          const base = Number(url.searchParams.get('m')) || ANCHO_MARCA;
          const w = fraccionMarca(url.searchParams.get('d'), base);
          if (w >= 1) {   // no deberia pasar; si pasa, mejor fallar que servir limpio
            console.error('fraccion de marca invalida', w);
            return err('Marca de agua mal configurada', 503);
          }
          pipe = pipe.draw(marca.body, { repeat: true, opacity: OPACIDAD_MARCA, width: w });
        } else {
          // Sin marca de agua NO se sirve la foto: es preferible fallar visible a
          // entregar el material limpio por accidente.
          console.error('falta la marca de agua en R2:', LLAVE_MARCA);
          return err('Marca de agua no configurada', 503);
        }
      }
      const out = await pipe.output({ format: 'image/jpeg', quality: 82 });
      const r = out.response();
      const h = new Headers(r.headers);
      // public para que el borde de Cloudflare la guarde: la URL trae un UUID
      // inadivinable, asi que la foto queda tan protegida como su propia liga.
      h.set('Cache-Control', 'public, max-age=86400');
      h.set('Content-Type', 'image/jpeg');
      const resp = new Response(r.body, { status: 200, headers: h });
      ctx.waitUntil(cache.put(llaveCache, resp.clone()));
      return resp;
    } catch (ex) {
      console.error('transformación de imagen falló', ex.message);
      return err('No se pudo procesar la imagen: ' + ex.message, 500);
    }
  }

  // ---- Descarga del cliente: no lleva llave, lleva firma ----
  // La firma es por archivo y caduca en minutos, asi que una URL copiada no sirve
  // para compartir ni para raspar el material despues.
  if (action === 'bajar') {
    const archivoId = url.searchParams.get('a') || '';
    const firma = url.searchParams.get('f') || '';
    if (!await verificarFirma(env, 'bajar:' + archivoId, firma)) {
      return err('Enlace de descarga vencido. Vuelve a entrar a tu galería.', 403);
    }
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a || !a.r2_key) return err('Archivo no encontrado', 404);
    // Doble candado: la firma pudo emitirse antes de que se pausara o venciera.
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [a.e_entrega_id]);
    if (!e || e.estado !== 'liberada' || estaVencida(e.fecha_expira, now())) {
      return err('Este material ya no está disponible.', 403);
    }
    // Se le pasan las cabeceras tal cual: R2 entiende Range e If-Range y devuelve
    // solo el pedazo pedido. Es lo que permite pausar y retomar un video de 1 GB.
    const obj = await env.ENTREGAS_ORIGINALES.get(a.r2_key, { range: request.headers });
    if (!obj) return err('Archivo no encontrado', 404);

    // Quien manda es la PETICION, no R2: R2 rellena obj.range aunque nadie haya
    // pedido un pedazo, y fiarse de el hace que hasta una descarga normal conteste
    // 206 (y que no se registre en la bitacora). Medido en produccion.
    const pidioRango = !!request.headers.get('Range');
    const c = cabecerasRango(pidioRango ? obj.range : null, obj.size);
    const h = new Headers({
      'Content-Type': a.mime || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nombreDescarga(a.nombre, 'archivo')}"`,
      // Anunciar el tamano es lo que hace que la barra del navegador avance en vez
      // de girar sin decir nada.
      'Content-Length': String(c.contentLength),
      'Accept-Ranges': 'bytes',
      'ETag': obj.httpEtag,
      'Cache-Control': 'private, no-store'
    });
    if (c.contentRange) h.set('Content-Range', c.contentRange);

    // Solo cuenta como descarga la que empieza desde cero: al retomar, el navegador
    // pide otro pedazo del MISMO archivo y contarlo otra vez inflaria la bitacora.
    if (!pidioRango) ctx.waitUntil(evento(db, e.id, 'descarga', a.nombre || ''));
    return new Response(obj.body, { status: c.status, headers: h });
  }

  // ---- Todas las fotos en un solo archivo ----
  // El video NO va aqui: ya es un archivo suelto y meterlo en un ZIP es trabajo de
  // mas sin ganar nada. Se baja por su cuenta, y asi ademas se puede retomar.
  if (action === 'zip') {
    const entregaId = url.searchParams.get('e') || '';
    const firma = url.searchParams.get('f') || '';
    // Bruno tambien puede bajarlo, en cualquier estado y con su llave: es su
    // material y lo va a querer para respaldar. El cliente pasa por la firma.
    const esBruno = !requireEntregas(request, env);
    if (!esBruno && !await verificarFirma(env, 'zip:' + entregaId, firma)) {
      return err('Enlace de descarga vencido. Vuelve a entrar a tu galería.', 403);
    }
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [entregaId]);
    if (!e) return err('Entrega no encontrada', 404);
    if (!esBruno && (e.estado !== 'liberada' || estaVencida(e.fecha_expira, now()))) {
      return err('Este material ya no está disponible.', 403);
    }
    const { results } = await query(db,
      `SELECT * FROM e_archivos WHERE e_entrega_id=? AND r2_key<>'' AND mime NOT LIKE 'video/%'
       ORDER BY orden, rowid`, [entregaId]);
    if (!results || !results.length) return err('No hay fotos que descargar', 404);

    // Los tamanos se leen de R2, no de la base: el Content-Length tiene que ser
    // exacto o el navegador corta la descarga a medias. Van en paralelo porque en
    // serie serian 45 viajes de ida y vuelta antes de mandar el primer byte.
    const medidos = await Promise.all(results.map(async a => {
      try {
        const h = await env.ENTREGAS_ORIGINALES.head(a.r2_key);
        return h ? { a, bytes: h.size } : null;
      } catch (ex) { return null; }
    }));
    // El CRC tiene que estar calculado de antemano. Si falta, el ZIP saldria
    // corrupto o habria que leer los bytes aqui — que es lo que revienta el CPU.
    const sinCrc = (results || []).filter(a => Number(a.crc32) < 0).length;
    if (sinCrc) {
      return err(`Faltan ${sinCrc} fotos por preparar. Prepara la galería y vuelve a intentar.`, 409);
    }
    const usados = new Set();
    const entradas = medidos.filter(Boolean).map(m => ({
      nombre: nombreZip(m.a.nombre, usados), bytes: m.bytes,
      crc: Number(m.a.crc32) >>> 0, llave: m.a.r2_key
    }));
    if (!entradas.length) return err('No se pudo leer el material', 502);
    if (!cabeEnZip(entradas)) {
      return err('El material es demasiado grande para un solo archivo. Descárgalo por partes.', 413);
    }

    const folio = await folioDeEntrega(db, e);
    const nombre = nombreDescarga((folio || e.titulo || 'entrega') + '-fotos.zip', 'fotos.zip');
    // Solo se anota en la bitacora lo que baja el CLIENTE. Que Bruno saque una
    // copia no es un evento de la entrega.
    if (!esBruno) ctx.waitUntil(evento(db, e.id, 'descarga', `${entradas.length} fotos (zip)`));

    // El total se le pasa a armarZip para que use FixedLengthStream: ese es el que
    // mueve los bytes sin quemar CPU y el que pone el Content-Length solo.
    const total = tamanoZip(entradas);
    const cuerpo = armarZip(entradas, async en => {
      const obj = await env.ENTREGAS_ORIGINALES.get(en.llave);
      return obj ? obj.body : null;
    }, undefined, total);
    return new Response(cuerpo, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  }

  // Origen temporal para que Stream copie el video desde R2 sin exponer el bucket.
  if (action === 'origen') {
    const archivoId = url.searchParams.get('a') || '';
    const firma = url.searchParams.get('f') || '';
    if (!await verificarFirma(env, 'origen:' + archivoId, firma)) return err('Firma inválida', 403);
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a || !a.r2_key) return err('Archivo no encontrado', 404);
    // Stream necesita saber cuanto pesa y poder pedirlo por pedazos: asi es como
    // descarga un archivo de 1 GB. Sin Content-Length ni Accept-Ranges rechaza la
    // copia con "Authentication failed", que es un mensaje enganoso — no es el
    // token, es que no pudo LEER la URL. Ver §12b del handoff.
    const obj = await env.ENTREGAS_ORIGINALES.get(a.r2_key, { range: request.headers });
    if (!obj) return err('Archivo no encontrado', 404);

    const pidioRango = !!request.headers.get('Range');
    const c = cabecerasRango(pidioRango ? obj.range : null, obj.size);
    const h = new Headers({
      'Content-Type': a.mime || 'video/mp4',
      'Content-Length': String(c.contentLength),
      'Accept-Ranges': 'bytes',
      'ETag': obj.httpEtag,
      'Cache-Control': 'private, no-store'
    });
    if (c.contentRange) h.set('Content-Range', c.contentRange);
    // A un HEAD hay que contestarle las mismas cabeceras pero sin cuerpo: es lo
    // primero que hace Stream para saber con que se va a topar.
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: h });
    return new Response(obj.body, { status: c.status, headers: h });
  }

  // ---- De aqui en adelante, todo pide llave ----
  const deny = requireEntregas(request, env);
  if (deny) return deny;

  // Sube el PNG de la marca de agua a R2. Es la unica forma de meterlo al bucket:
  // el OAuth de wrangler no incluye permisos de R2, pero el Worker si tiene binding.
  // Cambiarlo aqui cambia todas las galerias al instante.
  if (action === 'subirMarca') {
    const form = await request.formData();
    const png = form.get('archivo');
    if (!png) return err('Falta el archivo');
    await env.ENTREGAS_ORIGINALES.put(LLAVE_MARCA, png.stream(),
      { httpMetadata: { contentType: 'image/png' } });
    const check = await env.ENTREGAS_ORIGINALES.head(LLAVE_MARCA);
    return ok({ ok: true, llave: LLAVE_MARCA, bytes: check ? check.size : 0 });
  }

  // Prueba de vida del binding de Images: toma la marca de agua, la reduce y la
  // devuelve. Si esto responde una imagen, la transformacion al vuelo funciona.
  if (action === 'probarImages') {
    const marca = await env.ENTREGAS_ORIGINALES.get(LLAVE_MARCA);
    if (!marca) return err('Sube primero la marca de agua', 400);
    try {
      const out = await env.IMAGES.input(marca.body)
        .transform({ width: 400 })
        .output({ format: 'image/jpeg', quality: 80 });
      const r = out.response();
      return new Response(r.body, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    } catch (ex) {
      return err('IMAGES no disponible: ' + ex.message, 501);
    }
  }

  // ---- Subida (F3) ----
  // Foto: llega YA marcada por el navegador (la preview) mas el original limpio.
  // El original nunca toca Images; Images sirve URLs publicas y ahi se caeria el candado.
  // UNA sola subida y UNA sola copia guardada: el original limpio a R2 y ya.
  // El mosaico se dibuja al servir en e/foto, asi que no hay copia marcada que
  // guardar ni canvas en el navegador que pueda alterar el color.
  if (action === 'subirFoto') {
    const form = await request.formData();
    const entregableId = form.get('entregableId');
    const original = form.get('original');
    const nombre = String(form.get('nombre') || 'foto.jpg');
    if (!entregableId || !original) return err('Datos incompletos');

    const ent = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
    if (!ent) return err('Entregable no encontrado', 404);
    if (!esImagen(original.type)) return err('Ese archivo no es una imagen que el navegador pueda mostrar', 400);

    const archivoId = uuid();
    const key = llaveR2(ent.e_entrega_id, archivoId, nombre);
    await guardarEnR2(env, key, original.stream(), original.type);

    const c = await queryOne(db,
      'SELECT COUNT(*) AS n FROM e_archivos WHERE e_entregable_id=?', [entregableId]);
    await run(db,
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, orden, destacado, estado, fecha)
       VALUES (?,?,?,?,?,?,?,?,?, 'listo', ?)`,
      [archivoId, entregableId, ent.e_entrega_id, nombre, original.size || 0, original.type || '',
       key, (c && c.n) || 0, (c && c.n) === 0 ? 1 : 0, now()]);
    await refrescarEntregable(db, entregableId);
    // NO se genera aqui la copia reducida, aunque sea tentador. Se intento con
    // ctx.waitUntil y el resultado fue peor que el problema: transformar un JPEG de
    // 10 MB mientras siguen entrando subidas agota los recursos del isolate, y a
    // partir de ahi TODAS las subidas siguientes contestan 503. Medido: de 50 fotos
    // entraron 10 y 40 murieron en cadena.
    // La copia se hace despues, desde el endpoint 'derivados', en peticiones
    // separadas y de a poquitas. Ver completarDerivados() en el portal.
    return ok({ ok: true, archivoId });
  }

  // Importa UN archivo desde Google Drive directo a R2, del lado del servidor.
  // Sirve para material que ya vive en Drive: no baja nada a la computadora de
  // Bruno ni lo vuelve a subir. Va de uno en uno a proposito — 40 fotos de 10 MB
  // en una sola peticion revientan el limite de tiempo del Worker.
  //
  // Requiere que el archivo sea alcanzable por liga (el enlace de "cualquiera con
  // el enlace"). Si Drive contesta HTML en vez del binario, es que no lo es.
  if (action === 'importarDrive') {
    const { entregableId, driveId, nombre, esVideoFlag } = await request.json();
    if (!entregableId || !driveId) return err('Datos incompletos');
    const ent = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
    if (!ent) return err('Entregable no encontrado', 404);

    // drive.google.com/uc sirve archivos chicos, pero arriba de ~100 MB devuelve la
    // pagina de "no se pudo analizar en busca de virus" en vez del binario. El host
    // usercontent con confirm=t entrega el archivo directo sin importar el tamaño,
    // asi que va primero y el otro queda de respaldo.
    const urls = [
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`
    ];
    let r = null, mime = '';
    for (const origen of urls) {
      try {
        const intento = await fetch(origen, { redirect: 'follow' });
        if (!intento.ok) continue;
        const t = intento.headers.get('content-type') || '';
        if (/text\/html/i.test(t)) { try { await intento.body?.cancel(); } catch (e) {} continue; }
        r = intento; mime = t; break;
      } catch (ex) {
        console.error('importarDrive fetch falló', ex.message);
      }
    }
    if (!r) {
      return err('Drive no entregó el archivo. Revisa que esté compartido por enlace.', 502);
    }
    const bytes = Number(r.headers.get('content-length')) || 0;

    const archivoId = uuid();
    const key = llaveR2(ent.e_entrega_id, archivoId, nombre || 'archivo');
    // Se pasa el cuerpo en streaming: nunca se carga el archivo entero en memoria.
    await env.ENTREGAS_ORIGINALES.put(key, r.body, { httpMetadata: { contentType: mime } });
    const guardado = await env.ENTREGAS_ORIGINALES.head(key);

    const c = await queryOne(db,
      'SELECT COUNT(*) AS n FROM e_archivos WHERE e_entregable_id=?', [entregableId]);
    await run(db,
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, orden, destacado, estado, fecha)
       VALUES (?,?,?,?,?,?,?,?,?, 'listo', ?)`,
      [archivoId, entregableId, ent.e_entrega_id, nombre || 'archivo',
       (guardado && guardado.size) || bytes, mime, key,
       (c && c.n) || 0, (c && c.n) === 0 && !esVideoFlag ? 1 : 0, now()]);
    await refrescarEntregable(db, entregableId);
    // Igual que en subirFoto: la copia reducida NO se genera aqui. Ver el comentario
    // de alla — hacerlo durante la importacion tumba el isolate y la siguiente falla.
    return ok({ ok: true, archivoId, bytes: (guardado && guardado.size) || bytes, mime });
  }

  // Video: subida multiparte a R2. Cada trozo cabe en el limite del Worker.
  if (action === 'videoIniciar') {
    const { entregableId, nombre, mime, bytes } = await request.json();
    const ent = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
    if (!ent) return err('Entregable no encontrado', 404);
    if (!esVideo(mime)) return err('Ese archivo no es un video', 400);
    const archivoId = uuid();
    const key = llaveR2(ent.e_entrega_id, archivoId, nombre || 'video.mp4');
    const mp = await env.ENTREGAS_ORIGINALES.createMultipartUpload(key, {
      httpMetadata: { contentType: mime || 'video/mp4' }
    });
    await run(db,
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, orden, estado, fecha)
       VALUES (?,?,?,?,?,?,?,0,'subiendo',?)`,
      [archivoId, entregableId, ent.e_entrega_id, nombre || 'video.mp4', bytes || 0,
       mime || 'video/mp4', key, now()]);
    return ok({ ok: true, archivoId, key, uploadId: mp.uploadId });
  }

  if (action === 'videoParte') {
    const key = url.searchParams.get('key');
    const uploadId = url.searchParams.get('uploadId');
    const parte = Number(url.searchParams.get('parte'));
    if (!key || !uploadId || !Number.isFinite(parte)) return err('Datos incompletos');
    const mp = env.ENTREGAS_ORIGINALES.resumeMultipartUpload(key, uploadId);
    const r = await mp.uploadPart(parte, request.body);
    return ok({ ok: true, parte: r.partNumber, etag: r.etag });
  }

  if (action === 'videoTerminar') {
    const { archivoId, key, uploadId, partes, ancho, alto } = await request.json();
    if (!archivoId || !key || !uploadId || !Array.isArray(partes)) return err('Datos incompletos');
    const mp = env.ENTREGAS_ORIGINALES.resumeMultipartUpload(key, uploadId);
    await mp.complete(partes.map(p => ({ partNumber: p.parte, etag: p.etag })));

    // Stream copia desde R2 con la marca quemada. Un video vertical usa su propio
    // perfil: el PNG es muy alargado y con la escala horizontal quedaria ilegible.
    let streamUid = '', customer = '';
    try {
      const f = await firmar(env, 'origen:' + archivoId, 1800);
      const origen = `${baseEntregas(env)}/api/e/origen?a=${archivoId}&f=${encodeURIComponent(f)}`;
      const r = await copiarAStream(env, origen, `entrega-${archivoId}`,
        perfilWatermark(env, ancho, alto));
      streamUid = r.uid; customer = r.customer;
    } catch (e) {
      console.error('copiarAStream falló', e.message);
    }
    await run(db,
      `UPDATE e_archivos SET estado='listo', stream_uid=?, ancho=?, alto=? WHERE id=?`,
      [streamUid, Number(ancho) || 0, Number(alto) || 0, archivoId]);
    const a = await queryOne(db, 'SELECT e_entregable_id FROM e_archivos WHERE id=?', [archivoId]);
    if (a) await refrescarEntregable(db, a.e_entregable_id);
    return ok({ ok: true, streamUid, customer, conMarca: !!streamUid });
  }

  // Manda a Stream un video que YA esta en R2. Va aparte de la subida a proposito:
  // si Stream falla, se reintenta sin volver a mover el archivo pesado.
  if (action === 'procesarVideo') {
    const { archivoId, ancho, alto } = await request.json();
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a) return err('Archivo no encontrado', 404);
    if (!a.r2_key) return err('Ese archivo no está en R2', 400);
    const obj = await env.ENTREGAS_ORIGINALES.head(a.r2_key);
    if (!obj) return err('El archivo ya no está en R2', 404);

    const perfil = perfilWatermark(env, ancho, alto);
    try {
      // Stream jala desde una URL firmada que sirve el propio Worker: el bucket
      // nunca queda expuesto y la firma caduca sola.
      const f = await firmar(env, 'origen:' + archivoId, 3600);
      const origen = `${baseEntregas(env)}/api/e/origen?a=${archivoId}&f=${encodeURIComponent(f)}`;
      const r = await copiarAStream(env, origen, `entrega-${archivoId}`, perfil);
      await run(db,
        `UPDATE e_archivos SET stream_uid=?, ancho=?, alto=? WHERE id=?`,
        [r.uid, Number(ancho) || 0, Number(alto) || 0, archivoId]);
      await refrescarEntregable(db, a.e_entregable_id);
      return ok({ ok: true, streamUid: r.uid, customer: r.customer, perfil,
                  vertical: Number(alto) > Number(ancho), bytes: obj.size });
    } catch (ex) {
      // Se devuelve el origen para poder probarlo a mano: cuando Stream falla, casi
      // siempre es que no pudo LEER esa URL, no que el token este mal.
      const f2 = await firmar(env, 'origen:' + archivoId, 600);
      return err('Stream rechazó el video: ' + ex.message +
        ' — origen para probar: ' + `${baseEntregas(env)}/api/e/origen?a=${archivoId}&f=${encodeURIComponent(f2)}`, 502);
    }
  }

  // Estado de un video en Stream: sirve para saber si ya termino de codificar.
  if (action === 'estadoVideo') {
    const archivoId = url.searchParams.get('a') || '';
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a) return err('Archivo no encontrado', 404);
    const salida = { ok: true, nombre: a.nombre, bytes: a.bytes,
                     streamUid: a.stream_uid, streamUidLimpio: a.stream_uid_limpio };
    for (const [campo, uid] of [['conMarca', a.stream_uid], ['limpio', a.stream_uid_limpio]]) {
      if (!uid) { salida[campo] = null; continue; }
      try {
        const r = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`,
          { headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` } });
        const j = await r.json();
        const res = j && j.result;
        // Si Stream no contesta un resultado hay que decir POR QUE. Devolver null a
        // secas hacia imposible distinguir "el video no existe" de "el token no
        // tiene permisos", y esa confusion costo un diagnostico entero (§12b).
        salida[campo] = res ? {
          listo: !!res.readyToStream,
          estado: (res.status && res.status.state) || '',
          avance: (res.status && res.status.pctComplete) || '',
          duracion: res.duration, ancho: res.input && res.input.width, alto: res.input && res.input.height
        } : { error: (j && j.errors && j.errors.map(e => `${e.code}: ${e.message}`).join('; ')) ||
                     `Stream contestó ${r.status} sin resultado` };
      } catch (ex) { salida[campo] = { error: ex.message }; }
    }
    return ok(salida);
  }

  // Cual foto es la portada. Existia la columna y hasta el borde dorado en el
  // portal, pero no habia forma de cambiarla: se quedaba la primera que se subio.
  if (action === 'portada') {
    const { archivoId } = await request.json();
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a) return err('Archivo no encontrado', 404);
    if (esVideo(a.mime)) return err('La portada tiene que ser una foto', 400);
    await batch(db, [
      { sql: 'UPDATE e_archivos SET destacado=0 WHERE e_entrega_id=?', params: [a.e_entrega_id] },
      { sql: 'UPDATE e_archivos SET destacado=1 WHERE id=?', params: [archivoId] }
    ]);
    return ok({ ok: true });
  }

  if (action === 'borrarArchivo') {
    const { archivoId } = await request.json();
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a) return err('Archivo no encontrado', 404);
    await borrarMediaDeEntrega(env, [a]);
    await run(db, 'DELETE FROM e_archivos WHERE id=?', [archivoId]);
    await refrescarEntregable(db, a.e_entregable_id);
    return ok({ ok: true });
  }


  if (action === 'listar') {
    const { results } = await query(db, 'SELECT * FROM e_entregas ORDER BY fecha_creacion DESC');
    const lista = results || [];
    const salida = [];
    for (const e of lista) {
      const cliente = await resolverCliente(db, e.e_cliente_id);
      const items = await entregablesDe(db, e.id);
      const folio = await folioDeEntrega(db, e);
      const saldo = await saldoDeEntrega(db, e);
      salida.push({
        id: e.id, codigo: e.codigo, titulo: e.titulo, direccion: e.direccion,
        estado: e.estado, grupo: grupoDeEntrega(e.estado),
        cliente: cliente.nombre, folio,
        fechaSesion: e.fecha_sesion, fechaCreacion: e.fecha_creacion,
        fechaPublicada: e.fecha_publicada, fechaLiberada: e.fecha_liberada,
        fechaExpira: e.fecha_expira,
        diasRestantes: diasRestantes(e.fecha_expira, now()),
        saldo, pagadoManual: !!e.pagado_manual,
        entregables: items.map(i => ({ id: i.id, tipo: i.tipo, nombre: i.nombre,
                                       completo: !!i.completo, numArchivos: i.num_archivos })),
        completa: entregaCompleta(items),
        faltan: faltantes(items),
        rutaPublica: baseEntregas(env) + rutaPublica(folio, e.codigo)
      });
    }
    const ahora = now();
    return ok({
      ok: true,
      pendientes:  ordenarEntregas(salida.filter(e => e.grupo === 'pendientes'), ahora),
      conCliente:  ordenarEntregas(salida.filter(e => e.grupo === 'con_cliente'), ahora),
      liberadas:   ordenarEntregas(salida.filter(e => e.grupo === 'liberadas'), ahora),
      historial:   salida.filter(e => e.grupo === 'historial')
    });
  }

  if (action === 'obtener') {
    const id = url.searchParams.get('id') || '';
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    const cliente = await resolverCliente(db, e.e_cliente_id);
    const items = await entregablesDe(db, e.id);
    const { results: archivos } = await query(db,
      'SELECT * FROM e_archivos WHERE e_entrega_id=? ORDER BY orden, rowid', [e.id]);
    const { results: eventos } = await query(db,
      'SELECT * FROM e_eventos WHERE e_entrega_id=? ORDER BY fecha DESC LIMIT 40', [e.id]);
    const folio = await folioDeEntrega(db, e);
    const saldo = await saldoDeEntrega(db, e);
    let precioTotal = null;
    if (e.contrato_token) {
      const c = await queryOne(db, 'SELECT precio_total FROM contratos WHERE token=?', [e.contrato_token]);
      precioTotal = c ? c.precio_total : null;
    }
    return ok({
      ok: true,
      entrega: {
        ...e, folio, saldo, precioTotal,
        diasRestantes: diasRestantes(e.fecha_expira, now()),
        fechaLimite: e.fecha_expira ? fechaLegible(e.fecha_expira) : '',
        rutaPublica: baseEntregas(env) + rutaPublica(folio, e.codigo)
      },
      cliente,
      entregables: items,
      archivos: archivos || [],
      eventos: eventos || [],
      completa: entregaCompleta(items),
      faltan: faltantes(items)
    });
  }

  if (action === 'buscarClientes') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return ok({ ok: true, resultados: [] });
    const like = `%${q}%`;
    // Busca en las dos listas a la vez: los del sistema de entregas y los del admin.
    const { results: propios } = await query(db,
      `SELECT id, cliente_id, nombre, telefono FROM e_clientes
       WHERE cliente_id IS NULL AND nombre LIKE ? LIMIT 10`, [like]);
    const { results: admins } = await query(db,
      `SELECT id, nombre, telefono FROM clientes WHERE nombre LIKE ? LIMIT 10`, [like]);
    const salida = [];
    for (const p of (propios || [])) {
      salida.push({ eClienteId: p.id, clienteId: '', nombre: p.nombre,
                    telefono: p.telefono, origen: 'entregas' });
    }
    for (const a of (admins || [])) {
      salida.push({ eClienteId: '', clienteId: a.id, nombre: a.nombre,
                    telefono: a.telefono, origen: 'admin' });
    }
    return ok({ ok: true, resultados: salida });
  }

  // Entrega suelta: cliente que no viene de ningun contrato.
  if (action === 'crear') {
    const b = await request.json();
    const { clienteId, eClienteId, nombreCliente, telefono, correo, titulo, direccion } = b;
    if (!titulo) return err('Título requerido');

    let eCli = null;
    if (clienteId) {
      eCli = await eClienteDeAdmin(db, clienteId);
    } else if (eClienteId) {
      eCli = await queryOne(db, 'SELECT * FROM e_clientes WHERE id=?', [eClienteId]);
    } else if (nombreCliente) {
      const nid = uuid();
      await run(db,
        `INSERT INTO e_clientes (id, cliente_id, nombre, telefono, correo, origen, fecha_creacion)
         VALUES (?,NULL,?,?,?, 'manual', ?)`,
        [nid, nombreCliente, telefono || '', correo || '', now()]);
      eCli = await queryOne(db, 'SELECT * FROM e_clientes WHERE id=?', [nid]);
    }
    if (!eCli) return err('Cliente requerido');

    const id = uuid();
    const codigo = await codigoLibre(db);
    await run(db,
      `INSERT INTO e_entregas (id, e_cliente_id, contrato_token, num_propiedad, codigo,
        titulo, direccion, estado, fecha_creacion)
       VALUES (?,?,NULL,NULL,?,?,?, 'borrador', ?)`,
      [id, eCli.id, codigo, titulo, direccion || '', now()]);
    const items = entregablesSembrados('', [], 1);   // set completo por defecto
    await batch(db, items.map(it => ({
      sql: `INSERT INTO e_entregables (id, e_entrega_id, tipo, nombre, orden, completo, valor)
            VALUES (?,?,?,?,?,0,'')`,
      params: [uuid(), id, it.tipo, it.nombre, it.orden]
    })));
    await evento(db, id, 'creada', 'Entrega suelta');
    return ok({ ok: true, id, codigo });
  }

  if (action === 'actualizar') {
    const { id, titulo, direccion, tourUrl, diasVigencia } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    await run(db,
      `UPDATE e_entregas SET titulo=COALESCE(?,titulo), direccion=COALESCE(?,direccion),
       tour_url=COALESCE(?,tour_url), dias_vigencia=COALESCE(?,dias_vigencia) WHERE id=?`,
      [titulo ?? null, direccion ?? null, tourUrl ?? null,
       diasVigencia != null ? Number(diasVigencia) : null, id]);
    return ok({ ok: true });
  }

  // ---- Entregables ----
  if (action === 'agregarEntregable') {
    const { entregaId, tipo, nombre } = await request.json();
    if (!entregaId || !tipo || !nombre) return err('Datos incompletos');
    if (!['fotos', 'video', 'enlace'].includes(tipo)) return err('Tipo no válido');
    const c = await queryOne(db,
      'SELECT COUNT(*) AS n FROM e_entregables WHERE e_entrega_id=?', [entregaId]);
    await run(db,
      `INSERT INTO e_entregables (id, e_entrega_id, tipo, nombre, orden, completo, valor)
       VALUES (?,?,?,?,?,0,'')`, [uuid(), entregaId, tipo, nombre, (c && c.n) || 0]);
    return ok({ ok: true });
  }

  if (action === 'borrarEntregable') {
    const { entregableId } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
    if (!e) return err('Entregable no encontrado', 404);
    await batch(db, [
      { sql: 'DELETE FROM e_archivos WHERE e_entregable_id=?', params: [entregableId] },
      { sql: 'DELETE FROM e_entregables WHERE id=?', params: [entregableId] }
    ]);
    return ok({ ok: true });
  }

  if (action === 'guardarEnlace') {
    const { entregableId, valor } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
    if (!e) return err('Entregable no encontrado', 404);
    if (e.tipo !== 'enlace') return err('Ese entregable no es un enlace', 400);
    await run(db, 'UPDATE e_entregables SET valor=? WHERE id=?', [String(valor || '').trim(), entregableId]);
    await refrescarEntregable(db, entregableId);
    // El tour 360 se guarda tambien en la entrega para que el portal lo muestre en su seccion.
    if (/tour|360/i.test(e.nombre)) {
      await run(db, 'UPDATE e_entregas SET tour_url=? WHERE id=?',
        [String(valor || '').trim(), e.e_entrega_id]);
    }
    return ok({ ok: true });
  }

  // ---- Transiciones ----
  if (action === 'publicar') {
    const { id } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    const items = await entregablesDe(db, e.id);
    if (!entregaCompleta(items)) {
      return err('Faltan entregables: ' + faltantes(items).join(', '), 400);
    }
    const ts = now();
    await run(db,
      `UPDATE e_entregas SET estado='publicada', fecha_publicada=COALESCE(fecha_publicada,?) WHERE id=?`,
      [ts, id]);
    await evento(db, id, 'publicada', '');

    // Si el cliente ya habia liquidado antes de publicar, se libera en este momento.
    const saldo = await saldoDeEntrega(db, e);
    if (debeLiberarAlPublicar(saldo, e.pagado_manual)) {
      const fresca = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
      const r = await liberar(db, env, fresca, 'Ya estaba pagada al publicar');
      return ok({ ok: true, estado: 'liberada', ...r });
    }
    return ok({ ok: true, estado: 'publicada' });
  }

  if (action === 'liberar') {
    const { id } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    if (e.estado === 'borrador') return err('Publica la entrega antes de liberarla', 400);
    const r = await liberar(db, env, e, 'Liberada a mano');
    return ok({ ok: true, estado: 'liberada', ...r });
  }

  if (action === 'marcarPagada') {
    const { id, pagada } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    const v = pagada ? 1 : 0;
    await run(db, 'UPDATE e_entregas SET pagado_manual=? WHERE id=?', [v, id]);
    await evento(db, id, 'pago', v ? 'Marcada como pagada' : 'Marca de pago retirada');
    if (v && e.estado === 'publicada') {
      const fresca = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
      const r = await liberar(db, env, fresca, 'Marcada como pagada');
      return ok({ ok: true, estado: 'liberada', ...r });
    }
    return ok({ ok: true });
  }

  if (action === 'extender') {
    const { id, dias } = await request.json();
    const n = Number(dias);
    if (!Number.isFinite(n) || n <= 0 || n > 365) return err('Días inválidos', 400);
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    // Extender desde HOY, no desde la fecha vieja: si ya vencio, revive con dias completos.
    const desde = estaVencida(e.fecha_expira, now()) ? now() : e.fecha_expira;
    const base = new Date(desde).getTime();
    const nueva = calcularExpiracion(new Date(base).toISOString(), n);
    await run(db,
      `UPDATE e_entregas SET fecha_expira=?, estado=CASE WHEN estado='expirada' THEN 'liberada' ELSE estado END
       WHERE id=?`, [nueva, id]);
    await evento(db, id, 'extendida', `+${n} días`);
    return ok({ ok: true, fechaExpira: nueva, fechaLimite: fechaLegible(nueva) });
  }

  if (action === 'pausar') {
    const { id, pausar } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    if (pausar) {
      await run(db, `UPDATE e_entregas SET estado='pausada', fecha_pausada=? WHERE id=?`, [now(), id]);
      await evento(db, id, 'pausada', '');
      return ok({ ok: true, estado: 'pausada' });
    }
    // Al reanudar vuelve a donde estaba segun tenga o no reloj corriendo.
    const destino = e.fecha_liberada ? 'liberada' : 'publicada';
    await run(db, `UPDATE e_entregas SET estado=?, fecha_pausada=NULL WHERE id=?`, [destino, id]);
    await evento(db, id, 'reanudada', '');
    return ok({ ok: true, estado: destino });
  }

  if (action === 'borrar') {
    const { id } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [id]);
    if (!e) return err('Entrega no encontrada', 404);
    await borrarEntregaCascada(db, env, id);
    return ok({ ok: true });
  }

  // Siembra (o completa) las entregas de un contrato que ya existe.
  // Resuelve el hueco de arranque: el hook solo corre en contratos NUEVOS, asi que
  // todo lo que ya estaba en produccion nace sin entrega. Es idempotente — vuelve a
  // correrse sin duplicar, porque sembrarEntregasDeContrato salta las que ya existen.
  if (action === 'sembrar') {
    const { token, todos } = await request.json();
    let tokens = [];
    if (token) {
      tokens = [token];
    } else if (todos) {
      const { results } = await query(db,
        `SELECT token FROM contratos WHERE estatus NOT IN ('Cancelado')
         ORDER BY fecha_creacion DESC LIMIT 200`);
      tokens = (results || []).map(r => r.token);
    } else {
      return err('Falta token, o todos:true', 400);
    }

    let creadas = 0, contratos = 0, fallos = 0;
    for (const t of tokens) {
      const c = await queryOne(db, 'SELECT * FROM contratos WHERE token=?', [t]);
      if (!c) { fallos++; continue; }
      const { results: props } = await query(db,
        'SELECT num_propiedad, direccion, fecha_sesion, paquete FROM propiedades WHERE contrato_token=? ORDER BY num_propiedad',
        [t]);
      if (!props || !props.length) continue;
      try {
        const r = await sembrarEntregasDeContrato(db, c, props);
        creadas += r.creadas;
        if (r.creadas) contratos++;
      } catch (e) {
        console.error('sembrar falló para', t, e.message);
        fallos++;
      }
    }
    return ok({ ok: true, creadas, contratos, revisados: tokens.length, fallos });
  }

  // Genera las copias reducidas que falten. Va de a pocas por peticion para no
  // reventar los limites del Worker; el portal la llama en bucle hasta que no quedan.
  if (action === 'derivados') {
    const { entregaId, lote } = await request.json();
    // Tope de 2: cada una transforma un original de 10 MB y pasarse revienta el
    // isolate igual que en la subida. Mejor muchas peticiones chicas que una gorda.
    const n = Math.min(2, Math.max(1, Number(lote) || 1));
    // Falta preparar si le falta la copia reducida O el CRC. El CRC lo necesitan
    // tambien los videos: si no, no pueden ir en un ZIP — aunque hoy no van, el
    // dia que se quiera no habra que recalcular nada.
    const filtro = `r2_key<>'' AND (crc32 < 0 OR (r2_key_web='' AND mime NOT LIKE 'video/%'))`;
    const { results } = await query(db,
      `SELECT * FROM e_archivos WHERE ${filtro}
       ${entregaId ? 'AND e_entrega_id=?' : ''} LIMIT ?`,
      entregaId ? [entregaId, n] : [n]);
    let hechos = 0;
    for (const a of (results || [])) {
      let algo = false;
      if (!esVideo(a.mime) && !a.r2_key_web) algo = !!(await generarDerivado(env, db, a)) || algo;
      if (Number(a.crc32) < 0) algo = (await asegurarCrc(env, db, a)) || algo;
      if (algo) hechos++;
    }
    const pend = await queryOne(db,
      `SELECT COUNT(*) AS n FROM e_archivos WHERE ${filtro}
       ${entregaId ? 'AND e_entrega_id=?' : ''}`, entregaId ? [entregaId] : []);
    return ok({ ok: true, hechos, pendientes: (pend && pend.n) || 0 });
  }

  // Lo que se borra en los proximos dias. El portal lo muestra como aviso: no hay
  // correo automatico, asi que este es el unico lugar donde Bruno se entera a tiempo
  // de que algo esta por vaciarse y puede extenderlo.
  if (action === 'porExpirar') {
    const dias = Number(url.searchParams.get('dias') || 2);
    const { results } = await query(db,
      `SELECT * FROM e_entregas WHERE estado='liberada' AND fecha_expira IS NOT NULL`);
    const salida = [];
    for (const e of (results || [])) {
      const d = diasRestantes(e.fecha_expira, now());
      if (d == null || d > dias) continue;
      const cliente = await resolverCliente(db, e.e_cliente_id);
      salida.push({ id: e.id, titulo: e.titulo, cliente: cliente.nombre,
                    diasRestantes: d, fechaLimite: fechaLegible(e.fecha_expira) });
    }
    salida.sort((a, b) => a.diasRestantes - b.diasRestantes);
    return ok({ ok: true, entregas: salida });
  }

  // Dispara la expiracion a mano (el cron la corre cada hora de todos modos).
  if (action === 'expirarAhora') {
    const r = await expirarEntregas(env);
    return ok({ ok: true, ...r });
  }

  // Publicadas sin pagar, de mas vieja a mas nueva. Es la herramienta de limpieza manual:
  // no hay borrado automatico de lo no pagado, por decision de Bruno.
  if (action === 'sinPagar') {
    const { results } = await query(db,
      `SELECT e.* FROM e_entregas e WHERE e.estado='publicada' ORDER BY e.fecha_publicada ASC`);
    const salida = [];
    for (const e of (results || [])) {
      const saldo = await saldoDeEntrega(db, e);
      if (saldo != null && saldo <= 0) continue;
      if (e.pagado_manual) continue;
      const cliente = await resolverCliente(db, e.e_cliente_id);
      const b = await queryOne(db,
        'SELECT COALESCE(SUM(bytes),0) AS total, COUNT(*) AS n FROM e_archivos WHERE e_entrega_id=?', [e.id]);
      const dias = Math.floor(
        (Date.now() - new Date(e.fecha_publicada || e.fecha_creacion).getTime()) / 86400000);
      salida.push({
        id: e.id, titulo: e.titulo, cliente: cliente.nombre, saldo,
        diasPublicada: dias, bytes: (b && b.total) || 0, archivos: (b && b.n) || 0
      });
    }
    return ok({ ok: true, entregas: salida });
  }

  return err('Acción no encontrada', 404);
}
