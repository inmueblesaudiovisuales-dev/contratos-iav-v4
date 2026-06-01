# Arranque v4.0 — Comandos para Bruno

Ejecutar en orden. Cada paso tarda menos de 2 minutos.

---

## Paso 1 — Instalar Wrangler y autenticarse

```bash
npm install -g wrangler
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker"
npm install
wrangler login
```

Abre el navegador. Iniciar sesión con la cuenta de Cloudflare de IAV.

---

## Paso 2 — Crear la base de datos D1

```bash
wrangler d1 create contratos-iav-v4
```

La salida incluye una línea como:
```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copiar ese ID y pegarlo en `wrangler.toml` donde dice `REEMPLAZAR_CON_ID_REAL`.

---

## Paso 3 — Aplicar schema y datos iniciales

```bash
wrangler d1 execute contratos-iav-v4 --remote --file=schema.sql
wrangler d1 execute contratos-iav-v4 --remote --file=seed-paquetes.sql
```

Ambos deben decir "Successfully executed".

---

## Paso 4 — Crear el adapter en Apps Script

1. Ir a script.google.com
2. Crear proyecto nuevo (botón "+ Nuevo proyecto")
3. Borrar todo el contenido del editor
4. Pegar el contenido del archivo `adapter/AdapterScript4_v1.js`
5. Clic en **Implementar** → **Nueva implementación**
6. Tipo: **Aplicación web**
7. Ejecutar como: **Yo**
8. Quién tiene acceso: **Cualquier usuario**
9. Clic en **Implementar**
10. Copiar la URL del deployment (empieza con `https://script.google.com/macros/s/...`)

Pegar esa URL en `wrangler.toml` donde dice `REEMPLAZAR_CON_URL_DEL_ADAPTER`.

---

## Paso 5 — Crear Google Sheets de backup

1. Ir a sheets.google.com
2. Crear una hoja nueva con nombre "IAV Contratos v4 — Backup"
3. Copiar el ID de la URL (la parte entre `/d/` y `/edit`)
4. Pegar ese ID en `adapter/AdapterScript4_v1.js` donde dice `REEMPLAZAR_CON_ID_SHEETS_V4`
5. Volver a Apps Script, pegar el archivo actualizado y reimplementar (mismo proceso del Paso 4)

---

## Paso 6 — Instalar trigger de recordatorio 24h en Apps Script

En Apps Script:
1. Clic en el icono de reloj (Activadores / Triggers) en el menú izquierdo
2. Agregar activador:
   - Función: `recordatorio24h`
   - Fuente: Basado en tiempo
   - Tipo: Temporizador por hora
   - Clic en Guardar

---

## Paso 7 — Hacer deploy del Worker

```bash
wrangler deploy
```

Debe decir: `Deployed contratos-iav-v4`

---

## Paso 8 — Configurar el subdominio en Cloudflare

1. Ir al dashboard de Cloudflare → Workers & Pages → contratos-iav-v4
2. Pestaña **Settings** → **Domains & Routes**
3. Agregar dominio: `contratos.inmueblesaudiovisuales.com`
4. Cloudflare configura el DNS y el SSL automáticamente (tarda ~1 minuto)

---

## Paso 9 — Verificar que todo funciona

```bash
curl -s "https://contratos.inmueblesaudiovisuales.com/api/listarPaquetes" | python3 -m json.tool
```

Debe devolver los 10 paquetes del catálogo.

Luego abrir `https://contratos.inmueblesaudiovisuales.com/admin.html` en el browser, entrar con `framedock` y crear un contrato de prueba.

---

## Si algo falla

- El sistema v3.0 sigue funcionando en `inmueblesaudiovisuales.com` sin cambios.
- Los clientes actuales no se ven afectados.
