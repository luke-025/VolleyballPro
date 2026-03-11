// js/break.js – Break screen renderer (standalone)
(function () {
  const UI   = window.VP_UI;
  const ENG  = window.VPEngine;
  const STORE = window.VPState;

  const { esc } = UI;

  const slug = UI.getSlug();
  const $    = (id) => document.getElementById(id);

  const el = {
    btName:  $("btName"),
    btClock: $("btClock"),
    tables:  $("breakTables"),
    last:    $("breakLast"),
    next:    $("breakNext"),
    hero:    $("breakProgram"),
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
    const GROUPS = ["A", "B", "C", "D"];

    el.tables.innerHTML = GROUPS.map(g => {
      const rows = (groups[g] || []).map((r, i) => `
        <tr>
          <td class="pos">${i + 1}</td>
          <td class="name">${esc(r.name)}</td>
          <td>${r.played}</td>
          <td>${r.wins}</td>
          <td>${r.losses}</td>
          <td>${r.tablePoints}</td>
          <td>${r.setsWon}:${r.setsLost}</td>
          <td>${r.pointsWon}:${r.pointsLost}</td>
        </tr>`).join("");

      const body = rows || `<tr><td colspan="8" class="brkTableEmpty">Brak danych</td></tr>`;

      return `
        <div class="brkGroup">
          <div class="brkGroupTitle">Grupa ${g}</div>
          <table class="brkTable">
            <thead>
              <tr>
                <th>#</th><th class="name">Drużyna</th>
                <th>M</th><th>W</th><th>P</th><th>PKT</th><th>Sety</th><th>Małe</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>`;
    }).join("");
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

  function renderHero(st) {
    if (!el.hero) return;
    const matchId = st.meta?.breakNextMatchId;
    const next = matchId
      ? (st.matches || []).find(m => m.id === matchId)
      : (st.matches || []).find(m => m.status === "pending");
    if (!next) { el.hero.innerHTML = ""; return; }
    const ta = teamName(st, next.teamAId);
    const tb = teamName(st, next.teamBId);
    const court = next.court ? `<div class="brkHeroCourt">Boisko ${esc(String(next.court))}</div>` : "";
    el.hero.innerHTML = `
      <div class="brkProgramBox">
        <div class="brkHeroLabel">NASTĘPNY MECZ</div>
        <div class="brkHeroBody">
          <div class="brkHeroTeam">${esc(ta)}</div>
          <div class="brkHeroCenter">
            <div class="brkHeroVs">VS</div>
            ${court}
          </div>
          <div class="brkHeroTeam brkHeroTeamRight">${esc(tb)}</div>
        </div>
      </div>`;
  }

  function renderAll(st) {
    if (el.btName)  el.btName.textContent  = String(st.meta?.name || "VolleyballPro");
    if (el.btClock) el.btClock.textContent = fmtTime(new Date());
    renderTables(st);
    renderLast(st);
    renderNext(st);
    renderHero(st);
  }

  async function start() {
    const _clockId = setInterval(() => { if (el.btClock) el.btClock.textContent = fmtTime(new Date()); }, 1000);

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

    const unsub = STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      renderAll(current.state || {});
    });

    // ── POLLING FALLBACK ──────────────────────────────────────────────────────
    // OBS browser source i laptopy zrywają WebSocket przy uśpieniu / zmianie sieci.
    // Co 5s sprawdzamy wersję stanu – jeśli nowsza, odświeżamy UI.
    let _polling = false;
    const _pollId = setInterval(async () => {
      if (_polling) return;
      _polling = true;
      try {
        const fresh = await STORE.fetchState(slug);
        if (fresh && fresh.version != null && fresh.version !== current?.version) {
          current = fresh;
          renderAll(current.state || {});
        }
      } catch (_e) { /* ignoruj – WebSocket może nadal działać */ }
      finally { _polling = false; }
    }, 5000);
    // ─────────────────────────────────────────────────────────────────────────

    window.addEventListener("beforeunload", () => {
      if (unsub) unsub();
      clearInterval(_clockId);
      clearInterval(_pollId);
    });
  }

  start().catch(e => {
    console.error("break start error", e);
    if (el.notice) el.notice.textContent = "Błąd ładowania danych.";
  });
})();
