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

  // ----- BREAK / TECHNICAL / SPONSORS -----
  // We keep these scenes alive (so scene switching works), but we don't change their existing rendering here.
  function renderOtherScenes(_state) {
    // no-op: your existing break/technical/sponsors UI remains in HTML/CSS/other scripts (if any)
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

    STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      renderAll();
    });
  }

  start().catch((e) => console.error("overlay start error", e));
})();