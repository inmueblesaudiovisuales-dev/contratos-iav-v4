#!/usr/bin/env python3
"""Harness E2E para el sistema de contratos IAV — corrida QA2.
Conduce el ciclo completo vía API de producción de forma fiel.
Uso: importar o `python3 qa.py <comando> [args...]` (ver main).
"""
import json, sys, time, zlib, struct, base64, urllib.request, urllib.error, urllib.parse, os

API = "https://contratos.inmueblesaudiovisuales.com/api"
KEY = "framedock"
STATE = os.path.join(os.path.dirname(__file__), "state.json")

PRECIOS = {
    "RES-COMBO":4500,"TER-COMBO":4000,"IND-FOTO":3000,"IND-VIDEO":3000,"IND-360":3000,
    "ADD-COMOLLEGAR":1000,"ADD-LANDING":1200,"ADD-DOBLE-FORMATO":1500,"ADD-FOLLETO":800,
    "ADD-ASESOR":500,"ADD-EXPRESS":1000,
}
TIPO = {"RES-COMBO":"Residencial","TER-COMBO":"Terreno","IND-FOTO":"Residencial",
        "IND-VIDEO":"Residencial","IND-360":"Residencial"}

def api(action, payload=None, admin=True, method="POST", params=None):
    url = API + "/" + action
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    headers = {"Content-Type":"application/json",
               "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
    if admin:
        headers["X-Admin-Key"] = KEY
    if method == "POST":
        data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=60)
        body = r.read().decode()
        code = r.getcode()
    except urllib.error.HTTPError as e:
        body = e.read().decode(); code = e.code
    try:
        j = json.loads(body)
    except Exception:
        j = {"_raw": body}
    j["_http"] = code
    return j

# ── PNG generator (solid color NxN, returns base64 sin prefijo) ──
def png_b64(rgb, size=8):
    w=h=size
    raw=b""
    for y in range(h):
        raw+=b"\x00"+bytes(rgb)*w
    def chunk(t,d):
        c=t+d
        return struct.pack(">I",len(d))+c+struct.pack(">I",zlib.crc32(c)&0xffffffff)
    sig=b"\x89PNG\r\n\x1a\n"
    ihdr=struct.pack(">IIBBBBB",w,h,8,2,0,0,0)
    idat=zlib.compress(raw)
    png=sig+chunk(b"IHDR",ihdr)+chunk(b"IDAT",idat)+chunk(b"IEND",b"")
    return base64.b64encode(png).decode()

def png_data_url(rgb,size=8):
    return "data:image/png;base64,"+png_b64(rgb,size)

# ── estado persistente ──
def load_state():
    if os.path.exists(STATE):
        return json.load(open(STATE))
    return {"escenarios":{}}
def save_state(s):
    json.dump(s, open(STATE,"w"), indent=2, ensure_ascii=False)

# ── lifecycle helpers ──
def crear_cliente(nombre, correo, telefono):
    return api("crearCliente", {"nombre":nombre,"correo":correo,"telefono":telefono,"origen":"qa-e2e"})

def crear_trabajo(cliente_id, interes=""):
    return api("crearTrabajo", {"clienteId":cliente_id,"interes":interes,"ubicacion":"Monterrey"})

def crear_contrato(trabajo_id, cliente_id, nombre, correo, telefono, props, adicionales=None, extras=None, anticipo_pct=50):
    """props: lista de dicts {paquete, fechaSesion, horaSesion, direccion?, entregables?}"""
    total = 0
    propsData=[]
    for p in props:
        pk=p["paquete"]
        total += PRECIOS[pk]
        propsData.append({
            "tipo": TIPO.get(pk,"Residencial"),
            "paquete": pk,
            "fechaSesion": p["fechaSesion"],
            "horaSesion": p.get("horaSesion","10:00"),
            "entregables": p.get("entregables",""),
            "direccion": p.get("direccion",""),
        })
    extras = extras or []
    for e in extras:
        total += e["precio"]
    # adicionales ofrecidos (no suman al precio hasta que el cliente acepte)
    base_pk = props[0]["paquete"]
    if anticipo_pct=="otro":
        anticipo = 1234
    else:
        anticipo = round(total*anticipo_pct/100)
    payload={
        "trabajoId":trabajo_id,"clienteId":cliente_id,
        "nombreCliente":nombre,"correoCliente":correo,"telefonoCliente":telefono,
        "tipoPaquete":TIPO.get(base_pk,"Residencial"),"paqueteBase":base_pk,
        "adicionales":adicionales or [], "extrasAcordados":extras,
        "precioTotal":total,"anticipo":anticipo,
        "numPropiedades":len(propsData),"propiedades":propsData,
        "notasContrato":"",
    }
    r=api("crearContrato",payload)
    r["_total"]=total; r["_anticipo"]=anticipo
    return r

def subir(token, num, nombre, rgb, admin=False):
    act = "subirArchivoAdmin" if admin else "subirArchivo"
    return api(act, {"token":token,"numPropiedad":num,"nombre":nombre,
                     "mimeType":"image/png","base64":png_b64(rgb)}, admin=admin)

def firmar(token, correo, telefono, propsFirma, adicionales=None, firma_rgb=(20,20,30)):
    payload={"token":token,"correoCliente":correo,"telefonoCliente":telefono,
             "firmaBase64":png_data_url(firma_rgb,40),
             "adicionales":adicionales or [],
             "propiedades":propsFirma}
    return api("firmaCliente", payload, admin=False)

def abono(token, monto, metodo="Transferencia", permitir=False, notas=""):
    p={"token":token,"monto":monto,"metodo":metodo,"notas":notas}
    if permitir: p["permitirExceso"]=True
    return api("registrarAbono", p)

def estado(token):
    return api("obtenerContrato", params={"token":token}, method="GET")

def portal(token):
    return api("obtenerPortal", params={"token":token}, method="GET", admin=False)

def equipo(token):
    return api("obtenerEquipo", params={"token":token}, method="GET", admin=False)

if __name__=="__main__":
    cmd=sys.argv[1] if len(sys.argv)>1 else ""
    if cmd=="png":
        print(png_b64((255,0,0)))
    else:
        print("harness listo")
