(() => {
  const CFG = window.TRACKER_CONFIG || {};
  const PREFIX = CFG.keyPrefix || "UI";
  const BUCKET = "screenshots";
  const STATUSES = [
    { id: "todo", label: "To do", color: "var(--p-low)" },
    { id: "doing", label: "In progress", color: "var(--jira)" },
    { id: "review", label: "In review", color: "var(--figma)" },
    { id: "done", label: "Done", color: "var(--ok)" },
  ];
  const PRI = { high: "High", med: "Medium", low: "Low" };
  const PRI_ORDER = { high: 0, med: 1, low: 2 };

  const S = { sb: null, me: null, members: [], issues: [], view: "mine", editing: null, urls: {}, channel: null };
  try { const v = localStorage.getItem("uit:view"); if (v) S.view = v; } catch (e) {}

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const time = (t) => (t ? Date.parse(t) : 0);

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2800);
  }
  function notice(title, body, extra = "") {
    $("#main").innerHTML = `<div class="notice"><h2>${esc(title)}</h2><p>${esc(body)}</p>${extra}</div>`;
  }

  // ---- Links ----
  const ICON = {
    figma: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 2h4v6H8a3 3 0 0 1 0-6Zm4 0h4a3 3 0 0 1 0 6h-4V2Zm0 7h4a3 3 0 1 1-4 3V9ZM8 9h4v6H8a3 3 0 0 1 0-6Zm0 7h4v3a3 3 0 1 1-4-3Z"/></svg>',
    jira: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 2 12l4 4 6-6 6 6 4-4L12 2Zm0 10-4 4 4 4 4-4-4-4Z"/></svg>',
    link: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    img: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };
  function linkInfo(url) {
    let u; try { u = new URL(url); } catch (e) { return { kind: "link", label: url }; }
    const host = u.hostname.replace(/^www\./, "");
    if (/figma\.com$/.test(host)) {
      const parts = u.pathname.split("/").filter(Boolean);
      let name = parts[2] || "Figma file";
      try { name = decodeURIComponent(name); } catch (e) {}
      const node = u.searchParams.get("node-id");
      return { kind: "figma", label: name.replace(/-/g, " ") + (node ? " · " + node.replace("-", ":") : "") };
    }
    if (/atlassian\.net$|jira/.test(host)) {
      const m = (u.pathname + u.search).match(/[A-Z][A-Z0-9]+-\d+/);
      return { kind: "jira", label: m ? m[0] : "Jira" };
    }
    return { kind: "link", label: host + (u.pathname.length > 1 ? u.pathname : "") };
  }
  function normUrl(v) {
    v = v.trim(); if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; }
  }
  const chip = (url) => { const i = linkInfo(url); return `<a class="chip ${i.kind}" href="${esc(url)}" target="_blank" rel="noopener">${ICON[i.kind]}<span>${esc(i.label)}</span></a>`; };

  // ---- People (identified by email) ----
  const member = (email) => S.members.find((m) => m.email === email);
  const nameOf = (email) => (email ? member(email)?.display_name || email.split("@")[0] : "Unassigned");
  function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function avatar(email) {
    if (!email) return `<span class="avatar none" title="Unassigned">?</span>`;
    const n = nameOf(email);
    return `<span class="avatar" style="background:hsl(${hue(email)} 55% 45%)" title="${esc(n)}">${esc(n.trim().charAt(0).toUpperCase() || "?")}</span>`;
  }

  // ---- Data ----
  async function loadAll() {
    const [m, i] = await Promise.all([
      S.sb.from("members").select("email, display_name").order("display_name"),
      S.sb.from("issues").select("*"),
    ]);
    if (m.error || i.error) throw m.error || i.error;
    S.members = m.data; S.issues = i.data;
  }
  let reloadT;
  function scheduleReload() {
    clearTimeout(reloadT);
    reloadT = setTimeout(async () => { try { await loadAll(); render(); } catch (e) { console.error(e); } }, 150);
  }
  async function signedUrls(paths) {
    const missing = paths.filter((p) => !S.urls[p]);
    if (!missing.length) return;
    const { data, error } = await S.sb.storage.from(BUCKET).createSignedUrls(missing, 3600);
    if (error) return;
    data.forEach((d) => { if (d.signedUrl) S.urls[d.path] = d.signedUrl; });
  }

  // ---- Board ----
  function visible() {
    if (S.view === "mine") return S.issues.filter((i) => i.assignee === S.me);
    if (S.view === "theirs") return S.issues.filter((i) => i.assignee !== S.me);
    return S.issues;
  }
  function render() {
    const mine = S.issues.filter((i) => i.assignee === S.me).length;
    $("#n-mine").textContent = mine; $("#n-theirs").textContent = S.issues.length - mine; $("#n-all").textContent = S.issues.length;
    $("#count").textContent = `${S.issues.filter((i) => i.status !== "done").length} open`;
    document.querySelectorAll("#viewSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === S.view)));

    if (!S.issues.length) {
      notice("No tasks yet", "Add the first one: a design to review, a bug spotted in the build, or a Figma frame to implement. You can paste screenshots straight into a task.", `<button class="btn primary" type="button" data-act="new">New task</button>`);
      return;
    }
    const items = visible();
    $("#main").innerHTML = `<div class="board">${STATUSES.map((st) => {
      const list = items.filter((i) => i.status === st.id).sort((a, b) =>
        st.id === "done" ? time(b.updated_at) - time(a.updated_at)
          : (PRI_ORDER[a.priority] ?? 1) - (PRI_ORDER[b.priority] ?? 1) || time(b.updated_at) - time(a.updated_at));
      return `<section class="lane ${st.id}" aria-label="${st.label}">
        <div class="lane-h"><span class="dot" style="background:${st.color}"></span><h2>${st.label}</h2><span class="n">${list.length}</span></div>
        ${list.length ? list.map(card).join("") : `<div class="lane-empty">Nothing here.</div>`}
      </section>`;
    }).join("")}</div>`;
  }
  function card(i) {
    const links = (i.links || []).slice(0, 3).map((l) => { const inf = linkInfo(l.url); return `<span class="chip ${inf.kind}">${ICON[inf.kind]}<span>${esc(inf.label)}</span></span>`; }).join("");
    const shots = (i.screenshots || []).length ? `<span class="chip">${ICON.img}${i.screenshots.length}</span>` : "";
    return `<button type="button" class="card" data-open="${esc(i.id)}">
      <span class="top"><span class="pri ${esc(i.priority)}" title="${PRI[i.priority] || ""} priority"></span>${PREFIX}-${i.num}</span>
      <span class="title">${esc(i.title)}</span>
      <span class="meta">${links}${shots}<span class="who">${avatar(i.assignee)}</span></span>
    </button>`;
  }

  // ---- Drawer ----
  function openDrawer(issue) {
    const isNew = !issue;
    const d = issue ? JSON.parse(JSON.stringify(issue))
      : { id: null, title: "", description: "", status: "todo", priority: "med", assignee: S.me, links: [], screenshots: [] };
    S.editing = { d, isNew, uploaded: [], pending: 0, confirmDel: false };
    drawDrawer();
    if (isNew) setTimeout(() => $("#f-title")?.focus(), 30);
    if (d.screenshots.length) signedUrls(d.screenshots).then(() => { if (S.editing?.d === d) { syncForm(); drawDrawer(); } });
  }
  function closeDrawer(saved) {
    const e = S.editing; if (!e) return;
    if (!saved && e.uploaded.length) S.sb.storage.from(BUCKET).remove(e.uploaded);
    S.editing = null; $("#overlay").innerHTML = "";
  }
  function drawDrawer() {
    const e = S.editing; if (!e) return;
    const d = e.d;
    const people = `<option value="">Unassigned</option>` + S.members.map((m) =>
      `<option value="${esc(m.email)}" ${m.email === d.assignee ? "selected" : ""}>${esc(m.display_name)}${m.email === S.me ? " (me)" : ""}</option>`).join("");
    $("#overlay").innerHTML = `
      <div class="scrim" data-act="close"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${e.isNew ? "New task" : "Edit task"}">
        <div class="drawer-h"><span class="key">${e.isNew ? "New task" : `${PREFIX}-${d.num}`}</span>
          <button type="button" class="icon-btn x" data-act="close" aria-label="Close">${ICON.x}</button></div>
        <div class="drawer-b">
          <input id="f-title" class="f-title" type="text" placeholder="What needs doing?" value="${esc(d.title)}" autocomplete="off">
          <div class="row3">
            <div class="field"><label for="f-assignee">Assignee</label><select id="f-assignee">${people}</select></div>
            <div class="field"><label for="f-status">Status</label><select id="f-status">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === d.status ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
            <div class="field"><label for="f-priority">Priority</label><select id="f-priority">${Object.entries(PRI).map(([k, v]) => `<option value="${k}" ${k === d.priority ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          </div>
          <div class="field"><label for="f-desc">Notes</label><textarea id="f-desc" placeholder="Context, acceptance criteria, what changed…">${esc(d.description)}</textarea></div>
          <div class="field"><span class="lbl">Links</span>
            <div class="links">${d.links.map((l, ix) => `<div class="link-row">${chip(l.url)}<button type="button" class="icon-btn" data-rmlink="${ix}" aria-label="Remove link">${ICON.x}</button></div>`).join("")}</div>
            <form class="link-add" id="linkForm"><input id="f-link" type="url" inputmode="url" placeholder="Paste a Figma, Jira or any URL"><button class="btn" type="submit">Add</button></form>
          </div>
          <div class="field"><span class="lbl">Screenshots</span>
            ${d.screenshots.length || e.pending ? `<div class="shots">${d.screenshots.map((p, ix) => `<div class="shot">${S.urls[p]
              ? `<button type="button" class="open" data-zoom="${esc(p)}" aria-label="View screenshot"><img src="${esc(S.urls[p])}" alt="Screenshot ${ix + 1}" loading="lazy"></button>`
              : `<span class="shot pending" style="border:0;height:100%">Loading…</span>`}<button type="button" class="icon-btn rm" data-rmshot="${ix}" aria-label="Remove screenshot">${ICON.x}</button></div>`).join("")}${Array.from({ length: e.pending }, () => `<div class="shot pending">Uploading…</div>`).join("")}</div>` : ""}
            <div class="drop" id="drop">Paste an image (⌘V / Ctrl+V), drop it here, or <label for="f-file">choose a file</label><input id="f-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden></div>
          </div>
          ${!e.isNew && d.created_by ? `<p class="hint">Created by ${esc(nameOf(d.created_by))} · ${new Date(d.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>` : ""}
        </div>
        <div class="drawer-f">
          ${e.isNew ? "" : e.confirmDel ? `<button type="button" class="btn danger" data-act="del-yes">Delete for both of you</button><button type="button" class="btn ghost" data-act="del-no">Keep</button>` : `<button type="button" class="btn ghost danger" data-act="del">Delete</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn" data-act="close">Cancel</button>
          <button type="button" class="btn primary" data-act="save" ${e.pending ? "disabled" : ""}>${e.isNew ? "Create task" : "Save"}</button>
        </div>
      </aside>`;
  }
  function syncForm() {
    const e = S.editing; if (!e || !$("#f-title")) return;
    e.d.title = $("#f-title").value; e.d.description = $("#f-desc").value;
    e.d.assignee = $("#f-assignee").value || null; e.d.status = $("#f-status").value; e.d.priority = $("#f-priority").value;
  }
  function addLinkFromInput() {
    const inp = $("#f-link"); if (!inp) return;
    const url = normUrl(inp.value);
    if (!url) { if (inp.value.trim()) toast("That doesn't look like a web address."); return; }
    syncForm(); S.editing.d.links.push({ url }); drawDrawer(); $("#f-link")?.focus();
  }
  const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
  async function uploadFiles(files) {
    const e = S.editing; if (!e) return;
    const imgs = [...files].filter((f) => EXT[f.type]);
    if (!imgs.length) { toast("Only PNG, JPG, GIF or WebP images can be attached."); return; }
    syncForm(); e.pending += imgs.length; drawDrawer();
    for (const f of imgs) {
      const path = `${crypto.randomUUID()}.${EXT[f.type]}`;
      const { error } = await S.sb.storage.from(BUCKET).upload(path, f, { contentType: f.type });
      if (error) toast(/size|large/i.test(error.message) ? "That image is over 10 MB." : "Couldn't upload that image. Try again.");
      else if (S.editing !== e) S.sb.storage.from(BUCKET).remove([path]);
      else { e.uploaded.push(path); e.d.screenshots.push(path); S.urls[path] = URL.createObjectURL(f); }
      if (S.editing === e) { e.pending--; syncForm(); drawDrawer(); }
    }
  }
  async function save() {
    syncForm();
    const e = S.editing; const d = e.d;
    if ($("#f-link")?.value.trim()) addLinkFromInput();
    if (!d.title.trim()) { toast("Give the task a title first."); $("#f-title")?.focus(); return; }
    const body = { title: d.title.trim(), description: d.description, assignee: d.assignee, status: d.status, priority: d.priority, links: d.links, screenshots: d.screenshots };
    const btn = $('[data-act="save"]'); if (btn) btn.disabled = true;
    const res = e.isNew
      ? await S.sb.from("issues").insert(body).select("num").single()
      : await S.sb.from("issues").update(body).eq("id", d.id);
    if (res.error) { if (btn) btn.disabled = false; toast("Couldn't save. Check your connection and try again."); return; }
    if (!e.isNew) {
      const before = S.issues.find((i) => i.id === d.id)?.screenshots || [];
      const removed = before.filter((p) => !d.screenshots.includes(p));
      if (removed.length) S.sb.storage.from(BUCKET).remove(removed);
    }
    toast(e.isNew ? `Created ${PREFIX}-${res.data.num}` : "Saved");
    e.uploaded = []; closeDrawer(true); scheduleReload();
  }
  async function del() {
    const e = S.editing;
    const { error } = await S.sb.from("issues").delete().eq("id", e.d.id);
    if (error) { toast("Couldn't delete. Try again."); return; }
    const paths = [...new Set([...(S.issues.find((i) => i.id === e.d.id)?.screenshots || []), ...e.uploaded])];
    if (paths.length) S.sb.storage.from(BUCKET).remove(paths);
    e.uploaded = []; closeDrawer(true); toast("Deleted"); scheduleReload();
  }

  // ---- Auth ----
  function showSignIn(msg) {
    ["#viewSeg", "#newBtn", "#meBox"].forEach((s) => ($(s).hidden = true));
    $("#count").textContent = "";
    notice("Sign in", msg || "Enter your email and we'll send you a sign-in link. Only people on this board can get in.",
      `<form class="auth" id="signinForm"><label class="hint" for="f-email">Email</label><input id="f-email" type="email" autocomplete="email" required><button class="btn primary" type="submit">Send sign-in link</button></form>`);
  }
  async function sendLink(email) {
    const btn = $("#signinForm button"); btn.disabled = true;
    const { error } = await S.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) { btn.disabled = false; toast(/rate/i.test(error.message) ? "Too many emails sent. Wait a few minutes and try again." : "Couldn't send the link. Check the address and try again."); return; }
    notice("Check your email", `We sent a sign-in link to ${email}. Open it on this device to get in.`);
  }
  async function enter(session) {
    S.me = (session.user.email || "").toLowerCase();
    try { await loadAll(); } catch (e) { notice("Couldn't load the board", "Something went wrong reading tasks. Reload the page to try again."); return; }
    if (!member(S.me)) {
      showSignIn(`${S.me} isn't on this board. Ask the board owner to add you, or sign in with a different email.`);
      return;
    }
    ["#viewSeg", "#newBtn", "#meBox"].forEach((s) => ($(s).hidden = false));
    $("#meAvatar").innerHTML = avatar(S.me);
    render();
    if (!S.channel) {
      S.channel = S.sb.channel("issues-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, scheduleReload)
        .subscribe();
    }
  }

  // ---- Events ----
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act],[data-open],[data-view],[data-rmlink],[data-rmshot],[data-zoom]");
    if (!t) return;
    if (t.dataset.view) { S.view = t.dataset.view; try { localStorage.setItem("uit:view", S.view); } catch (e) {} render(); return; }
    if (t.dataset.open) { const i = S.issues.find((x) => x.id === t.dataset.open); if (i) openDrawer(i); return; }
    if (t.dataset.rmlink != null) { syncForm(); S.editing.d.links.splice(+t.dataset.rmlink, 1); drawDrawer(); return; }
    if (t.dataset.rmshot != null) { syncForm(); S.editing.d.screenshots.splice(+t.dataset.rmshot, 1); drawDrawer(); return; }
    if (t.dataset.zoom) {
      const lb = document.createElement("div"); lb.className = "lightbox";
      lb.innerHTML = `<img src="${esc(S.urls[t.dataset.zoom])}" alt="Screenshot, full size">`;
      lb.addEventListener("click", () => lb.remove()); document.body.appendChild(lb); return;
    }
    const a = t.dataset.act;
    if (a === "new") openDrawer(null);
    else if (a === "close") closeDrawer(false);
    else if (a === "save") save();
    else if (a === "del") { syncForm(); S.editing.confirmDel = true; drawDrawer(); }
    else if (a === "del-no") { syncForm(); S.editing.confirmDel = false; drawDrawer(); }
    else if (a === "del-yes") del();
    else if (a === "signout") { await S.sb.auth.signOut(); location.reload(); }
  });
  $("#newBtn").addEventListener("click", () => openDrawer(null));
  document.addEventListener("submit", (ev) => {
    if (ev.target.id === "linkForm") { ev.preventDefault(); addLinkFromInput(); }
    if (ev.target.id === "signinForm") { ev.preventDefault(); sendLink($("#f-email").value.trim().toLowerCase()); }
  });
  document.addEventListener("change", (ev) => { if (ev.target.id === "f-file") uploadFiles(ev.target.files); });
  document.addEventListener("paste", (ev) => {
    if (!S.editing) return;
    const files = [...(ev.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { ev.preventDefault(); uploadFiles(files); }
  });
  document.addEventListener("dragover", (ev) => { const d = ev.target.closest?.("#drop"); if (d) { ev.preventDefault(); d.classList.add("over"); } });
  document.addEventListener("dragleave", (ev) => { const d = ev.target.closest?.("#drop"); if (d) d.classList.remove("over"); });
  document.addEventListener("drop", (ev) => { const d = ev.target.closest?.("#drop"); if (d) { ev.preventDefault(); d.classList.remove("over"); uploadFiles(ev.dataTransfer.files); } });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { const lb = $(".lightbox"); if (lb) lb.remove(); else if (S.editing) closeDrawer(false); }
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && S.editing) save();
  });

  // ---- Boot ----
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase) {
    notice("Setup needed", "Add your Supabase project URL and anon key to config.js, then reload. See README.md for the steps.");
    return;
  }
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  let entered = false;
  S.sb.auth.onAuthStateChange((event, session) => {
    if (session && !entered) { entered = true; setTimeout(() => enter(session), 0); }
    else if (!session && event !== "TOKEN_REFRESHED") { entered = false; showSignIn(); }
  });
})();
