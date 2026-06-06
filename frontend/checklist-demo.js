/* Modo demo de checklist.html — SOLO se carga con ?demo=1.
   Arranca como un contrato recién creado (primer arranque): sin cuartos,
   sin secuencias de cámara. Replica el flujo real (elegir servicio ->
   armar cuartos -> input del último archivo -> capturar) pero en memoria,
   sin token ni backend. No afecta producción. */
window.IAVChecklistDemo = {
  meta: { folio: 'NUEVO', nombreCliente: 'Primer arranque (demo)' },
  build(logic) {
    return logic.createDefaultState();
  },
};
