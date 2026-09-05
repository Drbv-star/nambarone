export async function onRequestGet({ env }) {
  try { await env.DB.prepare('SELECT 1').first(); return Response.json({ ok: true, database: true }); }
  catch { return Response.json({ ok: false, database: false }, { status: 503 }); }
}
