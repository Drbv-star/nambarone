export async function onRequestGet({ env, request }) {
  const db = env.DB;
  if (!db) return Response.json({ error: 'Database not configured' }, { status: 503 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await db.prepare(`UPDATE listings SET today=0, clicks_today=0, today_date=? WHERE today_date<>?`).bind(today, today).run();
  const listings = await db.prepare(`SELECT id,handle,name,category AS cat,platform,photo,total,today,clicks,clicks_today AS clicksToday,created_at AS created,updated_at AS updated FROM listings ORDER BY total DESC, created_at ASC`).all();
  const activity = await db.prepare(`SELECT id,listing_id AS listingId,name,bid,rank,board,created_at AS createdAt FROM activity ORDER BY created_at DESC LIMIT 50`).all();
  const meta = await db.prepare(`SELECT value FROM meta WHERE key='version'`).first();
  return Response.json({ version: Number(meta?.value || 0), listings: listings.results || [], activity: activity.results || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
