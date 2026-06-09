import { test } from 'node:test';
import assert from 'node:assert';
import { esFotoWeb, esVideoWeb, hashDeVariante } from './entrega-media.js';

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

test('hashDeVariante extrae el account hash de la URL de Images', () => {
  assert.equal(hashDeVariante('https://imagedelivery.net/abc123HASH/img-uid/public'), 'abc123HASH');
  assert.equal(hashDeVariante('https://imagedelivery.net/Zx-9/otra/public'), 'Zx-9');
  assert.equal(hashDeVariante(''), '');
  assert.equal(hashDeVariante(null), '');
});
