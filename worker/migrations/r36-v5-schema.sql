-- R36 V5: clientes+inmobiliaria, trabajos+token+ubicacion, drop prospectos

ALTER TABLE clientes ADD COLUMN inmobiliaria TEXT DEFAULT '';

ALTER TABLE trabajos ADD COLUMN token TEXT;
ALTER TABLE trabajos ADD COLUMN ubicacion TEXT DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajos_token ON trabajos(token);

DROP TABLE IF EXISTS prospectos;
