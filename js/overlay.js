// js/overlay.js (PRO overlay - single page, multi-scene, no reloads)
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

    for (const k of Object.keys(scenes)) {
      if (scenes[k]) scenes[k].classList.toggle("active", k === target);
    }
    activeScene = target;
  }

  // ----- GAME render -----
  const elGame = {
    aName: $("aName"),
    bName: $("bName"),
    aScore: $("aScore"),
    bScore: $("bScore"),
    sets: $("sets"),
    setInfo: $("setInfo"),
    badge: $("badge"),
    notice: $("gameNotice"),
  };

  function renderGame(state) {
    const st = state || {};
    const pmId = st.meta?.programMatchId;
    const pm0 = (st.matches || []).find(m => m.id === pmId);

    if (!pmId || !pm0) {
      elGame.badge.textContent = slug || "—";
      elGame.aName.textContent = "BRAK";
      elGame.bName.textContent = "PROGRAMU";
      elGame.aScore.textContent = "—";
      elGame.bScore.textContent = "—";
      elGame.sets.textContent = "";
      elGame.setInfo.textContent = "";
      if (elGame.notice) elGame.notice.style.display = "none";
      return;
    }

    const pm = ENG.emptyMatchPatch(pm0);
    const ta = (st.teams || []).find(x => x.id === pm.teamAId);
    const tb = (st.teams || []).find(x => x.id === pm.teamBId);
    const idx = ENG.currentSetIndex(pm);
    const s = pm.sets[idx];
    const sum = ENG.scoreSummary(pm);

    elGame.badge.textContent = UI.stageLabel(pm.stage) + (pm.stage === "group" && pm.group ? (" • Grupa " + pm.group) : "");
    elGame.aName.textContent = ta?.name || "Drużyna A";
    elGame.bName.textContent = tb?.name || "Drużyna B";
    elGame.aScore.textContent = s.a;
    elGame.bScore.textContent = s.b;
    elGame.sets.textContent = `${sum.setsA}:${sum.setsB}`;

    if (pm.status === "finished") elGame.setInfo.textContent = `KONIEC • czeka na zatwierdzenie`;
    else if (pm.status === "confirmed") elGame.setInfo.textContent = `KONIEC`;
    else elGame.setInfo.textContent = `Set ${idx + 1}/3`;
  }

  // ----- BREAK render (adapted from break.js) -----
  function safeText(el, txt) { if (el) el.textContent = txt || ""; }

  function fmtStage(stage) {
    return (U && U.stageLabels && U.stageLabels[stage]) ? U.stageLabels[stage] : (stage || "");
  }

  function teamName(state, id) {
    const t = (state.teams || []).find(x => x.id === id);
    return t ? t.name : "—";
  }

  function setsLine(match) {
    const m = ENG.emptyMatchPatch(match);
    const sum = ENG.scoreSummary(m);
    const setScores = [];
    for (let i = 0; i < 3; i++) {
      const s = m.sets[i];
      if ((+s.a || 0) === 0 && (+s.b || 0) === 0) continue;
      setScores.push(`${s.a}:${s.b}`);
    }
    return { sets: `${sum.setsA}:${sum.setsB}`, setScores: setScores.join(", ") };
  }

  function matchLabel(state, m) {
    const a = teamName(state, m.teamAId);
    const b = teamName(state, m.teamBId);
    const stage = fmtStage(m.stage);
    const grp = (m.stage === "group" && m.group) ? ` • Grupa ${m.group}` : "";
    return `${a} vs ${b} • ${stage}${grp}`;
  }

  function renderTables(state) {
    const host = $("breakTables");
    if (!host) return;
    host.innerHTML = "";

    const groups = ENG.computeStandings(state);
    const keys = Object.keys(groups).filter(k => (k || "").trim() !== "").sort((a, b) => a.localeCompare(b, "pl"));

    if (keys.length === 0) {
      host.innerHTML = `<div class="muted small">Brak zatwierdzonych meczów grupowych.</div>`;
      return;
    }

    for (const g of keys) {
      const arr = groups[g] || [];
      const card = document.createElement("div");
      card.className = "breakTableCard";
      card.innerHTML = `
        <div class="breakTableHeader">Grupa ${g}</div>
        <table class="tbl breakTbl">
          <thead>
            <tr>
              <th>#</th><th>Drużyna</th><th>M</th><th>W</th><th>P</th><th>Sety</th><th>Małe</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;
      const tb = card.querySelector("tbody");
      arr.forEach((s, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="muted">${idx + 1}</td>
          <td><span class="breakTeam">${s.name}</span></td>
          <td>${s.played}</td>
          <td>${s.wins}</td>
          <td><b>${s.tablePoints}</b></td>
          <td class="muted">${s.setsWon}:${s.setsLost}</td>
          <td class="muted">${s.pointsWon}:${s.pointsLost}</td>
        `;
        tb.appendChild(tr);
      });
      host.appendChild(card);
    }
  }

  function renderLastNext(state) {
    const matches = (state.matches || []).map(m => ENG.emptyMatchPatch(m));

    const finished = matches
      .filter(m => m.status === "confirmed" || m.status === "finished")
      .slice()
      .reverse();

    const pending = matches
      .filter(m => m.status === "pending" || m.status === "live")
      .slice();

    const lastHost = $("breakLast");
    const nextHost = $("breakNext");

    if (lastHost) {
      lastHost.innerHTML = "";
      const list = finished.slice(0, 6);
      if (list.length === 0) {
        lastHost.innerHTML = `<div class="muted small">Brak zakończonych meczów.</div>`;
      } else {
        for (const m of list) {
          const { sets, setScores } = setsLine(m);
          const row = document.createElement("div");
          row.className = "breakItem";
          row.innerHTML = `
            <div class="breakItemMain">
              <div class="breakItemTitle">${matchLabel(state, m)}</div>
              <div class="breakItemSub muted">${setScores || "—"}</div>
            </div>
            <div class="breakItemScore">${sets}</div>
          `;
          lastHost.appendChild(row);
        }
      }
    }

    if (nextHost) {
      nextHost.innerHTML = "";
      const list = pending.slice(0, 8);
      if (list.length === 0) {
        nextHost.innerHTML = `<div class="muted small">Brak zaplanowanych meczów.</div>`;
      } else {
        for (const m of list) {
          const row = document.createElement("div");
          row.className = "breakItem";
          const badge = (m.status === "live") ? `<span class="breakLive">LIVE</span>` : `<span class="breakPending">NEXT</span>`;
          row.innerHTML = `
            <div class="breakItemMain">
              <div class="breakItemTitle">${badge} ${matchLabel(state, m)}</div>
              <div class="breakItemSub muted">${(m.court && m.court !== "") ? ("Boisko: " + m.court) : ""}</div>
            </div>
            <div class="breakItemScore muted">—</div>
          `;
          nextHost.appendChild(row);
        }
      }
    }
  }

  function renderProgram(state) {
    const host = $("breakProgram");
    if (!host) return;
    const pid = state?.meta?.programMatchId || null;
    if (!pid) {
      host.innerHTML = `<div class="muted small">Nie ustawiono meczu na transmisji.</div>`;
      return;
    }
    const m = (state.matches || []).find(x => x.id === pid);
    if (!m) {
      host.innerHTML = `<div class="muted small">Mecz na transmisji nie istnieje.</div>`;
      return;
    }
    const mm = ENG.emptyMatchPatch(m);
    const a = teamName(state, mm.teamAId);
    const b = teamName(state, mm.teamBId);
    const sum = ENG.scoreSummary(mm);
    const score = `${sum.pointsA}:${sum.pointsB}`;
    const sets = `${sum.setsA}:${sum.setsB}`;
    host.innerHTML = `
      <div class="breakProgramRow">
        <div class="breakProgramTeams">
          <div class="breakProgramA">${a}</div>
          <div class="breakProgramVs">vs</div>
          <div class="breakProgramB">${b}</div>
        </div>
        <div class="breakProgramScore">
          <div class="breakProgramPoints">${score}</div>
          <div class="breakProgramSets muted">sety ${sets}</div>
        </div>
      </div>
    `;
  }

  function tickClock() {
    const el = $("btClock");
    if (!el) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    safeText(el, `${hh}:${mm}`);
  }

  function renderBreak(state) {
    safeText($("btSlug"), slug ? `t=${slug}` : "");
    safeText($("btName"), state?.tournament?.name || state?.meta?.name || "VolleyballPro");
    renderTables(state);
    renderLastNext(state);
    renderProgram(state);
  }

  // ----- TECHNICAL render -----
  function tickTechClock() {
    const el = $("techClock");
    if (!el) return;
    const d = new Date();
    el.textContent = d.toLocaleTimeString();
  }

  // ----- Wiring -----
  if (!slug) {
    const n = $("gameNotice");
    if (n) { n.style.display = "block"; n.textContent = "Brak parametru ?t=..."; }
    applyScale();
    return;
  }

  let current = null;

  function renderAll() {
    const st = current?.state || {};
    const scene = st.meta?.scene || "game";

    // activate scene
    setActiveScene(scene);

    // render active scene (and pre-render others cheaply)
    renderGame(st);
    renderBreak(st);

    // technical clock always ticks, no state needed
  }

  async function start() {
    applyScale();
    tickClock();
    setInterval(tickClock, 1000);
    tickTechClock();
    setInterval(tickTechClock, 1000);

    const tid = await STORE.getTournamentId(slug);
    if (!tid) {
      const n = $("gameNotice");
      if (n) { n.style.display = "block"; n.textContent = `Turniej "${slug}" nie istnieje.`; }
      return;
    }

    current = await STORE.fetchState(slug);
    renderAll();

    STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      renderAll();
    });
  }

  start().catch(console.error);
})();
