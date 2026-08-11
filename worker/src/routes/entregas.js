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
  borrarMediaDeEntrega, firmar, verificarFirma, esImagen, esVideo, nombreDescarga
} from '../entregas-media.js';

const WA_BASE = 'https://wa.me/5218127174207';

// La marca de agua vive en R2 y se dibuja al servir. Cambiar este archivo cambia
// TODAS las entregas, viejas y nuevas, al instante: ya no hay nada quemado.
const LLAVE_MARCA = 'sistema/marca-agua.png';
const OPACIDAD_MARCA = 0.6;   // calibrada por Bruno sobre una foto real
// repeat tilea el PNG a su tamaño NATIVO, que en una foto de 1000px deja el texto
// gigante. width es una fraccion del ancho de la foto: el tile trae el texto mas su
// separacion, asi que 0.5 deja el texto ocupando ~25% del ancho.
// 0.45 reproduce de cerca lo que Bruno calibro (texto grande, separacion 2.0x).
// 0.30 da un mosaico mas denso y discreto. Se compara en vivo con ?m=.
const ANCHO_MARCA = 0.45;

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
async function borrarEntregaCascada(db, entregaId) {
  await batch(db, [
    { sql: 'DELETE FROM e_eventos WHERE e_entrega_id=?', params: [entregaId] },
    { sql: 'DELETE FROM e_archivos WHERE e_entrega_id=?', params: [entregaId] },
    { sql: 'DELETE FROM e_entregables WHERE e_entrega_id=?', params: [entregaId] },
    { sql: 'DELETE FROM e_entregas WHERE id=?', params: [entregaId] }
  ]);
}

// La llama eliminarContrato para no dejar entregas huerfanas apuntando a un
// contrato que ya no existe.
export async function borrarEntregasDeContrato(db, contratoToken) {
  const { results } = await query(db,
    'SELECT id FROM e_entregas WHERE contrato_token=?', [contratoToken]);
  for (const e of (results || [])) await borrarEntregaCascada(db, e.id);
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
  const video = (archivos || []).find(a => a.stream_uid);
  if (video) {
    // Por defecto va la copia con marca. Solo se cambia a la limpia cuando la
    // entrega esta liberada Y Stream confirma que ya termino de codificarla:
    // apuntar antes deja al cliente con un reproductor muerto.
    let uid = video.stream_uid;
    if (liberada && !vencida && video.stream_uid_limpio) {
      if (video.estado === 'limpio_listo') {
        uid = video.stream_uid_limpio;
      } else if (await streamListo(env, video.stream_uid_limpio)) {
        uid = video.stream_uid_limpio;
        // Se anota para no volver a preguntarle a Stream en cada visita.
        await run(db, `UPDATE e_archivos SET estado='limpio_listo' WHERE id=?`, [video.id]);
      }
    }
    base.video = { uid, conMarca: uid === video.stream_uid };
    base.streamCustomer = env.STREAM_CUSTOMER_CODE || '';
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
      descargas.push({
        id: a.id, nombre: a.nombre, bytes: a.bytes, mime: a.mime,
        tipo: esVideo(a.mime) ? 'video' : 'foto',
        url: `/api/e/bajar?a=${a.id}&f=${encodeURIComponent(f)}`
      });
    }
    base.descargas = descargas;
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

    const obj = await env.ENTREGAS_ORIGINALES.get(a.r2_key);
    if (!obj) return err('Foto no encontrada', 404);

    // El mosaico se quita SOLO si esta liberada y vigente. Esa es la unica condicion.
    const limpia = e.estado === 'liberada' && !estaVencida(e.fecha_expira, now());

    try {
      let pipe = env.IMAGES.input(obj.body).transform({ width: ancho, fit: 'scale-down' });
      if (!limpia) {
        const marca = await env.ENTREGAS_ORIGINALES.get(LLAVE_MARCA);
        if (marca) {
          // ?m= permite probar otra escala sin redesplegar; sin el va la calibrada.
          const w = Number(url.searchParams.get('m')) || ANCHO_MARCA;
          pipe = pipe.draw(marca.body,
            { repeat: true, opacity: OPACIDAD_MARCA, width: Math.min(1, Math.max(0.1, w)) });
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
      h.set('Cache-Control', limpia ? 'private, max-age=300' : 'private, max-age=3600');
      return new Response(r.body, { status: r.status, headers: h });
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
    const obj = await env.ENTREGAS_ORIGINALES.get(a.r2_key);
    if (!obj) return err('Archivo no encontrado', 404);
    ctx.waitUntil(evento(db, e.id, 'descarga', a.nombre || ''));
    return new Response(obj.body, {
      headers: {
        'Content-Type': a.mime || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${nombreDescarga(a.nombre, 'archivo')}"`,
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
    const obj = await env.ENTREGAS_ORIGINALES.get(a.r2_key);
    if (!obj) return err('Archivo no encontrado', 404);
    return new Response(obj.body, {
      headers: { 'Content-Type': a.mime || 'video/mp4', 'Cache-Control': 'private, no-store' }
    });
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
    return ok({ ok: true, archivoId });
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
    await borrarEntregaCascada(db, id);
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
