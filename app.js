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
    const label = encodeURIComponent((x.name || x.handle || "N").slice(0, 24));
    return "https://ui-avatars.com/api/?name=" + label + "&background=c1121f&color=fff8ea&size=96&font-size=0.42&bold=true";
  }
  function hrefFor(platform) {
    const p = (platform || "").trim();
    if (!p) return "#";
    if (/^https?:\/\//i.test(p)) return safeUrl(p);
    if (p.includes("youtube.com") || p.includes("youtu.be") || p.includes("instagram.com")) return safeUrl("https://" + p.replace(/^\/+/, ""));
    if (p.startsWith("@")) return safeUrl("https://instagram.com/" + p.slice(1));
    return safeUrl("https://" + p.replace(/^\/+/, ""));
  }
  function cfg(){ return window.NAMBARONE || {}; }
  function save(){
    localStorage.setItem(storeKey, JSON.stringify(listings));
    localStorage.setItem(actKey, JSON.stringify(activity.slice(0, 50)));
    if (!cfg().launchMode) pushShared();
  }
  function pushShared(){
    const c = cfg();
    if (!c.jsonbinId || !c.jsonbinKey) return;
    fetch("https://api.jsonbin.io/v3/b/" + c.jsonbinId, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": c.jsonbinKey
      },
      body: JSON.stringify({ listings: listings, activity: activity.slice(0, 50) })
    }).catch(function(){});
  }
  function pullShared(){
    const c = cfg();
    if (!c.jsonbinId) return Promise.resolve();
    const headers = { "X-Bin-Meta": "false" };
    if (c.jsonbinKey) headers["X-Master-Key"] = c.jsonbinKey;
    return fetch("https://api.jsonbin.io/v3/b/" + c.jsonbinId + "/latest", { headers: headers })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){
        const rec = data && (data.record || data);
        if (!rec) return;
        if (Array.isArray(rec.listings)) listings = rec.listings;
        if (Array.isArray(rec.activity)) activity = rec.activity;
        localStorage.setItem(storeKey, JSON.stringify(listings));
        localStorage.setItem(actKey, JSON.stringify(activity.slice(0, 50)));
        render();
      }).catch(function(){});
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
    if (input) input.value = Math.max(10, Math.floor(Number(n) || 10));
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
    return "Pay to claim your spot and be Nambarone.\n" +
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
    if (where === "wa") {
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
    } else if (where === "x") {
      window.open("https://x.com/intent/post?text=" + encodeURIComponent(text), "_blank");
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
      <h3>Pay to claim your spot.<br>Be Nambarone.</h3>
      <p class="slip-name">${row.name} · ${row.handle}</p>
      <p>Rank #${rank} · ${row.cat || ""} · Visits from this sheet ${row.clicks||0}</p>
      <p class="fine">${url}</p>
      <div class="slip-shares">
        <button type="button" onclick="nambarShare('${row.id}','wa')">WhatsApp</button>
        <button type="button" onclick="nambarShare('${row.id}','x')">X</button>
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
    if (row.todayDate !== todayKey) { row.today = 0; row.clicksToday = 0; row.todayDate = todayKey; }
    row.clicks = (row.clicks || 0) + 1;
    row.clicksToday = (row.clicksToday || 0) + 1;
    save();
    render();
  };

  function renderStats(){
    const el = document.getElementById("stats");
    if (!el) return;
    const t = topFor("today"), a = topFor("all");
    const tw = leader("today"), aw = leader("all");
    const clicks = listings.reduce((s,x)=>s+(x.clicks||0),0);
    el.innerHTML = `
      <div class="stat"><b>${t ? inr(t) : "₹10"}</b><span>Today’s top${tw && t ? " · " + tw.name : " · open"}</span></div>
      <div class="stat"><b>${a ? inr(a) : "₹10"}</b><span>All-time #1${aw && a ? " · " + aw.name : " · open"}</span></div>
      <div class="stat"><b>${listings.length}</b><span>${clicks} profile clicks</span></div>`;
  }
  function renderFilters(){
    const el = document.getElementById("filters");
    if (!el) return;
    el.innerHTML = CATS.map(c => `<button type="button" class="${c===filter?"on":""}" data-c="${c}">${c}</button>`).join("");
    el.querySelectorAll("button").forEach(b => b.onclick = () => { filter = b.dataset.c; render(); });
  }
  function renderBoard(){
    const el = document.getElementById("board");
    if (!el) return;
    const rows = listForBoard();
    const top = pageBoard === "today" ? topFor("today") : topFor("all");
    if (!rows.length) {
      el.innerHTML = `<p class="fine">The sheet is empty. First name on ${pageBoard === "today" ? "Today" : "All-time"} costs ₹10.</p>`;
      return;
    }
    el.innerHTML = `<table class="board">
      <thead><tr>
        <th>Rank</th><th>Creator</th><th>Today</th><th>All-time</th><th>Clicks</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map((x,i) => {
          const rank = i + 1;
          const steal = Math.max(10, (rank === 1 ? top + 1 : score(x) + 1));
          const url = hrefFor(x.platform);
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
              <span class="take" onclick="nambarTake('${safeHandle}', ${steal})">${cfg().paymentsLive ? "Take" : "Try"} · ${inr(steal)}</span>
              <span class="take share" onclick="nambarShare('${safeId}','copy')">Share slip</span>
            </td>
            <td class="mob-meta">
              <span>Today ${inr(x.today||0)}</span>
              <span>All-time ${inr(x.total||0)}</span>
              <span>Visits from here ${x.clicks||0}</span>
            </td>
            <td class="mob-take">
              <span class="take" onclick="nambarTake('${safeHandle}', ${steal})">${cfg().paymentsLive ? "Take this rank" : "Try this rank"} · ${inr(steal)}</span>
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
      el.innerHTML = `<p class="fine">No live payments yet. This is the free pre-launch board.</p>`;
      return;
    }
    el.innerHTML = activity.map(a =>
      `<div class="act"><b>${a.name}</b> paid ${inr(a.bid)} · #${a.rank} on ${a.board || "all-time"} · ${a.t}</div>`
    ).join("");
  }
  function renderNeed(){
    const el = document.getElementById("needHint");
    if (!el) return;
    const need = Math.max(10, topFor(pageBoard) + 1);
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
  document.getElementById("pay")?.addEventListener("click", () => {
    if (!cfg().paymentsLive) {
      const rawPreview = (document.getElementById("handle")?.value || "").trim();
      if (!rawPreview) return toast("Add a creator handle to try the free pre-launch board.");
      const catPreview = document.getElementById("category")?.value || "YouTube";
      const photoPreview = (document.getElementById("photo")?.value || "").trim();
      let amtPreview = Math.floor(Number(document.getElementById("amount")?.value));
      if (!Number.isFinite(amtPreview) || amtPreview < 10) amtPreview = 10;
      let preview = findListing(rawPreview);
      if (preview) {
        if (preview.todayDate !== todayKey) { preview.today = 0; preview.clicksToday = 0; preview.todayDate = todayKey; }
        preview.today = (preview.today || 0) + amtPreview;
        preview.total = (preview.total || 0) + amtPreview;
        preview.cat = catPreview;
        if (photoPreview) preview.photo = photoPreview;
      } else {
        const handlePreview = rawPreview.startsWith("@") || rawPreview.includes("/") ? rawPreview : "@" + rawPreview;
        preview = { id: Date.now(), handle: handlePreview.includes("/") ? "@" + handlePreview.replace(/.*@/, "").split("/")[0] : handlePreview, name: rawPreview.replace(/^@/, "").split("/").pop(), cat: catPreview, total: amtPreview, today: amtPreview, todayDate: todayKey, clicks: 0, clicksToday: 0, desc: "Listed on Nambarone.lol.", platform: rawPreview, photo: photoPreview, created: Date.now() };
        listings.push(preview);
      }
      const rankedPreview = listForBoard();
      const rankPreview = rankedPreview.findIndex(x => x.id === preview.id) + 1;
      activity.unshift({ name: preview.name, rank: rankPreview, bid: amtPreview, t: "just now", board: pageBoard === "today" ? "today" : "all-time" });
      save(); render(); showSlip(preview, rankPreview);
      toast("Free pre-launch spot claimed. No money was charged.");
      return;
    }
    const raw = (document.getElementById("handle")?.value || "").trim();
    const cat = document.getElementById("category")?.value || "YouTube";
    const photo = (document.getElementById("photo")?.value || "").trim();
    let amt = Math.floor(Number(document.getElementById("amount")?.value));
    if (!raw) return toast("Add an Instagram or YouTube handle.");
    if (!Number.isFinite(amt) || amt < 10) return toast("Minimum bid is ₹10.");
    let row = findListing(raw);
    if (row) {
      if (row.todayDate !== todayKey) { row.today = 0; row.clicksToday = 0; row.todayDate = todayKey; }
      row.today = (row.today || 0) + amt;
      row.total = (row.total || 0) + amt;
      row.cat = cat;
      if (photo) row.photo = photo;
    } else {
      const handle = raw.startsWith("@") || raw.includes("/") ? raw : "@" + raw;
      row = {
        id: Date.now(),
        handle: handle.includes("/") ? "@" + handle.replace(/.*@/, "").split("/")[0] : handle,
        name: raw.replace(/^@/, "").split("/").pop(),
        cat, total: amt, today: amt, todayDate: todayKey, clicks: 0, clicksToday: 0,
        desc: "Listed on Nambarone.lol.",
        platform: raw,
        photo: photo || "",
        created: Date.now()
      };
      listings.push(row);
    }
    const ranked = listForBoard();
    const idx = ranked.findIndex(x => x.id === row.id);
    activity.unshift({ name: row.name, rank: idx >= 0 ? idx + 1 : "—", bid: amt, t: "just now", board: pageBoard === "today" ? "today" : "all-time" });
    save();
    render();
    toast("Spot claimed. Share the slip.");
    showSlip(row, idx >= 0 ? idx + 1 : "—");
  });

  render();
  pullShared();
})();
