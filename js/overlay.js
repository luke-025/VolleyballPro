// js/overlay.js — PRO Overlay (SAFE build)
// - game HUD (TV style)
// - stage+set pills
// - static ticker (max 2 live matches)
// - scene switching (game/break/technical/sponsors) based on state.meta.scene
// This file is intentionally simple and robust (no risky string patching).

(function () {
  const UI = window.VP_UI;
  const U = window.VP_UTIL;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const slug = UI.getSlug();
  const $ = (id) => document.getElementById(id);

  // ----- Responsive scale (1920x1080 base) -----
  const BASE_W = 1920;
  const BASE_H = 1080;
  const stage = $("stage");

  function applyScale() {
    if (!stage) return;
    const vw = window.innerWidth || document.documentElement.clientWidth || BASE_W;
    const vh = window.innerHeight || document.documentElement.clientHeight || BASE_H;
    const s = Math.min(vw / BASE_W, vh / BASE_H);
    stage.style.transform = `scale(${s})`;
  }
  window.addEventListener("resize", applyScale);
  window.addEventListener("orientationchange", applyScale);

  // ----- Scene switching -----
  const scenes = {
    game: $("sceneGame"),
    break: $("sceneBreak"),
    technical: $("sceneTechnical"),
    sponsors: $("sceneSponsors"),
  };
  let activeScene = "game";

  function setActiveScene(scene) {
    const target = scenes[scene] ? scene : "game";
    if (target === activeScene) return;

    Object.keys(scenes).forEach((k) => {
      if (scenes[k]) scenes[k].classList.toggle("active", k === target);
    });
    activeScene = target;
  }

  // ----- GAME elements -----
  const elGame = {
    aName: $("aName"),
    bName: $("bName"),
    aSets: $("aSets"),
    bSets: $("bSets"),
    aScore: $("aScore"),
    bScore: $("bScore"),
    ticker: $("liveTicker"),
    metaStage: $("metaStage"),
    metaSet: $("metaSet"),
  };
  // ----- BREAK / TECH elements -----
  const elBreak = {
    btName: $("btName"),
    btSlug: $("btSlug"),
    btClock: $("btClock"),
    tables: $("breakTables"),
    last: $("breakLast"),
    next: $("breakNext"),
    program: $("breakProgram"),
    notice: $("breakNotice"),
  };

  const elTech = {
    title: $("techTitle"),
    subtitle: $("techSubtitle"),
    clock: $("techClock"),
  };

  function fmtTime(d = new Date()) {
    try {
      return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
    } catch (e) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    }
  }

  function safeText(el, v) {
    if (!el) return;
    el.textContent = v == null ? "" : String(v);
  }


  function teamName(state, id) {
    const t = (state.teams || []).find((x) => x.id === id);
    return t ? t.name : "—";
  }

  function renderTicker(state) {
    if (!elGame.ticker) return;
    const st = state || {};
    const pid = st.meta?.programMatchId;

    const live = (st.matches || [])
      .map((m) => ENG.emptyMatchPatch(m))
      .filter((m) => m.status === "live" && m.id !== pid);

    if (!live.length) {
      elGame.ticker.innerHTML = `<span class="muted">Brak innych meczów na żywo</span>`;
      return;
    }

    elGame.ticker.innerHTML = live.slice(0, 2).map((m) => {
      const ta = teamName(st, m.teamAId);
      const tb = teamName(st, m.teamBId);
      const idx = ENG.currentSetIndex(m);
      const s = m.sets[idx];
      const score = `${s.a}:${s.b}`;
      return `
        <div class="tickItem">
          <span class="tickTeams">${ta}</span>
          <span class="tickScore">${score}</span>
          <span class="tickTeams">${tb}</span>
        </div>
      `;
    }).join("");
  }

  function renderMeta(state, match) {
    if (!elGame.metaStage || !elGame.metaSet) return;

    if (!match) {
      elGame.metaStage.textContent = "—";
      elGame.metaSet.textContent = "SET —/3";
      return;
    }

    const idx = ENG.currentSetIndex(match);
    elGame.metaSet.textContent = `SET ${idx + 1}/3`;

    if (match.stage === "group" && match.group) {
      elGame.metaStage.textContent = `GRUPA ${String(match.group).toUpperCase()}`;
      return;
    }

    const stage = match.stage || "";
    const stageLabel = (UI && typeof UI.stageLabel === "function") ? UI.stageLabel(stage) : stage;
    elGame.metaStage.textContent = String(stageLabel || "—").toUpperCase();
  }

  function renderGame(state) {
    const st = state || {};
    const pmId = st.meta?.programMatchId || null;
    const pm0 = (st.matches || []).find((m) => m.id === pmId) || null;

    renderTicker(st);

    if (!pmId || !pm0) {
      renderMeta(st, null);
      if (elGame.aName) elGame.aName.textContent = "—";
      if (elGame.bName) elGame.bName.textContent = "—";
      if (elGame.aSets) elGame.aSets.textContent = "0";
      if (elGame.bSets) elGame.bSets.textContent = "0";
      if (elGame.aScore) elGame.aScore.textContent = "0";
      if (elGame.bScore) elGame.bScore.textContent = "0";
      return;
    }

    const pm = ENG.emptyMatchPatch(pm0);
    renderMeta(st, pm);

    const ta = teamName(st, pm.teamAId);
    const tb = teamName(st, pm.teamBId);

    const idx = ENG.currentSetIndex(pm);
    const s = pm.sets[idx];
    const sum = ENG.scoreSummary(pm);

    if (elGame.aName) elGame.aName.textContent = ta;
    if (elGame.bName) elGame.bName.textContent = tb;
    if (elGame.aSets) elGame.aSets.textContent = String(sum.setsA);
    if (elGame.bSets) elGame.bSets.textContent = String(sum.setsB);
    if (elGame.aScore) elGame.aScore.textContent = String(s.a);
    if (elGame.bScore) elGame.bScore.textContent = String(s.b);
  }


  function computeGroupStandings(st, group) {
    const teams = (st.teams || []).filter(t => t.group === group || !t.group); // tolerate missing team.group
    const rows = new Map();
    for (const t of st.teams || []) {
      rows.set(t.id, { id: t.id, name: t.name, w:0, l:0, sw:0, sl:0, pf:0, pa:0 });
    }

    const confirmed = (st.matches || [])
      .map(m => ENG.emptyMatchPatch(m))
      .filter(m => m.stage === "group" && (m.group || "") === group && m.status === "confirmed");

    for (const m of confirmed) {
      const sum = ENG.scoreSummary(m);
      const a = rows.get(m.teamAId);
      const b = rows.get(m.teamBId);
      if (!a || !b) continue;

      a.sw += sum.setsA; a.sl += sum.setsB;
      b.sw += sum.setsB; b.sl += sum.setsA;

      const sets = m.sets || [];
      for (const s of sets) {
        a.pf += (s?.a||0); a.pa += (s?.b||0);
        b.pf += (s?.b||0); b.pa += (s?.a||0);
      }

      if (sum.setsA > sum.setsB) { a.w += 1; b.l += 1; }
      else if (sum.setsB > sum.setsA) { b.w += 1; a.l += 1; }
    }

    const list = [...rows.values()].filter(r => {
      // include only teams that appear in group matches or have group tag
      if (!group) return true
      const team = (st.teams || []).find(t => t.id === r.id);
      return (team?.group || "") === group || confirmed.some(m => m.teamAId===r.id || m.teamBId===r.id);
    });

    list.sort((x,y) => {
      if (y.w !== x.w) return y.w - x.w;
      const xr = (x.sl===0? x.sw : x.sw/x.sl);
      const yr = (y.sl===0? y.sw : y.sw/y.sl);
      if (yr !== xr) return yr - xr;
      const xpr = (x.pa===0? x.pf : x.pf/x.pa);
      const ypr = (y.pa===0? y.pf : y.pf/y.pa);
      if (ypr !== xpr) return ypr - xpr;
      return x.name.localeCompare(y.name, "pl");
    });

    return list;
  }

  // ----- BREAK / TECHNICAL / SPONSORS ----

  function renderBreak(st) {
    safeText(elBreak.btName, st.meta?.tournamentName || "VolleyballPro");
    safeText(elBreak.btSlug, slug ? `TURNIEJ: ${String(slug).toUpperCase()}` : "");
    safeText(elBreak.btClock, fmtTime(new Date()));

    // Tables: group stage only, confirmed
    if (elBreak.tables) {
      const groups = [...new Set((st.matches || []).map(m => m.group).filter(Boolean))].sort();
      if (!groups.length) {
        elBreak.tables.innerHTML = `<div class="muted">Brak tabel (brak meczów grupowych)</div>`;
      } else {
        elBreak.tables.innerHTML = groups.map(g => {
          const rows = computeGroupStandings(st, g);
          const top = rows.slice(0, 6);
          const body = top.map(r => `
            <div class="row">
              <div class="name">${U.esc(r.name)}</div>
              <div class="stat">${r.w}-${r.l}</div>
            </div>
          `).join("");
          return `
            <div class="groupTable">
              <div class="gHead">GRUPA ${U.esc(String(g).toUpperCase())}</div>
              <div class="gBody">${body || `<div class="muted">Brak wyników</div>`}</div>
            </div>
          `;
        }).join("");
      }
    }

    // Last results (latest confirmed)
    if (elBreak.last) {
      const confirmed = (st.matches || []).map(m => ENG.emptyMatchPatch(m)).filter(m => m.status === "confirmed");
      confirmed.sort((a,b) => {
        const ta = new Date(a.updatedAt || a.updated_at || a.endedAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.updated_at || b.endedAt || 0).getTime();
        return tb - ta;
      });
      const items = confirmed.slice(0, 5).map(m => {
        const ta = teamName(st, m.teamAId);
        const tb = teamName(st, m.teamBId);
        const sum = ENG.scoreSummary(m);
        return `<div class="item"><span>${U.esc(ta)} vs ${U.esc(tb)}</span><b>${sum.setsA}:${sum.setsB}</b></div>`;
      }).join("");
      elBreak.last.innerHTML = items || `<div class="muted">Brak wyników</div>`;
    }

    // Next matches (pending)
    if (elBreak.next) {
      const pending = (st.matches || []).map(m => ENG.emptyMatchPatch(m)).filter(m => m.status === "pending");
      pending.sort((a,b) => {
        const ta = new Date(a.scheduledAt || a.createdAt || 0).getTime();
        const tb = new Date(b.scheduledAt || b.createdAt || 0).getTime();
        return ta - tb;
      });
      const items = pending.slice(0, 5).map(m => {
        const ta = teamName(st, m.teamAId);
        const tb = teamName(st, m.teamBId);
        const stageLabel = UI.stageLabel ? UI.stageLabel(m.stage) : m.stage;
        const grp = (m.stage==="group" && m.group) ? ` • Grupa ${String(m.group).toUpperCase()}` : "";
        return `<div class="item"><span>${U.esc(ta)} vs ${U.esc(tb)}</span><span class="muted">${U.esc(stageLabel)}${grp}</span></div>`;
      }).join("");
      elBreak.next.innerHTML = items || `<div class="muted">Brak zaplanowanych meczów</div>`;
    }

    // Program match
    if (elBreak.program) {
      const pmId = st.meta?.programMatchId || null;
      const pm0 = (st.matches || []).find(m => m.id === pmId) || null;
      if (!pm0) {
        elBreak.program.innerHTML = `<div class="muted">Nie wybrano meczu na transmisji</div>`;
      } else {
        const pm = ENG.emptyMatchPatch(pm0);
        const ta = teamName(st, pm.teamAId);
        const tb = teamName(st, pm.teamBId);
        const sum = ENG.scoreSummary(pm);
        const idx = ENG.currentSetIndex(pm);
        const s = pm.sets[idx];
        elBreak.program.innerHTML = `
          <div class="item">
            <span><b>${U.esc(ta)}</b> vs <b>${U.esc(tb)}</b></span>
            <b>${sum.setsA}:${sum.setsB} • ${s.a}:${s.b}</b>
          </div>
        `;
      }
    }
  }

  function renderTechnical(st) {
    if (!elTech.clock) return;
    safeText(elTech.clock, fmtTime(new Date()));
    // optionally pull from state
    if (elTech.title) safeText(elTech.title, st.meta?.techTitle || "ZARAZ WRACAMY");
    if (elTech.subtitle) safeText(elTech.subtitle, st.meta?.techSubtitle || "Trwają przygotowania do kolejnego meczu");
  }

  function renderOtherScenes(st) {
    // Keep clocks ticking regardless of active scene
    renderTechnical(st);
    if (activeScene === "break") renderBreak(st);
  }


  // ----- Start -----
  async function start() {
    applyScale();

    if (!slug) return;

    const tid = await STORE.getTournamentId(slug);
    if (!tid) return;

    let current = await STORE.fetchState(slug);

    const renderAll = () => {
      const st = current?.state || {};
      const scene = st.meta?.scene || "game";
      setActiveScene(scene);
      renderGame(st);
      renderOtherScenes(st);
    };

    renderAll();
    // Tick clocks (break/technical) even when state doesn't change
    setInterval(renderAll, 1000);

    STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      renderAll();
    });
  }

  start().catch((e) => console.error("overlay start error", e));
})();