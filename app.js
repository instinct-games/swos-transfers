"use strict";

// ---------------------------------------------------------------- constants

const STATS = [
  { key: "passing", label: "P", full: "Passing", name: "Passing" },
  { key: "velocity", label: "V", full: "Velocity", name: "Velocity (shot power)" },
  { key: "heading", label: "H", full: "Heading", name: "Heading" },
  { key: "tackling", label: "T", full: "Tackling", name: "Tackling" },
  { key: "ball_control", label: "C", full: "Ball Control", name: "Ball Control" },
  { key: "speed", label: "S", full: "Speed", name: "Speed" },
  { key: "finishing", label: "F", full: "Finishing", name: "Finishing" },
];

const POSITIONS = ["G", "RB", "D", "LB", "M", "RW", "LW", "A"];
const POS_ORDER = Object.fromEntries(POSITIONS.map((p, i) => [p, i]));

const NATIONAL_LEAGUES = new Set(
  ["AFRICA", "ASIA", "EUROPE", "NORTH AMERICA", "OCEANIA", "SOUTH AMERICA"]);

const PAGE_SIZE = 50;
const LS_TEAM = "swos.team";
const LS_SHORTLIST = "swos.shortlist";
const LS_NOTES = "swos.notes";
const LS_HISTORY = "swos.history";

// ---------------------------------------------------------------- state

const state = {
  players: [],
  byId: new Map(),
  team: loadLS(LS_TEAM, []),            // [playerId, ...]
  shortlist: loadLS(LS_SHORTLIST, []),  // [playerId, ...]
  notes: loadLS(LS_NOTES, {}),          // { playerId: "text" }
  history: loadLS(LS_HISTORY, []),      // [{sid, name, description, createdAt, team: [playerId]}]
  filters: resetFilters(),
  sort: { key: "value_gbp", dir: -1 },
  slSort: null,   // null = order added
  slPositions: new Set(),
  teamSort: null, // null = formation order

  page: 1,
  filtered: [],
};

function resetFilters() {
  return {
    q: "",
    scope: "club",
    league: "",
    nation: "",
    minVal: null,
    maxVal: null,
    positions: new Set(),
    statMin: {},
    statMax: {},
  };
}

function loadLS(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(fallback)) return Array.isArray(v) ? v : fallback;
    return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function saveLS() {
  localStorage.setItem(LS_TEAM, JSON.stringify(state.team));
  localStorage.setItem(LS_SHORTLIST, JSON.stringify(state.shortlist));
  localStorage.setItem(LS_NOTES, JSON.stringify(state.notes));
  localStorage.setItem(LS_HISTORY, JSON.stringify(state.history));
}

// ---------------------------------------------------------------- helpers

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtValue(gbp) {
  if (gbp >= 1_000_000) return "£" + (gbp / 1_000_000).toFixed(gbp % 1_000_000 ? 1 : 0) + "M";
  if (gbp >= 1_000) return "£" + Math.round(gbp / 1_000) + "K";
  return "£" + gbp;
}

// Accepts "500K", "1.2m", "750000", "£2M"
function parseValueInput(text) {
  const t = text.trim().toLowerCase().replace(/[£,\s]/g, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === "m" ? n * 1_000_000 : m[2] === "k" ? n * 1_000 : n;
}

function skillCell(v) {
  return `<td class="stat-col"><span class="rt r${v}">${v}</span></td>`;
}

const NOTE_ICON =
  `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M3 2.5h10a.5.5 0 0 1 .5.5v6.5L9.5 14H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z"/>
    <path d="M13.5 9.5H10a.5.5 0 0 0-.5.5v4"/>
    <path d="M5 6h6M5 8.5h3.5"/>
  </svg>`;

// Name cell with the note icon — used by all three tables.
function nameCell(p) {
  const note = noteFor(p.id);
  return `<td><span class="name">${esc(p.name)}</span>
    <button class="note-btn ${note ? "on-note" : ""}"
      title="${note ? esc(note) : "Add note"}">${NOTE_ICON}</button></td>`;
}

// App-styled replacement for confirm(); resolves true on confirm.
function confirmDialog(message, okLabel = "Remove") {
  return new Promise((resolve) => {
    const dlg = $("#confirm-dialog");
    const ok = $("#confirm-ok");
    const cancel = $("#confirm-cancel");
    $("#confirm-message").textContent = message;
    ok.textContent = okLabel;
    const done = (v) => { cleanup(); if (dlg.open) dlg.close(); resolve(v); };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onEsc = () => done(false); // dialog "cancel" event (Esc key)
    const onBackdrop = (ev) => { if (ev.target === dlg) done(false); };
    function cleanup() {
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      dlg.removeEventListener("cancel", onEsc);
      dlg.removeEventListener("click", onBackdrop);
    }
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    dlg.addEventListener("cancel", onEsc);
    dlg.addEventListener("click", onBackdrop);
    dlg.showModal();
  });
}

function onShortlist(id) {
  return state.shortlist.includes(id);
}

function inTeam(id) {
  return state.team.includes(id);
}

function noteFor(id) {
  return state.notes[id] || "";
}

function setNote(id, text) {
  if (text.trim()) state.notes[id] = text;
  else delete state.notes[id];
  saveLS();
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------- data load

async function loadPlayers() {
  let text;
  try {
    const res = await fetch("swos_players.csv");
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    text = await res.text();
  } catch (err) {
    const el = $("#loading");
    el.classList.add("error");
    el.textContent =
      "Could not load swos_players.csv (" + err.message + ").\n" +
      "Browsers block fetch() from file:// — serve the folder instead:\n" +
      "python3 -m http.server 8000   →   http://localhost:8000";
    return false;
  }

  const lines = text.split("\n");
  const players = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = line.split(",");
    if (f.length < 16) continue;
    const p = {
      shirt: f[0],
      name: f[1],
      position: f[3] || "?",
      nationality: f[4],
      value_gbp: +f[6] || 0,
      passing: +f[7] | 0,
      velocity: +f[8] | 0,
      heading: +f[9] | 0,
      tackling: +f[10] | 0,
      ball_control: +f[11] | 0,
      speed: +f[12] | 0,
      finishing: +f[13] | 0,
      team: f[14],
      league: f[15],
    };
    p.total = p.passing + p.velocity + p.heading + p.tackling +
      p.ball_control + p.speed + p.finishing;
    p.national = NATIONAL_LEAGUES.has(p.league);
    p.search = (p.name + " " + p.team + " " + p.nationality).toLowerCase();
    players.push(p);
  }

  // Assign unique ids: club rows are name-club-country (country = the club's
  // league), national rows are name-country (the team IS the country). Shirt
  // number is appended only for same-name-same-club collisions.
  const taken = new Set();
  for (const p of players) {
    let id = p.national
      ? slugify(p.name + " " + p.team)
      : slugify(p.name + " " + p.team + " " + p.league);
    if (taken.has(id)) id += "-" + p.shirt;
    while (taken.has(id)) id += "-x";
    taken.add(id);
    p.id = id;
    state.byId.set(p.id, p);
  }

  state.players = players;
  return true;
}

// ---------------------------------------------------------------- filtering

function applyFilters() {
  const f = state.filters;
  const statKeys = STATS.map((s) => s.key).filter(
    (k) => f.statMin[k] != null || f.statMax[k] != null
  );

  state.filtered = state.players.filter((p) => {
    if (f.scope === "club" && p.national) return false;
    if (f.scope === "national" && !p.national) return false;
    if (f.q && !p.search.includes(f.q)) return false;
    if (f.positions.size && !f.positions.has(p.position)) return false;
    if (f.league && p.league !== f.league) return false;
    if (f.nation && p.nationality !== f.nation) return false;
    if (f.minVal != null && p.value_gbp < f.minVal) return false;
    if (f.maxVal != null && p.value_gbp > f.maxVal) return false;
    for (const k of statKeys) {
      if (f.statMin[k] != null && p[k] < f.statMin[k]) return false;
      if (f.statMax[k] != null && p[k] > f.statMax[k]) return false;
    }
    return true;
  });

  sortFiltered();
  state.page = 1;
}

function playerCompare(a, b, key, dir) {
  let r;
  if (key === "position") r = (POS_ORDER[a.position] ?? 99) - (POS_ORDER[b.position] ?? 99);
  else if (["name", "nationality", "team", "league"].includes(key))
    r = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
  else r = a[key] - b[key];
  if (r === 0) r = a.name < b.name ? -1 : 1;
  return r * dir;
}

function sortFiltered() {
  const { key, dir } = state.sort;
  state.filtered.sort((a, b) => playerCompare(a, b, key, dir));
}

// builds a sortable <th> renderer bound to a sort state ({key, dir} | null)
function thBuilder(sortState) {
  return (key, label, cls = "", title = "") => {
    const sorted = sortState && sortState.key === key;
    const arrow = sorted ? (sortState.dir === 1 ? " ▲" : " ▼") : "";
    return `<th data-sort="${key}" class="${cls}${sorted ? " sorted" : ""}"` +
      (title ? ` title="${title}"` : "") + `>${label}${arrow}</th>`;
  };
}

// shared click-to-sort behaviour: numeric columns start descending
function nextSort(current, key) {
  if (current && current.key === key) return { key, dir: current.dir * -1 };
  const numeric = key === "value_gbp" || key === "total" || STATS.some((s) => s.key === key);
  return { key, dir: numeric ? -1 : 1 };
}

// ---------------------------------------------------------------- players tab

const PLAYER_COLS = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nationality", label: "Nat" },
  { key: "team", label: "Club" },
  { key: "league", label: "League" },
  { key: "value_gbp", label: "Value" },
  ...STATS.map((s) => ({ key: s.key, label: s.label, stat: true, title: s.name })),
  { key: "total", label: "Tot", stat: true, title: "Total of all seven ratings" },
  { key: null, label: "" },
];

function renderPlayersHead() {
  $("#players-table thead").innerHTML = "<tr>" + PLAYER_COLS.map((c) => {
    if (!c.key) return "<th></th>";
    const sorted = state.sort.key === c.key;
    const arrow = sorted ? (state.sort.dir === 1 ? " ▲" : " ▼") : "";
    return `<th data-sort="${c.key}" class="${c.stat ? "stat-col" : ""}${sorted ? " sorted" : ""}"` +
      (c.title ? ` title="${c.title}"` : "") + `>${c.label}${arrow}</th>`;
  }).join("") + "</tr>";
}

function renderPlayersBody() {
  const start = (state.page - 1) * PAGE_SIZE;
  const rows = state.filtered.slice(start, start + PAGE_SIZE);

  $("#players-table tbody").innerHTML = rows.map((p) => {
    const onList = onShortlist(p.id);
    const onTeam = inTeam(p.id);
    return `<tr class="${onTeam ? "in-team" : ""}" data-id="${esc(p.id)}">
      ${nameCell(p)}
      <td><b>${esc(p.position)}</b></td>
      <td>${esc(p.nationality)}</td>
      <td>${esc(p.team)}</td>
      <td class="sub">${esc(p.league)}</td>
      <td class="num">${fmtValue(p.value_gbp)}</td>
      ${STATS.map((s) => skillCell(p[s.key])).join("")}
      <td class="stat-col total">${p.total}</td>
      <td><div class="row-actions">
        <button class="act-list ${onList ? "on-list" : ""}" title="${onList ? "Remove from shortlist" : "Add to shortlist"}">${onList ? "★ Listed" : "☆ List"}</button>
        <button class="act-team ${onTeam ? "on-team" : ""}" title="${onTeam ? "Remove from my team" : "Add to my team"}">${onTeam ? "✓ Team" : "+ Team"}</button>
      </div></td>
    </tr>`;
  }).join("");

  const total = state.filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $("#result-count").textContent =
    total.toLocaleString() + " player" + (total === 1 ? "" : "s") + " found";
  document.querySelectorAll(".pg-info").forEach((el) =>
    (el.textContent = "Page " + state.page + " / " + pages));
  document.querySelectorAll(".pg-prev").forEach((b) => (b.disabled = state.page <= 1));
  document.querySelectorAll(".pg-next").forEach((b) => (b.disabled = state.page >= pages));
}

function renderPlayers() {
  renderPlayersHead();
  renderPlayersBody();
}

// ---------------------------------------------------------------- shortlist tab

function renderShortlist() {
  $("#shortlist-count").textContent = state.shortlist.length;
  const entries = state.shortlist
    .map((id) => state.byId.get(id))
    .filter((p) => p && (!state.slPositions.size || state.slPositions.has(p.position)));
  $("#shortlist-empty").hidden = state.shortlist.length > 0;
  $("#sl-positions").parentElement.hidden = !state.shortlist.length;

  if (state.slSort) {
    const { key, dir } = state.slSort;
    entries.sort((a, b) => playerCompare(a, b, key, dir));
  }

  const th = thBuilder(state.slSort);

  $("#shortlist-table thead").innerHTML = entries.length ? `<tr>
    ${th("name", "Player")}${th("position", "Pos")}${th("nationality", "Nat")}
    ${th("team", "Club")}${th("league", "League")}${th("value_gbp", "Value")}
    ${STATS.map((s) => th(s.key, s.label, "stat-col", s.name)).join("")}
    ${th("total", "Tot", "stat-col", "Total of all seven ratings")}
    <th></th></tr>` : "";

  $("#shortlist-table tbody").innerHTML = entries.map((p) => `
    <tr data-id="${esc(p.id)}">
      ${nameCell(p)}
      <td><b>${esc(p.position)}</b></td>
      <td>${esc(p.nationality)}</td>
      <td>${esc(p.team)}</td>
      <td class="sub">${esc(p.league)}</td>
      <td class="num">${fmtValue(p.value_gbp)}</td>
      ${STATS.map((s) => skillCell(p[s.key])).join("")}
      <td class="stat-col total">${p.total}</td>
      <td><div class="row-actions">
        <button class="sign" title="Move into My Team">Signed ➜</button>
        <button class="sl-remove" title="Remove from shortlist">✕</button>
      </div></td>
    </tr>`).join("");
}

// ---------------------------------------------------------------- team tab

function renderTeam() {
  $("#team-count").textContent = state.team.length;
  const squad = state.team
    .map((id) => state.byId.get(id))
    .filter(Boolean)
    .sort(state.teamSort
      ? (a, b) => playerCompare(a, b, state.teamSort.key, state.teamSort.dir)
      : (a, b) =>
        (POS_ORDER[a.position] ?? 99) - (POS_ORDER[b.position] ?? 99) ||
        (a.name < b.name ? -1 : 1));

  $("#team-empty-hint").hidden = squad.length > 0;

  const totalVal = squad.reduce((s, p) => s + p.value_gbp, 0);

  $("#team-summary").innerHTML = squad.length ? `
    <div class="sum-card"><div class="k">Squad</div><div class="v">${squad.length}</div></div>
    <div class="sum-card"><div class="k">Total value</div><div class="v">${fmtValue(totalVal)}</div></div>
  ` : "";

  const th = thBuilder(state.teamSort);
  $("#team-table thead").innerHTML = squad.length ? `<tr>
    ${th("name", "Player")}${th("position", "Pos")}${th("nationality", "Nat")}
    ${th("team", "Club")}${th("value_gbp", "Value")}
    ${STATS.map((s) => th(s.key, s.label, "stat-col", s.name)).join("")}
    ${th("total", "Tot", "stat-col", "Total of all seven ratings")}
    <th></th></tr>` : "";

  $("#team-table tbody").innerHTML = squad.map((p) => `
    <tr data-id="${esc(p.id)}">
      ${nameCell(p)}
      <td><b>${esc(p.position)}</b></td>
      <td>${esc(p.nationality)}</td>
      <td>${esc(p.team)} <span class="sub">· ${esc(p.league)}</span></td>
      <td class="num">${fmtValue(p.value_gbp)}</td>
      ${STATS.map((s) => skillCell(p[s.key])).join("")}
      <td class="stat-col total">${p.total}</td>
      <td><button class="remove" title="Remove from team">✕</button></td>
    </tr>`).join("");

  renderHistory();
}

// ---------------------------------------------------------------- team history

function renderHistory() {
  $("#btn-snapshot").disabled = !state.team.length;
  $("#history-empty").hidden = state.history.length > 0;

  $("#history-list").innerHTML = state.history.map((s) => {
    const squad = s.team.map((id) => state.byId.get(id)).filter(Boolean)
      .sort((a, b) =>
        (POS_ORDER[a.position] ?? 99) - (POS_ORDER[b.position] ?? 99) ||
        (a.name < b.name ? -1 : 1));
    const value = squad.reduce((t, p) => t + p.value_gbp, 0);
    const when = new Date(s.createdAt).toLocaleDateString(undefined,
      { day: "numeric", month: "short", year: "numeric" });
    return `<div class="snap-card" data-sid="${esc(s.sid)}">
      <div class="snap-head">
        <span class="snap-name">${esc(s.name)}</span>
        <span class="sub">${when} · ${squad.length} players · ${fmtValue(value)}</span>
        <span class="snap-actions">
          <button class="snap-edit ghost" title="Edit name / description">✎ Edit</button>
          <button class="snap-delete ghost" title="Delete snapshot">✕</button>
        </span>
      </div>
      ${s.description ? `<p class="snap-desc">${esc(s.description)}</p>` : ""}
      <details>
        <summary>Squad</summary>
        <div class="table-wrap snap-wrap">
          <table class="snap-table">
            <thead><tr><th>Pos</th><th>Player</th><th>Club</th><th>Value</th>
              ${STATS.map((st) => `<th class="stat-col" title="${st.name}">${st.label}</th>`).join("")}
              <th class="stat-col" title="Total of all seven ratings">Tot</th></tr></thead>
            <tbody>${squad.map((p) => `<tr>
              <td><b>${esc(p.position)}</b></td>
              <td><span class="name">${esc(p.name)}</span></td>
              <td class="sub">${esc(p.team)}</td>
              <td class="num">${fmtValue(p.value_gbp)}</td>
              ${STATS.map((st) => skillCell(p[st.key])).join("")}
              <td class="stat-col total">${p.total}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </details>
    </div>`;
  }).join("");
}

// Modal for creating/editing a snapshot; calls onSave(name, description).
function snapDialog(title, name, description, onSave) {
  const dlg = $("#snap-dialog");
  const nameEl = $("#snap-name");
  const descEl = $("#snap-desc");
  $("#snap-title").textContent = title;
  nameEl.value = name;
  descEl.value = description;
  const save = $("#snap-save");
  const cancel = $("#snap-cancel");
  const done = (commit) => {
    cleanup();
    if (dlg.open) dlg.close();
    if (commit) onSave(nameEl.value.trim(), descEl.value.trim());
  };
  const onOk = () => done(true);
  const onCancel = () => done(false);
  const onEsc = () => done(false);
  function cleanup() {
    save.removeEventListener("click", onOk);
    cancel.removeEventListener("click", onCancel);
    dlg.removeEventListener("cancel", onEsc);
  }
  save.addEventListener("click", onOk);
  cancel.addEventListener("click", onCancel);
  dlg.addEventListener("cancel", onEsc);
  dlg.showModal();
}

// ---------------------------------------------------------------- mutations

function toggleShortlist(id) {
  const i = state.shortlist.indexOf(id);
  if (i >= 0) state.shortlist.splice(i, 1);
  else state.shortlist.push(id);
  saveLS();
  renderShortlist();
  renderPlayersBody();
}

function toggleTeam(id) {
  const i = state.team.indexOf(id);
  if (i >= 0) state.team.splice(i, 1);
  else state.team.push(id);
  saveLS();
  renderTeam();
  renderPlayersBody();
}

function signPlayer(id) {
  if (!inTeam(id)) state.team.push(id);
  state.shortlist = state.shortlist.filter((sid) => sid !== id);
  saveLS();
  renderShortlist();
  renderTeam();
  renderPlayersBody();
}

// Modal editor for a player's note (used from the Players tab).
function noteDialog(p) {
  const dlg = $("#note-dialog");
  const text = $("#note-text");
  $("#note-title").textContent = `Notes — ${p.name} (${p.team})`;
  text.value = noteFor(p.id);
  const save = $("#note-save");
  const cancel = $("#note-cancel");
  const done = (commit) => {
    cleanup();
    if (dlg.open) dlg.close();
    if (commit) {
      setNote(p.id, text.value);
      renderPlayersBody();
      renderShortlist();
      renderTeam();
    }
  };
  const onSave = () => done(true);
  const onCancel = () => done(false);
  const onEsc = () => done(false);
  function cleanup() {
    save.removeEventListener("click", onSave);
    cancel.removeEventListener("click", onCancel);
    dlg.removeEventListener("cancel", onEsc);
  }
  save.addEventListener("click", onSave);
  cancel.addEventListener("click", onCancel);
  dlg.addEventListener("cancel", onEsc);
  dlg.showModal();
}

// ---------------------------------------------------------------- UI setup

function buildFilterControls() {
  // position toggles (players tab + shortlist tab)
  const posButtons = POSITIONS.map((p) =>
    `<button data-pos="${p}" title="${p}">${p}</button>`).join("");
  $("#f-positions").innerHTML = posButtons;
  $("#sl-positions").innerHTML = posButtons;

  // per-stat min/max
  const opts = (blank) => `<option value="">${blank}</option>` +
    [0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option>${n}</option>`).join("");
  $("#f-stats").innerHTML = STATS.map((s) => `
    <span class="stat-filter" data-stat="${s.key}">
      <label title="${s.name}">${s.full}</label>
      <span class="selects">
        <select class="st-min" title="${s.name} — minimum">${opts("Min")}</select>
        <select class="st-max" title="${s.name} — maximum">${opts("Max")}</select>
      </span>
    </span>`).join("");

  // ratings legend (shortlist tab)
  $("#stats-legend").innerHTML =
    STATS.map((s) => `<span><b>${s.label}</b> ${s.name}</span>`).join("") +
    `<span><b>Tot</b> Total of all seven</span>`;

  // league / nationality dropdowns
  const leagues = [...new Set(state.players.map((p) => p.league))].sort();
  const nations = [...new Set(state.players.map((p) => p.nationality))].sort();
  $("#f-league").innerHTML += leagues.map((l) => `<option>${esc(l)}</option>`).join("");
  $("#f-nation").innerHTML += nations.map((n) => `<option>${esc(n)}</option>`).join("");
}

function refreshList() {
  applyFilters();
  renderPlayers();
}

function bindEvents() {
  // tabs
  $("#tabs").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    document.querySelectorAll(".panel").forEach((p) =>
      (p.hidden = p.id !== "panel-" + btn.dataset.tab));
    history.replaceState(null, "", "#" + btn.dataset.tab);
  });

  // text/select filters
  let debounce;
  $("#f-search").addEventListener("input", (ev) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.filters.q = ev.target.value.trim().toLowerCase();
      refreshList();
    }, 150);
  });
  $("#f-league").addEventListener("change", (ev) => { state.filters.league = ev.target.value; refreshList(); });
  $("#f-nation").addEventListener("change", (ev) => { state.filters.nation = ev.target.value; refreshList(); });
  $("#f-minval").addEventListener("change", (ev) => { state.filters.minVal = parseValueInput(ev.target.value); refreshList(); });
  $("#f-maxval").addEventListener("change", (ev) => { state.filters.maxVal = parseValueInput(ev.target.value); refreshList(); });

  // club / national / both
  $("#f-scope").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-scope]");
    if (!btn) return;
    state.filters.scope = btn.dataset.scope;
    document.querySelectorAll("#f-scope button").forEach((b) =>
      b.classList.toggle("on", b === btn));
    refreshList();
  });

  // positions
  $("#f-positions").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const pos = btn.dataset.pos;
    if (state.filters.positions.has(pos)) state.filters.positions.delete(pos);
    else state.filters.positions.add(pos);
    btn.classList.toggle("on");
    refreshList();
  });

  // stat min/max
  $("#f-stats").addEventListener("change", (ev) => {
    const box = ev.target.closest(".stat-filter");
    if (!box) return;
    const key = box.dataset.stat;
    const min = box.querySelector(".st-min").value;
    const max = box.querySelector(".st-max").value;
    state.filters.statMin[key] = min === "" ? null : +min;
    state.filters.statMax[key] = max === "" ? null : +max;
    box.classList.toggle("active",
      state.filters.statMin[key] != null || state.filters.statMax[key] != null);
    refreshList();
  });

  // reset
  $("#f-reset").addEventListener("click", () => {
    state.filters = resetFilters();
    $("#f-search").value = "";
    document.querySelectorAll("#f-scope button").forEach((b) =>
      b.classList.toggle("on", b.dataset.scope === "club"));
    $("#f-league").value = "";
    $("#f-nation").value = "";
    $("#f-minval").value = "";
    $("#f-maxval").value = "";
    document.querySelectorAll("#f-positions button").forEach((b) => b.classList.remove("on"));
    document.querySelectorAll(".stat-filter").forEach((el) => {
      el.classList.remove("active");
      el.querySelector(".st-min").value = "";
      el.querySelector(".st-max").value = "";
    });
    refreshList();
  });

  // sorting
  $("#players-table thead").addEventListener("click", (ev) => {
    const th = ev.target.closest("th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    if (state.sort.key === key) state.sort.dir *= -1;
    else state.sort = { key, dir: key === "value_gbp" || key === "total" ||
      STATS.some((s) => s.key === key) ? -1 : 1 };
    sortFiltered();
    state.page = 1;
    renderPlayers();
  });

  // pagination (top and bottom pagers)
  document.querySelectorAll(".pg-prev").forEach((b) =>
    b.addEventListener("click", () => { state.page--; renderPlayersBody(); }));
  document.querySelectorAll(".pg-next").forEach((b) =>
    b.addEventListener("click", () => { state.page++; renderPlayersBody(); }));

  // note icons (all tables)
  const noteClickHandler = (ev) => {
    if (!ev.target.closest(".note-btn")) return false;
    const row = ev.target.closest("tr[data-id]");
    const p = row && state.byId.get(row.dataset.id);
    if (p) noteDialog(p);
    return true;
  };

  // row actions
  $("#players-table tbody").addEventListener("click", (ev) => {
    if (noteClickHandler(ev)) return;
    const row = ev.target.closest("tr[data-id]");
    if (!row) return;
    if (ev.target.closest(".act-list")) toggleShortlist(row.dataset.id);
    else if (ev.target.closest(".act-team")) toggleTeam(row.dataset.id);
  });

  // shortlist position filter
  $("#sl-positions").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const pos = btn.dataset.pos;
    if (state.slPositions.has(pos)) state.slPositions.delete(pos);
    else state.slPositions.add(pos);
    btn.classList.toggle("on");
    renderShortlist();
  });

  // shortlist sorting
  $("#shortlist-table thead").addEventListener("click", (ev) => {
    const th = ev.target.closest("th[data-sort]");
    if (!th) return;
    state.slSort = nextSort(state.slSort, th.dataset.sort);
    renderShortlist();
  });

  // team sorting
  $("#team-table thead").addEventListener("click", (ev) => {
    const th = ev.target.closest("th[data-sort]");
    if (!th) return;
    state.teamSort = nextSort(state.teamSort, th.dataset.sort);
    renderTeam();
  });

  // shortlist row actions
  $("#shortlist-table tbody").addEventListener("click", async (ev) => {
    if (noteClickHandler(ev)) return;
    const row = ev.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    if (ev.target.closest(".sign")) signPlayer(id);
    else if (ev.target.closest(".sl-remove")) {
      const p = state.byId.get(id);
      if (await confirmDialog(`Remove ${p ? p.name : "this player"} from your shortlist?`))
        toggleShortlist(id);
    }
  });

  // export / import
  $("#btn-export").addEventListener("click", () => {
    const data = {
      app: "swos-transfers",
      exportedAt: new Date().toISOString(),
      team: state.team,
      shortlist: state.shortlist,
      notes: state.notes,
      history: state.history,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "swos-transfers-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!Array.isArray(data.team) || !Array.isArray(data.shortlist)) throw new Error();
    } catch {
      alert("That doesn't look like a SWOS Transfers export file.");
      return;
    }
    const team = data.team.filter((id) => state.byId.has(id));
    const shortlist = data.shortlist.filter((id) => state.byId.has(id));
    const notes = {};
    if (data.notes && typeof data.notes === "object" && !Array.isArray(data.notes)) {
      for (const [id, text] of Object.entries(data.notes))
        if (state.byId.has(id) && typeof text === "string" && text.trim()) notes[id] = text;
    }
    const history = (Array.isArray(data.history) ? data.history : [])
      .filter((s) => s && typeof s.name === "string" && Array.isArray(s.team))
      .map((s) => ({
        sid: typeof s.sid === "string" ? s.sid : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: s.name,
        description: typeof s.description === "string" ? s.description : "",
        createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
        team: s.team.filter((id) => state.byId.has(id)),
      }));
    const dropped = (data.team.length - team.length) + (data.shortlist.length - shortlist.length);
    if (!await confirmDialog(
      "Import " + team.length + " team player(s), " + shortlist.length +
      " shortlist entr(ies), " + Object.keys(notes).length + " note(s) and " +
      history.length + " snapshot(s)?" +
      (dropped ? "\n(" + dropped + " unrecognised entries will be skipped.)" : "") +
      "\n\nThis replaces your current team, shortlist, notes and history.", "Import"
    )) return;
    state.team = team;
    state.shortlist = shortlist;
    state.notes = notes;
    state.history = history;
    saveLS();
    renderShortlist();
    renderTeam();
    renderPlayersBody();
  });

  // team history
  $("#btn-snapshot").addEventListener("click", () => {
    const today = new Date().toLocaleDateString(undefined,
      { day: "numeric", month: "short", year: "numeric" });
    snapDialog("Save team snapshot", "Squad — " + today, "", (name, description) => {
      state.history.unshift({
        sid: Date.now().toString(36),
        name: name || "Squad — " + today,
        description,
        createdAt: new Date().toISOString(),
        team: [...state.team],
      });
      saveLS();
      renderHistory();
    });
  });

  $("#history-list").addEventListener("click", async (ev) => {
    const card = ev.target.closest(".snap-card");
    if (!card) return;
    const snap = state.history.find((s) => s.sid === card.dataset.sid);
    if (!snap) return;
    if (ev.target.closest(".snap-edit")) {
      snapDialog("Edit snapshot", snap.name, snap.description, (name, description) => {
        snap.name = name || snap.name;
        snap.description = description;
        saveLS();
        renderHistory();
      });
    } else if (ev.target.closest(".snap-delete")) {
      if (await confirmDialog(`Delete snapshot "${snap.name}"?`, "Delete")) {
        state.history = state.history.filter((s) => s.sid !== snap.sid);
        saveLS();
        renderHistory();
      }
    }
  });

  // team removals
  $("#team-table tbody").addEventListener("click", async (ev) => {
    if (noteClickHandler(ev)) return;
    if (!ev.target.closest(".remove")) return;
    const row = ev.target.closest("tr[data-id]");
    if (!row) return;
    const p = state.byId.get(row.dataset.id);
    if (await confirmDialog(`Remove ${p ? p.name : "this player"} from your team?`))
      toggleTeam(row.dataset.id);
  });
}

// ---------------------------------------------------------------- boot

(async function init() {
  const ok = await loadPlayers();
  if (!ok) return;

  // drop stale saved ids that no longer match the CSV
  state.team = state.team.filter((id) => state.byId.has(id));
  state.shortlist = state.shortlist.filter((id) => state.byId.has(id));
  for (const id of Object.keys(state.notes))
    if (!state.byId.has(id)) delete state.notes[id];

  buildFilterControls();
  bindEvents();
  applyFilters();
  renderPlayers();
  renderShortlist();
  renderTeam();

  $("#loading").hidden = true;
  $("#panel-players").hidden = false;

  const tab = location.hash.slice(1);
  if (["shortlist", "team"].includes(tab)) $(`#tabs [data-tab="${tab}"]`).click();
})();
