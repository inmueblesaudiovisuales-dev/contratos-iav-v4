#!/bin/bash
# Migraciones D1 — Preparación para automatización WhatsApp
# Ejecutar desde la carpeta del proyecto con wrangler instalado
# Fecha: 2026-06-02

echo "=== Iniciando migraciones D1 ==="

# ── Pendiente R17 ──────────────────────────────────────────────────────────────
echo "1/11 - entrega_express en contratos (R17 pendiente)..."
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE contratos ADD COLUMN entrega_express INTEGER DEFAULT 0"

# ── Columnas nuevas en contratos ───────────────────────────────────────────────
echo "2/11 - origen en contratos..."
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE contratos ADD COLUMN origen TEXT DEFAULT 'admin'"

echo "3/11 - penalizacion_reagendamiento en contratos..."
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE contratos ADD COLUMN penalizacion_reagendamiento REAL DEFAULT 0"

# ── Columnas nuevas en propiedades ─────────────────────────────────────────────
echo "4/11 - requiere_acceso en propiedades..."
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN requiere_acceso INTEGER DEFAULT 0"

echo "5/11 - formato_video en propiedades..."
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN formato_video TEXT DEFAULT 'vertical_nativo'"

echo "6/11 - cajones_estacionamiento en propiedades..."
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN cajones_estacionamiento TEXT"

# ── Tablas nuevas ──────────────────────────────────────────────────────────────
echo "7/11 - tabla prospectos..."
wrangler d1 execute contratos-iav-v4 --remote --command="CREATE TABLE IF NOT EXISTS prospectos (id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT NOT NULL, nombre_whatsapp TEXT, propiedad_interes TEXT, resumen_conversacion TEXT, estatus TEXT DEFAULT 'Cotizando', fecha_primer_contacto TEXT NOT NULL, fecha_ultimo_mensaje TEXT, fecha_contacto_programado TEXT)"

echo "8/11 - tabla whatsapp_sesiones..."
wrangler d1 execute contratos-iav-v4 --remote --command="CREATE TABLE IF NOT EXISTS whatsapp_sesiones (id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT NOT NULL UNIQUE, canal TEXT DEFAULT 'whatsapp', mensajes_json TEXT DEFAULT '[]', resumen_historico TEXT, modo_manual INTEGER DEFAULT 0, agente_asignado TEXT, estatus_chat TEXT DEFAULT 'activo', ultima_actualizacion TEXT)"

echo "9/11 - tabla revisiones_video..."
wrangler d1 execute contratos-iav-v4 --remote --command="CREATE TABLE IF NOT EXISTS revisiones_video (id INTEGER PRIMARY KEY AUTOINCREMENT, contrato_id TEXT NOT NULL, minuto_segundo TEXT, descripcion_ajuste TEXT NOT NULL, fecha TEXT NOT NULL)"

# ── Catálogo ───────────────────────────────────────────────────────────────────
echo "10/11 - paquete ADD-DOBLE-FORMATO..."
wrangler d1 execute contratos-iav-v4 --remote --command="INSERT INTO paquetes (clave, tipo, nombre, precio, es_adicional, entregables, activo, orden, alcance) VALUES ('ADD-DOBLE-FORMATO', 'Adicional', 'Doble Formato Nativo', 1500, 1, 'Dos pasadas de producción en campo. Material nativo en vertical y horizontal.', 1, 11, 'por_propiedad')"

# ── Verificación ───────────────────────────────────────────────────────────────
echo "11/11 - Verificando tablas..."
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"

echo ""
echo "=== Migraciones completadas ==="
