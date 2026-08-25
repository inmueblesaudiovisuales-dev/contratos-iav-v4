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
  debeBorrarse, diasParaBorrado, DIAS_GRACIA,
  entregaCompleta, faltantes, entregableCumplido,
  debeLiberarAlPagar, debeLiberarAlPublicar,
  datosCliente, grupoDeEntrega, ordenarEntregas, versionFotos, repartirFotos
} from '../entregas-core.js';
import {
  llaveR2, guardarEnR2, copiarAStream, perfilWatermark, streamListo,
  borrarMediaDeEntrega, borrarDeR2, borrarDeStream,
  firmar, verificarFirma, esImagen, esVideo, nombreDescarga,
  cabecerasRango
} from '../entregas-media.js';
import { armarZip, tamanoZip, cabeEnZip, nombreZip, crcDeStream } from '../entregas-zip.js';

const WA_BASE = 'https://wa.me/5218127174207';

// La marca de agua vive en R2 y se dibuja al servir. Cambiar este archivo cambia
// TODAS las entregas, viejas y nuevas, al instante: ya no hay nada quemado.
const LLAVE_MARCA = 'sistema/marca-agua.png';
// La version anterior, para poder volver atras: cambiar la marca afecta a todas las
// entregas al instante y el bucket no se puede leer con wrangler.
const LLAVE_MARCA_PREVIA = 'sistema/marca-agua-previa.png';
// Version de la marca. Va en la llave del cache, asi que subirla es lo que hace que
// las fotos ya servidas se vuelvan a dibujar.
//
// Sin esto, cambiar el PNG o la opacidad no se ve: cada ancho servido tiene su propia
// entrada cacheada por 24 h. Pasó al calibrar la marca el 18 ago — la nueva estaba bien
// y la galeria seguia mostrando la vieja, y el hero (que pide otro ancho) todavia mas
// tiempo. **Al recalibrar la marca hay que subir este numero.**
const VERSION_MARCA = 3;
// Calibrada por Bruno el 18 ago 2026 sobre fotos reales, comparando nueve variantes.
// Bajó de 0.60: con el tile nuevo el texto es mucho más grande y lleva sombra, así que
// menos opacidad se lee mejor que más opacidad sin sombra.
//
// R140 (24 ago 2026) — De 0.35 a 0.15. Bruno la comparó sobre sus propias fotos con
// ocho variantes (0.35 a 0.05 y sin marca), en claro y sobre fondo oscuro. A 0.35 la
// marca competía con la foto; a 0.15 sigue siendo legible y deja ver el trabajo, que
// es lo que el cliente vino a mirar. El tamaño NO cambia: sigue en ANCHO_MARCA.
const OPACIDAD_MARCA = 0.15;
// repeat tilea el PNG a su tamaño NATIVO, que en una foto de 1000px deja el texto
// gigante. width es una fraccion del ancho de la foto.
//
// 0.9375 = el tile ocupa casi todo el ancho de la foto. Con el tile nuevo (el texto
// llena el 80% del tile) eso deja el texto al ~75% del ancho de la foto: pocas marcas
// y grandes, que es lo que Bruno eligio. El valor sale de la separacion horizontal:
// 1 / 1.25.
const ANCHO_MARCA = 0.9375;

// Cuantas fotos ve el cliente antes de tener que pedir el resto. Es un muestrario:
// lo primero que ve tiene que ser el mejor trabajo, no 45 fotos revueltas. Seis
// llenan dos filas de tres en escritorio y siguen siendo pocas en el telefono.
export const DESTACADAS_VISIBLES = 6;

// La marca es PROPORCIONAL a la foto: ocupa la misma fraccion del ancho siempre, sin
// importar a que tamaño se muestre. Es como funciona cualquier marca de agua, y hace
// que el hero, una destacada y una miniatura se vean iguales entre si.
//
// Antes se compensaba por el ancho de despliegue (`d`) para que el texto midiera lo
// mismo en PIXELES en todas partes. La idea era razonable y el resultado no: obligaba
// a un piso —para que en pantallas grandes el tile no se volviera un punto— y ese piso
// terminaba siendo el techo real de todo. Medido el 18 ago: en el hero la marca era la
// misma pusieras el valor que pusieras, y el texto acababa midiendo el 6% del ancho de
// la foto. Practicamente invisible, que era justo lo que Bruno reportaba.
//
// `d` se sigue recibiendo (las paginas lo mandan y sirve para elegir el ancho servido),
// pero ya no cambia la marca.
//
// TOPE CRITICO en 0.95, no en 1 ni mas: Cloudflare lee width <= 1 como FRACCION y
// > 1 como PIXELES. Con width:1 el overlay mide un pixel y la marca de agua
// desaparece sin error — la imagen sale limpia y nadie se entera. Verificado: a
// partir de 1.00 la respuesta es identica byte por byte a no dibujar nada.
export const TOPE_MARCA = 0.95;
export function fraccionMarca(_anchoDespliegue, base) {
  const b = Number(base) > 0 ? Number(base) : ANCHO_MARCA;
  return Math.min(TOPE_MARCA, b);
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

// Lo que le falta preparacion. SOLO imagenes: los videos no llevan copia reducida
// ni entran al ZIP, asi que no necesitan CRC — y pedirselo a uno de 986 MB revienta
// el CPU del Worker y atora la fila entera.
// crc32: -1 = nunca se intento; -2 = se intento y no se pudo (no reintentar).
const FILTRO_BASE = `r2_key<>'' AND mime NOT LIKE 'video/%'`;
// R139 — Dos colas separadas en vez de una. Antes cada vuelta agarraba un archivo y
// le hacia los DOS trabajos: la copia de 2000 px y el CRC32. Juntos no caben: el CRC
// recorre el original entero byte por byte en JavaScript, y con fotos de 9 MB tres
// archivos por vuelta son 27 MB de cómputo. El cron moria con "Exceeded CPU Limit"
// antes de llegar a la linea que marca el fallo, asi que reintentaba lo mismo cada
// dos minutos sin avanzar nunca ni dejar rastro. Medido en produccion el 24 ago 2026
// con una entrega de 76 fotos: 64 atoradas y 0 marcadas como fallidas.
//
// Separarlas ademas ordena las prioridades. El derivado es lo unico que la galeria
// necesita para verse; el CRC solo sirve para armar el ZIP, y el ZIP no existe hasta
// que la entrega se libera. Haciendo TODOS los derivados primero, Bruno ve su galeria
// completa en la mitad del tiempo y los CRC se calculan despues, sin prisa.
const FILTRO_SIN_DERIVADO = `${FILTRO_BASE} AND (r2_key_web='' OR r2_key_web IS NULL)`;
const FILTRO_SIN_CRC = `${FILTRO_BASE} AND crc32 = -1`;
// R139b — Cuenta TRABAJOS pendientes, no archivos. Un archivo al que le faltan las dos
// cosas cuenta dos. Contando archivos, la cifra se quedaba congelada durante toda la
// primera mitad: con los derivados en marcha, cada archivo seguia necesitando su CRC y
// por lo tanto seguia contando. Bruno veia "64" sin moverse mientras el servidor
// preparaba veinte fotos, y la unica lectura posible era que estaba trabado otra vez.
async function contarPendientes(db, entregaId) {
  const filtroEnt = entregaId ? 'AND e_entrega_id=?' : '';
  const p = entregaId ? [entregaId] : [];
  const r = await queryOne(db,
    `SELECT (SELECT COUNT(*) FROM e_archivos WHERE ${FILTRO_SIN_DERIVADO} ${filtroEnt})
          + (SELECT COUNT(*) FROM e_archivos WHERE ${FILTRO_SIN_CRC} ${filtroEnt}) AS n`,
    entregaId ? [...p, ...p] : []);
  return (r && r.n) || 0;
}

// Un solo trabajo, el que toque. Devuelve si avanzo algo.
// El orden importa y no es arbitrario: primero lo que hace visible la galeria.
async function prepararUno(env, db, tope) {
  const { results: sinWeb } = await query(db,
    `SELECT * FROM e_archivos WHERE ${FILTRO_SIN_DERIVADO} ORDER BY fecha LIMIT ?`, [tope]);
  if (sinWeb && sinWeb.length) {
    let hechos = 0;
    for (const a of sinWeb) if (await generarDerivado(env, db, a)) hechos++;
    // Un derivado que falla NO se marca como fallido: generarDerivado ya dice que si
    // no sale, la galeria cae al original y solo va lenta. Marcarlo obligaria a usar
    // crc32=-2, que ademas traba el ZIP — un problema peor que el que resuelve.
    // Pero tampoco puede quedarse al frente de la fila tapando todo, asi que cuando
    // la vuelta no avanzo se sigue con los CRC, que son una cola independiente.
    if (hechos) return hechos;
  }
  // R139e — Las firmas van de UNA en una, aunque los derivados vayan de tres en tres.
  // No cuestan lo mismo: el derivado lo hace el binding de Images y el Worker casi
  // solo espera, mientras que la firma recorre los 9 MB dentro del propio Worker.
  // Medido el 24 ago 2026: con lote de 3, los derivados salian en Ok y las firmas
  // mataban el cron con "Exceeded CPU Limit" tres vueltas seguidas.
  const { results: sinCrc } = await query(db,
    `SELECT * FROM e_archivos WHERE ${FILTRO_SIN_CRC} ORDER BY fecha LIMIT 1`);
  let hechos = 0;
  for (const a of (sinCrc || [])) {
    if (await asegurarCrc(env, db, a)) hechos++;
    // Un archivo que no avanza no puede quedarse al frente de la fila para siempre:
    // se marca como intentado y se sigue. Paso con el video de 986 MB, que ademas no
    // necesitaba CRC.
    else await run(db, 'UPDATE e_archivos SET crc32=-2 WHERE id=? AND crc32 < 0', [a.id]);
  }
  return hechos;
}

// ── Preparacion en segundo plano ──────────────────────────────────────────────
// La galeria necesita, por cada foto, una copia reducida y su CRC. Hacerlo desde el
// portal obliga a Bruno a dejar la ventana abierta mirando una barra, y si la cierra
// se queda a medias. Esto lo hace solo, con un cron por minuto.
//
// Va de DOS en dos a proposito: cada una decodifica un JPEG de 10 MB, y pasarse
// revienta el limite de CPU del Worker. Dos por minuto son 120 por hora: una sesion
// de 50 fotos queda lista en media hora sin que nadie este presente.
export async function prepararPendientes(env, tope = 1) {
  const db = env.DB;

  // R136 — Va PRIMERO y siempre, aunque no haya nada que preparar. Un reemplazo en
  // vuelo es lo unico que tiene a un cliente viendo una version vieja a proposito:
  // conviene consumarlo en cuanto Stream termine, no cuando ademas haya derivados
  // pendientes. Es barato — una consulta indexada que casi siempre sale vacia.
  let reemplazos = { consumados: 0, esperando: 0 };
  try {
    reemplazos = await confirmarReemplazos(env, db);
  } catch (ex) {
    console.error('R136 confirmarReemplazos falló:', ex.message);
  }

  const hechos = await prepararUno(env, db, tope);
  return { hechos, pendientes: await contarPendientes(db, null), reemplazos };
}

// ── Reemplazo de version (R136) ───────────────────────────────────────────────
// Consuma los reemplazos cuya version nueva ya esta lista. Hasta que esto corre, el
// cliente sigue viendo la version vieja: el renglon nuevo esta filtrado del payload
// por reemplaza_a<>''.
//
// Un video no esta listo cuando termina de subirse, sino cuando Stream termina de
// CODIFICARLO, que puede tardar minutos. Cambiar antes deja al cliente con un
// reproductor muerto — el mismo error que ya se cometio una vez con la copia limpia
// al liberar, y por eso aqui se pregunta igual con streamListo().
//
// Una foto no pasa por Stream, asi que esta lista en cuanto se subio.
async function confirmarReemplazos(env, db, tope = 4) {
  const { results } = await query(db,
    `SELECT * FROM e_archivos WHERE reemplaza_a<>'' ORDER BY fecha LIMIT ?`, [tope]);
  if (!results || !results.length) return { consumados: 0, esperando: 0 };

  let consumados = 0, esperando = 0;
  for (const nuevo of results) {
    // Un video sin stream_uid es una subida que nunca llego a Stream. No se puede
    // consumar: dejaria al cliente sin video. Se queda esperando a que Bruno le de
    // "procesar" otra vez, o lo cancele.
    if (esVideo(nuevo.mime)) {
      if (!nuevo.stream_uid) { esperando++; continue; }
      if (!(await streamListo(env, nuevo.stream_uid))) { esperando++; continue; }
    } else {
      // Una foto no pasa por Stream, pero SI necesita su CRC antes de entrar: el ZIP
      // se arma con los CRC precalculados y se niega a salir si a alguna le falta
      // (409, "faltan N fotos por preparar"). Meter aqui una foto sin CRC le romperia
      // el "descargar todo" al cliente hasta que el cron la alcance.
      // crc32 -1 = todavia no se intenta; -2 = se intento y no se pudo.
      if (Number(nuevo.crc32) < 0) { esperando++; continue; }
    }

    const viejo = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [nuevo.reemplaza_a]);

    // El viejo ya no esta (lo borro alguien a mano, o se consumo dos veces). No es un
    // error: el nuevo simplemente pasa a ser el bueno.
    if (!viejo) {
      await run(db, `UPDATE e_archivos SET reemplaza_a='', estado='listo' WHERE id=?`, [nuevo.id]);
      consumados++;
      continue;
    }

    // El nuevo hereda el LUGAR del viejo, no solo su contenido: orden, portada y
    // destacado. Sin esto, reemplazar la foto de portada la mandaba al final de la
    // galeria y la entrega se quedaba sin portada.
    await run(db,
      `UPDATE e_archivos SET reemplaza_a='', estado='listo', orden=?, portada=?, destacado=?
       WHERE id=?`,
      [viejo.orden, viejo.portada, viejo.destacado, nuevo.id]);

    // PRIMERO el registro, DESPUES el material: si el borrado de R2/Stream falla a
    // medias, lo que queda huerfano son bytes (los caza `huerfanos`), no un renglon
    // apuntando a un archivo que ya no existe.
    await run(db, 'DELETE FROM e_archivos WHERE id=?', [viejo.id]);
    try {
      await borrarMediaDeEntrega(env, [viejo]);
    } catch (ex) {
      console.error('R136 no se pudo borrar la version vieja', viejo.id, ex.message);
    }

    await refrescarEntregable(db, nuevo.e_entregable_id);
    await evento(db, nuevo.e_entrega_id, 'reemplazo',
      `${viejo.nombre || 'archivo'} → ${nuevo.nombre || 'archivo'}`);
    consumados++;
  }
  return { consumados, esperando };
}

// ── Expiracion (F6) ───────────────────────────────────────────────────────────
// La corre el cron horario. Es lo que mantiene plano el costo de R2: sin esto el
// bucket crece para siempre.
//
// DOS RELOJES, y no hay que confundirlos:
//   fecha_expira            — dia 14. Le cierra la galeria al cliente. Es lo unico
//                             que el cliente ve y lo unico que se le promete.
//   fecha_expira + gracia   — dia 17. Recien aqui se tiran los bytes. NO se anuncia.
// La gracia existe para el caso de "no lo guarde": entre el 14 y el 17 se reabre con
// extender y no hay que volver a subir nada.
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
    // OJO: se borra por debeBorrarse(), NO por estaVencida(). Al cliente se le cerro
    // la galeria a los 14 dias —eso lo decide fecha_expira y no pasa por aqui—, pero
    // los bytes viven 3 dias mas. Es la ventana para reabrirle a quien no guardo el
    // material sin tener que volver a subir 1 GB. Ver DIAS_GRACIA en entregas-core.
    if (!debeBorrarse(e.fecha_expira, ahora)) continue;
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

// ── Sets de fotos (R138) ──────────────────────────────────────────────────────
// El primer entregable de fotos que tenga galeria encendida. Es el que manda: de
// ahi sale la portada. Se ordena igual que entregablesDe para que "primero"
// signifique lo mismo en todos lados.
async function primerSetConGaleria(db, entregaId) {
  return await queryOne(db,
    `SELECT * FROM e_entregables WHERE e_entrega_id=? AND tipo='fotos' AND galeria=1
     ORDER BY orden, rowid LIMIT 1`, [entregaId]);
}

// Deja la portada en una foto que de verdad se vea. Se llama al apagar la galeria
// de un set: si la portada vivia ahi, la entrega se quedaria con la cabecera en
// blanco. Si no queda ningun set con galeria no se inventa nada.
async function reasignarPortada(db, entregaId) {
  const actual = await queryOne(db,
    `SELECT a.* FROM e_archivos a JOIN e_entregables e ON e.id = a.e_entregable_id
     WHERE a.e_entrega_id=? AND a.portada=1 AND e.galeria=1 LIMIT 1`, [entregaId]);
  if (actual) return actual;
  const set = await primerSetConGaleria(db, entregaId);
  if (!set) return null;
  const nueva = await queryOne(db,
    `SELECT * FROM e_archivos WHERE e_entregable_id=? AND r2_key<>''
       AND mime NOT LIKE 'video/%' AND reemplaza_a=''
     ORDER BY orden, rowid LIMIT 1`, [set.id]);
  if (!nueva) return null;
  await batch(db, [
    { sql: 'UPDATE e_archivos SET portada=0 WHERE e_entrega_id=?', params: [entregaId] },
    { sql: 'UPDATE e_archivos SET portada=1, destacado=1 WHERE id=?', params: [nueva.id] }
  ]);
  return nueva;
}

// ── Payload publico (lo que ve el cliente) ────────────────────────────────────
// Regla dura: si la entrega NO esta liberada, este objeto no puede contener ninguna
// URL de descarga del material original. Es el gate de F4.
async function payloadPublico(db, env, entrega) {
  const cliente = await resolverCliente(db, entrega.e_cliente_id);
  const items = await entregablesDe(db, entrega.id);
  // reemplaza_a='' deja fuera las versiones EN VUELO (R136). Es el unico punto donde
  // hay que filtrarlas para el cliente: si un reemplazo a medio codificar se colara
  // aqui, el cliente veria las dos versiones a la vez, que es justo lo que se
  // queria evitar. El renglon viejo sigue saliendo hasta que el cambio se consuma.
  const { results: archivos } = await query(db,
    `SELECT * FROM e_archivos WHERE e_entrega_id=? AND reemplaza_a=''
     ORDER BY orden, rowid`, [entrega.id]);

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
  const fotosDe = a => a.r2_key && !esVideo(a.mime);
  const comoFoto = a => ({
    id: a.id, nombre: a.nombre,
    portada: !!a.portada,
    // La portada tambien va en el muestrario: seria raro que la foto elegida como
    // la mejor no apareciera entre las mejores.
    destacado: !!a.destacado || !!a.portada
  });

  // R138 — Las fotos se reparten por entregable, no en una sola lista. Un entregable
  // con galeria=1 se ve en cuadricula; con galeria=0 no se ve ninguna imagen y el set
  // solo se ofrece como descarga. Asi un cliente puede recibir sus fotos y ademas las
  // mismas con su logotipo sin verlas dobles.
  const reparto = repartirFotos(items, archivos, fotosDe);
  base.galerias = reparto.galerias.map(g => ({
    id: g.id, nombre: g.nombre, fotos: g.fotos.map(comoFoto)
  }));
  // De un set sin galeria el cliente no ve ninguna imagen, asi que no se le mandan:
  // solo cuantas son, para poder escribirlo en el boton de descarga.
  base.sets = reparto.sets.map(s => ({ id: s.id, nombre: s.nombre, cantidad: s.fotos.length }));
  // Se conserva `fotos` plano —solo lo que SI va en galeria— porque es lo que lee una
  // pagina que haya quedado en cache con la version anterior.
  base.fotos = base.galerias.flatMap(g => g.fotos);
  // Cuantas fotos ve el cliente antes del boton "ver todas". Si nadie eligio
  // destacadas, la pagina cae a las primeras de este numero.
  base.destacadas = DESTACADAS_VISIBLES;
  // Marca de version de las fotos. NO la usa el servidor para nada: existe para que
  // la URL cambie al liberar. Sin esto, la direccion de cada foto es identica antes
  // y despues de pagar, y el navegador —que la guardo en disco— sigue mostrando la
  // copia con mosaico que ya tenia sin volver a preguntar. El cliente paga y ve lo
  // mismo. Ver §11 del handoff.
  base.fotoVer = versionFotos(entrega, now());
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

    // R138 — Cada set de fotos lleva ademas su propio ZIP. Para un set sin galeria
    // este boton es la UNICA forma de bajarlo completo, porque sus fotos no se ven.
    // Se firma por entregable: la firma del ZIP general no sirve para bajar un set,
    // ni al reves.
    const zipDeSet = async it => {
      const suyas = (archivos || []).filter(a => a.e_entregable_id === it.id && fotosDe(a));
      if (!suyas.length) return null;
      const f = await firmar(env, 'zip:' + entrega.id + ':' + it.id, 900);
      return {
        url: `/api/e/zip?e=${entrega.id}&ent=${it.id}&f=${encodeURIComponent(f)}`,
        archivos: suyas.length,
        bytes: suyas.reduce((s, a) => s + (Number(a.bytes) || 0), 0)
      };
    };
    // Solo tiene sentido separar cuando hay mas de un set CON archivos: con uno solo,
    // el ZIP del set y el general serian el mismo archivo con dos botones. Se cuentan
    // los grupos ya armados y no los entregables, porque un entregable de fotos vacio
    // no produce ningun grupo y firmarlo seria trabajo tirado.
    if (base.galerias.length + base.sets.length > 1) {
      for (const g of base.galerias) { if (g.id) g.zip = await zipDeSet({ id: g.id }); }
      for (const s of base.sets) { s.zip = await zipDeSet({ id: s.id }); }
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

    // Andamio de calibracion: m = densidad, o = opacidad. Sirve para comparar variantes
    // en vivo sin redesplegar; cuando se decide, son dos constantes de una linea.
    //
    // EXIGEN LA LLAVE, y es importante. `m` era inofensivo —la fraccion tiene piso, asi
    // que no puede desaparecer la marca— pero `o` si: con o=0 la foto saldria limpia y
    // cualquiera con la liga tendria el material sin pagar. Un parametro que puede
    // apagar el candado no puede vivir en una URL publica.
    const calibra = !requireEntregas(request, env);
    const mCal = calibra ? Number(url.searchParams.get('m')) || 0 : 0;
    const oCal = calibra ? Number(url.searchParams.get('o')) || 0 : 0;

    // CACHE. Sin esto cada peticion vuelve a decodificar un JPEG de 10 MB, redimensionarlo
    // y dibujarle el mosaico. Una cuadricula dispara varias a la vez y el Worker revienta
    // su limite de recursos (error 1102 de Cloudflare) — pasa con fotos reales, no con
    // imagenes de prueba chicas.
    //
    // El ESTADO va en la llave: si no, al liberar se seguiria sirviendo la version con
    // marca que quedo cacheada, y el cliente pagaria para ver lo mismo.
    const cache = caches.default;
    // R141 — WebP cuando el navegador lo acepta. Mismo aspecto y 25-35% menos bytes
    // que el JPEG que se servia siempre. Se queda en WebP y no AVIF a proposito:
    // AVIF ahorraria mas, pero su codificacion es mucho mas cara y se paga en el
    // MISS, que es justo el camino que le toca al cliente cuando abre su liga.
    //
    // El formato va en la llave del cache. Sin eso, el primero en pedir decide por
    // todos: un navegador viejo se llevaria un WebP que no sabe pintar.
    const aceptaWebp = /image\/webp/i.test(request.headers.get('Accept') || '');
    const formato = aceptaWebp ? 'image/webp' : 'image/jpeg';
    const llaveCache = new Request(
      `${url.origin}/api/e/foto?a=${archivoId}&w=${ancho}&st=${limpia ? 'limpia' : 'marcada'}` +
      `&mv=${VERSION_MARCA}&fmt=${aceptaWebp ? 'webp' : 'jpeg'}`,
      { method: 'GET' });
    // Las variantes de calibracion no tocan el cache: ni lo leen —queremos ver la
    // variante, no lo que quedo guardado— ni lo escriben, que envenenaria la galeria
    // real con una marca de prueba.
    const usaCache = !mCal && !oCal;
    if (usaCache) {
      const cacheada = await cache.match(llaveCache);
      if (cacheada) return cacheada;
    }

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
          // fisico en el hero y en una miniatura.
          const w = fraccionMarca(url.searchParams.get('d'), mCal || ANCHO_MARCA);
          if (w >= 1) {   // no deberia pasar; si pasa, mejor fallar que servir limpio
            console.error('fraccion de marca invalida', w);
            return err('Marca de agua mal configurada', 503);
          }
          pipe = pipe.draw(marca.body, { repeat: true, opacity: oCal || OPACIDAD_MARCA, width: w });
        } else {
          // Sin marca de agua NO se sirve la foto: es preferible fallar visible a
          // entregar el material limpio por accidente.
          console.error('falta la marca de agua en R2:', LLAVE_MARCA);
          return err('Marca de agua no configurada', 503);
        }
      }
      // WebP 80 se ve como JPEG 82 y pesa bastante menos.
      const out = await pipe.output({ format: formato, quality: aceptaWebp ? 80 : 82 });
      const r = out.response();
      const h = new Headers(r.headers);
      // public para que el borde de Cloudflare la guarde: la URL trae un UUID
      // inadivinable, asi que la foto queda tan protegida como su propia liga.
      //
      // Los dos plazos son distintos a proposito. s-maxage es para el borde, que es
      // quien absorbe la carga y ya distingue marcada de limpia en su llave. max-age
      // es para el NAVEGADOR, que no distingue nada: guarda por URL, y la URL de una
      // foto era identica antes y despues de liberar. Con un dia de plazo, quien vio
      // la galeria sin pagar seguia viendo el mosaico despues de pagar. La defensa
      // principal es `fotoVer` en la URL —al liberar cambia y el navegador vuelve a
      // pedir—; estos 5 minutos son el respaldo por si algo la pide sin esa marca.
      h.set('Cache-Control', 'public, max-age=300, s-maxage=86400');
      // El tipo tiene que seguir al formato REAL. Estaba fijo en jpeg y con WebP
      // habria mandado bytes mal etiquetados. Y `Vary: Accept` avisa a la cache del
      // navegador y a cualquier intermediario de que esta URL responde distinto
      // segun lo que el cliente acepte — la del borde ya lo distingue por su llave.
      h.set('Content-Type', formato);
      h.set('Vary', 'Accept');
      const resp = new Response(r.body, { status: 200, headers: h });
      if (usaCache) ctx.waitUntil(cache.put(llaveCache, resp.clone()));
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
    // R138 — Con `ent` se baja un solo set de fotos; sin el, todas las de la entrega.
    const entregableId = url.searchParams.get('ent') || '';
    // Bruno tambien puede bajarlo, en cualquier estado y con su llave: es su
    // material y lo va a querer para respaldar. El cliente pasa por la firma.
    const esBruno = !requireEntregas(request, env);
    // La firma incluye el entregable: la del ZIP general no abre un set, ni al reves.
    const alcance = entregableId ? 'zip:' + entregaId + ':' + entregableId : 'zip:' + entregaId;
    if (!esBruno && !await verificarFirma(env, alcance, firma)) {
      return err('Enlace de descarga vencido. Vuelve a entrar a tu galería.', 403);
    }
    const e = await queryOne(db, 'SELECT * FROM e_entregas WHERE id=?', [entregaId]);
    if (!e) return err('Entrega no encontrada', 404);
    if (!esBruno && (e.estado !== 'liberada' || estaVencida(e.fecha_expira, now()))) {
      return err('Este material ya no está disponible.', 403);
    }
    const { results } = entregableId
      ? await query(db,
        `SELECT * FROM e_archivos WHERE e_entrega_id=? AND e_entregable_id=? AND r2_key<>''
           AND mime NOT LIKE 'video/%' AND reemplaza_a=''
         ORDER BY orden, rowid`, [entregaId, entregableId])
      : await query(db,
        `SELECT * FROM e_archivos WHERE e_entrega_id=? AND r2_key<>'' AND mime NOT LIKE 'video/%'
           AND reemplaza_a=''
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
    // Antes de pisarla, se guarda la que estaba. Cambiar este PNG afecta a TODAS las
    // entregas al instante, y no habia forma de volver atras: el bucket no se puede
    // leer con wrangler (su OAuth no incluye R2), asi que la version anterior se
    // perdia para siempre en cuanto se subia una nueva.
    const previa = await env.ENTREGAS_ORIGINALES.get(LLAVE_MARCA);
    if (previa) {
      await env.ENTREGAS_ORIGINALES.put(LLAVE_MARCA_PREVIA, previa.body,
        { httpMetadata: { contentType: 'image/png' } });
    }
    await env.ENTREGAS_ORIGINALES.put(LLAVE_MARCA, png.stream(),
      { httpMetadata: { contentType: 'image/png' } });
    const check = await env.ENTREGAS_ORIGINALES.head(LLAVE_MARCA);
    return ok({ ok: true, llave: LLAVE_MARCA, bytes: check ? check.size : 0,
                respaldo: !!previa });
  }

  // Crea un perfil de marca de agua en Stream. Existe para no tener que sacar el
  // CF_MEDIA_TOKEN de Cloudflare: el Worker ya lo tiene y es el unico que deberia
  // tocarlo (se pego dos veces en el chat, y esa es deuda que no conviene repetir).
  //
  // Stream NO sabe repetir un mosaico: coloca UNA imagen y ya. Por eso el PNG que se
  // sube aqui trae el patron ya dibujado y va con scale=1 y position=center, para que
  // cubra el cuadro entero. Y por eso hacen falta dos perfiles: Stream escala sin
  // deformar, asi que un PNG horizontal sobre un video vertical deja una franja
  // marcada y el resto limpio.
  if (action === 'crearWatermark') {
    const form = await request.formData();
    const png = form.get('archivo');
    const nombre = String(form.get('nombre') || 'IAV');
    if (!png) return err('Falta el archivo');
    const opacidad = Number(form.get('opacidad')) || OPACIDAD_MARCA;

    const fd = new FormData();
    fd.append('file', png, nombre + '.png');
    fd.append('name', nombre);
    fd.append('opacity', String(opacidad));
    fd.append('padding', '0');
    fd.append('scale', '1');
    fd.append('position', 'center');

    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/watermarks`,
      { method: 'POST', headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` }, body: fd });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.success) {
      const detalle = j && j.errors ? JSON.stringify(j.errors) : 'HTTP ' + r.status;
      return err('Stream rechazó la marca: ' + detalle, 502);
    }
    // El uid es lo que hay que poner en wrangler.toml.
    return ok({ ok: true, uid: j.result.uid, nombre: j.result.name,
                opacidad: j.result.opacity, escala: j.result.scale });
  }

  // Borra UN video de Stream por su uid. Hace falta porque `huerfanos` solo reconoce
  // los que este sistema nombro (`entrega-*`, `limpio-*`): un video subido por otra
  // via —o el uid que queda atras al reprocesar uno con un perfil nuevo— no lo
  // detecta, y se queda pagandose en silencio para siempre.
  //
  // Salvaguarda: si el uid todavia esta referenciado en la base, no se borra. Sin eso
  // un dedazo deja al cliente con un reproductor muerto y sin forma de recuperarlo.
  if (action === 'borrarStream') {
    const { uid } = await request.json();
    if (!uid) return err('Falta el uid');
    const enUso = await queryOne(db,
      'SELECT id FROM e_archivos WHERE stream_uid=? OR stream_uid_limpio=?', [uid, uid]);
    if (enUso) return err('Ese video está en uso por el archivo ' + enUso.id, 409);
    const ok_ = await borrarDeStream(env, uid);
    return ok({ ok: true, borrado: ok_, uid });
  }

  // Lista los perfiles de marca de agua que existen en Stream, para saber cual esta
  // en uso y cual quedo huerfano de una calibracion anterior.
  if (action === 'watermarks') {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/watermarks`,
      { headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` } });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.success) return err('No se pudieron leer los perfiles', 502);
    const enUso = [env.STREAM_WATERMARK_UID, env.STREAM_WATERMARK_UID_VERTICAL];
    return ok({ ok: true, perfiles: (j.result || []).map(w => ({
      uid: w.uid, nombre: w.name, opacidad: w.opacity, escala: w.scale,
      posicion: w.position, enUso: enUso.includes(w.uid)
    })) });
  }

  // Sirve el PNG de la marca tal cual esta en R2. Es la unica forma de verlo o
  // respaldarlo: el bucket no se puede leer con wrangler. `?previa=1` devuelve la
  // version anterior, que es como se revierte un cambio que no gusto.
  if (action === 'marca') {
    const obj = await env.ENTREGAS_ORIGINALES.get(
      url.searchParams.get('previa') ? LLAVE_MARCA_PREVIA : LLAVE_MARCA);
    if (!obj) return err('No hay marca guardada', 404);
    return new Response(obj.body, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' }
    });
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

    // R136 — Misma validacion que en videoIniciar. Una foto no pasa por Stream, pero
    // igual espera a tener su CRC antes de entrar (lo exige el ZIP), asi que tambien
    // vive un rato como reemplazo en vuelo.
    const sustituye = String(form.get('reemplazaA') || '');
    if (sustituye) {
      const viejo = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [sustituye]);
      if (!viejo) return err('El archivo que quieres reemplazar ya no existe', 404);
      if (viejo.e_entregable_id !== entregableId) {
        return err('Ese archivo es de otro entregable', 400);
      }
      const enVuelo = await queryOne(db,
        `SELECT id FROM e_archivos WHERE reemplaza_a=?`, [sustituye]);
      if (enVuelo) return err('Ya hay un reemplazo en curso para ese archivo', 409);
    }

    const archivoId = uuid();
    const key = llaveR2(ent.e_entrega_id, archivoId, nombre);
    await guardarEnR2(env, key, original.stream(), original.type);

    const c = await queryOne(db,
      'SELECT COUNT(*) AS n FROM e_archivos WHERE e_entregable_id=?', [entregableId]);
    // Un reemplazo NO nace portada aunque sea el primero de la cuenta: hereda el
    // lugar del archivo al que sustituye, y eso lo decide confirmarReemplazos().
    const esPrimera = !sustituye && (c && c.n) === 0;
    await run(db,
      // La primera foto nace como portada —y por lo tanto destacada— para que una
      // entrega recien subida ya tenga cabecera sin que nadie elija nada. Desde r133
      // son dos columnas: marcar solo `destacado` la dejaria sin portada.
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, orden, portada, destacado, estado, reemplaza_a, fecha)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [archivoId, entregableId, ent.e_entrega_id, nombre, original.size || 0, original.type || '',
       key, (c && c.n) || 0, esPrimera ? 1 : 0, esPrimera ? 1 : 0,
       sustituye ? 'reemplazando' : 'listo', sustituye, now()]);
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
      // Igual que en subirFoto: la primera nace como portada y destacada. Un video
      // nunca puede ser ninguna de las dos.
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, orden, portada, destacado, estado, fecha)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'listo', ?)`,
      [archivoId, entregableId, ent.e_entrega_id, nombre || 'archivo',
       (guardado && guardado.size) || bytes, mime, key,
       (c && c.n) || 0,
       (c && c.n) === 0 && !esVideoFlag ? 1 : 0,
       (c && c.n) === 0 && !esVideoFlag ? 1 : 0, now()]);
    await refrescarEntregable(db, entregableId);
    // Igual que en subirFoto: la copia reducida NO se genera aqui. Ver el comentario
    // de alla — hacerlo durante la importacion tumba el isolate y la siguiente falla.
    return ok({ ok: true, archivoId, bytes: (guardado && guardado.size) || bytes, mime });
  }

  // Video: subida multiparte a R2. Cada trozo cabe en el limite del Worker.
  if (action === 'videoIniciar') {
    const { entregableId, nombre, mime, bytes, reemplazaA } = await request.json();
    const ent = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
    if (!ent) return err('Entregable no encontrado', 404);
    if (!esVideo(mime)) return err('Ese archivo no es un video', 400);

    // R136 — Si viene reemplazaA, esta subida sustituye a un archivo que ya existe.
    // Se valida que sea del MISMO entregable: reemplazar el video cinematico con el
    // de "como llegar" no es un reemplazo, es mover material de renglon.
    const sustituye = String(reemplazaA || '');
    if (sustituye) {
      const viejo = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [sustituye]);
      if (!viejo) return err('El archivo que quieres reemplazar ya no existe', 404);
      if (viejo.e_entregable_id !== entregableId) {
        return err('Ese archivo es de otro entregable', 400);
      }
      // Dos reemplazos encima del mismo archivo dejarian dos renglones peleando por
      // consumarse y uno borraria al otro. Se corta aqui.
      const enVuelo = await queryOne(db,
        `SELECT id FROM e_archivos WHERE reemplaza_a=?`, [sustituye]);
      if (enVuelo) return err('Ya hay un reemplazo en curso para ese archivo', 409);
    }

    const archivoId = uuid();
    const key = llaveR2(ent.e_entrega_id, archivoId, nombre || 'video.mp4');
    const mp = await env.ENTREGAS_ORIGINALES.createMultipartUpload(key, {
      httpMetadata: { contentType: mime || 'video/mp4' }
    });
    await run(db,
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, orden, estado, reemplaza_a, fecha)
       VALUES (?,?,?,?,?,?,?,0,'subiendo',?,?)`,
      [archivoId, entregableId, ent.e_entrega_id, nombre || 'video.mp4', bytes || 0,
       mime || 'video/mp4', key, sustituye, now()]);
    return ok({ ok: true, archivoId, key, uploadId: mp.uploadId, reemplaza: !!sustituye });
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
      // Un reemplazo NO pasa a 'listo' aqui: queda en 'reemplazando' hasta que Stream
      // termine de codificar y confirmarReemplazos() haga el cambio. Mientras tanto el
      // cliente sigue viendo la version vieja, que es justo el punto.
      `UPDATE e_archivos SET estado=CASE WHEN reemplaza_a<>'' THEN 'reemplazando' ELSE 'listo' END,
              stream_uid=?, ancho=?, alto=? WHERE id=?`,
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
  // Desde r133 la portada es exclusiva y ademas entra al muestrario de destacadas.
  if (action === 'portada') {
    const { archivoId } = await request.json();
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a) return err('Archivo no encontrado', 404);
    if (esVideo(a.mime)) return err('La portada tiene que ser una foto', 400);
    // R138 — La portada sale del PRIMER set con galeria. Una foto de un set sin
    // galeria no se muestra en ningun lado, asi que de portada dejaria la cabecera
    // en blanco; y con dos galerias la regla evita tener que decidir cada vez.
    const suEnt = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?',
      [a.e_entregable_id]);
    const primero = await primerSetConGaleria(db, a.e_entrega_id);
    if (primero && (!suEnt || suEnt.id !== primero.id)) {
      return err('La portada tiene que salir de ' + primero.nombre + '.', 400);
    }
    await batch(db, [
      { sql: 'UPDATE e_archivos SET portada=0 WHERE e_entrega_id=?', params: [a.e_entrega_id] },
      { sql: 'UPDATE e_archivos SET portada=1, destacado=1 WHERE id=?', params: [archivoId] }
    ]);
    return ok({ ok: true });
  }

  // Cuales fotos forman el muestrario que el cliente ve antes del boton "ver todas".
  // Es un interruptor: la misma llamada pone y quita. La portada no se puede quitar
  // de aqui —es la cabecera de la galeria—; para sacarla, primero se cambia de
  // portada. Se dice explicito en vez de ignorar el clic en silencio.
  if (action === 'destacar') {
    const { archivoId, valor } = await request.json();
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a) return err('Archivo no encontrado', 404);
    if (esVideo(a.mime)) return err('Solo las fotos se pueden destacar', 400);
    const quiere = valor === undefined ? !a.destacado : !!valor;
    if (!quiere && a.portada) {
      return err('Es la portada. Elige otra portada y luego quítala de las destacadas.', 400);
    }
    await run(db, 'UPDATE e_archivos SET destacado=? WHERE id=?', [quiere ? 1 : 0, archivoId]);
    // El portal pinta el contador con esto, para no tener que recargar la entrega
    // entera en cada clic.
    const c = await queryOne(db,
      'SELECT COUNT(*) AS n FROM e_archivos WHERE e_entrega_id=? AND destacado=1',
      [a.e_entrega_id]);
    return ok({ ok: true, destacado: quiere, total: (c && c.n) || 0, meta: DESTACADAS_VISIBLES });
  }

  // R136 — Tira un reemplazo a medias y deja la version vieja intacta. Es la salida
  // cuando la v2 salio mal, o cuando Stream nunca la codifico. Borra SOLO el renglon
  // nuevo: el viejo nunca se toco, asi que el cliente no se entera de nada.
  if (action === 'cancelarReemplazo') {
    const { archivoId } = await request.json();
    const a = await queryOne(db, 'SELECT * FROM e_archivos WHERE id=?', [archivoId]);
    if (!a) return err('Archivo no encontrado', 404);
    if (!a.reemplaza_a) return err('Ese archivo no es un reemplazo en curso', 400);
    await run(db, 'DELETE FROM e_archivos WHERE id=?', [archivoId]);
    await borrarMediaDeEntrega(env, [a]);
    await refrescarEntregable(db, a.e_entregable_id);
    await evento(db, a.e_entrega_id, 'reemplazo', `Cancelado: ${a.nombre || 'archivo'}`);
    return ok({ ok: true });
  }

  // R136 — Fuerza la revision de los reemplazos en vuelo sin esperar al cron. Lo
  // llama el portal despues de subir, para que el cambio se sienta inmediato en vez
  // de tardar hasta dos minutos.
  if (action === 'revisarReemplazos') {
    const r = await confirmarReemplazos(env, db, 8);
    return ok({ ok: true, ...r });
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
    // TRES consultas, no cuatro por entrega. Antes este bloque llamaba a
    // resolverCliente + entregablesDe + folioDeEntrega + saldoDeEntrega DENTRO del
    // for, en serie: con 100 entregas eran ~400 viajes a D1 encadenados, y ademas
    // folioDeEntrega y saldoDeEntrega pedian LA MISMA fila de contratos por separado.
    // Con el JOIN el listado no se degrada al crecer la operacion.
    const { results } = await query(db,
      `SELECT e.*, c.folio AS c_folio, c.saldo_pendiente AS c_saldo
       FROM e_entregas e
       LEFT JOIN contratos c ON c.token = e.contrato_token
       ORDER BY e.fecha_creacion DESC`);
    const lista = results || [];

    // Clientes de un jalon. El LEFT JOIN trae de paso la ficha del admin, que es la
    // que manda cuando la entrega esta ligada (no se copia nada: se lee en vivo).
    // Se pide c.id explicitamente para distinguir "cliente borrado" (sin fila) de
    // "cliente con campos vacios" — datosCliente() decide distinto en cada caso.
    const { results: clientesRows } = await query(db,
      `SELECT ec.id, ec.cliente_id, ec.nombre, ec.telefono, ec.correo,
              c.id AS a_id, c.nombre AS a_nombre, c.telefono AS a_telefono, c.correo AS a_correo
       FROM e_clientes ec LEFT JOIN clientes c ON c.id = ec.cliente_id`);
    const porCliente = new Map();
    for (const r of (clientesRows || [])) {
      const admin = r.a_id
        ? { nombre: r.a_nombre, telefono: r.a_telefono, correo: r.a_correo }
        : null;
      porCliente.set(r.id, datosCliente(r, admin));
    }

    // Entregables de todas las entregas en una sola pasada, agrupados en memoria.
    const { results: itemsRows } = await query(db,
      `SELECT eb.*, (SELECT COUNT(*) FROM e_archivos a WHERE a.e_entregable_id = eb.id) AS num_archivos
       FROM e_entregables eb ORDER BY eb.e_entrega_id, eb.orden, eb.rowid`);
    const porEntrega = new Map();
    for (const r of (itemsRows || [])) {
      if (!porEntrega.has(r.e_entrega_id)) porEntrega.set(r.e_entrega_id, []);
      porEntrega.get(r.e_entrega_id).push(r);
    }

    const salida = [];
    for (const e of lista) {
      const cliente = porCliente.get(e.e_cliente_id) || { nombre: '' };
      const items = porEntrega.get(e.id) || [];
      const folio = e.c_folio || '';
      const saldo = e.contrato_token ? e.c_saldo : null;
      salida.push({
        id: e.id, codigo: e.codigo, titulo: e.titulo, direccion: e.direccion,
        estado: e.estado, grupo: grupoDeEntrega(e.estado),
        cliente: cliente.nombre, folio,
        fechaSesion: e.fecha_sesion, fechaCreacion: e.fecha_creacion,
        fechaPublicada: e.fecha_publicada, fechaLiberada: e.fecha_liberada,
        fechaExpira: e.fecha_expira,
        diasRestantes: diasRestantes(e.fecha_expira, now()),
        // Dias que le quedan al MATERIAL, no al acceso del cliente. Mientras esto
        // sea >= 0 la entrega se rescata con "extender" y no hay que volver a subir
        // nada. Es la unica pista de que existe la gracia: al cliente no se le dice.
        diasParaBorrado: diasParaBorrado(e.fecha_expira, now()),
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
      // Para el contador del portal ("3 de 6"). Va del servidor para que el numero
      // no quede escrito en dos lados y se separen.
      destacadasVisibles: DESTACADAS_VISIBLES,
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
    // R138 — El PRIMER entregable de fotos nace con galeria; los siguientes no. El
    // caso normal de un segundo set es una variante del primero (las mismas fotos con
    // el logotipo del cliente), y ahi mostrarlas seria verlas dobles. Cuando el
    // segundo set si es material distinto —staging virtual— se prende con un clic.
    let galeria = 1;
    if (tipo === 'fotos') {
      const yaHay = await queryOne(db,
        `SELECT COUNT(*) AS n FROM e_entregables WHERE e_entrega_id=? AND tipo='fotos'`,
        [entregaId]);
      if ((yaHay && yaHay.n) > 0) galeria = 0;
    }
    await run(db,
      `INSERT INTO e_entregables (id, e_entrega_id, tipo, nombre, orden, completo, valor, galeria)
       VALUES (?,?,?,?,?,0,'',?)`, [uuid(), entregaId, tipo, nombre, (c && c.n) || 0, galeria]);
    return ok({ ok: true });
  }

  // R138 — Prender o apagar la galeria de un set de fotos.
  if (action === 'galeriaEntregable') {
    const { entregableId, valor } = await request.json();
    const e = await queryOne(db, 'SELECT * FROM e_entregables WHERE id=?', [entregableId]);
    if (!e) return err('Entregable no encontrado', 404);
    if (e.tipo !== 'fotos') return err('Solo los entregables de fotos tienen galería', 400);
    const quiere = valor === undefined ? !e.galeria : !!valor;
    // La portada sale SIEMPRE del primer set con galeria. Si se apaga el set que la
    // tenia, esa foto dejaria de verse y la entrega se quedaria sin cabecera: la
    // portada se reasigna a la primera foto del set con galeria que quede.
    await run(db, 'UPDATE e_entregables SET galeria=? WHERE id=?',
      [quiere ? 1 : 0, entregableId]);
    if (!quiere) await reasignarPortada(db, e.e_entrega_id);
    return ok({ ok: true, galeria: quiere });
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
    // R139 — Un solo trabajo por peticion, y los derivados antes que los CRC, igual
    // que el cron. Antes cada peticion hacia los dos trabajos del mismo archivo: el
    // doble de CPU de golpe, que es lo que tumbaba al cron. Aqui no llegaba a matarlo
    // porque el lote es de uno, pero si producia los 503 pasajeros que el bucle del
    // portal tiene que aguantar. Ademas, con los derivados primero la galeria se ve
    // completa a media preparacion en vez de al final.
    let hechos = 0;
    const sinWeb = await query(db,
      `SELECT * FROM e_archivos WHERE ${FILTRO_SIN_DERIVADO}
       ${entregaId ? 'AND e_entrega_id=?' : ''} ORDER BY fecha LIMIT ?`,
      entregaId ? [entregaId, n] : [n]);
    if (sinWeb.results && sinWeb.results.length) {
      for (const a of sinWeb.results) if (await generarDerivado(env, db, a)) hechos++;
    }
    // Igual que el cron: si los derivados no avanzaron, no se traba la fila — se
    // siguen con los CRC, que son otra cola.
    if (!hechos) {
      const sinCrc = await query(db,
        `SELECT * FROM e_archivos WHERE ${FILTRO_SIN_CRC}
         ${entregaId ? 'AND e_entrega_id=?' : ''} ORDER BY fecha LIMIT ?`,
        entregaId ? [entregaId, n] : [n]);
      for (const a of (sinCrc.results || [])) {
        if (await asegurarCrc(env, db, a)) hechos++;
        else await run(db, 'UPDATE e_archivos SET crc32=-2 WHERE id=? AND crc32 < 0', [a.id]);
      }
    }
    return ok({ ok: true, hechos, pendientes: await contarPendientes(db, entregaId || null) });
  }

  // ---- Huerfanos: material sin registro en la base ----
  // Existe porque hasta el 12 ago 2026 borrar una entrega dejaba sus archivos en R2
  // y en Stream. Sirve tambien para cualquier resto que deje un fallo a medias: un
  // video que se subio y nunca se completo, una copia de Stream que se pidio y
  // fallo. Todo eso se sigue pagando en silencio.
  //
  // Las llaves de sistema (la marca de agua) NUNCA se tocan.
  if (action === 'huerfanos') {
    const borrar = url.searchParams.get('borrar') === '1';
    const vivas = new Set();
    const { results: archivos } = await query(db, 'SELECT * FROM e_archivos');
    const uids = new Set();
    for (const a of (archivos || [])) {
      if (a.r2_key) vivas.add(a.r2_key);
      if (a.r2_key_web) vivas.add(a.r2_key_web);
      if (a.stream_uid) uids.add(a.stream_uid);
      if (a.stream_uid_limpio) uids.add(a.stream_uid_limpio);
    }

    const r2 = [];
    let cursor;
    do {
      const l = await env.ENTREGAS_ORIGINALES.list({ limit: 1000, cursor });
      for (const o of l.objects) {
        if (o.key.startsWith('sistema/')) continue;   // la marca de agua se queda
        if (!vivas.has(o.key)) r2.push({ key: o.key, bytes: o.size });
      }
      cursor = l.truncated ? l.cursor : null;
    } while (cursor);

    const stream = [];
    try {
      const rs = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream`,
        { headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` } });
      const js = await rs.json();
      for (const v of ((js && js.result) || [])) {
        // Solo se consideran los que este sistema creo. Los videos de R123 y
        // cualquier otro que viva en la cuenta no son asunto nuestro.
        const nombre = (v.meta && v.meta.name) || '';
        if (!/^(entrega|limpio)-/.test(nombre)) continue;
        if (!uids.has(v.uid)) stream.push({ uid: v.uid, nombre });
      }
    } catch (ex) { console.error('huerfanos stream', ex.message); }

    let borrados = { r2: 0, stream: 0, fallos: 0 };
    if (borrar) {
      for (const o of r2) { (await borrarDeR2(env, o.key)) ? borrados.r2++ : borrados.fallos++; }
      for (const v of stream) { (await borrarDeStream(env, v.uid)) ? borrados.stream++ : borrados.fallos++; }
    }
    return ok({ ok: true, borrar,
      r2: { n: r2.length, mb: Math.round(r2.reduce((s, o) => s + o.bytes, 0) / 1048576), lista: r2.slice(0, 60) },
      stream: { n: stream.length, lista: stream.slice(0, 60) },
      borrados });
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
