-- r65 — F62: candado de concurrencia. Revision monotonica por fila de checklist.
-- El guardado solo se aplica si la rev que trae el cliente sigue vigente (compare-and-swap),
-- evitando que un dispositivo pise lo que otro escribio. Aditivo; las filas viejas arrancan en 0.
ALTER TABLE checklist ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
