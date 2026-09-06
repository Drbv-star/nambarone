const API = "/api";
const LIVE_POLL_MS = 3000;
let serverVersion = Number(localStorage.getItem("nambarone_server_version") || 0);
(function () {
  const CATS = ["All","YouTube","Instagram","Shorts","Gaming","Comedy","Education","Tech","Finance","Fashion","Food","Fitness"];
  const storeKey = "nambarone_listings_v2";
  const actKey = "nambarone_activity_v2";
  let listings = JSON.parse(localStorage.getItem(storeKey) || "null") || [];
  let activity = JSON.parse(localStorage.getItem(actKey) || "null") || [];
  let filter = "All";
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let dirtyToday = false;
  listings.forEach(function(x){
    if (x.todayDate !== todayKey) {
      x.today = 0;
      x.clicksToday = 0;
      x.todayDate = todayKey;
      dirtyToday = true;
    }
  });
  if (dirtyToday) {
    localStorage.setItem(storeKey, JSON.stringify(listings));
  }
  const pageBoard = document.body.dataset.board || "all";
  const pageSort = document.body.dataset.sort || "money";

  function inr(n){ return "₹" + Number(n).toLocaleString("en-IN"); }
  function esc(v){
    return String(v ?? "").replace(/[&<>\"']/g, function(ch){
      return ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"})[ch];
    });
  }
  function safeUrl(raw){
    try {
      const u = new URL(raw, location.origin);
      return ["https:","http:"].includes(u.protocol) ? u.href : "#";
    } catch(e){ return "#"; }
  }
  function photoFor(x) {
    if (x.photo) return safeUrl(x.photo);
    const raw = String(x.platform || x.handle || "").trim();
    const isInstagram = /instagram\.com/i.test(raw) || String(x.cat || "").toLowerCase() === "instagram";
    const isYoutube = /youtube\.com|youtu\.be/i.test(raw) || String(x.cat || "").toLowerCase() === "youtube" || String(x.cat || "").toLowerCase() === "shorts";
    const match = raw.match(/(?:instagram\.com|youtube\.com\/@?|youtube\.com\/channel\/|youtube\.com\/c\/|youtu\.be\/)([^/?#]+)/i);
    const handle = match ? match[1].replace(/^@/, "") : String(x.handle || "").replace(/^@/, "").replace(/[^a-zA-Z0-9._-]/g, "");
    if (handle && isInstagram) return "https://unavatar.io/instagram/" + encodeURIComponent(handle);
    if (handle && isYoutube) return "https://unavatar.io/youtube/" + encodeURIComponent(handle);
    const label = encodeURIComponent((x.name || x.handle || "N").slice(0, 24));
    return "https://ui-avatars.com/api/?name=" + label + "&background=c1121f&color=fff8ea&size=96&font-size=0.42&bold=true";
  }
  function hrefFor(platform, handle, cat) {
    const p = String(platform || "").trim();
    const h = String(handle || "").trim().replace(/^@+/, "");
    const c = String(cat || "").trim().toLowerCase();

    if (!p && !h) return "#";

    if (/^https?:\/\//i.test(p)) {
      return safeUrl(p);
    }

    if (/instagram\.com/i.test(p) || c === "instagram") {
      return h
        ? safeUrl("https://www.instagram.com/" + encodeURIComponent(h) + "/")
        : "#";
    }

    if (/youtube\.com|youtu\.be/i.test(p) || c === "youtube" || c === "shorts") {
      return h
        ? safeUrl("https://www.youtube.com/@" + encodeURIComponent(h))
        : "#";
    }

    if (p.startsWith("@")) {
      return safeUrl("https://www.instagram.com/" + encodeURIComponent(p.slice(1)) + "/");
    }

    return safeUrl("https://" + p.replace(/^\/+/, ""));
  }
  function cfg(){ return window.NAMBARONE || {}; }
  function save(){
    localStorage.setItem(storeKey, JSON.stringify(listings));
    localStorage.setItem(actKey, JSON.stringify(activity.slice(0, 50)));
  }
  async function pullShared(force){
    const url = API + "/state" + (force ? "?full=1" : "?v=" + encodeURIComponent(serverVersion));
    try {
      const r = await fetch(url, { cache: "no-store", headers: { "Accept": "application/json" } });
      if (!r.ok) throw new Error("state " + r.status);
      const data = await r.json();
      if (data && data.changed === false) return;
      if (data && Array.isArray(data.listings)) {
        listings = data.listings;
        activity = Array.isArray(data.activity) ? data.activity : [];
        serverVersion = Number(data.version || serverVersion || 0);
        cacheState();
        render();
      }
    } catch(e) { /* cached state remains visible; server state is authoritative */ }
  }
  function cacheState(){
    localStorage.setItem(storeKey, JSON.stringify(listings));
    localStorage.setItem(actKey, JSON.stringify(activity.slice(0, 50)));
    localStorage.setItem("nambarone_server_version", String(serverVersion));
  }
  function startLiveSync(){
    pullShared(true);
    setInterval(() => pullShared(false), LIVE_POLL_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pullShared(true); });
  }
  function score(x){ return pageBoard === "today" ? (x.today || 0) : (x.total || 0); }
  function listForBoard(){
    let rows = listings.slice();
    if (pageBoard === "today") rows = rows.filter(x => (x.today || 0) > 0);
    if (filter !== "All") rows = rows.filter(x => x.cat === filter);
    if (pageSort === "clicks") return rows.sort((a,b) => (b.clicks||0) - (a.clicks||0) || a.created - b.created);
    return rows.sort((a,b) => score(b) - score(a) || a.created - b.created);
  }
  function topFor(board){
    if (!listings.length) return 0;
    if (board === "today") return Math.max(0, ...listings.map(x => x.today || 0));
    return Math.max(0, ...listings.map(x => x.total || 0));
  }
  function leader(board){
    const field = board === "today" ? "today" : "total";
    const m = topFor(board);
    if (!m) return null;
    return listings.filter(x => (x[field]||0) === m).sort((a,b)=>a.created-b.created)[0];
  }
  function toast(msg){
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.style.display = "block";
    setTimeout(() => el.style.display = "none", 2800);
  }
  function setAmt(n){
    const input = document.getElementById("amount");
    if (input) input.value = Math.max(40, Math.floor(Number(n) || 40));
  }
  function findListing(raw) {
    const key = (raw || "").trim().toLowerCase();
    if (!key) return null;
    return listings.find(x =>
      x.handle.toLowerCase() === key ||
      x.handle.toLowerCase() === "@" + key ||
      (x.platform || "").toLowerCase() === key ||
      (x.platform || "").toLowerCase().includes(key.replace(/^@/, ""))
    ) || null;
  }

  window.nambarTake = function (handle, amt) {
    const h = document.getElementById("handle");
    if (h) h.value = handle;
    setAmt(amt);
    document.getElementById("claim")?.scrollIntoView({ behavior: "smooth" });
  };

  function pageUrl(){
    try { return location.href.split("#")[0]; } catch(e) { return "https://nambarone.lol/"; }
  }
  function shareCopy(row, rank){
    const r = rank || "—";
    return "I claimed a spot on the Nambarone creator billboard.\n" +
      row.name + " is #" + r + " on Nambarone.lol · " + (row.handle||"") + "\n" +
      "Visits from the sheet: " + (row.clicks||0) + "\n" +
      pageUrl();
  }
  function shareUrl(row, rank){
    return pageUrl() + "#c=" + encodeURIComponent(row.handle||row.id);
  }
  window.nambarShare = function (id, where) {
    const ranked = listForBoard();
    const row = listings.find(x => String(x.id) === String(id));
    if (!row) return;
    const rank = ranked.findIndex(x => x.id === row.id) + 1 || "—";
    const text = shareCopy(row, rank);
    const url = shareUrl(row, rank);
    if (where === "ig") {
      // Instagram does not expose a general web URL for posting a feed/story.
      // On supported phones, use the native share sheet so Instagram can be selected.
      if (navigator.share) {
        navigator.share({ title: "My Nambarone billboard spot", text: text, url: url })
          .catch(function(){});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function(){
          toast("Slip copied. Open Instagram and paste it into your Story, post, or bio.");
        }).catch(function(){
          toast("Copy the slip below and share it on Instagram.");
        });
      } else {
        toast("Copy the slip below and share it on Instagram.");
      }
    } else if (where === "tg") {
      window.open("https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text), "_blank");
    } else if (where === "copy") {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      toast("Slip copied. Paste it on Instagram, YouTube, or anywhere else.");
    }
    showSlip(row, rank);
  };
  function showSlip(row, rank){
    let slip = document.getElementById("slip");
    if (!slip) {
      slip = document.createElement("div");
      slip.id = "slip";
      slip.className = "slip-wrap";
      document.body.appendChild(slip);
    }
    const url = shareUrl(row, rank);
    slip.innerHTML = `<div class="slip">
      <button class="slip-x" type="button" onclick="document.getElementById('slip').style.display='none'">Close</button>
      <p class="kicker">Clipping</p>
      <h3>My Nambarone billboard spot.<br>Creator placement claimed.</h3>
      <p class="slip-name">${row.name} · ${row.handle}</p>
      <p>Billboard #${rank} · ${row.cat || ""} · Visits from this billboard ${row.clicks||0}</p>
      <p class="fine">${url}</p>
      <div class="slip-shares">
        <button type="button" onclick="nambarShare('${row.id}','ig')">Instagram</button>
        <button type="button" onclick="nambarShare('${row.id}','tg')">Telegram</button>
        <button type="button" onclick="nambarShare('${row.id}','copy')">Copy slip</button>
      </div>
      <p class="fine">Paste the slip on Instagram Stories, YouTube community, or your bio.</p>
    </div>`;
    slip.style.display = "flex";
  }

  window.nambarClick = function (id) {
    const row = listings.find(x => String(x.id) === String(id));
    if (!row) return;
    fetch(API + "/click", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:String(id)}) }).catch(function(){});
    row.clicks = (row.clicks || 0) + 1;
    row.clicksToday = (row.clicksToday || 0) + 1;
    save();
    render();
  };

  function renderStats(){
  const el = document.getElementById("stats");
  if (!el) return;
  const t = topFor("today");
  const a = topFor("all");
  const clicks = listings.reduce((sum,x) => sum + (x.clicks || 0), 0);

  function card(row, amount, title, rankLabel){
    if (!row) {
      return '<div class="stat"><b>₹40</b><span>' + title + '<br>OPEN</span></div>';
    }

    const url = hrefFor(row.platform, row.handle, row.cat);
    const img = photoFor(row);
    const name = esc(row.name || row.handle || "Unknown");
    const handle = esc(row.handle || "");

    return '<div class="stat"><a href="' + url + '" target="_blank" rel="noopener" class="top">' +
      '<img class="avatar" src="' + img + '" alt="" loading="lazy">' +
      '<span><b>' + rankLabel + ' · ₹' + int(amount) + '</b><br>' +
      title + '<br><strong>' + name + '</strong><br>' + handle +
      '</span></a></div>';
  }

  el.innerHTML =
    card(leader("today"), t, "TODAY'S TOP", "#1") +
    card(leader("all"), a, "ALL-TIME", "#1") +
    '<div class="stat"><b>' + listings.length + '</b><span>' + clicks + ' PROFILE CLICKS</span></div>';
}
function renderBoard(){
    const el = document.getElementById("board");
    if (!el) return;
    const rows = listForBoard();
    const top = pageBoard === "today" ? topFor("today") : topFor("all");
    if (!rows.length) {
      el.innerHTML = `<p class="fine">The sheet is empty. First name on ${pageBoard === "today" ? "Today" : "All-time"} costs ₹40.</p>`;
      return;
    }
    el.innerHTML = `<table class="board">
      <thead><tr>
        <th>Rank</th><th>Creator</th><th>Today</th><th>All-time</th><th>Clicks</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map((x,i) => {
          const rank = i + 1;
          const steal = Math.max(40, (rank === 1 ? top + 1 : score(x) + 1));
          const url = hrefFor(x.platform, x.handle, x.cat);
          const safeId = esc(x.id);
          const safeHandle = esc(x.handle);
          const safeName = esc(x.name);
          const safeCat = esc(x.cat);
          const safePlatform = esc(x.platform);
          return `<tr class="${rank===1?"one":""}">
            <td class="r">#${rank}</td>
            <td>
              <div class="who">
                <a href="${url}" target="_blank" rel="noopener" onclick="nambarClick('${safeId}')">
                  <img class="avatar" src="${photoFor(x)}" alt="" loading="lazy" />
                </a>
                <div>
                  <a class="name" href="${url}" target="_blank" rel="noopener" onclick="nambarClick('${safeId}')">${safeName}</a>
                  <span class="sub">${safeHandle} · ${safeCat}</span>
                  <a class="sub" href="${url}" target="_blank" rel="noopener" onclick="nambarClick('${safeId}')">${safePlatform}</a>
                  <span class="visits">Visits from Nambarone · <b>${x.clicks||0}</b> total · ${x.clicksToday||0} today</span>
                </div>
              </div>
            </td>
            <td class="money">${inr(x.today||0)}</td>
            <td class="money">${inr(x.total||0)}</td>
            <td class="money">${x.clicks||0}<span class="sub">from here</span></td>
            <td>
              <span class="take" onclick="nambarTake('${safeHandle}', ${steal})">Take · ${inr(steal)}</span>
              <span class="take share" onclick="nambarShare('${safeId}','copy')">Share slip</span>
            </td>
            <td class="mob-meta">
              <span>Today ${inr(x.today||0)}</span>
              <span>All-time ${inr(x.total||0)}</span>
              <span>Visits from here ${x.clicks||0}</span>
            </td>
            <td class="mob-take">
              <span class="take" onclick="nambarTake('${safeHandle}', ${steal})">Take this spot · ${inr(steal)}</span>
              <span class="take share" onclick="nambarShare('${safeId}','copy')">Share this slip</span>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }
  function renderActivity(){
    const el = document.getElementById("activity");
    if (!el) return;
    if (!activity.length) {
      el.innerHTML = `<p class="fine">No creators yet. Be the first to claim a billboard spot.</p>`;
      return;
    }
    el.innerHTML = activity.map(a =>
      `<div class="act"><b>${a.name}</b> claimed a billboard spot for ${inr(a.bid)} · #${a.rank} on ${a.board || "all-time"} · ${a.t}</div>`
    ).join("");
  }
  function renderNeed(){
    const el = document.getElementById("needHint");
    if (!el) return;
    const need = Math.max(40, topFor(pageBoard) + 1);
    el.textContent = (pageBoard === "today" ? "Today" : "All-time") + " #1 costs " + inr(need);
  }
  function renderLookup(){
    const out = document.getElementById("lookupOut");
    if (!out) return;
    const q = (document.getElementById("lookup")?.value || "").trim();
    if (!q) { out.innerHTML = ""; return; }
    const row = findListing(q);
    if (!row) {
      out.innerHTML = `<p class="fine">No listing for ${q}.</p>`;
      return;
    }
    const rankedAll = listings.slice().sort((a,b)=> (b.total||0)-(a.total||0) || a.created-b.created);
    const rankedToday = listings.filter(x=>(x.today||0)>0).sort((a,b)=> (b.today||0)-(a.today||0) || a.created-b.created);
    out.innerHTML = `<table class="board"><tbody>
      <tr><td>Photo</td><td><img class="avatar lg" src="${photoFor(row)}" alt="" /></td></tr>
      <tr><td>Creator</td><td class="name">${row.name} · ${row.handle}</td></tr>
      <tr><td>All-time rank</td><td>#${rankedAll.findIndex(x=>x.id===row.id)+1} · ${inr(row.total||0)}</td></tr>
      <tr><td>Today rank</td><td>${rankedToday.findIndex(x=>x.id===row.id)>=0 ? "#"+ (rankedToday.findIndex(x=>x.id===row.id)+1) : "—"} · ${inr(row.today||0)}</td></tr>
      <tr><td>Visits from Nambarone</td><td>${row.clicks||0} people opened this profile from the sheet · ${row.clicksToday||0} today</td></tr>
      <tr><td>Link</td><td><a href="${hrefFor(row.platform)}" target="_blank" rel="noopener" onclick="nambarClick('${row.id}')">${row.platform}</a></td></tr>
    </tbody></table>`;
  }
  function render(){
    renderStats(); renderFilters(); renderBoard(); renderActivity(); renderNeed(); renderLookup();
  }

  document.getElementById("plus")?.addEventListener("click", () => setAmt(Number(document.getElementById("amount").value) + 1));
  document.getElementById("minus")?.addEventListener("click", () => setAmt(Number(document.getElementById("amount").value) - 1));
  document.getElementById("need1")?.addEventListener("click", () => setAmt(topFor(pageBoard) + 1));
  document.getElementById("lookupBtn")?.addEventListener("click", renderLookup);
  document.getElementById("lookup")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); renderLookup(); } });
  document.getElementById("pay")?.addEventListener("click", async () => {
    const raw = (document.getElementById("handle")?.value || "").trim();
    const cat = document.getElementById("category")?.value || "YouTube";
    const photo = (document.getElementById("photo")?.value || "").trim();
    const amt = Math.floor(Number(document.getElementById("amount")?.value));
    if (!raw) return toast("Add an Instagram or YouTube profile.");
    if (!Number.isFinite(amt) || amt < 40) return toast("Minimum billboard placement is ₹40.");
    try {
      const r = await fetch(API + "/claim", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({profile:raw, category:cat, photo, amount:amt, board:pageBoard}) });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) return toast(data.error || "Checkout is temporarily unavailable.");
      if (data.checkout_url) location.href = data.checkout_url;
    } catch(e) { toast("Checkout is temporarily unavailable."); }
  });

  render();
  startLiveSync();
})();
