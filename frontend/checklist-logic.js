(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IAVChecklistLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SERVICES_DEFAULT = { foto: true, t360: true, video: true, drone: true, asesor: true };
  const SERVICE_LABELS = { foto: 'Foto', t360: '360', video: 'Video', drone: 'Drone', asesor: 'Asesores' };
  const CAMERA_DEFAULTS = [
    { id: 'sony-main', label: 'Sony principal', mode: 'video', kind: 'sony' },
    { id: 'osmo-pocket-3', label: 'Osmo Pocket 3', mode: 'video', kind: 'dji', optional: true },
    // F18 (B) — dos drones por defecto, cada uno con su patron/consecutivo propio.
    // Se conserva el id legacy 'drone-dji' (ahora DJI Air 3) para compatibilidad con
    // estado viejo, contadores y la camara drone activa por defecto.
    { id: 'drone-dji', label: 'DJI Air 3', mode: 'drone', kind: 'dji' },
    { id: 'drone-mini-4-pro', label: 'DJI Mini 4 Pro', mode: 'drone', kind: 'dji' },
    { id: 'sony-asesor', label: 'Sony FX30', mode: 'asesor', kind: 'sony', role: 'video' },
    { id: 'osmo-asesor', label: 'Osmo + DJI Mic', mode: 'asesor', kind: 'dji', role: 'audio' },
  ];
  const ASESOR_DEFAULTS = [
    { nombre: 'Introducción', tipo: 'normal' },
    { nombre: 'Despedida', tipo: 'normal' },
  ];
  function createAsesorPuntos() {
    return ASESOR_DEFAULTS.map((p, index) => ({
      id: 'asesor-default-' + index, nombre: p.nombre, tipo: p.tipo, estado: 'pendiente', ordenLista: index + 1,
    }));
  }
  const DRONE_DEFAULTS = [
    'Fachada aerea',
    'Vista general de propiedad',
    'Calle / acceso',
    'Entorno / ubicacion',
    'Amenidades',
    'Terreno completo',
    'Roof / terraza',
    'Toma de cierre',
  ];
  const TEMPLATE_DEFS = {
    casa: {
      label: 'Casa residencial',
      description: 'Interior, exterior, recamaras y servicios comunes.',
      spaces: [
        ['Fachada', 'exterior', true],
        ['Cochera', 'exterior', false],
        ['Jardin / Terraza', 'exterior', true],
        ['Patio', 'exterior', false],
        ['Acceso / Recibidor', 'interior', false],
        ['Sala', 'interior', true],
        ['Comedor', 'interior', false],
        ['Cocina', 'interior', true],
        ['Bano de visitas', 'interior', false],
        ['Recamara principal', 'interior', true],
        ['Bano principal', 'interior', false, 'Recamara principal'],
        ['Closet', 'interior', false, 'Recamara principal'],
        ['Recamara 2', 'interior', false],
        ['Bano', 'interior', false, 'Recamara 2'],
        ['Recamara 3', 'interior', false],
        ['Lavanderia', 'interior', false],
      ],
    },
    departamento: {
      label: 'Departamento',
      description: 'Departamento con interiores y amenidades del edificio.',
      spaces: [
        ['Acceso', 'interior', false],
        ['Sala', 'interior', true],
        ['Comedor', 'interior', false],
        ['Cocina', 'interior', true],
        ['Bano de visitas', 'interior', false],
        ['Recamara principal', 'interior', true],
        ['Bano principal', 'interior', false, 'Recamara principal'],
        ['Closet', 'interior', false, 'Recamara principal'],
        ['Recamara secundaria', 'interior', false],
        ['Balcon / Terraza', 'exterior', true],
        ['Lavanderia', 'interior', false],
        ['Lobby', 'amenidades', true],
        ['Alberca', 'amenidades', true],
        ['Gimnasio', 'amenidades', true],
        ['Salon de eventos', 'amenidades', false],
        ['Terraza comun', 'amenidades', true],
        ['Asadores', 'amenidades', false],
      ],
    },
    terreno: {
      label: 'Terreno',
      description: 'Perimetro, accesos, entorno y vistas generales.',
      spaces: [
        ['Frente del terreno', 'exterior', true],
        ['Vista desde calle', 'exterior', true],
        ['Lateral izquierdo', 'exterior', false],
        ['Lateral derecho', 'exterior', false],
        ['Fondo', 'exterior', false],
        ['Vista panoramica', 'exterior', true],
        ['Acceso', 'exterior', true],
        ['Servicios / entorno', 'exterior', false],
      ],
    },
    amenidades: {
      label: 'Amenidades',
      description: 'Areas comunes que venden el desarrollo o edificio.',
      spaces: [
        ['Alberca', 'amenidades', true],
        ['Gimnasio', 'amenidades', true],
        ['Lobby', 'amenidades', true],
        ['Salon de eventos', 'amenidades', false],
        ['Terraza comun', 'amenidades', true],
        ['Asadores', 'amenidades', false],
        ['Area infantil', 'amenidades', false],
        ['Cancha', 'amenidades', false],
        ['Cowork', 'amenidades', false],
        ['Jardines', 'amenidades', true],
        ['Estacionamiento de visitas', 'amenidades', false],
        ['Acceso / Caseta', 'amenidades', true],
        ['Elevadores', 'amenidades', false],
        ['Pasillos / areas comunes', 'amenidades', false],
      ],
    },
    exterior_drone: {
      label: 'Exterior / Drone',
      description: 'Exteriores de apoyo y tomas aereas base.',
      spaces: [
        ['Fachada', 'exterior', true],
        ['Calle / acceso', 'exterior', true],
        ['Cochera', 'exterior', false],
        ['Jardin', 'exterior', false],
        ['Terraza', 'exterior', true],
        ['Roof garden', 'exterior', true],
        ['Vista exterior', 'exterior', false],
      ],
      drone: [
        'Fachada aerea',
        'Vista general de propiedad',
        'Calle / acceso',
        'Entorno / ubicacion',
        'Amenidades aereas',
        'Terreno completo',
        'Roof / terraza',
        'Toma de cierre',
      ],
    },
    quinta: {
      label: 'Quinta',
      description: 'Casa principal, exteriores y amenidades de recreo.',
      spaces: [
        ['Fachada', 'exterior', true, null, 'Exterior'],
        ['Acceso / Caseta', 'exterior', false, null, 'Exterior'],
        ['Estacionamiento', 'exterior', false, null, 'Exterior'],
        ['Sala', 'interior', true, null, 'Casa principal'],
        ['Comedor', 'interior', false, null, 'Casa principal'],
        ['Cocina', 'interior', true, null, 'Casa principal'],
        ['Recamara principal', 'interior', true, null, 'Casa principal'],
        ['Bano principal', 'interior', false, 'Recamara principal', 'Casa principal'],
        ['Recamara 2', 'interior', false, null, 'Casa principal'],
        ['Bano de visitas', 'interior', false, null, 'Casa principal'],
        ['Alberca', 'amenidades', true, null, 'Amenidades'],
        ['Palapa', 'amenidades', true, null, 'Amenidades'],
        ['Asadores', 'amenidades', false, null, 'Amenidades'],
        ['Cocina exterior', 'amenidades', false, null, 'Amenidades'],
        ['Jardines', 'amenidades', true, null, 'Amenidades'],
        ['Cancha', 'amenidades', false, null, 'Amenidades'],
        ['Cabanas', 'amenidades', false, null, 'Amenidades'],
        ['Bano de alberca', 'amenidades', false, null, 'Amenidades'],
      ],
    },
  };

  const SPACE_SUGGESTIONS = {
    casa: TEMPLATE_DEFS.casa.spaces,
    departamento: TEMPLATE_DEFS.departamento.spaces,
    terreno: TEMPLATE_DEFS.terreno.spaces,
    quinta: TEMPLATE_DEFS.quinta.spaces,
  };

  // ─── Biblioteca de tomas guiadas (F1) ────────────────────────────────────────

  const SHOT_TYPES = Object.freeze({
    wide:         { label: 'Plano abierto',             hint: 'Encuadre amplio del espacio completo.',         ejemplo: 'de pared a pared, camara baja ~1.2m, verticales rectas' },
    general:      { label: 'Plano general',             hint: 'Cuarto entero con distribucion y flujo.',       ejemplo: 'cuarto completo en el frame incluyendo piso y techo; muestra el layout' },
    medio:        { label: 'Plano medio',               hint: 'Zona o feature clave (mesa, isla, sillon).',    ejemplo: 'feature en el centro del frame; orbita lentamente o avanza hacia el' },
    detalle:      { label: 'Detalle/inserto',           hint: 'Aislar un elemento: grifo, textura, herraje.',  ejemplo: 'acercate hasta que el objeto ocupe 80% del frame; movimiento minimo' },
    transicion:   { label: 'Transicion/puente',         hint: 'Toma puente para conectar dos espacios.',       ejemplo: 'toma continua cruzando el umbral o el pasillo; larga para el editor' },
    pov:          { label: 'Punto de vista/recorrido',  hint: 'Camara a la vista avanzando como el comprador.',ejemplo: 'ninja walk desde la puerta al centro del cuarto; camara a la altura de la vista' },
    contrapicado: { label: 'Contrapicado para amplitud',hint: 'Camara baja inclinada hacia arriba.',           ejemplo: 'camara al ras del piso o ~30cm apuntando al techo, vigas o candil' },
    ventana:      { label: 'Plano de ventana/vista',    hint: 'Prioriza la ventana y la vista exterior.',      ejemplo: 'ventana en el encuadre; expone para el exterior, no para el interior' },
    reveal:       { label: 'Revelacion',                hint: 'El espacio se descubre progresivamente.',       ejemplo: 'empieza detras de la puerta o mueble; cruza el umbral sin cortar' },
    simetrica:    { label: 'Toma simetrica',            hint: 'Composicion centrada sobre el eje del cuarto.',ejemplo: 'centra el eje del pasillo o la cocina; lineas arquitectonicas paralelas' },
    textura:      { label: 'Acercamiento de textura',   hint: 'Macro de material: piedra, madera, tela.',     ejemplo: 'macro del material hasta que llene todo el frame; desplazamiento muy lento' },
    exterior:     { label: 'Exterior/fachada',          hint: 'Vistas exteriores, fachada y entorno.',        ejemplo: 'propiedad completa desde altura media; cielo solo en el tercio superior' },
  });

  const MOVEMENTS = Object.freeze({
    // Los 7 movimientos reales user-facing (F15). NO borrar los demas: estado viejo
    // y sugerencias pueden referenciar ids historicos (static, dolly, umbral, etc.).
    push_pull:   { label: 'Push/Pull',                    hint: 'Movimiento de profundidad: acercarse o alejarse del foco.' },
    push_in:     { label: 'Push in',                      hint: 'Avanzar lento hacia un foco.' },
    pull_out:    { label: 'Pull out',                     hint: 'Retroceder lento revelando contexto.' },
    pan:         { label: 'Paneo',                        hint: 'Giro horizontal sobre eje fijo.' },
    tilt:        { label: 'Tilt',                         hint: 'Giro vertical (piso a techo).' },
    travel:      { label: 'Travel',                       hint: 'Desplazamiento fisico lateral de la camara.' },
    orbit:       { label: 'Órbita',                       hint: 'Movimiento circular alrededor de un punto.' },
    reveal:      { label: 'Reveal',                       hint: 'El espacio se descubre progresivamente.' },
    // Entradas historicas (no user-facing en el panel, conservadas por compatibilidad)
    static:      { label: 'Fija/estatica',                hint: 'Camara inmovil en tripie o gimbal bloqueado.' },
    dolly:       { label: 'Travelling/dolly',             hint: 'Desplazamiento fisico de la camara.' },
    gimbal_walk: { label: 'Caminata con gimbal',          hint: 'Ninja walk: rodillas flexionadas, paso suave.' },
    umbral:      { label: 'Revelacion tras umbral',       hint: 'Cruzar una puerta para descubrir el cuarto.' },
    parallax:    { label: 'Parallax',                     hint: 'Objeto en primer plano cruza mas rapido que el fondo.' },
    tilt_up:     { label: 'Revelacion vertical',          hint: 'Empezar bajo y subir para descubrir altura.' },
    slider:      { label: 'Slider lateral',               hint: 'Desplazamiento horizontal corto y suave.' },
    tracking:    { label: 'Seguimiento',                  hint: 'Acompanar un eje del cuarto avanzando.' },
    pedestal:    { label: 'Pies a cabeza',                hint: 'Tilt desde el piso subiendo para presentar.' },
    whip:        { label: 'Whip pan/transicion',          hint: 'Paneo rapido desenfocado entre cuartos.' },
  });

  // ─── Listas curadas user-facing para el panel "Etiquetar toma" (F15) ──────────
  // Plano: solo Abierto (general) y Detalle (detalle). El vocabulario es chico.
  // Movimiento: los 7 reales en el orden del mockup recomendacion.html.
  const CURATED_SHOT_TYPES = Object.freeze(['general', 'detalle']);
  const CURATED_MOVEMENTS = Object.freeze(['push_pull', 'pan', 'tilt', 'travel', 'orbit', 'reveal']);

  // ─── Sub-controles contextuales (F28): Sentido (Push/Pull) y Pared (Reveal) ───
  // Opcionales y aditivos. Ids del sistema sin acentos; labels visibles con acentos.
  const SENTIDO_OPTS = Object.freeze(['in', 'out']);
  const SENTIDO_LABELS = Object.freeze({ in: 'Push in', out: 'Pull out' });
  function sentidoLabel(id) { return SENTIDO_LABELS[id] || null; }

  const PARED_OPTS = Object.freeze(['izq', 'der']);
  const PARED_LABELS = Object.freeze({ izq: 'Izquierda', der: 'Derecha' });
  function paredLabel(id) { return PARED_LABELS[id] || null; }

  const GUIDE_LIBRARY = Object.freeze({
    entrada: { label: 'Entrada/recibidor', shots: Object.freeze([
      { id: 'entrada.push_in',    nombre: 'Push-in desde la puerta',           shotType: 'pov',         movement: 'gimbal_walk', enfoque: 'Encara la puerta y avanza para transicionar de afuera hacia adentro.',      priority: 'must' },
      { id: 'entrada.general',    nombre: 'Plano general del foyer',           shotType: 'general',     movement: 'static',      enfoque: 'Muestra el flujo hacia las demas areas; manten lineas rectas.',             priority: 'must' },
      { id: 'entrada.tilt_candil',nombre: 'Revelacion vertical de techo',      shotType: 'contrapicado',movement: 'tilt_up',     enfoque: 'Si hay doble altura o lampara, empieza bajo y sube.',                       priority: 'nice' },
      { id: 'entrada.detalle',    nombre: 'Detalle de acabado de entrada',     shotType: 'detalle',     movement: 'push_in',     enfoque: 'Herreria, puerta, consola o piso de entrada.',                              priority: 'nice' },
    ]) },
    sala: { label: 'Sala/estancia', shots: Object.freeze([
      { id: 'sala.wide',     nombre: 'Establecimiento de la sala',         shotType: 'wide',    movement: 'gimbal_walk', enfoque: 'Captura todo el cuarto para que imaginen sus muebles dentro.',       priority: 'must' },
      { id: 'sala.orbit',    nombre: 'Orbital sobre la zona de estar',     shotType: 'medio',   movement: 'orbit',       enfoque: 'Gira alrededor del foco (sillon o chimenea) manteniendo el centro.', priority: 'must' },
      { id: 'sala.ventana',  nombre: 'Plano de ventanas y luz',            shotType: 'ventana', movement: 'pan',         enfoque: 'Protege las altas luces de la ventana; vende la luz natural.',        priority: 'must' },
      { id: 'sala.parallax', nombre: 'Parallax con mueble en primer plano',shotType: 'general', movement: 'parallax',    enfoque: 'Deja un sillon cerca del lente para dar profundidad.',               priority: 'nice' },
      { id: 'sala.detalle',  nombre: 'Detalle de feature (chimenea)',      shotType: 'detalle', movement: 'push_in',     enfoque: 'Resalta el elemento estrella de la sala.',                           priority: 'nice' },
    ]) },
    comedor: { label: 'Comedor', shots: Object.freeze([
      { id: 'comedor.wide',       nombre: 'Establecimiento con la mesa',       shotType: 'wide',        movement: 'static',  enfoque: 'Composicion simetrica sobre el eje de la mesa.',           priority: 'must' },
      { id: 'comedor.orbit',      nombre: 'Orbital alrededor de la mesa',      shotType: 'medio',       movement: 'orbit',   enfoque: 'Mantiene el centro de mesa como punto focal.',             priority: 'must' },
      { id: 'comedor.tilt_candil',nombre: 'Revelacion vertical del candil',    shotType: 'contrapicado',movement: 'tilt_up', enfoque: 'Si hay lampara colgante, subela como protagonista.',        priority: 'nice' },
      { id: 'comedor.detalle',    nombre: 'Detalle de mesa puesta',            shotType: 'detalle',     movement: 'push_in', enfoque: 'Vende el estilo de vida, no solo el mueble.',              priority: 'nice' },
    ]) },
    cocina: { label: 'Cocina', shots: Object.freeze([
      { id: 'cocina.wide',        nombre: 'Establecimiento de la cocina',      shotType: 'wide',   movement: 'gimbal_walk', enfoque: 'Gran angular; manten verticales rectas.',                       priority: 'must' },
      { id: 'cocina.orbit_isla',  nombre: 'Orbital sobre la isla',             shotType: 'medio',  movement: 'orbit',       enfoque: 'La isla como punto focal; camara a la altura del pecho.',      priority: 'must' },
      { id: 'cocina.push_estufa', nombre: 'Push-in a estufa y campana',        shotType: 'medio',  movement: 'push_in',     enfoque: 'Feature principal y electrodomesticos de gama.',               priority: 'must' },
      { id: 'cocina.textura',     nombre: 'Detalle de acabados',               shotType: 'textura',movement: 'pan',         enfoque: 'Cubierta, backsplash, herrajes, grifo.',                       priority: 'nice' },
      { id: 'cocina.ventana',     nombre: 'Plano de ventana sobre el fregadero',shotType: 'ventana',movement: 'static',     enfoque: 'Exposicion cuidada hacia la ventana.',                          priority: 'nice' },
    ]) },
    recamara: { label: 'Recamara principal', shots: Object.freeze([
      { id: 'recamara.reveal',     nombre: 'Revelacion entrando a la recamara',shotType: 'reveal',    movement: 'umbral',      enfoque: 'Cruza la puerta para descubrir la recamara.',                     priority: 'must' },
      { id: 'recamara.wide',       nombre: 'Establecimiento del cuarto',       shotType: 'wide',      movement: 'gimbal_walk', enfoque: 'Muestra amplitud y luz; suficientes angulos en la suite.',        priority: 'must' },
      { id: 'recamara.orbit_cama', nombre: 'Orbital o push-in hacia la cama',  shotType: 'medio',     movement: 'orbit',       enfoque: 'Cama como foco; encuadre limpio y simetrico.',                    priority: 'must' },
      { id: 'recamara.ventana',    nombre: 'Plano de ventana y vista',         shotType: 'ventana',   movement: 'pan',         enfoque: 'Vende la vista y la luz matinal.',                                priority: 'nice' },
      { id: 'recamara.transicion', nombre: 'Transicion hacia bano o vestidor', shotType: 'transicion',movement: 'tracking',    enfoque: 'Toma larga para conectar la suite en el edit.',                   priority: 'nice' },
    ]) },
    recamara_sec: { label: 'Recamara secundaria', shots: Object.freeze([
      { id: 'recamara_sec.wide',   nombre: 'Establecimiento del cuarto',shotType: 'wide',   movement: 'static', enfoque: 'Solo 2-3 tomas; muestra tamano y luz.',            priority: 'must' },
      { id: 'recamara_sec.pan',    nombre: 'Paneo desde la esquina',    shotType: 'general',movement: 'pan',    enfoque: 'Camara baja para ver mas piso y menos techo.',     priority: 'must' },
      { id: 'recamara_sec.ventana',nombre: 'Plano de ventana',          shotType: 'ventana',movement: 'static', enfoque: 'Luz natural; expone para la ventana.',             priority: 'nice' },
    ]) },
    bano: { label: 'Bano completo', shots: Object.freeze([
      { id: 'bano.general',        nombre: 'Paneo desde tripode',                  shotType: 'general',movement: 'static',  enfoque: 'Usa tripie (no gimbal) para evitar aparecer en espejos.',    priority: 'must' },
      { id: 'bano.detalle_feature',nombre: 'Detalle de tina, regadera o lavabo',   shotType: 'detalle',movement: 'push_in', enfoque: 'El elemento estrella del bano.',                              priority: 'must' },
      { id: 'bano.textura',        nombre: 'Detalle de acabados',                  shotType: 'textura',movement: 'pan',     enfoque: 'Azulejo, grifos, herrajes; agachate para evitar reflejos.',  priority: 'nice' },
    ]) },
    medio_bano: { label: 'Medio bano', shots: Object.freeze([
      { id: 'medio_bano.general',nombre: 'Plano general unico',  shotType: 'general',movement: 'static',  enfoque: 'Una sola toma limpia; cuida el espejo. Omite si no aporta valor.',priority: 'must' },
      { id: 'medio_bano.detalle',nombre: 'Detalle de acabado',   shotType: 'detalle',movement: 'push_in', enfoque: 'Solo si el lavabo o tapiz es excepcional.',                       priority: 'nice' },
    ]) },
    vestidor: { label: 'Vestidor/closet', shots: Object.freeze([
      { id: 'vestidor.reveal',nombre: 'Revelacion entrando al vestidor',shotType: 'reveal', movement: 'push_in', enfoque: 'El closet debe verse organizado, no vacio.',               priority: 'must' },
      { id: 'vestidor.pan',   nombre: 'Paneo mostrando capacidad',      shotType: 'general',movement: 'pan',     enfoque: 'Resalta tamano y sistema de almacenamiento.',             priority: 'nice' },
      { id: 'vestidor.detalle',nombre: 'Detalle de organizacion',       shotType: 'detalle',movement: 'tilt',    enfoque: 'Solo si es walk-in destacado; salta closets comunes.',    priority: 'nice' },
    ]) },
    estudio: { label: 'Estudio/home office', shots: Object.freeze([
      { id: 'estudio.wide',  nombre: 'Establecimiento del espacio',   shotType: 'wide',   movement: 'gimbal_walk',enfoque: 'Vende funcionalidad y luz para trabajar.',                   priority: 'must' },
      { id: 'estudio.ventana',nombre: 'Plano de ventana y escritorio',shotType: 'ventana',movement: 'pan',        enfoque: 'Luz natural sobre el area de trabajo.',                     priority: 'nice' },
      { id: 'estudio.detalle',nombre: 'Detalle de built-ins',         shotType: 'detalle',movement: 'tilt_up',    enfoque: 'Estanteria empotrada o acabados de carpinteria.',           priority: 'nice' },
    ]) },
    lavado: { label: 'Cuarto de lavado', shots: Object.freeze([
      { id: 'lavado.general',nombre: 'Plano general',       shotType: 'general',movement: 'static', enfoque: 'Layout, lavadora/secadora y almacenamiento; manten orden.',           priority: 'must' },
      { id: 'lavado.detalle',nombre: 'Detalle de tarja',    shotType: 'detalle',movement: 'push_in',enfoque: 'Solo si tiene acabados o capacidad por encima del promedio.',          priority: 'nice' },
    ]) },
    pasillo: { label: 'Pasillo/escaleras', shots: Object.freeze([
      { id: 'pasillo.tracking',   nombre: 'Seguimiento por el pasillo',        shotType: 'transicion',  movement: 'tracking',    enfoque: 'Movimiento lento y controlado; toma larga para el edit.',         priority: 'must' },
      { id: 'pasillo.escaleras',  nombre: 'Subida de escaleras',               shotType: 'transicion',  movement: 'gimbal_walk', enfoque: 'Muestra los escalones y empieza a subir; corta antes del tramo.', priority: 'must' },
      { id: 'pasillo.tilt_hueco', nombre: 'Revelacion vertical del hueco',     shotType: 'contrapicado',movement: 'tilt_up',     enfoque: 'Doble altura, barandal o candil sobre la escalera.',             priority: 'nice' },
      { id: 'pasillo.simetrica',  nombre: 'Toma simetrica del pasillo',        shotType: 'simetrica',   movement: 'slider',      enfoque: 'Centra el eje; lineas rectas y limpias.',                         priority: 'nice' },
    ]) },
    family: { label: 'Family room/sala de TV', shots: Object.freeze([
      { id: 'family.wide',      nombre: 'Establecimiento del cuarto',          shotType: 'wide',      movement: 'gimbal_walk',enfoque: 'Amplitud y como conecta con cocina o sala.',            priority: 'must' },
      { id: 'family.orbit',     nombre: 'Orbital sobre la zona de estar',      shotType: 'medio',     movement: 'orbit',      enfoque: 'Punto focal en el sillon o centro de entretenimiento.', priority: 'must' },
      { id: 'family.parallax',  nombre: 'Parallax con mueble en primer plano', shotType: 'general',   movement: 'parallax',   enfoque: 'Profundidad y sensacion de espacio.',                   priority: 'nice' },
      { id: 'family.transicion',nombre: 'Transicion hacia espacio contiguo',   shotType: 'transicion',movement: 'tracking',   enfoque: 'Liga el concepto abierto en el edit.',                  priority: 'nice' },
    ]) },
    terraza: { label: 'Terraza/balcon', shots: Object.freeze([
      { id: 'terraza.reveal',  nombre: 'Revelacion saliendo al exterior',     shotType: 'reveal',  movement: 'umbral',  enfoque: 'Pasa de interior a exterior cuidando la exposicion.',      priority: 'must' },
      { id: 'terraza.vista',   nombre: 'Plano general del exterior y vista',  shotType: 'ventana', movement: 'pan',     enfoque: 'Vende la vista, jardin o paisaje.',                        priority: 'must' },
      { id: 'terraza.detalle', nombre: 'Detalle de feature exterior',         shotType: 'detalle', movement: 'push_in', enfoque: 'Mobiliario, asador, jardineria o piso de terraza.',        priority: 'nice' },
      { id: 'terraza.parallax',nombre: 'Parallax con barandal o planta',      shotType: 'general', movement: 'parallax',enfoque: 'Profundidad entre balcon y horizonte.',                    priority: 'nice' },
    ]) },
    garaje: { label: 'Garaje/cochera', shots: Object.freeze([
      { id: 'garaje.general',nombre: 'Plano general del garaje',shotType: 'general',  movement: 'static',      enfoque: 'Capacidad (numero de autos), limpio y despejado.',        priority: 'must' },
      { id: 'garaje.tracking',nombre: 'Seguimiento de entrada', shotType: 'transicion',movement: 'gimbal_walk', enfoque: 'Conexion del garaje con el acceso interior.',             priority: 'nice' },
    ]) },
    bodega: { label: 'Bodega/cuarto de servicio', shots: Object.freeze([
      { id: 'bodega.general',nombre: 'Plano general',            shotType: 'general',movement: 'static', enfoque: 'Capacidad de almacenamiento; orden y limpieza. Omite si no aporta valor.',priority: 'must' },
      { id: 'bodega.detalle',nombre: 'Detalle de instalaciones', shotType: 'detalle',movement: 'push_in',enfoque: 'Solo si tiene equipo o acabados relevantes.',                               priority: 'nice' },
    ]) },
    generico: { label: 'Espacio generico', shots: Object.freeze([
      { id: 'generico.wide',nombre: 'Plano abierto del espacio',shotType: 'wide',movement: 'static',enfoque: 'Captura el espacio completo para dar contexto.',priority: 'must' },
    ]) },
  });

  const DRONE_GUIDE = Object.freeze({
    casa: { label: 'Casa', shots: Object.freeze([
      { id: 'drone.casa.fachada',    nombre: 'Establecimiento de fachada',  shotType: 'exterior',movement: 'static',  enfoque: 'Encuadra la propiedad completa desde altura media.',             priority: 'must' },
      { id: 'drone.casa.orbit',      nombre: 'Orbita 360 grados',           shotType: 'exterior',movement: 'orbit',   enfoque: 'Orbita completa alrededor de la propiedad.',                     priority: 'must' },
      { id: 'drone.casa.cenital',    nombre: 'Cenital del lote',            shotType: 'exterior',movement: 'static',  enfoque: 'Top-down mostrando dimension y distribucion del terreno.',        priority: 'must' },
      { id: 'drone.casa.fly_in',     nombre: 'Acercamiento a la entrada',   shotType: 'exterior',movement: 'push_in', enfoque: 'Desciende hacia la puerta principal.',                            priority: 'nice' },
      { id: 'drone.casa.vecindario', nombre: 'Vista de vecindario',         shotType: 'exterior',movement: 'pan',     enfoque: 'Contexto de plusvalia y entorno inmediato.',                      priority: 'nice' },
    ]) },
    lujo: { label: 'Lujo/acreage', shots: Object.freeze([
      { id: 'drone.lujo.reveal',    nombre: 'Revelacion de la finca',      shotType: 'reveal',  movement: 'tilt_up', enfoque: 'Tilt ascendente que descubre la propiedad completa.',             priority: 'must' },
      { id: 'drone.lujo.orbit',     nombre: 'Orbita amplia',               shotType: 'exterior',movement: 'orbit',   enfoque: 'Radio mayor para mostrar toda la extension.',                    priority: 'must' },
      { id: 'drone.lujo.cenital',   nombre: 'Cenital de amenidades',       shotType: 'exterior',movement: 'static',  enfoque: 'Top-down sobre alberca, jardin y areas sociales.',               priority: 'must' },
      { id: 'drone.lujo.flythrough',nombre: 'Fly-through de amenidades',   shotType: 'pov',     movement: 'dolly',   enfoque: 'Vuela a baja altura entre amenidades.',                           priority: 'nice' },
      { id: 'drone.lujo.pullout',   nombre: 'Pull-out final',              shotType: 'exterior',movement: 'pull_out',enfoque: 'Aleja ascendiendo para el plano de cierre.',                      priority: 'nice' },
      { id: 'drone.lujo.parallax',  nombre: 'Parallax de acceso',          shotType: 'exterior',movement: 'parallax',enfoque: 'Vuela paralelo al camino de acceso.',                             priority: 'nice' },
    ]) },
    departamento: { label: 'Departamento/torre', shots: Object.freeze([
      { id: 'drone.departamento.ascenso', nombre: 'Ascenso frente al edificio',shotType: 'exterior',movement: 'tilt_up',enfoque: 'Comienza bajo y sube siguiendo la fachada de la torre.',      priority: 'must' },
      { id: 'drone.departamento.vista',   nombre: 'Revelacion de la vista',    shotType: 'reveal',  movement: 'pan',    enfoque: 'Vende las vistas panoramicas como argumento principal.',      priority: 'must' },
      { id: 'drone.departamento.orbit',   nombre: 'Orbita del balcon',         shotType: 'exterior',movement: 'orbit',  enfoque: 'Orbita cerrada al nivel del penthouse o balcon.',             priority: 'nice' },
      { id: 'drone.departamento.urbano',  nombre: 'Contexto urbano',           shotType: 'exterior',movement: 'pan',    enfoque: 'Paneo desde altura mostrando la ubicacion en la ciudad.',     priority: 'nice' },
    ]) },
    waterfront: { label: 'Waterfront/frente al agua', shots: Object.freeze([
      { id: 'drone.waterfront.reveal',   nombre: 'Revelacion del agua',          shotType: 'reveal',  movement: 'tilt_up', enfoque: 'Tilt desde la propiedad hacia el cuerpo de agua.',               priority: 'must' },
      { id: 'drone.waterfront.orbit',    nombre: 'Orbita con agua de fondo',     shotType: 'exterior',movement: 'orbit',   enfoque: 'Orbita para que el agua aparezca siempre al fondo.',             priority: 'must' },
      { id: 'drone.waterfront.cenital',  nombre: 'Cenital de muelle y acceso',   shotType: 'exterior',movement: 'static',  enfoque: 'Top-down mostrando muelle, embarcadero o acceso al agua.',       priority: 'must' },
      { id: 'drone.waterfront.paralelo', nombre: 'Vuelo paralelo a la costa',    shotType: 'exterior',movement: 'tracking',enfoque: 'Vuela a lo largo de la orilla manteniendo altura constante.',     priority: 'nice' },
      { id: 'drone.waterfront.dronie',   nombre: 'Dronie sobre el agua',         shotType: 'reveal',  movement: 'pull_out',enfoque: 'Pull-out alejandose con la propiedad al fondo.',                  priority: 'nice' },
    ]) },
    terreno: { label: 'Terreno/lote', shots: Object.freeze([
      { id: 'drone.terreno.cenital',         nombre: 'Cenital de limites',         shotType: 'exterior',movement: 'static',  enfoque: 'Top-down mostrando la forma y dimension del lote.',           priority: 'must' },
      { id: 'drone.terreno.establecimiento', nombre: 'Establecimiento desde altura',shotType: 'exterior',movement: 'static',  enfoque: 'Muestra el terreno en su contexto de vecindario.',           priority: 'must' },
      { id: 'drone.terreno.paneo',           nombre: 'Paneo de contexto',          shotType: 'exterior',movement: 'pan',     enfoque: 'Muestra entorno, vialidades y plusvalia del sector.',         priority: 'must' },
      { id: 'drone.terreno.perimetro',       nombre: 'Vuelo de perimetro',         shotType: 'exterior',movement: 'tracking',enfoque: 'Recorre el perimetro del lote de cerca.',                     priority: 'nice' },
      { id: 'drone.terreno.caracteristicas', nombre: 'Cenital de caracteristicas', shotType: 'exterior',movement: 'static',  enfoque: 'Top-down sobre hitos relevantes del lote.',                  priority: 'nice' },
    ]) },
    quinta: { label: 'Quinta/rancho/finca', shots: Object.freeze([
      { id: 'drone.quinta.establecimiento',nombre: 'Establecimiento del conjunto',  shotType: 'exterior',movement: 'static',  enfoque: 'Encuadre amplio que muestre la totalidad de la finca.',    priority: 'must' },
      { id: 'drone.quinta.cenital',        nombre: 'Cenital de la extension',       shotType: 'exterior',movement: 'static',  enfoque: 'Top-down mostrando toda la dimension del predio.',         priority: 'must' },
      { id: 'drone.quinta.orbit',          nombre: 'Orbita de la casa principal',   shotType: 'exterior',movement: 'orbit',   enfoque: 'Orbita cerrada alrededor de la edificacion principal.',    priority: 'must' },
      { id: 'drone.quinta.agua',           nombre: 'Vuelo hacia fuentes de agua',   shotType: 'exterior',movement: 'dolly',   enfoque: 'Avanza hacia rio, lago, manantial o alberca exterior.',    priority: 'nice' },
      { id: 'drone.quinta.pullout',        nombre: 'Pull-out panoramico',           shotType: 'exterior',movement: 'pull_out',enfoque: 'Aleja ascendiendo para el plano de cierre.',               priority: 'nice' },
    ]) },
    comercial: { label: 'Comercial/industrial', shots: Object.freeze([
      { id: 'drone.comercial.cenital',         nombre: 'Cenital del predio',           shotType: 'exterior',movement: 'static',  enfoque: 'Top-down mostrando ubicacion y dimension del inmueble.',    priority: 'must' },
      { id: 'drone.comercial.establecimiento', nombre: 'Establecimiento con acceso',   shotType: 'exterior',movement: 'static',  enfoque: 'Fachada, acceso vehicular y peatonal.',                     priority: 'must' },
      { id: 'drone.comercial.orbit',           nombre: 'Orbita del inmueble',          shotType: 'exterior',movement: 'orbit',   enfoque: 'Orbita completa del edificio o local.',                     priority: 'must' },
      { id: 'drone.comercial.contexto',        nombre: 'Contexto de infraestructura',  shotType: 'exterior',movement: 'pan',     enfoque: 'Vialidades, accesos, estacionamiento y zona comercial.',   priority: 'must' },
      { id: 'drone.comercial.logistica',       nombre: 'Vuelo de logistica',           shotType: 'exterior',movement: 'tracking',enfoque: 'Muestra accesos de carga, patio de maniobras o bodega.',   priority: 'nice' },
    ]) },
  });

  // ─── F17 — Vocabulario aereo propio (tomas de drone) ──────────────────────────
  // Tipos de toma aereos, independientes de SHOT_TYPES (que es para video/foto).
  // Aditivo: no reemplaza SHOT_TYPES ni MOVEMENTS; los ids no chocan con ellos.
  const DRONE_SHOT_TYPES = Object.freeze({
    establecimiento: { label: 'Establecimiento',  hint: 'Encuadra la propiedad completa desde altura media.' },
    orbita:          { label: 'Órbita',           hint: 'Vuelo circular alrededor del sujeto.' },
    cenital:         { label: 'Cenital',          hint: 'Top-down mostrando dimensión y distribución.' },
    reveal_aereo:    { label: 'Reveal aéreo',     hint: 'El sujeto se descubre subiendo o avanzando.' },
    fly_through:     { label: 'Fly-through',      hint: 'Vuelo continuo a baja altura cruzando el espacio.' },
    empuje_acceso:   { label: 'Empuje al acceso', hint: 'Desciende y avanza hacia el acceso principal.' },
    entorno:         { label: 'Entorno',          hint: 'Paneo de contexto: colonia, vialidades, plusvalía.' },
  });

  // ─── F17 — Biblioteca de sujetos aereos ───────────────────────────────────────
  // Cada sujeto trae sus tomas aereas sugeridas (shotType apunta a DRONE_SHOT_TYPES).
  // keywords sirven para emparejar el nombre de un espacio del piso Drone con su sujeto.
  const AERIAL_SUBJECTS = Object.freeze({
    fachada_aerea: { label: 'Fachada aérea', keywords: ['fachada'], shots: Object.freeze([
      { id: 'aereo.fachada.establecimiento', nombre: 'Establecimiento de fachada', shotType: 'establecimiento', movement: 'static',  enfoque: 'Propiedad completa desde altura media.',          priority: 'must' },
      { id: 'aereo.fachada.empuje',          nombre: 'Empuje hacia la fachada',    shotType: 'empuje_acceso',   movement: 'push_in', enfoque: 'Desciende y avanza hacia el frente.',              priority: 'nice' },
    ]) },
    orbita_casa: { label: 'Órbita de la casa', keywords: ['orbita', 'órbita', 'casa'], shots: Object.freeze([
      { id: 'aereo.orbita.completa', nombre: 'Órbita 360 grados', shotType: 'orbita', movement: 'orbit', enfoque: 'Órbita completa alrededor de la propiedad.', priority: 'must' },
      { id: 'aereo.orbita.cenital',  nombre: 'Cenital del lote',  shotType: 'cenital',movement: 'static',enfoque: 'Top-down mostrando distribución del terreno.', priority: 'nice' },
    ]) },
    entorno_colonia: { label: 'Entorno / colonia', keywords: ['entorno', 'colonia', 'ubicacion', 'ubicación', 'vecindario'], shots: Object.freeze([
      { id: 'aereo.entorno.paneo',   nombre: 'Paneo de contexto', shotType: 'entorno', movement: 'pan', enfoque: 'Colonia, vialidades y plusvalía del sector.', priority: 'must' },
    ]) },
    vista_que_vende: { label: 'Vista que vende', keywords: ['vista'], shots: Object.freeze([
      { id: 'aereo.vista.reveal', nombre: 'Reveal de la vista', shotType: 'reveal_aereo', movement: 'tilt', enfoque: 'Descubre la vista panorámica como argumento de venta.', priority: 'must' },
    ]) },
    jardin_aereo: { label: 'Jardín aéreo', keywords: ['jardin', 'jardín'], shots: Object.freeze([
      { id: 'aereo.jardin.cenital',     nombre: 'Cenital del jardín',     shotType: 'cenital',     movement: 'static', enfoque: 'Top-down mostrando extensión de las áreas verdes.', priority: 'must' },
      { id: 'aereo.jardin.flythrough',  nombre: 'Fly-through del jardín',  shotType: 'fly_through', movement: 'travel', enfoque: 'Vuela a baja altura entre la vegetación.',          priority: 'nice' },
    ]) },
    alberca_aerea: { label: 'Alberca aérea', keywords: ['alberca', 'piscina'], shots: Object.freeze([
      { id: 'aereo.alberca.cenital', nombre: 'Cenital de la alberca', shotType: 'cenital', movement: 'static', enfoque: 'Top-down sobre el vaso y el área social.', priority: 'must' },
      { id: 'aereo.alberca.reveal',  nombre: 'Reveal del agua',       shotType: 'reveal_aereo', movement: 'pull_out', enfoque: 'Aleja ascendiendo descubriendo la alberca.', priority: 'nice' },
    ]) },
    roof_terraza: { label: 'Roof / terraza', keywords: ['roof', 'terraza', 'azotea'], shots: Object.freeze([
      { id: 'aereo.roof.reveal',  nombre: 'Reveal de la terraza', shotType: 'reveal_aereo', movement: 'tilt',  enfoque: 'Descubre el roof y su vista.',           priority: 'must' },
      { id: 'aereo.roof.orbita',  nombre: 'Órbita del roof',      shotType: 'orbita',       movement: 'orbit', enfoque: 'Órbita cerrada al nivel de la terraza.', priority: 'nice' },
    ]) },
    golden_hour: { label: 'Golden hour', keywords: ['golden', 'atardecer'], shots: Object.freeze([
      { id: 'aereo.golden.establecimiento', nombre: 'Establecimiento al atardecer', shotType: 'establecimiento', movement: 'static', enfoque: 'Luz cálida del atardecer sobre la propiedad.', priority: 'must' },
      { id: 'aereo.golden.orbita',          nombre: 'Órbita con sol bajo',          shotType: 'orbita',         movement: 'orbit',  enfoque: 'Órbita aprovechando los reflejos de la hora dorada.', priority: 'nice' },
    ]) },
    terreno_completo: { label: 'Terreno completo', keywords: ['terreno'], shots: Object.freeze([
      { id: 'aereo.terreno.cenital',         nombre: 'Cenital de límites',          shotType: 'cenital',        movement: 'static', enfoque: 'Top-down mostrando forma y dimensión del lote.', priority: 'must' },
      { id: 'aereo.terreno.establecimiento', nombre: 'Establecimiento desde altura', shotType: 'establecimiento', movement: 'static', enfoque: 'Muestra el terreno en su contexto.',             priority: 'must' },
    ]) },
    perimetro_colindancias: { label: 'Perímetro / colindancias', keywords: ['perimetro', 'perímetro', 'colindancia', 'colindancias'], shots: Object.freeze([
      { id: 'aereo.perimetro.vuelo', nombre: 'Vuelo de perímetro', shotType: 'fly_through', movement: 'travel', enfoque: 'Recorre el perímetro mostrando colindancias.', priority: 'must' },
    ]) },
    acceso_calle: { label: 'Acceso / calle', keywords: ['acceso', 'calle', 'entrada'], shots: Object.freeze([
      { id: 'aereo.acceso.empuje', nombre: 'Empuje al acceso', shotType: 'empuje_acceso', movement: 'push_in', enfoque: 'Desciende hacia el acceso principal desde la calle.', priority: 'must' },
    ]) },
    cercania_vialidades: { label: 'Cercanía a vialidades', keywords: ['vialidad', 'vialidades', 'avenida', 'carretera'], shots: Object.freeze([
      { id: 'aereo.vialidades.entorno', nombre: 'Entorno de vialidades', shotType: 'entorno', movement: 'pan', enfoque: 'Muestra cercanía a avenidas y conectividad.', priority: 'must' },
    ]) },
  });

  // ─── F17 (A) — Sesgo de sujetos aereos por tipo de propiedad ──────────────────
  // Ids de AERIAL_SUBJECTS en orden de prioridad por tipo. casa es el fallback.
  const AERIAL_SUBJECTS_BY_PROPERTY = Object.freeze({
    casa:         Object.freeze(['fachada_aerea', 'orbita_casa', 'jardin_aereo', 'entorno_colonia', 'vista_que_vende', 'golden_hour']),
    departamento: Object.freeze(['fachada_aerea', 'roof_terraza', 'entorno_colonia', 'vista_que_vende', 'golden_hour']),
    quinta:       Object.freeze(['terreno_completo', 'alberca_aerea', 'jardin_aereo', 'orbita_casa', 'entorno_colonia']),
    terreno:      Object.freeze(['terreno_completo', 'perimetro_colindancias', 'cercania_vialidades', 'acceso_calle', 'entorno_colonia']),
  });

  // ─── F34 — Escalas de drone ───────────────────────────────────────────────────
  // El drone deja de ser un piso con pseudo-cuartos y pasa a ser una lane por
  // escalas. ids sin acentos; labels con acentos. amenidades trae appliesWhen para
  // que F35 decida (privada/coto/depto). Aditivo: no reemplaza nada.
  const DRONE_SCALES = Object.freeze([
    Object.freeze({ id: 'propiedad',  label: 'Propiedad' }),
    Object.freeze({ id: 'amenidades', label: 'Amenidades', appliesWhen: Object.freeze(['privada', 'coto', 'departamento']) }),
    Object.freeze({ id: 'inmediato',  label: 'Inmediato / colonia' }),
    Object.freeze({ id: 'ubicacion',  label: 'Ubicación / contexto' }),
  ]);

  // ─── F34 — Pool de tomas aereas (EXTIENDE AERIAL_SUBJECTS, no lo reemplaza) ────
  // Catalogo plano de tomas aereas sugeridas. Cada toma:
  //   { id, label, shotType, movement, scale, must, tipos, situacional? }
  //   - id: sin acentos; label: con acentos (texto visible).
  //   - shotType: id de DRONE_SHOT_TYPES.
  //   - scale: id de DRONE_SCALES.
  //   - tipos: ['casa'|'quinta'|'departamento'|'terreno'|'all'].
  //   - feature (opcional): asocia la toma al vocabulario aereo de un feature
  //     derivado (alberca, jardin, roof…) para suggestionsForTarget de F35.
  // SIN golden hour (se elimina del vocabulario sugerido nuevo; el sujeto viejo
  // golden_hour permanece en AERIAL_SUBJECTS solo por compatibilidad de ids).
  // Los ids aereos viejos (aereo.*) NO se tocan: siguen en AERIAL_SUBJECTS y
  // findSuggestion debe resolverlos. Aqui usamos ids nuevos pool.aereo.* para no
  // chocar con ellos.
  const AERIAL_POOL = Object.freeze([
    // ── Canonica: Salida a contexto (must en TODOS los tipos) ──────────────────
    // La porta un target FIJO property-wide (scale 'propiedad'); es la toma de
    // cierre / reveal en reversa. Absorbe los "Reveal de la casa/lote/quinta".
    Object.freeze({ id: 'pool.aereo.salida_contexto', label: 'Salida a contexto', shotType: 'reveal_aereo', movement: 'pull_out', scale: 'propiedad', must: true, tipos: Object.freeze(['all']) }),

    // ── Propiedad — property-wide (casa/quinta/departamento) ───────────────────
    Object.freeze({ id: 'pool.aereo.fachada_aerea',      label: 'Fachada aérea',           shotType: 'establecimiento', movement: 'static',  scale: 'propiedad', must: true,  tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.orbita_casa',        label: 'Órbita de la casa',       shotType: 'orbita',          movement: 'orbit',   scale: 'propiedad', must: true,  tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.cenital_giratorio',  label: 'Cenital giratorio',       shotType: 'cenital',         movement: 'orbit',   scale: 'propiedad', must: true,  tipos: Object.freeze(['casa', 'quinta']) }),
    Object.freeze({ id: 'pool.aereo.contrapicado_fachada', label: 'Contrapicado de fachada', shotType: 'reveal_aereo', movement: 'tilt',    scale: 'propiedad', must: false, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.orbita_ascendente',  label: 'Órbita ascendente',       shotType: 'orbita',          movement: 'orbit',   scale: 'propiedad', must: false, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.fly_through',        label: 'Fly-through',              shotType: 'fly_through',     movement: 'travel',  scale: 'propiedad', must: false, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.reveal_primer_plano', label: 'Reveal con primer plano', shotType: 'reveal_aereo',  movement: 'parallax',scale: 'propiedad', must: false, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.reveal_barda',      label: 'Reveal sobre barda',       shotType: 'reveal_aereo',    movement: 'tilt',    scale: 'propiedad', must: false, tipos: Object.freeze(['casa']), situacional: true }),
    Object.freeze({ id: 'pool.aereo.roof_azotea',       label: 'Roof / azotea',            shotType: 'reveal_aereo',    movement: 'tilt',    scale: 'propiedad', must: false, tipos: Object.freeze(['casa']), feature: 'roof' }),
    Object.freeze({ id: 'pool.aereo.vista_que_vende',   label: 'Vista que vende',          shotType: 'reveal_aereo',    movement: 'tilt',    scale: 'propiedad', must: false, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.patio_jardin_alberca', label: 'Patio / jardín / alberca aéreo', shotType: 'cenital', movement: 'static', scale: 'propiedad', must: false, derivable: true, tipos: Object.freeze(['casa']) }),

    // Quinta — property-wide
    Object.freeze({ id: 'pool.aereo.orbita_propiedad',  label: 'Órbita de la propiedad',   shotType: 'orbita',          movement: 'orbit',   scale: 'propiedad', must: true,  tipos: Object.freeze(['quinta']) }),
    Object.freeze({ id: 'pool.aereo.alberca_palapa',    label: 'Alberca / palapa aérea',   shotType: 'cenital',         movement: 'static',  scale: 'propiedad', must: true,  tipos: Object.freeze(['quinta']), feature: 'alberca' }),
    Object.freeze({ id: 'pool.aereo.casa_principal',    label: 'Casa principal / fachada aérea', shotType: 'establecimiento', movement: 'static', scale: 'propiedad', must: false, tipos: Object.freeze(['quinta']) }),
    Object.freeze({ id: 'pool.aereo.jardines',          label: 'Jardines / áreas verdes',  shotType: 'cenital',         movement: 'static',  scale: 'propiedad', must: false, tipos: Object.freeze(['quinta']), feature: 'jardin' }),
    Object.freeze({ id: 'pool.aereo.cancha_cabanas',    label: 'Cancha / cabañas / área de evento', shotType: 'establecimiento', movement: 'static', scale: 'propiedad', must: false, derivable: true, tipos: Object.freeze(['quinta']) }),
    Object.freeze({ id: 'pool.aereo.vista_terraza',     label: 'Vista desde terraza',      shotType: 'reveal_aereo',    movement: 'tilt',    scale: 'propiedad', must: false, tipos: Object.freeze(['quinta']) }),
    Object.freeze({ id: 'pool.aereo.reveal_vista',      label: 'Reveal de la vista',       shotType: 'reveal_aereo',    movement: 'tilt',    scale: 'propiedad', must: false, tipos: Object.freeze(['quinta', 'departamento']) }),

    // Departamento — edificio (Propiedad)
    Object.freeze({ id: 'pool.aereo.exterior_edificio', label: 'Exterior del edificio',    shotType: 'establecimiento', movement: 'static',  scale: 'propiedad', must: true,  tipos: Object.freeze(['departamento']) }),
    Object.freeze({ id: 'pool.aereo.vista_altura',      label: 'La vista desde esa altura', shotType: 'reveal_aereo',   movement: 'tilt',    scale: 'propiedad', must: true,  tipos: Object.freeze(['departamento']) }),
    Object.freeze({ id: 'pool.aereo.balcon_terraza',    label: 'El balcón / terraza desde fuera', shotType: 'reveal_aereo', movement: 'static', scale: 'propiedad', must: false, tipos: Object.freeze(['departamento']) }),

    // ── Amenidades ─────────────────────────────────────────────────────────────
    // Casa (si privada/coto)
    Object.freeze({ id: 'pool.aereo.casa_club',         label: 'Casa club',                shotType: 'establecimiento', movement: 'static',  scale: 'amenidades', must: false, derivable: true, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.alberca_comun',     label: 'Alberca común',            shotType: 'cenital',         movement: 'static',  scale: 'amenidades', must: false, tipos: Object.freeze(['casa']), feature: 'alberca' }),
    Object.freeze({ id: 'pool.aereo.areas_verdes',      label: 'Áreas verdes',             shotType: 'cenital',         movement: 'static',  scale: 'amenidades', must: false, tipos: Object.freeze(['casa']), feature: 'jardin' }),
    // Departamento (amenidades del edificio)
    Object.freeze({ id: 'pool.aereo.roof_garden',       label: 'Roof garden / terraza común', shotType: 'reveal_aereo', movement: 'tilt',  scale: 'amenidades', must: true,  tipos: Object.freeze(['departamento']), feature: 'roof' }),
    Object.freeze({ id: 'pool.aereo.alberca_comunes',   label: 'Alberca / áreas comunes',  shotType: 'cenital',         movement: 'static',  scale: 'amenidades', must: false, tipos: Object.freeze(['departamento']), feature: 'alberca' }),
    Object.freeze({ id: 'pool.aereo.lobby_acceso',      label: 'Lobby / acceso',           shotType: 'empuje_acceso',   movement: 'push_in', scale: 'amenidades', must: false, derivable: true, tipos: Object.freeze(['departamento']) }),

    // ── Inmediato / colonia (targets fijos) ────────────────────────────────────
    Object.freeze({ id: 'pool.aereo.calle_acceso',      label: 'Calle y acceso',           shotType: 'empuje_acceso',   movement: 'push_in', scale: 'inmediato', must: false, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.cuadra_vecindario', label: 'La cuadra / vecindario',   shotType: 'entorno',         movement: 'pan',     scale: 'inmediato', must: false, tipos: Object.freeze(['casa']) }),
    Object.freeze({ id: 'pool.aereo.acceso_caseta',     label: 'Acceso / caseta / entrada', shotType: 'empuje_acceso',  movement: 'push_in', scale: 'inmediato', must: false, tipos: Object.freeze(['quinta']) }),
    Object.freeze({ id: 'pool.aereo.entorno_natural',   label: 'Entorno natural',          shotType: 'entorno',         movement: 'pan',     scale: 'inmediato', must: false, tipos: Object.freeze(['quinta']) }),
    Object.freeze({ id: 'pool.aereo.zona_colonia',      label: 'La zona / colonia',        shotType: 'entorno',         movement: 'pan',     scale: 'inmediato', must: true,  tipos: Object.freeze(['departamento']) }),
    Object.freeze({ id: 'pool.aereo.la_calle',          label: 'La calle',                 shotType: 'entorno',         movement: 'pan',     scale: 'inmediato', must: false, tipos: Object.freeze(['departamento']) }),

    // ── Ubicación / contexto (targets fijos) ───────────────────────────────────
    Object.freeze({ id: 'pool.aereo.ubicacion_ciudad',  label: 'Ubicación en la ciudad',   shotType: 'entorno',         movement: 'pan',     scale: 'ubicacion', must: false, tipos: Object.freeze(['casa', 'departamento']) }),
    Object.freeze({ id: 'pool.aereo.cercania_vialidades', label: 'Cercanía a vialidades',  shotType: 'entorno',         movement: 'pan',     scale: 'ubicacion', must: false, tipos: Object.freeze(['casa', 'departamento']) }),
    Object.freeze({ id: 'pool.aereo.hito',              label: 'Hito',                     shotType: 'entorno',         movement: 'pan',     scale: 'ubicacion', must: false, tipos: Object.freeze(['casa', 'departamento']) }),
    Object.freeze({ id: 'pool.aereo.como_se_llega',     label: 'Cómo se llega',            shotType: 'entorno',         movement: 'pan',     scale: 'ubicacion', must: false, tipos: Object.freeze(['quinta']) }),
    Object.freeze({ id: 'pool.aereo.ubicacion_regional', label: 'Ubicación regional',      shotType: 'entorno',         movement: 'pan',     scale: 'ubicacion', must: false, tipos: Object.freeze(['quinta']) }),

    // ── Terreno — lista única (14; sin sesgo por subtipo) ──────────────────────
    // Must (7): cenital de limites, establecimiento, referencia de escala,
    // acceso/frente, vista que vende, donde iria la casa, salida a contexto.
    Object.freeze({ id: 'pool.aereo.terreno.cenital_limites',  label: 'Cenital de límites',                shotType: 'cenital',        movement: 'static',  scale: 'propiedad', must: true,  tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.establecimiento',  label: 'Establecimiento desde altura',      shotType: 'establecimiento',movement: 'static',  scale: 'propiedad', must: true,  tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.referencia_escala', label: 'Referencia de escala',             shotType: 'establecimiento',movement: 'static',  scale: 'propiedad', must: true,  tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.acceso_frente',    label: 'Acceso / frente a calle',           shotType: 'empuje_acceso',  movement: 'push_in', scale: 'inmediato', must: true,  tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.vista_que_vende',  label: 'Vista que vende',                   shotType: 'reveal_aereo',   movement: 'tilt',    scale: 'propiedad', must: true,  tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.donde_iria_casa',  label: 'Dónde iría la casa',                shotType: 'cenital',        movement: 'static',  scale: 'propiedad', must: true,  tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.salida_contexto',  label: 'Salida a contexto',                 shotType: 'reveal_aereo',   movement: 'pull_out',scale: 'propiedad', must: true,  tipos: Object.freeze(['terreno']) }),
    // Opcionales (7).
    Object.freeze({ id: 'pool.aereo.terreno.orbita',          label: 'Órbita del terreno',                shotType: 'orbita',         movement: 'orbit',   scale: 'propiedad', must: false, tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.topografia',      label: 'Topografía / barrido lateral',      shotType: 'fly_through',    movement: 'travel',  scale: 'propiedad', must: false, tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.fly_through',     label: 'Fly-through del lote',               shotType: 'fly_through',    movement: 'travel',  scale: 'propiedad', must: false, tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.cercania_vialidades', label: 'Cercanía a vialidades',         shotType: 'entorno',        movement: 'pan',     scale: 'ubicacion', must: false, tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.hito',           label: 'Referencia a un hito',               shotType: 'entorno',        movement: 'pan',     scale: 'ubicacion', must: false, tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.entorno_vecino', label: 'Entorno / desarrollo vecino',        shotType: 'entorno',        movement: 'pan',     scale: 'inmediato', must: false, tipos: Object.freeze(['terreno']) }),
    Object.freeze({ id: 'pool.aereo.terreno.perimetro',      label: 'Perímetro / colindancias',           shotType: 'fly_through',    movement: 'travel',  scale: 'propiedad', must: false, tipos: Object.freeze(['terreno']) }),
  // Cada toma expone `nombre` (= `label`): el resto del motor, la UI (capa de
  // sugeridas) y el export resuelven el texto visible por `nombre`. Sin esto, las
  // sugeridas del pool mostraban el id crudo (p.ej. "pool.aereo.terreno.cenital_limites").
  ].map((shot) => Object.freeze(Object.assign({ nombre: shot.label }, shot))));

  // ─── F34 — Catalogo de movimientos "standout" reutilizables por feature ───────
  // Vocabulario aereo compartido que un feature derivado (alberca, jardin, roof…)
  // puede ofrecer. Cada entrada apunta a una toma del AERIAL_POOL por id; el
  // vocabulario base es comun, sesgado por feature donde aplica.
  const AERIAL_STANDOUT_MOVES = Object.freeze([
    Object.freeze({ id: 'pool.aereo.cenital_giratorio',   feature: 'all' }),
    Object.freeze({ id: 'pool.aereo.orbita_ascendente',   feature: 'all' }),
    Object.freeze({ id: 'pool.aereo.fly_through',         feature: 'all' }),
    Object.freeze({ id: 'pool.aereo.contrapicado_fachada', feature: 'fachada' }),
    Object.freeze({ id: 'pool.aereo.reveal_primer_plano', feature: 'all' }),
    Object.freeze({ id: 'pool.aereo.vista_terraza',      feature: 'terraza' }),
    Object.freeze({ id: 'pool.aereo.reveal_vista',       feature: 'vista' }),
    Object.freeze({ id: 'pool.aereo.reveal_barda',       feature: 'barda', situacional: true }),
  ]);

  // Vocabulario aereo por feature derivado (alberca, jardin, roof, terraza…).
  // Tomas base comunes + sesgo por feature. Se usa en suggestionsForTarget para
  // un target derivado de un espacio real (p. ej. "Alberca aérea").
  const AERIAL_FEATURE_VOCAB = Object.freeze({
    alberca: Object.freeze(['pool.aereo.patio_jardin_alberca', 'pool.aereo.alberca_palapa', 'pool.aereo.cenital_giratorio', 'pool.aereo.orbita_ascendente', 'pool.aereo.reveal_primer_plano']),
    jardin:  Object.freeze(['pool.aereo.jardines', 'pool.aereo.cenital_giratorio', 'pool.aereo.fly_through', 'pool.aereo.reveal_primer_plano']),
    roof:    Object.freeze(['pool.aereo.roof_garden', 'pool.aereo.roof_azotea', 'pool.aereo.vista_terraza', 'pool.aereo.reveal_vista', 'pool.aereo.orbita_ascendente']),
    terraza: Object.freeze(['pool.aereo.vista_terraza', 'pool.aereo.reveal_vista', 'pool.aereo.cenital_giratorio']),
    cancha:  Object.freeze(['pool.aereo.cancha_cabanas', 'pool.aereo.cenital_giratorio', 'pool.aereo.fly_through']),
  });

  // Indice id -> toma del pool, para resolver rapido (findSuggestion, vocab).
  const AERIAL_POOL_INDEX = Object.freeze(
    AERIAL_POOL.reduce((acc, shot) => { acc[shot.id] = shot; return acc; }, Object.create(null))
  );

  const AMENITY_GUIDE = Object.freeze({
    alberca: { label: 'Alberca/piscina', shots: Object.freeze([
      { id: 'amenity.alberca.reveal',  nombre: 'Reveal del agua',             shotType: 'reveal',    movement: 'pull_out', enfoque: 'Reflejo y color del agua; empieza en el detalle y abre a la alberca completa.',priority: 'must' },
      { id: 'amenity.alberca.tracking',nombre: 'Recorrido del borde',         shotType: 'transicion',movement: 'tracking', enfoque: 'Continuidad y tamano real del vaso.',                                        priority: 'must' },
      { id: 'amenity.alberca.wide',    nombre: 'Wide ambiental',              shotType: 'wide',      movement: 'static',   enfoque: 'Luz, amplitud y entorno; ideal al atardecer.',                               priority: 'must' },
      { id: 'amenity.alberca.orbit',   nombre: 'Orbital de tumbonas',         shotType: 'medio',     movement: 'orbit',    enfoque: 'Estilo de vida, mobiliario, sombra.',                                        priority: 'nice' },
      { id: 'amenity.alberca.detalle', nombre: 'Detalle de agua y escalones', shotType: 'detalle',   movement: 'static',   enfoque: 'Textura del agua, acabado de piso antiderrapante.',                         priority: 'nice' },
    ]) },
    jacuzzi: { label: 'Jacuzzi', shots: Object.freeze([
      { id: 'amenity.jacuzzi.reveal',nombre: 'Reveal con tilt up',shotType: 'reveal',movement: 'tilt_up',enfoque: 'Burbujas, vapor, vista que acompana.',                priority: 'must' },
      { id: 'amenity.jacuzzi.detalle',nombre: 'Detalle de jets', shotType: 'detalle',movement: 'static', enfoque: 'Sensacion de relajacion, acabados.',                 priority: 'must' },
      { id: 'amenity.jacuzzi.orbit',  nombre: 'Orbital corto',   shotType: 'medio',  movement: 'orbit',  enfoque: 'Integracion con terraza o alberca.',                 priority: 'nice' },
    ]) },
    gimnasio: { label: 'Gimnasio', shots: Object.freeze([
      { id: 'amenity.gimnasio.recorrido',nombre: 'Recorrido de entrada',        shotType: 'pov',      movement: 'gimbal_walk',enfoque: 'Amplitud, equipamiento completo.',           priority: 'must' },
      { id: 'amenity.gimnasio.tracking', nombre: 'Tracking frente a maquinas', shotType: 'transicion',movement: 'tracking',   enfoque: 'Variedad y estado del equipo.',              priority: 'must' },
      { id: 'amenity.gimnasio.wide',     nombre: 'Wide con espejo y ventanal',  shotType: 'wide',     movement: 'static',     enfoque: 'Luz natural, sensacion de espacio.',         priority: 'must' },
      { id: 'amenity.gimnasio.detalle',  nombre: 'Detalle de pesas y cardio',   shotType: 'detalle',  movement: 'static',     enfoque: 'Calidad de marca del equipo.',               priority: 'nice' },
    ]) },
    salon_eventos: { label: 'Salon de eventos', shots: Object.freeze([
      { id: 'amenity.salon_eventos.reveal',   nombre: 'Reveal de apertura',          shotType: 'reveal',      movement: 'pull_out',enfoque: 'Capacidad y altura desde la puerta.',       priority: 'must' },
      { id: 'amenity.salon_eventos.recorrido',nombre: 'Recorrido central',           shotType: 'pov',         movement: 'gimbal_walk',enfoque: 'Flexibilidad del espacio vacio.',        priority: 'must' },
      { id: 'amenity.salon_eventos.detalle',  nombre: 'Detalle de cocineta y barra', shotType: 'detalle',     movement: 'static',  enfoque: 'Servicios incluidos del salon.',            priority: 'nice' },
      { id: 'amenity.salon_eventos.tilt',     nombre: 'Tilt up a doble altura',      shotType: 'contrapicado',movement: 'tilt_up', enfoque: 'Elegancia, altura libre.',                 priority: 'nice' },
    ]) },
    lobby: { label: 'Lobby/recepcion', shots: Object.freeze([
      { id: 'amenity.lobby.push_in',nombre: 'Push-in de ingreso',       shotType: 'pov',         movement: 'gimbal_walk',enfoque: 'Primera impresion, doble altura al cruzar la puerta.',priority: 'must' },
      { id: 'amenity.lobby.orbit',  nombre: 'Orbital del area de estar',shotType: 'medio',       movement: 'orbit',      enfoque: 'Acabados, lujo, limpieza.',                           priority: 'must' },
      { id: 'amenity.lobby.detalle',nombre: 'Detalle de mostrador',     shotType: 'detalle',     movement: 'static',     enfoque: 'Marmol, madera, herreria, logo.',                     priority: 'nice' },
      { id: 'amenity.lobby.tilt',   nombre: 'Tilt up del vestibulo',    shotType: 'contrapicado',movement: 'tilt_up',    enfoque: 'Altura y diseno arquitectonico.',                     priority: 'nice' },
    ]) },
    roof_garden: { label: 'Roof garden/terraza azotea', shots: Object.freeze([
      { id: 'amenity.roof_garden.reveal',  nombre: 'Reveal de la vista',       shotType: 'reveal',movement: 'pull_out',   enfoque: 'Vista panoramica como argumento de venta.',          priority: 'must' },
      { id: 'amenity.roof_garden.recorrido',nombre: 'Recorrido del deck',      shotType: 'transicion',movement: 'tracking',enfoque: 'Mobiliario, fogata, areas de estar.',              priority: 'must' },
      { id: 'amenity.roof_garden.orbit',   nombre: 'Orbital de la zona lounge',shotType: 'medio', movement: 'orbit',      enfoque: 'Ambiente, estilo de vida al atardecer.',             priority: 'must' },
      { id: 'amenity.roof_garden.detalle', nombre: 'Detalle de pergola',       shotType: 'detalle',movement: 'static',    enfoque: 'Acabados de exterior.',                              priority: 'nice' },
    ]) },
    jardin: { label: 'Jardin/areas verdes', shots: Object.freeze([
      { id: 'amenity.jardin.recorrido',nombre: 'Recorrido por sendero',       shotType: 'transicion',movement: 'gimbal_walk',enfoque: 'Tamano y mantenimiento del verde.',          priority: 'must' },
      { id: 'amenity.jardin.wide',     nombre: 'Wide del area completa',      shotType: 'wide',      movement: 'pan',        enfoque: 'Extension de las areas verdes.',            priority: 'must' },
      { id: 'amenity.jardin.reveal',   nombre: 'Reveal a traves de vegetacion',shotType: 'reveal',   movement: 'parallax',   enfoque: 'Profundidad, frescura.',                    priority: 'nice' },
      { id: 'amenity.jardin.detalle',  nombre: 'Detalle de jardineria',       shotType: 'detalle',   movement: 'static',     enfoque: 'Cuidado y diseno paisajista.',              priority: 'nice' },
    ]) },
    asadores: { label: 'Asadores/BBQ', shots: Object.freeze([
      { id: 'amenity.asadores.recorrido',nombre: 'Recorrido de la zona', shotType: 'transicion',movement: 'tracking', enfoque: 'Numero de estaciones, equipamiento.',                     priority: 'must' },
      { id: 'amenity.asadores.detalle', nombre: 'Detalle del asador',    shotType: 'detalle',   movement: 'static',   enfoque: 'Calidad del equipo, acabado en piedra.',                  priority: 'must' },
      { id: 'amenity.asadores.reveal',  nombre: 'Reveal con mesas',      shotType: 'reveal',    movement: 'pull_out', enfoque: 'Convivencia, capacidad del comedor exterior.',             priority: 'nice' },
    ]) },
    cancha: { label: 'Cancha (tenis/padel)', shots: Object.freeze([
      { id: 'amenity.cancha.wide',     nombre: 'Wide de cancha completa', shotType: 'wide',      movement: 'static',  enfoque: 'Dimensiones reglamentarias, estado.',            priority: 'must' },
      { id: 'amenity.cancha.recorrido',nombre: 'Recorrido perimetral',    shotType: 'transicion',movement: 'tracking',enfoque: 'Iluminacion, mallas, superficie.',               priority: 'must' },
      { id: 'amenity.cancha.detalle',  nombre: 'Detalle de superficie',   shotType: 'detalle',  movement: 'static',  enfoque: 'Calidad del piso o cristales (padel).',           priority: 'nice' },
      { id: 'amenity.cancha.reveal',   nombre: 'Reveal desde acceso',     shotType: 'reveal',   movement: 'push_in', enfoque: 'Sorpresa de la amenidad al entrar.',              priority: 'nice' },
    ]) },
    area_infantil: { label: 'Area infantil/juegos', shots: Object.freeze([
      { id: 'amenity.area_infantil.wide',     nombre: 'Wide del area de juegos', shotType: 'wide',      movement: 'static',     enfoque: 'Variedad de juegos, seguridad.',          priority: 'must' },
      { id: 'amenity.area_infantil.recorrido',nombre: 'Recorrido entre juegos',  shotType: 'transicion',movement: 'gimbal_walk',enfoque: 'Piso amortiguante, mantenimiento.',        priority: 'must' },
      { id: 'amenity.area_infantil.detalle',  nombre: 'Detalle de juego',        shotType: 'detalle',   movement: 'static',     enfoque: 'Materiales, color, estado.',              priority: 'nice' },
    ]) },
    business_center: { label: 'Business center/coworking', shots: Object.freeze([
      { id: 'amenity.business_center.recorrido',nombre: 'Recorrido de entrada',          shotType: 'pov',       movement: 'gimbal_walk',enfoque: 'Ambiente profesional, mobiliario.',  priority: 'must' },
      { id: 'amenity.business_center.tracking', nombre: 'Tracking de estaciones',        shotType: 'transicion',movement: 'tracking',   enfoque: 'Conectividad, salas privadas.',      priority: 'must' },
      { id: 'amenity.business_center.detalle',  nombre: 'Detalle de sala de juntas',     shotType: 'detalle',   movement: 'static',     enfoque: 'Privacidad, tecnologia.',            priority: 'nice' },
    ]) },
    spa: { label: 'Spa/sauna', shots: Object.freeze([
      { id: 'amenity.spa.reveal',   nombre: 'Reveal de ingreso',        shotType: 'reveal',    movement: 'pull_out',   enfoque: 'Ambiente de relajacion al abrir el area humeda.',      priority: 'must' },
      { id: 'amenity.spa.detalle',  nombre: 'Detalle de sauna y vapor', shotType: 'detalle',   movement: 'static',     enfoque: 'Madera, calidad, iluminacion; cuidar lente con vapor.', priority: 'must' },
      { id: 'amenity.spa.recorrido',nombre: 'Recorrido de cabinas',     shotType: 'transicion',movement: 'gimbal_walk',enfoque: 'Privacidad, lujo.',                                    priority: 'nice' },
    ]) },
    estacionamiento: { label: 'Estacionamiento', shots: Object.freeze([
      { id: 'amenity.estacionamiento.recorrido',nombre: 'Recorrido por el pasillo',  shotType: 'transicion',movement: 'tracking', enfoque: 'Amplitud de cajones, iluminacion.',        priority: 'must' },
      { id: 'amenity.estacionamiento.wide',     nombre: 'Wide del nivel',            shotType: 'wide',      movement: 'static',   enfoque: 'Numero de cajones, orden, senalizacion.',   priority: 'must' },
      { id: 'amenity.estacionamiento.detalle',  nombre: 'Detalle de cajon',          shotType: 'detalle',   movement: 'static',   enfoque: 'Medida del cajon, demarcacion.',            priority: 'nice' },
      { id: 'amenity.estacionamiento.reveal',   nombre: 'Reveal de rampa y acceso',  shotType: 'reveal',    movement: 'push_in',  enfoque: 'Facilidad de maniobra.',                    priority: 'nice' },
    ]) },
    elevadores: { label: 'Elevadores/accesos', shots: Object.freeze([
      { id: 'amenity.elevadores.push_in',nombre: 'Push-in al elevador',         shotType: 'pov',       movement: 'gimbal_walk',enfoque: 'Acabados, limpieza, capacidad.',                priority: 'must' },
      { id: 'amenity.elevadores.acceso', nombre: 'Recorrido de control de acceso',shotType: 'transicion',movement: 'tracking',  enfoque: 'Seguridad, casetas, torniquetes.',              priority: 'must' },
      { id: 'amenity.elevadores.detalle',nombre: 'Detalle de botonera',         shotType: 'detalle',   movement: 'static',     enfoque: 'Numero de niveles, tecnologia.',               priority: 'nice' },
    ]) },
    palapa: { label: 'Palapa', shots: Object.freeze([
      { id: 'amenity.palapa.reveal',nombre: 'Reveal con tilt up',          shotType: 'reveal',movement: 'tilt_up', enfoque: 'Altura y artesania del techo de palma.',              priority: 'must' },
      { id: 'amenity.palapa.orbit', nombre: 'Orbital de la zona social',   shotType: 'medio', movement: 'orbit',   enfoque: 'Convivencia, frescura, sombra.',                      priority: 'must' },
      { id: 'amenity.palapa.detalle',nombre: 'Detalle de palma y vigas',   shotType: 'detalle',movement: 'tilt_up',enfoque: 'Autenticidad y estado del techo.',                    priority: 'nice' },
      { id: 'amenity.palapa.vista', nombre: 'Reveal hacia la vista exterior',shotType: 'reveal',movement: 'pull_out',enfoque: 'Integracion con alberca o naturaleza.',              priority: 'nice' },
    ]) },
    area_mascotas: { label: 'Area de mascotas', shots: Object.freeze([
      { id: 'amenity.area_mascotas.wide',     nombre: 'Wide del area',             shotType: 'wide',      movement: 'static',  enfoque: 'Tamano del area canina, cercado.',         priority: 'must' },
      { id: 'amenity.area_mascotas.recorrido',nombre: 'Recorrido perimetral',      shotType: 'transicion',movement: 'tracking',enfoque: 'Superficie, sombra, agua.',                priority: 'must' },
      { id: 'amenity.area_mascotas.detalle',  nombre: 'Detalle de estacion de lavado',shotType: 'detalle',movement: 'static',  enfoque: 'Servicios extra (pet spa).',               priority: 'nice' },
    ]) },
  });

  const PROPERTY_FOCUS = Object.freeze({
    casa:         'Amplitud y luz: abre cada cuarto y liga espacios.',
    departamento: 'Vistas y amenidades del edificio.',
    terreno:      'Dimension y ubicacion: perimetro y panoramicas a pie.',
    quinta:       'Recreo: areas sociales, naturaleza, palapa, alberca, capilla, establos.',
    comercial:    'Fachada, flujo, escaparate, areas de cliente.',
  });

  const ROOM_CATEGORIES = Object.freeze([
    { id: 'medio_bano',  label: 'Medio bano',             keywords: ['medio bano', 'visitas'] },
    { id: 'bano',        label: 'Bano completo',          keywords: ['bano', 'wc', 'toilet', 'sanitario'] },
    { id: 'lavado',      label: 'Cuarto de lavado',       keywords: ['lavado', 'lavanderia'] },
    { id: 'bodega',      label: 'Bodega/servicio',        keywords: ['bodega', 'servicio', 'almacen', 'cuarto de servicio'] },
    { id: 'servicio',    label: 'Cuarto de servicio',     keywords: ['servicio', 'sirvienta', 'empleada', 'muchacha'] },
    { id: 'vestidor',    label: 'Vestidor/closet',        keywords: ['vestidor', 'closet', 'walk-in'] },
    { id: 'cocina',      label: 'Cocina',                 keywords: ['cocina', 'kitchen', 'cocineta'] },
    { id: 'comedor',     label: 'Comedor',                keywords: ['comedor', 'antecomedor'] },
    { id: 'sala',        label: 'Sala/estancia',          keywords: ['sala', 'living', 'estar', 'estancia', 'salon'] },
    { id: 'family',      label: 'Family room/sala de TV', keywords: ['family', 'tv', 'entretenimiento', 'sala de tv', 'tele', 'juegos'] },
    { id: 'estudio',     label: 'Estudio/home office',    keywords: ['estudio', 'oficina', 'office', 'despacho', 'biblioteca'] },
    { id: 'recamara',    label: 'Recamara',               keywords: ['recamara', 'habitacion', 'dormitorio', 'alcoba', 'suite', 'cuarto'] },
    { id: 'garaje',      label: 'Garaje/cochera',         keywords: ['garaje', 'cochera', 'garage'] },
    { id: 'pasillo',     label: 'Pasillo/escaleras',      keywords: ['pasillo', 'escalera', 'hall', 'vestibulo'] },
    { id: 'entrada',     label: 'Entrada/recibidor',      keywords: ['entrada', 'recibidor', 'foyer', 'acceso', 'vestibulo', 'hall', 'lobby'] },
    { id: 'terraza',     label: 'Terraza/balcon',         keywords: ['terraza', 'balcon', 'patio', 'roof', 'azotea', 'roofgarden'] },
    { id: 'exterior',    label: 'Exterior/jardin',        keywords: ['fachada', 'jardin', 'exterior', 'frente'] },
  ]);

  const EDIT_ORDER = Object.freeze({
    exterior:     10,
    wide:         10,
    pov:          20,
    transicion:   20,
    general:      30,
    reveal:       30,
    contrapicado: 35,
    medio:        40,
    simetrica:    40,
    ventana:      45,
    detalle:      50,
    textura:      50,
  });

  // F5 — module-level cache for effective (resolved) library; null = use frozen constants directly
  let _effectiveShotTypes      = null;
  let _effectiveMovements      = null;
  let _effectiveGuideLibrary   = null;
  let _effectiveDroneGuide     = null;
  let _effectiveAmenityGuide   = null;
  let _effectiveRoomCategories = null;
  let _effectiveCameras        = null;

  function getShotTypes()      { return _effectiveShotTypes      || SHOT_TYPES; }
  function getMovements()      { return _effectiveMovements      || MOVEMENTS; }
  function getGuideLibrary()   { return _effectiveGuideLibrary   || GUIDE_LIBRARY; }
  function getDroneGuide()     { return _effectiveDroneGuide     || DRONE_GUIDE; }
  function getAmenityGuide()   { return _effectiveAmenityGuide   || AMENITY_GUIDE; }
  function getRoomCategories() { return _effectiveRoomCategories || ROOM_CATEGORIES; }
  // F17 — el vocabulario aereo no es configurable por ahora; devuelve la constante.
  function getDroneShotTypes() { return DRONE_SHOT_TYPES; }

  function getCameras(state) {
    const result = CAMERA_DEFAULTS.map((camera) => Object.assign({}, camera));
    if (Array.isArray(_effectiveCameras)) {
      for (const cam of _effectiveCameras) {
        if (!cam || typeof cam !== 'object' || !cam.id) continue;
        const idx = result.findIndex((item) => item.id === cam.id);
        if (idx >= 0) result[idx] = Object.assign({}, result[idx], cam);
        else result.push(Object.assign({}, cam));
      }
    }
    const stateCameras = state && Array.isArray(state.cameras) ? state.cameras : [];
    for (const cam of stateCameras) {
      if (!cam || typeof cam !== 'object' || !cam.id) continue;
      if (result.some((item) => item.id === cam.id)) continue;
      result.push(Object.assign({}, cam));
    }
    return result;
  }

  function _mergeShots(defaultShots, overrideShots) {
    if (!Array.isArray(overrideShots)) return defaultShots.slice();
    const byId = {};
    for (const s of overrideShots) {
      if (s && typeof s === 'object' && s.id) byId[s.id] = s;
    }
    const result = [];
    for (const shot of defaultShots) {
      const over = byId[shot.id];
      if (!over) { result.push(shot); continue; }
      if (over.removed) continue;
      result.push(Object.assign({}, shot, over));
    }
    for (const s of overrideShots) {
      if (!s || !s.id || s.removed) continue;
      if (defaultShots.some((d) => d.id === s.id)) continue;
      result.push(s);
    }
    return result;
  }

  function applyGuideConfig(config) {
    if (config == null || typeof config !== 'object') {
      resetGuideConfig();
      return;
    }
    try {
      if (config.shotTypes && typeof config.shotTypes === 'object') {
        const m = Object.assign({}, SHOT_TYPES);
        for (const [id, ov] of Object.entries(config.shotTypes)) {
          if (ov && typeof ov === 'object') m[id] = Object.assign({}, m[id] || {}, ov);
        }
        _effectiveShotTypes = m;
      } else {
        _effectiveShotTypes = null;
      }
    } catch (_) { _effectiveShotTypes = null; }
    try {
      if (config.movements && typeof config.movements === 'object') {
        const m = Object.assign({}, MOVEMENTS);
        for (const [id, ov] of Object.entries(config.movements)) {
          if (ov && typeof ov === 'object') m[id] = Object.assign({}, m[id] || {}, ov);
        }
        _effectiveMovements = m;
      } else {
        _effectiveMovements = null;
      }
    } catch (_) { _effectiveMovements = null; }
    try {
      if (config.categorias && typeof config.categorias === 'object') {
        const m = {};
        for (const [catId, catDef] of Object.entries(GUIDE_LIBRARY)) {
          const ov = config.categorias[catId];
          if (!ov || typeof ov !== 'object') { m[catId] = catDef; continue; }
          const label = (typeof ov.label === 'string' && ov.label) ? ov.label : catDef.label;
          m[catId] = { label, shots: _mergeShots(Array.from(catDef.shots), ov.shots) };
        }
        for (const [catId, ov] of Object.entries(config.categorias)) {
          if (GUIDE_LIBRARY[catId] || !ov || typeof ov !== 'object') continue;
          if (!Array.isArray(ov.shots)) continue;
          m[catId] = { label: (typeof ov.label === 'string' && ov.label) ? ov.label : catId, shots: ov.shots };
        }
        _effectiveGuideLibrary = m;
      } else {
        _effectiveGuideLibrary = null;
      }
    } catch (_) { _effectiveGuideLibrary = null; }
    try {
      if (config.drone && typeof config.drone === 'object') {
        const m = {};
        for (const [tipo, tipoDef] of Object.entries(DRONE_GUIDE)) {
          const ov = config.drone[tipo];
          if (!ov || typeof ov !== 'object') { m[tipo] = tipoDef; continue; }
          const label = (typeof ov.label === 'string' && ov.label) ? ov.label : tipoDef.label;
          m[tipo] = { label, shots: _mergeShots(Array.from(tipoDef.shots), ov.shots) };
        }
        _effectiveDroneGuide = m;
      } else {
        _effectiveDroneGuide = null;
      }
    } catch (_) { _effectiveDroneGuide = null; }
    try {
      if (config.amenidades && typeof config.amenidades === 'object') {
        const m = {};
        for (const [amenId, amenDef] of Object.entries(AMENITY_GUIDE)) {
          const ov = config.amenidades[amenId];
          if (!ov || typeof ov !== 'object') { m[amenId] = amenDef; continue; }
          const label = (typeof ov.label === 'string' && ov.label) ? ov.label : amenDef.label;
          m[amenId] = { label, shots: _mergeShots(Array.from(amenDef.shots), ov.shots) };
        }
        _effectiveAmenityGuide = m;
      } else {
        _effectiveAmenityGuide = null;
      }
    } catch (_) { _effectiveAmenityGuide = null; }
    try {
      if (Array.isArray(config.roomCategories) && config.roomCategories.length > 0) {
        _effectiveRoomCategories = config.roomCategories;
      } else {
        _effectiveRoomCategories = null;
      }
    } catch (_) { _effectiveRoomCategories = null; }
    try {
      if (Array.isArray(config.cameras)) {
        _effectiveCameras = config.cameras
          .filter((cam) => cam && typeof cam === 'object' && cam.id)
          .map((cam) => Object.assign({}, cam));
      } else {
        _effectiveCameras = null;
      }
    } catch (_) { _effectiveCameras = null; }
  }

  function resetGuideConfig() {
    _effectiveShotTypes      = null;
    _effectiveMovements      = null;
    _effectiveGuideLibrary   = null;
    _effectiveDroneGuide     = null;
    _effectiveAmenityGuide   = null;
    _effectiveRoomCategories = null;
    _effectiveCameras        = null;
  }

  // F2 — keywords para deteccion de amenidades por nombre de espacio
  const AMENITY_KEYWORDS = Object.freeze([
    { id: 'alberca',         keywords: ['alberca', 'piscina', 'pool'] },
    { id: 'jacuzzi',         keywords: ['jacuzzi'] },
    { id: 'gimnasio',        keywords: ['gimnasio', 'gym'] },
    { id: 'salon_eventos',   keywords: ['salon de eventos'] },
    { id: 'lobby',           keywords: ['lobby', 'recepcion'] },
    { id: 'roof_garden',     keywords: ['roof garden', 'azotea'] },
    { id: 'jardin',          keywords: ['jardin'] },
    { id: 'asadores',        keywords: ['asador', 'asadores', 'bbq', 'parrilla'] },
    { id: 'cancha',          keywords: ['cancha', 'tenis', 'padel'] },
    { id: 'area_infantil',   keywords: ['area infantil', 'juegos'] },
    { id: 'business_center', keywords: ['business center', 'coworking'] },
    { id: 'spa',             keywords: ['spa', 'sauna'] },
    { id: 'estacionamiento', keywords: ['estacionamiento'] },
    { id: 'elevadores',      keywords: ['elevador', 'elevadores'] },
    { id: 'palapa',          keywords: ['palapa'] },
    { id: 'area_mascotas',   keywords: ['mascotas', 'area mascotas'] },
  ]);

  function normNombre(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function detectCategoria(nombre) {
    const n = normNombre(nombre);
    const words = new Set(n.split(/[\s\-\/,;]+/).filter(Boolean));
    for (const cat of getRoomCategories()) {
      for (const kw of cat.keywords) {
        const kwNorm = normNombre(kw);
        if (kwNorm.includes(' ') && n.includes(kwNorm)) return cat.id;
      }
    }
    for (const cat of getRoomCategories()) {
      for (const kw of cat.keywords) {
        const kwNorm = normNombre(kw);
        if (!kwNorm.includes(' ') && words.has(kwNorm)) return cat.id;
      }
    }
    return 'generico';
  }

  function amenityFromName(nombre) {
    const n = normNombre(nombre);
    const words = new Set(n.split(/[\s\-\/,;]+/).filter(Boolean));
    const effectiveAmenities = getAmenityGuide();
    for (const am of AMENITY_KEYWORDS) {
      if (!effectiveAmenities[am.id]) continue;
      for (const kw of am.keywords) {
        const kwNorm = normNombre(kw);
        if (kwNorm.includes(' ') ? n.includes(kwNorm) : words.has(kwNorm)) return am.id;
      }
    }
    return null;
  }

  function suggestionsForSpace(categoria, nombre) {
    const lib = getGuideLibrary();
    const ALIAS = { exterior: 'terraza', servicio: 'bodega' };
    const resolved = lib[categoria] ? categoria : (ALIAS[categoria] || 'generico');
    const entry = lib[resolved] || lib.generico;
    const base = Array.from(entry.shots);
    const amenityId = amenityFromName(nombre || '');
    const amenityLib = getAmenityGuide();
    if (amenityId && amenityLib[amenityId]) {
      return base.concat(Array.from(amenityLib[amenityId].shots));
    }
    return base;
  }

  function suggestionsForDrone(tipoPropiedad) {
    const droneLib = getDroneGuide();
    return Array.from((droneLib[tipoPropiedad] || droneLib.casa).shots);
  }

  // ─── F17 — Sujetos aereos: emparejado por nombre y sugerencias aereas ─────────
  // Devuelve el id del sujeto aereo cuyo keyword aparezca en el nombre del espacio.
  function aerialSubjectFromName(nombre) {
    const n = normNombre(nombre || '');
    if (!n) return null;
    const words = new Set(n.split(' ').filter(Boolean));
    for (const [id, subject] of Object.entries(AERIAL_SUBJECTS)) {
      for (const kw of subject.keywords) {
        const kwNorm = normNombre(kw);
        if (kwNorm.includes(' ') ? n.includes(kwNorm) : words.has(kwNorm)) return id;
      }
    }
    return null;
  }

  // Sugerencias aereas (tomas) de un sujeto dado: por id o por nombre del espacio.
  function aerialSuggestionsForSubject(subjectOrName) {
    if (!subjectOrName) return [];
    const direct = AERIAL_SUBJECTS[subjectOrName];
    if (direct) return Array.from(direct.shots);
    const matchedId = aerialSubjectFromName(subjectOrName);
    if (matchedId) return Array.from(AERIAL_SUBJECTS[matchedId].shots);
    return [];
  }

  // F17 (A) — sesgo por tipo de propiedad: devuelve la lista ordenada de sujetos
  // aereos sugeridos { id, label, shots }. Si no se pasa tipo, usa el del guide.
  function suggestedAerialSubjects(state, tipoPropiedad) {
    const tipo = tipoPropiedad != null
      ? tipoPropiedad
      : (state && state.guide ? state.guide.tipoPropiedad : null);
    const ids = AERIAL_SUBJECTS_BY_PROPERTY[tipo] || AERIAL_SUBJECTS_BY_PROPERTY.casa;
    return ids
      .filter((id) => AERIAL_SUBJECTS[id])
      .map((id) => ({ id, label: AERIAL_SUBJECTS[id].label, shots: Array.from(AERIAL_SUBJECTS[id].shots) }));
  }

  // ─── F34 — Helpers del pool aereo (escalas / features) ────────────────────────
  // must primero, conservando el orden relativo dentro de cada grupo.
  function sortMustFirst(shots) {
    const list = Array.isArray(shots) ? shots.slice() : [];
    return list.sort((a, b) => (b.must === true ? 1 : 0) - (a.must === true ? 1 : 0));
  }

  // ¿Aplica esta toma al tipo de propiedad dado? ('all' aplica a todos.)
  function aerialShotAppliesToTipo(shot, tipo) {
    const tipos = shot && Array.isArray(shot.tipos) ? shot.tipos : [];
    if (tipos.includes('all')) return true;
    return tipo != null && tipos.includes(tipo);
  }

  // Tomas del pool de una escala dada, filtradas por tipo, must primero.
  // La canonica "Salida a contexto" (tipos:'all') siempre entra en 'propiedad'.
  function aerialPoolForScale(scale, tipo) {
    const matches = AERIAL_POOL.filter((s) => s.scale === scale && aerialShotAppliesToTipo(s, tipo));
    return sortMustFirst(matches);
  }

  // Vocabulario aereo de un feature derivado (alberca, jardin, roof…),
  // resuelto a tomas del pool, must primero. featureKey puede ser un id de
  // AERIAL_FEATURE_VOCAB o un nombre de espacio (se normaliza por keyword).
  function aerialFeatureKeyFromName(nombre) {
    const n = normNombre(nombre || '');
    if (!n) return null;
    if (n.includes('alberca') || n.includes('piscina')) return 'alberca';
    if (n.includes('jardin') || n.includes('verde'))   return 'jardin';
    if (n.includes('roof') || n.includes('azotea'))    return 'roof';
    if (n.includes('terraza'))                          return 'terraza';
    if (n.includes('cancha'))                           return 'cancha';
    return null;
  }

  function aerialVocabForFeature(featureKey) {
    const key = AERIAL_FEATURE_VOCAB[featureKey] ? featureKey : aerialFeatureKeyFromName(featureKey);
    const ids = key ? AERIAL_FEATURE_VOCAB[key] : null;
    if (!ids) return [];
    const shots = ids.map((id) => AERIAL_POOL_INDEX[id]).filter(Boolean);
    return sortMustFirst(shots);
  }

  function findSuggestion(id, state) {
    const lib = getGuideLibrary();
    for (const cat of Object.values(lib)) {
      const shot = cat.shots.find((s) => s.id === id);
      if (shot) return shot;
    }
    for (const entry of Object.values(getDroneGuide())) {
      const shot = entry.shots.find((s) => s.id === id);
      if (shot) return shot;
    }
    for (const entry of Object.values(getAmenityGuide())) {
      const shot = entry.shots.find((s) => s.id === id);
      if (shot) return shot;
    }
    // F34 — tambien escanea los sujetos aereos viejos (AERIAL_SUBJECTS) y el pool
    // aereo nuevo (AERIAL_POOL). Aditivo: los ids aereos viejos (aereo.*) deben
    // seguir siendo resolubles porque las tomas viejas los traen en suggestionId.
    for (const subject of Object.values(AERIAL_SUBJECTS)) {
      const shot = subject.shots.find((s) => s.id === id);
      if (shot) return shot;
    }
    if (AERIAL_POOL_INDEX[id]) return AERIAL_POOL_INDEX[id];
    if (state) {
      const proposal = state.guide && state.guide.proposal;
      if (proposal && proposal.porCuarto) {
        for (const shots of Object.values(proposal.porCuarto)) {
          const shot = Array.isArray(shots) ? shots.find((s) => s.id === id) : null;
          if (shot) return shot;
        }
      }
    }
    return null;
  }

  function suggestionProgress(state, mode, targetId, suggestionId) {
    const cameraIds = new Set(
      (state.cameras || []).filter((c) => c.mode === mode).map((c) => c.id)
    );
    const files = (state.mediaFiles || []).filter(
      (f) => f.kind === 'take' && f.targetId === targetId && f.suggestionId === suggestionId && cameraIds.has(f.cameraId)
    );
    return { done: files.length > 0, count: files.length, files };
  }

  function proposalShotsFor(state, targetId) {
    const proposal = state.guide && state.guide.proposal;
    if (!proposal || !proposal.porCuarto) return [];
    return (proposal.porCuarto[targetId] || []).slice();
  }

  function suggestionsForTarget(state, mode, target) {
    let base;
    if (mode === 'drone') {
      const tipo = state && state.guide ? state.guide.tipoPropiedad : null;
      // F38 — target de SESION de drone: una sola lista ordenada (fijas + una por
      // espacio). Se detecta por el id de sesion. (El sujeto terreno cae en el
      // bloque esTerrenoSubject de abajo y droneSessionSuggestions tambien lo reusa,
      // asi que ambos caminos coinciden para terreno.)
      if (target && target.id === DRONE_SESSION_ID) {
        return droneSessionSuggestions(state).concat(proposalShotsFor(state, target.id));
      }
      // F34 — target de drone nuevo (virtual): si trae feature derivado, usa el
      // vocabulario aereo de ese feature; si trae scale, usa el pool de esa escala
      // filtrado por tipo. must primero en ambos.
      const feature = target ? (target.feature || target.featureKey || null) : null;
      const scale = target ? target.scale : null;
      // F35 — sujeto terreno: expone la lista unica de 14 del pool aereo nuevo
      // (must primero), no solo las 2 viejas. Se detecta por el marcador del sujeto
      // o por tipoPropiedad terreno con el id del sujeto unico.
      const esTerrenoSubject = target && (target.isTerrenoSubject === true
        || (tipo === 'terreno' && target.id === TERRENO_SUBJECT_ID));
      if (esTerrenoSubject) {
        // Lista unica de 14 del terreno: tomas con tipo 'terreno' explicito (incluye
        // su propia 'Salida a contexto'; no se suma la canonica 'all' para no duplicar).
        base = sortMustFirst(AERIAL_POOL.filter((s) => Array.isArray(s.tipos) && s.tipos.includes('terreno')));
      } else if (feature) {
        base = aerialVocabForFeature(feature);
      } else if (scale) {
        base = aerialPoolForScale(scale, tipo);
      } else {
        // F17 (retro-compat) — si el sujeto (target) empareja con un sujeto aereo
        // viejo por nombre, usa su vocabulario aereo; si no (estado viejo, espacios
        // sin sujeto aereo), conserva el comportamiento previo por tipo de propiedad.
        const aereas = target ? aerialSuggestionsForSubject(target.nombre) : [];
        base = aereas.length
          ? aereas
          : suggestionsForDrone(tipo);
      }
    } else {
      const cat = target.categoria || detectCategoria(target.nombre);
      base = suggestionsForSpace(cat, target.nombre);
    }
    return base.concat(proposalShotsFor(state, target.id));
  }

  function buildPropuestaPrompt(state) {
    const guide = state.guide || {};
    const descripcion = guide.descripcion || '';
    // El drone comparte los espacios; no hay targets de drone aparte.
    const allTargets = (state.espacios || []).map((esp) => ({
      id: esp.id,
      nombre: esp.nombre,
      categoria: esp.categoria || detectCategoria(esp.nombre),
    }));

    const shotTypes = getShotTypes();
    const movements = getMovements();

    const shotTypeVocab = Object.entries(shotTypes).map(([id, v]) => '  "' + id + '": "' + v.label + '"').join('\n');
    const movementVocab = Object.entries(movements).map(([id, v]) => '  "' + id + '": "' + v.label + '"').join('\n');
    const cuartosStr = allTargets.map((c) => '  { "id": "' + c.id + '", "nombre": "' + c.nombre + '", "categoria": "' + c.categoria + '" }').join(',\n');

    return 'Eres un camarografo de bienes raices recibiendo instrucciones de rodaje.\n' +
      'Descripcion de la propiedad: ' + (descripcion || '(sin descripcion)') + '\n\n' +
      'Cuartos a filmar:\n[\n' + cuartosStr + '\n]\n\n' +
      'Vocabulario cerrado de tipos de toma (shotType) — usa SOLO estos ids:\n' + shotTypeVocab + '\n\n' +
      'Vocabulario cerrado de movimientos (movement) — usa SOLO estos ids:\n' + movementVocab + '\n\n' +
      'Tarea: proponer tomas adicionales especificas para ESTA propiedad, por cuarto.\n\n' +
      'REGLAS DURAS — incumplir cualquiera invalida la respuesta:\n' +
      '1. Basate ESTRICTAMENTE en la descripcion. PROHIBIDO inventar muebles, features, vistas o condiciones que no se mencionan en ella.\n' +
      '2. El campo "enfoque" describe SOLO encuadre y composicion. NADA de hora del dia, golden hour, clima, iluminacion natural ni logistica de rodaje.\n' +
      '3. Propone tomas SOLO para cuartos de la lista. PROHIBIDO inventar cuartos que no aparecen.\n' +
      '4. Propone SOLO tomas genuinamente especificas de esta propiedad. NO repitas wides genericos que cualquier propiedad tendria.\n' +
      '5. Si un cuarto no tiene nada destacable segun la descripcion, NO propongas nada para el (omitelo del JSON).\n' +
      '6. Si la descripcion esta vacia o es generica (sin detalles especificos), responde exactamente: {"porCuarto":{}}\n' +
      '7. Usa SOLO los ids exactos del vocabulario cerrado para shotType y movement.\n' +
      '8. Responde UNICAMENTE con el JSON, sin markdown ni texto adicional.\n\n' +
      'Formato de respuesta:\n' +
      '{\n  "porCuarto": {\n    "<id de cuarto>": [\n' +
      '      { "nombre": "...", "shotType": "<id valido>", "movement": "<id valido>", "enfoque": "...", "priority": "must|nice" }\n' +
      '    ]\n  }\n}\n\n' +
      'Ejemplo — cuarto con chimenea de piedra mencionada en la descripcion:\n' +
      '{\n  "porCuarto": {\n    "ejemplo-id-123": [\n' +
      '      { "nombre": "Detalle de chimenea de piedra", "shotType": "detalle", "movement": "push_in", "enfoque": "Encuadra la piedra texturizada de la chimenea en primer plano", "priority": "must" }\n' +
      '    ]\n  }\n}\n\n' +
      'Maximo 6 tomas por cuarto.';
  }

  function parsePropuesta(texto, state) {
    const emptyResult = {
      proposal: { porCuarto: {} },
      report: { agregadas: 0, ignoradas: 0, motivos: [] },
    };

    try {
      if (!texto || typeof texto !== 'string') return emptyResult;

      let jsonStr = null;
      const backtickMatch = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (backtickMatch) {
        jsonStr = backtickMatch[1];
      } else {
        const firstBrace = texto.indexOf('{');
        const lastBrace = texto.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = texto.slice(firstBrace, lastBrace + 1);
        }
      }

      if (!jsonStr) return emptyResult;

      let parsed;
      try { parsed = JSON.parse(jsonStr); } catch (_) { return emptyResult; }

      if (!parsed || typeof parsed !== 'object' || !parsed.porCuarto || typeof parsed.porCuarto !== 'object') {
        return emptyResult;
      }

      const allTargets = [...(state.espacios || [])];
      const byId = new Map(allTargets.map((t) => [t.id, t]));
      const byNombre = new Map(allTargets.map((t) => [normNombre(t.nombre), t]));

      const shotTypes = getShotTypes();
      const movements = getMovements();

      const result = {};
      let agregadas = 0;
      let ignoradas = 0;
      const motivos = [];
      let totalSoFar = 0;
      const MAX_PER_ROOM = 6;
      const MAX_TOTAL = 40;

      for (const [rawId, tomas] of Object.entries(parsed.porCuarto)) {
        if (!Array.isArray(tomas)) continue;

        let target = byId.get(rawId);
        if (!target) target = byNombre.get(normNombre(rawId));
        if (!target) {
          ignoradas += tomas.length;
          motivos.push('cuarto no encontrado: ' + rawId);
          continue;
        }

        const targetId = target.id;
        const validShots = [];

        for (const toma of tomas) {
          if (totalSoFar + validShots.length >= MAX_TOTAL) {
            ignoradas++;
            motivos.push('limite total alcanzado');
            break;
          }
          if (validShots.length >= MAX_PER_ROOM) {
            ignoradas++;
            motivos.push('limite por cuarto alcanzado: ' + targetId);
            break;
          }
          if (!toma || typeof toma !== 'object') {
            ignoradas++;
            motivos.push('toma invalida en ' + targetId);
            continue;
          }
          if (!toma.shotType || !shotTypes[toma.shotType]) {
            ignoradas++;
            motivos.push('shotType invalido: ' + toma.shotType + ' en ' + targetId);
            continue;
          }
          if (!toma.movement || !movements[toma.movement]) {
            ignoradas++;
            motivos.push('movement invalido: ' + toma.movement + ' en ' + targetId);
            continue;
          }
          const priority = (toma.priority === 'must' || toma.priority === 'nice') ? toma.priority : 'nice';
          validShots.push({
            id: 'custom.ia.' + targetId + '.' + validShots.length,
            nombre: String(toma.nombre || ''),
            shotType: toma.shotType,
            movement: toma.movement,
            enfoque: String(toma.enfoque || ''),
            priority,
          });
        }

        if (validShots.length > 0) {
          result[targetId] = validShots;
          agregadas += validShots.length;
          totalSoFar += validShots.length;
        }
      }

      return { proposal: { porCuarto: result }, report: { agregadas, ignoradas, motivos } };
    } catch (_) {
      return emptyResult;
    }
  }

  function guideCoverage(state, mode) {
    const targets = targetsForMode(state, mode);
    return targets.map((target) => {
      const suggestions = suggestionsForTarget(state, mode, target);
      const guideSkip = target.guideSkip || {};
      const mustSugs = suggestions.filter((s) => s.priority === 'must');
      const niceSugs = suggestions.filter((s) => s.priority === 'nice');
      const mustProg = mustSugs.map((s) => ({ s, done: suggestionProgress(state, mode, target.id, s.id).done }));
      const mustHechas = mustProg.filter((p) => p.done).length;
      const mustFaltan = mustProg.filter((p) => !p.done && !guideSkip[p.s.id]).map((p) => p.s);
      const niceProg = niceSugs.map((s) => ({ s, done: suggestionProgress(state, mode, target.id, s.id).done }));
      const niceHechas = niceProg.filter((p) => p.done).length;
      const niceFaltan = niceProg.filter((p) => !p.done && !guideSkip[p.s.id]).map((p) => p.s);
      return { target, must: { hechas: mustHechas, faltan: mustFaltan }, nice: { hechas: niceHechas, faltan: niceFaltan } };
    });
  }

  const CAPA_ABIERTO = new Set(['wide', 'general', 'exterior', 'pov', 'reveal', 'simetrica', 'contrapicado']);
  const CAPA_MEDIO = new Set(['medio']);
  const CAPA_DETALLE = new Set(['detalle', 'textura', 'ventana']);

  function capasCubiertas(state, mode, targetId) {
    const cameraIds = new Set(
      (state.cameras || []).filter((c) => c.mode === mode).map((c) => c.id)
    );
    const files = (state.mediaFiles || []).filter(
      (f) => f.kind === 'take' && f.targetId === targetId && cameraIds.has(f.cameraId) && f.shotType
    );
    return {
      abierto: files.some((f) => CAPA_ABIERTO.has(f.shotType)),
      medio: files.some((f) => CAPA_MEDIO.has(f.shotType)),
      detalle: files.some((f) => CAPA_DETALLE.has(f.shotType)),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function blankEstados() {
    return {
      foto: { estado: 'pendiente' },
      t360: { estado: 'pendiente' },
      video: { estado: 'pendiente' },
      drone: { estado: 'pendiente' },
    };
  }

  function normalizeZone(value) {
    return value || 'interior';
  }

  const PISOS_DEFAULT = ['Exterior', 'Piso 1', 'Piso 2', 'Amenidades', 'Drone'];

  // ─── F18 — Piso Drone + zonas exteriores + camara por zona ────────────────────
  // El piso Drone es un piso especial cuyos espacios son sujetos aereos (F17). Se
  // marca de forma robusta por el nombre del piso del espacio (campo `piso`).
  const DRONE_PISO = 'Drone';
  const DRONE_PISOS = new Set(['Drone', 'drone']);

  // Zonas donde el drone es una camara valida ADEMAS de Sony/Osmo. Se leen del
  // campo `zona` del espacio (normalizado por normNombre): exterior, roof y
  // amenidades. 'roof' no es un valor canonico de `zona` hoy, pero se incluye por
  // robustez ante datos que lo usen como zona.
  const EXTERIOR_ZONAS = new Set(['exterior', 'roof', 'amenidades']);

  // El terreno se representa como un sujeto unico (no lista de cuartos).
  const TERRENO_SUBJECT_ID = 'terreno-unico';

  // F38 — Sesion unica de drone. El drone deja de ser "varios targets navegables
  // por escala" (F34/F35) y pasa a ser UNA sola sesion = UN solo target cuyas
  // SUGERENCIAS son la lista completa ordenada (fijas + una por espacio). Para
  // terreno se sigue usando el sujeto terreno (no se duplica).
  const DRONE_SESSION_ID = 'drone-session';

  function isDronePiso(piso) {
    if (!piso) return false;
    return DRONE_PISOS.has(piso) || normNombre(piso) === normNombre(DRONE_PISO);
  }

  // Devuelve true si el espacio vive en el piso Drone (sus tomas son aereas).
  function espacioEsDrone(espacio) {
    if (!espacio || typeof espacio !== 'object') return false;
    if (espacio.kind === 'drone') return true;
    return isDronePiso(espacio.piso);
  }

  // Zona normalizada del espacio para resolver la camara. Se lee el campo `piso`
  // (para el piso Drone) y el campo `zona` (interior/exterior/amenidades), que es
  // el campo real, siempre presente y normalizado por normalizeChecklistData.
  function zonaOfEspacio(espacio) {
    if (espacioEsDrone(espacio)) return 'drone';
    return normNombre(espacio && espacio.zona) || 'interior';
  }

  // F18/F35 — camaras disponibles para un target segun su naturaleza:
  //   target de drone (kind:'drone' / piso Drone) -> solo camaras drone (los dos).
  //   cualquier espacio de cuarto (interior/exterior/roof/amenidad) -> solo Sony/Osmo.
  // F35 quita el HIBRIDO de F18: el drone ya NO se ofrece como camara en espacios
  // exteriores/roof/amenidades de cuarto. El drone vive en su propia lane: sus
  // camaras se dan a los targets kind:'drone' de droneScaleTargets (features aereos
  // derivados + fijos + terreno). La UI usa esto en el switch de camara del loop.
  function camerasForEspacio(state, espacio) {
    const cameras = getCameras(state).filter((cam) => cam && cam.mode !== 'asesor');
    const drones = cameras.filter((cam) => cam.mode === 'drone');
    const terrestres = cameras.filter((cam) => cam.mode !== 'drone');
    const zona = zonaOfEspacio(espacio);
    if (zona === 'drone') return drones;
    return terrestres;
  }

  // F18 — Terreno como sujeto unico. Con guide.tipoPropiedad === 'terreno' el modelo
  // representa un solo espacio "El terreno" en vez de lista de cuartos; sus
  // sugerencias son las aereas del terreno (biblioteca aerea de F17).
  function terrenoSingleSubject(state) {
    const guide = state && state.guide ? state.guide : {};
    const existing = (state && Array.isArray(state.espacios) ? state.espacios : [])
      .find((esp) => esp && esp.id === TERRENO_SUBJECT_ID);
    const subject = existing || {
      id: TERRENO_SUBJECT_ID,
      nombre: 'El terreno',
      parentId: null,
      orden: 1,
      clave: true,
      zona: 'exterior',
      piso: 'Exterior',
      // F35 — el sujeto terreno es un target de drone (kind:'drone'); porta la lista
      // unica de 14 del pool aereo nuevo via suggestionsForTarget. isTerrenoSubject
      // es el marcador que el resolver usa para devolver las 14 (no solo las viejas).
      kind: 'drone',
      isTerrenoSubject: true,
      categoria: undefined,
      estados: blankEstados(),
    };
    return {
      isTerreno: guide.tipoPropiedad === 'terreno',
      subject,
      suggestions: aerialSuggestionsForSubject('terreno_completo'),
    };
  }

  // ─── F35 — Targets de drone derivados de espacios reales + targets fijos ──────
  // Los targets de drone son VIRTUALES: se calculan al vuelo (droneScaleTargets) y
  // NO se persisten en state.espacios (a diferencia de Terreno, que materializa UN
  // sujeto). Si se materializaran reaparecerian como pseudo-cuartos en "Armar
  // cuartos" y en los targets de video (que comparten state.espacios).

  // ¿Es un espacio un target de drone preexistente (kind:'drone' / piso Drone)?
  function _espacioDroneCompat(esp) {
    return espacioEsDrone(esp);
  }

  // ¿Aplica la escala "amenidades"? Solo privada/coto/depto (por guide.tipoPropiedad)
  // o cuando existan espacios reales de zona amenidades.
  function droneAmenidadesAplica(state) {
    const guide = state && state.guide ? state.guide : {};
    const tipo = guide.tipoPropiedad;
    if (tipo === 'departamento') return true;
    if (guide.subtipoPropiedad === 'privada' || guide.subtipoPropiedad === 'coto') return true;
    const espacios = state && Array.isArray(state.espacios) ? state.espacios : [];
    return espacios.some((esp) => esp && normNombre(esp.zona) === 'amenidades' && !_espacioDroneCompat(esp));
  }

  // F35 — Targets aereos DERIVADOS de los espacios exteriores/amenidad reales.
  // Por cada espacio de zona exterior o amenidades (que NO sea ya un target de drone
  // viejo ni el terreno-unico) genera su version aerea con su feature derivado del
  // nombre, para que suggestionsForTarget le devuelva el vocabulario aereo de ese
  // feature. NO genera para interiores. Si no hay alberca, no hay "Alberca aerea".
  function droneFeatureTargets(state) {
    const espacios = state && Array.isArray(state.espacios) ? state.espacios : [];
    const out = [];
    espacios.forEach((esp) => {
      if (!esp || typeof esp !== 'object') return;
      if (esp.id === TERRENO_SUBJECT_ID) return;
      if (_espacioDroneCompat(esp)) return;
      const zona = normNombre(esp.zona);
      const esAmenidad = zona === 'amenidades';
      if (zona !== 'exterior' && !esAmenidad) return;
      out.push({
        id: 'drone-feat-' + esp.id,
        nombre: (esp.nombre || 'Espacio') + ' aérea',
        scale: esAmenidad ? 'amenidades' : 'propiedad',
        kind: 'drone',
        featOf: esp.id,
        feature: aerialFeatureKeyFromName(esp.nombre) || undefined,
        estados: blankEstados(),
      });
    });
    return out;
  }

  // F35 — Targets FIJOS property-wide de la escala Propiedad (no dependen de
  // espacios): Salida a contexto (must canonica de cierre), Fachada/Orbita,
  // Cenital giratorio. Cada uno con su scale para que suggestionsForTarget resuelva.
  function _droneFixedPropertyTargets() {
    return [
      { id: 'drone-fixed-salida-contexto', nombre: 'Salida a contexto', scale: 'propiedad', kind: 'drone', estados: blankEstados() },
      { id: 'drone-fixed-fachada-orbita',  nombre: 'Fachada / Órbita',   scale: 'propiedad', kind: 'drone', estados: blankEstados() },
      { id: 'drone-fixed-cenital-giratorio', nombre: 'Cenital giratorio', scale: 'propiedad', kind: 'drone', estados: blankEstados() },
    ];
  }

  // F35 — Targets FIJOS de Inmediato / Ubicacion (del pool / DRONE_SCALES).
  function _droneFixedContextTargets() {
    return [
      { id: 'drone-fixed-inmediato', nombre: 'Inmediato / colonia',  scale: 'inmediato', kind: 'drone', estados: blankEstados() },
      { id: 'drone-fixed-ubicacion', nombre: 'Ubicación / contexto', scale: 'ubicacion', kind: 'drone', estados: blankEstados() },
    ];
  }

  // F35 — Targets de la lane de drone. VIRTUAL (se calcula al vuelo, NO se persiste).
  // Compone, de-dup por id:
  //   (a) droneFeatureTargets (derivados de espacios reales);
  //   (b) fijos property-wide de Propiedad (Salida a contexto, Fachada/Orbita, Cenital);
  //   (c) fijos de Inmediato/Ubicacion;
  //   (d) CAMINO DE COMPAT: los espacios kind:'drone' preexistentes (drone-piso
  //       viejo + terreno-unico) y cualquier espacio con una toma de drone ya pegada,
  //       para que sus mediaFiles NO se huerfanen al cargar (ver normalizeChecklistData).
  // La escala Amenidades (en derivados/fijos) solo se incluye si aplica.
  function droneScaleTargets(state) {
    const espacios = state && Array.isArray(state.espacios) ? state.espacios : [];
    const mediaFiles = state && Array.isArray(state.mediaFiles) ? state.mediaFiles : [];
    const cameras = state && Array.isArray(state.cameras) ? state.cameras : [];
    const amenidades = droneAmenidadesAplica(state);

    const result = [];
    const seen = new Set();
    const push = (t) => {
      if (!t || !t.id || seen.has(t.id)) return;
      if (t.scale === 'amenidades' && !amenidades) return;
      seen.add(t.id);
      result.push(t);
    };

    // (a) derivados de espacios reales.
    droneFeatureTargets(state).forEach(push);
    // (b) + (c) fijos.
    _droneFixedPropertyTargets().forEach(push);
    _droneFixedContextTargets().forEach(push);

    // (d) camino de compat: espacios kind:'drone' preexistentes + cualquier espacio
    // con una toma de drone pegada (incluye drone-piso viejo y el terreno-unico).
    const droneCameraIds = new Set(cameras.filter((c) => c && c.mode === 'drone').map((c) => c.id));
    const espaciosConTomaDrone = new Set(
      mediaFiles
        .filter((f) => f && f.kind === 'take' && f.targetId && droneCameraIds.has(f.cameraId))
        .map((f) => f.targetId)
    );
    espacios.forEach((esp) => {
      if (!esp || typeof esp !== 'object' || !esp.id) return;
      if (seen.has(esp.id)) return;
      if (_espacioDroneCompat(esp) || espaciosConTomaDrone.has(esp.id)) {
        seen.add(esp.id);
        result.push(esp);
      }
    });

    return result;
  }

  // ─── F38 — Sesion unica de drone: target unico + lista ordenada de sugerencias ─
  // El drone es UNA sola sesion (una lista ordenada de tomas que se vuela de
  // corrido). El sujeto/target de sesion es unico. Para terreno NO se crea uno
  // nuevo: ES el sujeto de terrenoSingleSubject (no se duplica).

  // Target de sesion de drone. Casa/quinta/depto: un sujeto kind:'drone' estable.
  // Terreno: el sujeto unico de terrenoSingleSubject (mismo target, no duplicado).
  function droneSessionSubject(state) {
    const guide = state && state.guide ? state.guide : {};
    if (guide.tipoPropiedad === 'terreno') {
      return terrenoSingleSubject(state).subject;
    }
    return {
      id: DRONE_SESSION_ID,
      nombre: 'Sesión de drone',
      parentId: null,
      kind: 'drone',
      estados: blankEstados(),
    };
  }

  // F38 — Lista ORDENADA de tomas sugeridas de la sesion de drone:
  //   (1) Fijas por tipo: tomas del pool property-wide/inmediato/ubicacion (las que
  //       NO tienen `feature`) aplicables al tipo, ordenadas por escala (orden de
  //       DRONE_SCALES), must primero dentro de cada escala. Incluye "Salida a
  //       contexto" (canonica, tipos:'all').
  //   (2) Derivadas: UNA toma por espacio real de zona exterior o amenidades (no
  //       interiores, no el sujeto de sesion, no espacios kind:'drone' viejos). Si
  //       el espacio empareja un feature conocido toma la PRIMERA toma de su
  //       vocabulario como base (shotType/movement) con nombre "<espacio> aérea/o";
  //       si no, generica "<nombre> aérea/o".
  //   Orden final: agrupada por escala (propiedad -> amenidades -> inmediato ->
  //   ubicacion); dentro de cada escala, must primero, luego derivadas. De-dup por id.
  // Para terreno: reusa las 14 tomas (suggestionsForTarget del sujeto terreno).
  function droneSessionSuggestions(state) {
    const guide = state && state.guide ? state.guide : {};
    const tipo = guide.tipoPropiedad;
    if (tipo === 'terreno') {
      // Reusa la lista unica de 14 del sujeto terreno (no se duplica la logica).
      return suggestionsForTarget(state, 'drone', terrenoSingleSubject(state).subject);
    }

    const amenidades = droneAmenidadesAplica(state);
    const scaleOrder = DRONE_SCALES.map((s) => s.id);

    // (1) Fijas: SOLO tomas que siempre se hacen (property-wide / contexto). Se
    // excluyen las de feature, las `situacional` (p.ej. Reveal sobre barda, solo si
    // hay barda/porton) y las `derivable` (Casa club, Patio/jardin/alberca, Cancha/
    // cabanas, Lobby): esas salen UNA por espacio via derivacion (paso 2), no fijas.
    const fixedByScale = Object.create(null);
    scaleOrder.forEach((scale) => {
      if (scale === 'amenidades' && !amenidades) { fixedByScale[scale] = []; return; }
      fixedByScale[scale] = aerialPoolForScale(scale, tipo).filter((s) => !s.feature && !s.situacional && !s.derivable);
    });

    // (2) Derivadas: una por espacio exterior/amenidad real.
    const espacios = state && Array.isArray(state.espacios) ? state.espacios : [];
    const derivedByScale = Object.create(null);
    scaleOrder.forEach((scale) => { derivedByScale[scale] = []; });
    espacios.forEach((esp) => {
      if (!esp || typeof esp !== 'object' || !esp.id) return;
      if (esp.id === TERRENO_SUBJECT_ID || esp.id === DRONE_SESSION_ID) return;
      if (_espacioDroneCompat(esp)) return; // no interiores se filtra abajo; no espacios drone viejos
      const zona = normNombre(esp.zona);
      const esAmenidad = zona === 'amenidades';
      if (zona !== 'exterior' && !esAmenidad) return; // interiores no aportan
      const scale = esAmenidad ? 'amenidades' : 'propiedad';
      if (scale === 'amenidades' && !amenidades) return;
      const featureKey = aerialFeatureKeyFromName(esp.nombre);
      const vocab = featureKey ? aerialVocabForFeature(featureKey) : [];
      const base = vocab.length ? vocab[0] : null;
      const nombreEsp = esp.nombre || 'Espacio';
      derivedByScale[scale].push({
        id: 'drone-feat-' + esp.id,
        nombre: nombreEsp + ' aérea',
        shotType: base ? base.shotType : 'establecimiento',
        movement: base ? base.movement : 'static',
        scale,
        must: false,
        featOf: esp.id,
      });
    });

    // Orden final: por escala, must primero (fijas) y luego derivadas. De-dup por id.
    const out = [];
    const seen = new Set();
    const pushAll = (arr) => arr.forEach((s) => {
      if (!s || !s.id || seen.has(s.id)) return;
      seen.add(s.id);
      out.push(s);
    });
    scaleOrder.forEach((scale) => {
      pushAll(fixedByScale[scale] || []);
      pushAll(derivedByScale[scale] || []);
    });
    return out;
  }

  // ─── F19 — Biblioteca de cuartos indexada por piso + tipo de propiedad ────────
  // Amplia la biblioteca de espacios (TEMPLATE_DEFS/SPACE_SUGGESTIONS) e indexa los
  // chips tipicos por PISO (nombre del piso, como en PISOS_DEFAULT) y por TIPO de
  // propiedad. Cada chip es { nombre, zona, categoria, clave } donde:
  //   - nombre: etiqueta visible (con acentos/ñ).
  //   - zona:   interior | exterior | amenidades (la zona canonica del espacio).
  //   - categoria: id de ROOM_CATEGORIES para resolver las tomas sugeridas.
  //   - clave:  espacio clave (must) que se sugiere por defecto.
  // Incluye Pasillo y Entrada/Recibidor como espacios de primera clase (sus tomas
  // viven en GUIDE_LIBRARY.pasillo / GUIDE_LIBRARY.entrada y sus keywords en
  // ROOM_CATEGORIES). El piso 'Exterior' y 'Amenidades' son compartidos por tipo.
  // Aditivo: no altera TEMPLATE_DEFS ni sus consumidores.
  function _chip(nombre, zona, categoria, clave) {
    return Object.freeze({ nombre, zona, categoria, clave: !!clave });
  }

  const SPACE_LIBRARY_BY_FLOOR = Object.freeze({
    casa: Object.freeze({
      'Exterior': Object.freeze([
        _chip('Fachada', 'exterior', 'exterior', true),
        _chip('Jardín', 'exterior', 'exterior', true),
        _chip('Cochera', 'exterior', 'garaje', false),
        _chip('Alberca', 'exterior', 'exterior', false),
        _chip('Patio', 'exterior', 'exterior', false),
        _chip('Terraza', 'exterior', 'terraza', false),
      ]),
      'Piso 1': Object.freeze([
        _chip('Recibidor', 'interior', 'entrada', true),
        _chip('Sala', 'interior', 'sala', true),
        _chip('Comedor', 'interior', 'comedor', true),
        _chip('Cocina', 'interior', 'cocina', true),
        _chip('Pasillo', 'interior', 'pasillo', false),
        _chip('Baño de visitas', 'interior', 'medio_bano', false),
        _chip('Estudio', 'interior', 'estudio', false),
        _chip('Lavandería', 'interior', 'lavado', false),
        _chip('Antecomedor', 'interior', 'comedor', false),
        _chip('Cuarto de servicio', 'interior', 'servicio', false),
        _chip('Baño de servicio', 'interior', 'bano', false),
      ]),
      'Piso 2': Object.freeze([
        _chip('Pasillo', 'interior', 'pasillo', false),
        _chip('Recámara principal', 'interior', 'recamara', true),
        _chip('Baño principal', 'interior', 'bano', false),
        _chip('Clóset', 'interior', 'vestidor', false),
        _chip('Recámara 2', 'interior', 'recamara', false),
        _chip('Recámara 3', 'interior', 'recamara', false),
        _chip('Baño', 'interior', 'bano', false),
        _chip('Family room', 'interior', 'family', false),
        _chip('Sala de TV', 'interior', 'family', false),
        _chip('Vestidor', 'interior', 'vestidor', false),
      ]),
      'Amenidades': Object.freeze([
        _chip('Caseta / acceso', 'amenidades', 'entrada', true),
        _chip('Casa club', 'amenidades', 'salon_eventos', true),
        _chip('Alberca', 'amenidades', 'alberca', true),
        _chip('Gimnasio', 'amenidades', 'gimnasio', false),
        _chip('Áreas verdes', 'amenidades', 'jardin', false),
        _chip('Juegos infantiles', 'amenidades', 'area_infantil', false),
        _chip('Cancha', 'amenidades', 'cancha', false),
        _chip('Asadores', 'amenidades', 'asadores', false),
        _chip('Salón de eventos', 'amenidades', 'salon_eventos', false),
        _chip('Roof garden', 'amenidades', 'terraza', false),
        _chip('Bodega', 'amenidades', 'bodega', false),
      ]),
    }),
    departamento: Object.freeze({
      'Exterior': Object.freeze([
        _chip('Balcón / Terraza', 'exterior', 'terraza', true),
        _chip('Vista exterior', 'exterior', 'exterior', false),
      ]),
      'Piso 1': Object.freeze([
        _chip('Acceso', 'interior', 'entrada', true),
        _chip('Sala', 'interior', 'sala', true),
        _chip('Comedor', 'interior', 'comedor', true),
        _chip('Cocina', 'interior', 'cocina', true),
        _chip('Pasillo', 'interior', 'pasillo', false),
        _chip('Baño de visitas', 'interior', 'medio_bano', false),
        _chip('Recámara principal', 'interior', 'recamara', true),
        _chip('Baño principal', 'interior', 'bano', false),
        _chip('Clóset', 'interior', 'vestidor', false),
        _chip('Recámara secundaria', 'interior', 'recamara', false),
        _chip('Lavandería', 'interior', 'lavado', false),
        _chip('Antecomedor', 'interior', 'comedor', false),
        _chip('Vestidor', 'interior', 'vestidor', false),
      ]),
      'Amenidades': Object.freeze([
        _chip('Lobby', 'amenidades', 'entrada', true),
        _chip('Alberca', 'amenidades', 'alberca', true),
        _chip('Gimnasio', 'amenidades', 'gimnasio', true),
        _chip('Terraza común', 'amenidades', 'terraza', true),
        _chip('Salón de eventos', 'amenidades', 'salon_eventos', false),
        _chip('Asadores', 'amenidades', 'asadores', false),
        _chip('Elevadores', 'amenidades', 'elevadores', false),
      ]),
    }),
    quinta: Object.freeze({
      'Exterior': Object.freeze([
        _chip('Fachada', 'exterior', 'exterior', true),
        _chip('Acceso / Caseta', 'exterior', 'entrada', false),
        _chip('Estacionamiento', 'exterior', 'garaje', false),
        _chip('Jardines', 'exterior', 'exterior', true),
      ]),
      'Piso 1': Object.freeze([
        _chip('Recibidor', 'interior', 'entrada', false),
        _chip('Sala', 'interior', 'sala', true),
        _chip('Comedor', 'interior', 'comedor', true),
        _chip('Cocina', 'interior', 'cocina', true),
        _chip('Pasillo', 'interior', 'pasillo', false),
        _chip('Recámara principal', 'interior', 'recamara', true),
        _chip('Baño principal', 'interior', 'bano', false),
        _chip('Recámara 2', 'interior', 'recamara', false),
        _chip('Baño de visitas', 'interior', 'medio_bano', false),
        _chip('Antecomedor', 'interior', 'comedor', false),
        _chip('Cuarto de servicio', 'interior', 'servicio', false),
        _chip('Baño de servicio', 'interior', 'bano', false),
      ]),
      'Amenidades': Object.freeze([
        _chip('Alberca', 'amenidades', 'alberca', true),
        _chip('Palapa', 'amenidades', 'palapa', true),
        _chip('Asadores', 'amenidades', 'asadores', false),
        _chip('Cocina exterior', 'amenidades', 'cocina', false),
        _chip('Jardines', 'amenidades', 'jardin', true),
        _chip('Cancha', 'amenidades', 'cancha', false),
        _chip('Cabañas', 'amenidades', 'generico', false),
        _chip('Baño de alberca', 'amenidades', 'bano', false),
      ]),
    }),
    terreno: Object.freeze({
      'Exterior': Object.freeze([
        _chip('Frente del terreno', 'exterior', 'exterior', true),
        _chip('Vista desde calle', 'exterior', 'exterior', true),
        _chip('Acceso', 'exterior', 'entrada', true),
        _chip('Perímetro / colindancias', 'exterior', 'exterior', false),
        _chip('Vista panorámica', 'exterior', 'exterior', true),
        _chip('Servicios / entorno', 'exterior', 'exterior', false),
      ]),
    }),
  });

  // F19 — devuelve los chips tipicos de un piso + tipo de propiedad. Si no se pasa
  // tipoPropiedad usa el del guide. Si el piso/tipo no existe en la biblioteca,
  // devuelve []. Devuelve copias (no las instancias congeladas) para que la UI las
  // pueda usar como base mutable. Forma del retorno: array de
  //   { nombre, zona, categoria, clave }.
  function suggestedSpacesFor(state, piso, tipoPropiedad) {
    const tipo = tipoPropiedad != null
      ? tipoPropiedad
      : (state && state.guide ? state.guide.tipoPropiedad : null);
    const byFloor = SPACE_LIBRARY_BY_FLOOR[tipo];
    if (!byFloor || !piso) return [];
    // Empareja el nombre del piso de forma robusta (case/acentos-insensible).
    let chips = byFloor[piso];
    if (!chips) {
      const pisoNorm = normNombre(piso);
      const match = Object.keys(byFloor).find((k) => normNombre(k) === pisoNorm);
      chips = match ? byFloor[match] : null;
    }
    if (!chips) return [];
    return chips.map((c) => ({ nombre: c.nombre, zona: c.zona, categoria: c.categoria, clave: c.clave }));
  }

  // F32 — Espacios solo-buscables: NO entran a suggestedSpacesFor (no ensucian los
  // chips por piso/tipo) pero SI se indexan para que searchSpaces los encuentre.
  // Forma: { nombre, zona, categoria }. Se concatenan a SPACE_LIBRARY_INDEX con
  // tipo:'extra', piso:null, clave:false.
  const EXTRA_SPACES = Object.freeze([
    Object.freeze({ nombre: 'Cava', zona: 'interior', categoria: 'bodega' }),
    Object.freeze({ nombre: 'Bar / Cantina', zona: 'interior', categoria: 'sala' }),
    Object.freeze({ nombre: 'Cuarto de juegos', zona: 'interior', categoria: 'family' }),
  ]);

  // F19 — Indice plano de toda la biblioteca de espacios para el buscador. Cada
  // entrada es { id, nombre, zona, categoria, tipo, piso, clave }. Se deduplica por
  // nombre normalizado para no repetir el mismo espacio que aparece en varios pisos
  // o tipos (p. ej. Sala, Pasillo, Baño). El id es el nombre normalizado.
  // F32 — al final se concatenan los EXTRA_SPACES (solo-buscables).
  const SPACE_LIBRARY_INDEX = (() => {
    const out = [];
    const seen = new Set();
    for (const [tipo, byFloor] of Object.entries(SPACE_LIBRARY_BY_FLOOR)) {
      for (const [piso, chips] of Object.entries(byFloor)) {
        for (const c of chips) {
          const key = normNombre(c.nombre);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(Object.freeze({
            id: key,
            nombre: c.nombre,
            zona: c.zona,
            categoria: c.categoria,
            tipo,
            piso,
            clave: c.clave,
          }));
        }
      }
    }
    for (const e of EXTRA_SPACES) {
      const key = normNombre(e.nombre);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(Object.freeze({
        id: key,
        nombre: e.nombre,
        zona: e.zona,
        categoria: e.categoria,
        tipo: 'extra',
        piso: null,
        clave: false,
      }));
    }
    return Object.freeze(out);
  })();

  // F19 — Buscador sobre TODA la biblioteca de espacios (normalizado: sin acentos,
  // case-insensitive). La UI de F20 consume este formato.
  //
  // Retorno: array de entradas. Cada coincidencia de biblioteca tiene la forma:
  //   { kind: 'match', id, nombre, zona, categoria, tipo, piso, clave }
  // Si el texto de busqueda no es vacio, SIEMPRE se anexa al final una entrada
  // especial para crear un espacio nuevo con ese texto literal:
  //   { kind: 'create', id: 'create-nuevo', nombre: <texto original>, zona: 'interior' }
  // Con query vacio devuelve toda la biblioteca (sin la opcion crear nuevo).
  function searchSpaces(query) {
    const raw = String(query == null ? '' : query).trim();
    const q = normNombre(raw);
    const cats = getRoomCategories();
    function entryMatches(entry) {
      if (normNombre(entry.nombre).includes(q)) return true;
      const cat = cats.find((c) => c.id === entry.categoria);
      if (!cat) return false;
      return cat.keywords.some((kw) => {
        const kwNorm = normNombre(kw);
        return kwNorm.includes(q) || q.includes(kwNorm);
      });
    }
    const matches = (q
      ? SPACE_LIBRARY_INDEX.filter(entryMatches)
      : SPACE_LIBRARY_INDEX
    ).map((entry) => ({
      kind: 'match',
      id: entry.id,
      nombre: entry.nombre,
      zona: entry.zona,
      categoria: entry.categoria,
      tipo: entry.tipo,
      piso: entry.piso,
      clave: entry.clave,
    }));
    if (!raw) return matches;
    matches.push({ kind: 'create', id: 'create-nuevo', nombre: raw, zona: 'interior' });
    return matches;
  }

  function pisoFromZona(zona) {
    if (zona === 'amenidades') return 'Amenidades';
    if (zona === 'exterior') return 'Exterior';
    if (zona === 'interior') return 'Piso 1';
    return 'Sin piso';
  }

  function derivePisos(espacios) {
    const seen = [];
    (espacios || []).forEach((space) => {
      if (space.piso && !seen.includes(space.piso)) seen.push(space.piso);
    });
    return seen.length ? seen : PISOS_DEFAULT.slice();
  }

  function createDroneItems() {
    return DRONE_DEFAULTS.map((nombre, index) => ({
      id: 'drone-default-' + index,
      nombre,
      estado: 'pendiente',
      ordenLista: index + 1,
    }));
  }

  function createDefaultState() {
    return {
      version: 3,
      servicios: clone(SERVICES_DEFAULT),
      pisos: [],
      modoActual: 'video',
      espacios: [],
      droneItems: [],
      asesorPuntos: createAsesorPuntos(),
      recorrido: {},
      bitacora: [],
      cameras: clone(CAMERA_DEFAULTS),
      activeCameraByMode: { video: 'sony-main', drone: 'drone-dji' },
      sequenceSegments: [],
      mediaFiles: [],
      guide: { tipoPropiedad: null, descripcion: '', proposal: null, incluirDrone: false },
    };
  }

  function legacyValueToState(value) {
    if (!value) return { estado: 'pendiente' };
    return { estado: 'hecho', autor: typeof value === 'string' ? value : '', hora: '' };
  }

  // Convierte droneItems (modelo viejo) en espacios (modelo nuevo). Mutador.
  // Solo migra droneItems que tengan al menos un mediaFile apuntandolos; los demas se descartan.
  function migrateDroneItemsToEspacios(state) {
    const droneItems = Array.isArray(state.droneItems) ? state.droneItems : [];
    if (!droneItems.length) {
      state.droneItems = [];
      return;
    }
    const mediaFiles = Array.isArray(state.mediaFiles) ? state.mediaFiles : [];
    const espaciosIds = new Set((state.espacios || []).map((esp) => esp.id));
    // droneItems usados por al menos un mediaFile (y que no sean ya un espacio).
    const usedIds = new Set();
    mediaFiles.forEach((file) => {
      if (file && file.targetId && !espaciosIds.has(file.targetId)) usedIds.add(file.targetId);
    });
    const idMap = {};
    droneItems.forEach((item, index) => {
      if (!item || !item.id || !usedIds.has(item.id)) return;
      const nuevoId = makeId('esp');
      idMap[item.id] = nuevoId;
      const estados = blankEstados();
      if (item.estado === 'hecho') estados.drone = { estado: 'hecho' };
      else if (item.noAplica) estados.drone = { estado: 'no_aplica' };
      state.espacios.push({
        id: nuevoId,
        nombre: item.nombre || 'Toma drone',
        parentId: null,
        orden: state.espacios.length + 1,
        clave: false,
        zona: 'exterior',
        piso: 'Exterior',
        estados,
        categoria: undefined,
        guideSkip: undefined,
      });
    });
    // Reasignar el targetId de los mediaFiles al espacio nuevo, preservando todo lo demas.
    mediaFiles.forEach((file) => {
      if (file && file.targetId && idMap[file.targetId]) file.targetId = idMap[file.targetId];
    });
    state.droneItems = [];
  }

  function normalizeChecklistData(data) {
    if (data && (data.version === 2 || data.version === 3)) {
      const normalized = Object.assign(createDefaultState(), clone(data));
      normalized.servicios = Object.assign(clone(SERVICES_DEFAULT), normalized.servicios || {});
      normalized.guide = Object.assign({ tipoPropiedad: null, descripcion: '', proposal: null, incluirDrone: false }, normalized.guide || {});
      // F35 — migracion del default incluirDrone: el campo es nuevo. Si el estado
      // entrante NO lo trae pero tiene rastro de drone (algun espacio kind:'drone' o
      // algun mediaFile de camara drone), se normaliza a true; si no, queda false.
      // Si ya viene el campo, se respeta. (El motor no conoce el rol; la UI lo
      // enciende — pero un estado viejo con tomas de drone debe verse en la lane.)
      const _guideEntrante = (data && typeof data.guide === 'object' && data.guide) ? data.guide : {};
      if (!Object.prototype.hasOwnProperty.call(_guideEntrante, 'incluirDrone')) {
        const _espaciosEntrantes = Array.isArray(data && data.espacios) ? data.espacios : [];
        const _droneItemsEntrantes = Array.isArray(data && data.droneItems) ? data.droneItems : [];
        const _camsEntrantes = Array.isArray(data && data.cameras) ? data.cameras : [];
        const _droneCamIds = new Set(
          _camsEntrantes.filter((c) => c && c.mode === 'drone').map((c) => c.id)
          // los drones por defecto tambien cuentan como camara drone aunque no esten en data.cameras
          .concat(['drone-dji', 'drone-mini-4-pro'])
        );
        const _filesEntrantes = Array.isArray(data && data.mediaFiles) ? data.mediaFiles : [];
        const _hayRastroDrone =
          _espaciosEntrantes.some((esp) => esp && (esp.kind === 'drone' || isDronePiso(esp.piso)))
          || _droneItemsEntrantes.length > 0
          || _filesEntrantes.some((f) => f && f.cameraId && _droneCamIds.has(f.cameraId));
        normalized.guide.incluirDrone = !!_hayRastroDrone;
      }
      normalized.espacios = (normalized.espacios || []).map((space, index) => ({
        id: space.id || makeId('esp'),
        nombre: space.nombre || 'Espacio sin nombre',
        parentId: space.parentId || null,
        orden: space.orden || index + 1,
        clave: !!space.clave,
        zona: normalizeZone(space.zona),
        piso: space.piso || pisoFromZona(normalizeZone(space.zona)),
        estados: Object.assign(blankEstados(), space.estados || {}),
        categoria: space.categoria || undefined,
        guideSkip: space.guideSkip || undefined,
      }));
      // Migracion droneItems -> espacios: el drone ya no es entidad propia, comparte espacios.
      // Por cada droneItem USADO por al menos un mediaFile creamos un espacio nuevo en piso
      // 'Exterior' (zona 'exterior') y reasignamos el targetId de esos mediaFiles, preservando
      // todo lo demas del mediaFile. Los droneItems no usados se descartan. No se pierden archivos.
      migrateDroneItemsToEspacios(normalized);
      // Migracion de pisos: si el estado entrante trae `pisos` como array (incluido `[]` vacio a
      // proposito por el flujo nuevo de "arrancar sin pisos"), se respeta tal cual. Solo cuando
      // `pisos` viene ausente/undefined/null (estado legacy) se deriva de los espacios.
      normalized.pisos = Array.isArray(data && data.pisos) ? data.pisos.slice() : derivePisos(normalized.espacios);
      normalized.asesorPuntos = (normalized.asesorPuntos && normalized.asesorPuntos.length ? normalized.asesorPuntos : createAsesorPuntos())
        .map((p, index) => ({
          id: p.id || makeId('asesor'),
          nombre: p.nombre || 'Punto',
          tipo: p.tipo === 'voz' ? 'voz' : 'normal',
          estado: p.estado || 'pendiente',
          ordenLista: p.ordenLista || index + 1,
        }));
      normalized.bitacora = normalized.bitacora || [];
      const savedCameras = normalized.cameras || [];
      normalized.cameras = CAMERA_DEFAULTS.map((camera) => Object.assign({}, camera, savedCameras.find((item) => item.id === camera.id) || {}))
        .concat(savedCameras.filter((camera) => !CAMERA_DEFAULTS.some((item) => item.id === camera.id)));
      normalized.activeCameraByMode = Object.assign({ video: 'sony-main', drone: 'drone-dji' }, normalized.activeCameraByMode || {});
      ['video', 'drone'].forEach((mode) => {
        if (!normalized.cameras.some((camera) => camera.id === normalized.activeCameraByMode[mode] && camera.mode === mode)) {
          normalized.activeCameraByMode[mode] = normalized.cameras.find((camera) => camera.mode === mode).id;
        }
      });
      normalized.sequenceSegments = normalized.sequenceSegments || [];
      normalized.mediaFiles = normalized.mediaFiles || [];
      normalized.mediaFiles.forEach((file) => {
        const camera = normalized.cameras.find((item) => item.id === file.cameraId);
        const targets = camera ? targetsForMode(normalized, camera.mode) : [];
        if (!camera || (file.targetId && !targets.some((target) => target.id === file.targetId))) {
          file.targetId = null;
          file.scene = 'Sin identificar';
          file.scenePath = 'Sin identificar';
          file.kind = 'omitted';
          file.discardReason = null;
          file.good = false;
          file.favorite = false;
          file.shotNumber = null;
        }
        if (typeof file.favorite !== 'boolean') file.favorite = false;
        file.shotType = file.shotType || null;
        file.movement = file.movement || null;
        file.sentido = file.sentido != null ? file.sentido : null;
        file.pared = file.pared != null ? file.pared : null;
        // F28: fusion Push/Pull. Tomas viejas con push_in/pull_out migran a push_pull
        // conservando el sentido. El resto de movimientos se respeta.
        if (file.movement === 'push_in') { file.movement = 'push_pull'; if (file.sentido == null) file.sentido = 'in'; }
        else if (file.movement === 'pull_out') { file.movement = 'push_pull'; if (file.sentido == null) file.sentido = 'out'; }
        file.suggestionId = file.suggestionId || null;
      });
      normalized.sequenceSegments.forEach((segment) => {
        const counters = normalized.mediaFiles.filter((file) => file.segmentId === segment.id).map((file) => file.fileCounter);
        if (counters.length) segment.counterNext = Math.max(segment.counterNext || 0, Math.max(...counters) + 1);
      });
      if (normalized.mediaFiles.length) repairDerivedMediaState(normalized);
      normalized.version = 3;
      return normalized;
    }

    const base = createDefaultState();
    const legacyRooms = data && Array.isArray(data.cuartos) ? data.cuartos : [];
    const legacyCols = data && data.columnas ? data.columnas : {};
    base.servicios = {
      foto: legacyCols.foto !== false,
      t360: legacyCols.t360 !== false,
      video: legacyCols.video !== false,
      drone: true,
    };
    base.espacios = legacyRooms.map((room, index) => ({
      id: room.id || 'legacy-' + index,
      nombre: room.nombre || 'Espacio sin nombre',
      parentId: null,
      orden: index + 1,
      clave: false,
      zona: 'interior',
      piso: pisoFromZona('interior'),
      estados: {
        foto: legacyValueToState(room.foto || room.completado),
        t360: legacyValueToState(room.t360 || room.completado),
        video: legacyValueToState(room.video || room.completado),
        drone: { estado: 'pendiente' },
      },
    }));
    base.pisos = derivePisos(base.espacios);
    return base;
  }

  function parseFilenameSequence(filename, cameraKind) {
    const value = String(filename || '').trim();
    const stem = value.replace(/\.[^.]+$/, '');
    const matches = [...stem.matchAll(/\d+/g)];
    if (!matches.length) return null;
    const counterMatch = matches[matches.length - 1];
    const counterText = counterMatch[0];
    const before = stem.slice(0, counterMatch.index);
    const after = stem.slice(counterMatch.index + counterText.length);
    const letterPrefix = (before.match(/[A-Za-z]+$/) || [''])[0];
    return {
      counter: Number(counterText),
      counterWidth: counterText.length,
      prefixHint: cameraKind === 'dji' ? '' : letterPrefix,
      suffixHint: after,
      exampleFilename: value,
    };
  }

  function formatFileToken(segment, counter) {
    return (segment.prefixHint || '') + String(counter).padStart(segment.counterWidth || 1, '0');
  }

  function getCamera(state, cameraId) {
    return (state.cameras || []).find((camera) => camera.id === cameraId);
  }

  function getCameraSequence(state, cameraId) {
    const camera = getCamera(state, cameraId);
    const segment = (state.sequenceSegments || []).find((item) => item.id === (camera && camera.activeSegmentId));
    return {
      camera,
      segment,
      nextToken: segment ? formatFileToken(segment, segment.counterNext) : '',
    };
  }

  function initializeCameraSequence(state, options) {
    const next = clone(state);
    const camera = getCamera(next, options.cameraId);
    if (!camera) return next;
    const parsed = parseFilenameSequence(options.lastFilename, camera.kind);
    if (!parsed) return next;
    const segment = Object.assign({
      id: makeId('segment'),
      cameraId: camera.id,
      counterStart: parsed.counter + 1,
      counterNext: parsed.counter + 1,
      createdAt: new Date().toISOString(),
    }, parsed);
    next.sequenceSegments.push(segment);
    camera.activeSegmentId = segment.id;
    next.activeCameraByMode[camera.mode] = camera.id;
    return next;
  }

  function bumpCameraCounter(state, cameraId, n) {
    const steps = Math.floor(Number(n) || 1);
    if (steps < 1) return state;
    const next = clone(state);
    const camera = getCamera(next, cameraId);
    const segment = (next.sequenceSegments || []).find((item) => item.id === (camera && camera.activeSegmentId));
    if (!camera || !segment) return state;
    segment.counterNext += steps;
    return next;
  }

  function targetsForMode(state, mode) {
    if (mode === 'asesor') return state.asesorPuntos || [];
    // F38 — el drone es UNA sola sesion: devuelve UN unico target de sesion
    // (droneSessionSubject; o el sujeto terreno si es terreno) cuyas sugerencias son
    // la lista ordenada completa. ADEMAS, SOLO POR COMPAT, se anexan los espacios
    // kind:'drone' preexistentes del estado para que el bucle de validacion de
    // normalizeChecklistData no huerfane (omitted) las tomas viejas. El target de
    // sesion va primero; de-dup por id. Estos espacios viejos NO son navegables en la
    // UI nueva (F39): solo mantienen alcanzables sus mediaFiles.
    if (mode === 'drone') {
      const sesion = droneSessionSubject(state);
      const result = [sesion];
      const seen = new Set([sesion.id]);
      const espacios = state && Array.isArray(state.espacios) ? state.espacios : [];
      // Camino de compat: incluye los espacios kind:'drone' preexistentes (drone-piso
      // viejo) Y cualquier espacio con una toma de drone ya pegada (p.ej. migracion
      // droneItems->espacios, que materializa espacios zona 'exterior' con el take
      // reasignado). Asi sus mediaFiles no se huerfanan (omitted) al cargar.
      const cameras = state && Array.isArray(state.cameras) ? state.cameras : [];
      const mediaFiles = state && Array.isArray(state.mediaFiles) ? state.mediaFiles : [];
      const droneCameraIds = new Set(cameras.filter((c) => c && c.mode === 'drone').map((c) => c.id));
      const espaciosConTomaDrone = new Set(
        mediaFiles
          .filter((f) => f && f.kind === 'take' && f.targetId && droneCameraIds.has(f.cameraId))
          .map((f) => f.targetId)
      );
      espacios.forEach((esp) => {
        if (!esp || typeof esp !== 'object' || !esp.id) return;
        if (seen.has(esp.id)) return;
        if (_espacioDroneCompat(esp) || espaciosConTomaDrone.has(esp.id)) {
          seen.add(esp.id);
          result.push(esp);
        }
      });
      return result;
    }
    return state.espacios || [];
  }

  function getScenePath(state, targetId, mode) {
    const list = targetsForMode(state, mode);
    const target = list.find((item) => item.id === targetId);
    if (!target) return 'Sin identificar';
    if (mode === 'asesor') return target.nombre;
    const names = [];
    const visited = new Set();
    let current = target;
    while (current && !visited.has(current.id)) {
      names.unshift(current.nombre);
      visited.add(current.id);
      current = current.parentId && state.espacios.find((item) => item.id === current.parentId);
    }
    return names.join(' > ');
  }

  function getDescendantIds(state, targetId) {
    const ids = new Set([targetId]);
    let found = true;
    while (found) {
      found = false;
      state.espacios.forEach((space) => {
        if (space.parentId && ids.has(space.parentId) && !ids.has(space.id)) {
          ids.add(space.id);
          found = true;
        }
      });
    }
    return [...ids];
  }

  function getSceneData(state, camera, targetId) {
    const list = targetsForMode(state, camera.mode);
    const target = list.find((item) => item.id === targetId);
    if (!target) return { scene: 'Sin identificar', scenePath: 'Sin identificar' };
    return { scene: target.nombre, scenePath: getScenePath(state, targetId, camera.mode) };
  }

  function getMediaSceneGroups(state) {
    const groups = new Map();
    (state.mediaFiles || []).forEach((file) => {
      const camera = getCamera(state, file.cameraId);
      const mode = camera ? camera.mode : 'unknown';
      const scenePath = file.scenePath || 'Sin identificar';
      const key = `${mode}:${scenePath}`;
      if (!groups.has(key)) groups.set(key, { key, mode, scenePath, files: [] });
      groups.get(key).files.push(file);
    });
    return [...groups.values()].map((group) => Object.assign(group, {
      hasTake: group.files.some((file) => file.kind === 'take'),
      hasGood: group.files.some((file) => file.kind === 'take' && file.good),
      goodCount: group.files.filter((file) => file.kind === 'take' && file.good).length,
    }));
  }

  function targetIsNoAplica(state, mode, targetId) {
    // F35 — los targets de drone son virtuales (no viven en state.espacios). Se
    // resuelven via targetsForMode; un target virtual nunca esta 'no_aplica'. Para
    // los targets de drone que SI son espacios (camino de compat) se respeta su
    // estado drone como antes.
    if (mode === 'drone') {
      const target = targetsForMode(state, mode).find((entry) => entry.id === targetId);
      if (!target) return true;
      const espacio = state.espacios.find((entry) => entry.id === targetId);
      if (!espacio) return false;
      return ((espacio.estados && espacio.estados.drone) || {}).estado === 'no_aplica';
    }
    const space = state.espacios.find((entry) => entry.id === targetId);
    if (!space) return true;
    const servicio = mode === 'drone' ? 'drone' : 'video';
    return (space.estados[servicio] || {}).estado === 'no_aplica';
  }

  function deriveMediaTargetState(state, camera, targetId) {
    const cameraIds = new Set(state.cameras.filter((item) => item.mode === camera.mode).map((item) => item.id));
    const files = state.mediaFiles.filter((file) => cameraIds.has(file.cameraId) && file.targetId === targetId && file.kind === 'take');
    if (camera.mode === 'asesor') {
      const punto = (state.asesorPuntos || []).find((entry) => entry.id === targetId);
      if (punto) punto.estado = files.length ? 'hecho' : 'pendiente';
      return;
    }
    const servicio = camera.mode === 'drone' ? 'drone' : 'video';
    const space = state.espacios.find((entry) => entry.id === targetId);
    if (!space) return;
    if (!space.estados) space.estados = blankEstados();
    if (files.length) space.estados[servicio] = { estado: 'hecho' };
    else if ((space.estados[servicio] || {}).estado !== 'no_aplica') space.estados[servicio] = { estado: 'pendiente' };
  }

  function renumberTargetShots(state, cameraId, targetId) {
    let shotNumber = 0;
    state.mediaFiles.forEach((file) => {
      if (file.cameraId === cameraId && file.targetId === targetId && file.kind === 'take') {
        shotNumber++;
        file.shotNumber = shotNumber;
      }
    });
  }

  function repairDerivedMediaState(state) {
    const videoCamera = state.cameras.find((item) => item.mode === 'video');
    const droneCamera = state.cameras.find((item) => item.mode === 'drone');
    state.espacios.forEach((space) => {
      if (videoCamera) deriveMediaTargetState(state, videoCamera, space.id);
      if (droneCamera) deriveMediaTargetState(state, droneCamera, space.id);
    });
    (state.asesorPuntos || []).forEach((punto) => {
      const camera = state.cameras.find((entry) => entry.mode === 'asesor');
      if (camera) deriveMediaTargetState(state, camera, punto.id);
    });
    state.cameras.forEach((camera) => {
      const targets = targetsForMode(state, camera.mode);
      targets.forEach((target) => renumberTargetShots(state, camera.id, target.id));
    });
  }

  function registerMediaFile(state, options) {
    const next = clone(state);
    const camera = getCamera(next, options.cameraId);
    const sequence = getCameraSequence(next, options.cameraId);
    if (!camera || !sequence.segment) return state;
    const kind = options.kind || 'take';
    if (options.discardReason !== 'unrelated' && targetIsNoAplica(next, camera.mode, options.targetId)) return state;
    const sceneData = options.discardReason === 'unrelated'
      ? { scene: 'Sin escena', scenePath: 'Sin escena' }
      : getSceneData(next, camera, options.targetId);
    const shotNumber = kind === 'take'
      ? next.mediaFiles.filter((file) => file.cameraId === camera.id && file.targetId === options.targetId && file.kind === 'take').length + 1
      : null;
    next.mediaFiles.push({
      id: makeId('media'),
      cameraId: camera.id,
      segmentId: sequence.segment.id,
      fileCounter: sequence.segment.counterNext,
      fileToken: formatFileToken(sequence.segment, sequence.segment.counterNext),
      targetId: options.targetId || null,
      scene: sceneData.scene,
      scenePath: sceneData.scenePath,
      shotNumber,
      kind,
      discardReason: options.discardReason || null,
      good: false,
      favorite: false,
      note: options.note || '',
      author: options.autor || 'Anonimo',
      createdAt: options.now ? new Date(options.now).toISOString() : new Date().toISOString(),
      shotType: options.shotType || null,
      movement: options.movement || null,
      sentido: options.sentido != null ? options.sentido : null,
      pared: options.pared != null ? options.pared : null,
      suggestionId: options.suggestionId || null,
    });
    const activeSegment = next.sequenceSegments.find((item) => item.id === sequence.segment.id);
    activeSegment.counterNext++;
    if (kind === 'take' && options.targetId) deriveMediaTargetState(next, camera, options.targetId);
    return next;
  }

  function registerAsesorFile(state, options) {
    const punto = (state.asesorPuntos || []).find((p) => p.id === options.puntoId);
    if (!punto) return state;
    const cams = punto.tipo === 'voz' ? ['osmo-asesor'] : ['sony-asesor', 'osmo-asesor'];
    for (let i = 0; i < cams.length; i++) {
      if (!getCameraSequence(state, cams[i]).segment) return state;
    }
    const next = clone(state);
    const nextPunto = next.asesorPuntos.find((p) => p.id === options.puntoId);
    const kind = options.kind || 'take';
    const pairId = makeId('pair');
    cams.forEach((cid) => {
      const camera = getCamera(next, cid);
      const sequence = getCameraSequence(next, cid);
      const shotNumber = kind === 'take'
        ? next.mediaFiles.filter((file) => file.cameraId === cid && file.targetId === options.puntoId && file.kind === 'take').length + 1
        : null;
      next.mediaFiles.push({
        id: makeId('media'),
        cameraId: cid,
        segmentId: sequence.segment.id,
        fileCounter: sequence.segment.counterNext,
        fileToken: formatFileToken(sequence.segment, sequence.segment.counterNext),
        targetId: options.puntoId,
        scene: punto.nombre,
        scenePath: punto.nombre,
        shotNumber,
        kind,
        discardReason: options.discardReason || null,
        good: false,
        note: options.note || '',
        pairId,
        role: camera.role,
        author: options.autor || 'Anonimo',
        createdAt: options.now ? new Date(options.now).toISOString() : new Date().toISOString(),
        shotType: null,
        movement: null,
        suggestionId: null,
      });
      const activeSegment = next.sequenceSegments.find((item) => item.id === sequence.segment.id);
      activeSegment.counterNext++;
    });
    if (kind === 'take') nextPunto.estado = 'hecho';
    return next;
  }

  function toggleMediaGood(state, mediaId) {
    const next = clone(state);
    const file = next.mediaFiles.find((item) => item.id === mediaId);
    if (file && file.kind === 'take') file.good = !file.good;
    return next;
  }

  function toggleMediaFavorite(state, mediaId) {
    const next = clone(state);
    const file = next.mediaFiles.find((item) => item.id === mediaId);
    if (file && file.kind === 'take') {
      file.favorite = !file.favorite;
      if (file.favorite) file.good = true;
    }
    return next;
  }

  function insertOmittedMediaFile(state, beforeMediaId) {
    const next = clone(state);
    const index = next.mediaFiles.findIndex((item) => item.id === beforeMediaId);
    if (index < 0) return next;
    const before = next.mediaFiles[index];
    const segment = next.sequenceSegments.find((item) => item.id === before.segmentId);
    if (!segment) return next;
    const insertedCounter = before.fileCounter;
    next.mediaFiles.forEach((file) => {
      if (file.segmentId === segment.id && file.fileCounter >= insertedCounter) {
        file.fileCounter++;
        file.fileToken = formatFileToken(segment, file.fileCounter);
      }
    });
    next.mediaFiles.splice(index, 0, {
      id: makeId('media'),
      cameraId: before.cameraId,
      segmentId: before.segmentId,
      fileCounter: insertedCounter,
      fileToken: formatFileToken(segment, insertedCounter),
      targetId: null,
      scene: 'Sin identificar',
      scenePath: 'Sin identificar',
      shotNumber: null,
      kind: 'omitted',
      discardReason: null,
      good: false,
      note: '',
      author: 'Anonimo',
      createdAt: new Date().toISOString(),
    });
    segment.counterNext++;
    return next;
  }

  function updateMediaFile(state, mediaId, changes) {
    const next = clone(state);
    const file = next.mediaFiles.find((item) => item.id === mediaId);
    if (!file) return next;
    const camera = getCamera(next, file.cameraId);
    const previousTargetId = file.targetId;
    if (changes.targetId !== undefined) {
      file.targetId = changes.targetId;
      const sceneData = getSceneData(next, camera, changes.targetId);
      file.scene = sceneData.scene;
      file.scenePath = sceneData.scenePath;
    }
    if (changes.kind) file.kind = changes.kind;
    if (changes.discardReason !== undefined) file.discardReason = changes.discardReason;
    if (changes.note !== undefined) file.note = changes.note;
    if (changes.shotType !== undefined) file.shotType = changes.shotType;
    if (changes.movement !== undefined) file.movement = changes.movement;
    if (changes.sentido !== undefined) file.sentido = changes.sentido;
    if (changes.pared !== undefined) file.pared = changes.pared;
    if (changes.suggestionId !== undefined) file.suggestionId = changes.suggestionId;
    if (file.kind === 'discard' && file.discardReason === 'unrelated') {
      file.targetId = null;
      file.scene = 'Sin escena';
      file.scenePath = 'Sin escena';
    }
    if (file.kind === 'take') {
      file.discardReason = null;
      file.shotNumber = next.mediaFiles.filter((item) => item.id !== file.id && item.cameraId === file.cameraId && item.targetId === file.targetId && item.kind === 'take').length + 1;
    } else {
      file.good = false;
      file.shotNumber = null;
    }
    if (camera && previousTargetId) {
      renumberTargetShots(next, camera.id, previousTargetId);
      deriveMediaTargetState(next, camera, previousTargetId);
    }
    if (camera && file.targetId) {
      renumberTargetShots(next, camera.id, file.targetId);
      deriveMediaTargetState(next, camera, file.targetId);
    }
    return next;
  }

  function removeMediaFile(state, mediaId) {
    const next = clone(state);
    const index = next.mediaFiles.findIndex((item) => item.id === mediaId);
    if (index < 0) return next;
    const removed = next.mediaFiles[index];
    const camera = getCamera(next, removed.cameraId);
    const segment = next.sequenceSegments.find((item) => item.id === removed.segmentId);
    next.mediaFiles.splice(index, 1);
    if (segment) {
      next.mediaFiles.forEach((file) => {
        if (file.segmentId === segment.id && file.fileCounter > removed.fileCounter) {
          file.fileCounter--;
          file.fileToken = formatFileToken(segment, file.fileCounter);
        }
      });
      segment.counterNext = Math.max(segment.counterStart || 0, segment.counterNext - 1);
    }
    if (camera && removed.targetId) {
      renumberTargetShots(next, camera.id, removed.targetId);
      deriveMediaTargetState(next, camera, removed.targetId);
    }
    return next;
  }

  function parseSpacesText(text) {
    const result = [];
    const stack = [];
    String(text || '').split(/\r?\n/).forEach((rawLine) => {
      if (!rawLine.trim()) return;
      const arrowParts = rawLine.split('>').map((part) => part.trim()).filter(Boolean);
      if (arrowParts.length > 1) {
        let parentId = null;
        arrowParts.forEach((name) => {
          let existing = result.find((item) => item.nombre === name && item.parentId === parentId);
          if (!existing) {
            existing = { id: makeId('esp'), nombre: name, parentId, orden: result.length + 1 };
            result.push(existing);
          }
          parentId = existing.id;
        });
        return;
      }
      const indent = rawLine.match(/^\s*/)[0].replace(/\t/g, '  ').length;
      const level = Math.floor(indent / 2);
      const item = { id: makeId('esp'), nombre: rawLine.trim(), parentId: null, orden: result.length + 1 };
      if (level > 0 && stack[level - 1]) item.parentId = stack[level - 1].id;
      stack[level] = item;
      stack.length = level + 1;
      result.push(item);
    });
    return result;
  }

  function addSpacesFromText(state, text, options) {
    const next = clone(state);
    const zone = normalizeZone(options && options.zona);
    const parsed = parseSpacesText(text);
    parsed.forEach((item) => {
      next.espacios.push({
        id: item.id,
        nombre: item.nombre,
        parentId: item.parentId,
        orden: next.espacios.length + 1,
        clave: false,
        zona: zone,
        estados: blankEstados(),
      });
    });
    return next;
  }

  function buildTemplateSpaces(template) {
    const spaces = [];
    const byName = {};
    template.spaces.forEach((row) => {
      const item = {
        id: makeId('esp'),
        nombre: row[0],
        zona: row[1],
        clave: !!row[2],
        parentId: null,
        orden: spaces.length + 1,
        piso: row[4] || pisoFromZona(row[1]),
        estados: blankEstados(),
      };
      if (row[3] && byName[row[3]]) item.parentId = byName[row[3]].id;
      spaces.push(item);
      byName[item.nombre] = item;
    });
    return spaces;
  }

  function applyTemplate(state, key, options) {
    const template = TEMPLATE_DEFS[key];
    if (!template) return clone(state);
    const mode = (options && options.mode) || 'append';
    const next = mode === 'replace' ? createDefaultState() : clone(state);
    if (mode === 'replace') {
      next.servicios = clone(state.servicios || SERVICES_DEFAULT);
      next.modoActual = state.modoActual || 'video';
    }
    buildTemplateSpaces(template).forEach((space) => {
      space.orden = next.espacios.length + 1;
      next.espacios.push(space);
    });
    // El drone ya no es una entidad propia: comparte los espacios. El template.drone
    // (nombres de tomas aereas) se conserva como referencia/sugerencias via DRONE_GUIDE.
    return next;
  }

  function setServiceActive(state, service, active) {
    const next = clone(state);
    next.servicios[service] = !!active;
    if (!next.servicios[next.modoActual]) {
      next.modoActual = Object.keys(next.servicios).find((key) => next.servicios[key]) || 'video';
    }
    return next;
  }

  function getNextOrder(state, tipo) {
    return state.bitacora.filter((entry) => entry.tipo === tipo && entry.orden).length + 1;
  }

  function formatTime(now) {
    const date = now instanceof Date ? now : new Date();
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
  }

  function findTargetName(state, tipo, targetId) {
    const list = tipo === 'asesor' ? (state.asesorPuntos || []) : state.espacios;
    const item = list.find((entry) => entry.id === targetId);
    return item ? item.nombre : '';
  }

  function registerCapture(state, options) {
    const next = clone(state);
    const tipo = options.tipo;
    const targetId = options.targetId;
    const intencion = options.intencion || 'principal';
    const existingSpace = next.espacios.find((entry) => entry.id === targetId);
    const existingState = existingSpace && existingSpace.estados[tipo];
    if (!existingSpace || (existingState && existingState.estado === 'no_aplica')) return state;
    if (existingState && existingState.estado === 'hecho' && (tipo === 'foto' || tipo === 't360')) return state;
    if (existingState && existingState.estado === 'hecho' && (tipo === 'video' || tipo === 'drone') && intencion === 'principal') return state;
    const order = tipo === 'video' || tipo === 'drone' ? getNextOrder(next, tipo) : null;
    const hora = formatTime(options.now);
    const log = {
      id: makeId('log'),
      tipo,
      orden: order,
      targetId,
      nombre: findTargetName(next, tipo, targetId),
      autor: options.autor || 'Anonimo',
      hora,
      nota: '',
      bandera: '',
      intencion,
    };

    const space = next.espacios.find((entry) => entry.id === targetId);
    if (space) {
      space.estados[tipo] = { estado: 'hecho', autor: log.autor, hora };
      if (order) space.estados[tipo].ultimoOrden = order;
    }

    next.bitacora.push(log);
    return next;
  }

  function undoLastLog(state) {
    const next = clone(state);
    const log = next.bitacora.pop();
    if (!log) return next;
    const space = next.espacios.find((entry) => entry.id === log.targetId);
    if (space && space.estados[log.tipo]) {
      const previous = next.bitacora.filter((entry) => entry.tipo === log.tipo && entry.targetId === log.targetId).pop();
      if (previous) {
        space.estados[log.tipo] = { estado: 'hecho', autor: previous.autor || '', hora: previous.hora || '' };
        if (previous.orden) space.estados[log.tipo].ultimoOrden = previous.orden;
      } else {
        space.estados[log.tipo] = { estado: 'pendiente' };
      }
    }
    return next;
  }

  function getPendingSummary(state) {
    const summary = { byService: {}, byZone: {}, keyPending: [], totalPending: 0, totalRequired: 0, totalDone: 0 };
    function addZonePending(zone, service, name, isKey) {
      const normalizedZone = normalizeZone(zone);
      if (!summary.byZone[normalizedZone]) summary.byZone[normalizedZone] = {};
      if (!summary.byZone[normalizedZone][service]) {
        summary.byZone[normalizedZone][service] = { label: SERVICE_LABELS[service], pending: [], done: 0, required: 0 };
      }
      summary.byZone[normalizedZone][service].pending.push(name);
      if (isKey) summary.keyPending.push({ zona: normalizedZone, service, nombre: name, label: SERVICE_LABELS[service] });
    }
    ['foto', 't360', 'video'].forEach((service) => {
      if (!state.servicios[service]) return;
      const pending = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'hecho' && (space.estados[service] || {}).estado !== 'no_aplica')
        .map((space) => space.nombre);
      const required = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'no_aplica').length;
      state.espacios.forEach((space) => {
        const status = (space.estados[service] || {}).estado;
        const zone = normalizeZone(space.zona);
        if (!summary.byZone[zone]) summary.byZone[zone] = {};
        if (!summary.byZone[zone][service]) summary.byZone[zone][service] = { label: SERVICE_LABELS[service], pending: [], done: 0, required: 0 };
        if (status !== 'no_aplica') summary.byZone[zone][service].required++;
        if (status === 'hecho') summary.byZone[zone][service].done++;
        if (status !== 'hecho' && status !== 'no_aplica') addZonePending(space.zona, service, space.nombre, space.clave);
      });
      summary.byService[service] = { label: SERVICE_LABELS[service], pending, required, done: required - pending.length };
      summary.totalPending += pending.length;
      summary.totalRequired += required;
      summary.totalDone += required - pending.length;
    });
    if (state.servicios.drone) {
      const pending = state.espacios
        .filter((space) => (space.estados.drone || {}).estado !== 'hecho' && (space.estados.drone || {}).estado !== 'no_aplica')
        .map((space) => space.nombre);
      const required = state.espacios
        .filter((space) => (space.estados.drone || {}).estado !== 'no_aplica').length;
      summary.byService.drone = { label: SERVICE_LABELS.drone, pending, required, done: required - pending.length };
      summary.totalPending += pending.length;
      summary.totalRequired += required;
      summary.totalDone += required - pending.length;
    }
    return summary;
  }

  function filterLog(state, filter) {
    if (!filter || filter === 'todo') return state.bitacora;
    if (filter === 'notas') return state.bitacora.filter((entry) => entry.nota || entry.bandera);
    return state.bitacora.filter((entry) => entry.tipo === filter);
  }

  // file puede incluir ordenEdicion/tipoTomaLabel/movimientoLabel (campos derivados por buildExport)
  function describirArchivo(servicio, file) {
    let base;
    if (file.kind === 'take') {
      base = servicio + ' · ' + (file.good ? 'toma buena' : 'toma');
    } else if (file.kind === 'omitted') {
      return servicio + ' · sin identificar';
    } else {
      const motivos = { failed: 'descarte: toma fallida', unrelated: 'descarte: no relacionado', empty: 'descarte: vacío/accidental' };
      return servicio + ' · ' + (motivos[file.discardReason] || 'descarte');
    }
    const prefijo = file.ordenEdicion != null ? '[E' + file.ordenEdicion + '] ' : '';
    const tipo = file.tipoTomaLabel || null;
    // F28: tokens consistentes y buscables. Push/Pull con sentido -> "Push/Pull (in)";
    // Reveal con pared -> "Reveal · pared izq". Sin sub-dato, el label del movimiento como hoy.
    let mov = file.movimientoLabel || null;
    if (mov) {
      if (file.movimiento === 'push_pull' && file.sentido) mov = mov + ' (' + file.sentido + ')';
      else if (file.movimiento === 'reveal' && file.pared) mov = mov + ' · pared ' + file.pared;
    }
    const sufijo = (tipo || mov) ? ' · ' + [tipo, mov].filter(Boolean).join(' / ') : '';
    return prefijo + base + sufijo;
  }

  // Exportación estable para el programa de metadatos de Premiere.
  // Solo incluye ARCHIVOS de cámara (video/drone/asesor); foto/360 son cobertura, no archivos.
  // version:1 permanece intacto; los campos nuevos son opcionales y la app de Mac los ignora.
  function buildExport(state, meta) {
    meta = meta || {};
    const camById = (id) => (state.cameras || []).find((c) => c.id === id) || {};
    const segById = (id) => (state.sequenceSegments || []).find((s) => s.id === id) || {};
    const shotTypes = getShotTypes();
    const movements = getMovements();

    const archivos = (state.mediaFiles || []).map((f) => {
      const cam = camById(f.cameraId);
      const seg = segById(f.segmentId);
      const servicio = cam.mode || 'video';
      const espacio = (servicio === 'drone' || servicio === 'asesor') ? null : (state.espacios || []).find((e) => e.id === f.targetId);

      const tipoToma = f.shotType || null;
      // F17 (C) — resuelve el label contra SHOT_TYPES (video) o, si es un tipo
      // aereo de drone, contra DRONE_SHOT_TYPES. Aditivo: no cambia version:1.
      const droneShotTypes = getDroneShotTypes();
      const tipoTomaLabel = tipoToma
        ? (shotTypes[tipoToma] ? shotTypes[tipoToma].label
          : (droneShotTypes[tipoToma] ? droneShotTypes[tipoToma].label : null))
        : null;
      const movimiento = f.movement || null;
      const movimientoLabel = movimiento && movements[movimiento] ? movements[movimiento].label : null;
      // F28: sub-datos discretos. sentido solo aplica a push_pull; pared solo a reveal.
      const sentido = (movimiento === 'push_pull' && f.sentido) ? f.sentido : null;
      const pared = (movimiento === 'reveal' && f.pared) ? f.pared : null;
      const sentidoLabelVal = sentidoLabel(sentido);
      const paredLabelVal = paredLabel(pared);
      const sugerencia = f.suggestionId || null;
      const sug = sugerencia ? findSuggestion(sugerencia) : null;
      const prioridad = sug ? sug.priority : null;
      const ordenEdicion = tipoToma != null ? (EDIT_ORDER[tipoToma] !== undefined ? EDIT_ORDER[tipoToma] : null) : null;

      const enrichedFile = { kind: f.kind, good: f.good, discardReason: f.discardReason, ordenEdicion, tipoTomaLabel, movimiento, movimientoLabel, sentido, pared };

      return {
        archivo: f.fileToken,
        consecutivo: f.fileCounter,
        ancho: seg.counterWidth || null,
        ejemploNombre: seg.exampleFilename || null,
        camara: cam.label || f.cameraId,
        camaraId: f.cameraId,
        camaraTipo: cam.kind || null,
        servicio: servicio,
        escena: f.scene || null,
        escenaRuta: f.scenePath || null,
        piso: espacio ? (espacio.piso || null) : null,
        toma: f.shotNumber || null,
        tipo: f.kind,
        motivoDescarte: f.discardReason || null,
        buena: !!f.good,
        favorita: !!f.favorite,
        nota: f.note || '',
        par: f.pairId || null,
        autor: f.author || '',
        hora: f.createdAt || null,
        tipoToma,
        tipoTomaLabel,
        movimiento,
        movimientoLabel,
        sentido,
        sentidoLabel: sentidoLabelVal,
        pared,
        paredLabel: paredLabelVal,
        sugerencia,
        prioridad,
        ordenEdicion,
        premiere: {
          Scene: f.scenePath || f.scene || '',
          Shot: f.shotNumber ? String(f.shotNumber) : '',
          'Camera Roll': cam.label || '',
          Good: !!f.good,
          Favorite: !!f.favorite,
          Comment: f.note || '',
          Description: describirArchivo(servicio, enrichedFile),
        },
      };
    });

    // resumenGuia: cobertura por cuarto/target para que el editor sepa qué es hero y qué falta
    const videoCoverage = guideCoverage(state, 'video');
    const droneCoverage = guideCoverage(state, 'drone');
    const resumenGuia = [
      ...videoCoverage.map((entry) => ({
        nombre: entry.target.nombre || entry.target.id,
        modo: 'video',
        mustHechas: entry.must.hechas,
        mustFaltan: entry.must.faltan.length,
      })),
      ...droneCoverage.map((entry) => ({
        nombre: entry.target.nombre || entry.target.id,
        modo: 'drone',
        mustHechas: entry.must.hechas,
        mustFaltan: entry.must.faltan.length,
      })),
    ];

    // guionEdicion: lista ordenada de takes para que el editor arme el string-out
    const guide = state.guide || {};
    const foco = guide.tipoPropiedad ? (PROPERTY_FOCUS[guide.tipoPropiedad] || null) : null;
    const contexto = [foco, guide.descripcion].filter(Boolean).join(' — ') || null;

    const clips = archivos
      .filter((a) => a.tipo === 'take')
      .slice()
      .sort((a, b) => {
        const oa = a.ordenEdicion != null ? a.ordenEdicion : Infinity;
        const ob = b.ordenEdicion != null ? b.ordenEdicion : Infinity;
        if (oa !== ob) return oa - ob;
        const pa = a.piso || '';
        const pb = b.piso || '';
        if (pa !== pb) return pa < pb ? -1 : 1;
        const ea = a.escenaRuta || a.escena || '';
        const eb = b.escenaRuta || b.escena || '';
        if (ea !== eb) return ea < eb ? -1 : 1;
        return (a.toma || 0) - (b.toma || 0);
      })
      .map((a) => ({
        archivo: a.archivo,
        escena: a.escena,
        ordenEdicion: a.ordenEdicion,
        buena: a.buena,
        tipo: a.tipoTomaLabel,
        movimiento: a.movimientoLabel,
      }));

    const guionEdicion = { contexto, clips };

    return {
      version: 1,
      folio: meta.folio || '',
      cliente: meta.nombreCliente || '',
      exportadoEn: new Date().toISOString(),
      totalArchivos: archivos.length,
      archivos,
      resumenGuia,
      guionEdicion,
    };
  }

  return {
    SERVICES_DEFAULT,
    SERVICE_LABELS,
    CAMERA_DEFAULTS,
    DRONE_DEFAULTS,
    TEMPLATE_DEFS,
    SPACE_SUGGESTIONS,
    SHOT_TYPES,
    MOVEMENTS,
    CURATED_SHOT_TYPES,
    CURATED_MOVEMENTS,
    SENTIDO_OPTS,
    sentidoLabel,
    PARED_OPTS,
    paredLabel,
    DRONE_SHOT_TYPES,
    AERIAL_SUBJECTS,
    AERIAL_SUBJECTS_BY_PROPERTY,
    DRONE_SCALES,
    AERIAL_POOL,
    AERIAL_POOL_INDEX,
    AERIAL_STANDOUT_MOVES,
    AERIAL_FEATURE_VOCAB,
    GUIDE_LIBRARY,
    DRONE_GUIDE,
    AMENITY_GUIDE,
    PROPERTY_FOCUS,
    ROOM_CATEGORIES,
    EDIT_ORDER,
    getShotTypes,
    getMovements,
    getGuideLibrary,
    getDroneGuide,
    getAmenityGuide,
    getRoomCategories,
    getDroneShotTypes,
    getCameras,
    applyGuideConfig,
    resetGuideConfig,
    normNombre,
    detectCategoria,
    amenityFromName,
    suggestionsForSpace,
    suggestionsForDrone,
    aerialSubjectFromName,
    aerialSuggestionsForSubject,
    suggestedAerialSubjects,
    aerialPoolForScale,
    aerialVocabForFeature,
    aerialFeatureKeyFromName,
    DRONE_PISO,
    DRONE_PISOS,
    EXTERIOR_ZONAS,
    TERRENO_SUBJECT_ID,
    isDronePiso,
    espacioEsDrone,
    zonaOfEspacio,
    camerasForEspacio,
    terrenoSingleSubject,
    droneAmenidadesAplica,
    droneFeatureTargets,
    droneScaleTargets,
    DRONE_SESSION_ID,
    droneSessionSubject,
    droneSessionSuggestions,
    targetsForMode,
    SPACE_LIBRARY_BY_FLOOR,
    SPACE_LIBRARY_INDEX,
    suggestedSpacesFor,
    searchSpaces,
    findSuggestion,
    suggestionProgress,
    proposalShotsFor,
    suggestionsForTarget,
    buildPropuestaPrompt,
    parsePropuesta,
    guideCoverage,
    capasCubiertas,
    createDefaultState,
    normalizeChecklistData,
    parseSpacesText,
    addSpacesFromText,
    applyTemplate,
    setServiceActive,
    parseFilenameSequence,
    getCameraSequence,
    initializeCameraSequence,
    bumpCameraCounter,
    getScenePath,
    getDescendantIds,
    getMediaSceneGroups,
    registerMediaFile,
    registerAsesorFile,
    toggleMediaGood,
    toggleMediaFavorite,
    insertOmittedMediaFile,
    updateMediaFile,
    removeMediaFile,
    registerCapture,
    undoLastLog,
    getPendingSummary,
    filterLog,
    buildExport,
  };
});
