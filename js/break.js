// js/break.js – Break screen renderer (standalone)
(function () {
  const UI   = window.VP_UI;
  const ENG  = window.VPEngine;
  const STORE = window.VPState;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  const slug = UI.getSlug();
  const $    = (id) => document.getElementById(id);

  const el = {
    btName:  $("btName"),
    btClock: $("btClock"),
    tables:  $("breakTables"),
    last:    $("breakLast"),
    next:    $("breakNext"),
    program: $("breakProgram"),
    notice:  $("breakNotice"),
  };

  function fmtTime(d) {
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, "0")).join(":");
  }

  function teamName(state, id) {
    return (state.teams || []).find(x => x.id === id)?.name ?? "—";
  }

  function matchLabel(st, m) {
    return `${teamName(st, m.teamAId)} vs ${teamName(st, m.teamBId)}`;
  }

  function matchScoreNow(m) {
    const pm  = ENG.emptyMatchPatch(m);
    const idx = ENG.currentSetIndex(pm);
    const s   = pm.sets[idx];
    const sum = ENG.scoreSummary(pm);
    return { a: s.a, b: s.b, setsA: sum.setsA, setsB: sum.setsB };
  }

function renderTables(st) {
    if (!el.tables) return;
    const groups = ENG.computeStandings(st) || {};
    const keys = Object.keys(groups).filter((k) => k !== "").sort((a, b) => String(a).localeCompare(String(b), "pl"));

    if (!keys.length) {
      el.tables.innerHTML = `<div class="muted">Brak danych do tabel (mecze grupowe muszą mieć status <b>confirmed</b>).</div>`;
      return;
    }

    el.tables.innerHTML = keys
      .map((g) => {
        const rows = groups[g] || [];
        const body = rows
          .map(
            (r, i) => `
          <tr>
            <td class="colRank">${i + 1}</td>
            <td class="colTeam">${esc(r.name)}</td>
            <td class="colMWP">${r.played}</td>
            <td class="colMWP">${r.wins}</td>
            <td class="colMWP">${r.losses}</td>
            <td class="colPts">${r.tablePoints}</td>
            <td class="colSets">${r.setsWon}:${r.setsLost}</td>
            <td class="colPoints">${r.pointsWon}:${r.pointsLost}</td>
          </tr>`
          )
          .join("");

        return `
        <div class="breakGroup">
          <div class="breakGroupTitle">GRUPA ${esc(String(g).toUpperCase())}</div>
          <table class="breakTable">
            <thead>
              <tr>
                <th class="colRank">#</th>
                <th class="colTeam">Drużyna</th>
                <th class="colMWP">M</th>
                <th class="colMWP">W</th>
                <th class="colMWP">P</th>
                <th class="colPts">PKT</th>
                <th class="colSets">Sety</th>
                <th class="colPoints">Małe</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>`;
      })
      .join("");
  }

  function renderLast(st) {
    if (!el.last) return;
    const confirmed = (st.matches || []).filter(m => m.status === "confirmed");
    confirmed.sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.updatedAt || 0) || 0;
      const tb = Date.parse(b.updated_at || b.updatedAt || 0) || 0;
      return tb - ta;
    });
    el.last.innerHTML = confirmed.slice(0, 4).map(m => {
      const s = matchScoreNow(m);
      return `<div class="brkItem"><span>${esc(matchLabel(st, m))}</span><b>${s.setsA}:${s.setsB}</b></div>`;
    }).join("") || `<div class="muted" style="font-size:12px;padding:6px 0">Brak zakończonych meczów.</div>`;
  }

  function renderNext(st) {
    if (!el.next) return;
    const pending = (st.matches || []).filter(m => m.status === "pending");
    el.next.innerHTML = pending.slice(0, 5).map(m =>
      `<div class="brkItem"><span>${esc(matchLabel(st, m))}</span></div>`
    ).join("") || `<div class="muted" style="font-size:12px;padding:6px 0">Brak zaplanowanych meczów.</div>`;
  }

  function renderProgram(st) {
    if (!el.program) return;
    const pid = st.meta?.programMatchId;
    const m   = (st.matches || []).find(x => x.id === pid);
    if (!m) {
      el.program.innerHTML = `<div class="muted" style="font-size:12px;padding:6px 0">Nie wybrano meczu na transmisję.</div>`;
      return;
    }
    const s = matchScoreNow(m);
    el.program.innerHTML = `
      <div class="brkProgramBox">
        <div class="brkProgramTeams">${esc(matchLabel(st, m))}</div>
        <div class="brkProgramScore">${s.a} : ${s.b}</div>
        <div class="brkProgramSets">Sety: ${s.setsA} : ${s.setsB}</div>
      </div>`;
  }

  function renderAll(st) {
    if (el.btName)  el.btName.textContent  = String(st.meta?.name || "VolleyballPro");
    if (el.btClock) el.btClock.textContent = fmtTime(new Date());
    renderTables(st);
    renderLast(st);
    renderNext(st);
    renderProgram(st);
  }

  async function start() {
    setInterval(() => { if (el.btClock) el.btClock.textContent = fmtTime(new Date()); }, 1000);

    if (!slug) {
      if (el.notice) el.notice.textContent = "Brak parametru ?t=... w URL";
      return;
    }
    const tid = await STORE.getTournamentId(slug);
    if (!tid) {
      if (el.notice) el.notice.textContent = "Turniej nie istnieje.";
      return;
    }
    let current = await STORE.fetchState(slug);
    renderAll(current.state || {});

    STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      renderAll(current.state || {});
    });
  }

  start().catch(e => {
    console.error("break start error", e);
    if (el.notice) el.notice.textContent = "Błąd ładowania danych.";
  });
})();
