import { firebaseConfig, TRIP_ID } from "./firebase-config.js";
import { createStore } from "./store.js";

/* ================================================================ state */
const $app = document.getElementById("app");
const $sheet = document.getElementById("sheet-root");
const S = {
  tab: lsGet("jt-tab") || "plan",
  day: null,
  filter: "all",
  user: null,
  data: null,
  status: {},
  maps: null,
};
let store;
let pendingRender = false;

const TABS = [
  ["plan", "Itinerary", '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M8 13h3M8 16.5h6"/>'],
  ["tasks", "Tasks", '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11"/><circle cx="5" cy="18" r="1.4"/>'],
  ["info", "Info", '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'],
  ["maps", "Maps", '<path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z"/><path d="M9 4v14M15 6v14"/>'],
  ["guide", "Guide", '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7.5h8M8 11h6"/>'],
];
const KINDS = { sight: "Sightseeing", food: "Food", shop: "Shopping", transit: "Getting there", flight: "Flight", train: "Train", hotel: "Hotel", booking: "Booking / ticket" };
const PHASES = [["before", "Before trip"], ["tokyo", "Tokyo"], ["osaka", "Osaka & Kyoto"], ["departure", "Going home"]];
const STAR_LABEL = { 3: "Must do", 2: "Should do", 1: "Nice to have" };
const PLACE_ORDER = ["Hotels", "Bookings", "Stations", "Airports", "Emergency"];
const CLOCKS = [
  ["Tokyo", "Asia/Tokyo"],
  ["Virginia", "America/New_York"],
  ["Istanbul", "Europe/Istanbul"],
];
const ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

/* ================================================================ helpers */
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tzName = (tz) => (tz === "ET" ? "America/New_York" : "Asia/Tokyo");

function fmt12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}
function toMin(hhmm) { if (!hhmm) return null; const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function partsIn(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
function offsetMin(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUTC - d.getTime()) / 60000);
}
function dateLabel(iso, opts) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}
function yen(n) { return "¥" + Math.round(n).toLocaleString("en-US"); }
function usd(n) { return "$" + (n < 10 ? n.toFixed(2) : n < 1000 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")); }
const mapsApple = (q) => `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
const mapsGoogle = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2400);
}
function myName() { return lsGet("jt-name") || ""; }
function rate() { return Number(S.data?.settings?.rate) || 158; }

function applyTheme() {
  const t = lsGet("jt-theme") || "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
applyTheme();

function tripPhase() {
  const trip = S.data?.trip;
  if (!trip) return { phase: "none" };
  const today = partsIn("Asia/Tokyo").date;
  const idx = trip.days.findIndex((d) => d.date === today);
  // Day 1 runs on Virginia time
  const etToday = partsIn("America/New_York").date;
  if (etToday === trip.days[0].date && idx === -1) return { phase: "during", day: 1 };
  if (idx >= 0) return { phase: "during", day: trip.days[idx].day };
  if (today < trip.days[0].date) {
    const days = Math.ceil((new Date(trip.days[0].date + "T00:00:00-05:00") - Date.now()) / 86400000);
    return { phase: "before", days };
  }
  return { phase: "after" };
}

/* ================================================================ boot */
async function boot() {
  try {
    store = await createStore(firebaseConfig, TRIP_ID);
  } catch (e) {
    $app.innerHTML = `<div class="empty" style="padding-top:30vh"><h2>Can't reach the app's sync service</h2>
      <p>Connect to the internet and reopen the app. After the first successful start it also works offline.</p></div>`;
    return;
  }
  store.onAuth((user) => {
    S.user = user;
    if (!user) { store.stop(); S.data = null; renderLogin(); return; }
    if (!myName()) {
      const guess = /alara/i.test(user.email) ? "Alara" : /berk/i.test(user.email) ? "Berk" : "";
      if (guess) lsSet("jt-name", guess);
    }
    store.start(onData);
  });
}

function onData(state, status) {
  if (!state && status?.error) { renderError(status.error); return; }
  S.data = state; S.status = status;
  if (S.day == null && state.trip) {
    const p = tripPhase();
    S.day = p.phase === "during" ? p.day : 1;
  }
  render();
}

/* ================================================================ screens */
function renderLogin(msg = "") {
  $app.innerHTML = `<section class="login">
    <div class="login-mark" aria-hidden="true"></div>
    <h1>Japan 2026</h1>
    <p>Tokyo, Kyoto and Osaka, November 12–20. Sign in to see the shared plan.</p>
    <form id="login-form" novalidate>
      <label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
      <p class="err" id="login-err">${esc(msg)}</p>
      <button class="btn wide" type="submit">Sign in</button>
    </form>
  </section>`;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = document.getElementById("login-err");
    err.textContent = "Signing in…";
    try { await store.signIn(f.get("email"), f.get("password")); }
    catch (x) {
      const c = x.code || "";
      err.textContent = c.includes("network") ? "No connection. Connect to the internet to sign in the first time."
        : c.includes("too-many") ? "Too many attempts. Wait a minute and try again."
        : "That email and password don't match an account in this app.";
    }
  });
}

function renderError(code) {
  const denied = String(code).includes("permission");
  $app.innerHTML = `<div class="empty" style="padding-top:24vh">
    <h2>${denied ? "This account can't open the trip" : "Something stopped the sync"}</h2>
    <p>${denied ? "Its email isn't in the allowed list in your Firestore rules. Add it there (setup step 5), then sign in again."
      : "Error: " + esc(code) + ". Reopen the app; if it keeps happening, sign out and back in."}</p>
    <button class="btn" data-act="signout">Sign out</button></div>`;
}

function render() {
  const active = document.activeElement;
  if (active && $app.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) { pendingRender = true; return; }
  pendingRender = false;
  const st = S.status || {};
  const p = tripPhase();
  const sub = p.phase === "before" ? `${p.days} day${p.days === 1 ? "" : "s"} to go`
    : p.phase === "during" ? `Day ${p.day} of ${S.data.trip.days.length}`
    : p.phase === "after" ? "Okaeri — welcome home" : "";
  const syncCls = store.mode === "local" ? "demo" : st.offline ? "offline" : st.pending ? "saving" : "";
  const syncTxt = store.mode === "local" ? "Preview" : st.offline ? "Offline" : st.pending ? "Saving" : "Synced";

  const scrollY = window.scrollY;
  $app.innerHTML = `
    <header class="topbar">
      <div class="grow"><div class="brand">Japan 2026</div><div class="countdown">${esc(sub)}</div></div>
      <span class="sync ${syncCls}" title="${st.offline ? "Changes are saved on this phone and sync when you're back online" : ""}">${syncTxt}</span>
      <button class="icon-btn" data-act="settings" aria-label="Settings">${ICON_GEAR}</button>
    </header>
    <main id="main">${store.mode === "local" ? `<p class="banner">Preview mode: changes stay on this device until Firebase is connected (setup step 3).</p>` : ""}${renderTab()}</main>
    <div class="tabbar"><nav aria-label="Sections">${TABS.map(([id, label, icon]) =>
      `<button data-act="tab" data-id="${id}" ${S.tab === id ? 'aria-current="page"' : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>${label}</button>`).join("")}</nav></div>`;
  window.scrollTo(0, scrollY);
  afterRender();
}

function renderTab() {
  const d = S.data;
  if (!d || !d.loaded) return `<div class="empty"><p>Loading…</p></div>`;
  const hasData = d.trip || d.items.length || d.tasks.length;
  if (!hasData && S.tab !== "maps") {
    return `<div class="empty"><h2>No trip data yet</h2>
      <p>Import <b>seed.json</b> once (from the <i>private</i> folder) and it will appear on both phones.</p>
      <button class="btn" data-act="import">Import trip data</button></div>`;
  }
  switch (S.tab) {
    case "tasks": return renderTasks();
    case "info": return renderInfo();
    case "maps": return renderMaps();
    case "guide": return renderGuide();
    default: return renderPlan();
  }
}

/* ================================================================ itinerary */
function renderPlan() {
  const trip = S.data.trip;
  const days = trip?.days || [];
  const sel = days.find((x) => x.day === S.day) || days[0];
  if (!sel) return "";
  const tokyoToday = partsIn("Asia/Tokyo").date;
  const tz = sel.tz === "ET" ? "America/New_York" : "Asia/Tokyo";
  const now = partsIn(tz);
  const isToday = now.date === sel.date;
  const items = S.data.items.filter((i) => Number(i.day) === sel.day)
    .sort((a, b) => (a.start || "99").localeCompare(b.start || "99") || (a.created || 0) - (b.created || 0));

  const chips = days.map((x) => `<button class="day-chip ${x.date === tokyoToday ? "is-today" : ""}" data-act="day" data-id="${x.day}" aria-pressed="${x.day === sel.day}">
      <span class="wd">${dateLabel(x.date, { weekday: "short" })}</span><span class="dn">${Number(x.date.slice(8))}</span></button>`).join("");

  const evs = items.map((i) => {
    const s = toMin(i.start), e = toMin(i.end);
    const crosses = e != null && s != null && e < s;
    const isNow = isToday && s != null && now.min >= s && (e == null ? now.min < s + 30 : crosses || now.min < e);
    const past = isToday && !isNow && e != null && !crosses && now.min >= e;
    const placeQ = i.place ? (i.tz === "ET" || /Dulles/.test(i.place) ? i.place : i.place + ", Japan") : "";
    return `<li class="ev ${isNow ? "now" : ""} ${past ? "past" : ""}" data-kind="${esc(i.kind || "sight")}">
      <div class="time"><span class="t1">${fmt12(i.start)}</span>${i.end ? `<span class="t2">${i.est ? "~" : ""}${fmt12(i.end)}</span>` : ""}${i.endNote ? `<span class="t2">${esc(i.endNote)}</span>` : ""}</div>
      <span class="dot" aria-hidden="true"></span>
      <div class="body" data-act="edit-item" data-id="${i.id}" role="button" tabindex="0" aria-label="Edit ${esc(i.title)}">
        ${isNow ? `<span class="now-tag">Now</span>` : ""}
        <span class="title">${esc(i.title)}</span>
        ${i.place ? `<a class="where" href="${mapsApple(placeQ)}" target="_blank" rel="noopener" data-stop>${esc(i.place)}</a>` : ""}
        ${i.notes ? `<p class="notes">${esc(i.notes)}</p>` : ""}
        ${i.reminder ? `<p class="reminder">${esc(i.reminder)}</p>` : ""}
        ${i.ref ? `<span class="ref">${esc(i.ref)}</span>` : ""}
      </div></li>`;
  }).join("");

  return `<div class="days" role="group" aria-label="Trip days">${chips}</div>
    <div class="day-head">
      <div class="big ${sel.date === tokyoToday ? "today" : ""}">${Number(sel.date.slice(8))}</div>
      <div class="date">Day ${sel.day} · ${dateLabel(sel.date, { weekday: "long", month: "long", day: "numeric" })}</div>
      <h2>${esc(sel.title)}</h2>
    </div>
    <p class="tz-note">${sel.tz === "ET" ? "Times in Virginia time." : "Times in Japan time."} A ~ marks an estimated end time.</p>
    ${evs ? `<ol class="timeline">${evs}</ol>` : `<div class="empty"><p>Nothing planned for this day yet.</p></div>`}
    <button class="add-row" data-act="new-item">Add to this day</button>`;
}

function itemSheet(item) {
  const isNew = !item;
  item ||= { day: S.day, start: "", end: "", est: true, kind: "sight", tz: S.day === 1 ? "ET" : "JST" };
  const days = S.data.trip?.days || [];
  openSheet(`<h2>${isNew ? "Add activity" : "Edit activity"}</h2>
    <form id="f">
      <label class="field"><span>What</span><input class="input" name="title" required value="${esc(item.title)}"></label>
      <div class="row2">
        <label class="field"><span>Day</span><select class="input" name="day">${days.map((d) =>
          `<option value="${d.day}" ${Number(item.day) === d.day ? "selected" : ""}>Day ${d.day}, ${dateLabel(d.date, { month: "short", day: "numeric" })}</option>`).join("")}</select></label>
        <label class="field"><span>Type</span><select class="input" name="kind">${Object.entries(KINDS).map(([k, v]) =>
          `<option value="${k}" ${item.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
      <div class="row2">
        <label class="field"><span>Starts</span><input class="input" type="time" name="start" value="${esc(item.start)}"></label>
        <label class="field"><span>Ends</span><input class="input" type="time" name="end" value="${esc(item.end)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="est" ${item.est ? "checked" : ""}> End time is an estimate</label>
      <label class="field"><span>Place (opens in Maps)</span><input class="input" name="place" value="${esc(item.place)}"></label>
      <label class="field"><span>Details</span><textarea class="input" name="notes">${esc(item.notes)}</textarea></label>
      <label class="field"><span>Reminder (shown in red)</span><textarea class="input" name="reminder">${esc(item.reminder)}</textarea></label>
      <label class="field"><span>Booking reference</span><input class="input" name="ref" value="${esc(item.ref)}"></label>
      <div class="actions">
        ${isNew ? "" : `<button type="button" class="btn danger" data-sact="delete">Delete</button>`}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-sact="close">Cancel</button>
        <button class="btn" type="submit">${isNew ? "Add" : "Save"}</button>
      </div>
    </form>`, (root) => {
    root.querySelector("#f").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const data = {
        title: f.get("title").trim(), day: Number(f.get("day")), kind: f.get("kind"), start: f.get("start"), end: f.get("end"),
        est: f.get("est") === "on", place: f.get("place").trim(), notes: f.get("notes").trim(), reminder: f.get("reminder").trim(),
        ref: f.get("ref").trim(), tz: Number(f.get("day")) === 1 ? "ET" : "JST", endNote: item.endNote || "",
      };
      if (!data.title) { toast("Add a name for the activity."); return; }
      if (isNew) write(store.add("items", { ...data, created: Date.now() }), "Added");
      else write(store.update("items", item.id, data), "Saved");
      S.day = data.day; closeSheet();
    });
    root.querySelector('[data-sact="delete"]')?.addEventListener("click", () => {
      if (confirm(`Delete “${item.title}” for both of you?`)) { write(store.remove("items", item.id), "Deleted"); closeSheet(); }
    });
  });
}

/* ================================================================ tasks */
function renderTasks() {
  const all = S.data.tasks;
  const list = S.filter === "all" ? all : all.filter((t) => t.phase === S.filter);
  const open = list.filter((t) => !t.done).sort((a, b) => (b.stars || 1) - (a.stars || 1) || (a.created || 0) - (b.created || 0));
  const done = list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const doneAll = all.filter((t) => t.done).length;
  const pct = all.length ? Math.round((doneAll / all.length) * 100) : 0;
  const phaseName = Object.fromEntries(PHASES);

  const row = (t) => {
    const stars = "★".repeat(t.stars || 1) + "☆".repeat(3 - (t.stars || 1));
    return `<li class="task ${t.done ? "done" : ""}" data-stars="${t.stars || 1}">
      <button class="tick" data-act="toggle-task" data-id="${t.id}" aria-label="${t.done ? "Mark not done" : "Mark done"}: ${esc(t.title)}"><span>${ICON_CHECK}</span></button>
      <button class="main" data-act="edit-task" data-id="${t.id}">
        <span class="tt">${esc(t.title)}</span>
        ${t.notes ? `<span class="tn">${esc(t.notes)}</span>` : ""}
        <span class="meta"><span class="stars" aria-label="${STAR_LABEL[t.stars || 1]}">${stars}</span>
          ${S.filter === "all" ? `<span>${esc(phaseName[t.phase] || "")}</span>` : ""}
          ${t.done && t.doneBy ? `<span>Done by ${esc(t.doneBy)}</span>` : ""}</span>
      </button></li>`;
  };

  return `<div class="progress">
      <div class="label"><span><b>${doneAll}</b> of ${all.length} done</span><span>${pct}%</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="seg" role="group" aria-label="Filter tasks">
      ${[["all", "All"], ...PHASES].map(([k, v]) => `<button data-act="filter" data-id="${k}" aria-pressed="${S.filter === k}">${v}</button>`).join("")}
    </div>
    <p class="legend"><span class="s">★★★</span> must do · ★★ should do · ★ nice to have</p>
    ${open.length ? `<ul class="tasks">${open.map(row).join("")}</ul>` : `<div class="empty"><p>Nothing left to do here.</p></div>`}
    <button class="add-row" data-act="new-task">Add a task</button>
    ${done.length ? `<h3 class="sub-title">Completed (${done.length})</h3><ul class="tasks">${done.map(row).join("")}</ul>` : ""}`;
}

function taskSheet(task) {
  const isNew = !task;
  task ||= { stars: 2, phase: S.filter !== "all" ? S.filter : "before" };
  openSheet(`<h2>${isNew ? "Add task" : "Edit task"}</h2>
    <form id="f">
      <label class="field"><span>Task</span><input class="input" name="title" required value="${esc(task.title)}"></label>
      <label class="field"><span>Notes</span><textarea class="input" name="notes">${esc(task.notes)}</textarea></label>
      <div class="field"><span>Importance</span><div class="starpick">
        ${[3, 2, 1].map((n) => `<input type="radio" name="stars" id="st${n}" value="${n}" ${Number(task.stars) === n ? "checked" : ""}>
          <label for="st${n}"><b>${"★".repeat(n)}${"☆".repeat(3 - n)}</b>${STAR_LABEL[n]}</label>`).join("")}
      </div></div>
      <label class="field"><span>When</span><select class="input" name="phase">${PHASES.map(([k, v]) =>
        `<option value="${k}" ${task.phase === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${isNew ? "" : `<label class="check"><input type="checkbox" name="done" ${task.done ? "checked" : ""}> Done</label>`}
      <div class="actions">
        ${isNew ? "" : `<button type="button" class="btn danger" data-sact="delete">Delete</button>`}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-sact="close">Cancel</button>
        <button class="btn" type="submit">${isNew ? "Add" : "Save"}</button>
      </div>
    </form>`, (root) => {
    root.querySelector("#f").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const data = { title: f.get("title").trim(), notes: f.get("notes").trim(), stars: Number(f.get("stars") || 1), phase: f.get("phase") };
      if (!data.title) { toast("Add a name for the task."); return; }
      if (isNew) write(store.add("tasks", { ...data, done: false, created: Date.now() }), "Task added");
      else {
        const done = f.get("done") === "on";
        if (done !== !!task.done) Object.assign(data, { done, doneBy: done ? myName() : "", doneAt: done ? Date.now() : null });
        write(store.update("tasks", task.id, data), "Saved");
      }
      closeSheet();
    });
    root.querySelector('[data-sact="delete"]')?.addEventListener("click", () => {
      if (confirm(`Delete “${task.title}” for both of you?`)) { write(store.remove("tasks", task.id), "Deleted"); closeSheet(); }
    });
  });
}

/* ================================================================ info */
function clockRows() {
  const d = new Date();
  const during = tripPhase().phase === "during";
  return CLOCKS.map(([city, tz]) => {
    const tm = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    const [t, ap] = tm.split(" ");
    const day = d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
    const home = during ? tz === "Asia/Tokyo" : tz === "America/New_York";
    return `<div class="clock ${home ? "home" : ""}"><div><div class="city">${city}</div><div class="when">${day}</div></div>
      <div class="tm">${t}<small>${ap}</small></div></div>`;
  }).join("");
}
function clockDiff() {
  const tk = offsetMin("Asia/Tokyo"), va = offsetMin("America/New_York"), ist = offsetMin("Europe/Istanbul");
  const h = (m) => { const v = m / 60; return `${Math.abs(v)} hour${Math.abs(v) === 1 ? "" : "s"}`; };
  return `Tokyo is ${h(tk - va)} ahead of Virginia and ${h(tk - ist)} ahead of Istanbul.`;
}

function renderInfo() {
  const r = rate();
  const st = S.data.settings || {};
  const places = S.data.places;
  const cats = [...new Set([...PLACE_ORDER, ...places.map((p) => p.cat)])].filter((c) => places.some((p) => p.cat === c));
  const quick = [500, 1000, 3000, 5000, 10000, 30000];

  const placeCard = (p) => {
    const q = p.q || p.address || p.name;
    return `<article class="place card">
      <h3>${esc(p.name)}</h3>
      ${p.address ? `<p class="addr">${esc(p.address)}</p>` : ""}
      ${p.jp ? `<p class="jp" lang="ja">${esc(p.jp)}</p>` : ""}
      ${p.note ? `<p class="pn">${esc(p.note)}</p>` : ""}
      <div class="acts">
        ${p.address ? `<a class="chip" href="${mapsApple(q)}" target="_blank" rel="noopener">Apple Maps</a>
          <a class="chip" href="${mapsGoogle(q)}" target="_blank" rel="noopener">Google Maps</a>` : ""}
        ${p.phone ? `<a class="chip call" href="tel:${esc(p.phone)}">Call ${esc(p.phone.length > 4 ? p.phone.replace(/^\+81/, "0") : p.phone)}</a>` : ""}
        ${p.jp ? `<button class="chip big" data-act="driver" data-id="${p.id}">Show to driver</button>` : ""}
      </div></article>`;
  };

  return `<h2 class="section-title">Time</h2>
    <div class="card"><div class="clocks" id="clocks">${clockRows()}</div><p class="diff" id="clock-diff">${clockDiff()}</p></div>

    <h2 class="section-title">Money</h2>
    <div class="card conv">
      <div class="pair">
        <label class="field"><span>US dollars</span><div class="money"><b>$</b><input class="input" id="usd" inputmode="decimal" value="10"></div></label>
        <div class="swap" aria-hidden="true">⇄</div>
        <label class="field"><span>Japanese yen</span><div class="money"><b>¥</b><input class="input" id="jpy" inputmode="numeric" value="${Math.round(10 * r)}"></div></label>
      </div>
      <div class="rate"><label for="rate">$1 =</label> ¥<input class="input" id="rate" inputmode="decimal" value="${r}">
        <button class="btn ghost" data-act="refresh-rate">Get today's rate</button></div>
      <p class="muted small" style="margin:0">${st.rateDate ? `Rate updated ${esc(st.rateDate)}.` : "Approximate rate."} Shared by both phones; banks and cards add 1–3%.</p>
      <div class="quick" id="quick">${quick.map((y) => `<div><b>${yen(y)}</b>${usd(y / r)}</div>`).join("")}</div>
    </div>

    <h2 class="section-title">Places</h2>
    ${cats.map((c) => `<h3 class="sub-title">${esc(c)}</h3><div class="places">${places.filter((p) => p.cat === c).map(placeCard).join("")}</div>`).join("")}`;
}

/* ================================================================ maps */
const OFFICIAL_MAPS = [
  ["Tokyo subway maps (Toei + Tokyo Metro)", "kotsu.metro.tokyo.jp", "https://www.kotsu.metro.tokyo.jp/eng/maps/"],
  ["Tokyo Metro (English)", "tokyometro.jp", "https://www.tokyometro.jp/lang_en/"],
  ["Osaka Metro (English)", "osakametro.co.jp", "https://subway.osakametro.co.jp/en/"],
];
function renderMaps() {
  if (S.maps == null) {
    S.maps = [];
    fetch("maps/maps.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => { S.maps = j.maps || []; render(); }).catch(() => {});
  }
  const cards = S.maps.map((m) => `<article class="card mapcard">
      <a class="imgwrap" href="maps/${encodeURIComponent(m.file)}" target="_blank" rel="noopener">
        <img src="maps/${encodeURIComponent(m.file)}" alt="${esc(m.title)}" loading="lazy" data-missing="${esc(m.file)}"></a>
      <div class="cap"><b>${esc(m.title)}</b><span class="muted small">Tap to zoom</span></div></article>`).join("");
  return `<h2 class="section-title">Train maps</h2>
    ${cards || `<div class="card missing">No map images listed yet. Add them to the <code>maps</code> folder and list them in <code>maps.json</code>.</div>`}
    <h3 class="sub-title">Official maps online</h3>
    <div class="links">${OFFICIAL_MAPS.map(([t, s, u]) => `<a class="card" href="${u}" target="_blank" rel="noopener"><b>${t}</b><span>${s}</span></a>`).join("")}</div>`;
}

/* ================================================================ guide */
function renderGuide() {
  const g = [...S.data.guide].sort((a, b) => (a.created || 0) - (b.created || 0));
  return `<h2 class="section-title">Travel guide</h2><div class="guide">${g.map((s, i) => `<details ${i === 0 ? "open" : ""}>
      <summary><div><b>${esc(s.section)}</b><br><span>${esc(s.title)}</span></div></summary>
      <ul>${(s.tips || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>`).join("")}</div>`;
}

/* ================================================================ settings / import */
function settingsSheet() {
  const theme = lsGet("jt-theme") || "auto";
  openSheet(`<h2>Settings</h2>
    <div class="settings-list">
      <div class="group"><span class="muted small">${store.mode === "local" ? "Preview mode: data is stored on this device only." : `Signed in as ${esc(S.user?.email)}`}</span></div>
      <label class="field"><span>Your name (shown on tasks you complete)</span><input class="input" id="set-name" value="${esc(myName())}"></label>
      <div class="group"><span class="muted small">Appearance</span><div class="theme-seg">
        ${[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([k, v]) => `<button data-theme-set="${k}" aria-pressed="${theme === k}">${v}</button>`).join("")}</div></div>
      <div class="group"><span class="muted small">Trip data</span>
        <button class="btn ghost wide" data-sact="export">Download a backup</button>
        <button class="btn ghost wide" data-sact="import">Import trip data…</button></div>
      ${store.mode === "local" ? "" : `<button class="btn danger" data-sact="signout">Sign out</button>`}
      <button class="btn wide" data-sact="close">Done</button>
    </div>`, (root) => {
    root.querySelector("#set-name").addEventListener("change", (e) => { lsSet("jt-name", e.target.value.trim()); toast("Name saved"); });
    root.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
      lsSet("jt-theme", b.dataset.themeSet); applyTheme();
      root.querySelectorAll("[data-theme-set]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    }));
    root.querySelector('[data-sact="export"]').addEventListener("click", exportBackup);
    root.querySelector('[data-sact="import"]').addEventListener("click", pickImport);
    root.querySelector('[data-sact="signout"]')?.addEventListener("click", () => { closeSheet(); store.signOut(); });
  });
}

function pickImport() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json"; inp.id = "import-file";
  inp.style.display = "none";
  document.body.appendChild(inp);
  inp.addEventListener("change", async () => {
    const file = inp.files[0]; inp.remove();
    if (!file) return;
    try {
      const seed = JSON.parse(await file.text());
      if (!seed.items || !seed.tasks) throw new Error("not a trip file");
      const has = S.data && (S.data.items.length || S.data.tasks.length);
      let replace = false;
      if (has) {
        replace = confirm("Replace everything currently in the app with this file? Choose Cancel to keep the current data.");
        if (!replace) return;
      }
      toast("Importing…");
      await store.importSeed(seed, replace);
      closeSheet(); S.day = null;
      toast(`Imported ${seed.items.length} activities and ${seed.tasks.length} tasks`);
    } catch (e) {
      toast(e.message === "not a trip file" ? "That file isn't a trip data file." : "Import failed: " + (e.code || e.message));
    }
  });
  inp.click();
}

function exportBackup() {
  const d = S.data || {};
  const strip = (r) => { const { id, ...rest } = r; return rest; };
  const out = { version: 1, trip: d.trip, settings: d.settings, items: d.items.map(strip), tasks: d.tasks.map(strip), places: d.places.map(strip), guide: d.guide.map(strip) };
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `japan-trip-backup-${partsIn("America/New_York").date}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ================================================================ sheet */
function openSheet(html, mount) {
  $sheet.innerHTML = `<div class="scrim" data-sact="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div>${html}</div>`;
  document.body.style.overflow = "hidden";
  $sheet.querySelectorAll('[data-sact="close"]').forEach((el) => el.addEventListener("click", closeSheet));
  mount && mount($sheet);
  const first = $sheet.querySelector("input:not([type=checkbox]):not([type=radio]), textarea");
  if (first && !first.value) setTimeout(() => first.focus(), 50);
}
function closeSheet() {
  $sheet.innerHTML = ""; document.body.style.overflow = "";
  if (pendingRender) render();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $sheet.innerHTML) closeSheet(); });

function write(promise, okMsg) {
  toast(okMsg);
  Promise.resolve(promise).catch((e) => toast("Couldn't save: " + (e.code || e.message)));
}

function driverCard(p) {
  const el = document.createElement("div");
  el.className = "driver";
  el.innerHTML = `<p>Please take us to</p><div class="jpbig" lang="ja">${esc(p.jp)}</div><div class="name">${esc(p.name)}</div>
    <div><button class="btn">Close</button></div>`;
  el.querySelector("button").addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}

/* ================================================================ events */
$app.addEventListener("click", (e) => {
  if (e.target.closest("[data-stop]")) return;
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case "tab": S.tab = id; lsSet("jt-tab", id); render(); window.scrollTo(0, 0); break;
    case "day": S.day = Number(id); render(); break;
    case "filter": S.filter = id; render(); break;
    case "settings": settingsSheet(); break;
    case "signout": store.signOut(); break;
    case "import": pickImport(); break;
    case "new-item": itemSheet(null); break;
    case "edit-item": itemSheet(S.data.items.find((x) => x.id === id)); break;
    case "new-task": taskSheet(null); break;
    case "edit-task": taskSheet(S.data.tasks.find((x) => x.id === id)); break;
    case "toggle-task": {
      const t = S.data.tasks.find((x) => x.id === id);
      if (!t) break;
      const done = !t.done;
      write(store.update("tasks", id, { done, doneBy: done ? myName() : "", doneAt: done ? Date.now() : null }), done ? "Marked done" : "Moved back to open");
      break;
    }
    case "driver": driverCard(S.data.places.find((x) => x.id === id)); break;
    case "refresh-rate": refreshRate(el); break;
  }
});
$app.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
});
$app.addEventListener("input", (e) => {
  const r = rate();
  if (e.target.id === "usd") {
    const v = parseFloat(e.target.value.replace(/,/g, "")); document.getElementById("jpy").value = isNaN(v) ? "" : Math.round(v * r);
  } else if (e.target.id === "jpy") {
    const v = parseFloat(e.target.value.replace(/,/g, "")); document.getElementById("usd").value = isNaN(v) ? "" : (v / r).toFixed(2);
  }
});
$app.addEventListener("change", (e) => {
  if (e.target.id === "rate") {
    const v = parseFloat(e.target.value);
    if (v > 50 && v < 400) { write(store.setSettings({ rate: v, rateDate: dateLabel(partsIn("America/New_York").date, { month: "short", day: "numeric" }) }), "Rate saved for both phones"); }
    else toast("Enter a rate between 50 and 400.");
  }
});
$app.addEventListener("focusout", () => setTimeout(() => {
  const a = document.activeElement;
  if (pendingRender && !(a && $app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
}, 0));
$app.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName === "IMG" && img.dataset.missing) {
    img.closest(".imgwrap").outerHTML = `<div class="missing">Add <code>${esc(img.dataset.missing)}</code> to the <code>maps</code> folder to show this map.</div>`;
  }
}, true);

async function refreshRate(btn) {
  btn.disabled = true; btn.textContent = "Checking…";
  try {
    const j = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
    const v = Math.round(j.rates.JPY * 10) / 10;
    if (!v) throw new Error();
    write(store.setSettings({ rate: v, rateDate: dateLabel(partsIn("America/New_York").date, { month: "short", day: "numeric" }) }), `Rate updated: $1 = ¥${v}`);
  } catch {
    toast("Couldn't get today's rate. Type it in instead.");
  } finally { btn.disabled = false; btn.textContent = "Get today's rate"; }
}

function afterRender() {
  if (S.tab === "plan") {
    const sel = document.querySelector('.day-chip[aria-pressed="true"]');
    const strip = sel && sel.parentElement;
    if (strip) strip.scrollLeft = sel.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2;
  }
}

// keep clocks and the "now" marker fresh
setInterval(() => {
  const c = document.getElementById("clocks");
  if (c) { c.innerHTML = clockRows(); document.getElementById("clock-diff").textContent = clockDiff(); }
}, 15000);
setInterval(() => { if (S.tab === "plan" && S.data && !$sheet.innerHTML) render(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.data) render(); });

boot();
