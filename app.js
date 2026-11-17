(() => {
  const CFG = window.TRACKER_CONFIG || {};
  const PREFIX = CFG.keyPrefix || "UI";
  const BUCKET = "screenshots";
  const STATUSES = [
    { id: "todo", label: "To do" },
    { id: "done", label: "Done" },
  ];
  // Older tasks may still carry "doing"/"review"; treat anything not done as to do.
  const statusOf = (i) => (i.status === "done" ? "done" : "todo");
  const PRI = { high: "High", med: "Medium", low: "Low" };
  const PRI_ORDER = { high: 0, med: 1, low: 2 };

  const S = { sb: null, me: null, members: [], issues: [], view: "mine", q: "", showDone: true, editing: null, urls: {}, channel: null };
  try {
    const v = localStorage.getItem("uit:view"); if (v) S.view = v;
    if (localStorage.getItem("uit:showDone") === "0") S.showDone = false;
  } catch (e) {}

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
    up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
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
    reloadT = setTimeout(async () => { try { await loadAll(); render(); refreshPager(); } catch (e) { console.error(e); } }, 150);
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
    let list = S.issues;
    if (S.view === "mine") list = list.filter((i) => i.assignee === S.me);
    else if (S.view === "theirs") list = list.filter((i) => i.assignee !== S.me);
    const q = S.q.trim().toLowerCase();
    if (q) list = list.filter((i) => i.title.toLowerCase().includes(q) || `${PREFIX}-${i.num}`.toLowerCase() === q);
    return list;
  }
  function grouped(items) {
    const todo = items.filter((i) => statusOf(i) === "todo").sort((a, b) =>
      (PRI_ORDER[a.priority] ?? 1) - (PRI_ORDER[b.priority] ?? 1) || time(b.updated_at) - time(a.updated_at));
    const done = items.filter((i) => statusOf(i) === "done").sort((a, b) => time(b.updated_at) - time(a.updated_at));
    return { todo, done };
  }
  // Tasks in the order they appear on screen (collapsed Done tasks are skipped).
  function pageOrder() {
    const { todo, done } = grouped(visible());
    return S.showDone ? [...todo, ...done] : todo;
  }
  function render() {
    const mine = S.issues.filter((i) => i.assignee === S.me).length;
    $("#n-mine").textContent = mine; $("#n-theirs").textContent = S.issues.length - mine; $("#n-all").textContent = S.issues.length;
    $("#count").textContent = `${S.issues.filter((i) => statusOf(i) === "todo").length} open`;
    document.querySelectorAll("#viewSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === S.view)));

    if (!S.issues.length) {
      notice("No tasks yet", "Add the first one: a design to review, a bug spotted in the build, or a Figma frame to implement. You can paste screenshots straight into a task.", `<button class="btn primary" type="button" data-act="new">New task</button>`);
      return;
    }
    const items = visible();
    if (!items.length) {
      $("#main").innerHTML = `<div class="list-empty">${S.q.trim() ? `No tasks match “${esc(S.q.trim())}”.` : "No tasks in this view."}</div>`;
      return;
    }
    const { todo, done } = grouped(items);
    $("#main").innerHTML = `
      <section class="group" aria-label="To do">
        <div class="group-h"><h2>To do</h2><span class="n">${todo.length}</span></div>
        <div class="rows">${todo.length ? todo.map(row).join("") : `<div class="list-empty">All caught up.</div>`}</div>
      </section>
      ${done.length ? `<section class="group done" aria-label="Done">
        <button type="button" class="group-h toggle" data-act="toggle-done" aria-expanded="${S.showDone}">
          <span class="caret" aria-hidden="true">${S.showDone ? "▾" : "▸"}</span><h2>Done</h2><span class="n">${done.length}</span></button>
        ${S.showDone ? `<div class="rows">${done.map(row).join("")}</div>` : ""}
      </section>` : ""}`;
  }
  function row(i) {
    const isDone = statusOf(i) === "done";
    const links = (i.links || []).slice(0, 2).map((l) => { const inf = linkInfo(l.url); return `<span class="chip ${inf.kind}">${ICON[inf.kind]}<span>${esc(inf.label)}</span></span>`; }).join("");
    const shots = (i.screenshots || []).length ? `<span class="chip">${ICON.img}${i.screenshots.length}</span>` : "";
    return `<div class="row${isDone ? " is-done" : ""}">
      <button type="button" class="check" data-toggle="${esc(i.id)}" role="checkbox" aria-checked="${isDone}" aria-label="${isDone ? "Reopen" : "Mark done"}: ${esc(i.title)}" title="${isDone ? "Reopen" : "Mark done"}">${ICON.check}</button>
      <button type="button" class="row-main" data-open="${esc(i.id)}">
        <span class="pri ${esc(i.priority)}" title="${PRI[i.priority] || ""} priority"></span>
        <span class="key">${PREFIX}-${i.num}</span>
        <span class="title">${esc(i.title)}</span>
        <span class="meta">${links}${shots}${avatar(i.assignee)}</span>
      </button>
    </div>`;
  }
  // PATCH is rejected by the API gateway's CORS preflight, so "update" is done as a POST upsert on id.
  function updateIssue(id, fields) {
    const cur = S.issues.find((x) => x.id === id) || {};
    const base = { title: cur.title, description: cur.description ?? "", assignee: cur.assignee ?? null, status: cur.status, priority: cur.priority, links: cur.links || [], screenshots: cur.screenshots || [] };
    return S.sb.from("issues").upsert({ ...base, ...fields, id }, { onConflict: "id" }).select("id");
  }
  async function toggleDone(id) {
    const i = S.issues.find((x) => x.id === id); if (!i) return;
    const prev = i.status;
    const next = statusOf(i) === "done" ? "todo" : "done";
    i.status = next; i.updated_at = new Date().toISOString(); render();
    const { error } = await updateIssue(id, { status: next });
    if (error) { i.status = prev; render(); toast("Couldn't update that task. Try again."); return; }
    toast(next === "done" ? `${PREFIX}-${i.num} done` : `${PREFIX}-${i.num} reopened`);
  }

  // ---- Deep links: ?task=UI-12 ----
  // A query param (not a hash) so it survives the magic-link redirect, which puts auth tokens in the hash.
  const keyOf = (i) => `${PREFIX}-${i.num}`;
  const taskUrl = (i) => { const u = new URL(location.href); u.hash = ""; u.searchParams.set("task", keyOf(i)); return u.href; };
  function setTaskParam(key) {
    const u = new URL(location.href);
    if (key) u.searchParams.set("task", key); else u.searchParams.delete("task");
    if (u.href !== location.href) history.replaceState(history.state, "", u.href);
  }
  function openFromUrl() {
    const key = new URL(location.href).searchParams.get("task");
    if (!key) { if (S.editing && !S.editing.isNew) closeDrawer(false); return; }
    if (S.editing && !S.editing.isNew && keyOf(S.editing.d).toLowerCase() === key.toLowerCase()) return;
    const i = S.issues.find((x) => keyOf(x).toLowerCase() === key.toLowerCase());
    if (i) openDrawer(i);
    else { setTaskParam(null); toast(`${key} wasn't found. It may have been deleted.`); }
  }
  async function copyLink(i) {
    const url = taskUrl(i);
    try { await navigator.clipboard.writeText(url); toast(`Link to ${keyOf(i)} copied`); }
    catch (e) { prompt("Copy this link:", url); }
  }

  // ---- Drawer ----
  function openDrawer(issue, paged = false) {
    const isNew = !issue;
    const d = issue ? JSON.parse(JSON.stringify(issue))
      : { id: null, title: "", description: "", status: "todo", priority: "med", assignee: S.me, links: [], screenshots: [] };
    d.status = statusOf(d);
    S.editing = { d, isNew, uploaded: [], pending: 0, confirmDel: false, orig: snap(d) };
    S.editing.paged = paged;
    setTaskParam(isNew ? null : keyOf(d));
    drawDrawer();
    if (isNew) setTimeout(() => $("#f-title")?.focus(), 30);
    if (d.screenshots.length) signedUrls(d.screenshots).then(() => { if (S.editing?.d === d) { syncForm(); drawDrawer(); } });
  }
  const snap = (d) => JSON.stringify([d.title, d.description ?? "", d.assignee ?? null, d.status, d.priority, d.links, d.screenshots]);
  function isDirty() {
    const e = S.editing; if (!e) return false;
    syncForm();
    return e.uploaded.length > 0 || e.pending > 0 || snap(e.d) !== e.orig || !!$("#f-link")?.value.trim();
  }
  function pagerPos() {
    const e = S.editing; if (!e || e.isNew) return null;
    const list = pageOrder();
    const ix = list.findIndex((x) => x.id === e.d.id);
    return ix < 0 ? null : { list, ix };
  }
  function page(delta) {
    const p = pagerPos(); if (!p) return;
    const next = p.list[p.ix + delta]; if (!next) return;
    if (isDirty()) { toast("You have unsaved changes. Save or cancel them first."); return; }
    openDrawer(next, true);
  }
  // Redraw only the pager so a background reload doesn't wipe in-progress edits.
  function refreshPager() {
    if (!S.editing || S.editing.isNew) return;
    const hadFocus = document.activeElement?.closest?.(".pager") ? document.activeElement.dataset.act : null;
    const p = pagerPos();
    document.querySelectorAll("#overlay .pager").forEach((el) => {
      if (!p) { el.remove(); return; }
      el.querySelector('[data-act="prev"]').disabled = p.ix === 0;
      el.querySelector('[data-act="next"]').disabled = p.ix === p.list.length - 1;
      el.querySelector(".pos").innerHTML = `${p.ix + 1}<span>/${p.list.length}</span>`;
    });
    if (hadFocus) $(`#overlay .pager.side [data-act="${hadFocus}"]`)?.focus();
  }
  function closeDrawer(saved) {
    const e = S.editing; if (!e) return;
    if (!saved && e.uploaded.length) S.sb.storage.from(BUCKET).remove(e.uploaded);
    S.editing = null; $("#overlay").innerHTML = "";
    setTaskParam(null);
  }
  function drawDrawer() {
    const e = S.editing; if (!e) return;
    const d = e.d;
    const people = `<option value="">Unassigned</option>` + S.members.map((m) =>
      `<option value="${esc(m.email)}" ${m.email === d.assignee ? "selected" : ""}>${esc(m.display_name)}${m.email === S.me ? " (me)" : ""}</option>`).join("");
    const p = pagerPos();
    const pager = (cls) => p ? `<div class="pager ${cls}" role="group" aria-label="Browse tasks">
        <button type="button" class="pg" data-act="prev" aria-label="Previous task" title="Previous task (↑)" ${p.ix ? "" : "disabled"}>${ICON.up}</button>
        <span class="pos" aria-live="polite">${p.ix + 1}<span>/${p.list.length}</span></span>
        <button type="button" class="pg" data-act="next" aria-label="Next task" title="Next task (↓)" ${p.ix < p.list.length - 1 ? "" : "disabled"}>${ICON.down}</button>
      </div>` : "";
    $("#overlay").innerHTML = `
      <div class="scrim" data-act="close"></div>
      ${pager("side")}
      <div class="dialog${e.paged ? " paged" : ""}" role="dialog" aria-modal="true" aria-label="${e.isNew ? "New task" : "Edit task"}">
        <div class="drawer-h"><span class="key">${e.isNew ? "New task" : `${PREFIX}-${d.num}`}</span>${pager("inline")}
          ${e.isNew ? "" : `<button type="button" class="btn ghost copy-link" data-act="copy-link" title="Copy a link to this task">${ICON.link}<span>Copy link</span></button>`}
          <button type="button" class="icon-btn x" data-act="close" aria-label="Close">${ICON.x}</button></div>
        <div class="drawer-b">
          <input id="f-title" class="f-title" type="text" placeholder="What needs doing?" value="${esc(d.title)}" autocomplete="off">
          <div class="row3">
            <div class="field"><label for="f-assignee">Assignee</label><select id="f-assignee">${people}</select></div>
            <div class="field"><label for="f-status">Status</label><select id="f-status">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === d.status ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
            <div class="field"><label for="f-priority">Priority</label><select id="f-priority">${Object.entries(PRI).map(([k, v]) => `<option value="${k}" ${k === d.priority ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          </div>
          <div class="field"><span class="lbl">Screenshots</span>
            ${d.screenshots.length || e.pending ? `<div class="shots">${d.screenshots.map((p, ix) => `<div class="shot">${S.urls[p]
              ? `<button type="button" class="open" data-zoom="${esc(p)}" aria-label="View screenshot"><img src="${esc(S.urls[p])}" alt="Screenshot ${ix + 1}" loading="lazy"></button>`
              : `<span class="shot pending" style="border:0;height:100%">Loading…</span>`}<button type="button" class="icon-btn rm" data-rmshot="${ix}" aria-label="Remove screenshot">${ICON.x}</button></div>`).join("")}${Array.from({ length: e.pending }, () => `<div class="shot pending">Uploading…</div>`).join("")}</div>` : ""}
            <div class="drop" id="drop">Paste an image (⌘V / Ctrl+V), drop it here, or <label for="f-file">choose a file</label><input id="f-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden></div>
          </div>
          <div class="field"><span class="lbl">Links</span>
            <div class="links">${d.links.map((l, ix) => `<div class="link-row">${chip(l.url)}<button type="button" class="icon-btn" data-rmlink="${ix}" aria-label="Remove link">${ICON.x}</button></div>`).join("")}</div>
            <form class="link-add" id="linkForm"><input id="f-link" type="url" inputmode="url" placeholder="Paste a Figma, Jira or any URL"><button class="btn" type="submit">Add</button></form>
          </div>
          <div class="field"><label for="f-desc">Notes</label><textarea id="f-desc" class="notes" placeholder="Context, acceptance criteria, what changed…">${esc(d.description)}</textarea></div>
          ${!e.isNew && d.created_by ? `<p class="hint">Created by ${esc(nameOf(d.created_by))} · ${new Date(d.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>` : ""}
        </div>
        <div class="drawer-f">
          ${e.isNew ? "" : e.confirmDel ? `<button type="button" class="btn danger" data-act="del-yes">Delete for both of you</button><button type="button" class="btn ghost" data-act="del-no">Keep</button>` : `<button type="button" class="btn ghost danger" data-act="del">Delete</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn" data-act="close">Cancel</button>
          <button type="button" class="btn primary" data-act="save" ${e.pending ? "disabled" : ""}>${e.isNew ? "Create task" : "Save"}</button>
        </div>
      </div>`;
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
      : await updateIssue(d.id, body);
    if (!res.error && !e.isNew && !(res.data && res.data.length)) res.error = { message: "No rows updated (blocked by permissions or the task no longer exists)" };
    if (res.error) { console.error("save failed", res.error); if (btn) btn.disabled = false; toast(`Couldn't save: ${res.error.message || "check your connection and try again."}`); return; }
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
    ["#viewSeg", "#newBtn", "#meBox", "#q"].forEach((s) => ($(s).hidden = true));
    $("#count").textContent = "";
    notice("Sign in", msg || "Enter your email and we'll send you a sign-in link. Only people on this board can get in.",
      `<form class="auth" id="signinForm"><label class="hint" for="f-email">Email</label><input id="f-email" type="email" autocomplete="email" required><button class="btn primary" type="submit">Send sign-in link</button></form>`);
  }
  async function sendLink(email) {
    const btn = $("#signinForm button"); btn.disabled = true;
    const { error } = await S.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + location.search } });
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
    ["#viewSeg", "#newBtn", "#meBox", "#q"].forEach((s) => ($(s).hidden = false));
    $("#meAvatar").innerHTML = avatar(S.me);
    render();
    openFromUrl();
    if (!S.channel) {
      S.channel = S.sb.channel("issues-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, scheduleReload)
        .subscribe();
    }
  }

  // ---- Events ----
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act],[data-open],[data-toggle],[data-view],[data-rmlink],[data-rmshot],[data-zoom]");
    if (!t) return;
    if (t.dataset.toggle) { toggleDone(t.dataset.toggle); return; }
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
    else if (a === "prev") page(-1);
    else if (a === "next") page(1);
    else if (a === "del") { syncForm(); S.editing.confirmDel = true; drawDrawer(); }
    else if (a === "del-no") { syncForm(); S.editing.confirmDel = false; drawDrawer(); }
    else if (a === "del-yes") del();
    else if (a === "copy-link") { if (S.editing && !S.editing.isNew) copyLink(S.editing.d); }
    else if (a === "toggle-done") { S.showDone = !S.showDone; try { localStorage.setItem("uit:showDone", S.showDone ? "1" : "0"); } catch (e) {} render(); }
    else if (a === "signout") { await S.sb.auth.signOut(); location.reload(); }
  });
  $("#newBtn").addEventListener("click", () => openDrawer(null));
  window.addEventListener("popstate", () => { if (S.me && member(S.me)) openFromUrl(); });
  $("#q").addEventListener("input", (ev) => { S.q = ev.target.value; render(); });
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
    // Page through tasks with ↑/↓ (or K/J) unless the user is typing in a field.
    if (S.editing && !S.editing.isNew && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !$(".lightbox")) {
      const el = document.activeElement;
      const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const delta = { ArrowUp: -1, ArrowDown: 1, k: -1, j: 1 }[ev.key];
      if (delta && !typing) { ev.preventDefault(); page(delta); }
    }
  });

  // ---- Boot ----
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
    notice("Setup needed", "Add your Supabase project URL and anon key to config.js, then reload. See README.md for the steps.");
    return;
  }
  if (!window.supabase) {
    notice("Couldn't load the sign-in library", "The Supabase script from cdn.jsdelivr.net didn't load. If you use an ad or script blocker, allow that site, then reload.");
    return;
  }
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  let entered = false;
  S.sb.auth.onAuthStateChange((event, session) => {
    if (session && !entered) { entered = true; setTimeout(() => enter(session), 0); }
    else if (!session && event !== "TOKEN_REFRESHED") { entered = false; showSignIn(); }
  });
})();
