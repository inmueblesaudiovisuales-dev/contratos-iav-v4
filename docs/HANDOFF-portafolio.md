# Handoff — Página de portafolio público de IAV
**Sesión:** 2026-06-09 · Claude Code on the Web → continuar en Claude local

---

## Objetivo de hoy

Construir una **página de portafolio público** para Inmuebles Audiovisuales:
una landing que muestre los servicios y trabajos a clientes potenciales.
La sesión web se cortó antes de recibir los mockups; Bruno los va a compartir
al retomar localmente.

---

## Estado al cortar la sesión

- [ ] Bruno va a compartir los mockups (no llegaron a enviarse en esta sesión)
- [ ] Diseño: pendiente de definir basado en los mockups
- [ ] Código: no se escribió ningún archivo de portafolio todavía

---

## Archivos relevantes ya en el repo

| Archivo | Qué es |
|---------|--------|
| `mockup-desktop.html` | Mockup del panel admin (diseño de referencia — paleta oscura + gold) |
| `design/B-dossier.html` | Mockup alternativo del admin (tipografía Fraunces + papel cálido) |
| `design/mockups/captura-video.html` | Mockup mobile de captura de video (misma paleta cálida) |
| `frontend/admin.html` | Admin real en producción (referencia de componentes ya construidos) |
| `frontend/portal.html` | Portal del cliente (referencia de flujo público) |

---

## Sistema de diseño existente (extraído de los mockups)

Todos los mockups comparten una paleta consistente — úsala en el portafolio:

```css
/* Paleta cálida (B-dossier + captura-video) */
--paper-0: #F7F4EC;   /* fondo principal */
--paper-1: #FFFDF8;   /* cards/superficies */
--paper-2: #EFEADF;   /* fondos secundarios */
--line:    #E2DBCB;   /* bordes suaves */
--line-2:  #D2C9B3;   /* bordes fuertes */
--gold:       #B08D2E;
--gold-leaf:  #C9A84C;  /* dorado principal */
--gold-pale:  #F3EAD0;
--ink-1: #211E18;   /* texto principal */
--ink-2: #5C564A;   /* texto secundario */
--ink-3: #918975;   /* texto terciario */
--onyx: #1C1C1E;    /* negro para headers oscuros */

/* Tipografía */
Fraunces (serif) — títulos y display
Libre Franklin / Inter — cuerpo de texto
Spline Sans Mono — números y monospaced
```

---

## Contexto del negocio

- **Empresa:** Inmuebles Audiovisuales (IAV) — producción audiovisual
- **Servicios típicos:** grabación de video, fotografía de bienes raíces / inmuebles
- **URL base actual:** `https://contratos.inmueblesaudiovisuales.com` (sistema de contratos)
- **Stack:** Cloudflare Workers + D1 + assets estáticos en `frontend/`
- **Deploy:** push a `main` → GitHub Actions → wrangler deploy (~1 min)
- **Rama de trabajo asignada:** `claude/pensive-albattani-6cn3p8`

---

## Primeros pasos al retomar

1. **Pedir los mockups a Bruno** — en esta sesión mencionó que los tenía pero no llegó a compartirlos
2. Revisar mockups y alinear estructura de secciones (hero, servicios, galería, CTA, etc.)
3. Crear `frontend/portafolio.html` siguiendo el sistema de diseño existente
4. Hacer push a `claude/pensive-albattani-6cn3p8` para preview, luego PR a `main`

---

## Reglas del proyecto a recordar

- Sin emojis en el producto
- CSS mobile-first
- Push a `main` dispara deploy automático; **nunca** `wrangler deploy` manual
- Si se toca `adapter/AdapterScript4_v1.js` hay que documentarlo en `docs/RONDAS.md`
  (este archivo de portafolio no lo requiere)

---

## Cómo retomar localmente

```bash
cd contratos-iav-v4
git fetch origin
git checkout claude/pensive-albattani-6cn3p8

# Luego abrir Claude Code:
claude
# Y decirle: "Lee docs/HANDOFF-portafolio.md y continuemos con la página de portafolio"
```
