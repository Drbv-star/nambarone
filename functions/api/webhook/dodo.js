const textEncoder = new TextEncoder();

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function hexToBytes(value) {
  const bytes = new Uint8Array(value.length / 2);

  for (let i = 0; i < value.length; i += 2) {
    bytes[i / 2] = parseInt(value.slice(i, i + 2), 16);
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

  if (!webhookId || !timestamp || !signatureHeader || !secret) {
    return false;
  }

  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  // Reject old/replayed webhook requests.
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestampNumber) > 300) {
    return false;
  }

  const secretValue = secret.startsWith('whsec_')
    ? secret.slice(6)
    : secret;

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secretValue),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signedContent =
    `${webhookId}.${timestamp}.${rawBody}`;

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

export async function onRequestPost(context) {
  const rawBody = await context.request.text();

  const valid = await verifyDodoWebhook(
    context.request,
    rawBody,
    context.env.DODO_PAYMENTS_WEBHOOK_KEY
  );

  if (!valid) {
    return Response.json(
      { error: 'Invalid webhook signature' },
      { status: 401 }
    );
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  console.log('Verified Dodo webhook:', payload.type);

  return Response.json({
    received: true
  });
}

export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405 });
}
