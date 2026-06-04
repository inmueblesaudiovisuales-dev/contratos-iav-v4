-- R58 — Rediseño IAV (admin + portal)
-- Migración por número de ronda (R57 fue la auditoría de checklist; ésta es la siguiente).
-- Todos los ALTER son aditivos con DEFAULT → los registros viejos quedan con default, no truenan.
-- Verificado contra schema.sql + PRAGMA remoto (2026-06-04): ninguna columna/tabla de abajo existía.
-- Si al re-ejecutar alguna ya existe, el ALTER fallará: aplicar individualmente u omitir la que exista.

-- Preferencia de anticipo por cliente (anticipo $0 frecuente en recurrentes)
ALTER TABLE clientes ADD COLUMN sin_anticipo INTEGER DEFAULT 0;
ALTER TABLE clientes ADD COLUMN anticipo_default REAL DEFAULT NULL;

-- Logo / carpeta a nivel cliente (reutilizable entre contratos)
ALTER TABLE clientes ADD COLUMN logo_url TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN carpeta_cliente_id TEXT DEFAULT '';

-- Estado y resumen de actividades (llamadas hechas + qué se habló)
ALTER TABLE actividades ADD COLUMN estado TEXT DEFAULT 'pendiente';  -- pendiente | hecha
ALTER TABLE actividades ADD COLUMN resultado TEXT DEFAULT '';

-- Tabla de configuración (datos bancarios, plantillas WhatsApp)
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT DEFAULT '',
  actualizado TEXT
);
