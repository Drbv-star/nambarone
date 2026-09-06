export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata'
  }).format(new Date());

  // Lazy IST midnight reset. All-time values are never changed here.
  await db.prepare(`
    UPDATE listings
    SET today=0,
        clicks_today=0,
        today_date=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE today_date IS NULL OR today_date<>?
  `).bind(today, today).run();

  const listings = await db.prepare(`
    SELECT
      id,
      handle,
      name,
      category AS cat,
      platform,
      photo,
      total,
      today,
      clicks,
      clicks_today AS clicksToday,
      created_at AS created,
      updated_at AS updated
    FROM listings
    ORDER BY total DESC, created_at ASC
  `).all();

  const activity = await db.prepare(`
    SELECT
      id,
      listing_id AS listingId,
      name,
      bid,
      rank,
      board,
      created_at AS createdAt
    FROM activity
    ORDER BY created_at DESC
    LIMIT 50
  `).all();

  const meta = await db.prepare(`
    SELECT value FROM meta WHERE key='version'
  `).first();

  const activityRows = (activity.results || []).map(a => ({
    id: a.id,
    listingId: a.listingId,
    name: a.name,
    bid: Number(a.bid || 0),
    rank: Number(a.rank || 0),
    board: a.board,
    createdAt: a.createdAt,
    t: new Date(a.createdAt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata'
    })
  }));

  return Response.json(
    {
      version: Number(meta?.value || 0),
      listings: listings.results || [],
      activity: activityRows
    },
    {
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
