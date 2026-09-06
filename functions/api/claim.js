const ALLOWED_CATEGORIES = new Set([
  'YouTube', 'Instagram', 'Shorts', 'Gaming', 'Comedy', 'Education',
  'Tech', 'Finance', 'Fashion', 'Food', 'Fitness'
]);

const MIN_RUPEES = 40;
const MAX_RUPEES = 20000000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function todayIndia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}


function fallbackPhoto(platform, handle, name) {
  const label = encodeURIComponent(String(name || handle || "N").slice(0, 24));
  const fallback = `https://ui-avatars.com/api/?name=${label}&background=c1121f&color=fff8ea&size=160&bold=true`;
  const provider = platform === "Instagram" ? "instagram" : "youtube";
  return `https://unavatar.io/${provider}/${encodeURIComponent(handle)}?fallback=${encodeURIComponent(fallback)}`;
}

async function resolvePublicProfile(profile) {
  let displayName = profile.handle;
  let photo = fallbackPhoto(profile.platform, profile.handle, profile.handle);

  try {
    if (profile.platform === "Instagram") {
      const r = await fetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(profile.handle)}`,
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
          displayName = String(user.full_name || user.username || profile.handle).trim();
          photo = String(user.profile_pic_url_hd || user.profile_pic_url || photo);
        }
      }
    }

    if (profile.platform === "YouTube") {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(profile.url)}&format=json`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );

      if (r.ok) {
        const data = await r.json();
        displayName = String(data?.author_name || profile.handle).trim();
        photo = String(data?.thumbnail_url || photo);
      }
    }
  } catch (e) {
    console.warn("Profile enrichment failed:", e);
  }

  return {
    displayName: displayName || profile.handle,
    photo
  };
}

function normalizeProfile(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;

  if (value.startsWith('@')) {
    const handle = value.slice(1).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120);
    if (!handle) return null;
    return {
      platform: 'Instagram',
      handle,
      url: `https://instagram.com/${handle}`
    };
  }

  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'instagram.com') {
    const handle = String(parts[0] || '').replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120);
    if (!handle) return null;
    return { platform: 'Instagram', handle, url: `https://instagram.com/${handle}` };
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const first = String(parts[0] || '').replace(/^@/, '');
    const second = String(parts[1] || '').replace(/^@/, '');
    const handle = first.toLowerCase() === 'channel' || first.toLowerCase() === 'c' || first.toLowerCase() === 'user'
      ? second
      : first;
    const clean = handle.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120);
    if (!clean) return null;
    return { platform: 'YouTube', handle: clean, url: url.href.split(/[?#]/)[0] };
  }

  return null;
}

async function getDodoProductId(env) {
  if (env.DODO_PRODUCT_ID) return String(env.DODO_PRODUCT_ID).trim();

  const response = await fetch('https://live.dodopayments.com/products?page_size=100&page_number=0&archived=false&recurring=false', {
    headers: { Authorization: `Bearer ${env.DODO_API_KEY}` }
  });

  if (!response.ok) throw new Error('Unable to list Dodo products');
  const data = await response.json();
  const products = Array.isArray(data?.items) ? data.items : [];
  const match = products.find(p => p?.name === 'Nambarone Creator Billboard Placement');
  if (!match?.product_id) throw new Error('Nambarone Dodo product not found');
  return match.product_id;
}

export async function onRequestPost({ env, request }) {
  if (String(env.NAMBARONE_PAYMENTS_LIVE || '').toLowerCase() !== 'true') {
    return json({ error: 'Checkout is not connected yet.' }, 503);
  }

  if (!env.DB || !env.DODO_API_KEY) {
    return json({ error: 'Payment service is not configured.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const profile = normalizeProfile(body?.profile);
  const category = String(body?.category || '').trim();
  const board = body?.board === 'today' ? 'today' : 'all-time';
  const amount = Math.floor(Number(body?.amount));
  const profileInfo = await resolvePublicProfile(profile);
  const photo = profileInfo.photo;

  if (!profile) return json({ error: 'Use an Instagram or YouTube profile.' }, 400);
  if (!ALLOWED_CATEGORIES.has(category)) return json({ error: 'Choose a valid category.' }, 400);
  if (!Number.isSafeInteger(amount) || amount < MIN_RUPEES || amount > MAX_RUPEES) {
    return json({ error: `Billboard placement must be between ₹${MIN_RUPEES.toLocaleString('en-IN')} and ₹${MAX_RUPEES.toLocaleString('en-IN')}.` }, 400);
  }

  const db = env.DB;
  const today = todayIndia();

  const existing = await db.prepare(`
    SELECT id,total,today,today_date
    FROM listings
    WHERE handle=?
    LIMIT 1
  `).bind(profile.handle).first();

  if (existing) {
    const current = board === 'today'
      ? (existing.today_date === today ? Number(existing.today || 0) : 0)
      : Number(existing.total || 0);

    if (amount <= current) {
      return json({
        error: `That creator is already at ${board === 'today' ? 'Today' : 'All-time'} ₹${current.toLocaleString('en-IN')}. Pay a higher amount to move the placement.`
      }, 409);
    }
  }

  const claimToken = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO creators(platform,platform_handle,canonical_url,display_name,photo,verified_at)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(platform,platform_handle) DO UPDATE SET
      canonical_url=excluded.canonical_url,
      display_name=excluded.display_name,
      photo=CASE WHEN excluded.photo<>'' THEN excluded.photo ELSE creators.photo END,
      verified_at=CURRENT_TIMESTAMP
  `).bind(
    profile.platform,
    profile.handle,
    profile.url,
    profileInfo.displayName,
    profileInfo.photo
  ).run();

  const creator = await db.prepare(`
    SELECT id FROM creators WHERE platform=? AND platform_handle=? LIMIT 1
  `).bind(profile.platform, profile.handle).first();

  if (!creator?.id) return json({ error: 'Could not prepare the placement.' }, 500);

  await db.prepare(`
    INSERT INTO claims(creator_id,listing_id,amount,payment_provider,payment_reference,status,created_at)
    VALUES(?,NULL,?,'dodo',?,'pending',CURRENT_TIMESTAMP)
  `).bind(creator.id, amount, claimToken).run();

  let productId;
  try {
    productId = await getDodoProductId(env);
  } catch (error) {
    console.error('Dodo product lookup failed:', error);
    await db.prepare(`DELETE FROM claims WHERE payment_reference=? AND status='pending'`).bind(claimToken).run();
    return json({ error: 'Checkout is temporarily unavailable.' }, 502);
  }

  const amountPaise = amount * 100;

  const checkoutResponse = await fetch('https://live.dodopayments.com/checkouts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DODO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      product_cart: [{
        product_id: productId,
        quantity: 1,
        amount: amountPaise
      }],
      billing_currency: 'INR',
      return_url: 'https://nambarone.lol/',
      metadata: {
        claim_token: claimToken,
        amount_rupees: String(amount),
        amount_paise: String(amountPaise),
        board,
        category,
        profile_url: profile.url,
        product_id: productId
      }
    })
  });

  if (!checkoutResponse.ok) {
    console.error('Dodo checkout creation failed:', await checkoutResponse.text());
    await db.prepare(`DELETE FROM claims WHERE payment_reference=? AND status='pending'`).bind(claimToken).run();
    return json({ error: 'Checkout is temporarily unavailable.' }, 502);
  }

  const checkout = await checkoutResponse.json();

  if (!checkout?.checkout_url) {
    console.error('Dodo checkout response missing checkout_url');
    await db.prepare(`DELETE FROM claims WHERE payment_reference=? AND status='pending'`).bind(claimToken).run();
    return json({ error: 'Checkout is temporarily unavailable.' }, 502);
  }

  return json({ checkout_url: checkout.checkout_url });
}

export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405 });
}
