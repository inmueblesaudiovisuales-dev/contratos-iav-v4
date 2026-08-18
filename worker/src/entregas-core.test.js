import { test } from 'node:test';
import assert from 'node:assert';
import {
  generarCodigo, esCodigoValido, rutaPublica, codigoDeRuta, LARGO_CODIGO,
  clavesAcordadas, parsearAdicionales, entregablesSembrados,
  calcularExpiracion, diasRestantes, estaVencida, fechaLegible, OFFSET_MTY_MS,
  entregaCompleta, faltantes, entregableCumplido,
  debeLiberarAlPagar, debeLiberarAlPublicar,
  datosCliente, grupoDeEntrega, ordenarEntregas, versionFotos
} from './entregas-core.js';

// ── Codigo publico ────────────────────────────────────────────────────────────

test('generarCodigo produce codigos del largo y alfabeto esperados', () => {
  for (let i = 0; i < 200; i++) {
    const c = generarCodigo();
    assert.equal(c.length, LARGO_CODIGO);
    assert.ok(esCodigoValido(c), `codigo invalido: ${c}`);
  }
});

test('generarCodigo nunca mete guiones — romperia codigoDeRuta', () => {
  for (let i = 0; i < 200; i++) assert.ok(!generarCodigo().includes('-'));
});

test('generarCodigo no repite en volumen razonable', () => {
  const vistos = new Set();
  for (let i = 0; i < 5000; i++) vistos.add(generarCodigo());
  assert.equal(vistos.size, 5000);
});

test('esCodigoValido rechaza caracteres ambiguos y largos raros', () => {
  assert.equal(esCodigoValido('abcdefghjk'), true);
  assert.equal(esCodigoValido('abcdefghj0'), false);  // cero
  assert.equal(esCodigoValido('abcdefghjl'), false);  // ele
  assert.equal(esCodigoValido('abcdefghjI'), false);  // I mayuscula
  assert.equal(esCodigoValido('abcdefgh'), false);    // corto
  assert.equal(esCodigoValido(''), false);
  assert.equal(esCodigoValido(null), false);
});

test('rutaPublica antepone el folio cuando existe', () => {
  assert.equal(rutaPublica('IAV-2608.08-A', 'k7m2x9abcd'), '/IAV-2608.08-A-k7m2x9abcd');
  assert.equal(rutaPublica('', 'k7m2x9abcd'), '/k7m2x9abcd');
  assert.equal(rutaPublica(null, 'k7m2x9abcd'), '/k7m2x9abcd');
});

test('codigoDeRuta saca el codigo aunque el folio traiga guiones', () => {
  assert.equal(codigoDeRuta('/IAV-2608.08-A-k7m2x9abcd'), 'k7m2x9abcd');
  assert.equal(codigoDeRuta('/k7m2x9abcd'), 'k7m2x9abcd');
  assert.equal(codigoDeRuta('IAV-2608.08-A-k7m2x9abcd'), 'k7m2x9abcd');
  assert.equal(codigoDeRuta('/IAV-2608.08-A-k7m2x9abcd/'), 'k7m2x9abcd');
});

test('codigoDeRuta ignora rutas que no son entregas', () => {
  assert.equal(codigoDeRuta('/admin'), '');
  assert.equal(codigoDeRuta('/api/listarContratos'), '');
  assert.equal(codigoDeRuta('/e/IAV-2608.08-A'), '');   // ruta de control, no publica
  assert.equal(codigoDeRuta('/'), '');
  assert.equal(codigoDeRuta(''), '');
});

test('el enlace del cliente sobrevive a que cambie el folio', () => {
  // reagendarPropiedad regenera el folio de la propiedad 1. El codigo no cambia,
  // asi que la busqueda sigue resolviendo con la ruta vieja Y con la nueva.
  const cod = 'k7m2x9abcd';
  assert.equal(codigoDeRuta(rutaPublica('IAV-2608.08-A', cod)), cod);
  assert.equal(codigoDeRuta(rutaPublica('IAV-2609.14-C', cod)), cod);
});

// ── Siembra de entregables ────────────────────────────────────────────────────

test('el paquete residencial siembra fotos, video y tour', () => {
  const e = entregablesSembrados('RES-COMBO', [], 1);
  assert.deepEqual(e.map(x => x.tipo), ['fotos', 'video', 'enlace']);
  assert.equal(e.length, 3);
  assert.deepEqual(e.map(x => x.orden), [0, 1, 2]);
  assert.ok(e.every(x => x.completo === 0));
});

test('el terreno no lleva tour 360', () => {
  const e = entregablesSembrados('TER-COMBO', [], 1);
  assert.deepEqual(e.map(x => x.nombre), ['Fotografías', 'Video cinemático']);
});

test('los paquetes individuales siembran un solo renglon', () => {
  assert.equal(entregablesSembrados('IND-FOTO', [], 1).length, 1);
  assert.equal(entregablesSembrados('IND-VIDEO', [], 1).length, 1);
  assert.equal(entregablesSembrados('IND-360', [], 1).length, 1);
  assert.equal(entregablesSembrados('IND-360', [], 1)[0].tipo, 'enlace');
});

test('un paquete desconocido cae al set completo, no a vacio', () => {
  // Preferimos que Bruno borre un renglon de mas a que se le olvide entregar algo.
  const e = entregablesSembrados('PAQUETE-QUE-NO-EXISTE', [], 1);
  assert.equal(e.length, 3);
});

test('los adicionales acordados agregan su propio renglon', () => {
  const e = entregablesSembrados('RES-COMBO', [{ clave: 'ADD-COMOLLEGAR', precio: 1000 }], 1);
  assert.equal(e.length, 4);
  assert.equal(e[3].nombre, 'Video cómo llegar');
  assert.equal(e[3].orden, 3);
});

test('los adicionales solo OFRECIDOS no siembran nada', () => {
  // Un string suelto en adicionales_json es una oferta que el cliente aun no acepta.
  assert.equal(entregablesSembrados('RES-COMBO', ['ADD-COMOLLEGAR'], 1).length, 3);
  assert.equal(
    entregablesSembrados('RES-COMBO', [{ clave: 'ADD-LANDING', ofrecido: true }], 1).length, 3);
});

test('un adicional de otra propiedad no contamina esta entrega', () => {
  const ad = [{ clave: 'ADD-LANDING', precio: 1200, numPropiedad: 2 }];
  assert.equal(entregablesSembrados('RES-COMBO', ad, 1).length, 3);
  assert.equal(entregablesSembrados('RES-COMBO', ad, 2).length, 4);
});

test('ADD-ASESOR y ADD-EXPRESS no son entregables aparte', () => {
  const ad = [{ clave: 'ADD-ASESOR', precio: 500 }, { clave: 'ADD-EXPRESS', precio: 1000 }];
  assert.equal(entregablesSembrados('RES-COMBO', ad, 1).length, 3);
});

test('clavesAcordadas ignora personalizados sin clave de catalogo', () => {
  const ad = [{ nombre: 'Tour extra', precio: 2500 }, { clave: 'ADD-LANDING', precio: 1200 }];
  assert.deepEqual(clavesAcordadas(ad, 1), ['ADD-LANDING']);
});

test('parsearAdicionales aguanta json roto sin tumbar la siembra', () => {
  assert.deepEqual(parsearAdicionales('[]'), []);
  assert.deepEqual(parsearAdicionales('no soy json'), []);
  assert.deepEqual(parsearAdicionales(null), []);
  assert.deepEqual(parsearAdicionales('{"a":1}'), []);   // objeto, no arreglo
  assert.deepEqual(parsearAdicionales(['ADD-X']), ['ADD-X']);
});

test('no se duplica un renglon si el add-on repite un nombre ya sembrado', () => {
  const e = entregablesSembrados('RES-COMBO',
    [{ clave: 'ADD-COMOLLEGAR', precio: 1000 }, { clave: 'ADD-COMOLLEGAR', precio: 1000 }], 1);
  assert.equal(e.length, 4);
});

// ── Reloj (hora de Monterrey) ─────────────────────────────────────────────────

test('la expiracion cae al final del dia en Monterrey, no a la hora del pago', () => {
  // 2026-08-11T08:05Z son las 02:05 del 11 de agosto en Monterrey.
  const exp = calcularExpiracion('2026-08-11T08:05:50.000Z', 14);
  // 25 de agosto 23:59:59 Monterrey == 26 de agosto 05:59:59 UTC
  assert.equal(exp, '2026-08-26T05:59:59.000Z');
});

test('liberar de madrugada o de noche del mismo dia local da la misma fecha', () => {
  const temprano = calcularExpiracion('2026-08-11T07:00:00.000Z', 14); // 01:00 MTY del 11
  const tarde    = calcularExpiracion('2026-08-12T04:00:00.000Z', 14); // 22:00 MTY del 11
  assert.equal(temprano, tarde);
});

test('el dia local manda sobre el dia UTC', () => {
  // 2026-08-11T05:00Z son todavia las 23:00 del 10 de agosto en Monterrey.
  const exp = calcularExpiracion('2026-08-11T05:00:00.000Z', 14);
  assert.equal(exp, '2026-08-25T05:59:59.000Z'); // 24 ago 23:59:59 MTY
});

test('calcularExpiracion respeta una vigencia distinta a 14', () => {
  assert.equal(calcularExpiracion('2026-08-11T08:00:00.000Z', 0),  '2026-08-12T05:59:59.000Z');
  assert.equal(calcularExpiracion('2026-08-11T08:00:00.000Z', 30), '2026-09-11T05:59:59.000Z');
});

test('calcularExpiracion devuelve null con fecha invalida', () => {
  assert.equal(calcularExpiracion('no soy fecha', 14), null);
  assert.equal(calcularExpiracion('', 14), null);
});

test('diasRestantes cuenta dias locales completos', () => {
  const exp = calcularExpiracion('2026-08-11T08:05:50.000Z', 14);
  assert.equal(diasRestantes(exp, '2026-08-11T08:05:50.000Z'), 14);
  assert.equal(diasRestantes(exp, '2026-08-20T18:00:00.000Z'), 5);
  assert.equal(diasRestantes(exp, '2026-08-25T12:00:00.000Z'), 0);   // vence hoy
  assert.equal(diasRestantes(exp, '2026-08-27T12:00:00.000Z'), -2);  // ya vencio
});

test('diasRestantes no se confunde por la hora del dia', () => {
  const exp = calcularExpiracion('2026-08-11T08:00:00.000Z', 14);
  // 23:00 MTY del 24 sigue siendo "queda 1 dia", no cero.
  assert.equal(diasRestantes(exp, '2026-08-25T05:00:00.000Z'), 1);
});

test('estaVencida usa el instante exacto del corte', () => {
  const exp = calcularExpiracion('2026-08-11T08:00:00.000Z', 14); // 2026-08-26T05:59:59Z
  assert.equal(estaVencida(exp, '2026-08-26T05:59:58.000Z'), false);
  assert.equal(estaVencida(exp, '2026-08-26T06:00:00.000Z'), true);
  assert.equal(estaVencida(null, '2026-08-26T06:00:00.000Z'), false);
});

test('fechaLegible muestra el dia local, no el UTC', () => {
  assert.equal(fechaLegible('2026-08-26T05:59:59.000Z'), '25 de agosto');
  assert.equal(fechaLegible('2026-01-01T05:00:00.000Z'), '31 de diciembre');
  assert.equal(fechaLegible('no soy fecha'), '');
});

test('el offset de Monterrey es UTC-6 fijo', () => {
  // Mexico elimino el horario de verano en 2022 y Nuevo Leon no es fronterizo.
  assert.equal(OFFSET_MTY_MS, -6 * 3600 * 1000);
  assert.equal(fechaLegible(calcularExpiracion('2026-01-15T08:00:00.000Z', 14)), '29 de enero');
  assert.equal(fechaLegible(calcularExpiracion('2026-07-15T08:00:00.000Z', 14)), '29 de julio');
});

// ── Completitud y estados ─────────────────────────────────────────────────────

test('entregaCompleta exige todos los renglones y al menos uno', () => {
  assert.equal(entregaCompleta([{ completo: 1 }, { completo: 1 }]), true);
  assert.equal(entregaCompleta([{ completo: 1 }, { completo: 0 }]), false);
  assert.equal(entregaCompleta([]), false);       // sin renglones no hay nada que entregar
  assert.equal(entregaCompleta(null), false);
});

test('faltantes dice exactamente que renglon falta', () => {
  const e = [{ nombre: 'Fotografías', completo: 1 }, { nombre: 'Tour 360', completo: 0 }];
  assert.deepEqual(faltantes(e), ['Tour 360']);
});

test('un enlace se cumple con la URL; lo demas con archivos', () => {
  assert.equal(entregableCumplido({ tipo: 'enlace', valor: 'https://x.com' }, 0), true);
  assert.equal(entregableCumplido({ tipo: 'enlace', valor: '   ' }, 5), false);
  assert.equal(entregableCumplido({ tipo: 'fotos' }, 1), true);
  assert.equal(entregableCumplido({ tipo: 'fotos' }, 0), false);
  assert.equal(entregableCumplido({ tipo: 'video' }, 1), true);
});

test('pagar antes de publicar NO libera una entrega vacia', () => {
  assert.equal(debeLiberarAlPagar({ estado: 'publicada' }), true);
  assert.equal(debeLiberarAlPagar({ estado: 'borrador' }), false);
  assert.equal(debeLiberarAlPagar({ estado: 'liberada' }), false);
  assert.equal(debeLiberarAlPagar({ estado: 'pausada' }), false);
  assert.equal(debeLiberarAlPagar(null), false);
});

test('publicar algo ya pagado lo libera en ese momento', () => {
  assert.equal(debeLiberarAlPublicar(0, false), true);
  assert.equal(debeLiberarAlPublicar(2250, false), false);
  assert.equal(debeLiberarAlPublicar(2250, true), true);   // suelta marcada pagada
  assert.equal(debeLiberarAlPublicar(null, false), false); // suelta sin contrato ni marca
});

// ── Cliente ───────────────────────────────────────────────────────────────────

test('un cliente ligado lee sus datos en vivo del admin', () => {
  const d = datosCliente(
    { cliente_id: 'c1', nombre: 'VIEJO', telefono: '000' },
    { nombre: 'Grupo Lomas', telefono: '8112345678', correo: 'a@b.com' }
  );
  assert.equal(d.nombre, 'Grupo Lomas');   // gana el admin, no la copia local
  assert.equal(d.telefono, '8112345678');
  assert.equal(d.ligado, true);
});

test('un cliente manual usa sus propios datos', () => {
  const d = datosCliente({ cliente_id: null, nombre: 'Ana Martínez', telefono: '811' }, null);
  assert.equal(d.nombre, 'Ana Martínez');
  assert.equal(d.ligado, false);
});

test('si el cliente se borro en admin no se muestra undefined', () => {
  const d = datosCliente({ cliente_id: 'c1', nombre: '' }, null);
  assert.equal(d.nombre, 'Cliente eliminado');
  assert.equal(d.ligado, true);
});

// ── Lista ─────────────────────────────────────────────────────────────────────

test('cada estado cae en su grupo de la lista', () => {
  assert.equal(grupoDeEntrega('borrador'), 'pendientes');
  assert.equal(grupoDeEntrega('publicada'), 'con_cliente');
  assert.equal(grupoDeEntrega('liberada'), 'liberadas');
  assert.equal(grupoDeEntrega('pausada'), 'liberadas');
  assert.equal(grupoDeEntrega('expirada'), 'historial');
});

test('ordenarEntregas pone primero lo que vence antes', () => {
  const ahora = '2026-08-11T12:00:00.000Z';
  const lista = [
    { titulo: 'sin reloj B', fecha_sesion: '2026-08-09' },
    { titulo: 'vence en 10', fecha_expira: calcularExpiracion(ahora, 10) },
    { titulo: 'sin reloj A', fecha_sesion: '2026-08-05' },
    { titulo: 'vence en 2',  fecha_expira: calcularExpiracion(ahora, 2) }
  ];
  assert.deepEqual(
    ordenarEntregas(lista, ahora).map(e => e.titulo),
    ['vence en 2', 'vence en 10', 'sin reloj A', 'sin reloj B']
  );
});

test('ordenarEntregas no muta el arreglo original', () => {
  const lista = [{ titulo: 'b', fecha_sesion: '2026-08-09' }, { titulo: 'a', fecha_sesion: '2026-08-01' }];
  ordenarEntregas(lista, '2026-08-11T12:00:00.000Z');
  assert.equal(lista[0].titulo, 'b');
});

// ── Marca de agua: tope de la fraccion ────────────────────────────────────────
// Vive aqui y no en entregas-media porque fraccionMarca se exporta desde el
// handler; la regla es lo que importa, no donde este la funcion.
import { fraccionMarca, TOPE_MARCA } from './routes/entregas.js';

test('la fraccion de marca NUNCA llega a 1', async () => {
  // Cloudflare lee width <= 1 como fraccion y > 1 como pixeles: con width:1 el
  // overlay mide un pixel y la foto sale LIMPIA sin marcar error.
  assert.ok(TOPE_MARCA < 1, 'el tope debe ser menor a 1');
  for (const d of [1, 10, 50, 100, 166, 200, 375, 800, 4000]) {
    const f = fraccionMarca(d, 0.45);
    assert.ok(f < 1, `d=${d} dio ${f}, que Cloudflare leeria como pixeles`);
    assert.ok(f > 0, `d=${d} dio ${f}`);
  }
});

test('la marca es proporcional: el ancho de despliegue ya NO la cambia', () => {
  // Cambio del 18 ago 2026. Antes se compensaba por `d` para que el texto midiera
  // lo mismo en pixeles en todas partes; eso obligaba a un piso, y el piso termino
  // siendo el techo de todo: en el hero la marca salia igual pusieras el valor que
  // pusieras, y el texto acababa midiendo el 6% del ancho de la foto.
  const esperada = fraccionMarca(null, 0.9375);
  for (const d of [1, 80, 166, 300, 375, 800, 1200, 4000]) {
    assert.equal(fraccionMarca(d, 0.9375), esperada, `d=${d} cambio la marca`);
  }
});

test('una base absurda no puede desactivar la marca', () => {
  // Si algo manda basura vale mas marcar de mas que servir la foto limpia.
  for (const b of [0, -1, null, undefined, NaN, 'x']) {
    const f = fraccionMarca(300, b);
    assert.ok(f > 0 && f < 1, `base ${b} dio ${f}`);
  }
});

test('la base se usa tal cual, acotada por el tope', () => {
  assert.equal(fraccionMarca(null, 0.45), 0.45);
  assert.equal(fraccionMarca(0, 0.45), 0.45);
  assert.equal(fraccionMarca(300, 0.9375), 0.9375);
  assert.ok(fraccionMarca(undefined, 2) < 1);   // el tope sigue mandando
});

// ── Marca de version de las fotos ─────────────────────────────────────────────
// El bug que cierran: la URL de una foto era la misma antes y despues de liberar,
// asi que el navegador seguia sirviendo de su disco la copia con marca de agua. El
// cliente pagaba y veia exactamente lo mismo.

test('la version cambia al liberarse: es lo unico que obliga al navegador a volver a pedir', () => {
  const ahora = '2026-08-18T12:00:00.000Z';
  const publicada = { estado: 'publicada' };
  const liberada = { estado: 'liberada', fecha_liberada: '2026-08-18T10:00:00.000Z',
                     fecha_expira: '2026-09-01T00:00:00.000Z' };
  assert.notEqual(versionFotos(publicada, ahora), versionFotos(liberada, ahora));
});

test('mientras no este liberada, todos los estados comparten version', () => {
  const ahora = '2026-08-18T12:00:00.000Z';
  for (const estado of ['borrador', 'publicada', 'pausada', 'expirada']) {
    assert.equal(versionFotos({ estado }, ahora), 'm');
  }
});

test('una entrega liberada pero vencida vuelve a la version marcada', () => {
  // El servidor le pone el mosaico otra vez al vencer. Si la version no volviera
  // atras, el navegador seguiria mostrando la limpia que guardo mientras podia.
  const v = versionFotos({
    estado: 'liberada',
    fecha_liberada: '2026-07-01T10:00:00.000Z',
    fecha_expira: '2026-07-15T00:00:00.000Z'
  }, '2026-08-18T12:00:00.000Z');
  assert.equal(v, 'm');
});

test('la version es estable: dos consultas seguidas dan lo mismo', () => {
  // Si cambiara en cada visita, cada carga volveria a pedir las 45 fotos al Worker
  // y el cache dejaria de servir para nada.
  const e = { estado: 'liberada', fecha_liberada: '2026-08-18T10:00:00.000Z',
              fecha_expira: '2026-09-01T00:00:00.000Z' };
  assert.equal(versionFotos(e, '2026-08-18T12:00:00.000Z'),
               versionFotos(e, '2026-08-18T18:30:00.000Z'));
});

test('la version solo trae caracteres que sobreviven una query string', () => {
  const v = versionFotos({ estado: 'liberada', fecha_liberada: '2026-08-18T10:00:00.000Z',
                           fecha_expira: '2026-09-01T00:00:00.000Z' }, '2026-08-18T12:00:00.000Z');
  assert.match(v, /^[0-9a-zA-Z]+$/);
  assert.equal(v, encodeURIComponent(v));
});

test('una liberada sin fecha registrada sigue distinguiendose de la marcada', () => {
  // No deberia pasar, pero si pasara, caer en 'm' serviria la version con marca a
  // quien ya pago. Vale mas una version rara que un cliente viendo el mosaico.
  const v = versionFotos({ estado: 'liberada', fecha_liberada: null }, '2026-08-18T12:00:00.000Z');
  assert.notEqual(v, 'm');
});
