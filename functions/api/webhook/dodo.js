const textEncoder = new TextEncoder();

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifyDodoWebhook(request, rawBody, secret) {
  const webhookId = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signatureHeader = request.headers.get('webhook-signature');

  if (!webhookId || !timestamp || !signatureHeader || !secret) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNumber) > 300) return false;

  const secretValue = secret.startsWith('whsec_') ? secret.slice(6) : secret;

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secretValue),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(signedContent)
  );

  const expected = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  const signatures = signatureHeader
    .split(' ')
    .map(value => value.trim())
    .filter(Boolean);

  return signatures.some(value => {
    const parts = value.split(',');
    if (parts.length !== 2) return false;

    const [version, receivedSignature] = parts;
    if (version !== 'v1') return false;

    return constantTimeEqual(expected, receivedSignature);
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

async function ensureProcessedWebhookTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS processed_webhooks (
      webhook_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function getDodoPayment(env, paymentId) {
  const response = await fetch(
    `https://live.dodopayments.com/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.DODO_API_KEY}`,
        Accept: 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Dodo payment lookup failed: ${response.status}`);
  }

  return response.json();
}

export async function onRequestPost(context) {
  const rawBody = await context.request.text();

  const valid = await verifyDodoWebhook(
    context.request,
    rawBody,
    context.env.DODO_PAYMENTS_WEBHOOK_KEY
  );

  if (!valid) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = String(payload?.type || '');
  if (eventType !== 'payment.succeeded') {
    return Response.json({ received: true, ignored: true });
  }

  const webhookId = context.request.headers.get('webhook-id');
  const paymentData = payload?.data || {};
  const paymentId = String(paymentData.payment_id || '');
  const claimToken = String(paymentData.metadata?.claim_token || '');

  // Dashboard example events do not carry a Nambarone claim token.
  // They are intentionally acknowledged without mutating the database.
  if (!paymentId || !claimToken) {
    return Response.json({ received: true, ignored: true });
  }

  const db = context.env.DB;
  if (!db || !context.env.DODO_API_KEY) {
    return Response.json({ error: 'Payment service is not configured' }, { status: 503 });
  }

  await ensureProcessedWebhookTable(db);

  const alreadyProcessed = await db.prepare(`
    SELECT webhook_id FROM processed_webhooks WHERE webhook_id=? LIMIT 1
  `).bind(webhookId).first();

  if (alreadyProcessed) {
    return Response.json({ received: true, duplicate: true });
  }

  const claim = await db.prepare(`
    SELECT
      cl.id,
      cl.creator_id AS creatorId,
      cl.listing_id AS listingId,
      cl.amount,
      cl.status,
      c.platform,
      c.platform_handle AS handle,
      c.canonical_url AS canonicalUrl,
      c.display_name AS displayName,
      c.photo
    FROM claims cl
    JOIN creators c ON c.id=cl.creator_id
    WHERE cl.payment_reference=? OR cl.payment_reference=?
    LIMIT 1
  `).bind(claimToken, paymentId).first();

  if (!claim) {
    return Response.json({ received: true, ignored: true });
  }

  if (claim.status === 'paid' && claim.listingId) {
    await db.prepare(`
      INSERT OR IGNORE INTO processed_webhooks(webhook_id,event_type)
      VALUES(?,?)
    `).bind(webhookId, eventType).run();

    return Response.json({ received: true, already_settled: true });
  }

  let payment;
  try {
    payment = await getDodoPayment(context.env, paymentId);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Payment verification temporarily unavailable' }, { status: 502 });
  }

  const expectedPaise = Number(claim.amount) * 100;
  const metadata = payment?.metadata || {};

  const productId = String(metadata.product_id || '');
  const verified =
    payment?.payment_id === paymentId &&
    metadata.claim_token === claimToken &&
    Number(metadata.amount_paise) === expectedPaise &&
    Number(metadata.amount_rupees) === Number(claim.amount) &&
    productId &&
    payment?.currency === 'INR' &&
    Number(payment?.total_amount || 0) >= expectedPaise &&
    Array.isArray(payment?.product_cart) &&
    payment.product_cart.some(item => String(item?.product_id || '') === productId);

  if (!verified) {
    console.error('Dodo payment verification mismatch:', {
      paymentId,
      claimToken,
      currency: payment?.currency,
      totalAmount: payment?.total_amount
    });
    return Response.json({ error: 'Payment verification failed' }, { status: 400 });
  }

  const board = metadata?.board === 'today' ? 'today' : 'all-time';
  const category = String(metadata?.category || 'YouTube');
  const today = todayIndia();

  if (!['YouTube', 'Instagram', 'Shorts', 'Gaming', 'Comedy', 'Education', 'Tech', 'Finance', 'Fashion', 'Food', 'Fitness'].includes(category)) {
    return Response.json({ error: 'Invalid claim category' }, { status: 400 });
  }

  const amount = Number(claim.amount);
  const handle = String(claim.handle);
  const displayName = String(claim.displayName || handle);
  const photo = String(claim.photo || '');
  const platform = String(claim.platform);
  const listingId = claim.listingId;

  const statements = [];

  if (!listingId) {
    statements.push(
      db.prepare(`
        INSERT INTO listings(
          handle,name,category,platform,photo,total,today,clicks,clicks_today,today_date,created_at,updated_at
        )
        VALUES(?,?,?,?,?,?,?,0,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(handle) DO UPDATE SET
          name=excluded.name,
          category=excluded.category,
          platform=excluded.platform,
          photo=CASE WHEN excluded.photo<>'' THEN excluded.photo ELSE listings.photo END,
          updated_at=CURRENT_TIMESTAMP
      `).bind(
        handle,
        displayName,
        category,
        platform,
        photo,
        amount,
        amount,
        today
      )
    );
  } else {
    statements.push(
      db.prepare(`
        UPDATE listings
        SET
          name=?,
          category=?,
          platform=?,
          photo=CASE WHEN ?<>'' THEN ? ELSE photo END,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(displayName, category, platform, photo, photo, listingId)
    );
  }

  statements.push(
    db.prepare(`
      UPDATE listings
      SET
        total=CASE WHEN total < ? THEN ? ELSE total END,
        today=CASE
          WHEN today_date=? THEN CASE WHEN today < ? THEN ? ELSE today END
          ELSE ?
        END,
        today_date=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE handle=?
    `).bind(amount, amount, today, amount, amount, amount, today, handle)
  );

  statements.push(
    db.prepare(`
      UPDATE claims
      SET
        listing_id=(SELECT id FROM listings WHERE handle=? LIMIT 1),
        payment_reference=?,
        status='paid'
      WHERE id=? AND status='pending'
    `).bind(handle, paymentId, claim.id)
  );

  statements.push(
    db.prepare(`
      INSERT INTO activity(listing_id,name,bid,rank,board,created_at)
      SELECT
        l.id,
        l.name,
        ?,
        1 + (
          SELECT COUNT(*)
          FROM listings o
          WHERE
            CASE
              WHEN ?='today' THEN
                (
                  (CASE WHEN o.today_date=? THEN o.today ELSE 0 END) >
                  (CASE WHEN l.today_date=? THEN l.today ELSE 0 END)
                )
                OR (
                  (CASE WHEN o.today_date=? THEN o.today ELSE 0 END) =
                  (CASE WHEN l.today_date=? THEN l.today ELSE 0 END)
                  AND o.created_at < l.created_at
                )
              ELSE
                (
                  o.total > l.total
                )
                OR (
                  o.total = l.total
                  AND o.created_at < l.created_at
                )
            END
        ),
        ?,
        CURRENT_TIMESTAMP
      FROM listings l
      WHERE l.handle=?
    `).bind(
      amount,
      board,
      today,
      today,
      today,
      today,
      board,
      handle
    )
  );

  statements.push(
    db.prepare(`UPDATE meta SET value=value+1 WHERE key='version'`)
  );

  // This final unique insert is deliberately inside the same atomic D1 batch.
  // If the same webhook arrives concurrently, the second transaction rolls back
  // instead of duplicating the rank/activity update.
  statements.push(
    db.prepare(`
      INSERT INTO processed_webhooks(webhook_id,event_type)
      VALUES(?,?)
    `).bind(webhookId, eventType)
  );

  try {
    await db.batch(statements);
  } catch (error) {
    console.error('Dodo settlement transaction failed:', error);
    return Response.json({ error: 'Settlement temporarily unavailable' }, { status: 500 });
  }

  return Response.json({
    received: true,
    settled: true
  });
}

export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405 });
}
