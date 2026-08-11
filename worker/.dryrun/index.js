var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/db.js
async function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).all() : stmt.all();
}
__name(query, "query");
async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = params.length ? await stmt.bind(...params).first() : await stmt.first();
  return result || null;
}
__name(queryOne, "queryOne");
async function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).run() : stmt.run();
}
__name(run, "run");
async function batch(db, statements) {
  return db.batch(
    statements.map(
      ({ sql, params = [] }) => params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
    )
  );
}
__name(batch, "batch");
function uuid() {
  return crypto.randomUUID();
}
__name(uuid, "uuid");
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(now, "now");
function parseFecha(str) {
  if (!str) return null;
  if (str.includes("T")) return new Date(str);
  return /* @__PURE__ */ new Date(str + "T12:00:00");
}
__name(parseFecha, "parseFecha");
function normalizarTel(tel) {
  if (!tel) return "";
  let d = String(tel).replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
}
__name(normalizarTel, "normalizarTel");

// src/auth.js
function requireAdmin(request, env) {
  const key = request.headers.get("X-Admin-Key") || new URL(request.url).searchParams.get("adminKey");
  if (key !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  return null;
}
__name(requireAdmin, "requireAdmin");
function ok(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(ok, "ok");
function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(err, "err");

// src/google.js
function callAdapter(ctx, env, action, payload) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes("REEMPLAZAR")) return;
  const promise = fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  }).then(async (res) => {
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error || body?.ok === false) {
      console.error("Google adapter error:", action, body?.error || body?.message || "HTTP " + res.status);
    }
  }).catch((e) => console.error("Google adapter error:", action, e.message));
  ctx.waitUntil(promise);
}
__name(callAdapter, "callAdapter");
async function callAdapterSync(env, action, payload) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes("REEMPLAZAR")) {
    return { error: "Adapter no configurado" };
  }
  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) return { error: "Adapter error " + res.status };
    return res.json();
  } catch (e) {
    console.error("callAdapterSync error:", action, e.message);
    return { error: "Adapter temporalmente no disponible" };
  }
}
__name(callAdapterSync, "callAdapterSync");

// src/folios.js
function generarFolio(fechaSesionStr) {
  const fecha = parseFecha(fechaSesionStr);
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `IAV-${yy}${mm}.${dd}`;
}
__name(generarFolio, "generarFolio");
async function asignarFolio(db, fechaSesionStr) {
  const base = generarFolio(fechaSesionStr);
  const { results } = await query(
    db,
    "SELECT folio FROM contratos WHERE folio LIKE ?",
    [base + "-%"]
  );
  const letrasUsadas = new Set(
    results.map((r) => r.folio.slice(base.length + 1)).filter((s) => /^[A-Z]$/.test(s))
  );
  for (let i = 0; i < 26; i++) {
    const letra = String.fromCharCode(65 + i);
    if (!letrasUsadas.has(letra)) return `${base}-${letra}`;
  }
  return `${base}-?`;
}
__name(asignarFolio, "asignarFolio");

// src/entrega-media.js
function esFotoWeb(file) {
  const m = (file && file.mimeType || "").toLowerCase();
  return m === "image/jpeg" || m === "image/png" || m === "image/webp";
}
__name(esFotoWeb, "esFotoWeb");
function hashDeVariante(url) {
  const m = String(url || "").match(/imagedelivery\.net\/([^/]+)\//);
  return m ? m[1] : "";
}
__name(hashDeVariante, "hashDeVariante");

// src/routes/portal.js
function limpiarLinkMaps(url) {
  if (!url) return url;
  const m = url.match(/[?&]q=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return url;
}
__name(limpiarLinkMaps, "limpiarLinkMaps");
function payloadEntrega(c, env) {
  let manifiesto = {};
  try {
    manifiesto = JSON.parse(c.entrega_manifiesto_json || "{}");
  } catch (e) {
  }
  let textos = {};
  try {
    textos = JSON.parse(c.entrega_textos_json || "{}");
  } catch (e) {
  }
  if (manifiesto) {
    delete manifiesto.pendientes;
    delete manifiesto.videoWebId;
  }
  return {
    ok: true,
    token: c.token,
    estatus: c.estatus,
    publicado: c.entrega_config_estado === "publicado",
    mediaEstado: c.entrega_media_estado || "",
    revocada: !!(c.entrega_revocada && String(c.entrega_revocada).trim()),
    nombreCliente: c.nombre_cliente,
    driveLink: c.entrega_drive_link || "",
    manifiesto,
    textos,
    videoProveedor: c.entrega_video_proveedor || "",
    videoId: c.entrega_video_id || "",
    streamCustomer: manifiesto && manifiesto.streamCustomer || env.STREAM_CUSTOMER_CODE || "",
    tour360Url: c.tiene_recorrido === 0 ? "" : c.recorrido_url || "",
    waLink: "https://wa.me/5218127174207",
    igHandle: "@inmuebles.audiovisuales"
  };
}
__name(payloadEntrega, "payloadEntrega");
async function handlePortal(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);
  if (action === "obtenerPortal") {
    const token = url.searchParams.get("token");
    if (!token) return err("Token requerido");
    let contratoFinal = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [token]);
    if (!contratoFinal) {
      const tk = await queryOne(db, "SELECT * FROM tokens WHERE token = ?", [token]);
      if (!tk) return err("Token no encontrado", 404);
      if (tk.usado) return err("Token ya utilizado", 403);
      if (tk.expira && new Date(tk.expira) < /* @__PURE__ */ new Date()) return err("Token expirado", 403);
      contratoFinal = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [tk.contrato_id]);
      if (!contratoFinal) return err("Contrato no encontrado", 404);
    }
    const { results: propiedades } = await query(
      db,
      "SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad",
      [contratoFinal.token]
    );
    const { results: abonosPortal } = await query(
      db,
      "SELECT monto, metodo, fecha, fecha_registro FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro",
      [contratoFinal.token]
    );
    const totalAbonado = abonosPortal.reduce((s, a) => s + (a.monto || 0), 0);
    const { results: todosLosPaquetes } = await query(db, "SELECT clave, nombre, entregables FROM paquetes");
    const pkMap = Object.fromEntries(todosLosPaquetes.map((p) => [p.clave, p.nombre]));
    const pkEntregablesMap = Object.fromEntries(todosLosPaquetes.map((p) => [p.clave, p.entregables]));
    const adicionales = JSON.parse(contratoFinal.adicionales_json || "[]");
    const ofertasStrings = adicionales.filter((i) => typeof i === "string");
    const ofertasObjs = adicionales.filter((i) => typeof i === "object" && (i.ofrecido || !i.precio));
    const acordados = adicionales.filter((i) => typeof i === "object" && i.precio && !i.ofrecido);
    const todasLasClaves = [.../* @__PURE__ */ new Set([
      ...ofertasStrings,
      ...ofertasObjs.map((o) => o.clave)
    ])].filter(Boolean);
    let allPkgs = [];
    if (todasLasClaves.length > 0) {
      const placeholders = todasLasClaves.map(() => "?").join(",");
      const { results } = await query(
        db,
        `SELECT * FROM paquetes WHERE clave IN (${placeholders}) AND activo = 1`,
        todasLasClaves
      );
      allPkgs = results;
    }
    const paquetesDisponibles = [];
    for (const s of ofertasStrings) {
      const pkg = allPkgs.find((p) => p.clave === s);
      if (pkg) paquetesDisponibles.push({ ...pkg, clave: pkg.clave, nombre: pkg.nombre, precio: pkg.precio, entregables: pkg.entregables, numPropiedad: null });
    }
    for (const o of ofertasObjs) {
      if (o.ofrecido) {
        paquetesDisponibles.push({
          clave: o.nombre,
          nombre: o.nombre,
          precio: o.precio || 0,
          entregables: "",
          numPropiedad: o.numPropiedad || null,
          custom: true
        });
      } else {
        const pkg = allPkgs.find((p) => p.clave === o.clave);
        if (pkg) paquetesDisponibles.push({ ...pkg, clave: pkg.clave, nombre: pkg.nombre, precio: pkg.precio, entregables: pkg.entregables, numPropiedad: o.numPropiedad || null });
      }
    }
    const extrasAcordados = acordados.map((i) => ({
      nombre: i.nombre || pkMap[i.clave] || i.clave,
      precio: i.precio || 0,
      entregables: pkEntregablesMap[i.clave] || ""
    }));
    const todosAdicionales = acordados.map((i) => ({ nombre: i.nombre || pkMap[i.clave] || i.clave, precio: i.precio || 0 }));
    for (const s of ofertasStrings) {
      const pkg = allPkgs.find((p) => p.clave === s);
      todosAdicionales.push({ nombre: pkg ? pkg.nombre : s, precio: pkg?.precio || 0 });
    }
    for (const o of ofertasObjs) {
      if (o.ofrecido) {
        todosAdicionales.push({ nombre: o.nombre, precio: o.precio || 0 });
      } else {
        const pkg = allPkgs.find((p) => p.clave === o.clave);
        todosAdicionales.push({ nombre: pkg ? pkg.nombre : o.clave, precio: pkg?.precio || 0 });
      }
    }
    let logoClienteUrl = null;
    if (contratoFinal.cliente_id) {
      const cliLogo = await queryOne(db, "SELECT logo_url FROM clientes WHERE id = ?", [contratoFinal.cliente_id]);
      logoClienteUrl = cliLogo?.logo_url || null;
    }
    if (!logoClienteUrl && contratoFinal.correo_cliente) {
      try {
        const logoData = await Promise.race([
          callAdapterSync(env, "obtenerLogoCliente", { correo: contratoFinal.correo_cliente }),
          new Promise((resolve) => setTimeout(() => resolve(null), 3e3))
        ]);
        logoClienteUrl = logoData?.logoPrecargadoUrl || null;
      } catch (e) {
        console.error("Error obteniendo logo cliente:", e.message);
      }
    }
    return ok({
      ok: true,
      token: contratoFinal.token,
      folio: contratoFinal.folio,
      nombreCliente: contratoFinal.nombre_cliente,
      correoCliente: contratoFinal.correo_cliente,
      telefonoCliente: contratoFinal.telefono_cliente,
      tipoContrato: contratoFinal.tipo_contrato,
      tipoPaquete: contratoFinal.tipo_paquete,
      paqueteBase: pkMap[contratoFinal.paquete_base] || contratoFinal.paquete_base,
      precioBase: contratoFinal.precio_base,
      precioTotal: contratoFinal.precio_total,
      anticipo: contratoFinal.anticipo,
      saldoPendiente: contratoFinal.saldo_pendiente,
      estatus: contratoFinal.estatus,
      fechaFirma: contratoFinal.fecha_firma,
      pdfContratoUrl: contratoFinal.pdf_contrato_url,
      notasContrato: contratoFinal.notas_contrato,
      entregaDriveLink: contratoFinal.entrega_drive_link,
      entregaLinksExtra: contratoFinal.entrega_links_extra,
      entregaRevocada: contratoFinal.entrega_revocada,
      calificacion: contratoFinal.calificacion,
      resenaTexto: contratoFinal.resena_texto,
      abonos: abonosPortal.map((a) => ({
        monto: a.monto,
        metodo: a.metodo,
        fecha: a.fecha,
        fechaRegistro: a.fecha_registro
      })),
      totalAbonado,
      propiedades: propiedades.map((p) => ({
        numPropiedad: p.num_propiedad,
        tipo: p.tipo,
        paquete: pkMap[p.paquete] || p.paquete,
        entregables: p.entregables,
        fechaSesion: p.fecha_sesion,
        horaSesion: p.hora_sesion,
        direccion: p.direccion,
        linkMaps: p.link_maps,
        orientacion: p.orientacion,
        sobreLaPropiedad: p.sobre_la_propiedad,
        referencias: p.referencias,
        fachadaUrl: p.fachada_url,
        perimetroUrl: p.perimetro_url,
        datosEspecificos: JSON.parse(p.datos_especificos || "{}"),
        logoUrl: p.logo_url,
        logosUrls: (() => {
          try {
            return JSON.parse(p.logos_json || "[]");
          } catch (e) {
            return [];
          }
        })(),
        carpetaControlId: p.carpeta_control_id,
        formatoVideo: p.formato_video || "vertical_nativo",
        requiereAcceso: p.requiere_acceso ? 1 : 0,
        ocultarFormatoVideo: p.ocultar_formato_video ? 1 : 0
      })),
      paquetesDisponibles,
      extrasAcordados,
      todosAdicionales,
      banco: "Banamex",
      titular: "Bruno Gutierrez Salazar",
      clabe: "002580905411451243",
      cuenta: "1145124",
      tarjeta: "5544 9206 0686 5310",
      clipLink: "https://linkdenegocio.mx/@inmueblesaudiovisuales/pagar",
      waLink: "https://wa.me/5218127174207",
      logoClienteUrl
    });
  }
  if (action === "firmaCliente") {
    const body = await request.json();
    const {
      token,
      correoCliente,
      telefonoCliente,
      firmaBase64,
      adicionales: adicionalesSeleccionados,
      propiedades: propsCliente
    } = body;
    if (!token) return err("Token requerido");
    const contrato = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [token]);
    if (!contrato) return err("Contrato no encontrado", 404);
    if (contrato.estatus !== "Pendiente firma") return err("El contrato ya fue firmado");
    const tkPortal = await queryOne(
      db,
      "SELECT * FROM tokens WHERE contrato_id = ? AND tipo = 'contrato' AND usado = 0 ORDER BY rowid DESC LIMIT 1",
      [contrato.token]
    );
    if (tkPortal?.expira && new Date(tkPortal.expira) < /* @__PURE__ */ new Date()) {
      return err("El enlace de firma ha expirado. Solicita un nuevo enlace a Bruno.", 403);
    }
    const adicionalesExistentes = JSON.parse(contrato.adicionales_json || "[]");
    const acordados = adicionalesExistentes.filter((i) => typeof i === "object");
    let precioTotal = contrato.precio_total;
    const adicionalesAceptados = [];
    const clavesSeen = /* @__PURE__ */ new Set();
    const adicionalesDedup = (adicionalesSeleccionados || []).filter((item) => {
      const clave = typeof item === "string" ? item : item.clave;
      if (!clave || clavesSeen.has(clave)) return false;
      clavesSeen.add(clave);
      return true;
    });
    if (adicionalesDedup.length) {
      for (const item of adicionalesDedup) {
        const clave = typeof item === "string" ? item : item.clave;
        if (!clave) continue;
        if (typeof item === "object" && item.precio && item.ofrecido) {
          if (item.precio < 0) continue;
          precioTotal += item.precio;
          adicionalesAceptados.push(item);
        } else {
          const p = await queryOne(db, "SELECT precio FROM paquetes WHERE clave = ?", [clave]);
          if (p) {
            precioTotal += p.precio;
            adicionalesAceptados.push(item);
          }
        }
      }
    }
    const anticipo = contrato.anticipo;
    const saldoPendiente = precioTotal;
    const nuevoEstatus = "Firmado";
    const nuevoAdicionales = [...acordados, ...adicionalesAceptados];
    const firmaNow = now();
    const statements = [
      {
        sql: `UPDATE contratos SET estatus=?, fecha_firma=?, precio_total=?, saldo_pendiente=?,
              adicionales_json=?, firma_base64_url='pending',
              correo_cliente=COALESCE(NULLIF(?, ''), correo_cliente),
              telefono_cliente=COALESCE(NULLIF(?, ''), telefono_cliente)
              WHERE token=? AND estatus='Pendiente firma'`,
        params: [
          nuevoEstatus,
          firmaNow,
          precioTotal,
          saldoPendiente,
          JSON.stringify(nuevoAdicionales),
          correoCliente || "",
          telefonoCliente || "",
          token
        ]
      }
    ];
    if (propsCliente?.length) {
      for (const p of propsCliente) {
        const logosArr = Array.isArray(p.logosUrls) ? p.logosUrls.filter(Boolean).slice(0, 3) : [];
        if (!logosArr.length && p.logoUrl) logosArr.push(p.logoUrl);
        statements.push({
          sql: `UPDATE propiedades SET direccion=?, link_maps=?, orientacion=?, sobre_la_propiedad=?,
                referencias=?, fachada_url=?, perimetro_url=?, datos_especificos=?, logo_url=?, logos_json=?,
                formato_video=?, requiere_acceso=?
                WHERE contrato_token=? AND num_propiedad=?
                  AND EXISTS (SELECT 1 FROM contratos WHERE token=? AND fecha_firma=?)`,
          params: [
            p.direccion || "",
            limpiarLinkMaps(p.linkMaps || ""),
            p.orientacion || "",
            p.sobreLaPropiedad || "",
            p.referencias || "",
            p.fachadaUrl || "",
            p.perimetroUrl || "",
            JSON.stringify(p.datosEspecificos || {}),
            logosArr[0] || "",
            JSON.stringify(logosArr),
            p.formatoVideo || "vertical_nativo",
            p.requiereAcceso || 0,
            token,
            p.numPropiedad,
            token,
            firmaNow
          ]
        });
      }
    }
    const results = await batch(db, statements);
    if (!results[0]?.meta?.changes) return err("El contrato ya fue firmado", 409);
    const propConLogos = propsCliente?.find((p) => Array.isArray(p.logosUrls) && p.logosUrls.filter(Boolean).length || p.logoUrl);
    const logosClienteUrls = propConLogos ? Array.isArray(propConLogos.logosUrls) ? propConLogos.logosUrls.filter(Boolean).slice(0, 3) : [] : [];
    if (!logosClienteUrls.length && propConLogos?.logoUrl) logosClienteUrls.push(propConLogos.logoUrl);
    if (logosClienteUrls.length && contrato.cliente_id) {
      await run(db, "UPDATE clientes SET logo_url = ? WHERE id = ?", [logosClienteUrls[0], contrato.cliente_id]);
    }
    const trabajoFirma = await queryOne(
      db,
      "SELECT id, cliente_id FROM trabajos WHERE token=?",
      [token]
    );
    if (trabajoFirma) {
      await run(
        db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE id=?`,
        [nuevoEstatus, firmaNow, trabajoFirma.id]
      );
      if (nuevoEstatus === "Reservado") {
        callAdapter(ctx, env, "crearEventoReservado", {
          trabajoId: trabajoFirma.id,
          token,
          nombreCliente: contrato.nombre_cliente,
          telefono: contrato.telefono_cliente || "",
          equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${token}`
        });
      }
    }
    const { results: propiedadesFirma } = await query(
      db,
      "SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad",
      [token]
    );
    const paqueteInfo = await queryOne(
      db,
      "SELECT entregables FROM paquetes WHERE clave = ?",
      [contrato.paquete_base]
    );
    const entregablesAdapter = propiedadesFirma.map((p) => p.entregables).filter(Boolean).join(" | ") || paqueteInfo?.entregables || "";
    const { results: paquetesDb } = await query(db, "SELECT clave, nombre FROM paquetes");
    const pkMap = Object.fromEntries(paquetesDb.map((p) => [p.clave, p.nombre]));
    const adicionalesNombres = nuevoAdicionales.map((a) => {
      if (typeof a === "string") return pkMap[a] || a;
      if (a.clave && !a.nombre) return { ...a, nombre: pkMap[a.clave] || a.clave };
      return a;
    });
    callAdapter(ctx, env, "procesarFirma", {
      token,
      firmaBase64,
      contrato: {
        ...contrato,
        precio_total: precioTotal,
        anticipo,
        saldo_pendiente: saldoPendiente,
        estatus: nuevoEstatus,
        correo_cliente: correoCliente || contrato.correo_cliente,
        telefono_cliente: telefonoCliente || contrato.telefono_cliente,
        adicionales_json: JSON.stringify(adicionalesNombres),
        paquete_base: pkMap[contrato.paquete_base] || contrato.paquete_base
      },
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`,
      propiedades: propiedadesFirma.map((p) => ({ ...p, paquete: pkMap[p.paquete] || p.paquete })),
      entregables: entregablesAdapter,
      logosClienteUrls
    });
    return ok({ ok: true, estatus: nuevoEstatus, total: precioTotal, anticipo, folio: contrato.folio });
  }
  if (action === "guardarResena") {
    const { token, calificacion, resenaTexto } = await request.json();
    if (!token) return err("Token requerido");
    const contratoResena = await queryOne(db, "SELECT estatus FROM contratos WHERE token = ?", [token]);
    if (!contratoResena) return err("Contrato no encontrado", 404);
    if (!["Entregado", "Completado"].includes(contratoResena.estatus)) return err("Solo puedes calificar despu\xE9s de recibir tu material", 403);
    await run(
      db,
      "UPDATE contratos SET calificacion=?, resena_texto=? WHERE token=?",
      [calificacion, resenaTexto || "", token]
    );
    callAdapter(ctx, env, "notificarResena", { token, calificacion, resenaTexto });
    return ok({ ok: true });
  }
  if (action === "guardarConfiguracion") {
    return err("Este endpoint ha sido deprecado en v5.0. Los contratos ahora se crean directamente con propiedades desde el admin.", 410);
  }
  if (action === "obtenerEntrega") {
    const token = url.searchParams.get("token");
    if (!token) return err("Token requerido");
    const c = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    if (c.entrega_config_estado !== "publicado") {
      return ok({
        ok: true,
        token: c.token,
        estatus: c.estatus,
        publicado: false,
        revocada: !!(c.entrega_revocada && String(c.entrega_revocada).trim()),
        nombreCliente: c.nombre_cliente,
        waLink: "https://wa.me/5218127174207",
        igHandle: "@inmuebles.audiovisuales"
      });
    }
    return ok(payloadEntrega(c, env));
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handlePortal, "handlePortal");

// src/entregas-core.js
var ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
var LARGO_CODIGO = 10;
function generarCodigo(rnd) {
  const bytes = new Uint8Array(LARGO_CODIGO);
  if (rnd) rnd(bytes);
  else crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < LARGO_CODIGO; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}
__name(generarCodigo, "generarCodigo");
function rutaPublica(folio, codigo) {
  const f = String(folio || "").trim();
  return f ? `/${f}-${codigo}` : `/${codigo}`;
}
__name(rutaPublica, "rutaPublica");
function codigoDeRuta(pathname) {
  const limpio = String(pathname || "").replace(/^\/+|\/+$/g, "");
  if (!limpio || limpio.includes("/")) return "";
  const partes = limpio.split("-");
  const cand = partes[partes.length - 1];
  return esCodigoValido(cand) ? cand : "";
}
__name(codigoDeRuta, "codigoDeRuta");
function esCodigoValido(s) {
  if (typeof s !== "string" || s.length !== LARGO_CODIGO) return false;
  for (const ch of s) if (!ALFABETO.includes(ch)) return false;
  return true;
}
__name(esCodigoValido, "esCodigoValido");
var POR_PAQUETE = {
  "RES-COMBO": ["fotos", "video", "tour"],
  "TER-COMBO": ["fotos", "video"],
  "IND-FOTO": ["fotos"],
  "IND-VIDEO": ["video"],
  "IND-360": ["tour"]
};
var PLANTILLA = {
  fotos: { tipo: "fotos", nombre: "Fotograf\xEDas" },
  video: { tipo: "video", nombre: "Video cinem\xE1tico" },
  tour: { tipo: "enlace", nombre: "Tour 360" }
};
var POR_ADICIONAL = {
  "ADD-COMOLLEGAR": { tipo: "video", nombre: "Video c\xF3mo llegar" },
  "ADD-LANDING": { tipo: "enlace", nombre: "Landing page" },
  "ADD-FOLLETO": { tipo: "enlace", nombre: "Folleto digital" }
};
function clavesAcordadas(adicionales, numPropiedad) {
  const lista = Array.isArray(adicionales) ? adicionales : [];
  const out = [];
  for (const a of lista) {
    if (typeof a === "string") continue;
    if (!a || typeof a !== "object") continue;
    if (!a.clave) continue;
    if (a.ofrecido) continue;
    if (a.numPropiedad != null && Number(a.numPropiedad) !== Number(numPropiedad)) continue;
    out.push(a.clave);
  }
  return out;
}
__name(clavesAcordadas, "clavesAcordadas");
function parsearAdicionales(json) {
  if (Array.isArray(json)) return json;
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
__name(parsearAdicionales, "parsearAdicionales");
function entregablesSembrados(paqueteBase, adicionales, numPropiedad) {
  const claves = POR_PAQUETE[paqueteBase] || ["fotos", "video", "tour"];
  const items = claves.map((k) => ({ ...PLANTILLA[k] }));
  for (const clave of clavesAcordadas(adicionales, numPropiedad)) {
    const extra = POR_ADICIONAL[clave];
    if (extra && !items.some((i) => i.nombre === extra.nombre)) items.push({ ...extra });
  }
  return items.map((i, idx) => ({ ...i, orden: idx, completo: 0, valor: "" }));
}
__name(entregablesSembrados, "entregablesSembrados");
var OFFSET_MTY_MS = -6 * 3600 * 1e3;
function calcularExpiracion(fechaLiberadaISO, dias = 14) {
  const t = new Date(fechaLiberadaISO).getTime();
  if (!Number.isFinite(t)) return null;
  const mty = new Date(t + OFFSET_MTY_MS);
  const finMtyUTC = Date.UTC(
    mty.getUTCFullYear(),
    mty.getUTCMonth(),
    mty.getUTCDate() + dias,
    23,
    59,
    59,
    0
  );
  return new Date(finMtyUTC - OFFSET_MTY_MS).toISOString();
}
__name(calcularExpiracion, "calcularExpiracion");
function diasRestantes(fechaExpiraISO, ahoraISO) {
  if (!fechaExpiraISO) return null;
  const fin = new Date(fechaExpiraISO).getTime();
  const hoy = new Date(ahoraISO || Date.now()).getTime();
  if (!Number.isFinite(fin) || !Number.isFinite(hoy)) return null;
  const diaMty = /* @__PURE__ */ __name((d) => Math.floor((d + OFFSET_MTY_MS) / 864e5), "diaMty");
  return diaMty(fin) - diaMty(hoy);
}
__name(diasRestantes, "diasRestantes");
function estaVencida(fechaExpiraISO, ahoraISO) {
  if (!fechaExpiraISO) return false;
  const fin = new Date(fechaExpiraISO).getTime();
  const hoy = new Date(ahoraISO || Date.now()).getTime();
  return Number.isFinite(fin) && Number.isFinite(hoy) && hoy > fin;
}
__name(estaVencida, "estaVencida");
var MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];
function fechaLegible(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mty = new Date(t + OFFSET_MTY_MS);
  return `${mty.getUTCDate()} de ${MESES[mty.getUTCMonth()]}`;
}
__name(fechaLegible, "fechaLegible");
function entregaCompleta(entregables) {
  const l = Array.isArray(entregables) ? entregables : [];
  return l.length > 0 && l.every((e) => !!e.completo);
}
__name(entregaCompleta, "entregaCompleta");
function faltantes(entregables) {
  return (Array.isArray(entregables) ? entregables : []).filter((e) => !e.completo).map((e) => e.nombre);
}
__name(faltantes, "faltantes");
function debeLiberarAlPagar(entrega) {
  return !!entrega && entrega.estado === "publicada";
}
__name(debeLiberarAlPagar, "debeLiberarAlPagar");
function debeLiberarAlPublicar(saldoPendiente, pagadoManual) {
  if (pagadoManual) return true;
  return saldoPendiente != null && Number(saldoPendiente) <= 0;
}
__name(debeLiberarAlPublicar, "debeLiberarAlPublicar");
function entregableCumplido(entregable, numArchivos) {
  if (!entregable) return false;
  if (entregable.tipo === "enlace") return !!String(entregable.valor || "").trim();
  return (numArchivos || 0) > 0;
}
__name(entregableCumplido, "entregableCumplido");
function datosCliente(eCliente, clienteAdmin) {
  const e = eCliente || {};
  const a = clienteAdmin || null;
  if (e.cliente_id && a) {
    return { nombre: a.nombre || "", telefono: a.telefono || "", correo: a.correo || "", ligado: true };
  }
  return {
    nombre: e.nombre || (e.cliente_id ? "Cliente eliminado" : ""),
    telefono: e.telefono || "",
    correo: e.correo || "",
    ligado: !!e.cliente_id
  };
}
__name(datosCliente, "datosCliente");
function grupoDeEntrega(estado) {
  if (estado === "borrador") return "pendientes";
  if (estado === "publicada") return "con_cliente";
  if (estado === "liberada" || estado === "pausada") return "liberadas";
  return "historial";
}
__name(grupoDeEntrega, "grupoDeEntrega");
function ordenarEntregas(lista, ahoraISO) {
  return [...lista || []].sort((a, b) => {
    const da = diasRestantes(a.fecha_expira, ahoraISO);
    const db = diasRestantes(b.fecha_expira, ahoraISO);
    if (da != null && db != null) return da - db;
    if (da != null) return -1;
    if (db != null) return 1;
    return String(a.fecha_sesion || a.fecha_creacion || "").localeCompare(String(b.fecha_sesion || b.fecha_creacion || ""));
  });
}
__name(ordenarEntregas, "ordenarEntregas");

// src/entregas-media.js
var PARTE_MAX = 90 * 1024 * 1024;
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
async function hmac(secreto, mensaje) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(mensaje)));
}
__name(hmac, "hmac");
function secretoFirma(env) {
  return env.ENTREGAS_KEY || env.CF_MEDIA_TOKEN || env.ADMIN_KEY || "iav-entregas";
}
__name(secretoFirma, "secretoFirma");
async function firmar(env, recurso, segundos = 300) {
  const expira = Math.floor(Date.now() / 1e3) + segundos;
  const f = await hmac(secretoFirma(env), `${recurso}:${expira}`);
  return `${expira}.${f}`;
}
__name(firmar, "firmar");
async function verificarFirma(env, recurso, firma) {
  const s = String(firma || "");
  const i = s.indexOf(".");
  if (i < 1) return false;
  const expira = Number(s.slice(0, i));
  if (!Number.isFinite(expira) || expira < Math.floor(Date.now() / 1e3)) return false;
  const esperado = await hmac(secretoFirma(env), `${recurso}:${expira}`);
  const dado = s.slice(i + 1);
  if (dado.length !== esperado.length) return false;
  let dif = 0;
  for (let k = 0; k < dado.length; k++) dif |= dado.charCodeAt(k) ^ esperado.charCodeAt(k);
  return dif === 0;
}
__name(verificarFirma, "verificarFirma");
function llaveR2(entregaId, archivoId, nombre) {
  const limpio = String(nombre || "archivo").replace(/[^\w.\-]+/g, "_").replace(/\.{2,}/g, ".").replace(/_{2,}/g, "_").slice(-120);
  return `entregas/${entregaId}/${archivoId}-${limpio}`;
}
__name(llaveR2, "llaveR2");
async function subirPreviewImages(env, blob, nombre) {
  const form = new FormData();
  form.append("file", blob, nombre || "preview.jpg");
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
    { method: "POST", headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` }, body: form }
  );
  const j = await r.json();
  if (!j || !j.success || !j.result) return null;
  const variante = j.result.variants && j.result.variants[0] || "";
  const m = String(variante).match(/imagedelivery\.net\/([^/]+)\//);
  return { id: j.result.id, hash: m ? m[1] : "" };
}
__name(subirPreviewImages, "subirPreviewImages");
async function borrarDeImages(env, imagesId) {
  if (!imagesId) return false;
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${imagesId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` } }
    );
    return r.ok;
  } catch (e) {
    console.error("borrarDeImages", e.message);
    return false;
  }
}
__name(borrarDeImages, "borrarDeImages");
async function copiarAStream(env, urlOrigen, nombre, watermarkUid) {
  const body = { url: urlOrigen, meta: { name: nombre || "entrega" } };
  const uid = watermarkUid || env.STREAM_WATERMARK_UID;
  if (uid) body.watermark = { uid };
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/copy`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const j = await r.json();
  if (!j || !j.success || !j.result) {
    const msg = j && j.errors && j.errors[0] && j.errors[0].message || "error desconocido";
    throw new Error("Stream rechaz\xF3 la copia: " + msg);
  }
  const prev = String(j.result.preview || j.result.thumbnail || "");
  const m = prev.match(/(customer-[^.]+)\./);
  return { uid: j.result.uid, customer: m ? m[1] : "" };
}
__name(copiarAStream, "copiarAStream");
async function borrarDeStream(env, uid) {
  if (!uid) return false;
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` } }
    );
    return r.ok;
  } catch (e) {
    console.error("borrarDeStream", e.message);
    return false;
  }
}
__name(borrarDeStream, "borrarDeStream");
function perfilWatermark(env, ancho, alto) {
  const esVertical = Number(alto) > Number(ancho);
  if (esVertical && env.STREAM_WATERMARK_UID_VERTICAL) return env.STREAM_WATERMARK_UID_VERTICAL;
  return env.STREAM_WATERMARK_UID || "";
}
__name(perfilWatermark, "perfilWatermark");
async function guardarEnR2(env, key, body, mime) {
  await env.ENTREGAS_ORIGINALES.put(key, body, {
    httpMetadata: { contentType: mime || "application/octet-stream" }
  });
  return key;
}
__name(guardarEnR2, "guardarEnR2");
async function borrarDeR2(env, key) {
  if (!key) return false;
  try {
    await env.ENTREGAS_ORIGINALES.delete(key);
    return true;
  } catch (e) {
    console.error("borrarDeR2", e.message);
    return false;
  }
}
__name(borrarDeR2, "borrarDeR2");
async function borrarMediaDeEntrega(env, archivos) {
  const r = { r2: 0, images: 0, stream: 0, fallos: 0 };
  for (const a of archivos || []) {
    if (a.r2_key) {
      await borrarDeR2(env, a.r2_key) ? r.r2++ : r.fallos++;
    }
    if (a.images_id) {
      await borrarDeImages(env, a.images_id) ? r.images++ : r.fallos++;
    }
    if (a.stream_uid) {
      await borrarDeStream(env, a.stream_uid) ? r.stream++ : r.fallos++;
    }
  }
  return r;
}
__name(borrarMediaDeEntrega, "borrarMediaDeEntrega");
function esImagen(mime) {
  return /^image\/(jpeg|png|webp|avif)$/i.test(String(mime || ""));
}
__name(esImagen, "esImagen");
function esVideo(mime) {
  return /^video\//i.test(String(mime || ""));
}
__name(esVideo, "esVideo");
function nombreDescarga(nombre, fallback) {
  const n = String(nombre || "").trim();
  return n || fallback || "archivo";
}
__name(nombreDescarga, "nombreDescarga");

// src/routes/entregas.js
var WA_BASE = "https://wa.me/5218127174207";
function requireEntregas(request, env) {
  const kE = request.headers.get("X-Entregas-Key");
  const kA = request.headers.get("X-Admin-Key");
  const url = new URL(request.url);
  const kQ = url.searchParams.get("k");
  const propia = env.ENTREGAS_KEY;
  if (propia && (kE === propia || kQ === propia)) return null;
  if (env.ADMIN_KEY && (kA === env.ADMIN_KEY || kE === env.ADMIN_KEY || kQ === env.ADMIN_KEY)) return null;
  return err("No autorizado", 401);
}
__name(requireEntregas, "requireEntregas");
function baseEntregas(env) {
  return env.ENTREGAS_BASE_URL || "https://entregas.inmueblesaudiovisuales.com";
}
__name(baseEntregas, "baseEntregas");
async function codigoLibre(db) {
  for (let i = 0; i < 8; i++) {
    const c = generarCodigo();
    const existe = await queryOne(db, "SELECT id FROM e_entregas WHERE codigo=?", [c]);
    if (!existe) return c;
  }
  throw new Error("No se pudo generar un codigo unico");
}
__name(codigoLibre, "codigoLibre");
async function evento(db, entregaId, tipo, detalle = "") {
  try {
    await run(
      db,
      "INSERT INTO e_eventos (id, e_entrega_id, tipo, detalle, fecha) VALUES (?,?,?,?,?)",
      [uuid(), entregaId, tipo, detalle, now()]
    );
  } catch (e) {
    console.error("e_eventos fall\xF3", e.message);
  }
}
__name(evento, "evento");
async function eClienteDeAdmin(db, clienteId) {
  if (!clienteId) return null;
  const ya = await queryOne(db, "SELECT * FROM e_clientes WHERE cliente_id=?", [clienteId]);
  if (ya) return ya;
  const id = uuid();
  await run(
    db,
    `INSERT INTO e_clientes (id, cliente_id, nombre, telefono, correo, origen, fecha_creacion)
     VALUES (?,?,'','','','admin',?)`,
    [id, clienteId, now()]
  );
  return await queryOne(db, "SELECT * FROM e_clientes WHERE id=?", [id]);
}
__name(eClienteDeAdmin, "eClienteDeAdmin");
async function resolverCliente(db, eClienteId) {
  const e = await queryOne(db, "SELECT * FROM e_clientes WHERE id=?", [eClienteId]);
  if (!e) return { nombre: "", telefono: "", correo: "", ligado: false };
  const admin = e.cliente_id ? await queryOne(db, "SELECT nombre, telefono, correo FROM clientes WHERE id=?", [e.cliente_id]) : null;
  return { ...datosCliente(e, admin), e_cliente_id: e.id, cliente_id: e.cliente_id || "" };
}
__name(resolverCliente, "resolverCliente");
async function saldoDeEntrega(db, entrega) {
  if (!entrega.contrato_token) return null;
  const c = await queryOne(
    db,
    "SELECT saldo_pendiente, precio_total, folio FROM contratos WHERE token=?",
    [entrega.contrato_token]
  );
  return c ? c.saldo_pendiente : null;
}
__name(saldoDeEntrega, "saldoDeEntrega");
async function folioDeEntrega(db, entrega) {
  if (!entrega.contrato_token) return "";
  const c = await queryOne(db, "SELECT folio FROM contratos WHERE token=?", [entrega.contrato_token]);
  return c && c.folio || "";
}
__name(folioDeEntrega, "folioDeEntrega");
async function refrescarEntregable(db, entregableId) {
  const e = await queryOne(db, "SELECT * FROM e_entregables WHERE id=?", [entregableId]);
  if (!e) return;
  const c = await queryOne(
    db,
    "SELECT COUNT(*) AS n FROM e_archivos WHERE e_entregable_id=?",
    [entregableId]
  );
  const completo = entregableCumplido(e, c && c.n || 0) ? 1 : 0;
  if (completo !== e.completo) {
    await run(db, "UPDATE e_entregables SET completo=? WHERE id=?", [completo, entregableId]);
  }
}
__name(refrescarEntregable, "refrescarEntregable");
async function entregablesDe(db, entregaId) {
  const { results } = await query(
    db,
    `SELECT e.*, (SELECT COUNT(*) FROM e_archivos a WHERE a.e_entregable_id = e.id) AS num_archivos
     FROM e_entregables e WHERE e.e_entrega_id=? ORDER BY e.orden, e.rowid`,
    [entregaId]
  );
  return results || [];
}
__name(entregablesDe, "entregablesDe");
async function sembrarEntregasDeContrato(db, contrato, propiedades) {
  const eCliente = await eClienteDeAdmin(db, contrato.cliente_id);
  if (!eCliente) return { creadas: 0 };
  const adicionales = parsearAdicionales(contrato.adicionales_json);
  let creadas = 0;
  for (const p of propiedades) {
    const yaHay = await queryOne(
      db,
      "SELECT id FROM e_entregas WHERE contrato_token=? AND num_propiedad=?",
      [contrato.token, p.num_propiedad]
    );
    if (yaHay) continue;
    const id = uuid();
    const codigo = await codigoLibre(db);
    const titulo = p.direccion || contrato.folio || `Propiedad ${p.num_propiedad}` || "Propiedad";
    await run(
      db,
      `INSERT INTO e_entregas
        (id, e_cliente_id, contrato_token, num_propiedad, codigo, titulo, direccion,
         estado, fecha_sesion, fecha_creacion)
       VALUES (?,?,?,?,?,?,?, 'borrador', ?, ?)`,
      [
        id,
        eCliente.id,
        contrato.token,
        p.num_propiedad,
        codigo,
        titulo,
        p.direccion || "",
        p.fecha_sesion || "",
        now()
      ]
    );
    const paquete = p.paquete || contrato.paquete_base || "";
    const items = entregablesSembrados(paquete, adicionales, p.num_propiedad);
    if (items.length) {
      await batch(db, items.map((it) => ({
        sql: `INSERT INTO e_entregables (id, e_entrega_id, tipo, nombre, orden, completo, valor)
              VALUES (?,?,?,?,?,0,'')`,
        params: [uuid(), id, it.tipo, it.nombre, it.orden]
      })));
    }
    await evento(db, id, "creada", `Sembrada del contrato \xB7 propiedad ${p.num_propiedad}`);
    creadas++;
  }
  return { creadas };
}
__name(sembrarEntregasDeContrato, "sembrarEntregasDeContrato");
async function liberar(db, entrega, motivo) {
  const ts = now();
  const expira = calcularExpiracion(ts, entrega.dias_vigencia || 14);
  await run(
    db,
    `UPDATE e_entregas SET estado='liberada', fecha_liberada=?, fecha_expira=? WHERE id=?`,
    [ts, expira, entrega.id]
  );
  await evento(db, entrega.id, "liberada", motivo || "");
  return { fecha_liberada: ts, fecha_expira: expira };
}
__name(liberar, "liberar");
async function liberarPorPago(db, contratoToken) {
  const { results } = await query(
    db,
    `SELECT * FROM e_entregas WHERE contrato_token=?`,
    [contratoToken]
  );
  let liberadas = 0;
  for (const e of results || []) {
    if (!debeLiberarAlPagar(e)) continue;
    await liberar(db, e, "Saldo liquidado");
    liberadas++;
  }
  return { liberadas };
}
__name(liberarPorPago, "liberarPorPago");
async function expirarEntregas(env) {
  const db = env.DB;
  const ahora = now();
  const { results } = await query(
    db,
    `SELECT * FROM e_entregas WHERE estado='liberada' AND fecha_expira IS NOT NULL`
  );
  const resumen = { revisadas: (results || []).length, expiradas: 0, r2: 0, images: 0, stream: 0, fallos: 0 };
  for (const e of results || []) {
    if (!estaVencida(e.fecha_expira, ahora)) continue;
    const { results: archivos } = await query(
      db,
      "SELECT * FROM e_archivos WHERE e_entrega_id=?",
      [e.id]
    );
    let borrado = { r2: 0, images: 0, stream: 0, fallos: 0 };
    try {
      borrado = await borrarMediaDeEntrega(env, archivos || []);
    } catch (err2) {
      console.error("expirar: borrarMedia fall\xF3", e.id, err2.message);
      borrado.fallos++;
    }
    resumen.r2 += borrado.r2;
    resumen.images += borrado.images;
    resumen.stream += borrado.stream;
    resumen.fallos += borrado.fallos;
    if (borrado.fallos > 0) {
      await evento(db, e.id, "expirada", `Borrado parcial, se reintenta (${borrado.fallos} fallos)`);
      continue;
    }
    await batch(db, [
      { sql: "DELETE FROM e_archivos WHERE e_entrega_id=?", params: [e.id] },
      { sql: `UPDATE e_entregas SET estado='expirada', fecha_expirada=? WHERE id=?`, params: [ahora, e.id] }
    ]);
    await evento(
      db,
      e.id,
      "expirada",
      `Material borrado: ${borrado.r2} de R2, ${borrado.images} de Images, ${borrado.stream} de Stream`
    );
    resumen.expiradas++;
  }
  return resumen;
}
__name(expirarEntregas, "expirarEntregas");
async function borrarEntregaCascada(db, entregaId) {
  await batch(db, [
    { sql: "DELETE FROM e_eventos WHERE e_entrega_id=?", params: [entregaId] },
    { sql: "DELETE FROM e_archivos WHERE e_entrega_id=?", params: [entregaId] },
    { sql: "DELETE FROM e_entregables WHERE e_entrega_id=?", params: [entregaId] },
    { sql: "DELETE FROM e_entregas WHERE id=?", params: [entregaId] }
  ]);
}
__name(borrarEntregaCascada, "borrarEntregaCascada");
async function borrarEntregasDeContrato(db, contratoToken) {
  const { results } = await query(
    db,
    "SELECT id FROM e_entregas WHERE contrato_token=?",
    [contratoToken]
  );
  for (const e of results || []) await borrarEntregaCascada(db, e.id);
  return { borradas: (results || []).length };
}
__name(borrarEntregasDeContrato, "borrarEntregasDeContrato");
async function payloadPublico(db, env, entrega) {
  const cliente = await resolverCliente(db, entrega.e_cliente_id);
  const items = await entregablesDe(db, entrega.id);
  const { results: archivos } = await query(
    db,
    "SELECT * FROM e_archivos WHERE e_entrega_id=? ORDER BY orden, rowid",
    [entrega.id]
  );
  const liberada = entrega.estado === "liberada";
  const vencida = estaVencida(entrega.fecha_expira, now());
  const base = {
    ok: true,
    estado: vencida && liberada ? "expirada" : entrega.estado,
    titulo: entrega.titulo,
    direccion: entrega.direccion,
    cliente: cliente.nombre,
    tourUrl: entrega.tour_url || "",
    waLink: WA_BASE,
    liberada: liberada && !vencida,
    entregables: items.map((i) => ({ tipo: i.tipo, nombre: i.nombre }))
  };
  base.fotos = (archivos || []).filter((a) => a.images_id).map((a) => ({ id: a.images_id, hash: a.images_hash, nombre: a.nombre, destacado: !!a.destacado }));
  const video = (archivos || []).find((a) => a.stream_uid);
  if (video) {
    base.video = { uid: video.stream_uid };
    base.streamCustomer = env.STREAM_CUSTOMER_CODE || "";
  }
  if (liberada && !vencida) {
    base.fechaLimite = fechaLegible(entrega.fecha_expira);
    base.diasRestantes = diasRestantes(entrega.fecha_expira, now());
    const descargas = [];
    for (const a of archivos || []) {
      if (!a.r2_key) continue;
      const f = await firmar(env, "bajar:" + a.id, 900);
      descargas.push({
        id: a.id,
        nombre: a.nombre,
        bytes: a.bytes,
        mime: a.mime,
        tipo: esVideo(a.mime) ? "video" : "foto",
        url: `/api/e/bajar?a=${a.id}&f=${encodeURIComponent(f)}`
      });
    }
    base.descargas = descargas;
  }
  return base;
}
__name(payloadPublico, "payloadPublico");
async function handleEntregas(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);
  if (action === "publica") {
    const codigo = url.searchParams.get("codigo") || "";
    if (!codigo) return err("Enlace inv\xE1lido", 400);
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE codigo=?", [codigo]);
    if (!e) return err("Entrega no encontrada", 404);
    if (e.estado === "borrador") {
      return ok({ ok: true, estado: "borrador", waLink: WA_BASE, tourUrl: "" });
    }
    if (e.estado === "pausada") {
      return ok({ ok: true, estado: "pausada", waLink: WA_BASE, tourUrl: e.tour_url || "" });
    }
    if (e.estado === "expirada") {
      return ok({
        ok: true,
        estado: "expirada",
        waLink: WA_BASE,
        tourUrl: e.tour_url || "",
        titulo: e.titulo
      });
    }
    ctx.waitUntil(evento(db, e.id, "vista", ""));
    return ok(await payloadPublico(db, env, e));
  }
  if (action === "bajar") {
    const archivoId = url.searchParams.get("a") || "";
    const firma = url.searchParams.get("f") || "";
    if (!await verificarFirma(env, "bajar:" + archivoId, firma)) {
      return err("Enlace de descarga vencido. Vuelve a entrar a tu galer\xEDa.", 403);
    }
    const a = await queryOne(db, "SELECT * FROM e_archivos WHERE id=?", [archivoId]);
    if (!a || !a.r2_key) return err("Archivo no encontrado", 404);
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [a.e_entrega_id]);
    if (!e || e.estado !== "liberada" || estaVencida(e.fecha_expira, now())) {
      return err("Este material ya no est\xE1 disponible.", 403);
    }
    const obj = await env.ENTREGAS_ORIGINALES.get(a.r2_key);
    if (!obj) return err("Archivo no encontrado", 404);
    ctx.waitUntil(evento(db, e.id, "descarga", a.nombre || ""));
    return new Response(obj.body, {
      headers: {
        "Content-Type": a.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${nombreDescarga(a.nombre, "archivo")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  }
  if (action === "origen") {
    const archivoId = url.searchParams.get("a") || "";
    const firma = url.searchParams.get("f") || "";
    if (!await verificarFirma(env, "origen:" + archivoId, firma)) return err("Firma inv\xE1lida", 403);
    const a = await queryOne(db, "SELECT * FROM e_archivos WHERE id=?", [archivoId]);
    if (!a || !a.r2_key) return err("Archivo no encontrado", 404);
    const obj = await env.ENTREGAS_ORIGINALES.get(a.r2_key);
    if (!obj) return err("Archivo no encontrado", 404);
    return new Response(obj.body, {
      headers: { "Content-Type": a.mime || "video/mp4", "Cache-Control": "private, no-store" }
    });
  }
  const deny = requireEntregas(request, env);
  if (deny) return deny;
  if (action === "subirFoto") {
    const form = await request.formData();
    const entregableId = form.get("entregableId");
    const original = form.get("original");
    const preview = form.get("preview");
    const nombre = String(form.get("nombre") || "foto.jpg");
    if (!entregableId || !original) return err("Datos incompletos");
    const ent = await queryOne(db, "SELECT * FROM e_entregables WHERE id=?", [entregableId]);
    if (!ent) return err("Entregable no encontrado", 404);
    if (!esImagen(original.type)) return err("Ese archivo no es una imagen que el navegador pueda mostrar", 400);
    const archivoId = uuid();
    const key = llaveR2(ent.e_entrega_id, archivoId, nombre);
    await guardarEnR2(env, key, original.stream(), original.type);
    let img = null;
    if (preview) {
      try {
        img = await subirPreviewImages(env, preview, nombre);
      } catch (e) {
        console.error("preview a Images fall\xF3", e.message);
      }
    }
    const c = await queryOne(
      db,
      "SELECT COUNT(*) AS n FROM e_archivos WHERE e_entregable_id=?",
      [entregableId]
    );
    await run(
      db,
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, images_id, images_hash, orden, destacado, estado, fecha)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'listo', ?)`,
      [
        archivoId,
        entregableId,
        ent.e_entrega_id,
        nombre,
        original.size || 0,
        original.type || "",
        key,
        img && img.id || "",
        img && img.hash || "",
        c && c.n || 0,
        (c && c.n) === 0 ? 1 : 0,
        now()
      ]
    );
    await refrescarEntregable(db, entregableId);
    return ok({ ok: true, archivoId, imagesId: img && img.id || "" });
  }
  if (action === "videoIniciar") {
    const { entregableId, nombre, mime, bytes } = await request.json();
    const ent = await queryOne(db, "SELECT * FROM e_entregables WHERE id=?", [entregableId]);
    if (!ent) return err("Entregable no encontrado", 404);
    if (!esVideo(mime)) return err("Ese archivo no es un video", 400);
    const archivoId = uuid();
    const key = llaveR2(ent.e_entrega_id, archivoId, nombre || "video.mp4");
    const mp = await env.ENTREGAS_ORIGINALES.createMultipartUpload(key, {
      httpMetadata: { contentType: mime || "video/mp4" }
    });
    await run(
      db,
      `INSERT INTO e_archivos (id, e_entregable_id, e_entrega_id, nombre, bytes, mime,
        r2_key, orden, estado, fecha)
       VALUES (?,?,?,?,?,?,?,0,'subiendo',?)`,
      [
        archivoId,
        entregableId,
        ent.e_entrega_id,
        nombre || "video.mp4",
        bytes || 0,
        mime || "video/mp4",
        key,
        now()
      ]
    );
    return ok({ ok: true, archivoId, key, uploadId: mp.uploadId });
  }
  if (action === "videoParte") {
    const key = url.searchParams.get("key");
    const uploadId = url.searchParams.get("uploadId");
    const parte = Number(url.searchParams.get("parte"));
    if (!key || !uploadId || !Number.isFinite(parte)) return err("Datos incompletos");
    const mp = env.ENTREGAS_ORIGINALES.resumeMultipartUpload(key, uploadId);
    const r = await mp.uploadPart(parte, request.body);
    return ok({ ok: true, parte: r.partNumber, etag: r.etag });
  }
  if (action === "videoTerminar") {
    const { archivoId, key, uploadId, partes, ancho, alto } = await request.json();
    if (!archivoId || !key || !uploadId || !Array.isArray(partes)) return err("Datos incompletos");
    const mp = env.ENTREGAS_ORIGINALES.resumeMultipartUpload(key, uploadId);
    await mp.complete(partes.map((p) => ({ partNumber: p.parte, etag: p.etag })));
    let streamUid = "", customer = "";
    try {
      const f = await firmar(env, "origen:" + archivoId, 1800);
      const origen = `${baseEntregas(env)}/api/e/origen?a=${archivoId}&f=${encodeURIComponent(f)}`;
      const r = await copiarAStream(
        env,
        origen,
        `entrega-${archivoId}`,
        perfilWatermark(env, ancho, alto)
      );
      streamUid = r.uid;
      customer = r.customer;
    } catch (e) {
      console.error("copiarAStream fall\xF3", e.message);
    }
    await run(
      db,
      `UPDATE e_archivos SET estado='listo', stream_uid=?, ancho=?, alto=? WHERE id=?`,
      [streamUid, Number(ancho) || 0, Number(alto) || 0, archivoId]
    );
    const a = await queryOne(db, "SELECT e_entregable_id FROM e_archivos WHERE id=?", [archivoId]);
    if (a) await refrescarEntregable(db, a.e_entregable_id);
    return ok({ ok: true, streamUid, customer, conMarca: !!streamUid });
  }
  if (action === "borrarArchivo") {
    const { archivoId } = await request.json();
    const a = await queryOne(db, "SELECT * FROM e_archivos WHERE id=?", [archivoId]);
    if (!a) return err("Archivo no encontrado", 404);
    await borrarMediaDeEntrega(env, [a]);
    await run(db, "DELETE FROM e_archivos WHERE id=?", [archivoId]);
    await refrescarEntregable(db, a.e_entregable_id);
    return ok({ ok: true });
  }
  if (action === "listar") {
    const { results } = await query(db, "SELECT * FROM e_entregas ORDER BY fecha_creacion DESC");
    const lista = results || [];
    const salida = [];
    for (const e of lista) {
      const cliente = await resolverCliente(db, e.e_cliente_id);
      const items = await entregablesDe(db, e.id);
      const folio = await folioDeEntrega(db, e);
      const saldo = await saldoDeEntrega(db, e);
      salida.push({
        id: e.id,
        codigo: e.codigo,
        titulo: e.titulo,
        direccion: e.direccion,
        estado: e.estado,
        grupo: grupoDeEntrega(e.estado),
        cliente: cliente.nombre,
        folio,
        fechaSesion: e.fecha_sesion,
        fechaCreacion: e.fecha_creacion,
        fechaPublicada: e.fecha_publicada,
        fechaLiberada: e.fecha_liberada,
        fechaExpira: e.fecha_expira,
        diasRestantes: diasRestantes(e.fecha_expira, now()),
        saldo,
        pagadoManual: !!e.pagado_manual,
        entregables: items.map((i) => ({
          id: i.id,
          tipo: i.tipo,
          nombre: i.nombre,
          completo: !!i.completo,
          numArchivos: i.num_archivos
        })),
        completa: entregaCompleta(items),
        faltan: faltantes(items),
        rutaPublica: baseEntregas(env) + rutaPublica(folio, e.codigo)
      });
    }
    const ahora = now();
    return ok({
      ok: true,
      pendientes: ordenarEntregas(salida.filter((e) => e.grupo === "pendientes"), ahora),
      conCliente: ordenarEntregas(salida.filter((e) => e.grupo === "con_cliente"), ahora),
      liberadas: ordenarEntregas(salida.filter((e) => e.grupo === "liberadas"), ahora),
      historial: salida.filter((e) => e.grupo === "historial")
    });
  }
  if (action === "obtener") {
    const id = url.searchParams.get("id") || "";
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    const cliente = await resolverCliente(db, e.e_cliente_id);
    const items = await entregablesDe(db, e.id);
    const { results: archivos } = await query(
      db,
      "SELECT * FROM e_archivos WHERE e_entrega_id=? ORDER BY orden, rowid",
      [e.id]
    );
    const { results: eventos } = await query(
      db,
      "SELECT * FROM e_eventos WHERE e_entrega_id=? ORDER BY fecha DESC LIMIT 40",
      [e.id]
    );
    const folio = await folioDeEntrega(db, e);
    const saldo = await saldoDeEntrega(db, e);
    let precioTotal = null;
    if (e.contrato_token) {
      const c = await queryOne(db, "SELECT precio_total FROM contratos WHERE token=?", [e.contrato_token]);
      precioTotal = c ? c.precio_total : null;
    }
    return ok({
      ok: true,
      entrega: {
        ...e,
        folio,
        saldo,
        precioTotal,
        diasRestantes: diasRestantes(e.fecha_expira, now()),
        fechaLimite: e.fecha_expira ? fechaLegible(e.fecha_expira) : "",
        rutaPublica: baseEntregas(env) + rutaPublica(folio, e.codigo)
      },
      cliente,
      entregables: items,
      archivos: archivos || [],
      eventos: eventos || [],
      completa: entregaCompleta(items),
      faltan: faltantes(items)
    });
  }
  if (action === "buscarClientes") {
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) return ok({ ok: true, resultados: [] });
    const like = `%${q}%`;
    const { results: propios } = await query(
      db,
      `SELECT id, cliente_id, nombre, telefono FROM e_clientes
       WHERE cliente_id IS NULL AND nombre LIKE ? LIMIT 10`,
      [like]
    );
    const { results: admins } = await query(
      db,
      `SELECT id, nombre, telefono FROM clientes WHERE nombre LIKE ? LIMIT 10`,
      [like]
    );
    const salida = [];
    for (const p of propios || []) {
      salida.push({
        eClienteId: p.id,
        clienteId: "",
        nombre: p.nombre,
        telefono: p.telefono,
        origen: "entregas"
      });
    }
    for (const a of admins || []) {
      salida.push({
        eClienteId: "",
        clienteId: a.id,
        nombre: a.nombre,
        telefono: a.telefono,
        origen: "admin"
      });
    }
    return ok({ ok: true, resultados: salida });
  }
  if (action === "crear") {
    const b = await request.json();
    const { clienteId, eClienteId, nombreCliente, telefono, correo, titulo, direccion } = b;
    if (!titulo) return err("T\xEDtulo requerido");
    let eCli = null;
    if (clienteId) {
      eCli = await eClienteDeAdmin(db, clienteId);
    } else if (eClienteId) {
      eCli = await queryOne(db, "SELECT * FROM e_clientes WHERE id=?", [eClienteId]);
    } else if (nombreCliente) {
      const nid = uuid();
      await run(
        db,
        `INSERT INTO e_clientes (id, cliente_id, nombre, telefono, correo, origen, fecha_creacion)
         VALUES (?,NULL,?,?,?, 'manual', ?)`,
        [nid, nombreCliente, telefono || "", correo || "", now()]
      );
      eCli = await queryOne(db, "SELECT * FROM e_clientes WHERE id=?", [nid]);
    }
    if (!eCli) return err("Cliente requerido");
    const id = uuid();
    const codigo = await codigoLibre(db);
    await run(
      db,
      `INSERT INTO e_entregas (id, e_cliente_id, contrato_token, num_propiedad, codigo,
        titulo, direccion, estado, fecha_creacion)
       VALUES (?,?,NULL,NULL,?,?,?, 'borrador', ?)`,
      [id, eCli.id, codigo, titulo, direccion || "", now()]
    );
    const items = entregablesSembrados("", [], 1);
    await batch(db, items.map((it) => ({
      sql: `INSERT INTO e_entregables (id, e_entrega_id, tipo, nombre, orden, completo, valor)
            VALUES (?,?,?,?,?,0,'')`,
      params: [uuid(), id, it.tipo, it.nombre, it.orden]
    })));
    await evento(db, id, "creada", "Entrega suelta");
    return ok({ ok: true, id, codigo });
  }
  if (action === "actualizar") {
    const { id, titulo, direccion, tourUrl, diasVigencia } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    await run(
      db,
      `UPDATE e_entregas SET titulo=COALESCE(?,titulo), direccion=COALESCE(?,direccion),
       tour_url=COALESCE(?,tour_url), dias_vigencia=COALESCE(?,dias_vigencia) WHERE id=?`,
      [
        titulo ?? null,
        direccion ?? null,
        tourUrl ?? null,
        diasVigencia != null ? Number(diasVigencia) : null,
        id
      ]
    );
    return ok({ ok: true });
  }
  if (action === "agregarEntregable") {
    const { entregaId, tipo, nombre } = await request.json();
    if (!entregaId || !tipo || !nombre) return err("Datos incompletos");
    if (!["fotos", "video", "enlace"].includes(tipo)) return err("Tipo no v\xE1lido");
    const c = await queryOne(
      db,
      "SELECT COUNT(*) AS n FROM e_entregables WHERE e_entrega_id=?",
      [entregaId]
    );
    await run(
      db,
      `INSERT INTO e_entregables (id, e_entrega_id, tipo, nombre, orden, completo, valor)
       VALUES (?,?,?,?,?,0,'')`,
      [uuid(), entregaId, tipo, nombre, c && c.n || 0]
    );
    return ok({ ok: true });
  }
  if (action === "borrarEntregable") {
    const { entregableId } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregables WHERE id=?", [entregableId]);
    if (!e) return err("Entregable no encontrado", 404);
    await batch(db, [
      { sql: "DELETE FROM e_archivos WHERE e_entregable_id=?", params: [entregableId] },
      { sql: "DELETE FROM e_entregables WHERE id=?", params: [entregableId] }
    ]);
    return ok({ ok: true });
  }
  if (action === "guardarEnlace") {
    const { entregableId, valor } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregables WHERE id=?", [entregableId]);
    if (!e) return err("Entregable no encontrado", 404);
    if (e.tipo !== "enlace") return err("Ese entregable no es un enlace", 400);
    await run(db, "UPDATE e_entregables SET valor=? WHERE id=?", [String(valor || "").trim(), entregableId]);
    await refrescarEntregable(db, entregableId);
    if (/tour|360/i.test(e.nombre)) {
      await run(
        db,
        "UPDATE e_entregas SET tour_url=? WHERE id=?",
        [String(valor || "").trim(), e.e_entrega_id]
      );
    }
    return ok({ ok: true });
  }
  if (action === "publicar") {
    const { id } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    const items = await entregablesDe(db, e.id);
    if (!entregaCompleta(items)) {
      return err("Faltan entregables: " + faltantes(items).join(", "), 400);
    }
    const ts = now();
    await run(
      db,
      `UPDATE e_entregas SET estado='publicada', fecha_publicada=COALESCE(fecha_publicada,?) WHERE id=?`,
      [ts, id]
    );
    await evento(db, id, "publicada", "");
    const saldo = await saldoDeEntrega(db, e);
    if (debeLiberarAlPublicar(saldo, e.pagado_manual)) {
      const fresca = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
      const r = await liberar(db, fresca, "Ya estaba pagada al publicar");
      return ok({ ok: true, estado: "liberada", ...r });
    }
    return ok({ ok: true, estado: "publicada" });
  }
  if (action === "liberar") {
    const { id } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    if (e.estado === "borrador") return err("Publica la entrega antes de liberarla", 400);
    const r = await liberar(db, e, "Liberada a mano");
    return ok({ ok: true, estado: "liberada", ...r });
  }
  if (action === "marcarPagada") {
    const { id, pagada } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    const v = pagada ? 1 : 0;
    await run(db, "UPDATE e_entregas SET pagado_manual=? WHERE id=?", [v, id]);
    await evento(db, id, "pago", v ? "Marcada como pagada" : "Marca de pago retirada");
    if (v && e.estado === "publicada") {
      const fresca = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
      const r = await liberar(db, fresca, "Marcada como pagada");
      return ok({ ok: true, estado: "liberada", ...r });
    }
    return ok({ ok: true });
  }
  if (action === "extender") {
    const { id, dias } = await request.json();
    const n = Number(dias);
    if (!Number.isFinite(n) || n <= 0 || n > 365) return err("D\xEDas inv\xE1lidos", 400);
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    const desde = estaVencida(e.fecha_expira, now()) ? now() : e.fecha_expira;
    const base = new Date(desde).getTime();
    const nueva = calcularExpiracion(new Date(base).toISOString(), n);
    await run(
      db,
      `UPDATE e_entregas SET fecha_expira=?, estado=CASE WHEN estado='expirada' THEN 'liberada' ELSE estado END
       WHERE id=?`,
      [nueva, id]
    );
    await evento(db, id, "extendida", `+${n} d\xEDas`);
    return ok({ ok: true, fechaExpira: nueva, fechaLimite: fechaLegible(nueva) });
  }
  if (action === "pausar") {
    const { id, pausar } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    if (pausar) {
      await run(db, `UPDATE e_entregas SET estado='pausada', fecha_pausada=? WHERE id=?`, [now(), id]);
      await evento(db, id, "pausada", "");
      return ok({ ok: true, estado: "pausada" });
    }
    const destino = e.fecha_liberada ? "liberada" : "publicada";
    await run(db, `UPDATE e_entregas SET estado=?, fecha_pausada=NULL WHERE id=?`, [destino, id]);
    await evento(db, id, "reanudada", "");
    return ok({ ok: true, estado: destino });
  }
  if (action === "borrar") {
    const { id } = await request.json();
    const e = await queryOne(db, "SELECT * FROM e_entregas WHERE id=?", [id]);
    if (!e) return err("Entrega no encontrada", 404);
    await borrarEntregaCascada(db, id);
    return ok({ ok: true });
  }
  if (action === "sembrar") {
    const { token, todos } = await request.json();
    let tokens = [];
    if (token) {
      tokens = [token];
    } else if (todos) {
      const { results } = await query(
        db,
        `SELECT token FROM contratos WHERE estatus NOT IN ('Cancelado')
         ORDER BY fecha_creacion DESC LIMIT 200`
      );
      tokens = (results || []).map((r) => r.token);
    } else {
      return err("Falta token, o todos:true", 400);
    }
    let creadas = 0, contratos = 0, fallos = 0;
    for (const t of tokens) {
      const c = await queryOne(db, "SELECT * FROM contratos WHERE token=?", [t]);
      if (!c) {
        fallos++;
        continue;
      }
      const { results: props } = await query(
        db,
        "SELECT num_propiedad, direccion, fecha_sesion, paquete FROM propiedades WHERE contrato_token=? ORDER BY num_propiedad",
        [t]
      );
      if (!props || !props.length) continue;
      try {
        const r = await sembrarEntregasDeContrato(db, c, props);
        creadas += r.creadas;
        if (r.creadas) contratos++;
      } catch (e) {
        console.error("sembrar fall\xF3 para", t, e.message);
        fallos++;
      }
    }
    return ok({ ok: true, creadas, contratos, revisados: tokens.length, fallos });
  }
  if (action === "porExpirar") {
    const dias = Number(url.searchParams.get("dias") || 2);
    const { results } = await query(
      db,
      `SELECT * FROM e_entregas WHERE estado='liberada' AND fecha_expira IS NOT NULL`
    );
    const salida = [];
    for (const e of results || []) {
      const d = diasRestantes(e.fecha_expira, now());
      if (d == null || d > dias) continue;
      const cliente = await resolverCliente(db, e.e_cliente_id);
      salida.push({
        id: e.id,
        titulo: e.titulo,
        cliente: cliente.nombre,
        diasRestantes: d,
        fechaLimite: fechaLegible(e.fecha_expira)
      });
    }
    salida.sort((a, b) => a.diasRestantes - b.diasRestantes);
    return ok({ ok: true, entregas: salida });
  }
  if (action === "expirarAhora") {
    const r = await expirarEntregas(env);
    return ok({ ok: true, ...r });
  }
  if (action === "sinPagar") {
    const { results } = await query(
      db,
      `SELECT e.* FROM e_entregas e WHERE e.estado='publicada' ORDER BY e.fecha_publicada ASC`
    );
    const salida = [];
    for (const e of results || []) {
      const saldo = await saldoDeEntrega(db, e);
      if (saldo != null && saldo <= 0) continue;
      if (e.pagado_manual) continue;
      const cliente = await resolverCliente(db, e.e_cliente_id);
      const b = await queryOne(
        db,
        "SELECT COALESCE(SUM(bytes),0) AS total, COUNT(*) AS n FROM e_archivos WHERE e_entrega_id=?",
        [e.id]
      );
      const dias = Math.floor(
        (Date.now() - new Date(e.fecha_publicada || e.fecha_creacion).getTime()) / 864e5
      );
      salida.push({
        id: e.id,
        titulo: e.titulo,
        cliente: cliente.nombre,
        saldo,
        diasPublicada: dias,
        bytes: b && b.total || 0,
        archivos: b && b.n || 0
      });
    }
    return ok({ ok: true, entregas: salida });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleEntregas, "handleEntregas");

// src/routes/contratos.js
async function subirImagenCF(env, blob, nombre) {
  const form = new FormData();
  form.append("file", blob, nombre || "foto.jpg");
  const up = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
    { method: "POST", headers: { "Authorization": `Bearer ${env.CF_MEDIA_TOKEN}` }, body: form }
  );
  const uj = await up.json();
  if (uj && uj.success && uj.result && uj.result.id) {
    const hash = uj.result.variants && uj.result.variants[0] ? hashDeVariante(uj.result.variants[0]) : "";
    return { id: uj.result.id, hash };
  }
  return null;
}
__name(subirImagenCF, "subirImagenCF");
async function handleContratos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;
  if (action === "listarContratos") {
    const periodo = new URL(request.url).searchParams.get("periodo") || "abiertos";
    const { results } = await query(
      db,
      `SELECT c.*,
              COALESCE(p_dir.fecha_sesion, p1.fecha_sesion) AS fecha_sesion,
              COALESCE(p_dir.hora_sesion,  p1.hora_sesion)  AS hora_sesion,
              COALESCE(p_dir.direccion,    p1.direccion)    AS direccion
       FROM contratos c
       LEFT JOIN propiedades p1
         ON p1.contrato_token = c.token AND p1.num_propiedad = 1
       LEFT JOIN propiedades p_dir
         ON p_dir.contrato_token = c.token
         AND p_dir.direccion IS NOT NULL AND p_dir.direccion != ''
         AND p_dir.num_propiedad = (
           SELECT MIN(num_propiedad) FROM propiedades
           WHERE contrato_token = c.token AND direccion IS NOT NULL AND direccion != ''
         )
       WHERE c.oculto = 0
       ORDER BY c.fecha_creacion DESC`
    );
    const estatusAbiertos = ["Pendiente firma", "Firmado", "Reservado", "En produccion", "Entregado", "Completado"];
    const lista = periodo === "abiertos" ? results.filter((c) => estatusAbiertos.includes(c.estatus)) : results;
    return ok({ ok: true, contratos: lista });
  }
  if (action === "obtenerContrato") {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return err("Token requerido");
    const contrato = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [token]);
    if (!contrato) return err("Contrato no encontrado", 404);
    const { results: propiedades } = await query(
      db,
      "SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad",
      [token]
    );
    const { results: abonos } = await query(
      db,
      "SELECT * FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro",
      [token]
    );
    const totalAbonado = abonos.reduce((s, a) => s + (a.monto || 0), 0);
    const { results: paquetesOC } = await query(db, "SELECT clave, nombre FROM paquetes");
    const pkMapOC = Object.fromEntries(paquetesOC.map((r) => [r.clave, r.nombre]));
    const propiedadesConNombre = propiedades.map((p) => ({ ...p, paquete: pkMapOC[p.paquete] || p.paquete }));
    const primeraProp = propiedadesConNombre[0];
    const carpetaEntregablesUrl = primeraProp?.carpeta_entregables_id ? `https://drive.google.com/drive/folders/${primeraProp.carpeta_entregables_id}` : primeraProp?.carpeta_control_id ? `https://drive.google.com/drive/folders/${primeraProp.carpeta_control_id}` : null;
    return ok({ ok: true, contrato, propiedades: propiedadesConNombre, abonos, totalAbonado, carpetaEntregablesUrl });
  }
  if (action === "exportarCSV") {
    const { results } = await query(
      db,
      `SELECT token, folio, nombre_cliente, correo_cliente, telefono_cliente,
              paquete_base, precio_total, anticipo, saldo_pendiente, estatus, fecha_creacion
       FROM contratos WHERE oculto = 0 ORDER BY fecha_creacion DESC`
    );
    const { results: paquetesCSV } = await query(db, "SELECT clave, nombre FROM paquetes");
    const pkMapCSV = Object.fromEntries(paquetesCSV.map((r) => [r.clave, r.nombre]));
    const header = "Token,Folio,Cliente,Correo,Telefono,Paquete,Total,Anticipo,Saldo,Estatus,Fecha\n";
    const rows = results.map(
      (r) => [
        r.token,
        r.folio,
        r.nombre_cliente,
        r.correo_cliente,
        r.telefono_cliente,
        pkMapCSV[r.paquete_base] || r.paquete_base,
        r.precio_total,
        r.anticipo,
        r.saldo_pendiente,
        r.estatus,
        r.fecha_creacion
      ].map((v) => {
        const val = String(v ?? "").replace(/"/g, '""');
        return '"' + (/^[=+\-@]/.test(val) ? "'" + val : val) + '"';
      }).join(",")
    ).join("\n");
    return ok({ ok: true, csv: header + rows });
  }
  if (action === "crearContrato") {
    const body = await request.json();
    const {
      nombreCliente,
      correoCliente,
      telefonoCliente,
      tipoPaquete,
      paqueteBase,
      adicionales,
      extrasAcordados,
      precioTotal,
      anticipo,
      notasContrato,
      numPropiedades,
      propiedades: propsData,
      clienteId,
      trabajoId
    } = body;
    if (!nombreCliente) return err("Nombre del cliente requerido");
    if (!propsData || !propsData.length) return err("Al menos una propiedad es requerida");
    if (propsData.length > 20) return err("M\xE1ximo 20 propiedades por contrato");
    const totalNum = parseFloat(precioTotal) || 0;
    if (totalNum <= 0) return err("El precio total debe ser mayor a $0");
    const anticipoProvisto = anticipo !== void 0 && anticipo !== "";
    const anticipoRaw = anticipoProvisto ? parseFloat(anticipo) : 0;
    if (!Number.isFinite(anticipoRaw) || anticipoRaw < 0) return err("El anticipo no puede ser negativo");
    const anticNum = Math.min(anticipoRaw, totalNum);
    const prop1 = propsData[0];
    const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
    for (let vi = 0; vi < propsData.length; vi++) {
      const vp = propsData[vi];
      if (vp.fechaSesion && !fechaRe.test(vp.fechaSesion)) {
        return err("Formato de fecha inv\xE1lido en propiedad " + (vi + 1) + " (esperado YYYY-MM-DD)");
      }
      if (vp.entregables && vp.entregables.length > 2e3) {
        return err("Entregables de propiedad " + (vi + 1) + " exceden 2000 caracteres");
      }
    }
    if (!trabajoId) return err("trabajoId requerido para crear un contrato");
    const trabajoOrigen = await queryOne(
      db,
      "SELECT * FROM trabajos WHERE id=?",
      [trabajoId]
    );
    if (!trabajoOrigen) return err("Trabajo no encontrado", 404);
    if (!trabajoOrigen.token) return err("El trabajo no tiene token \u2014 guarda el trabajo primero", 400);
    const contratoExistente = await queryOne(db, "SELECT token FROM contratos WHERE token=?", [trabajoOrigen.token]);
    if (contratoExistente) return err("Este trabajo ya tiene un contrato", 409);
    const token = trabajoOrigen.token;
    const clienteIdFinal = trabajoOrigen.cliente_id;
    if (clienteId && clienteId !== clienteIdFinal) {
      return err("El clienteId no coincide con el cliente del trabajo", 409);
    }
    const paqueteBaseFinal = paqueteBase || prop1?.paquete || "";
    const tipoPaqueteFinal = tipoPaquete || prop1?.tipo || "";
    const paquete = await queryOne(db, "SELECT precio FROM paquetes WHERE clave = ?", [paqueteBaseFinal]);
    const precioBase = paquete?.precio ?? totalNum;
    const saldoPendiente = totalNum;
    const adicionalesOfrecidos = (adicionales || []).filter(Boolean);
    const extrasObjs = (extrasAcordados || []).map(
      (e) => e.clave ? { clave: e.clave, precio: e.precio } : { nombre: e.nombre, precio: e.precio }
    );
    const adicionalesJSON = JSON.stringify([...adicionalesOfrecidos, ...extrasObjs]);
    const tieneExpress = [...adicionalesOfrecidos, ...extrasObjs].some(
      (a) => a === "ADD-EXPRESS" || a && a.clave === "ADD-EXPRESS"
    );
    const folio = prop1.fechaSesion ? await asignarFolio(db, prop1.fechaSesion) : null;
    const portalToken = uuid();
    const portalExpira = new Date(Date.now() + 72 * 3600 * 1e3).toISOString();
    const creacionNow = now();
    const statements = [
      {
        sql: `INSERT INTO contratos (token, folio, nombre_cliente, correo_cliente, telefono_cliente, cliente_id,
	              tipo_contrato, tipo_paquete, paquete_base, adicionales_json, precio_base, precio_total,
	              anticipo, saldo_pendiente, estatus, fecha_creacion, num_propiedades, notas_contrato, entrega_express)
	              VALUES (?, ?, ?, ?, ?, ?, 'estandar', ?, ?, ?, ?, ?, ?, ?, 'Pendiente firma', ?, ?, ?, ?)`,
        params: [
          token,
          folio,
          nombreCliente,
          correoCliente || "",
          telefonoCliente || "",
          clienteIdFinal,
          tipoPaqueteFinal,
          paqueteBaseFinal,
          adicionalesJSON,
          precioBase,
          totalNum,
          anticNum,
          saldoPendiente,
          creacionNow,
          propsData.length,
          notasContrato || "",
          tieneExpress ? 1 : 0
        ]
      },
      ...propsData.map((p, i) => ({
        sql: `INSERT INTO propiedades (contrato_token, num_propiedad, tipo, paquete, entregables,
              fecha_sesion, hora_sesion, direccion, link_maps, orientacion, sobre_la_propiedad,
              referencias, fachada_url, perimetro_url, logo_url, datos_especificos,
              formato_video, ocultar_formato_video)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          token,
          i + 1,
          p.tipo || tipoPaqueteFinal,
          p.paquete || paqueteBaseFinal,
          p.entregables || "",
          p.fechaSesion || "",
          p.horaSesion || "",
          p.direccion || "",
          p.linkMaps || "",
          p.orientacion || "",
          p.sobreLaPropiedad || "",
          p.referencias || "",
          p.fachadaUrl || "",
          p.perimetroUrl || "",
          p.logoUrl || "",
          JSON.stringify(p.datosEspecificos || {}),
          p.formatoVideo || "vertical_nativo",
          p.ocultarFormatoVideo ?? 0
        ]
      })),
      {
        sql: "INSERT INTO tokens (token, contrato_id, tipo, expira, usado) VALUES (?, ?, ?, ?, 0)",
        params: [portalToken, token, "contrato", portalExpira]
      }
    ];
    const tsConv = now();
    statements.push(
      {
        sql: `UPDATE trabajos SET estatus='Pendiente firma', fecha_ultima_actividad=? WHERE id=?`,
        params: [tsConv, trabajoId]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [tsConv, clienteIdFinal]
      },
      {
        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
              VALUES (?, ?, ?, 'contrato_generado', ?, ?, '', ?)`,
        params: [uuid(), clienteIdFinal, trabajoId, "Contrato generado: " + token, tsConv.substring(0, 10), tsConv]
      }
    );
    await batch(db, statements);
    try {
      await sembrarEntregasDeContrato(
        db,
        {
          token,
          folio,
          cliente_id: clienteIdFinal,
          nombre_cliente: nombreCliente,
          adicionales_json: adicionalesJSON,
          paquete_base: paqueteBaseFinal
        },
        propsData.map((p, i) => ({
          num_propiedad: i + 1,
          direccion: p.direccion || "",
          fecha_sesion: p.fechaSesion || "",
          paquete: p.paquete || paqueteBaseFinal
        }))
      );
    } catch (e) {
      console.error("R129 sembrarEntregas fall\xF3 (contrato creado igual):", e.message);
    }
    const { results: paquetesNombres } = await query(db, "SELECT clave, nombre FROM paquetes");
    const pkMapNombres = Object.fromEntries(paquetesNombres.map((p) => [p.clave, p.nombre]));
    await callAdapterSync(env, "crearCarpetas", {
      token,
      folio,
      nombreCliente,
      propiedades: propsData.map((p, i) => ({
        numPropiedad: i + 1,
        tipo: p.tipo || tipoPaqueteFinal,
        paquete: pkMapNombres[p.paquete || paqueteBaseFinal] || p.paquete || paqueteBaseFinal,
        // El adapter usa la fecha de sesión para decidir la carpeta de año/mes.
        // Sin esto caía a "hoy" y creaba la carpeta en otro mes que procesarFirma → duplicados.
        fechaSesion: p.fechaSesion || ""
      }))
    });
    const linkPortal = `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`;
    return ok({ ok: true, token, folio, url: linkPortal, linkPortal });
  }
  if (action === "actualizarEstatus") {
    const { token, estatus, forzar } = await request.json();
    const ESTATUSES_VALIDOS2 = ["Pendiente firma", "Firmado", "Reservado", "En produccion", "Entregado", "Completado", "Cancelado"];
    if (!ESTATUSES_VALIDOS2.includes(estatus)) return err("Estatus no v\xE1lido");
    const c = await queryOne(db, "SELECT estatus FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    const TRANSICIONES_BLOQUEADAS = {
      "Pendiente firma": ["En produccion", "Entregado", "Completado"],
      "Firmado": ["Entregado", "Completado"],
      "Entregado": ["Pendiente firma", "Firmado", "Reservado"],
      "Completado": ["Pendiente firma", "Firmado", "Reservado", "En produccion"],
      "En produccion": ["Pendiente firma"],
      "Reservado": ["Pendiente firma"]
    };
    const forzarBool = forzar === true || forzar === "true" || forzar === 1;
    if (!forzarBool) {
      const bloqueados = TRANSICIONES_BLOQUEADAS[c.estatus] || [];
      if (bloqueados.includes(estatus)) {
        return new Response(JSON.stringify({
          ok: false,
          error: `Transici\xF3n bloqueada: ${c.estatus} \u2192 ${estatus}`,
          codigoError: "TRANSICION_BLOQUEADA",
          estatusActual: c.estatus
        }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
    }
    await run(db, "UPDATE contratos SET estatus=? WHERE token=?", [estatus, token]);
    await run(db, `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`, [estatus, (/* @__PURE__ */ new Date()).toISOString(), token]);
    return ok({ ok: true, estatus });
  }
  if (action === "actualizarContratoUpsell") {
    const body = await request.json();
    const {
      token,
      agregarAdicionales,
      serviciosLibres,
      ajustePrecioManual,
      nuevoPrecioTotal,
      nota,
      notificarCliente
    } = body;
    if (!token) return err("Token requerido");
    const c = await queryOne(db, "SELECT * FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    let adicionalesArr;
    try {
      adicionalesArr = JSON.parse(c.adicionales_json || "[]");
    } catch (e) {
      adicionalesArr = [];
    }
    const clavesExistentes = new Set(adicionalesArr.map((i) => typeof i === "string" ? i : i.clave).filter(Boolean));
    let precioFinal = c.precio_total;
    if (Array.isArray(agregarAdicionales)) {
      for (const clave of agregarAdicionales) {
        if (!clave || clavesExistentes.has(clave)) continue;
        adicionalesArr.push(clave);
        const p = await queryOne(db, "SELECT precio FROM paquetes WHERE clave=?", [clave]);
        if (p) precioFinal += p.precio;
      }
    }
    if (Array.isArray(serviciosLibres)) {
      for (const svc of serviciosLibres) {
        if (!svc?.nombre || (svc?.precio === void 0 || svc?.precio === null)) continue;
        adicionalesArr.push({ nombre: String(svc.nombre).trim(), precio: parseFloat(svc.precio) || 0 });
        precioFinal += parseFloat(svc.precio) || 0;
      }
    }
    if (ajustePrecioManual !== void 0 && ajustePrecioManual !== null)
      precioFinal += parseFloat(ajustePrecioManual) || 0;
    if (nuevoPrecioTotal !== void 0 && nuevoPrecioTotal !== null && nuevoPrecioTotal !== "")
      precioFinal = parseFloat(nuevoPrecioTotal) || 0;
    if (precioFinal < 0) precioFinal = 0;
    const { results: abonosArr } = await query(db, "SELECT monto FROM abonos WHERE contrato_token=?", [token]);
    const totalAbonado = abonosArr.reduce((s, a) => s + (a.monto || 0), 0);
    let nuevoAnticipo = c.anticipo;
    if (precioFinal !== c.precio_total && c.precio_total > 0 && c.anticipo < c.precio_total) {
      const pct = c.anticipo / c.precio_total;
      nuevoAnticipo = Math.round(precioFinal * pct);
    }
    const saldoNuevo = Math.max(0, precioFinal - totalAbonado);
    const ESTATUSES_AVANZADOS = ["En produccion", "Entregado"];
    let estatusNuevo = c.estatus;
    if (saldoNuevo === 0) {
      estatusNuevo = "Completado";
    } else if (saldoNuevo > 0 && c.estatus === "Completado") {
      estatusNuevo = "Reservado";
    }
    if (ESTATUSES_AVANZADOS.includes(c.estatus) && estatusNuevo !== "Completado") {
      estatusNuevo = c.estatus;
    }
    const stamp = now();
    const partes = [];
    if (agregarAdicionales?.length) partes.push("cat\xE1logo: " + agregarAdicionales.join(", "));
    if (serviciosLibres?.length) partes.push("libres: " + serviciosLibres.map((s) => s.nombre + " +" + s.precio).join(", "));
    if (ajustePrecioManual) partes.push("ajuste manual: +" + ajustePrecioManual);
    if (precioFinal !== c.precio_total) partes.push("precio " + c.precio_total + " \u2192 " + precioFinal);
    if (nota) partes.push(String(nota).trim());
    const nuevasNotas = partes.length ? (c.notas_internas ? c.notas_internas + "\n" : "") + "[" + stamp + "] " + partes.join(" \xB7 ") : c.notas_internas;
    const expressActualizado = adicionalesArr.some(
      (a) => a === "ADD-EXPRESS" || a && a.clave === "ADD-EXPRESS"
    ) ? 1 : 0;
    await run(
      db,
      "UPDATE contratos SET precio_total=?, saldo_pendiente=?, anticipo=?, adicionales_json=?, notas_internas=?, estatus=?, entrega_express=? WHERE token=?",
      [precioFinal, saldoNuevo, nuevoAnticipo, JSON.stringify(adicionalesArr), nuevasNotas, estatusNuevo, expressActualizado, token]
    );
    if (estatusNuevo) {
      await run(
        db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
        [estatusNuevo, (/* @__PURE__ */ new Date()).toISOString(), token]
      );
    }
    if (notificarCliente && c.correo_cliente) {
      const { results: paquetesUp } = await query(db, "SELECT clave, nombre FROM paquetes");
      const pkMapUp = Object.fromEntries(paquetesUp.map((r) => [r.clave, r.nombre]));
      callAdapter(ctx, env, "notificarUpsell", {
        token,
        nombreCliente: c.nombre_cliente,
        correoCliente: c.correo_cliente,
        folio: c.folio,
        serviciosLibres,
        agregarAdicionales: (agregarAdicionales || []).map((cl) => pkMapUp[cl] || cl),
        precioFinal,
        saldoNuevo,
        linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
      });
    }
    return ok({ ok: true, precioTotal: precioFinal, saldoPendiente: saldoNuevo, estatus: estatusNuevo });
  }
  if (action === "marcarSesionCompletada") {
    const { token } = await request.json();
    const c = await queryOne(db, "SELECT estatus FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    if (!["Firmado", "Reservado", "En produccion"].includes(c.estatus)) {
      return err("Estatus no permite esta acci\xF3n");
    }
    const ts = now();
    await run(
      db,
      "UPDATE contratos SET estatus='En produccion', sesion_completada=? WHERE token=?",
      [ts, token]
    );
    await run(
      db,
      "UPDATE trabajos SET estatus='En produccion', fecha_ultima_actividad=? WHERE token=?",
      [ts, token]
    );
    return ok({ ok: true });
  }
  if (action === "guardarNotasInternas") {
    const { token, notas } = await request.json();
    await run(db, "UPDATE contratos SET notas_internas=? WHERE token=?", [notas, token]);
    return ok({ ok: true });
  }
  if (action === "guardarProduccion") {
    const { token, fotografiaLista, videoListo, recorridoListo, recorridoUrl, tieneRecorrido } = await request.json();
    await run(
      db,
      "UPDATE contratos SET fotografia_lista=?, video_listo=?, recorrido_listo=?, recorrido_url=?, tiene_recorrido=? WHERE token=?",
      [fotografiaLista ?? null, videoListo ?? null, recorridoListo ?? null, recorridoUrl || "", tieneRecorrido === false ? 0 : 1, token]
    );
    return ok({ ok: true });
  }
  if (action === "guardarEntrega") {
    const { token, entregaDriveLink, entregaLinksExtra } = await request.json();
    const c = await queryOne(db, "SELECT * FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    const estatusEntrega = c.saldo_pendiente <= 0 ? "Completado" : "Entregado";
    const tsEntrega = now();
    await run(
      db,
      `UPDATE contratos SET entrega_drive_link=?, entrega_links_extra=?, estatus=?, fecha_entrega=? WHERE token=?`,
      [entregaDriveLink, entregaLinksExtra || "", estatusEntrega, tsEntrega, token]
    );
    await run(
      db,
      `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
      [estatusEntrega, tsEntrega, token]
    );
    if (c.correo_cliente) {
      callAdapter(ctx, env, "enviarCorreoEntrega", {
        token,
        nombreCliente: c.nombre_cliente,
        correoCliente: c.correo_cliente,
        folio: c.folio,
        linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
      });
    }
    return ok({ ok: true });
  }
  if (action === "prepararEntrega") {
    const { token, continuar } = await request.json();
    if (!token) return err("Token requerido");
    const c = await queryOne(db, "SELECT * FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    let man = {};
    try {
      man = JSON.parse(c.entrega_manifiesto_json || "{}");
    } catch (e) {
      man = {};
    }
    if (!continuar) {
      const prop = await queryOne(
        db,
        "SELECT carpeta_entregables_id, direccion FROM propiedades WHERE contrato_token=? ORDER BY num_propiedad LIMIT 1",
        [token]
      );
      if (!prop || !prop.carpeta_entregables_id) return err("No hay carpeta de Entregables registrada para este trabajo", 400);
      let lista;
      try {
        lista = await callAdapterSync(env, "prepararCarpetaEntrega", { carpetaEntregablesId: prop.carpeta_entregables_id });
      } catch (e) {
        await run(db, `UPDATE contratos SET entrega_media_estado='error' WHERE token=?`, [token]);
        return err("No se pudo leer la carpeta de entrega: " + e.message, 502);
      }
      man = {
        fotos: [],
        pendientes: (lista.fotos || []).filter(esFotoWeb).map((f) => ({ id: f.id, nombre: f.nombre })),
        videoWebId: lista.videoWeb && lista.videoWeb.id || "",
        destacadoId: "",
        imagesHash: man.imagesHash || "",
        streamCustomer: man.streamCustomer || "",
        propiedadNombre: c.nombre_cliente || "",
        propiedadUbicacion: prop.direccion || ""
      };
      await run(
        db,
        `UPDATE contratos SET entrega_manifiesto_json=?, entrega_media_estado='migrando',
           entrega_textos_json=COALESCE(entrega_textos_json, ?),
           entrega_config_estado=COALESCE(entrega_config_estado,'borrador') WHERE token=?`,
        [JSON.stringify(man), JSON.stringify({ redes: "", anuncio: "" }), token]
      );
    }
    man.fotos = man.fotos || [];
    man.pendientes = man.pendientes || [];
    const BATCH = 8;
    const lote = man.pendientes.slice(0, BATCH);
    for (const f of lote) {
      try {
        const r = await fetch(`https://drive.google.com/uc?export=download&id=${f.id}`);
        if (r.ok) {
          const sub = await subirImagenCF(env, await r.blob(), f.nombre);
          if (sub) {
            man.fotos.push({ id: sub.id, nombre: f.nombre });
            if (!man.imagesHash) man.imagesHash = sub.hash;
          }
        }
      } catch (e) {
        console.error("migrar foto fall\xF3", f.id, e.message);
      }
    }
    man.pendientes = man.pendientes.slice(lote.length);
    if (!man.destacadoId && man.fotos.length) man.destacadoId = man.fotos[0].id;
    const done = man.pendientes.length === 0;
    let videoProveedor = c.entrega_video_proveedor || "";
    let videoId = c.entrega_video_id || "";
    if (done && man.videoWebId && videoProveedor !== "stream") {
      try {
        const resp = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/copy`,
          {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.CF_MEDIA_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: `https://drive.google.com/uc?export=download&id=${man.videoWebId}`, meta: { name: `entrega-${token}` } })
          }
        );
        const j = await resp.json();
        if (j && j.success && j.result && j.result.uid) {
          videoProveedor = "stream";
          videoId = j.result.uid;
          const mm = String(j.result.preview || j.result.thumbnail || "").match(/(customer-[^.]+)\./);
          if (mm) man.streamCustomer = mm[1];
        }
      } catch (e) {
        console.error("subir video a Stream fall\xF3", e.message);
      }
    }
    const total = man.fotos.length + man.pendientes.length;
    if (done) {
      delete man.pendientes;
      delete man.videoWebId;
    }
    await run(
      db,
      `UPDATE contratos SET entrega_manifiesto_json=?, entrega_video_proveedor=?, entrega_video_id=?,
         entrega_media_estado=? WHERE token=?`,
      [JSON.stringify(man), videoProveedor, videoId, done ? "listo" : "migrando", token]
    );
    return ok({ ok: true, done, migradas: man.fotos.length, total, video: videoProveedor === "stream" ? videoId : "" });
  }
  if (action === "guardarConfigEntrega") {
    const { token, textos, destacadoId, videoProveedor, videoId, tour360Url } = await request.json();
    if (!token) return err("Token requerido");
    const c = await queryOne(db, "SELECT entrega_manifiesto_json FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    let man = {};
    try {
      man = JSON.parse(c.entrega_manifiesto_json || "{}");
    } catch (e) {
    }
    if (destacadoId !== void 0) man.destacadoId = destacadoId;
    await run(
      db,
      `UPDATE contratos SET entrega_manifiesto_json=?, entrega_textos_json=?,
         entrega_video_proveedor=COALESCE(NULLIF(?, ''), entrega_video_proveedor),
         entrega_video_id=COALESCE(NULLIF(?, ''), entrega_video_id),
         recorrido_url=COALESCE(NULLIF(?, ''), recorrido_url) WHERE token=?`,
      [JSON.stringify(man), JSON.stringify(textos || {}), videoProveedor || "", videoId || "", tour360Url || "", token]
    );
    return ok({ ok: true });
  }
  if (action === "publicarEntrega") {
    const { token } = await request.json();
    if (!token) return err("Token requerido");
    await run(db, `UPDATE contratos SET entrega_config_estado='publicado' WHERE token=?`, [token]);
    return ok({ ok: true });
  }
  if (action === "agregarFotoEntrega") {
    const { token, nombre, mimeType, base64 } = await request.json();
    if (!token || !base64) return err("Datos incompletos");
    const c = await queryOne(db, "SELECT entrega_manifiesto_json FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    let man = {};
    try {
      man = JSON.parse(c.entrega_manifiesto_json || "{}");
    } catch (e) {
    }
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const sub = await subirImagenCF(env, new Blob([bytes], { type: mimeType || "image/jpeg" }), nombre);
    if (!sub) return err("La imagen fue rechazada por Cloudflare Images", 502);
    man.fotos = man.fotos || [];
    man.fotos.push({ id: sub.id, nombre: nombre || "" });
    if (!man.imagesHash) man.imagesHash = sub.hash;
    if (!man.destacadoId) man.destacadoId = sub.id;
    await run(
      db,
      `UPDATE contratos SET entrega_manifiesto_json=?, entrega_media_estado='listo',
         entrega_config_estado=COALESCE(entrega_config_estado,'borrador') WHERE token=?`,
      [JSON.stringify(man), token]
    );
    return ok({ ok: true, foto: { id: sub.id, nombre: nombre || "" } });
  }
  if (action === "iniciarSubidaVideo") {
    const { token } = await request.json();
    if (!token) return err("Token requerido");
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.CF_MEDIA_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ maxDurationSeconds: 3600, requireSignedURLs: false, meta: { name: `entrega-${token}` } })
      }
    );
    const j = await resp.json();
    if (!j || !j.success || !j.result) return err("No se pudo iniciar la subida a Stream", 502);
    return ok({ ok: true, uploadURL: j.result.uploadURL, uid: j.result.uid });
  }
  if (action === "confirmarVideoEntrega") {
    const { token, uid } = await request.json();
    if (!token || !uid) return err("Datos incompletos");
    const c = await queryOne(db, "SELECT entrega_manifiesto_json FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    let man = {};
    try {
      man = JSON.parse(c.entrega_manifiesto_json || "{}");
    } catch (e) {
    }
    try {
      const g = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`,
        { headers: { "Authorization": `Bearer ${env.CF_MEDIA_TOKEN}` } }
      );
      const gj = await g.json();
      const mm = String(gj.result && gj.result.preview || "").match(/(customer-[^.]+)\./);
      if (mm) man.streamCustomer = mm[1];
    } catch (e) {
      console.error("confirmarVideo getStream fall\xF3", e.message);
    }
    await run(
      db,
      `UPDATE contratos SET entrega_video_proveedor='stream', entrega_video_id=?, entrega_manifiesto_json=? WHERE token=?`,
      [uid, JSON.stringify(man), token]
    );
    return ok({ ok: true });
  }
  if (action === "previewEntrega") {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return err("Token requerido");
    const c = await queryOne(db, "SELECT * FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    return ok(payloadEntrega(c, env));
  }
  if (action === "revocarEntrega") {
    const { token, revocar } = await request.json();
    if (revocar) {
      const cr = await queryOne(db, "SELECT estatus, saldo_pendiente FROM contratos WHERE token=?", [token]);
      if (!cr) return err("Contrato no encontrado", 404);
      const estatusRevocado = cr.saldo_pendiente <= 0 ? "Completado" : "En produccion";
      const tsRev = now();
      await run(
        db,
        `UPDATE contratos SET entrega_revocada=?, estatus=? WHERE token=?`,
        [tsRev, estatusRevocado, token]
      );
      await run(
        db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
        [estatusRevocado, tsRev, token]
      );
    } else {
      const cr = await queryOne(db, "SELECT saldo_pendiente FROM contratos WHERE token=?", [token]);
      if (!cr) return err("Contrato no encontrado", 404);
      const estatusRestaurado = cr.saldo_pendiente <= 0 ? "Completado" : "Entregado";
      const tsRes = now();
      await run(
        db,
        `UPDATE contratos SET entrega_revocada=NULL, estatus=? WHERE token=?`,
        [estatusRestaurado, token]
      );
      await run(
        db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
        [estatusRestaurado, tsRes, token]
      );
    }
    return ok({ ok: true });
  }
  if (action === "guardarCaracteristicas") {
    const body = await request.json();
    const { token, numPropiedad } = body;
    const texto = body.sobreLaPropiedad ?? body.caracteristicas ?? "";
    await run(
      db,
      "UPDATE propiedades SET sobre_la_propiedad=? WHERE contrato_token=? AND num_propiedad=?",
      [texto, token, numPropiedad]
    );
    return ok({ ok: true });
  }
  if (action === "guardarNotaPropiedad") {
    const { token, numPropiedad, nota } = await request.json();
    await run(
      db,
      "UPDATE propiedades SET nota_interna=? WHERE contrato_token=? AND num_propiedad=?",
      [nota, token, numPropiedad]
    );
    return ok({ ok: true });
  }
  if (action === "guardarFormatoPropiedad") {
    const { token, numPropiedad, formatoVideo, ocultarFormatoVideo } = await request.json();
    await run(
      db,
      "UPDATE propiedades SET formato_video=?, ocultar_formato_video=? WHERE contrato_token=? AND num_propiedad=?",
      [formatoVideo || "vertical_nativo", ocultarFormatoVideo ? 1 : 0, token, numPropiedad]
    );
    return ok({ ok: true });
  }
  if (action === "ocultarContrato") {
    const { token } = await request.json();
    await run(db, "UPDATE contratos SET oculto=1 WHERE token=?", [token]);
    return ok({ ok: true });
  }
  if (action === "reservarContrato") {
    const { token } = await request.json();
    if (!token) return err("Token requerido");
    const contrato = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [token]);
    if (!contrato) return err("Contrato no encontrado", 404);
    if (contrato.estatus !== "Firmado") {
      return err("Solo se puede apartar la fecha de un contrato firmado y a\xFAn sin reservar.", 409);
    }
    await run(db, "UPDATE contratos SET estatus = ? WHERE token = ?", ["Reservado", token]);
    const trabajoRes = await queryOne(db, "SELECT id, cliente_id FROM trabajos WHERE token=?", [token]);
    if (trabajoRes) {
      await run(
        db,
        "UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE id=?",
        ["Reservado", now(), trabajoRes.id]
      );
      const clienteRes = await queryOne(
        db,
        "SELECT nombre, telefono FROM clientes WHERE id=?",
        [trabajoRes.cliente_id]
      );
      callAdapter(ctx, env, "crearEventoReservado", {
        trabajoId: trabajoRes.id,
        token,
        nombreCliente: contrato.nombre_cliente,
        telefono: clienteRes?.telefono || "",
        equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${token}`
      });
    }
    callAdapter(ctx, env, "enviarCorreoReserva", {
      token,
      nombreCliente: contrato.nombre_cliente,
      correoCliente: contrato.correo_cliente,
      folio: contrato.folio,
      saldoPendiente: contrato.saldo_pendiente,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });
    return ok({ ok: true, estatus: "Reservado" });
  }
  if (action === "eliminarContrato") {
    const { token } = await request.json();
    try {
      await borrarEntregasDeContrato(db, token);
    } catch (e) {
      console.error("R129 borrarEntregasDeContrato fall\xF3:", e.message);
    }
    const ts = now();
    await batch(db, [
      { sql: `UPDATE trabajos SET estatus='En cotizacion', contrato_token='', fecha_ultima_actividad=? WHERE contrato_token=?`, params: [ts, token] },
      { sql: "DELETE FROM revisiones_video WHERE contrato_id=?", params: [token] },
      { sql: "DELETE FROM checklist WHERE contrato_token=?", params: [token] },
      { sql: "DELETE FROM propiedades WHERE contrato_token=?", params: [token] },
      { sql: "DELETE FROM abonos WHERE contrato_token=?", params: [token] },
      { sql: "DELETE FROM tokens WHERE contrato_id=?", params: [token] },
      { sql: "DELETE FROM contratos WHERE token=?", params: [token] }
    ]);
    return ok({ ok: true });
  }
  if (action === "reagendarPropiedad") {
    const { token, numPropiedad, fecha, hora } = await request.json();
    if (!token || !numPropiedad || !fecha) return err("Faltan campos requeridos");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return err("Formato de fecha inv\xE1lido (esperado YYYY-MM-DD)");
    const c = await queryOne(db, "SELECT * FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    const p = await queryOne(
      db,
      "SELECT * FROM propiedades WHERE contrato_token=? AND num_propiedad=?",
      [token, numPropiedad]
    );
    if (!p) return err("Propiedad no encontrada", 404);
    const folioAnterior = c.folio;
    let folioNuevo = folioAnterior;
    if (parseInt(numPropiedad) === 1) {
      folioNuevo = await asignarFolio(db, fecha);
    }
    const horaFinal = hora || p.hora_sesion;
    const statements = [{
      sql: "UPDATE propiedades SET fecha_sesion=?, hora_sesion=? WHERE contrato_token=? AND num_propiedad=?",
      params: [fecha, horaFinal, token, numPropiedad]
    }];
    if (parseInt(numPropiedad) === 1) {
      statements.push({
        sql: "UPDATE contratos SET folio=? WHERE token=?",
        params: [folioNuevo, token]
      });
    }
    await batch(db, statements);
    const { results: paquetesRe } = await query(db, "SELECT clave, nombre FROM paquetes");
    const pkMapRe = Object.fromEntries(paquetesRe.map((r) => [r.clave, r.nombre]));
    callAdapter(ctx, env, "reagendarPropiedad", {
      token,
      numPropiedad,
      fecha,
      hora: horaFinal,
      folioAnterior,
      folioNuevo,
      contrato: { ...c, folio: folioNuevo, paquete_base: pkMapRe[c.paquete_base] || c.paquete_base },
      propiedad: { ...p, paquete: pkMapRe[p.paquete] || p.paquete }
    });
    return ok({ ok: true });
  }
  if (action === "enviarRecordatorio") {
    const { token } = await request.json();
    const c = await queryOne(db, "SELECT * FROM contratos WHERE token=?", [token]);
    if (!c) return err("Contrato no encontrado", 404);
    callAdapter(ctx, env, "enviarRecordatorioPago", {
      token,
      nombreCliente: c.nombre_cliente,
      correoCliente: c.correo_cliente,
      folio: c.folio,
      saldoPendiente: c.saldo_pendiente,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });
    return ok({ ok: true });
  }
  if (action === "actualizarCarpeta") {
    const { token, numPropiedad, carpetaControlId, carpetaEntregablesId } = await request.json();
    const sets = [];
    const params = [];
    if (carpetaControlId) {
      sets.push("carpeta_control_id=?");
      params.push(carpetaControlId);
    }
    if (carpetaEntregablesId) {
      sets.push("carpeta_entregables_id=?");
      params.push(carpetaEntregablesId);
    }
    if (!sets.length) return err("Nada que actualizar");
    params.push(token, numPropiedad);
    await run(
      db,
      `UPDATE propiedades SET ${sets.join(", ")} WHERE contrato_token=? AND num_propiedad=?`,
      params
    );
    return ok({ ok: true });
  }
  if (action === "actualizarCalendarEvent") {
    const { token, numPropiedad, calendarEventId } = await request.json();
    await run(
      db,
      "UPDATE propiedades SET calendar_event_id=? WHERE contrato_token=? AND num_propiedad=?",
      [calendarEventId, token, numPropiedad]
    );
    return ok({ ok: true });
  }
  if (action === "actualizarPdfUrl") {
    const { token, pdfUrl } = await request.json();
    await run(db, "UPDATE contratos SET pdf_contrato_url=?, firma_base64_url=NULL WHERE token=?", [pdfUrl, token]);
    return ok({ ok: true });
  }
  if (action === "actualizarExpress") {
    const { token, express } = await request.json();
    if (!token) return err("Token requerido");
    const result = await run(db, "UPDATE contratos SET entrega_express=? WHERE token=?", [express ? 1 : 0, token]);
    if (!result.meta?.changes) return err("Contrato no encontrado", 404);
    return ok({ ok: true });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleContratos, "handleContratos");

// src/routes/abonos.js
async function handleAbonos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;
  if (action === "registrarAbono") {
    const body = await request.json();
    const { token, monto, metodo, fecha, notas } = body;
    if (!token || !monto) return err("Token y monto requeridos");
    const contrato = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [token]);
    if (!contrato) return err("Contrato no encontrado", 404);
    if (contrato.estatus === "Pendiente firma") {
      return new Response(JSON.stringify({
        ok: false,
        error: "El contrato a\xFAn no ha sido firmado. No se puede registrar un abono.",
        codigoError: "REQUIERE_FIRMA"
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const exceso = monto - contrato.saldo_pendiente;
    if (!body.permitirExceso && exceso > 0.5) {
      return new Response(JSON.stringify({
        ok: false,
        error: "El monto excede el saldo pendiente.",
        codigoError: "EXCEDE_SALDO",
        saldoActual: contrato.saldo_pendiente,
        precioActual: contrato.precio_total,
        montoIntentado: monto,
        nuevoPrecioPropuesto: contrato.precio_total + exceso
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const { results: abonosPrevios } = await query(
      db,
      "SELECT id, monto FROM abonos WHERE contrato_token = ?",
      [token]
    );
    const esPrimerAbono = abonosPrevios.length === 0;
    await run(
      db,
      "INSERT INTO abonos (id, contrato_token, monto, metodo, fecha, fecha_registro, notas) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uuid(), token, monto, metodo || "", fecha || now().slice(0, 10), now(), notas || ""]
    );
    const nuevoSaldo = Math.max(0, contrato.saldo_pendiente - monto);
    const nuevoPrecioTotal = exceso > 0.5 ? contrato.precio_total + exceso : contrato.precio_total;
    const ESTATUSES_AVANZADOS = ["En produccion", "Entregado", "Completado"];
    let nuevoEstatus;
    if (nuevoSaldo === 0) {
      nuevoEstatus = "Completado";
    } else if (ESTATUSES_AVANZADOS.includes(contrato.estatus)) {
      nuevoEstatus = contrato.estatus;
    } else {
      nuevoEstatus = "Reservado";
    }
    const seActivaReservado = nuevoEstatus === "Reservado" && contrato.estatus !== "Reservado";
    await run(
      db,
      "UPDATE contratos SET saldo_pendiente = ?, precio_total = ?, estatus = ?, fecha_ultimo_abono = ? WHERE token = ?",
      [nuevoSaldo, nuevoPrecioTotal, nuevoEstatus, now(), token]
    );
    if (nuevoSaldo === 0) {
      try {
        await liberarPorPago(db, token);
      } catch (e) {
        console.error("R129 liberarPorPago fall\xF3 (abono registrado igual):", e.message);
      }
    }
    const trabajoAbono = await queryOne(
      db,
      "SELECT id, cliente_id FROM trabajos WHERE token=?",
      [token]
    );
    if (trabajoAbono) {
      await run(
        db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE id=?`,
        [nuevoEstatus, now(), trabajoAbono.id]
      );
      if (seActivaReservado) {
        const clienteAbono = await queryOne(
          db,
          "SELECT nombre, telefono FROM clientes WHERE id=?",
          [trabajoAbono.cliente_id]
        );
        callAdapter(ctx, env, "crearEventoReservado", {
          trabajoId: trabajoAbono.id,
          token,
          nombreCliente: contrato.nombre_cliente,
          telefono: clienteAbono?.telefono || "",
          equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${token}`
        });
      }
    }
    callAdapter(ctx, env, "enviarCorreoAbono", {
      token,
      nombreCliente: contrato.nombre_cliente,
      correoCliente: contrato.correo_cliente,
      folio: contrato.folio,
      monto,
      metodo: metodo || "Transferencia",
      nuevoSaldo,
      anticipo: contrato.anticipo,
      precioTotal: nuevoPrecioTotal,
      // El mensaje "Tu sesión está apartada" se usa solo si ESTE abono es el que
      // recién reserva el contrato. Si ya estaba Reservado (p. ej. por "Apartar
      // fecha" desde admin, que ya mandó ese correo), seActivaReservado es false
      // y el correo cae en "Confirmación de pago" — así no se repite el aviso.
      esPrimerAbono: seActivaReservado,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });
    const totalAbonado = abonosPrevios.reduce((s, a) => s + (a.monto || 0), 0) + monto;
    return ok({ ok: true, nuevoSaldo, estatus: nuevoEstatus, totalAbonado, precioTotal: nuevoPrecioTotal });
  }
  if (action === "listarAbonos") {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return err("Token requerido");
    const { results } = await query(
      db,
      "SELECT * FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro",
      [token]
    );
    return ok(results);
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleAbonos, "handleAbonos");

// src/routes/paquetes.js
async function handlePaquetes(request, env, ctx, action) {
  const db = env.DB;
  if (action === "listarPaquetes") {
    const tipo = new URL(request.url).searchParams.get("tipo") || "";
    let sql = "SELECT * FROM paquetes WHERE activo = 1";
    const params = [];
    if (tipo) {
      sql += " AND (tipo = ? OR tipo = 'Ambos')";
      params.push(tipo);
    }
    sql += " ORDER BY orden";
    const { results } = await query(db, sql, params);
    return ok({ ok: true, paquetes: results });
  }
  if (action === "listarPaquetesTodos") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const { results } = await query(db, "SELECT * FROM paquetes ORDER BY orden");
    return ok({ ok: true, paquetes: results });
  }
  if (action === "crearPaquete") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave, tipo, nombre, precio, esAdicional, entregables, orden } = body;
    if (!clave || !tipo || !nombre || precio == null) return err("Faltan campos requeridos");
    await run(
      db,
      "INSERT INTO paquetes (clave, tipo, nombre, precio, es_adicional, entregables, activo, orden) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
      [clave, tipo, nombre, precio, esAdicional ? 1 : 0, entregables || "", orden || 0]
    );
    return ok({ ok: true });
  }
  if (action === "editarPaquete") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave, tipo, nombre, precio, esAdicional, entregables, orden } = body;
    await run(
      db,
      "UPDATE paquetes SET tipo=?, nombre=?, precio=?, es_adicional=?, entregables=?, orden=? WHERE clave=?",
      [tipo, nombre, precio, esAdicional ? 1 : 0, entregables || "", orden || 0, clave]
    );
    return ok({ ok: true });
  }
  if (action === "togglePaquete") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave } = body;
    const p = await queryOne(db, "SELECT activo FROM paquetes WHERE clave = ?", [clave]);
    if (!p) return err("Paquete no encontrado", 404);
    const nuevoActivo = body.activo !== void 0 ? body.activo ? 1 : 0 : p.activo ? 0 : 1;
    await run(db, "UPDATE paquetes SET activo = ? WHERE clave = ?", [nuevoActivo, clave]);
    return ok({ ok: true });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handlePaquetes, "handlePaquetes");

// src/routes/stats.js
async function handleStats(request, env, ctx) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;
  const periodo = new URL(request.url).searchParams.get("periodo") || "mes";
  const PERIODOS_VALIDOS = ["mes", "trimestre", "anio", "todo"];
  if (!PERIODOS_VALIDOS.includes(periodo)) return err("Periodo no v\xE1lido", 400);
  const ahora = /* @__PURE__ */ new Date();
  let desde = null;
  if (periodo === "mes") desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  else if (periodo === "trimestre") desde = new Date(ahora.getFullYear(), Math.floor(ahora.getMonth() / 3) * 3, 1);
  else if (periodo === "anio") desde = new Date(ahora.getFullYear(), 0, 1);
  const [{ results: contratos }, { results: abonos }] = await Promise.all([
    desde ? query(db, "SELECT * FROM contratos WHERE oculto = 0 AND fecha_creacion >= ?", [desde.toISOString()]) : query(db, "SELECT * FROM contratos WHERE oculto = 0"),
    desde ? query(db, "SELECT * FROM abonos WHERE fecha_registro >= ?", [desde.toISOString()]) : query(db, "SELECT * FROM abonos")
  ]);
  const facturado = contratos.reduce((s, c) => s + (c.precio_total || 0), 0);
  const cobrado = abonos.reduce((s, a) => s + (a.monto || 0), 0);
  const porCobrar = contratos.reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const ticketPromedio = contratos.length ? facturado / contratos.length : 0;
  const porEstatus = {};
  contratos.forEach((c) => {
    porEstatus[c.estatus] = (porEstatus[c.estatus] || 0) + 1;
  });
  const clienteMap = {};
  contratos.forEach((c) => {
    const key = c.correo_cliente || c.nombre_cliente || "sin-correo";
    if (!clienteMap[key]) clienteMap[key] = { contratos: 0, total: 0, nombre: c.nombre_cliente };
    clienteMap[key].contratos++;
    clienteMap[key].total += c.precio_total || 0;
  });
  const topClientes = Object.entries(clienteMap).map(([correo, v]) => ({ nombre: v.nombre, correo, ...v })).sort((a, b) => b.total - a.total).slice(0, 5);
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, total: 0 });
  }
  contratos.forEach((c) => {
    const key = (c.fecha_creacion || "").slice(0, 7);
    const m = meses.find((m2) => m2.mes === key);
    if (m) m.total += c.precio_total || 0;
  });
  const { results: todosTrabajos } = await query(
    db,
    `SELECT t.estatus,
            COALESCE(p1.fecha_sesion, '') AS fecha_sesion
     FROM trabajos t
     LEFT JOIN contratos ct ON ct.token = t.token
     LEFT JOIN propiedades p1 ON p1.contrato_token = t.token AND p1.num_propiedad = 1
     WHERE t.estatus != 'Cancelado'`
  );
  const hoy = (/* @__PURE__ */ new Date()).toISOString().substring(0, 10);
  const GRUPOS = {
    prospectos: ["Nuevo", "En cotizacion"],
    por_firmar: ["Pendiente firma", "Firmado"],
    confirmados: ["Reservado", "En produccion", "Entregado", "Completado"]
  };
  const contadoresGrupo = {
    prospectos: todosTrabajos.filter((t) => GRUPOS.prospectos.includes(t.estatus)).length,
    por_firmar: todosTrabajos.filter((t) => GRUPOS.por_firmar.includes(t.estatus)).length,
    confirmados: todosTrabajos.filter((t) => GRUPOS.confirmados.includes(t.estatus)).length
  };
  const sesionesHoy = todosTrabajos.filter(
    (t) => GRUPOS.confirmados.includes(t.estatus) && t.fecha_sesion && t.fecha_sesion.substring(0, 10) === hoy
  ).length;
  return ok({
    ok: true,
    periodo,
    numContratos: contratos.length,
    facturado,
    cobrado,
    porCobrar,
    ticketPromedio,
    porEstatus,
    topClientes,
    meses,
    contadoresGrupo,
    sesionesHoy
  });
}
__name(handleStats, "handleStats");

// src/routes/checklist.js
async function archivar(db, token, cuartos, rev, autor) {
  try {
    await batch(db, [
      { sql: "INSERT INTO checklist_historial (contrato_token, cuartos_json, rev, autor, fecha) VALUES (?, ?, ?, ?, ?)", params: [token, cuartos, rev, autor || null, now()] },
      { sql: "DELETE FROM checklist_historial WHERE contrato_token = ? AND id NOT IN (SELECT id FROM checklist_historial WHERE contrato_token = ? ORDER BY id DESC LIMIT 50)", params: [token, token] }
    ]);
  } catch (e) {
    console.error("archivar checklist_historial fallo:", e.message);
  }
}
__name(archivar, "archivar");
var COLUMNAS_DEFAULT = { foto: true, video: true, t360: true };
function extraerIdDrive(url) {
  const s = String(url || "");
  const m = s.match(/\/d\/([^/?&]+)/) || s.match(/[?&]id=([^&]+)/);
  return m ? m[1] : "";
}
__name(extraerIdDrive, "extraerIdDrive");
async function datosNegocio(db, token) {
  const out = {};
  const prop = await queryOne(
    db,
    "SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad LIMIT 1",
    [token]
  );
  if (!prop) return out;
  const carpetaId = prop.carpeta_entregables_id || "";
  const carpetaCtrl = prop.carpeta_control_id || "";
  if (carpetaId || carpetaCtrl) {
    out.entrega = {
      carpetaEntregablesId: carpetaId || null,
      carpetaEntregablesUrl: carpetaId ? "https://drive.google.com/drive/folders/" + carpetaId : "https://drive.google.com/drive/folders/" + carpetaCtrl,
      carpetaControlId: carpetaCtrl || null
    };
  }
  let todos = [];
  if (prop.logos_json) {
    try {
      const parsed = JSON.parse(prop.logos_json);
      if (Array.isArray(parsed)) {
        todos = parsed.map((l) => ({ id: l.id || l.fileId || extraerIdDrive(l.url || ""), nombre: l.nombre || l.name || "logo" })).filter((l) => l.id);
      }
    } catch (_) {
    }
  }
  if (!todos.length && prop.logo_url) {
    const id = extraerIdDrive(prop.logo_url);
    if (id) todos = [{ id, nombre: "logo" }];
  }
  if (todos.length) {
    out.logo = { url: "https://drive.google.com/uc?export=download&id=" + todos[0].id, todos };
  }
  let paquete = prop.paquete || "";
  if (paquete) {
    const pk = await queryOne(db, "SELECT nombre FROM paquetes WHERE clave = ?", [paquete]);
    if (pk && pk.nombre) paquete = pk.nombre;
  }
  if (paquete || prop.entregables) {
    out.negocio = { paquete: paquete || "", entregablesTexto: prop.entregables || "" };
  }
  return out;
}
__name(datosNegocio, "datosNegocio");
var TEMPLATE_CUARTOS = JSON.stringify({
  cuartos: [
    { nombre: "Sala", foto: false, video: false, t360: false },
    { nombre: "Comedor", foto: false, video: false, t360: false },
    { nombre: "Cocina", foto: false, video: false, t360: false },
    { nombre: "Rec\xE1mara principal", foto: false, video: false, t360: false },
    { nombre: "Rec\xE1mara 2", foto: false, video: false, t360: false },
    { nombre: "Ba\xF1o principal", foto: false, video: false, t360: false },
    { nombre: "Exterior / Jard\xEDn", foto: false, video: false, t360: false },
    { nombre: "Garage", foto: false, video: false, t360: false }
  ],
  columnas: COLUMNAS_DEFAULT
});
function migrarFormato(data) {
  if (data && !Array.isArray(data) && data.cuartos) return data;
  if (Array.isArray(data)) {
    return {
      cuartos: data.map((c) => ({
        nombre: c.nombre,
        foto: c.completado || false,
        video: c.completado || false,
        t360: c.completado || false
      })),
      columnas: COLUMNAS_DEFAULT
    };
  }
  return JSON.parse(TEMPLATE_CUARTOS);
}
__name(migrarFormato, "migrarFormato");
async function handleChecklist(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || (request.method === "POST" ? (await request.clone().json()).token : null);
  if (!token) return err("Token requerido");
  const contrato = await queryOne(db, "SELECT token, folio, nombre_cliente FROM contratos WHERE token = ?", [token]);
  if (!contrato) return err("Contrato no v\xE1lido", 403);
  if (action === "obtenerChecklist") {
    const row = await queryOne(db, "SELECT * FROM checklist WHERE contrato_token = ?", [token]);
    const negocio = await datosNegocio(db, token);
    const base = { token, folio: contrato.folio || "", nombreCliente: contrato.nombre_cliente || "", ...negocio };
    if (!row) {
      const parsed2 = JSON.parse(TEMPLATE_CUARTOS);
      return ok({ ...base, ...parsed2, esTemplate: true, rev: 0 });
    }
    const parsed = migrarFormato(JSON.parse(row.cuartos_json));
    return ok({ ...base, ...parsed, esTemplate: false, rev: row.rev || 0 });
  }
  if (action === "guardarChecklist") {
    const body = await request.json();
    const data = { cuartos: body.cuartos || [], columnas: body.columnas || COLUMNAS_DEFAULT };
    const cuartos = JSON.stringify(data);
    const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : null;
    const existe = await queryOne(db, "SELECT rev FROM checklist WHERE contrato_token = ?", [token]);
    if (!existe) {
      try {
        await run(
          db,
          "INSERT INTO checklist (contrato_token, cuartos_json, rev, fecha_creacion, fecha_actualizacion) VALUES (?, ?, 1, ?, ?)",
          [token, cuartos, now(), now()]
        );
        await archivar(db, token, cuartos, 1, body.autor);
        return ok({ ok: true, rev: 1 });
      } catch (_) {
        const fila2 = await queryOne(db, "SELECT cuartos_json, rev FROM checklist WHERE contrato_token = ?", [token]);
        const parsed2 = migrarFormato(JSON.parse(fila2.cuartos_json));
        return ok({ conflict: true, ...parsed2, rev: fila2.rev || 0 });
      }
    }
    const res = baseRev === null ? { meta: { changes: 0 } } : await run(
      db,
      "UPDATE checklist SET cuartos_json = ?, rev = rev + 1, fecha_actualizacion = ? WHERE contrato_token = ? AND rev = ?",
      [cuartos, now(), token, baseRev]
    );
    if (res && res.meta && res.meta.changes === 1) {
      await archivar(db, token, cuartos, baseRev + 1, body.autor);
      return ok({ ok: true, rev: baseRev + 1 });
    }
    const fila = await queryOne(db, "SELECT cuartos_json, rev FROM checklist WHERE contrato_token = ?", [token]);
    const parsed = migrarFormato(JSON.parse(fila.cuartos_json));
    return ok({ conflict: true, ...parsed, rev: fila.rev || 0 });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleChecklist, "handleChecklist");

// src/routes/archivos.js
async function handleArchivos(request, env, ctx, action) {
  const db = env.DB;
  if (action === "subirArchivoCliente") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clienteId, base64, mimeType, nombre, esLogo } = body;
    if (!clienteId) return err("clienteId requerido");
    if (!base64) return err("Archivo requerido");
    const cliente = await queryOne(db, "SELECT id, nombre, carpeta_cliente_id FROM clientes WHERE id=?", [clienteId]);
    if (!cliente) return err("Cliente no encontrado", 404);
    const result = await callAdapterSync(env, "subirArchivoCliente", {
      clienteId,
      nombreCliente: cliente.nombre || "",
      carpetaClienteId: cliente.carpeta_cliente_id || "",
      base64,
      mimeType,
      nombre,
      esLogo: !!esLogo
    });
    if (result && result.error) return err(result.error);
    try {
      const sets = [], params = [];
      if (result?.carpetaClienteId) {
        sets.push("carpeta_cliente_id=?");
        params.push(result.carpetaClienteId);
      }
      if (esLogo && result?.url) {
        sets.push("logo_url=?");
        params.push(result.url);
      }
      if (sets.length) {
        params.push(clienteId);
        await run(db, `UPDATE clientes SET ${sets.join(", ")} WHERE id=?`, params);
      }
    } catch (e) {
    }
    return ok({ ok: true, url: result?.url || "", esLogo: !!esLogo, carpetaClienteId: result?.carpetaClienteId || "" });
  }
  if (action === "listarArchivosCliente") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const url = new URL(request.url);
    const clienteId = url.searchParams.get("clienteId");
    if (!clienteId) return err("clienteId requerido");
    let cliente = null;
    try {
      cliente = await queryOne(db, "SELECT id, nombre, logo_url, carpeta_cliente_id FROM clientes WHERE id=?", [clienteId]);
    } catch (e) {
      cliente = await queryOne(db, "SELECT id, nombre FROM clientes WHERE id=?", [clienteId]);
    }
    if (!cliente) return err("Cliente no encontrado", 404);
    let archivos = [];
    if (cliente.carpeta_cliente_id) {
      const result = await callAdapterSync(env, "listarArchivosCliente", {
        clienteId,
        carpetaClienteId: cliente.carpeta_cliente_id
      });
      if (result && Array.isArray(result.archivos)) archivos = result.archivos;
    }
    return ok({ ok: true, archivos, logoUrl: cliente.logo_url || "" });
  }
  if (action === "subirArchivo") {
    const body = await request.json();
    const { token, base64, mimeType, nombre, numPropiedad } = body;
    if (!token) return err("Token requerido");
    const contrato = await queryOne(
      db,
      "SELECT token, folio, nombre_cliente FROM contratos WHERE token = ?",
      [token]
    );
    if (!contrato) return err("Contrato no encontrado", 404);
    const keyHeader = request.headers.get("X-Admin-Key");
    const isAdmin = keyHeader === env.ADMIN_KEY;
    if (!isAdmin) {
      const tk = await queryOne(
        db,
        "SELECT * FROM tokens WHERE contrato_id = ? AND tipo = 'contrato' AND usado = 0",
        [token]
      );
      if (!tk) return err("No autorizado. Usa el enlace de tu portal.", 403);
      if (tk.expira && new Date(tk.expira) < /* @__PURE__ */ new Date()) return err("Tu enlace ha expirado.", 403);
    }
    const prop = await queryOne(
      db,
      "SELECT carpeta_control_id, fecha_sesion FROM propiedades WHERE contrato_token = ? AND num_propiedad = ?",
      [token, numPropiedad || 1]
    );
    const result = await callAdapterSync(env, "subirArchivo", {
      token,
      base64,
      mimeType,
      nombre,
      numPropiedad,
      carpetaId: prop?.carpeta_control_id || null,
      folio: contrato.folio || "",
      nombreCliente: contrato.nombre_cliente || "",
      fechaSesion: prop?.fecha_sesion || ""
    });
    return ok(result);
  }
  if (action === "subirArchivoAdmin") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { token, base64, mimeType, nombre, numPropiedad } = body;
    if (!token) return err("Token requerido");
    if (!base64) return err("Archivo requerido");
    const prop = await queryOne(
      db,
      "SELECT carpeta_control_id FROM propiedades WHERE contrato_token = ? AND num_propiedad = ?",
      [token, numPropiedad || 1]
    );
    let carpetaId = prop?.carpeta_control_id || null;
    if (!carpetaId) {
      let cli = null;
      try {
        cli = await queryOne(
          db,
          `SELECT c.carpeta_cliente_id FROM contratos ct
           JOIN clientes c ON c.id = ct.cliente_id WHERE ct.token=?`,
          [token]
        );
      } catch (e) {
      }
      if (cli?.carpeta_cliente_id) carpetaId = cli.carpeta_cliente_id;
    }
    if (!carpetaId) {
      return err("La carpeta del proyecto a\xFAn no existe (el contrato debe estar firmado y procesado por el adapter). Tambi\xE9n puedes subir el archivo al expediente del cliente.");
    }
    const result = await callAdapterSync(env, "subirArchivoAdmin", {
      carpetaId,
      base64,
      mimeType,
      nombre
    });
    if (result && result.error) return err(result.error);
    return ok(result);
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleArchivos, "handleArchivos");

// src/routes/revision.js
async function handleRevision(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || (request.method === "POST" ? (await request.clone().json()).token : null);
  if (!token) return err("Token requerido");
  const contrato = await queryOne(
    db,
    "SELECT token, folio, nombre_cliente, entrega_drive_link, entrega_links_extra FROM contratos WHERE token = ?",
    [token]
  );
  if (!contrato) return err("Token no v\xE1lido", 403);
  if (action === "obtenerRevision") {
    const { results: revisiones } = await query(
      db,
      "SELECT id, minuto_segundo, descripcion_ajuste, fecha FROM revisiones_video WHERE contrato_id = ? ORDER BY id",
      [token]
    );
    return ok({
      ok: true,
      folio: contrato.folio || "",
      nombreCliente: contrato.nombre_cliente || "",
      videoUrl: contrato.entrega_drive_link || "",
      linksExtra: contrato.entrega_links_extra || "",
      revisiones
    });
  }
  if (action === "guardarRevision") {
    const body = await request.json();
    const { revisiones } = body;
    if (!Array.isArray(revisiones) || !revisiones.length) return err("Sin revisiones");
    const fecha = now();
    const revisionesInsertadas = revisiones.map((r) => ({
      minuto_segundo: (r.minuto_segundo || "").trim(),
      descripcion_ajuste: (r.descripcion_ajuste || "").trim()
    })).filter((r) => r.descripcion_ajuste);
    if (revisionesInsertadas.length === 0) return err("Agrega al menos una nota con descripci\xF3n");
    await batch(db, revisionesInsertadas.map((r) => ({
      sql: "INSERT INTO revisiones_video (contrato_id, minuto_segundo, descripcion_ajuste, fecha) VALUES (?, ?, ?, ?)",
      params: [token, r.minuto_segundo, r.descripcion_ajuste, fecha]
    })));
    callAdapter(ctx, env, "notificarRevision", {
      token,
      folio: contrato.folio,
      nombreCliente: contrato.nombre_cliente,
      revisiones: revisionesInsertadas
    });
    return ok({ ok: true });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleRevision, "handleRevision");

// src/routes/equipo.js
async function handleEquipo(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);
  if (action === "obtenerEquipo") {
    const token = url.searchParams.get("token");
    if (!token) return err("Token requerido");
    const trabajo = await queryOne(db, "SELECT * FROM trabajos WHERE token = ?", [token]);
    const contrato = await queryOne(db, "SELECT * FROM contratos WHERE token = ?", [token]);
    if (!trabajo && !contrato) return err("Token no encontrado", 404);
    const clienteId = trabajo?.cliente_id || contrato?.cliente_id || "";
    const cliente = clienteId ? await queryOne(db, "SELECT * FROM clientes WHERE id = ?", [clienteId]) : null;
    const trabajoId = trabajo?.id || "";
    const { results: actividades } = trabajoId ? await query(
      db,
      `SELECT * FROM actividades WHERE trabajo_id = ?
           ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 50`,
      [trabajoId]
    ) : { results: [] };
    const propiedades = contrato ? (await query(
      db,
      "SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad",
      [token]
    )).results : [];
    const { results: todosLosPaquetes } = await query(db, "SELECT clave, nombre FROM paquetes");
    const pkMap = Object.fromEntries(todosLosPaquetes.map((p) => [p.clave, p.nombre]));
    const adicionales = JSON.parse(contrato?.adicionales_json || "[]");
    const acordados = adicionales.filter((i) => typeof i === "object" && i.precio && !i.ofrecido);
    const extrasAcordados = acordados.map((i) => ({
      nombre: i.nombre || pkMap[i.clave] || i.clave,
      precio: i.precio || 0
    }));
    return ok({
      ok: true,
      token,
      // Trabajo / cotización
      trabajoId,
      estatus: trabajo?.estatus || contrato?.estatus || "",
      interes: trabajo?.interes || "",
      ubicacion: trabajo?.ubicacion || "",
      paquetesCotizados: JSON.parse(trabajo?.paquetes_cotizados_json || "[]"),
      portafolioLinks: JSON.parse(trabajo?.portafolio_links_json || "[]"),
      propiedadesInteres: JSON.parse(trabajo?.propiedades_interes_json || "[]"),
      notasCotizacion: trabajo?.notas || "",
      // Cliente
      cliente: cliente ? {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        correo: cliente.correo,
        inmobiliaria: cliente.inmobiliaria || "",
        origen: cliente.origen || ""
      } : null,
      // Actividades
      actividades,
      // Contrato (si existe)
      tieneContrato: !!contrato,
      folio: contrato?.folio || "",
      nombreCliente: contrato?.nombre_cliente || cliente?.nombre || "",
      telefonoCliente: contrato?.telefono_cliente || cliente?.telefono || "",
      entregaExpress: contrato?.entrega_express ? 1 : 0,
      paqueteBase: pkMap[contrato?.paquete_base] || contrato?.paquete_base || "",
      fotografiaLista: contrato?.fotografia_lista || null,
      videoListo: contrato?.video_listo || null,
      recorridoListo: contrato?.recorrido_listo || null,
      recorridoUrl: contrato?.recorrido_url || "",
      tieneRecorrido: contrato?.tiene_recorrido === 0 ? 0 : 1,
      extrasAcordados,
      propiedades: propiedades.map((p) => ({
        numPropiedad: p.num_propiedad,
        tipo: p.tipo,
        paquete: pkMap[p.paquete] || p.paquete,
        entregables: p.entregables,
        fechaSesion: p.fecha_sesion,
        horaSesion: p.hora_sesion,
        direccion: p.direccion,
        linkMaps: p.link_maps,
        referencias: p.referencias,
        sobreLaPropiedad: p.sobre_la_propiedad,
        fachadaUrl: p.fachada_url,
        requiereAcceso: p.requiere_acceso ? 1 : 0,
        datosAcceso: JSON.parse(p.datos_especificos || "{}").acceso || null,
        formatoVideo: p.formato_video || "vertical_nativo",
        carpetaControlId: p.carpeta_control_id || "",
        carpetaEntregablesId: p.carpeta_entregables_id || ""
      }))
    });
  }
  if (action === "marcarProduccion") {
    const body = await request.json();
    const { token, fotografiaLista, videoListo, recorridoListo, recorridoUrl, tieneRecorrido } = body;
    if (!token) return err("Token requerido");
    const contrato = await queryOne(db, "SELECT token FROM contratos WHERE token = ?", [token]);
    if (!contrato) return err("Contrato no encontrado", 404);
    const sets = [];
    const vals = [];
    if (fotografiaLista !== void 0) {
      sets.push("fotografia_lista=?");
      vals.push(fotografiaLista ? now() : null);
    }
    if (videoListo !== void 0) {
      sets.push("video_listo=?");
      vals.push(videoListo ? now() : null);
    }
    if (recorridoListo !== void 0) {
      sets.push("recorrido_listo=?");
      vals.push(recorridoListo ? now() : null);
    }
    if (recorridoUrl !== void 0) {
      sets.push("recorrido_url=?");
      vals.push(recorridoUrl || "");
    }
    if (tieneRecorrido !== void 0) {
      sets.push("tiene_recorrido=?");
      vals.push(tieneRecorrido ? 1 : 0);
    }
    if (!sets.length) return err("Nada que actualizar");
    vals.push(token);
    await run(db, `UPDATE contratos SET ${sets.join(", ")} WHERE token=?`, vals);
    await run(db, `UPDATE trabajos SET fecha_ultima_actividad=? WHERE token=?`, [now(), token]);
    return ok({ ok: true });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleEquipo, "handleEquipo");

// src/routes/clientes.js
async function handleClientes(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;
  if (action === "crearCliente") {
    const body = await request.json();
    const { nombre, telefono, correo, origen, notasPerfil, inmobiliaria } = body;
    if (!nombre) return err("Nombre requerido");
    const id = uuid();
    await run(
      db,
      `INSERT INTO clientes (id, nombre, telefono, correo, origen, notas_perfil, inmobiliaria, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nombre, telefono || "", correo || "", origen || "", notasPerfil || "", inmobiliaria || "", now()]
    );
    return ok({ ok: true, id });
  }
  if (action === "listarClientes") {
    const { results } = await query(
      db,
      `WITH clientes_base AS (
         SELECT cl.id, cl.nombre,
                CASE WHEN cl.telefono != '' THEN cl.telefono
                     ELSE COALESCE((SELECT ct.telefono_cliente FROM contratos ct WHERE ct.cliente_id = cl.id AND ct.telefono_cliente != '' ORDER BY ct.fecha_creacion DESC LIMIT 1), '')
                END AS telefono,
                CASE WHEN cl.correo != '' THEN cl.correo
                     ELSE COALESCE((SELECT ct.correo_cliente FROM contratos ct WHERE ct.cliente_id = cl.id AND ct.correo_cliente != '' ORDER BY ct.fecha_creacion DESC LIMIT 1), '')
                END AS correo,
                cl.origen, cl.notas_perfil, cl.inmobiliaria, cl.fecha_creacion, cl.fecha_ultima_actividad
         FROM clientes cl
         UNION ALL
         SELECT '' AS id, ct.nombre_cliente AS nombre, MAX(ct.telefono_cliente) AS telefono,
                ct.correo_cliente AS correo, 'contrato' AS origen, '' AS notas_perfil,
                '' AS inmobiliaria,
                MIN(ct.fecha_creacion) AS fecha_creacion, MAX(ct.fecha_creacion) AS fecha_ultima_actividad
         FROM contratos ct
         WHERE ct.oculto = 0
           AND IFNULL(ct.cliente_id, '') = ''
           AND ct.correo_cliente != ''
           AND NOT EXISTS (SELECT 1 FROM clientes c2 WHERE c2.correo = ct.correo_cliente)
         GROUP BY ct.correo_cliente
       )
       SELECT c.*,
              c.id AS cliente_id,
              c.nombre AS nombre_cliente,
              c.telefono AS telefono_cliente,
              c.correo AS correo_cliente,
              (SELECT COUNT(*) FROM trabajos t
               WHERE t.cliente_id = c.id
               AND t.estatus IN ('Nuevo','En cotizacion','Pendiente firma','Firmado')) AS trabajos_activos,
              CASE WHEN c.id = ''
                THEN (SELECT COUNT(*) FROM contratos ct WHERE ct.correo_cliente = c.correo AND ct.oculto = 0)
                ELSE (SELECT COUNT(*) FROM contratos ct
                      WHERE ct.oculto = 0
                        AND (ct.cliente_id = c.id
                          OR (c.correo != '' AND IFNULL(ct.cliente_id, '') = '' AND ct.correo_cliente = c.correo)))
              END AS num_contratos,
              CASE WHEN c.id = ''
                THEN (SELECT MAX(ct.fecha_creacion) FROM contratos ct WHERE ct.correo_cliente = c.correo AND ct.oculto = 0)
                ELSE (SELECT MAX(ct.fecha_creacion) FROM contratos ct
                      WHERE ct.oculto = 0
                        AND (ct.cliente_id = c.id
                          OR (c.correo != '' AND IFNULL(ct.cliente_id, '') = '' AND ct.correo_cliente = c.correo)))
              END AS ultimo_contrato,
              CASE WHEN c.id = ''
                THEN (SELECT COALESCE(SUM(ct.precio_total), 0) FROM contratos ct WHERE ct.correo_cliente = c.correo AND ct.oculto = 0)
                ELSE (SELECT COALESCE(SUM(ct.precio_total), 0) FROM contratos ct
                      WHERE ct.oculto = 0
                        AND (ct.cliente_id = c.id
                          OR (c.correo != '' AND IFNULL(ct.cliente_id, '') = '' AND ct.correo_cliente = c.correo)))
              END AS total_facturado
       FROM clientes_base c
       ORDER BY CASE WHEN c.fecha_ultima_actividad = '' OR c.fecha_ultima_actividad IS NULL
                THEN c.fecha_creacion ELSE c.fecha_ultima_actividad END DESC`
    );
    return ok({ ok: true, clientes: results });
  }
  if (action === "obtenerCliente") {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return err("id requerido");
    const cliente = await queryOne(db, "SELECT * FROM clientes WHERE id = ?", [id]);
    if (!cliente) return err("Cliente no encontrado", 404);
    const { results: trabajos } = await query(
      db,
      "SELECT * FROM trabajos WHERE cliente_id = ? ORDER BY fecha_creacion DESC",
      [id]
    );
    const { results: contratos } = await query(
      db,
      `SELECT token, folio, estatus, precio_total, saldo_pendiente, fecha_creacion
       FROM contratos
       WHERE oculto = 0
         AND (cliente_id = ? OR (? != '' AND IFNULL(cliente_id, '') = '' AND correo_cliente = ?))
       ORDER BY fecha_creacion DESC`,
      [id, cliente.correo || "", cliente.correo || ""]
    );
    const { results: actividades } = await query(
      db,
      `SELECT * FROM actividades WHERE cliente_id = ?
       ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 50`,
      [id]
    );
    return ok({ ok: true, cliente, trabajos, contratos, actividades });
  }
  if (action === "buscarClientePorTelefono") {
    const url = new URL(request.url);
    let tel = url.searchParams.get("telefono");
    if (!tel && request.method === "POST") {
      const body = await request.json();
      tel = body.telefono;
    }
    const norm = normalizarTel(tel);
    if (!norm) return ok({ ok: true, cliente: null });
    const { results } = await query(
      db,
      `SELECT id, nombre, telefono, correo, sin_anticipo, anticipo_default, logo_url
       FROM clientes WHERE telefono != ''`
    );
    const match = results.find((c) => normalizarTel(c.telefono) === norm) || null;
    return ok({ ok: true, cliente: match });
  }
  if (action === "actualizarCliente") {
    const body = await request.json();
    const {
      id,
      nombre,
      telefono,
      correo,
      origen,
      notasPerfil,
      inmobiliaria,
      _soloInmobiliaria,
      sinAnticipo,
      anticipoDefault,
      logoUrl
    } = body;
    if (!id) return err("id requerido");
    if (_soloInmobiliaria) {
      await run(db, `UPDATE clientes SET inmobiliaria=? WHERE id=?`, [inmobiliaria || "", id]);
      return ok({ ok: true });
    }
    if (body._soloPreferencias) {
      try {
        const sets = [], params = [];
        if (sinAnticipo !== void 0) {
          sets.push("sin_anticipo=?");
          params.push(sinAnticipo ? 1 : 0);
        }
        if (anticipoDefault !== void 0) {
          sets.push("anticipo_default=?");
          params.push(anticipoDefault === null || anticipoDefault === "" ? null : Number(anticipoDefault));
        }
        if (logoUrl !== void 0) {
          sets.push("logo_url=?");
          params.push(logoUrl || "");
        }
        if (!sets.length) return ok({ ok: true });
        params.push(id);
        await run(db, `UPDATE clientes SET ${sets.join(", ")} WHERE id=?`, params);
      } catch (e) {
        return err("No se pudo guardar preferencia (\xBFmigraci\xF3n r58 pendiente?). " + e.message);
      }
      return ok({ ok: true });
    }
    if (!nombre) return err("Nombre requerido");
    try {
      await run(
        db,
        `UPDATE clientes SET nombre=?, telefono=?, correo=?, origen=?, notas_perfil=?, inmobiliaria=?,
         sin_anticipo=?, anticipo_default=? WHERE id=?`,
        [
          nombre,
          telefono || "",
          correo || "",
          origen || "",
          notasPerfil || "",
          inmobiliaria || "",
          sinAnticipo ? 1 : 0,
          anticipoDefault === void 0 || anticipoDefault === null || anticipoDefault === "" ? null : Number(anticipoDefault),
          id
        ]
      );
    } catch (e) {
      await run(
        db,
        `UPDATE clientes SET nombre=?, telefono=?, correo=?, origen=?, notas_perfil=?, inmobiliaria=? WHERE id=?`,
        [nombre, telefono || "", correo || "", origen || "", notasPerfil || "", inmobiliaria || "", id]
      );
    }
    return ok({ ok: true });
  }
  if (action === "borrarCliente") {
    const body = await request.json();
    const { id } = body;
    if (!id) return err("id requerido");
    const conContrato = await queryOne(
      db,
      `SELECT token FROM contratos WHERE cliente_id = ? LIMIT 1`,
      [id]
    );
    if (conContrato) return err("El cliente tiene contratos. Elim\xEDnalos primero.");
    await batch(db, [
      { sql: "DELETE FROM trabajos WHERE cliente_id = ?", params: [id] },
      { sql: "DELETE FROM actividades WHERE cliente_id = ?", params: [id] },
      { sql: "DELETE FROM clientes WHERE id = ?", params: [id] }
    ]);
    return ok({ ok: true });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleClientes, "handleClientes");

// src/routes/trabajos.js
var ESTATUSES_VALIDOS = ["Nuevo", "En cotizacion", "Pendiente firma", "Firmado", "Reservado", "En produccion", "Entregado", "Completado", "Cancelado"];
function jsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}
__name(jsonArray, "jsonArray");
async function handleTrabajos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;
  if (action === "crearTrabajo") {
    const body = await request.json();
    const {
      clienteId,
      interes,
      ubicacion,
      paquetesCotizados,
      portafolioLinks,
      propiedadesInteres,
      presupuestoEstimado,
      notas,
      fechaLlamada,
      horaLlamada
    } = body;
    if (!clienteId) return err("clienteId requerido");
    const cliente = await queryOne(db, "SELECT * FROM clientes WHERE id = ?", [clienteId]);
    if (!cliente) return err("Cliente no encontrado", 404);
    const id = uuid();
    const token = uuid();
    const creado = now();
    const statements = [
      {
        sql: `INSERT INTO trabajos (id, cliente_id, token, estatus, interes, ubicacion,
              paquetes_cotizados_json, portafolio_links_json, propiedades_interes_json,
              presupuesto_estimado, notas, fecha_creacion, fecha_ultima_actividad)
              VALUES (?, ?, ?, 'Nuevo', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          clienteId,
          token,
          interes || "",
          ubicacion || "",
          jsonArray(paquetesCotizados),
          jsonArray(portafolioLinks),
          jsonArray(propiedadesInteres),
          parseFloat(presupuestoEstimado) || 0,
          notas || "",
          creado,
          creado
        ]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [creado, clienteId]
      }
    ];
    if (fechaLlamada) {
      const actId = uuid();
      statements.push({
        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion,
              fecha_actividad, hora, fecha_creacion)
              VALUES (?, ?, ?, 'llamada_agendada', ?, ?, ?, ?)`,
        params: [actId, clienteId, id, notas || "", fechaLlamada, horaLlamada || "", creado]
      });
    }
    await batch(db, statements);
    if (fechaLlamada) {
      callAdapter(ctx, env, "agendarLlamadaCliente", {
        clienteId,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        interes: interes || "",
        fechaLlamada,
        horaLlamada: horaLlamada || "10:00",
        notas: notas || "",
        trabajoId: id,
        equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${token}`
      });
    }
    return ok({ ok: true, id, token });
  }
  if (action === "listarTrabajos") {
    const url = new URL(request.url);
    let clienteId = url.searchParams.get("clienteId");
    const grupo = url.searchParams.get("grupo");
    const mostrarCancelados = url.searchParams.get("cancelados") === "1";
    const GRUPO_ESTATUSES = {
      prospectos: ["Nuevo", "En cotizacion"],
      por_firmar: ["Pendiente firma", "Firmado"],
      confirmados: ["Reservado", "En produccion", "Entregado", "Completado"],
      cancelados: ["Cancelado"]
    };
    const conditions = [];
    const params = [];
    if (clienteId) {
      conditions.push("t.cliente_id = ?");
      params.push(clienteId);
    }
    if (grupo && GRUPO_ESTATUSES[grupo]) {
      const ph = GRUPO_ESTATUSES[grupo].map(() => "?").join(",");
      conditions.push(`t.estatus IN (${ph})`);
      params.push(...GRUPO_ESTATUSES[grupo]);
    } else if (!mostrarCancelados) {
      conditions.push(`t.estatus != 'Cancelado'`);
    }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const sql = `
      SELECT t.*,
             c.nombre  AS cliente_nombre,
             c.telefono AS cliente_telefono,
             c.correo  AS cliente_correo,
             c.inmobiliaria AS cliente_inmobiliaria
      FROM trabajos t
      JOIN clientes c ON c.id = t.cliente_id
      ${where}
      ORDER BY
        CASE WHEN t.fecha_ultima_actividad = '' OR t.fecha_ultima_actividad IS NULL
             THEN t.fecha_creacion ELSE t.fecha_ultima_actividad END DESC`;
    const { results } = await query(db, sql, params);
    return ok({ ok: true, trabajos: results });
  }
  if (action === "actualizarTrabajo") {
    const body = await request.json();
    const {
      id,
      interes,
      ubicacion,
      paquetesCotizados,
      portafolioLinks,
      propiedadesInteres,
      presupuestoEstimado,
      notas
    } = body;
    if (!id) return err("id requerido");
    const t = await queryOne(db, "SELECT cliente_id FROM trabajos WHERE id=?", [id]);
    if (!t) return err("Trabajo no encontrado", 404);
    const ts = now();
    await batch(db, [
      {
        sql: `UPDATE trabajos SET interes=?, ubicacion=?, paquetes_cotizados_json=?,
              portafolio_links_json=?, propiedades_interes_json=?, presupuesto_estimado=?,
              notas=?, fecha_ultima_actividad=? WHERE id=?`,
        params: [
          interes || "",
          ubicacion || "",
          jsonArray(paquetesCotizados),
          jsonArray(portafolioLinks),
          jsonArray(propiedadesInteres),
          parseFloat(presupuestoEstimado) || 0,
          notas || "",
          ts,
          id
        ]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [ts, t.cliente_id]
      }
    ]);
    return ok({ ok: true });
  }
  if (action === "actualizarEstatusTrabajo") {
    const body = await request.json();
    const { id, estatus } = body;
    if (!id || !ESTATUSES_VALIDOS.includes(estatus)) return err("id y estatus v\xE1lido requeridos");
    const t = await queryOne(db, "SELECT * FROM trabajos WHERE id=?", [id]);
    if (!t) return err("Trabajo no encontrado", 404);
    const ts = now();
    const statements = [
      { sql: `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE id=?`, params: [estatus, ts, id] },
      { sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`, params: [ts, t.cliente_id] }
    ];
    if (t.token) {
      const contratoExiste = await queryOne(db, "SELECT token FROM contratos WHERE token=?", [t.token]);
      if (contratoExiste) {
        statements.push({
          sql: `UPDATE contratos SET estatus=? WHERE token=?`,
          params: [estatus, t.token]
        });
      }
    }
    await batch(db, statements);
    if (estatus === "Reservado") {
      const cliente = await queryOne(db, "SELECT nombre, telefono FROM clientes WHERE id=?", [t.cliente_id]);
      callAdapter(ctx, env, "crearEventoReservado", {
        trabajoId: id,
        token: t.token || "",
        nombreCliente: cliente?.nombre || "",
        telefono: cliente?.telefono || "",
        equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${t.token || id}`
      });
    }
    return ok({ ok: true });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleTrabajos, "handleTrabajos");

// src/routes/actividades.js
async function handleActividades(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;
  if (action === "agendarLlamadaRapida") {
    const body = await request.json();
    const { nombre, telefono, fecha, hora, nota, interes, paquetes, propiedadLink } = body;
    if (!nombre && !telefono) return err("nombre o tel\xE9fono requerido");
    if (!fecha) return err("fecha requerida");
    const ts = now();
    let clienteId = null, clienteExistente = false, clienteNombre = nombre || "", clienteTel = telefono || "";
    const norm = normalizarTel(telefono);
    if (norm) {
      const { results } = await query(db, `SELECT id, nombre, telefono FROM clientes WHERE telefono != ''`);
      const match = results.find((c) => normalizarTel(c.telefono) === norm);
      if (match) {
        clienteId = match.id;
        clienteExistente = true;
        clienteNombre = match.nombre || clienteNombre;
        clienteTel = match.telefono || clienteTel;
      }
    }
    const statements = [];
    if (!clienteId) {
      clienteId = uuid();
      statements.push({
        sql: `INSERT INTO clientes (id, nombre, telefono, correo, origen, notas_perfil, fecha_creacion, fecha_ultima_actividad)
              VALUES (?, ?, ?, '', 'llamada', '', ?, ?)`,
        params: [clienteId, nombre || "Sin nombre", telefono || "", ts, ts]
      });
    } else {
      statements.push({ sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`, params: [ts, clienteId] });
    }
    let trabajoId = null;
    if (clienteExistente) {
      const trabajoAbierto = await queryOne(
        db,
        `SELECT id FROM trabajos WHERE cliente_id=?
         AND estatus IN ('nuevo','Nuevo','En cotizacion','Pendiente firma','Firmado')
         ORDER BY fecha_creacion DESC LIMIT 1`,
        [clienteId]
      );
      if (trabajoAbierto) trabajoId = trabajoAbierto.id;
    }
    if (!trabajoId) {
      trabajoId = uuid();
      statements.push({
        sql: `INSERT INTO trabajos (id, cliente_id, estatus, interes, paquetes_cotizados_json, ubicacion, notas, fecha_creacion, fecha_ultima_actividad)
              VALUES (?, ?, 'Nuevo', ?, ?, ?, ?, ?, ?)`,
        params: [
          trabajoId,
          clienteId,
          interes || "",
          JSON.stringify(paquetes || []),
          propiedadLink || "",
          nota || "",
          ts,
          ts
        ]
      });
    } else {
      statements.push({ sql: `UPDATE trabajos SET fecha_ultima_actividad=? WHERE id=?`, params: [ts, trabajoId] });
    }
    const actividadId = uuid();
    statements.push({
      sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion, estado, resultado)
            VALUES (?, ?, ?, 'llamada_agendada', ?, ?, ?, ?, 'pendiente', '')`,
      params: [actividadId, clienteId, trabajoId, nota || "", fecha, hora || "10:00", ts]
    });
    try {
      await batch(db, statements);
    } catch (e) {
      const fallback = statements.map((s) => s.sql.includes("'llamada_agendada'") ? {
        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
                  VALUES (?, ?, ?, 'llamada_agendada', ?, ?, ?, ?)`,
        params: [actividadId, clienteId, trabajoId, nota || "", fecha, hora || "10:00", ts]
      } : s);
      await batch(db, fallback);
    }
    callAdapter(ctx, env, "agendarLlamadaCliente", {
      clienteId,
      nombre: clienteNombre,
      telefono: clienteTel,
      interes: interes || "",
      fechaLlamada: fecha,
      horaLlamada: hora || "10:00",
      notas: nota || "",
      contratoToken: "",
      trabajoId
    });
    return ok({ ok: true, clienteId, trabajoId, actividadId, clienteExistente });
  }
  if (action === "marcarActividad") {
    const body = await request.json();
    const { actividadId, estado, resultado } = body;
    if (!actividadId) return err("actividadId requerido");
    try {
      await query(
        db,
        `UPDATE actividades SET estado=?, resultado=? WHERE id=?`,
        [estado || "hecha", resultado || "", actividadId]
      );
    } catch (e) {
      return err("No se pudo marcar (\xBFmigraci\xF3n r58 pendiente?). " + e.message);
    }
    return ok({ ok: true });
  }
  if (action === "agendarLlamada") {
    const body = await request.json();
    let {
      clienteId,
      trabajoId,
      nombre,
      telefono,
      interes,
      fechaLlamada,
      horaLlamada,
      descripcion,
      contratoToken
    } = body;
    if (!fechaLlamada) return err("fechaLlamada requerida");
    const ts = now();
    const statements = [];
    let clienteCreado = null;
    if (!clienteId && contratoToken) {
      const contrato = await queryOne(
        db,
        `SELECT token, cliente_id, nombre_cliente, telefono_cliente, correo_cliente
	         FROM contratos WHERE token=?`,
        [contratoToken]
      );
      if (!contrato) return err("Contrato no encontrado", 404);
      if (contrato.cliente_id) {
        clienteId = contrato.cliente_id;
      } else {
        nombre = nombre || contrato.nombre_cliente || "";
        telefono = telefono || contrato.telefono_cliente || "";
        const clienteExistente = contrato.correo_cliente ? await queryOne(db, `SELECT id, nombre, telefono FROM clientes WHERE correo=?`, [contrato.correo_cliente]) : null;
        if (clienteExistente) {
          clienteId = clienteExistente.id;
          clienteCreado = clienteExistente;
          statements.push({
            sql: `UPDATE contratos SET cliente_id=? WHERE token=?`,
            params: [clienteId, contratoToken]
          });
        } else {
          clienteId = uuid();
          clienteCreado = { id: clienteId, nombre, telefono };
          statements.push(
            {
              sql: `INSERT INTO clientes (id, nombre, telefono, correo, origen, notas_perfil, fecha_creacion, fecha_ultima_actividad)
	                    VALUES (?, ?, ?, ?, 'contrato', '', ?, ?)`,
              params: [clienteId, nombre, telefono, contrato.correo_cliente || "", ts, ts]
            },
            {
              sql: `UPDATE contratos SET cliente_id=? WHERE token=?`,
              params: [clienteId, contratoToken]
            }
          );
        }
      }
    }
    if (!clienteId) return err("clienteId requerido");
    const cliente = clienteCreado || await queryOne(db, "SELECT id, nombre, telefono FROM clientes WHERE id=?", [clienteId]);
    if (!cliente) return err("Cliente no encontrado", 404);
    if (trabajoId) {
      const trabajo = await queryOne(db, "SELECT cliente_id FROM trabajos WHERE id=?", [trabajoId]);
      if (!trabajo) return err("Trabajo no encontrado", 404);
      if (trabajo.cliente_id !== clienteId) return err("El trabajo pertenece a otro cliente", 409);
    }
    const id = uuid();
    statements.push(
      {
        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
	              VALUES (?, ?, ?, 'llamada_agendada', ?, ?, ?, ?)`,
        params: [id, clienteId, trabajoId || "", descripcion || "", fechaLlamada, horaLlamada || "", ts]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [ts, clienteId]
      }
    );
    if (trabajoId) {
      statements.push({
        sql: `UPDATE trabajos SET fecha_ultima_actividad=? WHERE id=?`,
        params: [ts, trabajoId]
      });
    }
    await batch(db, statements);
    callAdapter(ctx, env, "agendarLlamadaCliente", {
      clienteId,
      nombre: nombre || cliente.nombre || "",
      telefono: telefono || cliente.telefono || "",
      interes: interes || "",
      fechaLlamada,
      horaLlamada: horaLlamada || "10:00",
      notas: descripcion || "",
      contratoToken: contratoToken || "",
      trabajoId: trabajoId || ""
    });
    return ok({ ok: true, id });
  }
  if (action === "agregarNota") {
    const body = await request.json();
    const { clienteId, trabajoId, descripcion, tipo } = body;
    if (!clienteId) return err("clienteId requerido");
    if (!descripcion) return err("descripcion requerida");
    const cliente = await queryOne(db, "SELECT id FROM clientes WHERE id=?", [clienteId]);
    if (!cliente) return err("Cliente no encontrado", 404);
    if (trabajoId) {
      const trabajo = await queryOne(db, "SELECT cliente_id FROM trabajos WHERE id=?", [trabajoId]);
      if (!trabajo) return err("Trabajo no encontrado", 404);
      if (trabajo.cliente_id !== clienteId) return err("El trabajo pertenece a otro cliente", 409);
    }
    const id = uuid();
    const ts = now();
    const tipoFinal = tipo || "nota";
    const statements = [
      {
        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
	              VALUES (?, ?, ?, ?, ?, ?, '', ?)`,
        params: [id, clienteId, trabajoId || "", tipoFinal, descripcion, ts.substring(0, 10), ts]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [ts, clienteId]
      }
    ];
    if (trabajoId) {
      statements.push({
        sql: `UPDATE trabajos SET fecha_ultima_actividad=? WHERE id=?`,
        params: [ts, trabajoId]
      });
    }
    await batch(db, statements);
    return ok({ ok: true, id });
  }
  if (action === "listarActividadesPendientes") {
    try {
      const { results } = await query(
        db,
        `SELECT a.id, a.cliente_id, a.trabajo_id, a.tipo, a.descripcion, a.fecha_actividad, a.hora,
                a.estado, a.resultado, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
         FROM actividades a
         LEFT JOIN clientes c ON a.cliente_id = c.id
         WHERE a.tipo LIKE 'llamada%' AND (a.estado IS NULL OR a.estado = 'pendiente')
         ORDER BY a.fecha_actividad ASC, a.hora ASC LIMIT 100`
      );
      return ok({ ok: true, actividades: results });
    } catch (e) {
      try {
        const { results } = await query(
          db,
          `SELECT a.id, a.cliente_id, a.trabajo_id, a.tipo, a.descripcion, a.fecha_actividad, a.hora,
                  c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
           FROM actividades a
           LEFT JOIN clientes c ON a.cliente_id = c.id
           WHERE a.tipo LIKE 'llamada%'
           ORDER BY a.fecha_actividad ASC, a.hora ASC LIMIT 100`
        );
        return ok({ ok: true, actividades: results, degradado: true });
      } catch (e2) {
        return ok({ ok: true, actividades: [] });
      }
    }
  }
  if (action === "listarActividades") {
    const url = new URL(request.url);
    let clienteId = url.searchParams.get("clienteId");
    let trabajoId = url.searchParams.get("trabajoId");
    if (!clienteId && request.method === "POST") {
      const body = await request.json();
      clienteId = body.clienteId;
      trabajoId = body.trabajoId || null;
    }
    if (!clienteId) return err("clienteId requerido");
    const sql = trabajoId ? `SELECT * FROM actividades WHERE cliente_id=? AND trabajo_id=?
         ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 100` : `SELECT * FROM actividades WHERE cliente_id=?
         ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 100`;
    const params = trabajoId ? [clienteId, trabajoId] : [clienteId];
    const { results } = await query(db, sql, params);
    return ok({ ok: true, actividades: results });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleActividades, "handleActividades");

// src/routes/config.js
var CLAVES_PUBLICAS = [
  "banco_clabe",
  "banco_nombre",
  "banco_titular",
  "pago_cuenta",
  "pago_tarjeta",
  "pago_oxxo",
  "pago_clip_url"
];
var DEFAULTS = {
  banco_clabe: "",
  banco_nombre: "",
  banco_titular: "",
  pago_cuenta: "",
  pago_tarjeta: "",
  pago_oxxo: "",
  pago_clip_url: ""
};
async function handleConfig(request, env, ctx, action) {
  const db = env.DB;
  if (action === "obtenerConfig") {
    let map = { ...DEFAULTS };
    try {
      const { results } = await query(db, "SELECT clave, valor FROM config");
      for (const row of results) {
        if (CLAVES_PUBLICAS.includes(row.clave)) map[row.clave] = row.valor || "";
      }
    } catch (e) {
    }
    return ok({ ok: true, ...map });
  }
  if (action === "obtenerConfigAdmin") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    let map = {};
    try {
      const { results } = await query(db, "SELECT clave, valor FROM config");
      for (const row of results) map[row.clave] = row.valor || "";
    } catch (e) {
    }
    return ok({ ok: true, config: map });
  }
  if (action === "guardarConfig") {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const pares = body.config && typeof body.config === "object" ? Object.entries(body.config) : body.clave != null ? [[body.clave, body.valor]] : [];
    if (!pares.length) return err("Nada que guardar");
    const ts = now();
    try {
      for (const [clave, valor] of pares) {
        if (!clave) continue;
        await run(
          db,
          `INSERT INTO config (clave, valor, actualizado) VALUES (?, ?, ?)
           ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, actualizado=excluded.actualizado`,
          [clave, valor == null ? "" : String(valor), ts]
        );
      }
    } catch (e) {
      return err("No se pudo guardar la configuraci\xF3n (\xBFmigraci\xF3n r58 pendiente?). " + e.message);
    }
    return ok({ ok: true });
  }
  if (action === "obtenerConfigGuia") {
    let guia = null;
    try {
      const { results } = await query(db, "SELECT valor FROM config WHERE clave = 'guia_config'");
      if (results && results[0] && results[0].valor) {
        try {
          guia = JSON.parse(results[0].valor);
        } catch (_) {
          guia = null;
        }
      }
    } catch (e) {
    }
    return ok({ ok: true, guia });
  }
  return err("Acci\xF3n no encontrada", 404);
}
__name(handleConfig, "handleConfig");

// src/cron.js
async function syncToSheets(env) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes("REEMPLAZAR")) return;
  const db = env.DB;
  try {
    const [contratos, abonos, propiedades, paquetes, clientes, trabajos, actividades] = await Promise.all([
      query(db, "SELECT * FROM contratos ORDER BY fecha_creacion DESC"),
      query(db, "SELECT * FROM abonos ORDER BY fecha_registro DESC"),
      query(db, "SELECT * FROM propiedades ORDER BY contrato_token, num_propiedad"),
      query(db, "SELECT * FROM paquetes ORDER BY orden"),
      query(db, "SELECT * FROM clientes ORDER BY fecha_creacion DESC"),
      query(db, "SELECT * FROM trabajos ORDER BY fecha_creacion DESC"),
      query(db, "SELECT * FROM actividades ORDER BY fecha_creacion DESC")
    ]);
    if (!contratos.results) throw new Error("D1 query fall\xF3 para contratos");
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "syncBackup",
        data: {
          contratos: contratos.results,
          abonos: abonos.results,
          propiedades: propiedades.results,
          paquetes: paquetes.results,
          clientes: clientes.results,
          trabajos: trabajos.results,
          actividades: actividades.results
        }
      })
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error || body?.ok === false) {
      console.error("syncToSheets: adapter respondi\xF3", body?.error || body?.message || "HTTP " + res.status);
    }
  } catch (e) {
    console.error("syncToSheets error:", e.message);
  }
}
__name(syncToSheets, "syncToSheets");
async function backupChecklistToR2(env) {
  if (!env.CHECKLIST_BACKUP) return;
  try {
    const rows = await query(env.DB, "SELECT contrato_token, cuartos_json, rev, fecha_actualizacion FROM checklist");
    const fecha = (/* @__PURE__ */ new Date()).toISOString();
    for (const row of rows.results || []) {
      const body = JSON.stringify({
        token: row.contrato_token,
        rev: row.rev,
        fecha_actualizacion: row.fecha_actualizacion,
        cuartos_json: row.cuartos_json
      });
      const base = "checklist/" + row.contrato_token;
      await env.CHECKLIST_BACKUP.put(base + "/" + fecha + ".json", body);
      await env.CHECKLIST_BACKUP.put(base + "/latest.json", body);
    }
  } catch (e) {
    console.error("backupChecklistToR2 error:", e.message);
  }
}
__name(backupChecklistToR2, "backupChecklistToR2");

// src/index.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key, X-Entregas-Key"
};
var RUTAS_CONTRATOS = [
  "listarContratos",
  "obtenerContrato",
  "crearContrato",
  "actualizarEstatus",
  "actualizarContratoUpsell",
  "ocultarContrato",
  "eliminarContrato",
  "reservarContrato",
  "guardarNotasInternas",
  "marcarSesionCompletada",
  "guardarProduccion",
  "guardarEntrega",
  "revocarEntrega",
  "prepararEntrega",
  "guardarConfigEntrega",
  "publicarEntrega",
  "agregarFotoEntrega",
  "iniciarSubidaVideo",
  "confirmarVideoEntrega",
  "previewEntrega",
  "guardarCaracteristicas",
  "reagendarPropiedad",
  "exportarCSV",
  "enviarRecordatorio",
  "guardarNotaPropiedad",
  "actualizarCarpeta",
  "actualizarPdfUrl",
  "actualizarCalendarEvent",
  "actualizarExpress",
  "guardarFormatoPropiedad"
];
var RUTAS_PORTAL = ["obtenerPortal", "firmaCliente", "guardarResena", "guardarConfiguracion", "obtenerEntrega"];
var RUTAS_ABONOS = ["registrarAbono", "listarAbonos"];
var RUTAS_PAQUETES = ["listarPaquetes", "listarPaquetesTodos", "crearPaquete", "editarPaquete", "togglePaquete"];
var RUTAS_CHECKLIST = ["obtenerChecklist", "guardarChecklist"];
var RUTAS_ARCHIVOS = ["subirArchivo", "subirArchivoAdmin", "subirArchivoCliente", "listarArchivosCliente"];
var RUTAS_REVISION = ["obtenerRevision", "guardarRevision"];
var RUTAS_EQUIPO = ["obtenerEquipo", "marcarProduccion"];
var RUTAS_CLIENTES = ["crearCliente", "listarClientes", "obtenerCliente", "actualizarCliente", "borrarCliente", "buscarClientePorTelefono"];
var RUTAS_TRABAJOS = ["crearTrabajo", "listarTrabajos", "actualizarTrabajo", "actualizarEstatusTrabajo"];
var RUTAS_ACTIVIDADES = ["agendarLlamada", "agregarNota", "listarActividades", "listarActividadesPendientes", "agendarLlamadaRapida", "marcarActividad"];
var RUTAS_CONFIG = ["obtenerConfig", "obtenerConfigAdmin", "guardarConfig", "obtenerConfigGuia"];
var index_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      const esHostEntregas = url.hostname.startsWith("entregas.");
      let servir = null;
      if (esHostEntregas && (path === "/" || path === "/e" || path.startsWith("/e/"))) {
        servir = "/entregas";
      } else if (path.startsWith("/ver/") || esHostEntregas) {
        const ruta = path.startsWith("/ver/") ? path.slice(4) : path;
        if (codigoDeRuta(ruta)) servir = "/entregas-cliente";
      }
      if (servir) {
        const assetRes2 = await env.ASSETS.fetch(new Request(new URL(servir, url), request));
        const headers3 = new Headers(assetRes2.headers);
        headers3.set("Cache-Control", "no-cache, no-store, must-revalidate");
        headers3.set("Pragma", "no-cache");
        return new Response(assetRes2.body, { status: assetRes2.status, headers: headers3 });
      }
      const assetRes = await env.ASSETS.fetch(request);
      const isHtml = path.endsWith(".html") || path === "/" || !path.includes(".");
      if (!isHtml) return assetRes;
      const headers2 = new Headers(assetRes.headers);
      headers2.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers2.set("Pragma", "no-cache");
      return new Response(assetRes.body, { status: assetRes.status, headers: headers2 });
    }
    const action = path.replace("/api/", "");
    let response;
    if (action.startsWith("e/")) {
      response = await handleEntregas(request, env, ctx, action.slice(2));
    } else if (RUTAS_CONTRATOS.includes(action)) {
      response = await handleContratos(request, env, ctx, action);
    } else if (RUTAS_PORTAL.includes(action)) {
      response = await handlePortal(request, env, ctx, action);
    } else if (RUTAS_ABONOS.includes(action)) {
      response = await handleAbonos(request, env, ctx, action);
    } else if (RUTAS_PAQUETES.includes(action)) {
      response = await handlePaquetes(request, env, ctx, action);
    } else if (action === "listarStats") {
      response = await handleStats(request, env, ctx);
    } else if (RUTAS_CHECKLIST.includes(action)) {
      response = await handleChecklist(request, env, ctx, action);
    } else if (RUTAS_ARCHIVOS.includes(action)) {
      response = await handleArchivos(request, env, ctx, action);
    } else if (RUTAS_REVISION.includes(action)) {
      response = await handleRevision(request, env, ctx, action);
    } else if (RUTAS_EQUIPO.includes(action)) {
      response = await handleEquipo(request, env, ctx, action);
    } else if (RUTAS_CLIENTES.includes(action)) {
      response = await handleClientes(request, env, ctx, action);
    } else if (RUTAS_TRABAJOS.includes(action)) {
      response = await handleTrabajos(request, env, ctx, action);
    } else if (RUTAS_ACTIVIDADES.includes(action)) {
      response = await handleActividades(request, env, ctx, action);
    } else if (RUTAS_CONFIG.includes(action)) {
      response = await handleConfig(request, env, ctx, action);
    } else {
      response = err("Acci\xF3n no encontrada", 404);
    }
    const headers = new Headers(response.headers);
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncToSheets(env));
    ctx.waitUntil(backupChecklistToR2(env));
    ctx.waitUntil(
      expirarEntregas(env).catch((e) => console.error("R129 expirarEntregas fall\xF3:", e.message))
    );
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
