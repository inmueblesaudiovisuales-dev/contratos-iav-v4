-- R136 — Reemplazar un archivo por una versión nueva sin dejar dos subidos.
--
-- El problema que resuelve: para cambiar un video había que borrar el viejo y subir
-- el nuevo. Si subías primero, el cliente veía DOS videos (el payload manda todos los
-- que tengan stream_uid). Si borrabas primero, quedaba una ventana con la entrega sin
-- video y el entregable marcado incompleto — y si ya estaba publicada, el cliente
-- caía justo ahí.
--
-- Cómo funciona: la versión nueva entra como un renglón propio que apunta al viejo
-- con reemplaza_a. Mientras Stream la codifica, ese renglón NO se le manda al cliente
-- y el viejo sigue sirviéndose. Cuando Stream confirma que la nueva quedó lista, se
-- hace el cambio y el renglón viejo se borra con su material. Si la subida falla, se
-- tira el renglón nuevo y no pasó nada.
--
-- Es el mismo patrón que ya usaba la copia limpia al liberar: apuntar al uid viejo
-- hasta que streamListo() confirme el nuevo.

-- id del e_archivos al que esta versión va a sustituir. Vacío = no es un reemplazo.
-- Se limpia en cuanto el cambio se consuma, así que un renglón con esto lleno es
-- siempre un reemplazo EN VUELO.
ALTER TABLE e_archivos ADD COLUMN reemplaza_a TEXT NOT NULL DEFAULT '';

-- Los reemplazos en vuelo se buscan cada 2 minutos desde el cron. Sin índice eso es
-- un scan de toda la tabla de archivos cada vez.
CREATE INDEX IF NOT EXISTS idx_e_archivos_reemplaza ON e_archivos(reemplaza_a);
