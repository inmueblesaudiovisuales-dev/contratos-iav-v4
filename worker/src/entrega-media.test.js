import { test } from 'node:test';
import assert from 'node:assert';
import { esFotoWeb, esImagenDrive, esVideoWeb, extraerStreamCustomer, hashDeVariante } from './entrega-media.js';

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

test('esImagenDrive rechaza HTML aunque Drive responda 200', () => {
  assert.equal(esImagenDrive('image/jpeg'), true);
  assert.equal(esImagenDrive('image/png; charset=binary'), true);
  assert.equal(esImagenDrive('IMAGE/WEBP'), true);
  assert.equal(esImagenDrive('text/html; charset=utf-8'), false);
  assert.equal(esImagenDrive(''), false);
});

test('extraerStreamCustomer prueba las URLs disponibles de Stream', () => {
  assert.equal(extraerStreamCustomer({
    preview: 'https://customer-preview.cloudflarestream.com/uid/watch'
  }), 'customer-preview');
  assert.equal(extraerStreamCustomer({
    preview: null,
    thumbnail: 'https://customer-thumb.cloudflarestream.com/uid/thumbnails/thumbnail.jpg'
  }), 'customer-thumb');
  assert.equal(extraerStreamCustomer({
    playback: {
      hls: 'https://customer-playback.cloudflarestream.com/uid/manifest/video.m3u8'
    }
  }), 'customer-playback');
  assert.equal(extraerStreamCustomer({ preview: null, thumbnail: null }), '');
});
