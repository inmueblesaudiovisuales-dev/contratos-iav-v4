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
  tiene_recorrido INTEGER DEFAULT 1,
  entrega_revocada TEXT,
  entrega_express INTEGER DEFAULT 0,
  cliente_id TEXT DEFAULT ''
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
  formato_video TEXT DEFAULT 'vertical_nativo',
  ocultar_formato_video INTEGER DEFAULT 1,
  requiere_acceso INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT DEFAULT '',
  correo TEXT DEFAULT '',
  origen TEXT DEFAULT '',
  notas_perfil TEXT DEFAULT '',
  fecha_creacion TEXT NOT NULL,
  fecha_ultima_actividad TEXT DEFAULT '',
  inmobiliaria TEXT DEFAULT '',
  sin_anticipo INTEGER DEFAULT 0,
  anticipo_default REAL DEFAULT NULL,
  logo_url TEXT DEFAULT '',
  carpeta_cliente_id TEXT DEFAULT ''
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
  token TEXT,
  ubicacion TEXT DEFAULT '',
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
  fecha_creacion TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  resultado TEXT DEFAULT ''
);

-- Configuración (datos bancarios, plantillas WhatsApp) — R58
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT DEFAULT '',
  actualizado TEXT
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajos_token ON trabajos(token);
CREATE INDEX IF NOT EXISTS idx_actividades_cliente ON actividades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_actividades_trabajo ON actividades(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_revisiones_video_contrato ON revisiones_video(contrato_id);
