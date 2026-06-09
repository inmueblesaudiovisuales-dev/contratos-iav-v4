-- R113 — Entrega WOW "El Estreno": manifiesto, textos, estado del gate, estado de migración y video.
ALTER TABLE contratos ADD COLUMN entrega_manifiesto_json TEXT;
ALTER TABLE contratos ADD COLUMN entrega_textos_json TEXT;
ALTER TABLE contratos ADD COLUMN entrega_config_estado TEXT;
ALTER TABLE contratos ADD COLUMN entrega_media_estado TEXT;
ALTER TABLE contratos ADD COLUMN entrega_video_proveedor TEXT;
ALTER TABLE contratos ADD COLUMN entrega_video_id TEXT;
