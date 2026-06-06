-- R64 — Logos múltiples por propiedad (hasta 3 versiones)
-- ALTER aditivo con DEFAULT → registros viejos quedan con '' (= sin versiones extra), no truenan.
-- logo_url se mantiene como el logo principal (primera versión) por compatibilidad.
-- logos_json guarda el array JSON con TODAS las versiones (incluida la principal).

ALTER TABLE propiedades ADD COLUMN logos_json TEXT DEFAULT '';
