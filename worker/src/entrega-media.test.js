import { test } from 'node:test';
import assert from 'node:assert';
import { esFotoWeb, esVideoWeb, claveFoto } from './entrega-media.js';

test('esFotoWeb acepta formatos que el navegador muestra', () => {
  assert.equal(esFotoWeb({ mimeType: 'image/jpeg' }), true);
  assert.equal(esFotoWeb({ mimeType: 'image/png' }), true);
  assert.equal(esFotoWeb({ mimeType: 'image/webp' }), true);
  assert.equal(esFotoWeb({ mimeType: 'image/tiff' }), false);
  assert.equal(esFotoWeb({ mimeType: 'video/mp4' }), false);
});

test('esVideoWeb detecta el sufijo _web', () => {
  assert.equal(esVideoWeb('casa-lomas_web.mp4'), true);
  assert.equal(esVideoWeb('CASA_WEB.MOV'), true);
  assert.equal(esVideoWeb('master-4k.mp4'), false);
  assert.equal(esVideoWeb('reel.mp4'), false);
});

test('claveFoto arma la ruta en R2 con la extensión del archivo', () => {
  assert.equal(claveFoto('TKN', { id: 'ABC', nombre: 'frente.JPG' }), 'entrega/TKN/ABC.jpg');
  assert.equal(claveFoto('TKN', { id: 'XYZ', nombre: 'sin-ext' }), 'entrega/TKN/XYZ.jpg');
});
