
function fallbackPhoto(platform, handle, name) {
  const label = encodeURIComponent(String(name || handle || "N").slice(0, 24));
  const fallback = `https://ui-avatars.com/api/?name=${label}&background=c1121f&color=fff8ea&size=160&bold=true`;
  const provider = platform === "Instagram" ? "instagram" : "youtube";
  return `https://unavatar.io/${provider}/${encodeURIComponent(handle)}?fallback=${encodeURIComponent(fallback)}`;
}

async function enrichListing(db, row) {
  if (row.photo) return row;

  let name = row.name || row.handle;
  let photo = fallbackPhoto(row.platform, row.handle, name);

  try {
    if (row.platform === "Instagram") {
      const r = await fetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(row.handle)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*",
            "X-IG-App-ID": "936619743392459"
          }
        }
      );

      if (r.ok) {
        const data = await r.json();
        const user = data?.data?.user;

        if (user) {
          name = String(user.full_name || user.username || row.handle).trim();
          photo = String(user.profile_pic_url_hd || user.profile_pic_url || photo);
        }
      }
    }

    if (row.platform === "YouTube") {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/@${row.handle}`)}&format=json`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );

      if (r.ok) {
        const data = await r.json();
        name = String(data?.author_name || row.handle).trim();
        photo = String(data?.thumbnail_url || photo);
      }
    }
  } catch (e) {
    console.warn("Profile enrichment failed:", e);
  }

  await db.prepare(
    "UPDATE listings SET name=?, photo=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).bind(name, photo, row.id).run();

  return { ...row, name, photo };
}

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

  const enrichedListings = [];
  for (const row of (listings.results || [])) {
    enrichedListings.push(await enrichListing(db, row));
  }

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
      listings: enrichedListings,
      activity: activityRows
    },
    {
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
