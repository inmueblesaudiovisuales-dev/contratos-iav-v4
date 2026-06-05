# IAV Contratos v4.0 — Guía para empezar

Sistema de contratos de Inmuebles Audiovisuales sobre **Cloudflare** (Workers + D1/SQLite),
con **Google Apps Script** como backend asíncrono para Drive, Calendar, correos y PDFs.
El objetivo central es velocidad: v4 responde en < 200 ms (v3 tardaba 2-4 s).

Este archivo es el punto de entrada. Lee primero esto; el detalle vive en los documentos enlazados abajo.

---

## Reglas críticas (leer antes de tocar nada)

- **Rama de trabajo:** salvo instrucción explícita, todo va a `main` (editar → commit → push). El push a `main` dispara el deploy a Cloudflare vía GitHub Actions (~1 min). **Nunca** correr `wrangler deploy` a mano.
- **REGLA DEL ADAPTER:** cada vez que modifiques `adapter/AdapterScript4_v1.js` debes (1) documentarlo en `docs/RONDAS.md` con hora exacta de Monterrey — corre `TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"`, sin "aprox"; (2) indicar qué función se tocó; (3) avisar que **requiere despliegue manual** en script.google.com (Bruno pega el archivo y publica nueva versión); (4) **SIEMPRE actualizar el comentario de header del propio archivo** (la línea `// Ultima modificacion: …`) con la **fecha y HORA de Monterrey + número de ronda (Rxx) + qué cambió**. El header es la única forma de saber, de un vistazo, si una copia pegada en Apps Script está al día — nunca lo dejes desactualizado.
- **D1 no soporta foreign keys** (`PRAGMA foreign_keys` se ignora). Las cascadas se hacen a mano en código con `db.batch()`.
- **Estilo:** sin emojis en el producto, CSS mobile-first, respetar el modelo de datos y los flujos existentes.
- Si el objetivo no está claro, **pregunta antes** de explorar o cambiar archivos.

## Comandos clave

```bash
# Deploy: solo push a main (GitHub Actions hace wrangler deploy)
git add <archivos> && git commit -m "Rxx — descripción" && git push origin main

# Tests del checklist (lógica pura)
node --test frontend/checklist-logic.test.js

# Consultar D1 en producción
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT folio, nombre_cliente, estatus FROM contratos ORDER BY fecha_creacion DESC LIMIT 10"

# Verificar un commit remoto (nunca leer el disco local para esto)
git fetch origin <rama> && git show <sha>:ruta/al/archivo
```

## Mapa de documentos

| Necesitas… | Lee |
|---|---|
| Entender qué es el proyecto, URLs, estructura | `docs/PROYECTO.md` |
| Saber qué `.html` habla con qué ruta/tabla/adapter | `docs/ARQUITECTURA.md` → "Mapa de relaciones" |
| Arquitectura: D1, paquetes, flujos, adapter, backup, pendientes, comandos | `docs/ARQUITECTURA.md` |
| Claves, IDs, URLs internas (sensibles) | `docs/CREDENCIALES.md` |
| Historial de cambios ronda por ronda | `docs/RONDAS.md` |
| Índice completo de specs, planes, reportes | `docs/INDEX.md` |
| Documento histórico congelado (no actualizar) | `MASTER_V4.md` |
