// js/break.js — Break screen renderer (standalone)
// Renders: group tables, last results, next matches, program match.
// Requires: config.js, supabase.js, util.js, engine.js, state.js

(function () {
  const UI = window.VP_UI;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const slug = UI.getSlug();
  const $ = (id) => document.getElementById(id);

  const el = {
    btName: $("btName"),
    btSlug: $("btSlug"),
    btClock: $("btClock"),
    tables: $("breakTables"),
    last: $("breakLast"),
    next: $("breakNext"),
    program: $("breakProgram"),
    notice: $("breakNotice"),
  };

  function fmtTime(d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function teamName(state, id) {
    const t = (state.teams || []).find((x) => x.id === id);
    return t ? t.name : "—";
  }

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
            <td class="pos">${i + 1}</td>
            <td class="name">${UI.esc(r.name)}</td>
            <td>${r.played}</td>
            <td>${r.wins}</td>
            <td>${r.losses}</td>
            <td>${r.tablePoints}</td>
            <td>${r.setsWon}:${r.setsLost}</td>
            <td>${r.pointsWon}:${r.pointsLost}</td>
          </tr>`
          )
          .join("");

        return `
        <div class="breakGroup">
          <div class="breakGroupTitle">GRUPA ${UI.esc(String(g).toUpperCase())}</div>
          <table class="breakTable">
            <thead>
              <tr>
                <th>#</th><th>Drużyna</th><th>M</th><th>W</th><th>P</th><th>PKT</th><th>Sety</th><th>Punkty</th>
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
    const confirmed = (st.matches || []).filter((m) => m.status === "confirmed");
    confirmed.sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0) || 0;
      const tb = Date.parse(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0) || 0;
      return tb - ta;
    });

    const items = confirmed.slice(0, 4).map((m) => {
      const s = matchScoreNow(m);
      return `<div class="breakItem"><span>${UI.esc(matchLabel(st, m))}</span><b>${s.setsA}:${s.setsB}</b></div>`;
    });

    el.last.innerHTML = items.join("") || `<div class="muted">Brak zakończonych meczów.</div>`;
  }

  function renderNext(st) {
    if (!el.next) return;
    const pending = (st.matches || []).filter((m) => m.status === "pending");
    const items = pending.slice(0, 4).map((m) => {
      return `<div class="breakItem"><span>${UI.esc(matchLabel(st, m))}</span><b>—</b></div>`;
    });
    el.next.innerHTML = items.join("") || `<div class="muted">Brak zaplanowanych meczów.</div>`;
  }

  function renderProgram(st) {
    if (!el.program) return;
    const pid = st.meta?.programMatchId;
    const m = (st.matches || []).find((x) => x.id === pid);
    if (!m) {
      el.program.innerHTML = `<div class="muted">Nie wybrano meczu na transmisję.</div>`;
      return;
    }
    const s = matchScoreNow(m);
    el.program.innerHTML = `<div class="breakItem"><span>${UI.esc(matchLabel(st, m))}</span><b>${s.setsA}:${s.setsB} • ${s.a}:${s.b}</b></div>`;
  }

  function renderAll(st) {
    if (el.btName) el.btName.textContent = String(st.meta?.name || "VolleyballPro");
    if (el.btSlug) el.btSlug.textContent = String(slug || "");
    if (el.btClock) el.btClock.textContent = fmtTime(new Date());
    renderTables(st);
    renderLast(st);
    renderNext(st);
    renderProgram(st);
  }

  async function start() {
    // always tick clock
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

  start().catch((e) => {
    console.error("break start error", e);
    if (el.notice) el.notice.textContent = "Błąd ładowania danych.";
  });
})();
