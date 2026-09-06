#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()

claim = ROOT / "functions/api/claim.js"
state = ROOT / "functions/api/state.js"

if not claim.exists() or not state.exists():
    raise SystemExit("Run this from the root of the Nambarone repository.")

claim_text = claim.read_text()

needle = """function todayIndia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}
"""

helper = needle + r"""
function fallbackPhoto(platform, handle, name) {
  const label = encodeURIComponent(String(name || handle || 'N').slice(0, 24));
  const fallback = `https://ui-avatars.com/api/?name=${label}&background=c1121f&color=fff8ea&size=160&font-size=0.42&bold=true`;
  const provider = platform === 'Instagram' ? 'instagram' : 'youtube';
  return `https://unavatar.io/${provider}/${encodeURIComponent(handle)}?fallback=${encodeURIComponent(fallback)}`;
}

async function resolvePublicProfile(profile) {
  const fallback = fallbackPhoto(profile.platform, profile.handle, profile.handle);
  let displayName = profile.handle;
  let photo = fallback;

  try {
    if (profile.platform === 'Instagram') {
      const response = await fetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(profile.handle)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'X-IG-App-ID': '936619743392459'
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        const user = data?.data?.user;
        if (user) {
          displayName = String(user.full_name || user.username || profile.handle).trim() || profile.handle;
          photo = String(user.profile_pic_url_hd || user.profile_pic_url || fallback);
        }
      }
    } else if (profile.platform === 'YouTube') {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(profile.url)}&format=json`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (response.ok) {
        const data = await response.json();
        displayName = String(data?.author_name || profile.handle).trim() || profile.handle;
        photo = String(data?.thumbnail_url || fallback);
      }
    }
  } catch (error) {
    console.warn('Profile enrichment failed:', error);
  }

  return { displayName, photo };
}
"""

if "async function resolvePublicProfile(profile)" not in claim_text:
    if needle not in claim_text:
        raise SystemExit("Could not find the claim.js insertion point.")
    claim_text = claim_text.replace(needle, helper, 1)

claim_text = claim_text.replace(
"""  const photo = String(body?.photo || '').trim().slice(0, 1000);
""",
"""  const profileInfo = await resolvePublicProfile(profile);
  const photo = profileInfo.photo;
""")

claim_text = claim_text.replace(
"""    profile.handle,
    profile.url,
    profile.handle,
    photo
""",
"""    profile.handle,
    profile.url,
    profileInfo.displayName,
    photo
""")

claim.write_text(claim_text)

state_text = state.read_text()

if "async function enrichLegacyListing" not in state_text:
    helper2 = r"""
function fallbackPhoto(platform, handle, name) {
  const label = encodeURIComponent(String(name || handle || 'N').slice(0, 24));
  const fallback = `https://ui-avatars.com/api/?name=${label}&background=c1121f&color=fff8ea&size=160&font-size=0.42&bold=true`;
  const provider = platform === 'Instagram' ? 'instagram' : 'youtube';
  return `https://unavatar.io/${provider}/${encodeURIComponent(handle)}?fallback=${encodeURIComponent(fallback)}`;
}

async function enrichLegacyListing(db, row) {
  if (row.photo && row.name && row.name.toLowerCase() !== row.handle.toLowerCase()) return row;

  let name = row.name || row.handle;
  let photo = row.photo || fallbackPhoto(row.platform, row.handle, row.name || row.handle);

  try {
    if (row.platform === 'Instagram') {
      const response = await fetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(row.handle)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'X-IG-App-ID': '936619743392459'
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        const user = data?.data?.user;
        if (user) {
          name = String(user.full_name || user.username || row.handle).trim() || row.handle;
          photo = String(user.profile_pic_url_hd || user.profile_pic_url || photo);
        }
      }
    } else if (row.platform === 'YouTube') {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/@${row.handle}`)}&format=json`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (response.ok) {
        const data = await response.json();
        name = String(data?.author_name || row.handle).trim() || row.handle;
        photo = String(data?.thumbnail_url || photo);
      }
    }
  } catch (error) {
    console.warn('Legacy profile enrichment failed:', error);
  }

  if (name !== row.name || photo !== row.photo) {
    await db.prepare(`
      UPDATE listings
      SET name=?, photo=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(name, photo, row.id).run();
  }

  return { ...row, name, photo };
}
"""
    state_text = state_text.replace(
        "async function onRequestGet({ env }) {",
        helper2 + "\nasync function onRequestGet({ env }) {",
        1
    )

state_text = state_text.replace(
"""  const listings = await db.prepare(`
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
""",
"""  const listings = await db.prepare(`
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
    enrichedListings.push(await enrichLegacyListing(db, row));
  }
""")

state_text = state_text.replace(
"      listings: listings.results || [],",
"      listings: enrichedListings,"
)

state.write_text(state_text)

print("Done. Updated functions/api/claim.js and functions/api/state.js.")
print("Next: git add functions/api/claim.js functions/api/state.js && git commit -m \"Resolve creator names and profile photos\" && git push")
