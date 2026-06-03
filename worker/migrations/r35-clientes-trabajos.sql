-- R35 CRM tables and indexes.
-- Column additions used by this branch are already present in production D1
-- and are included in worker/schema.sql for fresh databases.

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT DEFAULT '',
  correo TEXT DEFAULT '',
  origen TEXT DEFAULT '',
  notas_perfil TEXT DEFAULT '',
  fecha_creacion TEXT NOT NULL,
  fecha_ultima_actividad TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trabajos (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  estatus TEXT NOT NULL DEFAULT 'nuevo',
  interes TEXT DEFAULT '',
  paquetes_cotizados_json TEXT DEFAULT '[]',
  portafolio_links_json TEXT DEFAULT '[]',
  propiedades_interes_json TEXT DEFAULT '[]',
  presupuesto_estimado REAL DEFAULT 0,
  notas TEXT DEFAULT '',
  contrato_token TEXT DEFAULT '',
  fecha_creacion TEXT NOT NULL,
  fecha_ultima_actividad TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS actividades (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  trabajo_id TEXT DEFAULT '',
  tipo TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  fecha_actividad TEXT NOT NULL,
  hora TEXT DEFAULT '',
  fecha_creacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisiones_video (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_id TEXT NOT NULL,
  minuto_segundo TEXT,
  descripcion_ajuste TEXT NOT NULL,
  fecha TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON contratos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_cliente ON trabajos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_estatus ON trabajos(estatus);
CREATE INDEX IF NOT EXISTS idx_actividades_cliente ON actividades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_actividades_trabajo ON actividades(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_revisiones_video_contrato ON revisiones_video(contrato_id);
