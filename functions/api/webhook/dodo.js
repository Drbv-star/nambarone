export async function onRequestPost() {
  return Response.json({ ok: true });
}

export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405 });
}
