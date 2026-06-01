// Llama al adapter de Apps Script en background — el usuario no espera
export function callAdapter(ctx, env, action, payload) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes('REEMPLAZAR')) return;
  const promise = fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  }).catch(e => console.error('Google adapter error:', action, e.message));
  ctx.waitUntil(promise);
}

// Llama al adapter y espera la respuesta — usar solo cuando necesitamos el resultado
export async function callAdapterSync(env, action, payload) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes('REEMPLAZAR')) {
    return { error: 'Adapter no configurado' };
  }
  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) return { error: 'Adapter error ' + res.status };
    return res.json();
  } catch (e) {
    console.error('callAdapterSync error:', action, e.message);
    return { error: 'Adapter temporalmente no disponible' };
  }
}
