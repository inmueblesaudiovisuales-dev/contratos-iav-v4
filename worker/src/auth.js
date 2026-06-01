export function requireAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') ||
    new URL(request.url).searchParams.get('adminKey');
  if (key !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

export function ok(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
