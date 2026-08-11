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
let TABLA = null;
function tabla() {
  if (TABLA) return TABLA;
  TABLA = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    TABLA[i] = c >>> 0;
  }
  return TABLA;
}

export function crc32(bytes, previo = 0) {
  const t = tabla();
  let c = (previo ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = (t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Estructura ────────────────────────────────────────────────────────────────
const LOCAL = 30;        // cabecera local, sin contar el nombre
const DESCRIPTOR = 16;   // el bloque que va despues de los datos
const CENTRAL = 46;      // entrada del indice, sin contar el nombre
const FIN = 22;          // cierre del indice
// bit 3 = tamanos al final (streaming); bit 11 = nombres en UTF-8, para que los
// acentos no salgan rotos en Windows.
const BANDERAS = 0x0808;

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
    total += LOCAL + n + Number(e.bytes || 0) + DESCRIPTOR + CENTRAL + n;
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

export function cabeceraLocal(nombreBytes, dos) {
  return new Uint8Array([
    ...u32(0x04034b50), ...u16(20), ...u16(BANDERAS), ...u16(0),
    ...u16(dos.hora), ...u16(dos.fecha),
    ...u32(0), ...u32(0), ...u32(0),          // crc y tamanos: van en el descriptor
    ...u16(nombreBytes.length), ...u16(0),
    ...nombreBytes
  ]);
}

export function descriptor(crc, bytes) {
  return new Uint8Array([...u32(0x08074b50), ...u32(crc), ...u32(bytes), ...u32(bytes)]);
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
export function armarZip(entradas, abrir, fecha) {
  const dos = fechaDos(fecha);
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();

  (async () => {
    try {
      const central = [];
      let offset = 0;

      for (const e of entradas) {
        const nb = new TextEncoder().encode(e.nombre);
        const cab = cabeceraLocal(nb, dos);
        await w.write(cab);
        const inicio = offset;
        offset += cab.length;

        let crc = 0, escritos = 0;
        const cuerpo = await abrir(e);
        if (cuerpo) {
          const lector = cuerpo.getReader();
          for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            crc = crc32(value, crc);
            escritos += value.length;
            await w.write(value);
          }
        }
        offset += escritos;

        const d = descriptor(crc, escritos);
        await w.write(d);
        offset += d.length;

        central.push(entradaCentral(nb, crc, escritos, inicio, dos));
      }

      const offCentral = offset;
      let tamCentral = 0;
      for (const c of central) { await w.write(c); tamCentral += c.length; }
      await w.write(cierre(central.length, tamCentral, offCentral));
      await w.close();
    } catch (ex) {
      console.error('armarZip', ex && ex.message);
      // Abortar en vez de cerrar: un ZIP truncado que se cierra "bien" se ve
      // valido y falla al extraer. Abortado, el navegador marca la descarga como
      // fallida y el cliente sabe que tiene que reintentar.
      try { await w.abort(ex); } catch (e2) {}
    }
  })();

  return readable;
}
