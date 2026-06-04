-- Crea registros en trabajos para contratos pre-V5 que no tienen uno
INSERT OR IGNORE INTO trabajos (id, cliente_id, token, estatus, interes, notas, fecha_creacion, fecha_ultima_actividad)
SELECT
  hex(randomblob(16)),
  c.cliente_id,
  c.token,
  c.estatus,
  COALESCE(c.paquete_base, ''),
  '',
  c.fecha_creacion,
  COALESCE(c.fecha_ultimo_abono, c.fecha_creacion)
FROM contratos c
LEFT JOIN trabajos t ON t.token = c.token
WHERE t.token IS NULL
  AND c.oculto = 0
  AND c.cliente_id != '';
