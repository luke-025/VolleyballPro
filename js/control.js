// js/control.js (stats-lite, resilient version)
// - DOES NOT require ENG/UI globals to render teams/matches
// - Adds stats-lite: total small points + max set margin + set-by-set preview (for finished/confirmed)
// - Should not "blank" the Control UI if some helpers are missing.

(() => {
  let current = null;

  const els = {
    teamsList: document.getElementById("teamsList"),
    matchesList: document.getElementById("matchesList"),
    programBox: document.getElementById("programBox"),
    standingsBox: document.getElementById("standingsBox"),
  };

  function stageLabel(stage) {
    const map = {
      group: "Grupa",
      quarterfinal: "Ćwierćfinał",
      semifinal: "Półfinał",
      thirdplace: "Mecz o 3 miejsce",
      final: "Finał",
    };
    return map[stage] || (stage ? String(stage) : "—");
  }

  function safeEmptyMatch(m) {
    const ENG = window.ENG || window.VPEngine || window.Engine;
    if (ENG && typeof ENG.emptyMatchPatch === "function") return ENG.emptyMatchPatch(m);
    return m;
  }

  function scoreSummary(m) {
    const ENG = window.ENG || window.VPEngine || window.Engine;
    if (ENG && typeof ENG.scoreSummary === "function") return ENG.scoreSummary(m);

    // fallback: count sets won by comparing set points
    let setsA = 0, setsB = 0;
    for (const s of (m.sets || [])) {
      if ((s.a ?? 0) > (s.b ?? 0)) setsA++;
      else if ((s.b ?? 0) > (s.a ?? 0)) setsB++;
    }
    return { setsA, setsB };
  }

  function currentSetIndex(m) {
    const ENG = window.ENG || window.VPEngine || window.Engine;
    if (ENG && typeof ENG.currentSetIndex === "function") return ENG.currentSetIndex(m);
    // fallback: first unfinished set
    const sets = m.sets || [];
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      if ((s.a ?? 0) === 0 && (s.b ?? 0) === 0) return i;
    }
    return Math.max(0, sets.length - 1);
  }

  function formatSetPreview(m) {
    return (m.sets || [])
      .filter(s => (s.a ?? 0) !== 0 || (s.b ?? 0) !== 0)
      .map(s => `${s.a}:${s.b}`)
      .join(", ");
  }

  function totalPointsFromSets(m) {
    let a = 0, b = 0;
    for (const s of (m.sets || [])) {
      a += Number(s.a || 0);
      b += Number(s.b || 0);
    }
    return { a, b, total: a + b };
  }

  function maxSetMargin(m) {
    let best = 0;
    for (const s of (m.sets || [])) {
      const d = Math.abs((s.a || 0) - (s.b || 0));
      if (d > best) best = d;
    }
    return best;
  }

  function renderSceneStatus(state) {
    const badge = document.getElementById("sceneStatus");
    if (!badge) return;
    const scene = state.meta?.scene || "game";
    badge.innerText = "Scena: " + String(scene).toUpperCase();
  }

  function render() {
    if (!current) return;
    const state = current.state || current; // tolerate different shapes

    renderSceneStatus(state);

    // Teams
    if (els.teamsList) {
      els.teamsList.innerHTML = "";
      for (const t of (state.teams || [])) {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="grow"><b>${t.name ?? "?"}</b> <span class="muted">(${t.group || "—"})</span></div>
          <button class="btn btn-ghost" data-del-team="${t.id}">Usuń</button>
        `;
        els.teamsList.appendChild(row);
      }
    }

    // Matches
    if (els.matchesList) {
      els.matchesList.innerHTML = "";
      for (const m0 of (state.matches || [])) {
        const m = safeEmptyMatch(m0);

        const teamA = (state.teams || []).find(x => x.id === m.teamAId);
        const teamB = (state.teams || []).find(x => x.id === m.teamBId);

        const sum = scoreSummary(m);
        const pts = totalPointsFromSets(m);
        const margin = maxSetMargin(m);

        const isProgram = state.meta?.programMatchId === m.id;
        const claimed = m.claimedBy ? "🔒" : "";
        const canConfirm = m.status === "finished";
        const canReopen = (m.status === "finished" || m.status === "confirmed");

        const setPreview = (m.status === "finished" || m.status === "confirmed") ? formatSetPreview(m) : "";

        const row = document.createElement("div");
        row.className = "matchRow";
        row.innerHTML = `
          <div class="grow">
            <div class="matchTitle">${claimed} <b>${teamA?.name || "?"}</b> vs <b>${teamB?.name || "?"}</b></div>
            <div class="muted small">
              ${stageLabel(m.stage)}
              ${m.stage === "group" ? ("• Grupa " + (m.group || "")) : ""}
              • status: <b>${m.status}</b>
              • sety: ${sum.setsA}:${sum.setsB}
              • punkty: <b>${pts.a}:${pts.b}</b>
              ${margin ? ` • max różnica seta: ${margin}` : ""}
              ${setPreview ? ` • przebieg: <b>${setPreview}</b>` : ""}
            </div>
          </div>
          <div class="btnGroup">
            <button class="btn ${isProgram ? "btn-primary" : ""}" data-program="${m.id}">
              ${isProgram ? "PROGRAM" : "Ustaw PROGRAM"}
            </button>
            ${canConfirm ? `<button class="btn btn-primary" data-confirm="${m.id}">Zatwierdź</button>` : ""}
            ${canReopen
              ? `<button class="btn btn-ghost" data-reopen="${m.id}">Cofnij do live</button>`
              : `<button class="btn btn-ghost" data-live="${m.id}">Live</button>`}
            <button class="btn btn-ghost" data-unclaim="${m.id}">Odblokuj</button>
            <button class="btn btn-danger" data-del-match="${m.id}">Usuń</button>
          </div>
        `;
        els.matchesList.appendChild(row);
      }
    }

    // Program box
    if (els.programBox) {
      const pm0 = (state.matches || []).find(x => x.id === state.meta?.programMatchId);
      if (pm0) {
        const pm = safeEmptyMatch(pm0);
        const ta = (state.teams || []).find(x => x.id === pm.teamAId);
        const tb = (state.teams || []).find(x => x.id === pm.teamBId);
        const idx = currentSetIndex(pm);
        const s = (pm.sets || [])[idx] || { a: 0, b: 0 };
        const pts = totalPointsFromSets(pm);
        const sum = scoreSummary(pm);

        els.programBox.innerHTML = `
          <div class="row">
            <div class="grow"><b>PROGRAM:</b> ${ta?.name || "?"} vs ${tb?.name || "?"}</div>
            <div class="scoreMono">${s.a}:${s.b}</div>
          </div>
          <div class="row">
            <div class="grow muted small">
              sety: <b>${sum.setsA}:${sum.setsB}</b>
              • punkty łącznie: <b>${pts.a}:${pts.b}</b>
              • suma punktów: ${pts.total}
            </div>
          </div>
        `;
      } else {
        els.programBox.innerHTML = `<div class="muted">Brak ustawionego meczu PROGRAM.</div>`;
      }
    }

    // Standings: leave to existing engine if available, otherwise don't break UI.
    // (Your previous control already renders standings; this file won't prevent it elsewhere.)
    if (els.standingsBox && window.ENG && typeof window.ENG.computeStandings === "function") {
      // If your original code renders standings, you can ignore this.
      // We intentionally do NOT re-render standings here to avoid conflicts.
    }
  }

  // Subscribe (supports several global wiring styles)
  const sub =
    (window.VPState && window.VPState.subscribe) ||
    window.subscribe ||
    (window.VB && window.VB.subscribe) ||
    null;

  if (!sub) {
    console.warn("[control] No subscribe() found. Teams/matches won't auto-render.");
    return;
  }

  sub((data) => {
    current = data;
    render();
  });
})();
