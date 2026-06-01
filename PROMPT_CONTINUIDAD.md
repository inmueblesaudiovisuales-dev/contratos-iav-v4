# PROMPT DE CONTINUIDAD — IAV Contratos v4.0

> Última sesión: 2026-06-01. Estado: estable, desplegado.  
> Próxima tarea: definir por Bruno según pendientes abajo.

---

## CONTEXTO DEL PROYECTO

**Sistema de contratos de Inmuebles Audiovisuales** reconstruido desde cero sobre Cloudflare Workers + D1. v3.0 (Google Apps Script + Sheets) sigue vivo en inmueblesaudiovisuales.com pero no se usa ni se modifica.

**Stack:**
- **Backend:** Cloudflare Workers (JavaScript) + D1 (SQLite en edge)
- **Frontend:** HTML/JS vanilla servido como assets estáticos del Worker
- **Adapter:** Google Apps Script (desplegado en script.google.com) — maneja Drive, Calendar, Gmail, PDFs
- **Comunicación Worker ↔ Adapter:** `POST` asíncrono via `ctx.waitUntil()`
- **Backup:** Sync a Sheets cada hora (Cron Trigger)

**URLs de producción:**
- Admin: `https://contratos.inmueblesaudiovisuales.com/admin.html`
- Portal cliente: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=<token>`
- Checklist: `https://contratos.inmueblesaudiovisuales.com/checklist.html?token=<token>`
- API: `https://contratos.inmueblesaudiovisuales.com/api/<accion>`

**Credenciales:**
- Admin key: `framedock` (Header: `X-Admin-Key`)
- Cloudflare account: `inmueblesaudiovisuales@gmail.com`
- Worker: `contratos-iav-v4`
- D1: `contratos-iav-v4` (id: `84ae26a8-5bbc-4cdc-ad39-ead4c6bc7500`)

---

## DOCUMENTOS A LEER (en orden de importancia)

### 1. Documento Master (LEER PRIMERO)
```
/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/MASTER_V4.md
```
**Contiene:** estructura de archivos, tablas D1, flujo de contrato completo, flujo de correos, adapter acciones, historial de cambios (R1→R13), decisiones de diseño NO implementar, formato de `adicionales_json`, comandos de mantenimiento.

### 2. Plan R13 (último cambio implementado)
```
/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/docs/plans/2026-05-31-toggle-nombre-addons-globales.md
```
**Contiene:** toggle Paquete base/Personalizado, acordeón add-ons globales, eliminación Duplicar contrato. Bugs B1-B6 (pre-auditoría) y B7-B9 (post-implementación).

### 3. Arranque / guía de despliegue
```
/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/ARRANQUE.md
```

### 4. Plan original v4.0 (contexto histórico)
```
/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/docs/plans/2026-05-30-sistema-contratos-v4.md
```

### 5. Rondas anteriores (fixes detallados)
```
/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/docs/plans/2026-05-30-fixes-ronda5.md
```

---

## ESTRUCTURA DE ARCHIVOS (paths absolutos)

```
/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/
├── MASTER_V4.md
├── ARRANQUE.md
├── adapter/
│   └── AdapterScript4_v1.js          # Apps Script (NO modificar salvo que se pida explícitamente)
├── frontend/
│   ├── admin.html                     # Panel de administración (~3558 líneas)
│   ├── portal.html                    # Portal del cliente (~2286 líneas)
│   └── checklist.html                 # Checklist de rodaje
├── worker/
│   ├── wrangler.toml
│   ├── schema.sql                     # Estructura D1 (referencia, ya aplicado)
│   ├── seed-paquetes.sql              # Datos iniciales de paquetes
│   ├── package.json
│   └── src/
│       ├── index.js                   # Entry point + routing
│       ├── auth.js                    # requireAdmin(), ok(), err()
│       ├── db.js                      # query(), queryOne(), run(), batch()
│       ├── tokens.js                  # crearTokenPortal(), refrescarExpiry()
│       ├── folios.js                  # generarFolio() → "IAV-YYMM.DD"
│       ├── google.js                  # callAdapter(), callAdapterSync()
│       ├── cron.js                    # syncToSheets() backup horario
│       └── routes/
│           ├── contratos.js           # ~25 endpoints admin
│           ├── portal.js              # obtenerPortal, firmaCliente, guardarResena
│           ├── abonos.js              # registrarAbono, listarAbonos
│           ├── paquetes.js            # CRUD catálogo
│           ├── stats.js               # Métricas
│           ├── checklist.js           # obtenerChecklist, guardarChecklist
│           └── archivos.js            # subirArchivo, subirArchivoAdmin
└── docs/
    └── plans/
        ├── 2026-05-30-sistema-contratos-v4.md
        ├── 2026-05-30-fixes-ronda5.md
        └── 2026-05-31-toggle-nombre-addons-globales.md
```

---

## CÓMO DESPLEGAR

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker"
npx wrangler deploy
```
Esto sube el Worker + los 3 HTML de `frontend/` como assets estáticos. Siempre desplegar completo, sin importar si el cambio es solo a un archivo.

El adapter de Apps Script requiere acción manual de Bruno: pegar `adapter/AdapterScript4_v1.js` en script.google.com y desplegar nueva versión.

---

## LO QUE YA ESTÁ HECHO (Rondas 1–13)

### R14 — últimos cambios (2026-06-01)
- Eliminadas secciones globales del formulario ("Add-ons del proyecto" y "Servicios ya acordados")
- ADD-EXPRESS cambiado de `global` a `por_propiedad` en D1 — ahora aparece como checkbox normal en cada propiedad
- Acordeón por propiedad rediseñado: "Servicios adicionales" (opcionales del catálogo) + "Extras cotizados" (texto libre + precio, ya incluidos)
- Campo de precio para modo "Personalizado" en cada propiedad — contribuye al total automáticamente
- Limpieza: `actualizarPaquetesAdicionales` reducida, referencias muertas eliminadas de `crearContrato` y reset
- Código muerto pendiente de limpiar: `agregarAddonPersonalizado()`, `agregarExtraLibre()`, loop `.extra-acordado-cat-cb` en `crearContrato`

### R13 — 2026-05-31
- Toggle "Paquete base" / "Personalizado" en cada propiedad del admin
- Add-ons globales en acordeón cerrado, oculto con 1 propiedad
- Eliminación de "Duplicar contrato"
- Distinción 1-prop vs multi-prop en portal (add-ons integrados en resumen, sin badges numéricos)

### R12 — Add-ons por propiedad + personalizados
- Columna `alcance` en `paquetes` (global vs por_propiedad)
- Admin: secciones de add-ons per-prop + acordados per-prop en cada card
- Admin: + Add-on personalizado (nombre + precio libre)
- Portal: add-ons per-prop en cada propiedad, toggle independiente
- Portal: add-ons personalizados como opcionales con su propio precio

### R11 — Carpetas en firma + reagendar
- Carpetas Drive, PDF referencias y Calendar se crean al firmar (no al primer abono)
- Reagendar: renombra carpeta, mueve al mes correcto, regenera PDF

### R10 — Estatus "Completado"
### R9 — 18 bugs de auditoría exhaustiva
### R8 — Paquetes/nombres + 11 fixes
### R7 — Paquetes nombres
### R6 — Fixes E2E post-deploy
### R5 — Fixes AE2-AE9
### R4 — Auditoría exhaustiva 18 fixes
### R3 — Worker + Adapter
### R2 — Worker + Adapter
### R1 — Frontend + Backend

---

## FORMATO DE `adicionales_json`

Elementos del array en la columna `contratos.adicionales_json`:

| Tipo | Formato |
|------|---------|
| Catálogo global ofrecido | `"ADD-EXPRESS"` (string) |
| Catálogo per-prop ofrecido | `{ clave: "ADD-LANDING", numPropiedad: 1 }` |
| Catálogo acordado | `{ clave: "ADD-ASESOR", precio: 500 }` |
| Catálogo acordado per-prop | `{ clave: "ADD-ASESOR", precio: 500, numPropiedad: 1 }` |
| Personalizado ofrecido | `{ nombre: "Tour extra", precio: 2500, ofrecido: true }` |
| Personalizado ofrecido per-prop | `{ nombre: "Tour extra", precio: 2500, ofrecido: true, numPropiedad: 1 }` |
| Personalizado acordado | `{ nombre: "Limpieza", precio: 800 }` |
| Personalizado acordado per-prop | `{ nombre: "Limpieza", precio: 800, numPropiedad: 1 }` |

El adapter ignora `numPropiedad` y `ofrecido` — no requiere cambios.

---

## DECISIONES DE DISEÑO — NO IMPLEMENTAR

| Feature | Motivo |
|---------|--------|
| Correo a Bruno cuando cliente firma | No se quiere. Ve admin. |
| Correo cliente en descripción Calendar | Solo teléfono y comentarios. |
| Recordatorio automático 24h antes | Manual desde admin suficiente. |
| `MODO_BORRADOR` en adapter | No necesario. |
| Limpieza tokens viejos | Volumen no justifica. |
| `linkConfigurar` / `configurar4.html` | Eliminado. Admin configura propiedades. |
| `notificarContratoCreado` | Función vacía removida del adapter. |

---

## PENDIENTES

- [x] Adapter desplegado
- [ ] Trigger `procesarPDFsPendientes` en Apps Script — verificar que corre cada minuto
- [ ] Cuando correo cliente vacío al crear contrato, no llega correo en firma. Cliente debe llenarlo en portal
- [ ] Contratos particulares sin folio hasta configurar propiedad
- [ ] Probar end-to-end: contrato multi-prop con add-ons per-prop + personalizados

---

## DATOS D1

```
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT * FROM paquetes"
```
Paquetes: RES-COMBO, TER-COMBO, IND-FOTO, IND-VIDEO, IND-360, ADD-COMOLLEGAR, ADD-LANDING, ADD-FOLLETO, ADD-ASESOR, ADD-EXPRESS.
Alcances: solo ADD-EXPRESS es `global`, resto son `por_propiedad`.
