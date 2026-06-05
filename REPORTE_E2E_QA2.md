# Reporte E2E exhaustivo — Sistema de contratos IAV (corrida QA2)

Fecha: 2026-06-04 · Entorno: **producción** (`contratos.inmueblesaudiovisuales.com`)
Namespace de prueba: correos `inmueblesaudiovisuales+qa2cN@gmail.com`, nombres `ZZ QA2 C0N …`
(namespace propio para no colisionar con datos remanentes `+cliente1..4` de una corrida previa).

## Resumen ejecutivo
Se ejecutaron los **12 escenarios** de la matriz, uno por uno, contra producción, cubriendo **cada paquete**
(RES-COMBO, TER-COMBO, IND-FOTO, IND-VIDEO, IND-360, multi-propiedad y mixto) y **las 4 situaciones de pago**
(A sin anticipo, B reservar sin pago, C abono/anticipo, D pago total), verificando Drive, Calendar y Gmail en cada paso.

**Lo más importante (lo que pediste verificar primero) está BIEN:** un contrato nuevo crea **UNA sola** carpeta
de proyecto con UNA "Control Interno" y UNA "Entregables", y firmar **no** duplica carpetas (las 12 carpetas son
únicas). El **modelo de saldo** es correcto en todos los casos (anticipo es solo sugerido; el saldo solo baja con
abonos reales; firmar/reservar no tocan el saldo). La **aritmética de montos y saldos** fue exacta en admin, portal
y correos en los 12 escenarios.

**Problemas serios encontrados (detalle en HALLAZGOS):**
1. **H-A2 (Alto):** el enlace al portal está **corrompido en TODOS los correos** → el botón principal no abre el portal.
2. **H-A1 (Alto):** el **correo de firma con PDF no se entregó en NINGUNO** de los 12 contratos (el PDF sí se generó).
3. **H-A3 (Alto):** `permitirExceso` registra sobrepago pero **no sube el precio**, aunque el admin promete que sí
   → comprobante con "pagado > total".
4. **H-M1/H-M2 (Medio):** evento "Reservado —" redundante con texto falso; nombre sin escapar en correos.

## Mapeo de escenarios → cliente/correo/token/folio
| # | Nombre | Correo | Folio | Token |
|---|---|---|---|---|
| 1 | ZZ QA2 C01 Residencial | +qa2c1 | IAV-2607.15-A | dd68699d-766f-4161-aed6-32695c99a60b |
| 2 | ZZ QA2 C02 Terreno | +qa2c2 | IAV-2607.20-A | 26f86047-0349-4b0e-939d-fda90ae4e838 |
| 3 | ZZ QA2 C03 FotoSinAnticipo | +qa2c3 | IAV-2607.25-A | 3b1b75c5-4162-446f-a606-e8c50030e41b |
| 4 | ZZ QA2 C04 VideoPagoTotal | +qa2c4 | IAV-2607.27-A | 18ab81be-4488-43cd-a620-60f646f44222 |
| 5 | ZZ QA2 C05 Recorrido360 | +qa2c5 | IAV-2607.30-A | 942e1102-aac0-474b-9975-0c734a136b9d |
| 6 | ZZ QA2 C06 AdicCliente | +qa2c6 | IAV-2608.03-A | cd25f0e3-94ff-4fd6-8c0d-a5beaa966506 |
| 7 | ZZ QA2 C07 Upsell | +qa2c7 | IAV-2608.05-A | 80f57b2d-bbe7-4a8a-8224-91ffb96d0132 |

---

## HALLAZGOS

### CRÍTICO / ALTO
- **H-A2 · El enlace al portal está CORROMPIDO en TODOS los correos transaccionales → el botón no abre el portal.**
  En cada correo (abono y entrega confirmados; el patrón aplica a todos los que usan `linkPortal`), el href
  del botón "VER MI COMPROBANTE" / "Descargar material" sale como
  `https://contratos.inmueblesaudiovisuales.com/portal.html?token<basura>…` en lugar de `?token=<token>`.
  Patrón EXACTO y reproducible: se colapsan `=` + los **2 primeros caracteres del token** en 1 solo byte
  (a veces el carácter de reemplazo `�`).
  Evidencia: C01 `dd68699d…`→`?token�68699d…` (`=dd`→`�`); C05 `942e1102…`→`?token�2e1102…` (`=94`→`�`);
  C12 `65225a27…`→`?tokene225a27…` (`=65`→`e`). Aparece igual en el htmlBody y en el cuerpo de **texto plano**
  (que el adapter arma con `body.linkPortal`). El cliente que da clic NO llega a su portal.
  Acotación de causa: el MISMO token sobrevive intacto en el nombre de la carpeta de Drive (que también pasa
  por worker→adapter), así que NO es el transporte; la corrupción está en la ruta de armado/envío del correo
  (`htmlCorreo_`/GmailApp/cómo se pasa `linkPortal`). El link de WhatsApp (constante del adapter) sí está intacto.
  Impacto: el CTA principal de cada correo está roto para todos los clientes.
  _Nota de verificación: la evidencia proviene de leer los mensajes vía la API de Gmail (htmlBody y plaintextBody);
  la corrupción es consistente y reproducible en 4+ correos, pero conviene confirmarla abriendo un correo recibido
  en un cliente real (Gmail web/app) y dando clic al botón._
- **H-A1 · El correo de firma "Tu contrato firmado — <folio>" (con PDF adjunto) NO se entrega para NINGÚN
  contrato de la corrida.** Los **12** contratos QA2 generaron y ligaron su PDF (`pdf_contrato_url` set, PDF en
  Drive), pero **0** correos de firma llegaron. (El mecanismo SÍ funcionó hoy para contratos viejos/remanentes
  IAV-2606.x, así que no está "muerto" — falló para todo el lote QA2.) Como el PDF se genera ANTES del envío,
  el fallo está en `enviarCorreoConPDF_`, cuyo único paso extra es adjuntar `UrlFetchApp.fetch(pdfUrl)` con la
  URL de **vista** de Drive (`/view?usp=drivesdk`, no descarga directa). Si ese fetch lanza (o agota cuota de
  UrlFetchApp/Gmail tras muchas pruebas), no se envía y `procesarPDFsPendientes` reintenta sin éxito (el PDF ya
  está cacheado, nunca se regenera). Impacto: el cliente nunca recibe su copia firmada por correo.
- **H-A3 · `permitirExceso` acepta el sobrepago pero NO sube `precio_total`; el admin promete lo contrario.**
  Con `permitirExceso:true`, un abono mayor al saldo se registra, marca Completado y deja `saldo=0`, pero
  `precio_total` no cambia → queda `totalAbonado ($5000) > precio_total ($4500)`. El modal del admin
  (`mostrarModalExceso`) dice textualmente "**Si subes el precio del contrato a $5,000 … El portal del cliente
  reflejará el nuevo total**", pero el botón confirmar llama a `registrarAbono({permitirExceso:true})`, que NO
  sube el precio. El comprobante del cliente muestra "Total del servicio $4,500 / Total pagado $5,000"
  (contradictorio). Para subir el precio realmente hay que usar Upsell (`nuevoPrecioTotal`), un flujo aparte.

### MEDIO
- **H-M1 · Evento de Calendar "Reservado — <nombre>" redundante y con texto fijo engañoso.**
  Al registrar el primer abono (o `reservarContrato`), `crearEventoReservado` crea un evento APARTE en
  la fecha de HOY (30 min) con descripción fija **"Primer abono recibido. Sesión por agendar."**.
  Pero la sesión real ya tiene su evento con fecha correcta (creado en `procesarFirma`). Resultado:
  dos eventos por contrato, uno de ellos en el día de hoy diciendo "Sesión por agendar" cuando ya está
  agendada → contradictorio. En la situación B (Esc. 2, reservar SIN pago) se CONFIRMÓ que el texto dice
  "Primer abono recibido" aunque NO hubo abono → factualmente falso.
- **H-M2 · El nombre del cliente se inyecta SIN escapar en el HTML de los correos.**
  En `htmlCorreo_`/`enviarCorreoAbono` (y demás correos del adapter) el `nombre_cliente` se concatena directo
  al htmlBody. Con nombre `…Ávila <b>Tëst</b> & 'comillas'…` el `<b>` renderiza como negrita y el `&` queda
  crudo. El portal SÍ escapa el nombre (verificado, sin XSS); los correos NO → vector de inyección HTML en
  correos salientes. Mitigado (el nombre lo fija admin/cliente y los clientes de correo sanitizan lo peligroso),
  pero inconsistente; se corrige escapando el nombre antes de interpolarlo.

### BAJO / NOTA
- **H-N1 · Separador "IA" en el título del evento de Calendar.** El título es
  `<folio> IA <nombre> — <paquete>` (p. ej. "IAV-2607.15-A IA ZZ QA2 C01 …"). El "IA" suelto se ve
  como typo (¿"IAV"?). Cosmético.
- **H-N2 · `subirArchivoAdmin` sube SIEMPRE a "Control Interno"**, incluso para material de entrega;
  no hay forma de subir directo a "Entregables" desde ese endpoint. El archivo de entrega del Esc. 1
  quedó en Control Interno. Menor (la entrega real se referencia por link).
- **H-N3 · Correo de abono usa plantilla "Tu sesión está apartada / recibimos tu pago, tu fecha queda
  confirmada" para TODO primer abono**, incluso cuando ese único pago es el TOTAL que completa el
  contrato (situaciones D y A) o cuando el material ya fue entregado. El asunto y encabezado quedan
  incongruentes (la sesión ya pasó / el contrato ya está Completado). Los montos sí son correctos
  (saldo $0). La plantilla solo distingue primer vs. no-primer abono, no "abono que liquida".
- **H-N4 · Emoji (4 bytes) se corrompe (mojibake) en los correos.** En el correo del Esc. 12 el emoji 🎬 del
  nombre sale como "������" tanto en htmlBody como en texto plano. Los acentos/ñ/m² SÍ se ven bien; solo los
  caracteres astrales de 4 bytes se rompen. El MISMO emoji se conserva correcto en el nombre de la carpeta de
  Drive → la corrupción es específica de la ruta del correo. Cosmético (los clientes rara vez ponen emoji en el nombre).
- **H-N5 · Reactivar a "Pendiente firma" un contrato ya firmado conserva `fecha_firma`.** (Esc. 11) Tras
  Cancelar→reactivar, el contrato vuelve a 'Pendiente firma' pero mantiene firma/fecha_firma; como `firmaCliente`
  solo exige estatus 'Pendiente firma', el cliente podría re-firmar y re-disparar procesarFirma (otro evento/PDF).
  Edge de bajo riesgo (requiere `forzar`).
- **Favicon 404 en consola del portal**: único "error" de consola observado; es artefacto del server local
  (sin favicon), NO un bug del sistema.

---

## BITÁCORA POR ESCENARIO

### Escenario 1 — +qa2c1 · RES-COMBO · Situación C (abono anticipo) · CICLO COMPLETO
- **Crear**: cliente+trabajo+contrato. Folio IAV-2607.15-A, total $4500, anticipo sugerido $2250, saldo $4500.
  - ✓ Drive: UNA sola carpeta de proyecto `IAV-2607.15-A — ZZ QA2 C01 Residencial` con UNA "Control Interno" y UNA "Entregables" (fix de dedup OK en creación).
- **Firma** (subió logo rojo + fachada verde, luego firmaCliente):
  - ✓ Estatus Firmado; **saldo se mantiene en $4500** (modelo de saldo correcto: firmar no abona).
  - ✓ Drive: NO se duplicó carpeta; Control Interno con logo.png, fachada.png y "…- Referencias.pdf" (datos correctos).
  - ✓ Calendar: evento sesión 15-jul 11:00–13:00, título/desc correctos, location=maps.
  - ✓ pdf_contrato_url quedó ligado.
  - ✗ **Correo de firma NO llegó** (ver H-A1).
- **Abono anticipo $2250** → saldo $2250, Reservado.
  - ✓ Correo "Tu sesión está apartada — IAV-2607.15-A" (pago $2250, total $2250, saldo $2250).
  - ⚠ Evento "Reservado —" extra hoy (ver H-M1).
- **marcarSesionCompletada** → En produccion ✓.
- **Entrega** (subió entrega-final azul vía admin; guardarEntrega con link a Entregables) → Entregado (saldo>0) ✓.
  - ✓ Correo "Tu material está listo — IAV-2607.15-A".
- **Pago final $2250** → saldo $0, Completado ✓.
  - ✓ Correo "Confirmación de pago — IAV-2607.15-A" (Tarjeta $2250, total $4500, saldo $0).
- **Reseña 5★** guardada ✓; correo "Nueva reseña — 5/5" a Bruno ✓.
- Total correos al cliente esperados: firma, abono, entrega, confirmación = 4; **recibidos 3** (falta firma).

### Escenario 2 — +qa2c2 · TER-COMBO x2 · Situación B (reservar SIN pago) · acceso/caseta · reagendar
- **Crear**: 2 propiedades Terreno, precio auto **$8000** ✓. Folio IAV-2607.20-A.
- **Firma** (logo/fachada por prop; datos de caseta/acceso en prop 1):
  - ✓ Firmado, **saldo $8000** (intacto).
  - ✓ `obtenerEquipo`: prop 1 `requiereAcceso=1` con `datosAcceso` completo (caseta/código/contacto/instrucciones); prop 2 `requiereAcceso=0`, `datosAcceso=null`.
  - ✓ Calendar: 2 eventos de sesión (20-jul 09:00 prop1, 22-jul 12:00 prop2), descripciones correctas. (Los datos de caseta NO van en la descripción del evento; viven en el portal de equipo — aceptable.)
  - ✗ Correo de firma NO llegó (2ª confirmación de H-A1).
- **reservarContrato (sin abono)** → Reservado, **saldo $8000 intacto** ✓.
  - ⚠ Evento "Reservado — ZZ QA2 C02 Terreno" creado hoy con texto **"Primer abono recibido. Sesión por agendar."** — FALSO, no hubo abono (confirma y agrava H-M1).
  - ✓ Portal: "**Tu fecha está apartada · Realiza tu pago para confirmar**", Total pagado $0, Saldo $8000, "Sin pagos registrados aún". Ningún texto afirma pago.
- **reagendarPropiedad (prop 2 → 28-jul 16:00)**:
  - ✓ Evento de prop2 actualizado EN SITIO a 28-jul 16:00–18:00 (mismo id, sin duplicar).
  - ✓ Correo "Reagendamiento de sesión — IAV-2607.20-A" con nueva fecha.
  - ✓ Folio sin cambios (solo prop1 lo cambiaría). Portal refleja prop2=28-jul.

### Escenario 3 — +qa2c3 · IND-FOTO · Situación A (sin anticipo)
- **Crear** con anticipo $0; total $3000, saldo $3000. Folio IAV-2607.25-A.
- **Firma** → Firmado, anticipo 0, saldo $3000. ✗ correo de firma no llegó (H-A1, 3ª vez).
- **reservarContrato sin abono** → Reservado, saldo $3000 intacto. ✓
  - ✓ Portal: "Tu fecha está apartada", Total pagado $0, sin afirmaciones de pago.
  - ✓ Gmail +qa2c3 VACÍO hasta aquí (ningún correo afirma pago).
- **Entrega + pago total $3000** → Entregado → Completado, saldo $0. ✓
  - ✓ Correos "Tu material está listo" y abono (Efectivo $3000, total $3000, saldo $0). (Abono usa plantilla H-N3.)

### Escenario 4 — +qa2c4 · IND-VIDEO · Situación D (pago total al inicio)
- **Crear** anticipo 100% ($3000); **Firma**; **registrarAbono $3000** → **Completado directo**, saldo $0. ✓
- ✓ NO se creó evento "Reservado —" (pasó directo a Completado, `seActivaReservado=false`).
- ✓ El evento de sesión (27-jul) sí existe (creado en firma).
- **Entrega** (ya Completado) → sigue Completado, link guardado, correo entrega enviado. ✓
- ✓ Correos: "Tu material está listo" + abono (Transferencia $3000, total $3000, saldo $0). ✗ sin firma (H-A1).
- Abono con plantilla H-N3 (encabezado "apartada" pese a ser pago liquidador).

### Escenario 5 — +qa2c5 · IND-360 · Situación C con abonos parciales
- Total $3000. Firma. Abonos: $1000 → $1000 → (entrega) → $1000. Saldo: 3000→2000→1000→0.
- ✓ Estatus: Reservado (a1) → Reservado (a2) → Entregado (entrega) → Completado (a3).
- ✓ Correos con totales corrientes EXACTOS:
  - a1 "Tu sesión está apartada" Transferencia $1000, total $1000, saldo $2000.
  - a2 "Confirmación de pago" Efectivo $1000, total $2000, saldo $1000.
  - entrega "Tu material está listo".
  - a3 "Confirmación de pago" Tarjeta $1000, total $3000, saldo $0.
- ✗ sin correo de firma (H-A1). El historial de pagos y la aritmética de saldo son correctos en cada paso.

### Escenario 6 — +qa2c6 · RES-COMBO · Adicionales elegidos por el cliente en el portal
- Crear ofreciendo ADD-COMOLLEGAR + ADD-LANDING (no suman al precio hasta aceptar). Total inicial $4500.
- ✓ Portal: `paquetesDisponibles` muestra los 2 ofrecidos con precio (1000, 1200); precioTotal $4500, saldo $4500 antes de firmar.
- ✓ Firma seleccionando ambos → **precio $6700, saldo $6700** (4500+1000+1200), adicionales_json correcto.
- ✓ Abono anticipo $2250 → saldo $4450, Reservado.

### Escenario 7 — +qa2c7 · TER-COMBO · Upsell DESPUÉS de firmar
- Crear $4000, firma, abono anticipo $2000 → saldo $2000, Reservado.
- ✓ `actualizarContratoUpsell` (+ADD-FOLLETO $800 + servicio libre "Edicion extendida" $1500, notificarCliente):
  precio **$4000→$6300**, saldo **$4300** (6300−2000 abonado), estatus Reservado. adicionales_json = ["ADD-FOLLETO",{nombre,precio:1500}].
- ✓ Correo "Servicios actualizados — IAV-2608.05-A": lista "Adicional: Folleto digital PDF" + "Edicion extendida (+$1500)", "Nuevo total $6300", "Saldo pendiente $4300".

### Escenario 8 — +qa2c8 · RES-COMBO + TER-COMBO · Multi-propiedad MIXTA
- Crear 2 props mixtas: prop1 Residencial (RES-COMBO), prop2 Terreno (TER-COMBO). Total **$8500** ✓.
- ✓ `obtenerEquipo`: prop1 tipo=Residencial/Paquete Residencial/formato vertical; prop2 tipo=Terreno/Paquete Terreno/formato horizontal. Tipos correctamente diferenciados por propiedad.
- ✓ Calendar: 2 eventos con su tipo/paquete correcto — "…— Paquete Residencial" (7-ago 10:00) y "…— Paquete Terreno" (9-ago 14:00). (El 1er query mostró 1 por lag de indexación; el 2º confirmó ambos.)
- ✓ Abono anticipo $4250 → saldo $4250, Reservado.

### Escenario 9 — +qa2c9 · IND-FOTO · 100% anticipo
- Crear con anticipo $3000 (100%). **Tras crear**: anticipo $3000, **saldo $3000** (NO reducido). **Tras firmar**: **saldo $3000** (intacto). **Tras pagar $3000**: saldo $0, Completado.
- ✓ Demuestra el modelo de saldo: el saldo fue el precio completo hasta el pago real, aun con anticipo 100%.

### Escenario 10 — +qa2c10 · RES-COMBO · Edge de pagos (exceso)
- Firmado, saldo $4500.
- **Abono $5000 SIN permitirExceso** → BLOQUEADO: HTTP 400, `codigoError:EXCEDE_SALDO`, saldoActual 4500, nuevoPrecioPropuesto 5000. Saldo intacto. ✓
- **Abono $5000 CON permitirExceso:true** → aceptado: Completado, saldo $0, totalAbonado **$5000**, pero **precio_total se queda en $4500** (NO sube). Ver **H-A3**.
- ✓ Portal del cliente muestra "Total del servicio $4,500" y "Total pagado $5,000" (pagó más que el total → comprobante contradictorio).

### Escenario 11 — +qa2c11 · TER-COMBO · Cancelar y reactivar
- Firmado → **actualizarEstatus 'Cancelado' forzar** → Cancelado (portal muestra Cancelado) ✓.
- → **actualizarEstatus 'Pendiente firma' forzar** → Pendiente firma (portal muestra Pendiente firma) ✓; aparece en listarContratos(todos).
- ⚠ Nota H-N5: reactivar a "Pendiente firma" un contrato ya firmado conserva `fecha_firma`; `firmaCliente` exige estatus 'Pendiente firma', así que el cliente podría **re-firmar** y re-disparar procesarFirma (otro evento/PDF). Riesgo bajo/edge.

### Escenario 12 — +qa2c12 · IND-VIDEO · Acentos, ñ, especiales y emoji
- Nombre: `ZZ QA2 C12 Niño Muñoz Ávila <b>Tëst</b> & 'comillas' 🎬`; dirección `Calle Ñandú #3, Col. Peña Güemes`; referencias y "sobre" con acentos, `<verde>`, ¡!, 🐕, comillas, `m²`, `&`.
- ✓ BD: todo se guardó **intacto** (acentos, ñ, emoji, `<b>`, `&`, comillas, m²).
- ✓ Portal: el nombre con `<b>Tëst</b>` se muestra como **texto literal (escapado)** — sin inyección HTML/XSS; acentos y emoji 🎬 OK.
- ✓ Drive: carpeta de proyecto conserva acentos y emoji 🎬 correctamente.
- ✓ Calendar: título y descripción conservan acentos y emoji (texto plano; `<b>` aparece literal — OK).
- ⚠ Correo de abono: ver **H-M2** (nombre inyectado SIN escapar en el HTML del correo → `<b>` renderiza en negrita) y **H-N4** (emoji 🎬 sale como mojibake "������" en html y texto plano). Acentos sí correctos en el correo.
- (También evidenció **H-A2** el enlace roto, igual que el resto.)

---

## ESTADO FINAL DE LOS 12 CONTRATOS (todos quedan para revisión, NO se borró nada)
| # | Folio | Estatus | Precio | Saldo | PDF |
|---|---|---|---|---|---|
| 1 | IAV-2607.15-A | Completado | $4500 | $0 | sí |
| 2 | IAV-2607.20-A | Reservado | $8000 | $8000 | sí |
| 3 | IAV-2607.25-A | Completado | $3000 | $0 | sí |
| 4 | IAV-2607.27-A | Completado | $3000 | $0 | sí |
| 5 | IAV-2607.30-A | Completado | $3000 | $0 | sí |
| 6 | IAV-2608.03-A | Reservado | $6700 | $4450 | sí |
| 7 | IAV-2608.05-A | Reservado | $6300 | $4300 | sí |
| 8 | IAV-2608.07-A | Reservado | $8500 | $4250 | sí |
| 9 | IAV-2608.11-A | Completado | $3000 | $0 | sí |
| 10 | IAV-2608.13-A | Completado | $4500 | $0 | sí |
| 11 | IAV-2608.15-A | Pendiente firma | $4000 | $4000 | sí |
| 12 | IAV-2608.17-A | Reservado | $3000 | $750 | sí |

- Cobertura: **cada paquete** pasó por al menos un ciclo (RES-COMBO Esc.1 completo; TER-COMBO Esc.2/7/11; IND-FOTO Esc.3/9; IND-VIDEO Esc.4/12; IND-360 Esc.5 completo; mixto Esc.8).
- **Las 4 situaciones de pago**: A (Esc.3), B (Esc.2), C (Esc.1/5/6/7/8/12), D (Esc.4/9).

## LO QUE FUNCIONA CORRECTAMENTE (verificado)
- **Carpetas Drive sin duplicados**: 1 carpeta de proyecto por contrato, con 1 "Control Interno" + 1 "Entregables";
  firmar reutiliza (no duplica); bucketing año/mes por fecha de sesión correcto. El fix de dedup quedó bien.
- **Modelo de saldo**: saldo = precio − abonos reales, en TODOS los casos. Anticipo (incl. 100%) es solo sugerido;
  crear/firmar/reservar **no** reducen el saldo. Abonos parciales y liquidación calculan saldo y estatus correctos.
- **Transiciones de estatus**: Pendiente firma → Firmado → Reservado → En produccion → Entregado → Completado, y
  Completado directo cuando el primer abono liquida; Entregado→Completado al pagar el resto; cancelar/reactivar con `forzar`.
- **Calendar (eventos de sesión)**: 1 por propiedad, fecha/hora/duración (2 h), dirección, mapa, cómo llegar y portal
  de equipo correctos; multi-propiedad genera 2 eventos con su tipo/paquete; reagendar **actualiza el evento en sitio**
  (sin duplicar) y manda correo de reagendamiento.
- **Drive (archivos)**: logo/fachada subidos por el cliente y la **Hoja de Referencias PDF** (datos correctos) quedan
  en Control Interno; PDF del contrato se genera y se liga (`pdf_contrato_url`).
- **Correos de pago/entrega/upsell/reagendamiento/reseña**: se envían con asuntos, montos y saldos correctos
  (el único defecto transversal es el enlace roto H-A2 y, en firma, la no-entrega H-A1).
- **`obtenerEquipo`**: entrega datos de acceso/caseta (código, contacto, instrucciones) y `requiereAcceso` por propiedad.
- **Portal del cliente**: estados correctos (apartada vs. pagado vs. material listo), Total pagado/saldo correctos,
  situación A/B no afirman pago; **escapa HTML del nombre (sin XSS)**; consola limpia (solo favicon 404 local).
- **Adicionales del cliente y upsell**: ofrecer en portal y aceptar en firma sube precio/saldo; upsell post-firma con
  adicional + servicio libre actualiza precio/saldo y notifica.
- **Guard de exceso**: bloquea abono > saldo sin `permitirExceso` (con propuesta de nuevo precio).
- **Acentos/ñ/especiales**: se guardan y muestran intactos en BD, portal, Drive, Calendar y (salvo emoji) correos.

## LIMPIEZA (NO ejecutada — pendiente de tu visto bueno)
No se borró nada. Para limpiar después: por cada token `eliminarContrato {token}` y luego `borrarCliente {id}`
(IDs en `state.json`). Eventos/carpetas/correos de Google con las herramientas MCP. Clientes/correos: `+qa2c1..12`.
Carpetas de proyecto Drive: 12 (IAV-2607.15/20/25/27/30 y IAV-2608.03/05/07/11/13/15/17).
