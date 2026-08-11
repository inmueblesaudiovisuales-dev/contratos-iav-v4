// ZIP armado al vuelo, SIN comprimir, para bajar todas las fotos de una entrega
// en un solo archivo.
//
// POR QUE SIN COMPRIMIR: los JPEG ya vienen comprimidos. Volver a comprimirlos
// gasta muchisimo procesador y no ahorra practicamente nada — y el procesador es
// justo el recurso que revienta en un Worker. Sin comprimir, el trabajo se reduce
// a copiar bytes y escribir cabeceras.
//
// POR QUE EN STREAMING: 476 MB no caben en la memoria de un Worker. Los bytes se
// leen de R2 y se escriben a la respuesta conforme pasan; nunca esta el archivo
// entero en memoria.
//
// El problema de armarlo en streaming es que el formato ZIP quiere el CRC y el
// tamano de cada archivo ANTES de los datos, y en streaming todavia no se saben.
// Para eso existe el "data descriptor": se marca el archivo con el bit 3 y los
// tres valores se escriben DESPUES de los datos. Es el mecanismo estandar y
// cualquier descompresor moderno lo entiende.

// ── CRC32 ─────────────────────────────────────────────────────────────────────
// Obligatorio: sin CRC correcto, macOS y Windows declaran el ZIP corrupto.
//
// Va por 4 bytes a la vez (tablas encadenadas) en vez de uno por uno. No es
// microoptimizacion gratuita: la version byte a byte reventaba el limite de CPU
// del Worker, y aunque ya no se calcula durante la descarga, sigue costando 10 MB
// por foto al preparar la galeria.
let TABLAS = null;
function tablas() {
  if (TABLAS) return TABLAS;
  const t = [];
  for (let n = 0; n < 4; n++) t.push(new Uint32Array(256));
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[0][i] = c >>> 0;
  }
  for (let i = 0; i < 256; i++) {
    for (let n = 1; n < 4; n++) {
      t[n][i] = ((t[n - 1][i] >>> 8) ^ t[0][t[n - 1][i] & 0xFF]) >>> 0;
    }
  }
  TABLAS = t;
  return TABLAS;
}

export function crc32(bytes, previo = 0) {
  const [t0, t1, t2, t3] = tablas();
  let c = (previo ^ 0xFFFFFFFF) >>> 0;
  let i = 0;
  const n = bytes.length, tope = n - 3;
  while (i < tope) {
    c = (c ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24))) >>> 0;
    c = (t3[c & 0xFF] ^ t2[(c >>> 8) & 0xFF] ^ t1[(c >>> 16) & 0xFF] ^ t0[c >>> 24]) >>> 0;
    i += 4;
  }
  for (; i < n; i++) c = (t0[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Lee un stream completo solo para sacarle el CRC. Se usa UNA vez por archivo, al
// preparar la galeria — nunca durante una descarga.
export async function crcDeStream(stream) {
  const lector = stream.getReader();
  let c = 0, bytes = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    c = crc32(value, c);
    bytes += value.length;
  }
  return { crc: c, bytes };
}

// ── Estructura ────────────────────────────────────────────────────────────────
const LOCAL = 30;        // cabecera local, sin contar el nombre
const CENTRAL = 46;      // entrada del indice, sin contar el nombre
const FIN = 22;          // cierre del indice
// bit 11 = nombres en UTF-8, para que los acentos no salgan rotos en Windows.
// El bit 3 (tamanos al final) ya NO se usa: como el CRC se conoce de antemano, la
// cabecera va completa y no hace falta el bloque de cierre por archivo. Eso es lo
// que permite copiar los bytes sin mirarlos.
const BANDERAS = 0x0800;

export function nombreZip(nombre, usados) {
  // Dentro de un ZIP, dos archivos con el mismo nombre hacen que uno se pierda al
  // extraer. Pasa facil: dos carpetas distintas con "DSC_0001.jpg".
  let n = String(nombre || 'archivo')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180) || 'archivo';
  if (!usados) return n;
  if (!usados.has(n)) { usados.add(n); return n; }
  const p = n.lastIndexOf('.');
  const base = p > 0 ? n.slice(0, p) : n;
  const ext = p > 0 ? n.slice(p) : '';
  for (let i = 2; i < 10000; i++) {
    const cand = `${base} (${i})${ext}`;
    if (!usados.has(cand)) { usados.add(cand); return cand; }
  }
  usados.add(n);
  return n;
}

// El tamano exacto se puede calcular de antemano porque no hay compresion: cada
// archivo ocupa lo que ocupa. Eso es lo que permite anunciar Content-Length y que
// la barra del navegador avance de verdad en vez de girar sin decir nada.
export function tamanoZip(entradas) {
  let total = FIN;
  for (const e of (entradas || [])) {
    const n = new TextEncoder().encode(e.nombre).length;
    total += LOCAL + n + Number(e.bytes || 0) + CENTRAL + n;
  }
  return total;
}

// Limite del formato clasico. Arriba de esto hace falta ZIP64, que es otro
// formato; mejor decirlo claro que entregar un archivo roto.
export const TOPE_ZIP = 4 * 1024 * 1024 * 1024 - 1;

export function cabeEnZip(entradas) {
  if (tamanoZip(entradas) > TOPE_ZIP) return false;
  return (entradas || []).every(e => Number(e.bytes || 0) <= TOPE_ZIP);
}

function u32(v) {
  return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
}
function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }

// Fecha en formato DOS. Se pasa desde afuera para que los tests sean deterministas.
export function fechaDos(d) {
  const f = d || new Date(2026, 0, 1, 12, 0, 0);
  const hora = (f.getHours() << 11) | (f.getMinutes() << 5) | (Math.floor(f.getSeconds() / 2));
  const fecha = ((f.getFullYear() - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate();
  return { hora, fecha };
}

export function cabeceraLocal(nombreBytes, crc, bytes, dos) {
  return new Uint8Array([
    ...u32(0x04034b50), ...u16(20), ...u16(BANDERAS), ...u16(0),
    ...u16(dos.hora), ...u16(dos.fecha),
    ...u32(crc), ...u32(bytes), ...u32(bytes),
    ...u16(nombreBytes.length), ...u16(0),
    ...nombreBytes
  ]);
}

export function entradaCentral(nombreBytes, crc, bytes, offset, dos) {
  return new Uint8Array([
    ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(BANDERAS), ...u16(0),
    ...u16(dos.hora), ...u16(dos.fecha),
    ...u32(crc), ...u32(bytes), ...u32(bytes),
    ...u16(nombreBytes.length), ...u16(0), ...u16(0),
    ...u16(0), ...u16(0), ...u32(0),
    ...u32(offset),
    ...nombreBytes
  ]);
}

export function cierre(n, tamCentral, offCentral) {
  return new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n),
    ...u32(tamCentral), ...u32(offCentral), ...u16(0)
  ]);
}

// ── El stream ─────────────────────────────────────────────────────────────────
// `abrir(entrada)` devuelve un ReadableStream con los bytes del archivo. Se pasa
// como funcion para que este modulo no sepa nada de R2 y se pueda probar solo.
//
// Cada entrada TRAE su crc y sus bytes ya calculados. Gracias a eso los datos se
// pasan con pipeTo, que copia dentro del runtime sin que JavaScript vea un solo
// byte. Leerlos aqui es exactamente lo que reventaba el limite de CPU.
// `total` es el tamano exacto (tamanoZip). Cuando se pasa y estamos en Workers se
// usa FixedLengthStream, que ademas de mover los bytes sin pasarlos por JavaScript
// hace que la respuesta lleve Content-Length — o sea, barra de progreso de verdad.
// Un TransformStream normal copia byte por byte en JS: medido en produccion, el
// ZIP moria por CPU a los 69 MB de 476.
export function armarZip(entradas, abrir, fecha, total) {
  const dos = fechaDos(fecha);
  const { readable, writable } =
    (total && typeof FixedLengthStream !== 'undefined') ? new FixedLengthStream(total)
    : (typeof IdentityTransformStream !== 'undefined') ? new IdentityTransformStream()
    : new TransformStream();

  // Se escribe tomando el writer solo para las cabeceras y soltandolo para que el
  // stream de R2 se conecte directo al destino.
  const escribir = async trozo => {
    const w = writable.getWriter();
    try { await w.write(trozo); } finally { w.releaseLock(); }
  };

  (async () => {
    try {
      const central = [];
      let offset = 0;

      for (const e of entradas) {
        const nb = new TextEncoder().encode(e.nombre);
        const bytes = Number(e.bytes) || 0;
        const cab = cabeceraLocal(nb, e.crc >>> 0, bytes, dos);
        await escribir(cab);
        central.push(entradaCentral(nb, e.crc >>> 0, bytes, offset, dos));
        offset += cab.length + bytes;

        const cuerpo = await abrir(e);
        if (!cuerpo) throw new Error('no se pudo leer ' + e.nombre);
        // pipeTo copia dentro del runtime. Leer aqui con getReader() es
        // exactamente lo que reventaba el limite de CPU.
        await cuerpo.pipeTo(writable, { preventClose: true });
      }

      const offCentral = offset;
      let tamCentral = 0;
      for (const c of central) { await escribir(c); tamCentral += c.length; }
      await escribir(cierre(central.length, tamCentral, offCentral));
      const w = writable.getWriter();
      await w.close();
    } catch (ex) {
      console.error('armarZip', ex && ex.message);
      // Abortar en vez de cerrar: un ZIP truncado que se cierra "bien" se ve
      // valido y falla al extraer. Abortado, el navegador marca la descarga como
      // fallida y el cliente sabe que tiene que reintentar.
      try { await writable.abort(ex); } catch (e2) {}
    }
  })();

  return readable;
}
