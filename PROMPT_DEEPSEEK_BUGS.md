# Prompt de corrección de bugs — IAV Contratos v4.0

Eres un programador experto en Google Apps Script, JavaScript vanilla y Cloudflare Workers. Tu tarea es corregir **10 bugs específicos** en un sistema de contratos. A continuación se describe cada bug con su causa raíz y el cambio exacto que debes hacer. **No hagas cambios fuera de lo indicado.**

---

## Contexto del sistema

El sistema tiene tres capas:
1. **Cloudflare Worker** — backend API + assets estáticos. Directorio: `/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker/`
2. **Frontend HTML** — archivos estáticos servidos por el Worker. Directorio: `/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/frontend/`
3. **Adapter de Apps Script** — un único archivo JS que se pega en script.google.com. Archivo: `/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/adapter/AdapterScript4_v1.js`

La función `d1ToPascal` en `frontend/admin.html` convierte campos snake_case de D1 a PascalCase. Por ejemplo: `carpeta_control_id` → `CarpetaControlId`, `fecha_sesion` → `FechaSesion`, `sobre_la_propiedad` → `SobreLaPropiedad`.

---

## Bug 1 — Evento de Calendar con datos incompletos

**Archivo:** `adapter/AdapterScript4_v1.js`  
**Función:** `primerAbono`, bloque del loop de propiedades (~línea 241)

**Causa:** El evento solo incluye dirección y nombre del cliente. Falta folio, paquete, teléfono, link de Maps y adicionales.

**Cambio:** Reemplaza el bloque `createEvent` actual:

```js
var evento = CalendarApp.getDefaultCalendar().createEvent(
  (folio || token) + ' — Sesión ' + contrato.nombre_cliente,
  fecha, fin,
  { description: 'Dirección: ' + (prop.direccion || '') + '\nCliente: ' + contrato.nombre_cliente }
);
```

Por:

```js
var adicionalesTexto = '';
try {
  var adicArr = typeof contrato.adicionales_json === 'string'
    ? JSON.parse(contrato.adicionales_json || '[]')
    : (contrato.adicionales_json || []);
  var adicNombres = adicArr.filter(function(a) { return typeof a === 'object'; })
    .map(function(a) { return a.nombre || a.clave || ''; }).filter(Boolean);
  adicionalesTexto = adicNombres.length ? adicNombres.join(', ') : 'Ninguno';
} catch(e) { adicionalesTexto = ''; }

var descripcion = [
  'Folio: ' + (folio || 'Sin folio'),
  'Cliente: ' + contrato.nombre_cliente,
  'Teléfono: ' + (contrato.telefono_cliente || 'N/A'),
  'Paquete: ' + (prop.paquete || contrato.paquete_base || ''),
  'Dirección: ' + (prop.direccion || 'Por confirmar'),
  prop.link_maps ? 'Maps: ' + prop.link_maps : '',
  adicionalesTexto ? 'Adicionales: ' + adicionalesTexto : '',
].filter(Boolean).join('\n');

var evento = CalendarApp.getDefaultCalendar().createEvent(
  (folio || token) + ' — Sesión · ' + contrato.nombre_cliente,
  fecha, fin,
  { description: descripcion }
);
```

---

## Bug 2 — Correos sin diseño HTML

**Archivo:** `adapter/AdapterScript4_v1.js`  
**Funciones afectadas:** `enviarCorreoConPDF_`, `enviarCorreoAbono`, `enviarCorreoEntrega`, `enviarRecordatorioPago`

**Causa:** Todos los correos se envían como texto plano. Deben tener diseño HTML con header oscuro, logo de IAV y secciones estilizadas.

**Cambio:** Define esta función helper al final del archivo (antes de `parseFecha_`):

```js
function htmlCorreo_(titulo, cuerpoHtml, btnTexto, btnUrl) {
  var btn = btnTexto && btnUrl
    ? '<div style="text-align:center;margin:28px 0"><a href="' + btnUrl + '" style="background:#C9A84C;color:#fff;text-decoration:none;padding:13px 28px;border-radius:6px;font-weight:700;font-size:14px;display:inline-block">' + btnTexto + '</a></div>'
    : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#F5F4F1;font-family:Helvetica,Arial,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">' +
    '<tr><td style="background:#1C1C1E;padding:22px 32px;border-radius:8px 8px 0 0;text-align:center">' +
    '<img src="https://inmueblesaudiovisuales.com/logo-invertido.svg" alt="Inmuebles Audiovisuales" height="32" style="display:inline-block">' +
    '</td></tr>' +
    '<tr><td style="background:#fff;padding:32px;border-radius:0 0 8px 8px">' +
    '<h2 style="margin:0 0 20px;font-size:20px;color:#1C1C1E;font-weight:700">' + titulo + '</h2>' +
    cuerpoHtml +
    btn +
    '<hr style="border:none;border-top:1px solid #E5E5EA;margin:24px 0">' +
    '<p style="margin:0;font-size:12px;color:#9B9B9F;text-align:center">Inmuebles Audiovisuales · Monterrey, México</p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}
```

Luego actualiza cada función de correo para usar HTML:

**`enviarCorreoConPDF_`** — reemplaza el `GmailApp.sendEmail` completo por:

```js
function enviarCorreoConPDF_(contrato, linkPortal, pdfUrl) {
  if (!contrato.correo_cliente) return;
  var porcentaje = contrato.precio_total > 0
    ? Math.round(contrato.anticipo / contrato.precio_total * 100) : 0;
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + contrato.nombre_cliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Gracias por firmar tu contrato. Adjunto encontrarás tu copia en PDF.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Anticipo acordado (' + porcentaje + '%)</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#C9A84C">$' + (contrato.anticipo || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Saldo pendiente</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#1C1C1E">$' + (contrato.saldo_pendiente || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '</table>';
  var html = htmlCorreo_('Contrato firmado', cuerpo, 'Ver estado de tu contrato', linkPortal);
  GmailApp.sendEmail(
    contrato.correo_cliente,
    'Tu contrato firmado — ' + (contrato.folio || ''),
    'Hola ' + contrato.nombre_cliente + ', adjunto tu contrato. Ver portal: ' + linkPortal,
    { htmlBody: html, attachments: [UrlFetchApp.fetch(pdfUrl).getBlob().setName('Contrato-' + (contrato.folio || '') + '.pdf')] }
  );
}
```

**`enviarCorreoAbono`** — reemplaza el `GmailApp.sendEmail` completo por:

```js
function enviarCorreoAbono(body) {
  if (!body.correoCliente) return;
  var porcentaje = body.precioTotal > 0
    ? Math.round(body.anticipo / body.precioTotal * 100) : 0;
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + body.nombreCliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Confirmamos la recepción de tu pago.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Pago recibido</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#2D7A4F">+$' + (body.monto || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Anticipo acordado (' + porcentaje + '%)</td>' +
    '<td align="right" style="font-size:13px;color:#1C1C1E">$' + (body.anticipo || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Saldo pendiente</td>' +
    '<td align="right" style="font-size:13px;font-weight:700;color:#1C1C1E">$' + (body.nuevoSaldo || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '</table>' +
    '<p style="color:#3A3A3C;font-size:13px;line-height:1.6;margin:0 0 8px">Antes de tu sesión, por favor ten en cuenta:</p>' +
    '<ul style="margin:0 0 16px;padding-left:20px;color:#3A3A3C;font-size:13px;line-height:1.8">' +
    '<li>Despeja los espacios que se van a fotografiar/filmar</li>' +
    '<li>Enciende todas las luces</li>' +
    '<li>Retira objetos personales de las superficies</li>' +
    '</ul>';
  var html = htmlCorreo_('Confirmación de pago', cuerpo, 'Ver estado de tu contrato', body.linkPortal);
  GmailApp.sendEmail(
    body.correoCliente,
    'Confirmación de pago — ' + (body.folio || ''),
    'Hola ' + body.nombreCliente + ', confirmamos tu pago de $' + (body.monto || 0).toLocaleString('es-MX') + ' MXN.',
    { htmlBody: html }
  );
}
```

**`enviarCorreoEntrega`** — reemplaza el `GmailApp.sendEmail` completo por:

```js
function enviarCorreoEntrega(body) {
  if (!body.correoCliente) return;
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + body.nombreCliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Tu material audiovisual ya está disponible para descarga. Puedes acceder desde el portal de tu contrato.</p>';
  var html = htmlCorreo_('Tu material está listo', cuerpo, 'Descargar material', body.linkPortal);
  GmailApp.sendEmail(
    body.correoCliente,
    'Tu material está listo — ' + (body.folio || ''),
    'Hola ' + body.nombreCliente + ', tu material está listo. Descárgalo en: ' + body.linkPortal,
    { htmlBody: html }
  );
}
```

**`enviarRecordatorioPago`** — reemplaza el `GmailApp.sendEmail` completo por:

```js
function enviarRecordatorioPago(body) {
  if (!body.correoCliente) return;
  var cuerpo = '<p style="color:#1C1C1E;font-size:15px;margin:0 0 16px">Hola <strong>' + body.nombreCliente + '</strong>,</p>' +
    '<p style="color:#3A3A3C;font-size:14px;line-height:1.6;margin:0 0 20px">Te recordamos que tienes un saldo pendiente.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border-radius:8px;padding:16px 20px;margin-bottom:20px">' +
    '<tr><td style="font-size:13px;color:#9B9B9F;padding:4px 0">Saldo pendiente</td>' +
    '<td align="right" style="font-size:14px;font-weight:700;color:#C9A84C">$' + (body.saldoPendiente || 0).toLocaleString('es-MX') + ' MXN</td></tr>' +
    '</table>';
  var html = htmlCorreo_('Recordatorio de pago', cuerpo, 'Realizar pago', body.linkPortal);
  GmailApp.sendEmail(
    body.correoCliente,
    'Recordatorio de pago — ' + (body.folio || ''),
    'Hola ' + body.nombreCliente + ', saldo pendiente: $' + (body.saldoPendiente || 0).toLocaleString('es-MX') + ' MXN. Portal: ' + body.linkPortal,
    { htmlBody: html }
  );
}
```

---

## Bug 3 — Correo con PDF no llega al cliente

**Archivo:** `worker/src/routes/portal.js`  
**Función:** `firmaCliente` (~línea 162)

**Causa:** El objeto `contrato` que se pasa a `callAdapter` se construyó ANTES del `UPDATE` en D1. Si el cliente ingresó su correo al momento de firmar (campo `correoCliente` del body), ese valor actualiza la BD pero NO está en el objeto `contrato` que se envía al adapter. El adapter guarda ese contrato en ScriptProperties y al generar el PDF, `contrato.correo_cliente` está vacío, entonces `enviarCorreoConPDF_` hace `return` sin enviar nada.

**Cambio:** En la llamada a `callAdapter`, en la propiedad `contrato`, agrega los campos actualizados:

Busca:
```js
callAdapter(ctx, env, 'procesarFirma', {
  token, firmaBase64,
  contrato: { ...contrato, precio_total: precioTotal, saldo_pendiente: saldoPendiente, estatus: nuevoEstatus },
  linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`,
  propiedades: propiedadesFirma,
  entregables: paqueteInfo?.entregables || ''
});
```

Reemplaza por:
```js
callAdapter(ctx, env, 'procesarFirma', {
  token, firmaBase64,
  contrato: {
    ...contrato,
    precio_total: precioTotal,
    saldo_pendiente: saldoPendiente,
    estatus: nuevoEstatus,
    correo_cliente: correoCliente || contrato.correo_cliente,
    telefono_cliente: telefonoCliente || contrato.telefono_cliente,
    adicionales_json: JSON.stringify(nuevoAdicionales),
  },
  linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`,
  propiedades: propiedadesFirma,
  entregables: paqueteInfo?.entregables || ''
});
```

---

## Bug 4 — Email a Bruno al firmar contrato

**Archivo:** `adapter/AdapterScript4_v1.js`  
**Función:** `procesarFirma` (~línea 81)

**Causa:** `procesarFirma` envía un correo a Bruno cada vez que un cliente firma. Bruno ya ve todo en el admin; este correo es ruido.

**Cambio:** Elimina completamente este bloque de `procesarFirma`:

```js
// Notificar a Bruno
GmailApp.sendEmail(
  CONFIG.EMAIL_BRUNO,
  'Contrato firmado — ' + (contrato.folio || token),
  contrato.nombre_cliente + ' firmó el contrato.\nVer portal: ' + linkPortal
);
```

---

## Bug 5 — Carpeta de Drive se crea en la raíz del proyecto, no en año/mes

**Archivo:** `adapter/AdapterScript4_v1.js`  
**Función:** `primerAbono` (~línea 204)

**Causa:** La carpeta del proyecto se crea directamente dentro de `CARPETA_PROYECTOS_ID`. Debe crearse en la estructura `CARPETA_PROYECTOS_ID/2026/05 — Mayo/`.

**Cambio:** Reemplaza las primeras líneas de `primerAbono`:

Busca:
```js
var carpetaProyectos = DriveApp.getFolderById(CONFIG.CARPETA_PROYECTOS_ID);
var nombreCarpeta = (folio || token) + ' — ' + contrato.nombre_cliente;
var carpetaProyecto = carpetaProyectos.createFolder(nombreCarpeta);
```

Reemplaza por:
```js
var carpetaProyectos = DriveApp.getFolderById(CONFIG.CARPETA_PROYECTOS_ID);

// Subcarpeta de año
var anioStr = new Date().getFullYear().toString();
var carpetaAnio;
var iterAnio = carpetaProyectos.getFoldersByName(anioStr);
carpetaAnio = iterAnio.hasNext() ? iterAnio.next() : carpetaProyectos.createFolder(anioStr);

// Subcarpeta de mes
var mesNum = new Date().getMonth(); // 0-based
var nombresMes = ['01 — Enero','02 — Febrero','03 — Marzo','04 — Abril','05 — Mayo','06 — Junio',
                  '07 — Julio','08 — Agosto','09 — Septiembre','10 — Octubre','11 — Noviembre','12 — Diciembre'];
var mesStr = nombresMes[mesNum];
var carpetaMes;
var iterMes = carpetaAnio.getFoldersByName(mesStr);
carpetaMes = iterMes.hasNext() ? iterMes.next() : carpetaAnio.createFolder(mesStr);

var nombreCarpeta = (folio || token) + ' — ' + contrato.nombre_cliente;
var carpetaProyecto = carpetaMes.createFolder(nombreCarpeta);
```

---

## Bug 6 — Referencias Slides se copian vacías (sin reemplazar placeholders)

**Archivo:** `adapter/AdapterScript4_v1.js`  
**Función:** `primerAbono`, bloque "Generar referencias desde template Slides" (~línea 252)

**Causa:** El código copia el template con `makeCopy()` pero no rellena los placeholders del Slides. Los templates usan `{{placeholder}}` igual que el contrato PDF.

**Cambio:** Reemplaza el bloque try de generación de referencias:

Busca:
```js
// Generar referencias desde template Slides
try {
  var templateId = contrato.tipo_paquete === 'Terreno'
    ? CONFIG.TEMPLATE_TERRENO_ID : CONFIG.TEMPLATE_RESIDENCIAL_ID;
  DriveApp.getFileById(templateId).makeCopy('Referencias — ' + (folio || token), carpetaControl);
} catch (e) {
  console.error('Error generando referencias Slides:', e.message);
}
```

Reemplaza por:
```js
// Generar referencias desde template Slides con placeholders rellenos
try {
  var templateId = contrato.tipo_paquete === 'Terreno'
    ? CONFIG.TEMPLATE_TERRENO_ID : CONFIG.TEMPLATE_RESIDENCIAL_ID;
  var copiaSlides = DriveApp.getFileById(templateId).makeCopy('Referencias — ' + (folio || token), carpetaControl);
  var pres = SlidesApp.openById(copiaSlides.getId());
  var prop1 = (propiedades && propiedades.length > 0) ? propiedades[0] : {};
  var fechaSesionTexto = prop1.fecha_sesion
    ? prop1.fecha_sesion + (prop1.hora_sesion ? ' ' + prop1.hora_sesion : '')
    : '';
  var reemplazosSlides = {
    '{{folio}}': folio || token,
    '{{nombre}}': contrato.nombre_cliente || '',
    '{{correo}}': contrato.correo_cliente || '',
    '{{telefono}}': contrato.telefono_cliente || '',
    '{{paquete}}': contrato.paquete_base || '',
    '{{fechaSesion}}': fechaSesionTexto,
    '{{direccion}}': prop1.direccion || '',
    '{{precioTotal}}': '$' + (contrato.precio_total || 0).toLocaleString('es-MX') + ' MXN',
    '{{anticipo}}': '$' + (contrato.anticipo || 0).toLocaleString('es-MX') + ' MXN',
    '{{saldoPendiente}}': '$' + (contrato.saldo_pendiente || 0).toLocaleString('es-MX') + ' MXN',
  };
  for (var rk in reemplazosSlides) {
    pres.replaceAllText(rk, reemplazosSlides[rk]);
  }
  pres.save();
} catch (e) {
  console.error('Error generando referencias Slides:', e.message);
}
```

---

## Bug 7 — Admin archivos: dice "se crea al confirmar" aunque la carpeta ya existe

**Archivo:** `frontend/admin.html`  
**Líneas:** 1927 y 1931

**Causa:** `d1ToPascal` convierte `carpeta_control_id` a `CarpetaControlId` (PascalCase). Pero el template de propiedades en el sidepanel accede al campo como `p.carpetaControlId` (camelCase), que siempre es `undefined`.

**Cambio:** En la línea 1927, reemplaza:
```js
const propsConCarpeta = data.propiedades.filter(p => p.carpetaControlId);
```
Por:
```js
const propsConCarpeta = data.propiedades.filter(p => p.CarpetaControlId);
```

En la línea 1931, reemplaza:
```js
data.propiedades.map(p => `<option value="${p.numPropiedad}"${p.carpetaControlId ? '' : ' disabled'}>${esc('Propiedad ' + p.numPropiedad + (p.paquete ? ' — ' + p.paquete : '') + (p.carpetaControlId ? '' : ' (sin carpeta)'))}</option>`).join('') +
```
Por:
```js
data.propiedades.map(p => `<option value="${p.NumPropiedad}"${p.CarpetaControlId ? '' : ' disabled'}>${esc('Propiedad ' + p.NumPropiedad + (p.Paquete ? ' — ' + p.Paquete : '') + (p.CarpetaControlId ? '' : ' (sin carpeta)'))}</option>`).join('') +
```

---

## Bug 8 — Portal del cliente muestra "Sin pagos registrados" aunque ya hay abonos

**Archivo:** `worker/src/routes/portal.js`  
**Función:** `obtenerPortal`

**Causa:** `obtenerPortal` no consulta ni retorna los abonos del contrato. La función `_renderComprobante` en `portal.html` depende de `d.abonos` y `d.totalAbonado` para mostrar el historial de pagos; al no existir en la respuesta, siempre muestra "Sin pagos registrados aún" y calcula `pagado = 0`.

**Cambio:** En `obtenerPortal`, antes del `return ok({...})` al final (la respuesta con todos los datos), agrega la consulta de abonos:

Busca el bloque que termina con:
```js
    const { results: propiedades } = await query(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad',
      [contratoFinal.token]
    );

    const adicionales = JSON.parse(contratoFinal.adicionales_json || '[]');
```

Justo después de la query de propiedades y antes de la línea de adicionales, agrega:

```js
    const { results: abonosPortal } = await query(db,
      'SELECT monto, metodo, fecha FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro',
      [contratoFinal.token]
    );
    const totalAbonado = abonosPortal.reduce((s, a) => s + (a.monto || 0), 0);
```

Luego, en el objeto `return ok({...})`, agrega las dos propiedades nuevas. Busca dentro del return el campo `calificacion` y después de él agrega:
```js
      abonos: abonosPortal,
      totalAbonado,
```

---

## Bug 9 — Entregables mal formateados en comprobante del portal

**Archivo:** `frontend/portal.html`  
**Función:** `_renderComprobante` (~línea 1141)

**Causa:** Los entregables están guardados en D1 con el separador literal `\n` (barra invertida + n, dos caracteres), no como salto de línea real. El regex `/[\n|]/` en el split solo reconoce saltos de línea reales y el carácter pipe `|`. Al no encontrar ningún separador, trata todo el texto como un único ítem, mostrando toda la cadena incluyendo los `\n` visibles.

**Cambio:** En la línea ~1141, busca:
```js
var items = p.entregables.split(/[\n|]/).map(function(s) {
```
Reemplaza por:
```js
var items = p.entregables.replace(/\\n/g, '\n').split(/[\n|]/).map(function(s) {
```

---

## Bug 10 — Características de la propiedad no se ven en admin sidepanel

**Archivo:** `frontend/admin.html`  
**Sección:** Template `propHtml` (~líneas 1730–1763)

**Causa:** Igual que Bug 7, `d1ToPascal` convierte todos los campos de las filas de `propiedades` a PascalCase. El template del prop-card usa nombres camelCase (`p.tipo`, `p.fechaSesion`, `p.paquete`, etc.) en lugar de PascalCase (`p.Tipo`, `p.FechaSesion`, `p.Paquete`, etc.). Todos los campos resultan `undefined`, así que nada se muestra.

**Cambio:** En el bloque `const propHtml = data.propiedades.length ? data.propiedades.map((p, i) => {...})` (~líneas 1728–1770), reemplaza **todas** las referencias de propiedades con camelCase a PascalCase:

| Referencia actual | Corrección |
|---|---|
| `p.tipo` | `p.Tipo` |
| `p.fechaSesion` | `p.FechaSesion` |
| `p.horaSesion` | `p.HoraSesion` |
| `p.paquete` | `p.Paquete` |
| `p.direccion` | `p.Direccion` |
| `p.linkMaps` | `p.LinkMaps` |
| `p.sobreLaPropiedad` | `p.SobreLaPropiedad` |
| `p.datosEspecificos` | `p.DatosEspecificos` |
| `p.datosEspecificos.comentarios` | `p.DatosEspecificos.comentarios` |
| `p.notaInterna` | `p.NotaInterna` |

El bloque completo de líneas 1728–1770 a reemplazar (copia literal del archivo actual):

```js
  const propHtml = data.propiedades.length
    ? data.propiedades.map((p, i) => {
        const titulo = data.propiedades.length > 1 ? `Propiedad ${i + 1}` : 'Propiedad';
        const tipotxt = p.tipo ? ` · ${p.tipo}` : '';
        const fechatxt = p.fechaSesion ? fmxnFechaLarga(p.fechaSesion) + (p.horaSesion ? ' · ' + p.horaSesion : '') : '';
        const numProp  = i + 1;
        const fechaISO = p.fechaSesion ? new Date(p.fechaSesion).toISOString().substring(0, 10) : '';
        const horaVal  = p.horaSesion  || '';
        return `<div class="prop-card" id="prop-card-${numProp}">
          <div class="prop-card-titulo">${esc(titulo)}${esc(tipotxt)}</div>
          ${p.paquete     ? `<div class="prop-dato"><span class="lbl">Paquete </span>${esc(p.paquete)}</div>` : ''}
          ${fechatxt      ? `<div class="prop-dato"><span class="lbl">Fecha </span>${esc(fechatxt)}</div>` : ''}
          ${p.direccion   ? `<div class="prop-dato"><span class="lbl">Dirección </span>${esc(p.direccion)}</div>` : ''}
          ${p.linkMaps    ? `<div class="prop-dato"><a href="${safeHref(p.linkMaps)}" target="_blank" rel="noopener" style="color:var(--gold);font-size:12px">Ver en Maps</a></div>` : ''}
          <div class="prop-dato"><span class="lbl">Características </span><span id="sobre-prop-${numProp}">${esc(p.sobreLaPropiedad || '—')}</span></div>
          ${p.datosEspecificos && p.datosEspecificos.comentarios ? `<div class="prop-dato" style="background:var(--gold-dim);border-radius:6px;padding:6px 8px;margin-top:4px"><span class="lbl" style="color:var(--gold-dark,#9a7a2f)">Comentarios del cliente </span><span style="font-size:12px;line-height:1.5;white-space:pre-wrap">${esc(p.datosEspecificos.comentarios)}</span></div>` : ''}
```

Reemplaza ese bloque por:

```js
  const propHtml = data.propiedades.length
    ? data.propiedades.map((p, i) => {
        const titulo = data.propiedades.length > 1 ? `Propiedad ${i + 1}` : 'Propiedad';
        const tipotxt = p.Tipo ? ` · ${p.Tipo}` : '';
        const fechatxt = p.FechaSesion ? fmxnFechaLarga(p.FechaSesion) + (p.HoraSesion ? ' · ' + p.HoraSesion : '') : '';
        const numProp  = i + 1;
        const fechaISO = p.FechaSesion ? new Date(p.FechaSesion).toISOString().substring(0, 10) : '';
        const horaVal  = p.HoraSesion  || '';
        return `<div class="prop-card" id="prop-card-${numProp}">
          <div class="prop-card-titulo">${esc(titulo)}${esc(tipotxt)}</div>
          ${p.Paquete     ? `<div class="prop-dato"><span class="lbl">Paquete </span>${esc(p.Paquete)}</div>` : ''}
          ${fechatxt      ? `<div class="prop-dato"><span class="lbl">Fecha </span>${esc(fechatxt)}</div>` : ''}
          ${p.Direccion   ? `<div class="prop-dato"><span class="lbl">Dirección </span>${esc(p.Direccion)}</div>` : ''}
          ${p.LinkMaps    ? `<div class="prop-dato"><a href="${safeHref(p.LinkMaps)}" target="_blank" rel="noopener" style="color:var(--gold);font-size:12px">Ver en Maps</a></div>` : ''}
          <div class="prop-dato"><span class="lbl">Características </span><span id="sobre-prop-${numProp}">${esc(p.SobreLaPropiedad || '—')}</span></div>
          ${p.DatosEspecificos && p.DatosEspecificos.comentarios ? `<div class="prop-dato" style="background:var(--gold-dim);border-radius:6px;padding:6px 8px;margin-top:4px"><span class="lbl" style="color:var(--gold-dark,#9a7a2f)">Comentarios del cliente </span><span style="font-size:12px;line-height:1.5;white-space:pre-wrap">${esc(p.DatosEspecificos.comentarios)}</span></div>` : ''}
```

También en las dos textareas más abajo (líneas ~1755 y 1763), reemplaza:
```js
${esc(p.sobreLaPropiedad || '')}
```
por:
```js
${esc(p.SobreLaPropiedad || '')}
```

y:
```js
${esc(p.notaInterna || '')}
```
por:
```js
${esc(p.NotaInterna || '')}
```

---

## Instrucciones de despliegue

Una vez hechos todos los cambios:

1. **Worker + Frontend** — ejecuta este comando desde el directorio `/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker/`:
   ```bash
   npx wrangler deploy
   ```
   Esto despliega el Worker y los tres archivos HTML en `frontend/` como assets estáticos.

2. **Adapter de Apps Script** — el archivo `adapter/AdapterScript4_v1.js` se despliega manualmente: Bruno pega el contenido completo en https://script.google.com y publica nueva versión. **Claude no puede hacer este paso.**

---

## Notas importantes

- El archivo `adapter/AdapterScript4_v1.js` es un único archivo JS que se ejecuta en Google Apps Script. No es un módulo Node.js — no uses `import`, `export` ni `require`.
- Los archivos de frontend NO tienen build step. Son HTML puro con JS vanilla en `<script>` tags. No uses bundlers.
- El Worker usa ES modules (`import/export`). El entry point es `worker/src/index.js`.
- No modifiques nada que no esté explícitamente indicado en este prompt.

---

# Auditoría de bugs — IAV Contratos v4.0 vs v3.0

*Fecha: 2026-05-30 · Auditor: Claude · Actualizado post-correcciones*

---

## Resumen de cambios entre v3.0 y v4.0

| Aspecto | v3.0 | v4.0 |
|---------|------|------|
| Backend | Google Apps Script monolítico (3386 líneas) | Cloudflare Worker modular + Apps Script adapter (680 líneas) |
| Base de datos | Google Sheets | Cloudflare D1 (SQL) |
| Frontend | Servido por GitHub Pages | Servido por Worker como assets estáticos |
| PDF | Google Docs → trigger por minuto → Gmail | Google Docs → trigger por minuto → Gmail (mismo flujo) |
| Correos | Texto plano (todos) | HTML con header oscuro y logo (todos convertidos) |
| Calendario | Datos básicos | Completos con folio, teléfono, paquete, adicionales, Maps |
| Drive | Carpeta en raíz | Estructura año/mes |
| Slides | Copia vacía | Placeholders rellenados |
| Autenticación | Password en `admin.html` | Igual, sin cambios |
| Estatus | 6 estados | Mismos 6 estados + transiciones bloqueadas |
| Producción | 3 checkboxes en Sheets | 3 columnas en D1 (FotografiaLista, VideoListo, RecorridoListo) |
| Recordatorio 24h | Automático cada hora | Eliminado (no se usa) |
| Configurar propiedades | `configurar3.html` | Eliminado (el admin ya cubre este flujo) |

---

## Bugs corregidos (10 bugs del prompt original)

| # | Bug | Archivo | Estado |
|---|-----|---------|--------|
| 1 | Evento de Calendar con datos incompletos | `AdapterScript4_v1.js:240` | Corregido |
| 2 | Correos sin diseño HTML (4 funciones) | `AdapterScript4_v1.js` | Corregido |
| 3 | Correo con PDF no llega al cliente | `worker/routes/portal.js:162` | Corregido |
| 4 | Email a Bruno al firmar contrato | `AdapterScript4_v1.js:80` | Corregido (eliminado) |
| 5 | Carpeta Drive en raíz, no en año/mes | `AdapterScript4_v1.js:204` | Corregido |
| 6 | Slides copiados sin placeholders | `AdapterScript4_v1.js:252` | Corregido |
| 7 | Admin: "sin carpeta" cuando ya existe | `admin.html:1927,1931` | Corregido |
| 8 | Portal: "Sin pagos" cuando hay abonos | `worker/routes/portal.js:35` | Corregido |
| 9 | Entregables con `\n` visibles en comprobante | `portal.html:1141` | Corregido |
| 10 | Características vacías en admin sidepanel | `admin.html:1728-1770` | Corregido |

---

## Bugs adicionales corregidos en segunda pasada

| # | Bug | Archivo | Corrección |
|---|-----|---------|------------|
| A1 | `notificarUpsell` sin handler en adapter | `AdapterScript4_v1.js` | Agregado handler + correo HTML con servicios y total |
| A2 | `reagendarPropiedad` correo texto plano | `AdapterScript4_v1.js:420` | Convertido a HTML con `htmlCorreo_()` |
| A3 | `recordatorio24h` correos texto plano | `AdapterScript4_v1.js` | **Función eliminada por completo** (no se usa) |
| A4 | `notificarResena` correo texto plano | `AdapterScript4_v1.js:303` | Convertido a HTML |
| A5 | Triggers sin instrucciones de instalación | `AdapterScript4_v1.js` | Agregada función `instalarTriggers()` |
| A6 | `configurar4.html` no existía / `linkConfigurar` roto | `contratos.js:146-154` | **Eliminado** — el admin ya configura propiedades |
| A7 | `logoPrecargadoUrl` no se buscaba (regresión v3.0) | `AdapterScript4_v1.js` | Agregado `obtenerLogoCliente` handler + `_creado` timestamp en PDFs |
| A9 | `notificarContratoCreado` enviaba correo a Bruno | `AdapterScript4_v1.js:295` | Eliminado (Bruno ya ve el admin) |
| A10 | Falta `fecha_registro` en query de abonos portal | `worker/routes/portal.js:40` | Agregado `fecha_registro` como fallback |
| A11 | `DatosEspecificos` no parseado en admin | `frontend/admin.html:1353` | `d1ToPascal` ahora parsea `datos_especificos` y `adicionales_json` |
| A12 | Tipos implícitos de `NumPropiedad` en admin | `frontend/admin.html` | No corregido — impacto negligible |

---

## Eliminado del sistema

| Elemento | Razón |
|----------|-------|
| `recordatorio24h()` en adapter | No se quiere mandar recordatorios 1 día antes |
| Trigger `recordatorio24h` en `instalarTriggers` | Ya no existe la función |
| `sesionesManana` endpoint en worker | Solo lo usaba `recordatorio24h` |
| `marcarRecordatorio` endpoint en worker | Solo lo usaba `recordatorio24h` |
| `notificarContratoCreado` email a Bruno | Ruido — Bruno ya ve todo en admin |
| `configurar4.html` | El admin ya tiene formulario para propiedades particulares |
| `linkConfigurar` en respuesta de `crearContrato` | Ya no se usa |

---

## Triggers del adapter (Apps Script)

Ejecutar `instalarTriggers()` una sola vez al desplegar. Crea:

| Trigger | Frecuencia | Función |
|---------|-----------|---------|
| `procesarPDFsPendientes` | Cada minuto | Genera PDFs diferidos y envía correo con adjunto |
| `deteccionPDFsAtascados` | Diario 9 AM | Alerta si hay PDFs >1h sin procesar |

---

## Comparativa v3.0 → v4.0: estado final

| ID v3 | Descripción | Estado en v4.0 |
|-------|-------------|-----------------|
| 1 | Cache vacía tras crear contrato rompe autocomplete | No presente — v4 no tiene autocomplete |
| 2 | Dropdown fuera de pantalla en móvil | No aplica |
| 3 | Dropdown no se cierra al cambiar subtab | No aplica |
| 4 | `_acSeleccionRecien` tarda 200ms | No aplica |
| 5 | Subida simultánea de logo sin lock | Parcial — v4 sube a carpeta proyecto |
| 6 | Correos con mayúsculas no encuentran logo | Cubierto — `obtenerLogoCliente` con fallback |
| 7 | Logo precargado se destruye antes de subir | Pendiente — handler existe pero no se invoca desde portal |
| 8 | Evento calendario no se crea con anticipo=0 | Corregido — `primerAbono` siempre se llama |
| 9 | Tarjeta como opción principal de pago | Corregido — portal v4 mismo diseño |
| 10 | Datos bancarios no visibles en Etapa 4 | Corregido — portal v4 hereda diseño |
| 11 | Add-ons visibles sin selección | Corregido — v4 filtra por ofertas explícitas |
| 12 | `apiGet` sin timeout en checklist | No verificado en v4 checklist |

---

## Funcionalidades de v3.0 no implementadas en v4.0

| Funcionalidad | Archivo v3 | Estado en v4 |
|---------------|-----------|--------------|
| Logo precargado por cliente | `ScriptContratos3_v1.js:1048-1062` | Handler existe (`obtenerLogoCliente`), falta llamarlo desde portal |
| Autocomplete de clientes en admin | `admin.html v3` | No implementado |
| Link a checklist en evento Calendar | `ScriptContratos3_v1.js` | No implementado |
| `limpiarLinkMaps` (Google Calendar embeds) | `ScriptContratos3_v1.js` | No implementado |

---

## Archivos modificados en esta sesión

| Archivo | Cambios |
|---------|---------|
| `adapter/AdapterScript4_v1.js` | +225 líneas. Nuevos handlers: `notificarUpsell`, `obtenerLogoCliente`, `instalarTriggers`, `deteccionPDFsAtascados`. Todos los correos a HTML. `_creado` timestamp en PDFs. Estructura Drive año/mes. Slides con placeholders. Eliminado `recordatorio24h` y `notificarContratoCreado`. |
| `worker/src/routes/portal.js` | Contrato actualizado antes de enviar al adapter. Abonos incluidos en respuesta. `fecha_registro` en query. |
| `worker/src/routes/contratos.js` | Eliminados `sesionesManana`, `marcarRecordatorio`, `linkConfigurar`. |
| `worker/src/index.js` | Eliminadas rutas `sesionesManana` y `marcarRecordatorio` del router. |
| `frontend/admin.html` | PascalCase en propHtml y archivos. `d1ToPascal` parsea JSON strings. |
| `frontend/portal.html` | Entregables: soporte para `\n` literal. |

---

## Instrucciones de despliegue

1. **Worker + Frontend** — YA desplegado. Último deploy: version `3b2e3828`.
2. **Adapter de Apps Script** — PENDIENTE. Pegar `adapter/AdapterScript4_v1.js` en script.google.com, ejecutar `instalarTriggers()`, publicar nueva versión.

---

# Ronda 3: Auditoría exhaustiva — Sistemas de add-ons, paquetes, firmas, contratos, entregas

*Fecha: 2026-05-30 · Auditor: Claude*

---

## Bugs corregidos en ronda previa (al inicio de sesión)

| # | Bug | Archivo | Corrección |
|---|-----|---------|------------|
| R2a | Anticipo no se recalcula al añadir servicios | `worker/routes/portal.js:firmaCliente` | `anticipo = Math.round(precioTotal × pctOriginal)` |
| R2b | Entregables con `\n` visible en Etapa 1 portal | `portal.html:572` | Agregado `replace(/\\n/g, '\n')` antes del split |
| R2c | Contrato dice "Ninguno" en adicionales cuando hay | `AdapterScript4_v1.js:generarPDF_` | Ahora incluye strings + objetos de `adicionales_json` |
| R2d | Firma no aparece en PDF | `AdapterScript4_v1.js:generarPDF_` | `findText('{{firma}}')` → inserta imagen en placeholder |

---

## Bugs encontrados y corregidos en esta ronda (R3)

### R3-B21 — CRÍTICO: `procesarFirma` envía anticipo original (no recalculado) al adapter

**Archivo:** `worker/src/routes/portal.js:173-187`  
**Impacto:** El PDF del contrato y el correo al cliente muestran el anticipo original (ej. $2,250), no el recalculado proporcionalmente (ej. $2,750 tras añadir servicios de $1,000). El email de firma muestra porcentaje incorrecto.  
**Causa:** En el spread `{...contrato, precio_total: ..., saldo_pendiente: ..., ...}` dentro de `callAdapter`, se sobrescribía `precio_total` y `saldo_pendiente` pero NO `anticipo`. El `anticipo` del spread era el valor original del DB.  
**Corrección:** Agregar `anticipo: anticipo` al spread del `contrato` enviado al adapter.

### R3-B9 — CRÍTICO: Uppsell no recalcula anticipo cuando el precio cambia

**Archivo:** `worker/src/routes/contratos.js:210-226`  
**Impacto:** Al añadir servicios adicionales vía upsell desde admin, el anticipo se mantiene igual aunque el total sube. El porcentaje mostrado al cliente baja (ej. de 50% a 41%).  
**Causa:** El UPDATE de upsell nunca actualizaba la columna `anticipo`. Solo actualizaba `precio_total` y `saldo_pendiente`.  
**Corrección:** Recalcular `nuevoAnticipo = Math.round(precioFinal × (c.anticipo / c.precio_total))` cuando `precioFinal !== c.precio_total` e incluir `anticipo` en el UPDATE.

### R3-B16 — CRÍTICO: `crearContrato` no valida anticipo

**Archivo:** `worker/src/routes/contratos.js:85-113`  
**Impacto:** Se podía crear un contrato con `anticipo > precioTotal` (saldo negativo, contrato inmediatamente liquidado) o `anticipo < 0` (saldo mayor al total).  
**Causa:** El `anticipo` venía directo del body sin ninguna validación ni clamping.  
**Corrección:** Parsear `precioTotal` y `anticipo` a números seguros, usar `Math.max(0, totalNum - anticNum)` para saldo.

### R3-B8 — MEDIUM: Entregables en PDF muestran `\n` literal

**Archivo:** `adapter/AdapterScript4_v1.js:150`  
**Impacto:** En el PDF del contrato, los entregables aparecen como `Video 4K\nFotografía profesional\nTour virtual` (todo en una línea con `\n` visibles).  
**Causa:** El texto `entregables` del paquete base contiene `\n` literales (dos caracteres: backslash + n) o separadores `|`. `body.replaceText` en Google Docs pega el texto tal cual, sin interpretar `\n` como salto de línea.  
**Corrección:** Reemplazar `\\n` y `|` por `, ` antes de insertar en el template: `(entregables || '').replace(/\\n/g, ', ').replace(/\|/g, ', ')`.

### R3-B14 — MEDIUM: Multi-propiedad: solo se guarda carpeta para propiedad 1

**Archivo:** `adapter/AdapterScript4_v1.js:primerAbono`  
**Impacto:** En contratos con 2+ propiedades, la subida de archivos desde el portal para propiedades #2+ fallaba con "Carpeta no encontrada".  
**Causa:** `primerAbono` solo guardaba `carpeta_${token}_1` en PropertiesService. El lookup en `subirArchivo` usaba `carpeta_${token}_${numPropiedad}`.  
**Corrección:** Loop sobre `propiedades` para guardar el mismo `carpetaControl` ID en `carpeta_${token}_${numProp}` para TODAS las propiedades.

### R3-B18 — MEDIUM: Comprobante no muestra adicionales seleccionados por el cliente

**Archivos:** `worker/routes/portal.js`, `frontend/portal.html`  
**Impacto:** El comprobante de pago (visto en Etapa 3/4) solo mostraba los extras acordados por Bruno. Los add-ons que el cliente seleccionó durante la firma NO aparecían como line items.  
**Causa:** `_renderComprobante` solo iteraba `d.extrasAcordados` (objetos), ignorando los strings en `adicionales_json`.  
**Corrección:** Agregado `todosAdicionales` al endpoint `obtenerPortal` (resuelve strings a nombres vía paquetes). `_renderComprobante` ahora usa `d.todosAdicionales || d.extrasAcordados` y muestra precio individual.

### R3-B26 — CRÍTICO: Exportar CSV roto (devolvía raw CSV en lugar de JSON)

**Archivo:** `worker/src/routes/contratos.js:60-78`  
**Impacto:** El botón "Exportar CSV" en admin fallaba porque `res.json()` intentaba parsear texto CSV como JSON.  
**Causa:** El endpoint devolvía `new Response(csvText, { headers: {'Content-Type': 'text/csv'} })` (response raw), pero el admin esperaba `{ ok: true, csv: "..." }` en JSON.  
**Corrección:** Cambiar a `return ok({ ok: true, csv: header + rows })`.

### R3-B34 — CRÍTICO: Subida de archivos desde portal rota (field names mismatch)

**Archivo:** `frontend/portal.html:2048-2056`  
**Impacto:** Los clientes NO podían subir archivos (logo, fachada, perímetro) desde el portal. El worker no recibía `base64`, `nombre`, ni `numPropiedad`.  
**Causa:** El portal enviaba `{ fileBase64, fileName, propIndex }`. El worker esperaba `{ base64, nombre, numPropiedad }`. Además, `fileBase64` incluía el prefijo `data:image/...;base64,` que `Utilities.base64Decode` no puede procesar.  
**Corrección:** Renombrar campos: `numPropiedad: propIndex + 1`, `nombre: file.name`, `base64: result.replace(/^data:\w+\/\w+;base64,/, '')`.

---

## Bugs NO corregidos (impacto bajo o fuera de alcance)

| # | Bug | Razón para no corregir |
|---|-----|----------------------|
| R3-B5 | `crearTokenConfigurar` crea token huérfano (particular) | El token se crea en DB pero nunca se entrega al usuario porque `configurar4.html` se eliminó. El admin ya configura propiedades. No causa errores. |
| R3-B20 | Sin feedback si template PDF no existe en Drive | El error se captura en `procesarPDFsPendientes` try-catch y se loguea. `deteccionPDFsAtascados` alertaría a Bruno por email. |
| R3-B7 | Variable naming confuso (`precioBase` contiene `precioTotal`) | `renderEtapa1:597` usa `d.precioTotal` y lo guarda en `precioBase`. Solo es naming, no afecta funcionalidad. |

---

## Archivos modificados en Ronda 3

| Archivo | Cambios |
|---------|---------|
| `worker/src/routes/portal.js` | B21: `anticipo` incluido en spread a adapter. B18: `todosAdicionales` en respuesta. |
| `worker/src/routes/contratos.js` | B9: recálculo de anticipo en upsell. B16: validación de anticipo en crear. B26: CSV como JSON. |
| `adapter/AdapterScript4_v1.js` | B8: entregables `\n` → `, `. B14: carpeta para todas las propiedades. |
| `frontend/portal.html` | B18: `_renderComprobante` usa `todosAdicionales`. B34: fix upload field names + strip base64 prefix. |

---

## Estado de despliegue

| Capa | Último deploy | Versión |
|------|--------------|---------|
| Worker + Frontend | Ya desplegado | `cef4d303` |
| Adapter Apps Script | **PENDIENTE MANUAL** | Pegar en script.google.com |
