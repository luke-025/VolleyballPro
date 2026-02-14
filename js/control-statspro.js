// js/control-statspro.js
// PRO stats in Control without touching main control.js
// - Max lead (from events)
// - Streaks (best + current)
// - Set timeline (last 10 points) with two rows A/B and team names
(function(){
  const UI = window.VP_UI;
  const STORE = window.VPState;
  const ENG = window.VPEngine;

  if (!UI || !STORE || !ENG) {
    console.warn("[control-statspro] Missing VP_UI / VPState / VPEngine");
    return;
  }

  const slug = UI.getSlug();
  if (!slug) return;

  // Inject minimal CSS
  if (!document.getElementById("vbProStatsStyle")) {
    const st = document.createElement("style");
    st.id = "vbProStatsStyle";
    st.textContent = `
      .vbProStats { margin-top:6px; font-size:12px; color: var(--muted); line-height:1.2; }
      .vbTimeline { margin-top:6px; border-top:1px solid rgba(255,255,255,.10); padding-top:6px; }
      .vbTlRow { display:grid; grid-template-columns: 160px repeat(10, 18px); gap:6px; align-items:center; }
      .vbTlName { font-weight:700; color: var(--text); opacity:.9; }
      .vbDot { width:18px; text-align:center; opacity:.95; }
      .vbDot.empty { opacity:.08; }
    `;
    document.head.appendChild(st);
  }

  function teamName(state, id) {
    const t = (state.teams||[]).find(x => x.id === id);
    return t ? t.name : "—";
  }

  function chooseTimelineSetIndex(match) {
    // if live/pending: current set. if finished/confirmed: last played set
    if (match.status === "live" || match.status === "pending") return ENG.currentSetIndex(match);
    if (ENG.lastPlayedSetIndex) return ENG.lastPlayedSetIndex(match);
    return ENG.currentSetIndex(match);
  }

  function renderTimeline(state, match) {
    const setIdx = chooseTimelineSetIndex(match);
    const seq = ENG.computeLastPointsTimeline ? ENG.computeLastPointsTimeline(match, setIdx, 10) : [];
    // pad to length 10 (oldest -> newest), keep alignment
    const padded = Array(10 - seq.length).fill(null).concat(seq);

    const aName = teamName(state, match.teamAId).toUpperCase();
    const bName = teamName(state, match.teamBId).toUpperCase();

        const dotsA = padded.map(s => s === "a" ? `<span class="vbDot">🔵</span>` : `<span class="vbDot empty">&nbsp;</span>`).join("");
    const dotsB = padded.map(s => s === "b" ? `<span class="vbDot">🔵</span>` : `<span class="vbDot empty">&nbsp;</span>`).join("");

    return `
      <div class="vbTimeline">
        <div class="vbTlRow"><div class="vbTlName">${aName} |</div>${dotsA}</div>
        <div class="vbTlRow"><div class="vbTlName">${bName} |</div>${dotsB}</div>
      </div>
    `;
  }

  function formatSide(side){ return side === "a" ? "A" : (side === "b" ? "B" : "—"); }

  function augment(state){
    const list = document.getElementById("matchesList");
    if (!list) return;

    const rows = list.querySelectorAll(".matchRow");
    for (const row of rows) {
      const btn = row.querySelector("[data-program]");
      if (!btn) continue;
      const matchId = btn.getAttribute("data-program");
      const m0 = (state.matches||[]).find(x => x.id === matchId);
      if (!m0) continue;

      const m = ENG.emptyMatchPatch ? ENG.emptyMatchPatch(m0) : m0;

      const streak = ENG.computeStreaks ? ENG.computeStreaks(m) : null;
      const lead = ENG.computeMaxLead ? ENG.computeMaxLead(m) : null;

      const statsLineParts = [];
      if (streak) {
        statsLineParts.push(`max seria: A <b>${streak.bestA}</b> • B <b>${streak.bestB}</b>`);
        if (streak.currentSide && (streak.currentLen||0) >= 3) {
          statsLineParts.push(`teraz: <b>${formatSide(streak.currentSide)} ${streak.currentLen}</b>`);
        }
      }
      if (lead && lead.value) {
        const who = lead.side === "a" ? teamName(state, m.teamAId) : teamName(state, m.teamBId);
        statsLineParts.push(`najw. przewaga: <b>${who} +${lead.value}</b>`);
      }

      const host = row.querySelector(".grow");
      if (!host) continue;

      let box = row.querySelector(".vbProStats");
      if (!box) {
        box = document.createElement("div");
        box.className = "vbProStats";
        host.appendChild(box);
      }

      const timelineHtml = renderTimeline(state, m);

      box.innerHTML = `
        ${statsLineParts.length ? `<div>${statsLineParts.join(" • ")}</div>` : `<div class="muted">Brak danych statystyk (log punktów zacznie się od teraz).</div>`}
        ${timelineHtml}
      `;
    }
  }

  // initial + realtime
  STORE.fetchState(slug).then(snap => {
    if (snap && snap.state) augment(snap.state);
  }).catch(()=>{});

  STORE.subscribeState(slug, (snap) => {
    // control.js re-renders rows, so delay augment to next tick
    setTimeout(() => augment(snap.state), 0);
  });

})();
