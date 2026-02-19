// js/overlay.js â€" PRO Overlay (SAFE build)
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
  let activeScene = null; // null forces first render to always apply

  const sponsorWidget = $("sponsorWidget");

  function setActiveScene(scene) {
    const target = scenes[scene] ? scene : "game";

    // Always update DOM classes (removed early-return so re-renders always happen)
    Object.keys(scenes).forEach((k) => {
      if (scenes[k]) scenes[k].classList.toggle("active", k === target);
    });

    // Klasa na body — pozwala CSS ukryć widget na scenie sponsorów
    document.body.classList.remove("scene-game", "scene-break", "scene-technical", "scene-sponsors");
    document.body.classList.add(`scene-${target}`);

    // Hide sponsor widget on non-game scenes
    if (sponsorWidget) {
      if (target === "game") {
        sponsorWidget.style.display = "";
      } else {
        sponsorWidget.classList.remove("show");
        sponsorWidget.style.display = "none";
      }
    }

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

  // ----- BREAK elements -----
  const elBreak = {
    tables: document.getElementById("breakTables"),
    last: document.getElementById("breakLast"),
    next: document.getElementById("breakNext"),
    program: document.getElementById("breakProgram"),
    notice: document.getElementById("breakNotice"),
    btName: document.getElementById("btName"),
    btSlug: document.getElementById("btSlug"),
    btClock: document.getElementById("btClock"),
  };

  // ----- TECHNICAL elements -----
  const elTech = {
    root: document.getElementById("root") || document.getElementById("techRoot"),
    title: document.getElementById("title") || document.getElementById("techTitle"),
    subtitle: document.getElementById("subtitle") || document.getElementById("techSubtitle"),
    clock: document.getElementById("clock") || document.getElementById("techClock"),
  };

  function teamName(state, id) {
    const t = (state.teams || []).find((x) => x.id === id);
    return t ? t.name : "â€"";
  }

  function fmtTime(d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // ----- TICKER -----
  function renderTicker(state) {
    if (!elGame.ticker) return;
    const live = (state.matches || []).filter((m) => m.status === "live").slice(0, 2);
    if (!live.length) {
      elGame.ticker.innerHTML = `<span class="tickerItem muted">Brak meczÃ³w na Å¼ywo</span>`;
      return;
    }
    elGame.ticker.innerHTML = live.map((m) => {
      const pm = ENG.emptyMatchPatch(m);
      const ta = teamName(state, pm.teamAId);
      const tb = teamName(state, pm.teamBId);
      const idx = ENG.currentSetIndex(pm);
      const s = pm.sets[idx];
      const sum = ENG.scoreSummary(pm);
      return `<span class="tickerItem"><b>${ta}</b> ${s.a}:${s.b} <b>${tb}</b> <span class="tickerSets">(${sum.setsA}:${sum.setsB})</span></span>`;
    }).join('<span class="tickerSep">Â·</span>');
  }

  // ----- META (stage/set pills) -----
  function renderMeta(state, match) {
    if (elGame.metaSet) {
      if (match) {
        const idx = ENG.currentSetIndex(ENG.emptyMatchPatch(match));
        elGame.metaSet.textContent = `SET ${idx + 1}/3`;
      } else {
        elGame.metaSet.textContent = "SET â€"/3";
      }
    }
    if (elGame.metaStage) {
      const stage = match ? (match.stage || "group") : (state.meta?.currentStage || "group");
      const stageLabel = UI.stageLabel ? UI.stageLabel(stage) : stage;
      elGame.metaStage.textContent = String(stageLabel || "â€"").toUpperCase();
    }
  }

  // ----- GAME -----
  function renderGame(state) {
    const st = state || {};
    const pmId = st.meta?.programMatchId || null;
    const pm0 = (st.matches || []).find((m) => m.id === pmId) || null;

    renderTicker(st);

    if (!pmId || !pm0) {
      renderMeta(st, null);
      if (elGame.aName) elGame.aName.textContent = "â€"";
      if (elGame.bName) elGame.bName.textContent = "â€"";
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

  // ----- BREAK -----
  function matchLabel(st, m) {
    return `${teamName(st, m.teamAId)} vs ${teamName(st, m.teamBId)}`;
  }

  function matchScoreNow(m) {
    const pm = ENG.emptyMatchPatch(m);
    const idx = ENG.currentSetIndex(pm);
    const s = pm.sets[idx];
    const sum = ENG.scoreSummary(pm);
    return { a: s.a, b: s.b, setsA: sum.setsA, setsB: sum.setsB };
  }

  function renderBreak(state) {
    const st = state || {};

    // Header
    if (elBreak.btName) elBreak.btName.textContent = String(st.meta?.name || "VolleyballPro");
    if (elBreak.btSlug) elBreak.btSlug.textContent = String(slug || "");
    if (elBreak.btClock) elBreak.btClock.textContent = fmtTime(new Date());

    // â"€â"€ Group standings tables (fix: always re-render from fresh state) â"€â"€
    if (elBreak.tables) {
      const groups = ENG.computeStandings(st) || {};
      const keys = Object.keys(groups).filter(k => k !== "").sort((a, b) => String(a).localeCompare(String(b), "pl"));
      if (!keys.length) {
        elBreak.tables.innerHTML = `<div class="muted">Brak danych do tabel (mecze grupowe muszÄ… mieÄ‡ status <b>confirmed</b>).</div>`;
      } else {
        elBreak.tables.innerHTML = keys.map((g) => {
          const rows = groups[g] || [];
          const body = rows.map((r, i) => `
            <tr>
              <td class="pos">${i + 1}</td>
              <td class="name">${UI ? UI.esc(r.name) : r.name}</td>
              <td>${r.played}</td>
              <td>${r.wins}</td>
              <td>${r.losses}</td>
              <td>${r.tablePoints}</td>
              <td>${r.setsWon}:${r.setsLost}</td>
              <td>${r.pointsWon}:${r.pointsLost}</td>
            </tr>
          `).join("");
          return `
            <div class="breakGroup">
              <div class="breakGroupTitle">GRUPA ${UI ? UI.esc(String(g)) : String(g)}</div>
              <table class="breakTable">
                <thead>
                  <tr>
                    <th>#</th><th>DruÅ¼yna</th><th>M</th><th>W</th><th>P</th><th>PKT</th><th>Sety</th><th>Punkty</th>
                  </tr>
                </thead>
                <tbody>${body}</tbody>
              </table>
            </div>
          `;
        }).join("");
      }
    }

    // Last results (latest confirmed)
    if (elBreak.last) {
      const confirmed = (st.matches || []).filter(m => m.status === "confirmed");
      confirmed.sort((a, b) => {
        const ta = Date.parse(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0) || 0;
        const tb = Date.parse(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0) || 0;
        return tb - ta;
      });
      const items = confirmed.slice(0, 4).map(m => {
        const sc = matchScoreNow(m);
        return `<div class="breakItem"><span>${matchLabel(st, m)}</span><b>${sc.setsA}:${sc.setsB}</b></div>`;
      }).join("");
      elBreak.last.innerHTML = items || `<div class="muted">Brak zakoÅ„czonych meczÃ³w.</div>`;
    }

    // Next matches (pending)
    if (elBreak.next) {
      const pending = (st.matches || []).filter(m => m.status === "pending");
      const items = pending.slice(0, 4).map(m => `<div class="breakItem"><span>${matchLabel(st, m)}</span><b>â€"</b></div>`).join("");
      elBreak.next.innerHTML = items || `<div class="muted">Brak zaplanowanych meczÃ³w.</div>`;
    }

    // Program match
    if (elBreak.program) {
      const pid = st.meta?.programMatchId;
      const m = (st.matches || []).find(x => x.id === pid);
      if (!m) {
        elBreak.program.innerHTML = `<div class="muted">Nie wybrano meczu na transmisjÄ™.</div>`;
      } else {
        const sc = matchScoreNow(m);
        elBreak.program.innerHTML = `
          <div class="breakItem"><span>${matchLabel(st, m)}</span><b>${sc.setsA}:${sc.setsB} â€¢ ${sc.a}:${sc.b}</b></div>
        `;
      }
    }
  }

  // ----- TECHNICAL -----
  function renderTechnical(state) {
    if (elTech.clock) elTech.clock.textContent = fmtTime(new Date());
    if (elTech.subtitle && !elTech.subtitle.textContent) {
      elTech.subtitle.textContent = "TrwajÄ… przygotowania do kolejnego meczu";
    }
    if (elTech.title && !elTech.title.textContent) {
      elTech.title.textContent = "ZARAZ WRACAMY";
    }
  }

  function renderOtherScenes(_state) {
    // no-op
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
      if (scene === "game") renderGame(st);
      else if (scene === "break") renderBreak(st);
      else if (scene === "technical") renderTechnical(st);
      else if (scene === "sponsors") { /* handled by overlay-sponsors-rotator.js */ }
      renderOtherScenes(st);
    };

    renderAll();

    // Clock tick for Break/Technical
    setInterval(() => {
      const st2 = current?.state || {};
      const scene2 = st2.meta?.scene || "game";
      if (scene2 === "break") renderBreak(st2);
      if (scene2 === "technical") renderTechnical(st2);
    }, 1000);

    STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      renderAll();
    });

    // Fallback polling â€" gdy WebSocket na telefonie/OBS siÄ™ urwie
    let _polling = false;
    setInterval(async () => {
      if (_polling) return;
      _polling = true;
      try {
        const fresh = await STORE.fetchState(slug);
        if (fresh && fresh.version != null && fresh.version !== current?.version) {
          current = fresh;
          renderAll();
        }
      } catch (e) {
        // ignore
      } finally {
        _polling = false;
      }
    }, 2000);
  }

  start().catch((e) => console.error("overlay start error", e));
})();