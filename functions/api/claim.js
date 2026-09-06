export async function onRequestPost({ env, request }) {
  // Payment-provider verification is the only remaining write path. Never accept a
  // client-side "paid" flag and never write a rank before payment is verified.
  return Response.json({ error: 'Checkout is not connected yet.' }, { status: 503 });
}
