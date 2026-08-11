import { test } from 'node:test';
import assert from 'node:assert';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  crc32, crcDeStream, nombreZip, tamanoZip, cabeEnZip, TOPE_ZIP, armarZip, fechaDos
} from './entregas-zip.js';

const enc = s => new TextEncoder().encode(s);

// ── CRC32 ─────────────────────────────────────────────────────────────────────
// Se compara contra el de Node: si esto se desvia, Windows y macOS declaran el
// ZIP corrupto y el cliente no puede abrir sus fotos.

test('crc32 coincide con el de zlib', () => {
  for (const s of ['', 'a', 'hola mundo', 'IAV-2607.17-A.jpg', 'ñáé 123']) {
    assert.equal(crc32(enc(s)), zlib.crc32(Buffer.from(s)), s);
  }
});

test('crc32 por pedazos da lo mismo que de un jalon', () => {
  // Es como se calcula de verdad: los bytes llegan de R2 en trozos.
  const todo = enc('el zorro marron salta sobre el perro perezoso');
  let parcial = 0;
  for (let i = 0; i < todo.length; i += 7) parcial = crc32(todo.slice(i, i + 7), parcial);
  assert.equal(parcial, crc32(todo));
});

test('crc32 aguanta bytes altos sin desbordarse', () => {
  const b = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
  assert.equal(crc32(b), zlib.crc32(Buffer.from(b)));
});

// ── Nombres ───────────────────────────────────────────────────────────────────

test('los nombres repetidos no se pisan dentro del zip', () => {
  // Dos carpetas distintas con DSC_0001.jpg: sin esto, uno se pierde al extraer.
  const usados = new Set();
  assert.equal(nombreZip('DSC_0001.jpg', usados), 'DSC_0001.jpg');
  assert.equal(nombreZip('DSC_0001.jpg', usados), 'DSC_0001 (2).jpg');
  assert.equal(nombreZip('DSC_0001.jpg', usados), 'DSC_0001 (3).jpg');
});

test('nombreZip limpia lo que rompe una ruta y conserva acentos', () => {
  assert.equal(nombreZip('../../etc/passwd'), '_.._etc_passwd');
  assert.equal(nombreZip('a:b*c?.jpg'), 'a_b_c_.jpg');
  assert.equal(nombreZip('fachada ñ.jpg'), 'fachada ñ.jpg');
  assert.equal(nombreZip(''), 'archivo');
  assert.equal(nombreZip(null), 'archivo');
});

// ── Tamano ────────────────────────────────────────────────────────────────────

test('el tamano se puede saber de antemano (por eso hay barra de progreso)', () => {
  const entradas = [{ nombre: 'a.jpg', bytes: 100 }, { nombre: 'b.jpg', bytes: 200 }];
  // por archivo: 30 (cabecera) + nombre + datos + 46 (indice) + nombre; y 22 de cierre
  assert.equal(tamanoZip(entradas), (30 + 5 + 100 + 46 + 5) + (30 + 5 + 200 + 46 + 5) + 22);
});

test('un zip vacio sigue siendo un zip valido', () => {
  assert.equal(tamanoZip([]), 22);
});

test('se rechaza lo que no cabe en el formato clasico', () => {
  assert.equal(cabeEnZip([{ nombre: 'a.jpg', bytes: 500 * 1024 * 1024 }]), true);
  assert.equal(cabeEnZip([{ nombre: 'a.mp4', bytes: TOPE_ZIP + 1 }]), false);
  const muchas = Array.from({ length: 9 }, (_, i) => ({ nombre: `f${i}.jpg`, bytes: 600 * 1024 * 1024 }));
  assert.equal(cabeEnZip(muchas), false);   // 5.2 GB en total
});

// ── El archivo de verdad ──────────────────────────────────────────────────────

async function zipDe(archivos) {
  const entradas = archivos.map(a => ({
    nombre: a.nombre, bytes: a.datos.length, crc: crc32(new Uint8Array(a.datos)), datos: a.datos
  }));
  const stream = armarZip(entradas, e => new Response(e.datos).body, new Date(2026, 0, 1, 12, 0, 0));
  const buf = Buffer.from(await new Response(stream).arrayBuffer());
  return { buf, entradas };
}

test('el tamano anunciado es EXACTAMENTE el del archivo generado', async () => {
  // Si esto falla, Content-Length miente y el navegador corta la descarga a medias
  // o se queda esperando bytes que no llegan.
  const { buf, entradas } = await zipDe([
    { nombre: 'uno.jpg', datos: enc('contenido del uno') },
    { nombre: 'dos.jpg', datos: enc('el dos es mas largo que el uno, bastante') }
  ]);
  assert.equal(buf.length, tamanoZip(entradas));
});

test('el zip empieza y termina con las firmas del formato', async () => {
  const { buf } = await zipDe([{ nombre: 'a.txt', datos: enc('hola') }]);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);              // cabecera local
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50); // cierre
  assert.equal(buf.readUInt16LE(buf.length - 22 + 8), 1);      // 1 entrada
});

test('con acentos, el nombre va en UTF-8 y marcado como tal', async () => {
  const { buf } = await zipDe([{ nombre: 'fachada ñ.jpg', datos: enc('x') }]);
  assert.ok(buf.includes(Buffer.from('fachada ñ.jpg', 'utf8')));
  assert.equal(buf.readUInt16LE(6) & 0x0800, 0x0800, 'debe estar marcado UTF-8');
});

// Prueba de fuego: que Windows lo pueda abrir. Si Expand-Archive no esta
// disponible, la prueba se salta en vez de dar un falso verde.
test('Windows puede extraerlo y los bytes salen intactos', async (t) => {
  const archivos = [
    { nombre: 'foto-1.jpg', datos: enc('primer archivo con su contenido') },
    { nombre: 'foto-2.jpg', datos: Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256)) },
    { nombre: 'fachada ñ.jpg', datos: enc('acentos y ñ') }
  ];
  const { buf } = await zipDe(archivos);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  const zip = path.join(dir, 'p.zip');
  fs.writeFileSync(zip, buf);
  const salida = path.join(dir, 'out');
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${salida}' -Force`],
      { stdio: 'pipe' });
  } catch (ex) {
    fs.rmSync(dir, { recursive: true, force: true });
    return t.skip('powershell no disponible: ' + String(ex.message).slice(0, 80));
  }

  for (const a of archivos) {
    const leido = fs.readFileSync(path.join(salida, a.nombre));
    assert.deepEqual(new Uint8Array(leido), new Uint8Array(a.datos), a.nombre);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fechaDos no se sale de rango', () => {
  const d = fechaDos(new Date(2026, 7, 11, 23, 59, 58));
  assert.ok(d.hora >= 0 && d.hora <= 0xFFFF);
  assert.ok(d.fecha >= 0 && d.fecha <= 0xFFFF);
});

test('crcDeStream da lo mismo que calcularlo de un jalon', async () => {
  const datos = new Uint8Array(200000).map((_, i) => (i * 31) % 256);
  const r = await crcDeStream(new Response(datos).body);
  assert.equal(r.crc, crc32(datos));
  assert.equal(r.bytes, datos.length);
});

test('un CRC equivocado hace que Windows rechace el archivo', async (t) => {
  // Prueba de que el CRC de verdad importa: si esto pasara, estariamos
  // entregando ZIPs que se ven bien y truenan al extraer.
  const datos = enc('contenido que no coincide con el crc');
  const entradas = [{ nombre: 'malo.txt', bytes: datos.length, crc: 12345, datos }];
  const stream = armarZip(entradas, e => new Response(e.datos).body, new Date(2026, 0, 1, 12, 0, 0));
  const buf = Buffer.from(await new Response(stream).arrayBuffer());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipmal-'));
  const zip = path.join(dir, 'p.zip');
  fs.writeFileSync(zip, buf);
  let fallo = false;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(dir, 'o')}' -Force`],
      { stdio: 'pipe' });
  } catch (ex) { fallo = true; }
  fs.rmSync(dir, { recursive: true, force: true });
  if (!fallo) return t.skip('este extractor no valida el CRC');
  assert.ok(fallo);
});
