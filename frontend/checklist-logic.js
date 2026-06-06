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
    { id: 'drone-dji', label: 'Drone DJI', mode: 'drone', kind: 'dji' },
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
    static:      { label: 'Fija/estatica',                hint: 'Camara inmovil en tripie o gimbal bloqueado.' },
    pan:         { label: 'Paneo',                        hint: 'Giro horizontal sobre eje fijo.' },
    tilt:        { label: 'Cabeceo/tilt',                 hint: 'Giro vertical (piso a techo).' },
    dolly:       { label: 'Travelling/dolly',             hint: 'Desplazamiento fisico de la camara.' },
    push_in:     { label: 'Acercamiento',                 hint: 'Avanzar lento hacia un foco.' },
    pull_out:    { label: 'Alejamiento',                  hint: 'Retroceder lento revelando contexto.' },
    gimbal_walk: { label: 'Caminata con gimbal',          hint: 'Ninja walk: rodillas flexionadas, paso suave.' },
    orbit:       { label: 'Orbital',                      hint: 'Movimiento circular alrededor de un punto.' },
    umbral:      { label: 'Revelacion tras umbral',       hint: 'Cruzar una puerta para descubrir el cuarto.' },
    parallax:    { label: 'Parallax',                     hint: 'Objeto en primer plano cruza mas rapido que el fondo.' },
    tilt_up:     { label: 'Revelacion vertical',          hint: 'Empezar bajo y subir para descubrir altura.' },
    slider:      { label: 'Slider lateral',               hint: 'Desplazamiento horizontal corto y suave.' },
    tracking:    { label: 'Seguimiento',                  hint: 'Acompanar un eje del cuarto avanzando.' },
    pedestal:    { label: 'Pies a cabeza',                hint: 'Tilt desde el piso subiendo para presentar.' },
    whip:        { label: 'Whip pan/transicion',          hint: 'Paneo rapido desenfocado entre cuartos.' },
  });

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
    { id: 'bodega',      label: 'Bodega/servicio',        keywords: ['bodega', 'servicio', 'almacen'] },
    { id: 'vestidor',    label: 'Vestidor/closet',        keywords: ['vestidor', 'closet', 'walk-in'] },
    { id: 'cocina',      label: 'Cocina',                 keywords: ['cocina', 'kitchen', 'cocineta'] },
    { id: 'comedor',     label: 'Comedor',                keywords: ['comedor', 'antecomedor'] },
    { id: 'sala',        label: 'Sala/estancia',          keywords: ['sala', 'living', 'estar'] },
    { id: 'family',      label: 'Family room/sala de TV', keywords: ['family', 'tv', 'entretenimiento'] },
    { id: 'estudio',     label: 'Estudio/home office',    keywords: ['estudio', 'oficina', 'office', 'despacho'] },
    { id: 'recamara',    label: 'Recamara',               keywords: ['recamara', 'habitacion', 'dormitorio', 'alcoba', 'suite'] },
    { id: 'garaje',      label: 'Garaje/cochera',         keywords: ['garaje', 'cochera', 'garage'] },
    { id: 'pasillo',     label: 'Pasillo/escaleras',      keywords: ['pasillo', 'escalera', 'hall', 'vestibulo'] },
    { id: 'entrada',     label: 'Entrada/recibidor',      keywords: ['entrada', 'recibidor', 'foyer', 'acceso'] },
    { id: 'terraza',     label: 'Terraza/balcon',         keywords: ['terraza', 'balcon', 'patio', 'roof'] },
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

  function getShotTypes()      { return _effectiveShotTypes      || SHOT_TYPES; }
  function getMovements()      { return _effectiveMovements      || MOVEMENTS; }
  function getGuideLibrary()   { return _effectiveGuideLibrary   || GUIDE_LIBRARY; }
  function getDroneGuide()     { return _effectiveDroneGuide     || DRONE_GUIDE; }
  function getAmenityGuide()   { return _effectiveAmenityGuide   || AMENITY_GUIDE; }
  function getRoomCategories() { return _effectiveRoomCategories || ROOM_CATEGORIES; }

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
  }

  function resetGuideConfig() {
    _effectiveShotTypes      = null;
    _effectiveMovements      = null;
    _effectiveGuideLibrary   = null;
    _effectiveDroneGuide     = null;
    _effectiveAmenityGuide   = null;
    _effectiveRoomCategories = null;
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
    const ALIAS = { exterior: 'terraza' };
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
      base = suggestionsForDrone(state.guide ? state.guide.tipoPropiedad : null);
    } else {
      const cat = target.categoria || detectCategoria(target.nombre);
      base = suggestionsForSpace(cat, target.nombre);
    }
    return base.concat(proposalShotsFor(state, target.id));
  }

  function buildPropuestaPrompt(state) {
    const guide = state.guide || {};
    const descripcion = guide.descripcion || '';
    const cuartos = (state.espacios || []).map((esp) => ({
      id: esp.id,
      nombre: esp.nombre,
      categoria: esp.categoria || detectCategoria(esp.nombre),
    }));
    const droneTargets = (state.droneItems || []).map((item) => ({
      id: item.id,
      nombre: item.nombre,
      categoria: 'drone',
    }));
    const allTargets = cuartos.concat(droneTargets);

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

      const allTargets = [...(state.espacios || []), ...(state.droneItems || [])];
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
    const targets = mode === 'drone' ? (state.droneItems || []) : (state.espacios || []);
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
    };
  }

  function normalizeZone(value) {
    return value || 'interior';
  }

  const PISOS_DEFAULT = ['Exterior', 'Piso 1', 'Piso 2', 'Amenidades'];

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
      pisos: PISOS_DEFAULT.slice(),
      modoActual: 'video',
      espacios: [],
      droneItems: createDroneItems(),
      asesorPuntos: createAsesorPuntos(),
      recorrido: {},
      bitacora: [],
      cameras: clone(CAMERA_DEFAULTS),
      activeCameraByMode: { video: 'sony-main', drone: 'drone-dji' },
      sequenceSegments: [],
      mediaFiles: [],
      guide: { tipoPropiedad: null, descripcion: '', proposal: null },
    };
  }

  function legacyValueToState(value) {
    if (!value) return { estado: 'pendiente' };
    return { estado: 'hecho', autor: typeof value === 'string' ? value : '', hora: '' };
  }

  function normalizeChecklistData(data) {
    if (data && (data.version === 2 || data.version === 3)) {
      const normalized = Object.assign(createDefaultState(), clone(data));
      normalized.servicios = Object.assign(clone(SERVICES_DEFAULT), normalized.servicios || {});
      normalized.guide = Object.assign({ tipoPropiedad: null, descripcion: '', proposal: null }, normalized.guide || {});
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
      normalized.pisos = Array.isArray(data.pisos) && data.pisos.length ? data.pisos.slice() : derivePisos(normalized.espacios);
      normalized.droneItems = (normalized.droneItems && normalized.droneItems.length ? normalized.droneItems : createDroneItems())
        .map((item, index) => ({
          id: item.id || makeId('drone'),
          nombre: item.nombre || 'Toma drone',
          estado: item.estado || 'pendiente',
          ordenLista: item.ordenLista || index + 1,
          ultimoOrden: item.ultimoOrden || null,
          noAplica: !!item.noAplica,
        }));
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
          file.shotNumber = null;
        }
        file.shotType = file.shotType || null;
        file.movement = file.movement || null;
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

  function targetsForMode(state, mode) {
    if (mode === 'drone') return state.droneItems || [];
    if (mode === 'asesor') return state.asesorPuntos || [];
    return state.espacios || [];
  }

  function getScenePath(state, targetId, mode) {
    const list = targetsForMode(state, mode);
    const target = list.find((item) => item.id === targetId);
    if (!target) return 'Sin identificar';
    if (mode === 'drone' || mode === 'asesor') return target.nombre;
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
    if (mode === 'drone') {
      const item = state.droneItems.find((entry) => entry.id === targetId);
      return !item || item.noAplica;
    }
    const space = state.espacios.find((entry) => entry.id === targetId);
    return !space || (space.estados.video || {}).estado === 'no_aplica';
  }

  function deriveMediaTargetState(state, camera, targetId) {
    const cameraIds = new Set(state.cameras.filter((item) => item.mode === camera.mode).map((item) => item.id));
    const files = state.mediaFiles.filter((file) => cameraIds.has(file.cameraId) && file.targetId === targetId && file.kind === 'take');
    if (camera.mode === 'drone') {
      const item = state.droneItems.find((entry) => entry.id === targetId);
      if (item) item.estado = files.length ? 'hecho' : 'pendiente';
      return;
    }
    if (camera.mode === 'asesor') {
      const punto = (state.asesorPuntos || []).find((entry) => entry.id === targetId);
      if (punto) punto.estado = files.length ? 'hecho' : 'pendiente';
      return;
    }
    const space = state.espacios.find((entry) => entry.id === targetId);
    if (space && files.length) space.estados.video = { estado: 'hecho' };
    else if (space && (space.estados.video || {}).estado !== 'no_aplica') space.estados.video = { estado: 'pendiente' };
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
    state.espacios.forEach((space) => {
      const camera = state.cameras.find((item) => item.mode === 'video');
      if (camera) deriveMediaTargetState(state, camera, space.id);
    });
    state.droneItems.forEach((item) => {
      const camera = state.cameras.find((entry) => entry.mode === 'drone');
      if (camera) deriveMediaTargetState(state, camera, item.id);
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
      note: options.note || '',
      author: options.autor || 'Anonimo',
      createdAt: options.now ? new Date(options.now).toISOString() : new Date().toISOString(),
      shotType: options.shotType || null,
      movement: options.movement || null,
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
    if (template.drone) {
      next.droneItems = template.drone.map((nombre, index) => ({
        id: makeId('drone'),
        nombre,
        estado: 'pendiente',
        ordenLista: index + 1,
      }));
    }
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
    const list = tipo === 'drone' ? state.droneItems : state.espacios;
    const item = list.find((entry) => entry.id === targetId);
    return item ? item.nombre : '';
  }

  function registerCapture(state, options) {
    const next = clone(state);
    const tipo = options.tipo;
    const targetId = options.targetId;
    const intencion = options.intencion || 'principal';
    if (tipo !== 'drone') {
      const existingSpace = next.espacios.find((entry) => entry.id === targetId);
      const existingState = existingSpace && existingSpace.estados[tipo];
      if (!existingSpace || (existingState && existingState.estado === 'no_aplica')) return state;
      if (existingState && existingState.estado === 'hecho' && (tipo === 'foto' || tipo === 't360')) return state;
      if (existingState && existingState.estado === 'hecho' && tipo === 'video' && intencion === 'principal') return state;
    } else {
      const existingDrone = next.droneItems.find((entry) => entry.id === targetId);
      if (!existingDrone || existingDrone.noAplica) return state;
      if (existingDrone && existingDrone.estado === 'hecho' && intencion === 'principal') return state;
    }
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

    if (tipo === 'drone') {
      const item = next.droneItems.find((entry) => entry.id === targetId);
      if (item) {
        item.estado = 'hecho';
        item.autor = log.autor;
        item.hora = hora;
        item.ultimoOrden = order;
      }
    } else {
      const space = next.espacios.find((entry) => entry.id === targetId);
      if (space) {
        space.estados[tipo] = { estado: 'hecho', autor: log.autor, hora };
        if (order) space.estados[tipo].ultimoOrden = order;
      }
    }

    next.bitacora.push(log);
    return next;
  }

  function undoLastLog(state) {
    const next = clone(state);
    const log = next.bitacora.pop();
    if (!log) return next;
    if (log.tipo === 'drone') {
      const item = next.droneItems.find((entry) => entry.id === log.targetId);
      const previous = next.bitacora.filter((entry) => entry.tipo === 'drone' && entry.targetId === log.targetId).pop();
      if (item) {
        if (previous) {
          item.estado = 'hecho';
          item.ultimoOrden = previous.orden || null;
          item.autor = previous.autor || '';
          item.hora = previous.hora || '';
        } else {
          item.estado = 'pendiente';
          delete item.ultimoOrden;
          delete item.autor;
          delete item.hora;
        }
      }
      return next;
    }
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
      const pending = state.droneItems
        .filter((item) => item.estado !== 'hecho' && !item.noAplica)
        .map((item) => item.nombre);
      const required = state.droneItems.filter((item) => !item.noAplica).length;
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
    const mov = file.movimientoLabel || null;
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
      const tipoTomaLabel = tipoToma && shotTypes[tipoToma] ? shotTypes[tipoToma].label : null;
      const movimiento = f.movement || null;
      const movimientoLabel = movimiento && movements[movimiento] ? movements[movimiento].label : null;
      const sugerencia = f.suggestionId || null;
      const sug = sugerencia ? findSuggestion(sugerencia) : null;
      const prioridad = sug ? sug.priority : null;
      const ordenEdicion = tipoToma != null ? (EDIT_ORDER[tipoToma] !== undefined ? EDIT_ORDER[tipoToma] : null) : null;

      const enrichedFile = { kind: f.kind, good: f.good, discardReason: f.discardReason, ordenEdicion, tipoTomaLabel, movimientoLabel };

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
        nota: f.note || '',
        par: f.pairId || null,
        autor: f.author || '',
        hora: f.createdAt || null,
        tipoToma,
        tipoTomaLabel,
        movimiento,
        movimientoLabel,
        sugerencia,
        prioridad,
        ordenEdicion,
        premiere: {
          Scene: f.scenePath || f.scene || '',
          Shot: f.shotNumber ? String(f.shotNumber) : '',
          'Camera Roll': cam.label || '',
          Good: !!f.good,
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
    applyGuideConfig,
    resetGuideConfig,
    normNombre,
    detectCategoria,
    amenityFromName,
    suggestionsForSpace,
    suggestionsForDrone,
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
    getScenePath,
    getDescendantIds,
    getMediaSceneGroups,
    registerMediaFile,
    registerAsesorFile,
    toggleMediaGood,
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
