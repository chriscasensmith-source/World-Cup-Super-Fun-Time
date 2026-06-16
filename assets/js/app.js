/*
 * World Cup Super Fun Time — app logic
 * --------------------------------------------------------------------------
 * A static, no-build snake-draft app for the 2026 Men's World Cup.
 *
 * Modes:
 *   - LOCAL DRAFT: public/data/draft-lock.json has "locked": false (or is
 *     unreachable, e.g. opened from file://). State lives in localStorage so a
 *     refresh never loses picks. All draft controls are enabled.
 *   - LOCKED: public/data/draft-lock.json has "locked": true. The committed
 *     picks are loaded for everyone; all editing controls are disabled.
 *
 * Live scoring is computed from public/data/world-cup-live.json when present
 * and falls back gracefully to zeroes before the tournament data exists.
 */
(function () {
  "use strict";

  // ---- constants -----------------------------------------------------------
  const TEAMS = window.WC_TEAMS;
  const OWNERS = window.WC_OWNERS;
  const SCORING = window.WC_SCORING;
  const TEAMS_PER_OWNER = 12;
  const TOTAL_PICKS = OWNERS.length * TEAMS_PER_OWNER; // 36
  const DRAFT_LOCK_URL = "public/data/draft-lock.json";
  const LIVE_DATA_URL = "public/data/world-cup-live.json";

  const teamById = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
  const ownerById = Object.fromEntries(OWNERS.map((o) => [o.id, o]));

  // ---- runtime state -------------------------------------------------------
  let state = {
    draftOrder: OWNERS.map((o) => o.id), // editable snake order
    picks: [], // { teamId, ownerId, pickNumber }
    locked: false,
    lockedAt: null
  };
  let selectedTeamId = null;
  let liveData = null;       // parsed world-cup-live.json
  let scoreIndex = {};       // teamId -> { points, goals, wins, matches[], status }
  let filterText = "";
  let filterGroup = "";
  let store = null;          // draft store: cloud (Supabase) or local (localStorage)
  let deviceIdentity = "anyone"; // which owner is drafting on THIS device
  let dashboardOwnerId = null;   // which owner the "My Teams" dashboard is showing
  const IDENTITY_KEY = "wcsft-identity";

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  // ========================================================================
  //  Draft math
  // ========================================================================

  // Which owner owns a given 1-based pick number under the current snake order.
  function ownerForPick(pickNumber) {
    const n = OWNERS.length;
    const round = Math.floor((pickNumber - 1) / n); // 0-based round
    const pos = (pickNumber - 1) % n;
    const order = round % 2 === 0 ? state.draftOrder : [...state.draftOrder].reverse();
    return order[pos];
  }

  const currentPickNumber = () => state.picks.length + 1;
  const isDraftComplete = () => state.picks.length >= TOTAL_PICKS;
  const isEditable = () => !state.locked && !isDraftComplete();
  const pickForTeam = (teamId) => state.picks.find((p) => p.teamId === teamId);
  const teamsForOwner = (ownerId) => state.picks.filter((p) => p.ownerId === ownerId);

  // ========================================================================
  //  Persistence
  // ========================================================================

  // A clean, validated snapshot of the draft for saving/sharing.
  function snapshot() {
    return {
      draftOrder: state.draftOrder.slice(),
      picks: state.picks
        .slice()
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .map((p) => ({ teamId: p.teamId, ownerId: p.ownerId, pickNumber: p.pickNumber }))
    };
  }

  // Replace the in-memory draft from any state object (local, cloud, or import),
  // validating teams/owners and enforcing the per-owner and total caps.
  function applyState(s) {
    if (!s) return;
    if (Array.isArray(s.draftOrder) && s.draftOrder.length === OWNERS.length &&
        s.draftOrder.every((id) => ownerById[id]) && new Set(s.draftOrder).size === OWNERS.length) {
      state.draftOrder = s.draftOrder.slice();
    }
    if (Array.isArray(s.picks)) {
      const seen = new Set();
      const counts = {};
      const out = [];
      s.picks
        .slice()
        .sort((a, b) => (a.pickNumber || 0) - (b.pickNumber || 0))
        .forEach((p) => {
          if (!p || !teamById[p.teamId] || !ownerById[p.ownerId]) return;
          if (seen.has(p.teamId)) return;
          if ((counts[p.ownerId] || 0) >= TEAMS_PER_OWNER) return;
          if (out.length >= TOTAL_PICKS) return;
          seen.add(p.teamId);
          counts[p.ownerId] = (counts[p.ownerId] || 0) + 1;
          out.push({ teamId: p.teamId, ownerId: p.ownerId, pickNumber: out.length + 1 });
        });
      state.picks = out;
    }
  }

  // Persist the current draft through the active store (cloud or local). On a
  // cloud version conflict, re-sync to the authoritative remote state.
  async function persist() {
    if (state.locked || !store) return;
    const res = await store.save(snapshot());
    if (res && res.conflict) {
      const fresh = await store.load();
      if (fresh) { applyState(fresh); renderAll(); toast("Another device updated the draft — re-synced."); }
    } else if (res && res.error) {
      toast("Cloud save failed — check your connection.");
    }
  }

  // Backwards-compatible name used throughout the mutating actions.
  function saveLocal() { persist(); }

  // ========================================================================
  //  Device identity & sync mode
  // ========================================================================

  function readIdentity() {
    try { return localStorage.getItem(IDENTITY_KEY) || "anyone"; } catch (e) { return "anyone"; }
  }

  function setupIdentitySelect() {
    const sel = $("#identitySelect");
    if (!sel) return;
    OWNERS.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });
    sel.value = deviceIdentity;
    sel.addEventListener("change", () => {
      deviceIdentity = sel.value;
      try { localStorage.setItem(IDENTITY_KEY, deviceIdentity); } catch (e) {}
      if (ownerById[deviceIdentity]) dashboardOwnerId = deviceIdentity; // focus dashboard on me
      renderAll();
    });
  }

  // Whether THIS device may make the current pick. "anyone" (commissioner mode)
  // can always draft on any turn; otherwise only the owner on the clock can.
  function canDraftNow() {
    if (!isEditable()) return false;
    if (deviceIdentity === "anyone") return true;
    return deviceIdentity === ownerForPick(currentPickNumber());
  }

  function renderSyncMode() {
    const badge = $("#syncBadge");
    if (!badge) return;
    if (state.locked) { badge.style.display = "none"; return; }
    badge.style.display = "";
    if (store && store.mode === "cloud") {
      badge.className = "badge local";
      badge.innerHTML = `<span class="dot"></span> ☁ Cloud Synced`;
      badge.title = "Picks sync live across all phones via Supabase.";
    } else {
      badge.className = "badge";
      badge.innerHTML = `<span class="dot" style="background:var(--muted)"></span> 📱 This Device`;
      badge.title = "Local mode — picks saved in this browser only. Add Supabase keys in assets/js/config.js to sync across phones.";
    }
  }

  // ========================================================================
  //  Boot
  // ========================================================================

  async function init() {
    wireStaticControls();
    deviceIdentity = readIdentity();
    setupIdentitySelect();

    // Try the published lock file first. If it is unreachable (file://) we fall
    // back to local/cloud draft mode.
    let lock = null;
    try {
      const res = await fetch(DRAFT_LOCK_URL, { cache: "no-store" });
      if (res.ok) lock = await res.json();
    } catch (e) {
      console.info("[WCSFT] draft-lock.json not reachable; using local/cloud draft mode.");
    }

    if (lock && lock.locked === true) {
      // Published, read-only draft — no store needed.
      state.locked = true;
      state.lockedAt = lock.lockedAt || null;
      applyState({ draftOrder: lock.draftOrder, picks: lock.picks });
    } else {
      // Live drafting: shared cloud room if Supabase is configured, else local.
      store = await window.WCSFT_createStore();
      const remote = await store.load();
      const local = window.WCSFT_readLocalDraft && window.WCSFT_readLocalDraft();
      const remoteHasDraft = remote && Array.isArray(remote.picks) && remote.picks.length > 0;
      const localHasDraft = local && Array.isArray(local.picks) && local.picks.length > 0;

      if (remoteHasDraft) {
        applyState(remote);                                  // cloud is source of truth
      } else if (localHasDraft) {
        applyState(local);                                   // migrate an existing local draft
        if (store.mode === "cloud") await store.save(snapshot());
      } else if (remote) {
        applyState(remote);                                  // empty-but-valid (default order)
      }

      // Live updates from other phones (or other tabs in local mode).
      store.subscribe((remoteState) => {
        if (state.locked) return;
        applyState(remoteState);
        renderAll();
      });
    }

    renderSyncMode();
    await loadLiveData();
    renderAll();

    // Keep live scores fresh while the app is open: re-fetch the data file on
    // an interval and whenever the tab is brought back to the foreground. (The
    // browser only reads the committed JSON — it never calls the API directly,
    // so the secret key is never exposed.)
    setInterval(() => refreshLiveData(false), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshLiveData(false);
    });
  }

  // Re-pull world-cup-live.json and re-render the score-dependent UI without a
  // full page reload.
  async function refreshLiveData(manual) {
    const btn = $("#refreshBtn");
    if (btn) { btn.disabled = true; btn.textContent = "↻ Refreshing…"; }
    await loadLiveData();
    renderLeaderboard();
    renderRosters();
    renderMyTeams();
    renderGroupStandings();
    renderTeamInfo();
    renderSync();
    if (btn) { btn.disabled = false; btn.textContent = "↻ Refresh data"; }
    if (manual) {
      toast(liveData && liveData.generatedAt ? "Live data refreshed." : "No live data published yet.");
    }
  }

  async function loadLiveData() {
    try {
      const res = await fetch(LIVE_DATA_URL, { cache: "no-store" });
      if (res.ok) liveData = await res.json();
    } catch (e) {
      liveData = null;
    }
    buildScoreIndex();
  }

  // ========================================================================
  //  Scoring engine (from world-cup-live.json matches)
  // ========================================================================

  function normalizeName(s) {
    return (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Map a football-data.org team name onto one of our team ids (best effort).
  const NAME_ALIASES = {
    "usa": "usa", "united states": "usa", "united states of america": "usa",
    "ir iran": "iran", "iran": "iran",
    "korea republic": "south-korea", "south korea": "south-korea",
    "turkiye": "turkiye", "turkey": "turkiye",
    "cote divoire": "cote-divoire", "ivory coast": "cote-divoire",
    "czechia": "czechia", "czech republic": "czechia",
    "dr congo": "dr-congo", "congo dr": "dr-congo", "democratic republic of congo": "dr-congo",
    "cabo verde": "cape-verde", "cape verde": "cape-verde", "cape verde islands": "cape-verde",
    "bosnia herzegovina": "bosnia", "bosnia and herzegovina": "bosnia",
    "curacao": "curacao"
  };
  const nameLookup = (() => {
    const map = {};
    TEAMS.forEach((t) => { map[normalizeName(t.name)] = t.id; });
    Object.entries(NAME_ALIASES).forEach(([k, v]) => { map[normalizeName(k)] = v; });
    return map;
  })();
  const resolveTeamId = (name) => nameLookup[normalizeName(name)] || null;

  function knockoutPoints(stage) {
    return SCORING.knockout[stage] || 0;
  }

  function buildScoreIndex() {
    scoreIndex = {};
    TEAMS.forEach((t) => {
      scoreIndex[t.id] = { points: 0, goals: 0, groupWins: 0, knockoutWins: 0, matches: [], status: null };
    });
    if (!liveData || !Array.isArray(liveData.matches)) return;

    liveData.matches.forEach((m) => {
      const homeId = resolveTeamId(m.homeTeam && (m.homeTeam.name || m.homeTeam.shortName || m.homeTeam.tla));
      const awayId = resolveTeamId(m.awayTeam && (m.awayTeam.name || m.awayTeam.shortName || m.awayTeam.tla));
      if (!homeId && !awayId) return;

      const ft = (m.score && m.score.fullTime) || {};
      const hg = num(ft.home);
      const ag = num(ft.away);
      const played = m.status === "FINISHED" && hg != null && ag != null;
      const stage = m.stage || "GROUP_STAGE";
      const isGroup = stage === "GROUP_STAGE";

      [["home", homeId, hg, ag], ["away", awayId, ag, hg]].forEach(([side, tid, gf, ga]) => {
        if (!tid || !scoreIndex[tid]) return;
        const rec = scoreIndex[tid];
        if (played) {
          rec.goals += gf;
          const won = gf > ga;
          const draw = gf === ga;
          if (isGroup) {
            if (won) { rec.groupWins += 1; rec.points += SCORING.groupWin; }
          } else if (won) {
            rec.knockoutWins += 1;
            rec.points += knockoutPoints(stage);
            if (stage === "FINAL") rec.status = "champion";
          }
          rec.matches.push({
            stage, gf, ga,
            opp: side === "home" ? (m.awayTeam && m.awayTeam.name) : (m.homeTeam && m.homeTeam.name),
            result: won ? "w" : draw ? "d" : "l"
          });
        } else {
          rec.matches.push({
            stage,
            opp: side === "home" ? (m.awayTeam && m.awayTeam.name) : (m.homeTeam && m.homeTeam.name),
            result: null,
            utcDate: m.utcDate || null
          });
        }
      });
    });
  }

  const num = (v) => (typeof v === "number" ? v : v == null ? null : (isNaN(+v) ? null : +v));

  // Real World Cup group table per team (FIFA points: win 3, draw 1, loss 0).
  // Prefers football-data.org's computed TOTAL standings, falling back to
  // tallying finished group matches ourselves.
  function buildStandings() {
    const map = {};
    TEAMS.forEach((t) => { map[t.id] = { pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; });

    let used = false;
    const total = liveData && Array.isArray(liveData.standings)
      ? liveData.standings.find((s) => s.type === "TOTAL" && Array.isArray(s.table))
      : null;
    if (total) {
      total.table.forEach((row) => {
        const id = resolveTeamId(row.team && (row.team.name || row.team.shortName || row.team.tla));
        if (!id || !map[id]) return;
        map[id] = {
          pld: row.playedGames || 0, w: row.won || 0, d: row.draw || 0, l: row.lost || 0,
          gf: row.goalsFor || 0, ga: row.goalsAgainst || 0,
          gd: row.goalDifference != null ? row.goalDifference : (row.goalsFor || 0) - (row.goalsAgainst || 0),
          pts: row.points || 0
        };
        used = true;
      });
    }

    if (!used && liveData && Array.isArray(liveData.matches)) {
      liveData.matches.forEach((m) => {
        if (m.stage !== "GROUP_STAGE" || m.status !== "FINISHED") return;
        const ft = (m.score && m.score.fullTime) || {};
        const hg = num(ft.home), ag = num(ft.away);
        if (hg == null || ag == null) return;
        const hid = resolveTeamId(m.homeTeam && m.homeTeam.name);
        const aid = resolveTeamId(m.awayTeam && m.awayTeam.name);
        [[hid, hg, ag], [aid, ag, hg]].forEach(([id, gf, ga]) => {
          if (!id || !map[id]) return;
          const r = map[id];
          r.pld++; r.gf += gf; r.ga += ga; r.gd = r.gf - r.ga;
          if (gf > ga) { r.w++; r.pts += 3; } else if (gf === ga) { r.d++; r.pts += 1; } else { r.l++; }
        });
      });
    }
    return map;
  }

  const teamScore = (teamId) => (scoreIndex[teamId] ? scoreIndex[teamId].points : 0);
  const teamGoals = (teamId) => (scoreIndex[teamId] ? scoreIndex[teamId].goals : 0);

  function ownerTotals(ownerId) {
    const picks = teamsForOwner(ownerId);
    let points = 0, goals = 0;
    picks.forEach((p) => { points += teamScore(p.teamId); goals += teamGoals(p.teamId); });
    return { points, goals, count: picks.length };
  }

  // ========================================================================
  //  Rendering
  // ========================================================================

  function renderAll() {
    renderModeBadge();
    renderLeaderboard();
    renderDraftControls();
    renderTeamBoard();
    renderRosters();
    renderMyTeams();
    renderGroupStandings();
    renderTeamInfo();
    renderSync();
  }

  function flagHtml(team) {
    const code = team.flag;
    const src = `https://flagcdn.com/${code}.svg`;
    return `<span class="flag"><img src="${src}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${team.emoji}'))"></span>`;
  }

  function renderModeBadge() {
    const badge = $("#modeBadge");
    if (state.locked) {
      badge.className = "badge locked";
      const when = state.lockedAt ? new Date(state.lockedAt).toLocaleDateString() : "";
      badge.innerHTML = `<span class="dot"></span> Draft Locked${when ? " · " + when : ""}`;
    } else {
      badge.className = "badge local";
      badge.innerHTML = `<span class="dot"></span> Local Draft Mode`;
    }
    $("#exportBtn").disabled = false; // export is always available as a convenience
  }

  function renderLeaderboard() {
    const wrap = $("#leaderboard");
    wrap.innerHTML = "";
    const rows = OWNERS.map((o) => ({ owner: o, ...ownerTotals(o.id) }));
    rows.sort((a, b) => b.points - a.points || b.goals - a.goals || a.owner.name.localeCompare(b.owner.name));
    rows.forEach((r, i) => {
      const card = el("div", "lb-card");
      card.style.setProperty("--accent", r.owner.accent);
      card.innerHTML = `
        <div class="lb-rank">#${i + 1}</div>
        <h3 class="lb-name">${r.owner.name}</h3>
        <div class="lb-points">${r.points}<small>PTS</small></div>
        <div class="lb-meta">
          <span><b>${r.goals}</b> goals</span>
          <span><b>${r.count}</b>/${TEAMS_PER_OWNER} teams</span>
        </div>`;
      wrap.appendChild(card);
    });
  }

  function renderDraftControls() {
    // snake order editor
    const orderWrap = $("#orderList");
    orderWrap.innerHTML = "";
    state.draftOrder.forEach((oid, idx) => {
      const o = ownerById[oid];
      const item = el("div", "order-item");
      item.innerHTML = `
        <span class="pos">${idx + 1}</span>
        <span class="swatch" style="background:${o.accent}"></span>
        <span class="nm">${o.name}</span>
        <span class="order-arrows">
          <button class="btn sm ghost" data-up="${idx}" ${idx === 0 || !isEditable() ? "disabled" : ""} aria-label="Move up">▲</button>
          <button class="btn sm ghost" data-down="${idx}" ${idx === state.draftOrder.length - 1 || !isEditable() ? "disabled" : ""} aria-label="Move down">▼</button>
        </span>`;
      orderWrap.appendChild(item);
    });

    // current pick bar
    const bar = $("#pickbar");
    if (isDraftComplete()) {
      bar.className = "pickbar complete";
      bar.innerHTML = `
        <div><div class="now">Draft Status</div><div class="who">✅ Draft Complete</div></div>
        <div class="progress"><div class="big">${TOTAL_PICKS}/${TOTAL_PICKS}</div><div class="sub">all picks made</div></div>`;
    } else if (state.locked) {
      bar.className = "pickbar";
      bar.innerHTML = `
        <div><div class="now">Status</div><div class="who">🔒 Locked &amp; Published</div></div>
        <div class="progress"><div class="big">${state.picks.length}/${TOTAL_PICKS}</div><div class="sub">picks locked</div></div>`;
    } else {
      const oid = ownerForPick(currentPickNumber());
      const o = ownerById[oid];
      const round = Math.floor((currentPickNumber() - 1) / OWNERS.length) + 1;
      bar.className = "pickbar";
      bar.innerHTML = `
        <div>
          <div class="now">On the clock · Pick ${currentPickNumber()} · Round ${round}</div>
          <div class="who"><span class="swatch" style="background:${o.accent}"></span>${o.name}</div>
        </div>
        <div class="progress">
          <div class="big">${state.picks.length}/${TOTAL_PICKS}</div>
          <div class="sub">picks made</div>
        </div>`;
    }
    const pct = Math.round((state.picks.length / TOTAL_PICKS) * 100);
    $("#progressFill").style.width = pct + "%";

    // buttons
    $("#undoBtn").disabled = !isEditable() || state.picks.length === 0;
    // Hide Reset entirely once the draft is complete (or locked) so a finished
    // draft can't be wiped by accident.
    $("#resetBtn").style.display = (isDraftComplete() || state.locked) ? "none" : "";
    $("#resetBtn").disabled = state.locked || state.picks.length === 0;
    $("#saveProgressBtn").disabled = state.picks.length === 0;
    $("#importBtn").disabled = state.locked;
    $("#identitySelect").disabled = state.locked;

    // locked notice
    $("#lockedNote").style.display = state.locked ? "block" : "none";
  }

  function renderTeamBoard() {
    const board = $("#teamBoard");
    board.innerHTML = "";
    let list = TEAMS.slice();
    if (filterGroup) list = list.filter((t) => t.group === filterGroup);
    if (filterText) {
      const q = normalizeName(filterText);
      list = list.filter((t) => normalizeName(t.name).includes(q) || normalizeName(t.confederation).includes(q));
    }
    list.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

    if (list.length === 0) {
      board.appendChild(el("div", "empty", "No teams match your search."));
      return;
    }

    list.forEach((t) => {
      const pick = pickForTeam(t.id);
      const btn = el("button", "team-card" + (pick ? " drafted" : "") + (selectedTeamId === t.id ? " selected" : ""));
      btn.type = "button";
      btn.dataset.team = t.id;
      const ownerTag = pick
        ? `<span class="tc-owner" style="background:${ownerById[pick.ownerId].accent}22;color:${ownerById[pick.ownerId].accent}">${ownerById[pick.ownerId].name}</span>`
        : `<span class="tc-sub">${t.confederation}</span>`;
      btn.innerHTML = `
        ${flagHtml(t)}
        <div class="tc-main">
          <div class="tc-name">${t.name}</div>
          <div class="tc-sub"><span class="pill grp">Grp ${t.group}</span> ${ownerTag}</div>
        </div>`;
      board.appendChild(btn);
    });
    $("#availCount").textContent = `${TEAMS.length - state.picks.length} available · ${TEAMS.length} total`;
  }

  function renderRosters() {
    const wrap = $("#rosters");
    wrap.innerHTML = "";
    OWNERS.forEach((o) => {
      const picks = teamsForOwner(o.id).sort((a, b) => a.pickNumber - b.pickNumber);
      const totals = ownerTotals(o.id);
      const col = el("div", "roster");
      const head = el("div", "roster-head");
      head.innerHTML = `
        <span class="swatch" style="background:${o.accent}"></span>
        <span class="nm">${o.name}</span>
        <span class="cnt">${picks.length}/${TEAMS_PER_OWNER}</span>`;
      col.appendChild(head);

      const listEl = el("div", "roster-list");
      if (picks.length === 0) {
        listEl.appendChild(el("div", "roster-empty", "No teams drafted yet"));
      } else {
        picks.forEach((p) => {
          const t = teamById[p.teamId];
          const row = el("div", "roster-pick");
          row.dataset.team = t.id;
          row.innerHTML = `
            <span class="num">#${p.pickNumber}</span>
            ${flagHtml(t)}
            <span class="rp-name">${t.name}</span>
            <span class="rp-score">${teamScore(t.id)} pt</span>`;
          listEl.appendChild(row);
        });
      }
      col.appendChild(listEl);

      const foot = el("div", "roster-foot");
      foot.innerHTML = `<span><b>${totals.points}</b> pts</span><span><b>${totals.goals}</b> goals</span>`;
      col.appendChild(foot);
      wrap.appendChild(col);
    });
  }

  function renderTeamInfo() {
    const panel = $("#teamInfo");
    if (!selectedTeamId) {
      panel.innerHTML = `<div class="info-empty">👈 Select a team from the board to see its full profile, schedule, and score.</div>`;
      return;
    }
    const t = teamById[selectedTeamId];
    const pick = pickForTeam(t.id);
    const sc = scoreIndex[t.id] || { points: 0, goals: 0, groupWins: 0, matches: [], status: null };
    const owner = pick ? ownerById[pick.ownerId] : null;

    const statusTag = sc.status === "champion"
      ? `<span class="status-tag champion">🏆 Champion</span>`
      : `<span class="status-tag">In progress</span>`;

    let html = `
      <div class="info-head">
        ${flagHtml(t)}
        <div>
          <h3 class="ih-name">${t.name}</h3>
          <div class="ih-sub">Group ${t.group} · ${t.confederation}${t.host ? " · Host nation" : ""} ${statusTag}</div>
        </div>
      </div>
      <div class="info-grid">
        <div class="stat"><div class="k">Draft Owner</div><div class="v">${owner ? owner.name : "Undrafted"}</div></div>
        <div class="stat"><div class="k">Pick Number</div><div class="v">${pick ? "#" + pick.pickNumber : "—"}</div></div>
        <div class="stat"><div class="k">Score Total</div><div class="v">${sc.points} pts</div></div>
        <div class="stat"><div class="k">Group-Stage Wins</div><div class="v">${sc.groupWins}</div></div>
        <div class="stat"><div class="k">Goals Scored</div><div class="v">${sc.goals}</div></div>
        <div class="stat"><div class="k">Knockout Wins</div><div class="v">${sc.knockoutWins || 0}</div></div>
      </div>`;

    // matches / schedule
    if (sc.matches && sc.matches.length) {
      html += `<div class="section-head" style="margin-top:16px"><h2 style="font-size:14px">Matches</h2></div><div class="match-list">`;
      sc.matches.forEach((mt) => {
        const stageLabel = prettyStage(mt.stage);
        if (mt.result) {
          html += `<div class="match"><span class="stage">${stageLabel}</span><span class="mvs">vs ${mt.opp || "TBD"}</span><span class="res ${mt.result}">${mt.gf}–${mt.ga}</span></div>`;
        } else {
          const when = mt.utcDate ? new Date(mt.utcDate).toLocaleDateString() : "TBD";
          html += `<div class="match"><span class="stage">${stageLabel}</span><span class="mvs">vs ${mt.opp || "TBD"}</span><span class="res d">${when}</span></div>`;
        }
      });
      html += `</div>`;
    } else {
      html += `<div class="locked-note" style="color:var(--muted);background:var(--bg-2);border-color:var(--line);margin-top:14px">No match data yet. Schedule & results appear once <code>world-cup-live.json</code> is populated by the data workflow.</div>`;
    }

    // commissioner controls: move a drafted team to another owner (pre-lock only)
    if (pick && isEditable()) {
      const opts = OWNERS.map((o) => {
        const full = teamsForOwner(o.id).length >= TEAMS_PER_OWNER && o.id !== pick.ownerId;
        return `<option value="${o.id}" ${o.id === pick.ownerId ? "selected" : ""} ${full ? "disabled" : ""}>${o.name}${full ? " (full)" : ""}</option>`;
      }).join("");
      html += `
        <div class="info-actions">
          <div class="move-row">
            <span class="lbl">Move team to:</span>
            <select class="select" id="moveSelect">${opts}</select>
            <button class="btn sm" id="moveBtn">Move</button>
          </div>
        </div>`;
    } else if (!pick && isEditable()) {
      const o = ownerById[ownerForPick(currentPickNumber())];
      html += canDraftNow()
        ? `<div class="info-actions"><button class="btn primary" id="draftBtn">Draft to ${o.name} (Pick #${currentPickNumber()})</button></div>`
        : `<div class="info-actions"><button class="btn primary" disabled>⏳ ${o.name} is on the clock</button></div>`;
    }

    panel.innerHTML = html;
  }

  function prettyStage(stage) {
    return ({
      GROUP_STAGE: "Group", LAST_32: "R32", LAST_16: "R16",
      QUARTER_FINALS: "QF", SEMI_FINALS: "SF", THIRD_PLACE: "3rd", FINAL: "Final"
    })[stage] || stage;
  }

  const STAGE_ORDER = ["GROUP_STAGE", "LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];

  // Derive a simple tournament status for a team from its match records.
  function deriveStatus(sc) {
    const matches = (sc && sc.matches) || [];
    if (!matches.length) return { label: "Not started", cls: "" };
    if (matches.some((m) => m.stage === "FINAL" && m.result === "w")) return { label: "🏆 Champion", cls: "champion" };
    const lostKO = matches.filter((m) => m.stage !== "GROUP_STAGE" && m.result === "l");
    if (lostKO.length) return { label: "Out · " + prettyStage(lostKO[lostKO.length - 1].stage), cls: "eliminated" };
    const ko = matches.filter((m) => m.stage !== "GROUP_STAGE");
    if (ko.length) {
      const furthest = ko.reduce((a, m) => (STAGE_ORDER.indexOf(m.stage) > STAGE_ORDER.indexOf(a) ? m.stage : a), ko[0].stage);
      return { label: "Advanced · " + prettyStage(furthest), cls: "advanced" };
    }
    const groupPlayed = matches.filter((m) => m.stage === "GROUP_STAGE" && m.result).length;
    return groupPlayed >= 3
      ? { label: "Group stage done", cls: "" }
      : { label: "Group stage", cls: "" };
  }

  // "My Teams" owner dashboard: tabs to pick an owner, then their full squad.
  function renderMyTeams() {
    const tabsEl = $("#ownerTabs");
    const wrap = $("#myTeams");
    if (!tabsEl || !wrap) return;
    if (!dashboardOwnerId || !ownerById[dashboardOwnerId]) {
      dashboardOwnerId = deviceIdentity !== "anyone" && ownerById[deviceIdentity] ? deviceIdentity : OWNERS[0].id;
    }

    tabsEl.innerHTML = "";
    OWNERS.forEach((o) => {
      const t = ownerTotals(o.id);
      const tab = el("button", "owner-tab");
      tab.dataset.owner = o.id;
      if (o.id === dashboardOwnerId) {
        tab.style.background = o.accent + "22";
        tab.style.borderColor = o.accent;
      }
      tab.innerHTML = `<span class="swatch" style="background:${o.accent}"></span>${o.name}
        <span style="color:var(--muted);font-weight:700">${t.points}p · ${t.count}/${TEAMS_PER_OWNER}</span>`;
      tabsEl.appendChild(tab);
    });

    const o = ownerById[dashboardOwnerId];
    const picks = teamsForOwner(o.id).slice().sort((a, b) => a.pickNumber - b.pickNumber);
    const totals = ownerTotals(o.id);
    const ranked = OWNERS.map((x) => ({ id: x.id, ...ownerTotals(x.id) }))
      .sort((a, b) => b.points - a.points || b.goals - a.goals);
    const rank = ranked.findIndex((x) => x.id === o.id) + 1;

    let html = `
      <div class="dash-head" style="border-left:5px solid ${o.accent}">
        <div style="flex:1;min-width:140px">
          <div class="dh-name">${o.name}</div>
          <div style="color:var(--muted);font-size:12.5px">Rank #${rank} of ${OWNERS.length}</div>
        </div>
        <div class="dash-stat"><div class="v">${totals.points}</div><div class="k">Points</div></div>
        <div class="dash-stat"><div class="v">${totals.goals}</div><div class="k">Goals</div></div>
        <div class="dash-stat"><div class="v">${picks.length}/${TEAMS_PER_OWNER}</div><div class="k">Teams</div></div>
      </div>`;

    if (picks.length === 0) {
      html += `<div class="empty">No teams drafted yet for ${o.name}.</div>`;
      wrap.innerHTML = html;
      return;
    }

    html += `<div class="dash-grid">`;
    picks.forEach((p) => {
      const t = teamById[p.teamId];
      const sc = scoreIndex[t.id] || { points: 0, goals: 0, groupWins: 0, knockoutWins: 0, matches: [] };
      const st = deriveStatus(sc);
      html += `
        <div class="dash-card" data-team="${t.id}">
          <div class="dash-card-top">${flagHtml(t)}<span class="dc-name">${t.name}</span><span class="dc-score">${sc.points} pt</span></div>
          <div class="dash-card-mid">
            <span class="pill grp">Grp ${t.group} · #${p.pickNumber}</span>
            <span class="status-tag ${st.cls}">${st.label}</span>
          </div>
          <div class="dash-card-stats">
            <span><b>${sc.goals}</b> goals</span>
            <span><b>${sc.groupWins}</b> grp W</span>
            <span><b>${sc.knockoutWins || 0}</b> KO W</span>
          </div>
        </div>`;
    });
    html += `</div>`;
    wrap.innerHTML = html;
  }

  // Live World Cup group tables, bucketed into the 12 groups.
  function renderGroupStandings() {
    const wrap = $("#groupStandings");
    if (!wrap) return;
    const st = buildStandings();
    const groups = [...new Set(TEAMS.map((t) => t.group))].sort();
    let html = "";
    groups.forEach((g) => {
      const teams = TEAMS.filter((t) => t.group === g).slice().sort((a, b) => {
        const A = st[a.id], B = st[b.id];
        return B.pts - A.pts || B.gd - A.gd || B.gf - A.gf || a.name.localeCompare(b.name);
      });
      html += `<div class="gs-card"><div class="gs-head">Group ${g}</div>
        <table class="gs-table"><thead><tr>
          <th></th><th>Team</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
        </tr></thead><tbody>`;
      teams.forEach((t, i) => {
        const r = st[t.id];
        const pick = pickForTeam(t.id);
        const ownerDot = pick
          ? `<span class="gs-owner" style="background:${ownerById[pick.ownerId].accent}" title="${ownerById[pick.ownerId].name}"></span>`
          : "";
        html += `<tr class="${i < 2 ? "gs-adv" : ""}" data-team="${t.id}">
          <td class="gs-pos">${i + 1}</td>
          <td class="gs-team">${flagHtml(t)}<span class="gs-name">${t.name}</span>${ownerDot}</td>
          <td>${r.pld}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
          <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="gs-pts">${r.pts}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });
    wrap.innerHTML = html;
  }

  function renderSync() {
    const sync = $("#sync");
    if (liveData && liveData.generatedAt) {
      const when = new Date(liveData.generatedAt).toLocaleString();
      const nMatches = Array.isArray(liveData.matches) ? liveData.matches.length : 0;
      const nTeams = Array.isArray(liveData.teams) ? liveData.teams.length : 0;
      const hasErr = Array.isArray(liveData.errors) && liveData.errors.length;
      sync.innerHTML = `
        <span class="dot ${hasErr ? "warn" : "ok"}"></span>
        Live data from <b>${liveData.source || "football-data.org"}</b> · ${nTeams} teams · ${nMatches} matches · updated ${when}
        ${hasErr ? " · ⚠ some endpoints errored" : ""}`;
    } else {
      sync.innerHTML = `<span class="dot warn"></span> Live data not loaded yet. Scores show 0 until the GitHub Action populates <b>public/data/world-cup-live.json</b>.`;
    }
  }

  // ========================================================================
  //  Actions
  // ========================================================================

  function selectTeam(teamId) {
    selectedTeamId = teamId;
    renderTeamBoard();
    renderTeamInfo();
  }

  function draftCurrent(teamId) {
    if (!isEditable()) return;
    if (!canDraftNow()) {
      toast("Not your turn — " + ownerById[ownerForPick(currentPickNumber())].name + " is on the clock.");
      return;
    }
    if (pickForTeam(teamId)) return;
    const oid = ownerForPick(currentPickNumber());
    if (teamsForOwner(oid).length >= TEAMS_PER_OWNER) {
      toast(`${ownerById[oid].name} already has ${TEAMS_PER_OWNER} teams.`);
      return;
    }
    state.picks.push({ teamId, ownerId: oid, pickNumber: currentPickNumber() });
    saveLocal();
    toast(`${teamById[teamId].name} → ${ownerById[oid].name}`);
    renderAll();
  }

  function undoLast() {
    if (!isEditable() || state.picks.length === 0) return;
    const removed = state.picks.pop();
    saveLocal();
    if (removed) toast(`Undid pick #${removed.pickNumber}: ${teamById[removed.teamId].name}`);
    renderAll();
  }

  function resetDraft() {
    if (state.locked || state.picks.length === 0) return;
    if (!confirm("Reset the entire draft? This clears all picks (local only).")) return;
    state.picks = [];
    saveLocal();
    toast("Draft reset.");
    renderAll();
  }

  function moveTeam(teamId, newOwnerId) {
    if (!isEditable()) return;
    const pick = pickForTeam(teamId);
    if (!pick || pick.ownerId === newOwnerId) return;
    if (teamsForOwner(newOwnerId).length >= TEAMS_PER_OWNER) {
      toast(`${ownerById[newOwnerId].name} is already full.`);
      return;
    }
    pick.ownerId = newOwnerId;
    saveLocal();
    toast(`${teamById[teamId].name} moved to ${ownerById[newOwnerId].name}`);
    renderAll();
  }

  function moveOrder(idx, dir) {
    if (!isEditable()) return;
    const j = idx + dir;
    if (j < 0 || j >= state.draftOrder.length) return;
    const arr = state.draftOrder;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    saveLocal();
    renderAll();
  }

  // ---- export lock JSON ----------------------------------------------------
  function buildLockObject() {
    return {
      locked: true,
      lockedAt: new Date().toISOString(),
      draftOrder: state.draftOrder.slice(),
      picks: state.picks
        .slice()
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .map((p) => ({ teamId: p.teamId, ownerId: p.ownerId, pickNumber: p.pickNumber }))
    };
  }

  function openExport() {
    const obj = buildLockObject();
    const json = JSON.stringify(obj, null, 2);
    $("#exportCode").textContent = json;
    const note = isDraftComplete()
      ? "Your draft is complete — ready to publish."
      : `Heads up: only ${state.picks.length} of ${TOTAL_PICKS} picks are made. You can still export, but the published draft will be partial.`;
    $("#exportNote").textContent = note;
    $("#exportModal").classList.add("open");
    // stash for download/copy
    $("#exportModal").dataset.json = json;
  }

  function downloadJSON(filename, json) {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadLock() {
    downloadJSON("draft-lock.json", $("#exportModal").dataset.json);
    toast("Downloaded draft-lock.json — commit it to public/data/");
  }

  // ---- save / import in-progress draft (move between devices) -------------
  function saveProgress() {
    const obj = {
      locked: false,
      lockedAt: null,
      draftOrder: state.draftOrder.slice(),
      picks: state.picks
        .slice()
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .map((p) => ({ teamId: p.teamId, ownerId: p.ownerId, pickNumber: p.pickNumber }))
    };
    downloadJSON("draft-progress.json", JSON.stringify(obj, null, 2));
    toast("Saved draft-progress.json — import it on another device to resume.");
  }

  function openImport() {
    if (state.locked) { toast("Draft is locked — import is disabled."); return; }
    $("#importText").value = "";
    $("#importFile").value = "";
    $("#importModal").classList.add("open");
  }

  // Apply an imported draft object onto local state. Accepts both the saved
  // progress shape and an exported draft-lock.json (the `locked` flag is
  // ignored so a locked file can be loaded back as an editable draft).
  function applyImported(data) {
    if (!data || typeof data !== "object") throw new Error("not a JSON object");
    if (!Array.isArray(data.picks)) throw new Error("missing \"picks\" array");
    applyState(data); // validates teams/owners, dedupes, enforces caps, re-sequences
    saveLocal();       // routes to cloud (shared) or local store
  }

  function doImport() {
    const text = ($("#importText").value || "").trim();
    if (!text) { toast("Paste JSON or choose a file first."); return; }
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      toast("Import failed: invalid JSON.");
      return;
    }
    try {
      applyImported(data);
    } catch (e) {
      toast("Import failed: " + e.message);
      return;
    }
    $("#importModal").classList.remove("open");
    selectedTeamId = null;
    toast(`Imported draft — ${state.picks.length} pick${state.picks.length === 1 ? "" : "s"} loaded.`);
    renderAll();
  }

  async function copyLock() {
    const json = $("#exportModal").dataset.json;
    try {
      await navigator.clipboard.writeText(json);
      toast("Copied JSON to clipboard.");
    } catch (e) {
      toast("Copy failed — select the text manually.");
    }
  }

  // ========================================================================
  //  Wiring
  // ========================================================================

  function wireStaticControls() {
    $("#searchInput").addEventListener("input", (e) => { filterText = e.target.value; renderTeamBoard(); });

    const groupSel = $("#groupFilter");
    const groups = [...new Set(TEAMS.map((t) => t.group))].sort();
    groupSel.innerHTML = `<option value="">All groups</option>` + groups.map((g) => `<option value="${g}">Group ${g}</option>`).join("");
    groupSel.addEventListener("change", (e) => { filterGroup = e.target.value; renderTeamBoard(); });

    $("#undoBtn").addEventListener("click", undoLast);
    $("#resetBtn").addEventListener("click", resetDraft);
    $("#saveProgressBtn").addEventListener("click", saveProgress);
    $("#importBtn").addEventListener("click", openImport);
    $("#importClose").addEventListener("click", () => $("#importModal").classList.remove("open"));
    $("#importModal").addEventListener("click", (e) => { if (e.target.id === "importModal") $("#importModal").classList.remove("open"); });
    $("#importLoadBtn").addEventListener("click", doImport);
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { $("#importText").value = reader.result; };
      reader.onerror = () => toast("Could not read that file.");
      reader.readAsText(f);
    });
    $("#refreshBtn").addEventListener("click", () => refreshLiveData(true));
    $("#exportBtn").addEventListener("click", openExport);
    $("#exportClose").addEventListener("click", () => $("#exportModal").classList.remove("open"));
    $("#exportModal").addEventListener("click", (e) => { if (e.target.id === "exportModal") $("#exportModal").classList.remove("open"); });
    $("#downloadLockBtn").addEventListener("click", downloadLock);
    $("#copyLockBtn").addEventListener("click", copyLock);

    // event delegation for dynamic content
    $("#teamBoard").addEventListener("click", (e) => {
      const card = e.target.closest(".team-card");
      if (card) selectTeam(card.dataset.team);
    });
    $("#rosters").addEventListener("click", (e) => {
      const row = e.target.closest(".roster-pick");
      if (row) selectTeam(row.dataset.team);
    });
    $("#ownerTabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".owner-tab");
      if (tab) { dashboardOwnerId = tab.dataset.owner; renderMyTeams(); }
    });
    $("#myTeams").addEventListener("click", (e) => {
      const card = e.target.closest(".dash-card");
      if (!card) return;
      selectTeam(card.dataset.team);
      const info = $("#teamInfoSection");
      if (info && info.scrollIntoView) info.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#groupStandings").addEventListener("click", (e) => {
      const row = e.target.closest("tr[data-team]");
      if (!row) return;
      selectTeam(row.dataset.team);
      const info = $("#teamInfoSection");
      if (info && info.scrollIntoView) info.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#orderList").addEventListener("click", (e) => {
      const up = e.target.closest("[data-up]");
      const down = e.target.closest("[data-down]");
      if (up) moveOrder(+up.dataset.up, -1);
      if (down) moveOrder(+down.dataset.down, 1);
    });
    $("#teamInfo").addEventListener("click", (e) => {
      if (e.target.id === "draftBtn") draftCurrent(selectedTeamId);
      if (e.target.id === "moveBtn") {
        const sel = $("#moveSelect");
        if (sel) moveTeam(selectedTeamId, sel.value);
      }
    });
  }

  // ---- toast ---------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
