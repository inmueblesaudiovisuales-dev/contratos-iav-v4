-- R129 — Sistema de Entregas
-- Tablas propias con prefijo e_. NO modifica ninguna tabla existente.
-- Reversible: DROP TABLE de las 5 tablas deja la base como estaba.
--
-- D1 ignora PRAGMA foreign_keys. Las cascadas van a mano en codigo:
--   e_eventos -> e_archivos -> e_entregables -> e_entregas

-- Clientes del sistema de entregas.
-- Si cliente_id NO es NULL, los datos de contacto se leen EN VIVO de la tabla clientes
-- y las columnas locales quedan vacias. Solo los clientes manuales guardan sus datos aqui.
CREATE TABLE IF NOT EXISTS e_clientes (
  id             TEXT PRIMARY KEY,
  cliente_id     TEXT,
  nombre         TEXT NOT NULL DEFAULT '',
  telefono       TEXT NOT NULL DEFAULT '',
  correo         TEXT NOT NULL DEFAULT '',
  origen         TEXT NOT NULL DEFAULT 'manual',
  fecha_creacion TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_e_clientes_cliente ON e_clientes(cliente_id);

-- Una entrega por propiedad. Espeja el evento de Calendar.
--
-- codigo: llave del enlace publico. Aleatorio e inadivinable. La busqueda SIEMPRE va por
-- codigo, nunca por folio, porque reagendarPropiedad regenera el folio de la propiedad 1
-- (contratos.js:743) y eso romperia los enlaces ya enviados al cliente.
--
-- estado: borrador | publicada | liberada | pausada | expirada
CREATE TABLE IF NOT EXISTS e_entregas (
  id              TEXT PRIMARY KEY,
  e_cliente_id    TEXT NOT NULL,
  contrato_token  TEXT,
  num_propiedad   INTEGER,
  codigo          TEXT NOT NULL,
  titulo          TEXT NOT NULL DEFAULT '',
  direccion       TEXT NOT NULL DEFAULT '',
  estado          TEXT NOT NULL DEFAULT 'borrador',
  tour_url        TEXT NOT NULL DEFAULT '',
  pagado_manual   INTEGER NOT NULL DEFAULT 0,
  dias_vigencia   INTEGER NOT NULL DEFAULT 14,
  fecha_sesion    TEXT NOT NULL DEFAULT '',
  fecha_creacion  TEXT NOT NULL,
  fecha_publicada TEXT,
  fecha_liberada  TEXT,
  fecha_expira    TEXT,
  fecha_pausada   TEXT,
  fecha_expirada  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_e_entregas_codigo ON e_entregas(codigo);
CREATE INDEX IF NOT EXISTS idx_e_entregas_contrato ON e_entregas(contrato_token);
CREATE INDEX IF NOT EXISTS idx_e_entregas_estado ON e_entregas(estado);
CREATE INDEX IF NOT EXISTS idx_e_entregas_cliente ON e_entregas(e_cliente_id);

-- Los renglones que hay que cumplir. Se siembran del paquete del contrato y se editan a mano.
-- tipo: fotos | video | enlace
-- valor: para 'enlace', la URL. Para los demas, vacio (el contenido vive en e_archivos).
CREATE TABLE IF NOT EXISTS e_entregables (
  id           TEXT PRIMARY KEY,
  e_entrega_id TEXT NOT NULL,
  tipo         TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  orden        INTEGER NOT NULL DEFAULT 0,
  completo     INTEGER NOT NULL DEFAULT 0,
  valor        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_e_entregables_entrega ON e_entregables(e_entrega_id);

-- Un registro por archivo subido.
--   r2_key     -> el original limpio en R2 (se borra al expirar)
--   images_id  -> la copia con mosaico en Cloudflare Images
--   stream_uid -> el video con marca quemada en Stream
CREATE TABLE IF NOT EXISTS e_archivos (
  id              TEXT PRIMARY KEY,
  e_entregable_id TEXT NOT NULL,
  e_entrega_id    TEXT NOT NULL,
  nombre          TEXT NOT NULL DEFAULT '',
  bytes           INTEGER NOT NULL DEFAULT 0,
  mime            TEXT NOT NULL DEFAULT '',
  r2_key          TEXT NOT NULL DEFAULT '',
  images_id       TEXT NOT NULL DEFAULT '',
  images_hash     TEXT NOT NULL DEFAULT '',
  stream_uid      TEXT NOT NULL DEFAULT '',
  ancho           INTEGER NOT NULL DEFAULT 0,
  alto            INTEGER NOT NULL DEFAULT 0,
  orden           INTEGER NOT NULL DEFAULT 0,
  destacado       INTEGER NOT NULL DEFAULT 0,
  estado          TEXT NOT NULL DEFAULT 'listo',
  fecha           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_e_archivos_entregable ON e_archivos(e_entregable_id);
CREATE INDEX IF NOT EXISTS idx_e_archivos_entrega ON e_archivos(e_entrega_id);

-- Bitacora. Sobrevive al borrado del material: es el registro de que le entregaste
-- que cosa a quien, cuando lo vio y si lo descargo.
CREATE TABLE IF NOT EXISTS e_eventos (
  id           TEXT PRIMARY KEY,
  e_entrega_id TEXT NOT NULL,
  tipo         TEXT NOT NULL,
  detalle      TEXT NOT NULL DEFAULT '',
  fecha        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_e_eventos_entrega ON e_eventos(e_entrega_id);
