-- r66 — F64: historial del checklist para recuperacion DENTRO del sistema (sin Time Travel).
-- Cada guardado exitoso archiva el estado nuevo aqui; se conservan las ultimas 50 versiones por
-- contrato. Asi, si algo se sobrescribe, se recupera del propio sistema.
CREATE TABLE IF NOT EXISTS checklist_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_token TEXT NOT NULL,
  cuartos_json TEXT NOT NULL,
  rev INTEGER NOT NULL,
  autor TEXT,
  fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hist_token ON checklist_historial(contrato_token, id DESC);
