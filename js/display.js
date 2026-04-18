// js/display.js
// Public-facing display for the tournament monitor.
// - Reads tournament slug from ?t=slug
// - Subscribes to Supabase realtime state (same pattern as overlay.html)
// - Renders schedule (grouped by court) + standings, then auto-switches
//   the right pane to the playoff bracket when playoffs.generated === true.
// - Left-pane "schedule" switches to playoff-stage matches once generated.

(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;
  const E = window.VPEngine;

  // ---------- helpers (pure) -------------------------------------------------

  // Sort schedule rows: by explicit time if present, then by queue position,
  // then by stage order, then by team A id, so the order is deterministic.
  function stageRank(stage) {
    const order = {
      group: 0,
      quarterfinal: 10,
      semifinal: 20,
      thirdplace: 25,
      final: 30,
      place9: 40,
    };
    return order[stage] ?? 99;
  }

  function sortSchedule(matches, queueOrder) {
    const queueIdx = new Map();
    (queueOrder || []).forEach((q, i) => {
      if (q && q.matchId) queueIdx.set(q.matchId, i);
    });
    return matches.slice().sort((a, b) => {
      const ta = (a.scheduledAt || "").trim();
      const tb = (b.scheduledAt || "").trim();
      if (ta && tb && ta !== tb) return ta.localeCompare(tb);
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      const qa = queueIdx.has(a.id) ? queueIdx.get(a.id) : Infinity;
      const qb = queueIdx.has(b.id) ? queueIdx.get(b.id) : Infinity;
      if (qa !== qb) return qa - qb;
      const sr = stageRank(a.stage) - stageRank(b.stage);
      if (sr) return sr;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }

  function groupByCourt(matches) {
    const groups = new Map();
    for (const m of matches) {
      const key = (m.court || "").trim() || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    // Natural court sort: numeric first, then alpha.
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const na = Number(a), nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      if (Number.isFinite(na)) return -1;
      if (Number.isFinite(nb)) return 1;
      return a.localeCompare(b, "pl");
    });
  }

  function teamName(state, id) {
    if (!id) return "—";
    return (state.teams || []).find(t => t.id === id)?.name || "—";
  }

  function isPlayoffStage(stage) {
    return stage && stage !== "group";
  }

  // ---------- DOM render -----------------------------------------------------

  const els = {
    tName: document.getElementById("tName"),
    tSub: document.getElementById("tSub"),
    clock: document.getElementById("clock"),
    conn: document.getElementById("conn"),
    connLabel: document.getElementById("connLabel"),
    modeBadge: document.getElementById("modeBadge"),
    leftTitle: document.getElementById("leftTitle"),
    leftHint: document.getElementById("leftHint"),
    leftBody: document.getElementById("leftBody"),
    rightTitle: document.getElementById("rightTitle"),
    rightHint: document.getElementById("rightHint"),
    rightBody: document.getElementById("rightBody"),
  };

  function esc(s) { return UI.esc(s); }

  function renderClock() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    els.clock.textContent = `${hh}:${mm}`;
  }

  function renderConn(ok) {
    els.conn.classList.toggle("off", !ok);
    els.connLabel.textContent = ok ? "online" : "offline";
  }

  function renderMatchRow(state, m) {
    const sum = E.scoreSummary(m);
    const wA = m.winner === "a";
    const wB = m.winner === "b";
    const cls = (m.status === "live") ? "live" :
                (m.status === "confirmed") ? "confirmed" : "";
    const stat = {
      pending: "—",
      live: "LIVE",
      finished: "KONIEC",
      confirmed: "ZATW.",
    }[m.status] || m.status;

    const setsDetail = (m.sets || [])
      .filter(s => (+s.a||0) + (+s.b||0) > 0)
      .map(s => `${s.a}:${s.b}`)
      .join("  ");

    const timeHtml = m.scheduledAt
      ? `<div class="mtime">${esc(m.scheduledAt)}</div>`
      : `<div class="mtime none">—</div>`;

    const stageTxt = isPlayoffStage(m.stage) ? UI.stageLabel(m.stage) : "";

    return `
      <div class="mrow ${cls}">
        ${timeHtml}
        <div class="mteams">
          <div class="tname ${wA ? "winner" : (m.winner && !wA ? "loser" : "")}">${esc(teamName(state, m.teamAId))}</div>
          <div class="tname ${wB ? "winner" : (m.winner && !wB ? "loser" : "")}">${esc(teamName(state, m.teamBId))}</div>
          ${stageTxt ? `<div class="mstage">${esc(stageTxt)}${m.label ? " · " + esc(m.label) : ""}</div>` : ""}
        </div>
        <div class="mscore">
          <div class="setwins">${sum.setsA}:${sum.setsB}</div>
          ${setsDetail ? `<div class="setdetail">${esc(setsDetail)}</div>` : ""}
        </div>
        <div class="mstat ${m.status}">${esc(stat)}</div>
      </div>
    `;
  }

  function renderSchedule(state) {
    const isPlayoff = !!state?.playoffs?.generated;
    const all = (state.matches || []).filter(m =>
      isPlayoff ? isPlayoffStage(m.stage) : m.stage === "group"
    );
    if (all.length === 0) {
      els.leftBody.innerHTML = `<div class="empty"><b>Brak meczów</b>${isPlayoff ? "Drabinka pusta." : "Dodaj mecze w panelu Control."}</div>`;
      return;
    }
    const sorted = sortSchedule(all, state?.meta?.queue);
    const byCourt = groupByCourt(sorted);

    const liveId = state?.meta?.liveMatchId;
    els.leftBody.innerHTML = byCourt.map(([court, ms]) => `
      <div class="courtBlock">
        <div class="courtHdr">${court === "—" ? "Bez przypisanego boiska" : "Boisko " + esc(court)}</div>
        ${ms.map(m => renderMatchRow(state, { ...m, status: (m.id === liveId ? "live" : m.status) })).join("")}
      </div>
    `).join("");
  }

  function renderStandings(state) {
    const groups = E.computeStandings(state);
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pl"));
    const nonEmpty = keys.filter(k => groups[k].length > 0);
    if (nonEmpty.length === 0) {
      els.rightBody.innerHTML = `<div class="empty"><b>Brak danych</b>Tabela pojawi się po potwierdzeniu pierwszego meczu grupowego.</div>`;
      return;
    }
    els.rightBody.innerHTML = nonEmpty.map(k => {
      const rows = groups[k].map((r, i) => {
        const rankCls = i === 0 ? "r1" : i === 1 ? "r2" : "";
        const diff = r.setsWon - r.setsLost;
        const sign = diff > 0 ? "+" : "";
        return `
          <tr class="${rankCls}">
            <td class="rank">${i + 1}</td>
            <td class="l">${esc(r.name)}</td>
            <td>${r.played}</td>
            <td>${r.wins}</td>
            <td>${r.losses}</td>
            <td>${r.setsWon}:${r.setsLost} <span class="muted">(${sign}${diff})</span></td>
            <td class="pts">${r.tablePoints}</td>
          </tr>
        `;
      }).join("");
      return `
        <div class="group">
          <div class="groupTitle">Grupa ${esc(k || "?")}</div>
          <table class="stand">
            <thead>
              <tr>
                <th></th>
                <th class="l">Drużyna</th>
                <th>M</th>
                <th>W</th>
                <th>P</th>
                <th>Sety</th>
                <th>Pkt</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join("");
  }

  function bSide(state, match, side, winnerSide) {
    const id = side === "a" ? match.teamAId : match.teamBId;
    const sum = E.scoreSummary(match);
    const sc = side === "a" ? sum.setsA : sum.setsB;
    const hasScore = (sum.setsA + sum.setsB) > 0 || match.status === "live";
    const cls = (winnerSide === side) ? "winner" : (winnerSide ? "loser" : "");
    return `<div class="side ${cls}"><span class="nm">${esc(teamName(state, id))}</span><span class="sc">${hasScore ? sc : ""}</span></div>`;
  }

  function winnerSideOf(match) {
    if (match.winner === "a") return "a";
    if (match.winner === "b") return "b";
    return null;
  }

  function bracketMatchCard(state, match, label) {
    if (!match) return "";
    const w = winnerSideOf(match);
    const liveCls = match.status === "live" ? "live" : "";
    return `
      <div class="bmatch ${liveCls}">
        <div class="lbl">${esc(label || match.label || "")}</div>
        ${bSide(state, match, "a", w)}
        ${bSide(state, match, "b", w)}
      </div>
    `;
  }

  function renderBracket(state) {
    const br = state?.playoffs?.bracket;
    if (!br || !br.qf || br.qf.length === 0) {
      els.rightBody.innerHTML = `<div class="empty"><b>Drabinka niegotowa</b>Wygeneruj playoff w panelu Control.</div>`;
      return;
    }
    const byId = new Map((state.matches || []).map(m => [m.id, m]));
    const qf = br.qf.map(id => byId.get(id));
    const sf = (br.sf || []).map(id => byId.get(id));
    const fin = br.final ? byId.get(br.final) : null;
    const third = br.third ? byId.get(br.third) : null;
    const p9 = (br.place9 || []).map(id => byId.get(id));

    const col = (title, cards) => `
      <div class="bcol">
        <h3>${esc(title)}</h3>
        ${cards.join("")}
      </div>
    `;

    els.rightBody.innerHTML = `
      <div class="bracket">
        ${col("Ćwierćfinały", qf.map((m, i) => bracketMatchCard(state, m, `QF${i + 1}`)))}
        ${col("Półfinały", sf.map((m, i) => bracketMatchCard(state, m, `SF${i + 1}`)))}
        ${col("Finał / 3. miejsce", [
          bracketMatchCard(state, fin, "Finał"),
          bracketMatchCard(state, third, "Mecz o 3. miejsce"),
        ])}
        ${col("Miejsca 9–12", p9.map((m, i) => bracketMatchCard(state, m, `9–12 / ${i + 1}`)))}
      </div>
      ${p9.length === 0 ? "" : ""}
    `;
  }

  function renderHeader(state) {
    els.tName.textContent = state?.meta?.name || UI.getSlug() || "Turniej";
    const slug = UI.getSlug();
    els.tSub.textContent = slug ? `t=${slug}` : "VolleyballPro • Display";

    const isPlayoff = !!state?.playoffs?.generated;
    els.modeBadge.classList.toggle("playoff", isPlayoff);
    els.modeBadge.textContent = isPlayoff ? "Play-off" : "Faza grupowa";

    els.leftTitle.textContent = isPlayoff ? "Terminarz play-off" : "Terminarz";
    els.rightTitle.textContent = isPlayoff ? "Drabinka" : "Tabela";

    const liveCount = (state.matches || []).filter(m => m.status === "live").length;
    els.leftHint.textContent = liveCount > 0 ? `• ${liveCount} LIVE` : "";
  }

  function render(state) {
    renderHeader(state);
    renderSchedule(state);
    if (state?.playoffs?.generated) {
      renderBracket(state);
    } else {
      renderStandings(state);
    }
  }

  // ---------- bootstrap ------------------------------------------------------

  async function boot() {
    const slug = UI.getSlug();
    if (!slug) {
      els.leftBody.innerHTML = `<div class="empty"><b>Brak parametru ?t=slug</b>Podaj nazwę turnieju w URL, np. ?t=liga-2026</div>`;
      els.rightBody.innerHTML = "";
      renderConn(false);
      return;
    }

    renderClock();
    setInterval(renderClock, 15 * 1000);

    try {
      const snap = await STORE.fetchState(slug);
      if (!snap) {
        els.leftBody.innerHTML = `<div class="empty"><b>Turniej nie istnieje</b>Sprawdź slug: <code>${esc(slug)}</code></div>`;
        els.rightBody.innerHTML = "";
        renderConn(false);
        return;
      }
      renderConn(true);
      render(snap.state || {});
    } catch (e) {
      renderConn(false);
      els.leftBody.innerHTML = `<div class="empty"><b>Błąd połączenia</b>${esc(UI.fmtError(e))}</div>`;
      els.rightBody.innerHTML = "";
    }

    // Realtime subscription (also re-fetches on reconnect).
    try {
      STORE.subscribeState(slug, (snap) => {
        renderConn(true);
        render(snap.state || {});
      });
    } catch (e) {
      renderConn(false);
    }

    // Lightweight connection watchdog: if we haven't seen an update for 60s
    // while the page is visible, pull a fresh snapshot.
    setInterval(async () => {
      try {
        const s = await STORE.fetchState(slug);
        if (s) { renderConn(true); render(s.state || {}); }
      } catch {
        renderConn(false);
      }
    }, 60 * 1000);
  }

  // Expose a couple of pure helpers for tests.
  window.VPDisplay = {
    sortSchedule,
    groupByCourt,
    stageRank,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
