// js/break.js
// OBS "Break" screen: group tables + last/next matches + program match.
// Public (no PIN). Reads vp_tournament_state via Supabase and renders full-screen.

(function () {
  const U =   function enforceScene(state){
    const scene = (state?.meta?.scene) || "game";
    if(scene === "break") return;
    const t = encodeURIComponent(slug);
    const target = ({
      game: `/overlay.html?t=${t}`,
      technical: `/technical.html?t=${t}`,
      sponsors: `/sponsors.html?t=${t}`,
      playoffs: `/playoffs.html?t=${t}`,
    })[scene];
    if(target){
      location.replace(target);
    }
  }

window.VP_UTIL;
  const E = window.VPEngine;
  const S = window.VPState;

  const slug = U.qs("t") || "";
  const $ = (id) => document.getElementById(id);

  function safeText(el, txt) { if (el) el.textContent = txt || ""; }

  function fmtStage(stage) {
    return U.stageLabels[stage] || stage || "";
  }

  function setsLine(match) {
    const m = E.emptyMatchPatch(match);
    const sum = E.scoreSummary(m);
    const setScores = [];
    for (let i = 0; i < 3; i++) {
      const s = m.sets[i];
      if ((+s.a || 0) === 0 && (+s.b || 0) === 0) continue;
      setScores.push(`${s.a}:${s.b}`);
    }
    const sets = `${sum.setsA}:${sum.setsB}`;
    return { sets, setScores: setScores.join(", ") };
  }

  function teamName(state, id) {
    const t = (state.teams || []).find(x => x.id === id);
    return t ? t.name : "—";
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

    const groups = E.computeStandings(state);
    const keys = Object.keys(groups).filter(k => (k || "").trim() !== "").sort((a,b)=>a.localeCompare(b,"pl"));

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
              <th>#</th>
              <th>Drużyna</th>
              <th>M</th>
              <th>W</th>
              <th>P</th>
              <th>Sety</th>
              <th>Małe</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;
      const tb = card.querySelector("tbody");
      arr.forEach((s, idx) => {
        const tr = document.createElement("tr");
        const sets = `${s.setsWon}:${s.setsLost}`;
        const pts = `${s.pointsWon}:${s.pointsLost}`;
        tr.innerHTML = `
          <td class="muted">${idx+1}</td>
          <td><span class="breakTeam">${s.name}</span></td>
          <td>${s.played}</td>
          <td>${s.wins}</td>
          <td><b>${s.tablePoints}</b></td>
          <td class="muted">${sets}</td>
          <td class="muted">${pts}</td>
        `;
        tb.appendChild(tr);
      });

      host.appendChild(card);
    }
  }

  function renderLastNext(state) {
    const matches = (state.matches || []).map(m => E.emptyMatchPatch(m));

    const finished = matches
      .filter(m => m.status === "confirmed" || m.status === "finished")
      .sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0)); // may be undefined, ok

    const pending = matches
      .filter(m => m.status === "pending" || m.status === "live")
      .sort((a,b) => {
        const sa = (a.stage||"").localeCompare(b.stage||"", "pl");
        if (sa !== 0) return sa;
        const ga = (a.group||"").localeCompare(b.group||"", "pl");
        if (ga !== 0) return ga;
        return (a.createdAt||"").localeCompare(b.createdAt||"");
      });

    const lastHost = $("breakLast");
    const nextHost = $("breakNext");

    if (lastHost) {
      lastHost.innerHTML = "";
      const list = finished.slice(0,6);
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
      const list = pending.slice(0,8);
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
              <div class="breakItemSub muted">${(m.court && m.court!=="") ? ("Boisko: " + m.court) : ""}</div>
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
    const mm = E.emptyMatchPatch(m);
    const a = teamName(state, mm.teamAId);
    const b = teamName(state, mm.teamBId);
    const sum = E.scoreSummary(mm);
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

  async function init() {
    safeText($("btSlug"), slug ? `t=${slug}` : "");
    tickClock();
    setInterval(tickClock, 1000);

    if (!slug) {
      const n = $("breakNotice");
      if (n) {
        n.style.display = "block";
        n.textContent = "Brak parametru turnieju w linku. Dodaj ?t=nazwa-turnieju";
      }
      return;
    }

    const row = await S.fetchState(slug);
    if (!row) {
      const n = $("breakNotice");
      if (n) {
        n.style.display = "block";
        n.textContent = `Turniej "${slug}" nie istnieje.`;
      }
      return;
    }

    // initial render
    const state = row.state || {};
    safeText($("btName"), state?.tournament?.name || state?.meta?.name || "VolleyballPro");
    renderTables(state);
    renderLastNext(state);
    renderProgram(state);

    // subscribe realtime
    S.subscribeState(slug, (payload) => {
      const st = payload.state || {};
      safeText($("btName"), st?.tournament?.name || st?.meta?.name || "VolleyballPro");
      renderTables(st);
      renderLastNext(st);
      renderProgram(st);
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();
