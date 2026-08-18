-- R133 — Separar "portada" de "destacada".
--
-- Hasta aqui `destacado` significaba dos cosas a la vez porque solo hacia falta una:
-- era la portada, y era exclusiva (el endpoint `portada` ponia todas en 0 y una en 1).
--
-- El portal del cliente ahora muestra una portada grande y ~6 fotos destacadas antes
-- del resto, asi que son dos decisiones distintas: cual va arriba de todo, y cuales
-- forman el muestrario. Con una sola columna no se pueden expresar las dos.
--
-- Reparto nuevo:
--   portada   0/1, a lo mas UNA por entrega. La foto grande de la cabecera.
--   destacado 0/1, varias por entrega. Las que se ven antes del boton "ver todas".
--
-- La portada tambien cuenta como destacada: es la primera del muestrario y seria
-- raro que la foto elegida como la mejor no apareciera entre las mejores.
--
-- Lo ya elegido se conserva: las que hoy son `destacado=1` son portadas, asi que
-- se copian a `portada` y se quedan tambien como destacadas.
ALTER TABLE e_archivos ADD COLUMN portada INTEGER NOT NULL DEFAULT 0;
UPDATE e_archivos SET portada = 1 WHERE destacado = 1;
