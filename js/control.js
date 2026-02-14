// js/control.js
// Adds "stats-lite" (totals / per-set summary) to match rows + PROGRAM box.
// Compatible with non-module script loading.

(() => {
  // Expect global helpers from your project
  const ENG = window.ENG || window.VPEngine || window.Engine;
  const UI  = window.UI  || window.VPUI     || window.Ui;

  if (!ENG || !UI) {
    console.error("[control] Missing ENG/UI globals. control.js expects window.ENG and window.UI.");
    return;
  }

  let current = null;

  const els = {
    teamsList: document.getElementById("teamsList"),
    matchesList: document.getElementById("matchesList"),
    programBox: document.getElementById("programBox"),
    standingsBox: document.getElementById("standingsBox"),
  };

  function formatSetPreview(m) {
    return (m.sets || [])
      .filter(s => (s.a ?? 0) !== 0 || (s.b ?? 0) !== 0)
      .map(s => `${s.a}:${s.b}`)
      .join(", ");
  }

  function totalPointsFromSets(m) {
    const sets = m.sets || [];
    let a = 0, b = 0;
    for (const s of sets) {
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
    const state = current.state;

    renderSceneStatus(state);

    // Teams
    if (els.teamsList) {
      els.teamsList.innerHTML = "";
      for (const t of state.teams || []) {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="grow"><b>${t.name}</b> <span class="muted">(${t.group || "—"})</span></div>
          <button class="btn btn-ghost" data-del-team="${t.id}">Usuń</button>
        `;
        els.teamsList.appendChild(row);
      }
    }

    // Matches
    if (els.matchesList) {
      els.matchesList.innerHTML = "";
      for (const m0 of state.matches || []) {
        const m = ENG.emptyMatchPatch ? ENG.emptyMatchPatch(m0) : m0;
        const teamA = (state.teams || []).find(x => x.id === m.teamAId);
        const teamB = (state.teams || []).find(x => x.id === m.teamBId);

        const sum = ENG.scoreSummary ? ENG.scoreSummary(m) : { setsA: 0, setsB: 0 };
        const isProgram = state.meta?.programMatchId === m.id;
        const claimed = m.claimedBy ? "🔒" : "";
        const canConfirm = m.status === "finished";
        const canReopen = (m.status === "finished" || m.status === "confirmed");

        const pts = totalPointsFromSets(m);
        const margin = maxSetMargin(m);
        const setPreview = (m.status === "finished" || m.status === "confirmed") ? formatSetPreview(m) : "";

        const row = document.createElement("div");
        row.className = "matchRow";

        row.innerHTML = `
          <div class="grow">
            <div class="matchTitle">${claimed} <b>${teamA?.name || "?"}</b> vs <b>${teamB?.name || "?"}</b></div>
            <div class="muted small">
              ${(UI.stageLabel ? UI.stageLabel(m.stage) : (m.stage || ""))}
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

    // PROGRAM box + stats-lite
    if (els.programBox) {
      const pm0 = (state.matches || []).find(x => x.id === state.meta?.programMatchId);
      if (pm0) {
        const pm = ENG.emptyMatchPatch ? ENG.emptyMatchPatch(pm0) : pm0;
        const ta = (state.teams || []).find(x => x.id === pm.teamAId);
        const tb = (state.teams || []).find(x => x.id === pm.teamBId);
        const idx = ENG.currentSetIndex ? ENG.currentSetIndex(pm) : 0;
        const s = (pm.sets || [])[idx] || { a: 0, b: 0 };
        const pts = totalPointsFromSets(pm);

        els.programBox.innerHTML = `
          <div class="row">
            <div class="grow"><b>PROGRAM:</b> ${ta?.name || "?"} vs ${tb?.name || "?"}</div>
            <div class="scoreMono">${s.a}:${s.b}</div>
          </div>
          <div class="row">
            <div class="grow muted small">
              sety: <b>${(ENG.scoreSummary ? ENG.scoreSummary(pm).setsA : 0)}:${(ENG.scoreSummary ? ENG.scoreSummary(pm).setsB : 0)}</b>
              • punkty łącznie: <b>${pts.a}:${pts.b}</b>
              • suma punktów: ${pts.total}
            </div>
          </div>
        `;
      } else {
        els.programBox.innerHTML = `<div class="muted">Brak ustawionego meczu PROGRAM.</div>`;
      }
    }

    // Standings (unchanged)
    if (els.standingsBox && ENG.computeStandings) {
      const groups = ENG.computeStandings(state);
      els.standingsBox.innerHTML = "";
      const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pl"));

      if (groupKeys.length === 0) {
        els.standingsBox.innerHTML = `<div class="muted">Brak zatwierdzonych meczów grupowych.</div>`;
      } else {
        for (const g of groupKeys) {
          const card = document.createElement("div");
          card.className = "card inner";

          const rows = groups[g].map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><b>${s.name}</b></td>
              <td class="right">${s.played}</td>
              <td class="right">${s.wins}</td>
              <td class="right">${s.losses}</td>
              <td class="right"><b>${s.tablePoints}</b></td>
              <td class="right">${s.setsWon}:${s.setsLost}</td>
              <td class="right">${s.pointsWon}:${s.pointsLost}</td>
            </tr>
          `).join("");

          card.innerHTML = `
            <h4>Grupa ${g}</h4>
            <table class="tbl">
              <thead>
                <tr>
                  <th>#</th><th>Drużyna</th><th class="right">M</th>
                  <th class="right">W</th><th class="right">L</th>
                  <th class="right">Pkt</th><th class="right">Sety</th><th class="right">Małe</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `;
          els.standingsBox.appendChild(card);
        }
      }
    }
  }

  // Hook into your app's subscription system.
  // We support both: window.subscribe(fn) and window.VPState.subscribe(fn)
  const sub =
    (window.VPState && window.VPState.subscribe) ||
    window.subscribe;

  if (!sub) {
    console.error("[control] Missing subscribe(). Expected window.subscribe or window.VPState.subscribe.");
    return;
  }

  sub((data) => {
    current = data;
    render();
  });
})();
