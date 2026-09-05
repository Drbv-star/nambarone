function visitorId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/nmb_vid=([^;]+)/);
  if (match) return match[1];
  return crypto.randomUUID();
}
export async function onRequestPost({ env, request }) {
  const db = env.DB;
  if (!db) return Response.json({ error: 'Database not configured' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = String(body?.id || '').trim();
  if (!id) return Response.json({ error: 'Missing listing id' }, { status: 400 });
  const vid = visitorId(request);
  const now = Date.now();
  const old = await db.prepare(`SELECT last_clicked_at FROM click_guard WHERE visitor_id=? AND listing_id=?`).bind(vid, id).first();
  if (old && now - Number(old.last_clicked_at) < 30000) return Response.json({ ok: true, counted: false });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await db.batch([
    db.prepare(`UPDATE listings SET clicks=clicks+1, clicks_today=CASE WHEN today_date=? THEN clicks_today+1 ELSE 1 END, today_date=? WHERE id=?`).bind(today, today, id),
    db.prepare(`INSERT INTO click_guard(visitor_id,listing_id,last_clicked_at) VALUES(?,?,?) ON CONFLICT(visitor_id,listing_id) DO UPDATE SET last_clicked_at=excluded.last_clicked_at`).bind(vid, id, now),
    db.prepare(`UPDATE meta SET value=value+1 WHERE key='version'`)
  ]);
  return new Response(JSON.stringify({ ok: true, counted: true }), { headers: { 'Content-Type':'application/json', 'Set-Cookie': `nmb_vid=${vid}; Path=/; Max-Age=31536000; SameSite=Lax; Secure` } });
}
