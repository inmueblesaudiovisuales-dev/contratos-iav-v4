CREATE TABLE IF NOT EXISTS contratos (
  token TEXT PRIMARY KEY,
  folio TEXT,
  nombre_cliente TEXT NOT NULL,
  correo_cliente TEXT,
  telefono_cliente TEXT,
  tipo_contrato TEXT NOT NULL DEFAULT 'estandar',
  tipo_paquete TEXT,
  paquete_base TEXT,
  adicionales_json TEXT DEFAULT '[]',
  precio_base REAL DEFAULT 0,
  precio_total REAL DEFAULT 0,
  anticipo REAL DEFAULT 0,
  saldo_pendiente REAL DEFAULT 0,
  estatus TEXT NOT NULL DEFAULT 'Pendiente firma',
  fecha_creacion TEXT NOT NULL,
  fecha_firma TEXT,
  fecha_ultimo_abono TEXT,
  fecha_entrega TEXT,
  firma_base64_url TEXT,
  entrega_drive_link TEXT,
  entrega_links_extra TEXT,
  num_propiedades INTEGER DEFAULT 1,
  pdf_contrato_url TEXT,
  notas_contrato TEXT,
  oculto INTEGER DEFAULT 0,
  notas_internas TEXT,
  sesion_completada TEXT,
  recordatorio_enviado TEXT,
  calificacion INTEGER,
  resena_texto TEXT,
  fotografia_lista TEXT,
  video_listo TEXT,
  recorrido_listo TEXT,
  recorrido_url TEXT,
  entrega_revocada TEXT,
  entrega_express INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  contrato_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  expira TEXT,
  usado INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS abonos (
  id TEXT PRIMARY KEY,
  contrato_token TEXT NOT NULL,
  monto REAL NOT NULL,
  metodo TEXT,
  fecha TEXT,
  fecha_registro TEXT NOT NULL,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS propiedades (
  contrato_token TEXT NOT NULL,
  num_propiedad INTEGER NOT NULL,
  tipo TEXT,
  paquete TEXT,
  entregables TEXT,
  fecha_sesion TEXT,
  hora_sesion TEXT,
  direccion TEXT,
  link_maps TEXT,
  orientacion TEXT,
  sobre_la_propiedad TEXT,
  referencias TEXT,
  fachada_url TEXT,
  perimetro_url TEXT,
  datos_especificos TEXT DEFAULT '{}',
  logo_url TEXT,
  carpeta_control_id TEXT,
  calendar_event_id TEXT,
  carpeta_entregables_id TEXT,
  nota_interna TEXT,
  PRIMARY KEY (contrato_token, num_propiedad)
);

CREATE TABLE IF NOT EXISTS paquetes (
  clave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL,
  es_adicional INTEGER DEFAULT 0,
  entregables TEXT,
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0,
  alcance TEXT DEFAULT 'por_propiedad'
);

CREATE TABLE IF NOT EXISTS checklist (
  contrato_token TEXT PRIMARY KEY,
  cuartos_json TEXT DEFAULT '[]',
  fecha_creacion TEXT NOT NULL,
  fecha_actualizacion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contratos_estatus ON contratos(estatus);
CREATE INDEX IF NOT EXISTS idx_contratos_oculto ON contratos(oculto);
CREATE INDEX IF NOT EXISTS idx_abonos_token ON abonos(contrato_token);
CREATE INDEX IF NOT EXISTS idx_propiedades_token ON propiedades(contrato_token);
CREATE INDEX IF NOT EXISTS idx_tokens_contrato ON tokens(contrato_id);

CREATE TABLE IF NOT EXISTS prospectos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  interes TEXT DEFAULT '',
  fecha_llamada TEXT NOT NULL,
  hora_llamada TEXT NOT NULL,
  notas TEXT DEFAULT '',
  estatus TEXT DEFAULT 'pendiente',
  fecha_creacion TEXT NOT NULL
);
