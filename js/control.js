
// control.js (fixed render state initialization bug)

import { getState, subscribe, updateState } from "./state.js";
import * as ENG from "./engine.js";
import * as UI from "./ui.js";

let current = null;

const els = {
  teamsList: document.getElementById("teamsList"),
  matchesList: document.getElementById("matchesList"),
  programBox: document.getElementById("programBox"),
  standingsBox: document.getElementById("standingsBox"),
};

function formatSetPreview(m) {
  return m.sets
    .filter(s => s.a !== 0 || s.b !== 0)
    .map(s => `${s.a}:${s.b}`)
    .join(", ");
}

function renderSceneStatus(state) {
  const scene = state.meta?.scene || "game";
  const badge = document.getElementById("sceneStatus");
  if (badge) badge.innerText = "Scena: " + scene.toUpperCase();
}

function render() {
  if (!current) return;
  const state = current.state;

  renderSceneStatus(state);

  // Teams
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

  // Matches
  els.matchesList.innerHTML = "";
  for (const m0 of state.matches || []) {
    const m = ENG.emptyMatchPatch(m0);
    const teamA = (state.teams || []).find(x => x.id === m.teamAId);
    const teamB = (state.teams || []).find(x => x.id === m.teamBId);
    const sum = ENG.scoreSummary(m);
    const isProgram = state.meta?.programMatchId === m.id;
    const claimed = m.claimedBy ? "🔒" : "";
    const canConfirm = m.status === "finished";
    const canReopen = (m.status === "finished" || m.status === "confirmed");

    const row = document.createElement("div");
    row.className = "matchRow";
    row.innerHTML = `
      <div class="grow">
        <div class="matchTitle">${claimed} <b>${teamA?.name || "?"}</b> vs <b>${teamB?.name || "?"}</b></div>
        <div class="muted small">
          ${UI.stageLabel(m.stage)}
          ${m.stage === "group" ? ("• Grupa " + (m.group || "")) : ""}
          • status: <b>${m.status}</b>
          • sety: ${sum.setsA}:${sum.setsB}
          ${(m.status === "finished" || m.status === "confirmed") ?
            (` • przebieg: <b>${formatSetPreview(m)}</b>`) : ""}
        </div>
      </div>
      <div class="btnGroup">
        <button class="btn ${isProgram ? "btn-primary" : ""}" data-program="${m.id}">
          ${isProgram ? "PROGRAM" : "Ustaw PROGRAM"}
        </button>
        ${canConfirm ? `<button class="btn btn-primary" data-confirm="${m.id}">Zatwierdź</button>` : ""}
        ${canReopen ?
          `<button class="btn btn-ghost" data-reopen="${m.id}">Cofnij do live</button>` :
          `<button class="btn btn-ghost" data-live="${m.id}">Live</button>`
        }
        <button class="btn btn-ghost" data-unclaim="${m.id}">Odblokuj</button>
        <button class="btn btn-danger" data-del-match="${m.id}">Usuń</button>
      </div>
    `;
    els.matchesList.appendChild(row);
  }

  // Program box
  const pm = (state.matches || []).find(x => x.id === state.meta?.programMatchId);
  if (pm) {
    const m = ENG.emptyMatchPatch(pm);
    const ta = (state.teams || []).find(x => x.id === m.teamAId);
    const tb = (state.teams || []).find(x => x.id === m.teamBId);
    const s = m.sets[ENG.currentSetIndex(m)];
    els.programBox.innerHTML = `
      <div class="row">
        <div class="grow"><b>PROGRAM:</b> ${ta?.name || "?"} vs ${tb?.name || "?"}</div>
        <div class="scoreMono">${s.a}:${s.b}</div>
      </div>
    `;
  } else {
    els.programBox.innerHTML = `<div class="muted">Brak ustawionego meczu PROGRAM.</div>`;
  }

  // Standings
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

subscribe(data => {
  current = data;
  render();
});
