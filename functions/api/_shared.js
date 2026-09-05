export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
});

export function todayIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

export function cleanHandle(v) {
  return String(v || "").trim().replace(/^@+/, "").replace(/[^a-zA-Z0-9._/-]/g, "").slice(0, 120);
}

export function cleanText(v, max = 160) {
  return String(v || "").trim().slice(0, max);
}

export function normalizePlatform(v) {
  const raw = cleanText(v, 240);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/instagram\.com|youtube\.com|youtu\.be/i.test(raw)) return "https://" + raw.replace(/^\/+/, "");
  if (raw.startsWith("@")) return "https://instagram.com/" + raw.slice(1);
  return raw;
}

export async function bumpVersion(db) {
  await db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'version'").run();
}

export async function getVersion(db) {
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'version'").first();
  return Number(row?.value || 0);
}

export function withToday(row, today) {
  const same = row.today_date === today;
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    cat: row.category,
    category: row.category,
    platform: row.platform,
    photo: row.photo || "",
    total: Number(row.total || 0),
    today: same ? Number(row.today || 0) : 0,
    clicks: Number(row.clicks || 0),
    clicksToday: same ? Number(row.clicks_today || 0) : 0,
    todayDate: today,
    created: Number(row.created_at || 0),
    updated: Number(row.updated_at || 0)
  };
}

export async function readState(db) {
  const today = todayIndia();
  const rows = await db.prepare("SELECT * FROM listings ORDER BY total DESC, created_at ASC").all();
  const acts = await db.prepare("SELECT name, bid, rank, board, created_at FROM activity ORDER BY created_at DESC LIMIT 50").all();
  const version = await getVersion(db);
  return {
    version,
    listings: (rows.results || []).map(r => withToday(r, today)),
    activity: (acts.results || []).map(a => ({ name: a.name, bid: Number(a.bid), rank: Number(a.rank), board: a.board, t: new Date(Number(a.created_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) }))
  };
}
