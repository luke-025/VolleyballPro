// js/playoffs.js
(function () {
  const UI = window.VP_UTIL;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const slug = UI.qs("t")?.trim();
  const els = {
    slug: document.getElementById("slug"),
    info: document.getElementById("info"),
    bracket: document.getElementById("bracket"),
    back: document.getElementById("back"),
  };

  if (!slug) {
    document.body.innerHTML = '<div class="container"><div class="card"><h2>Brak parametru turnieju</h2><p>Dodaj do linku <code>?t=twoj-turniej</code></p></div></div>';
    return;
  }
  els.slug.textContent = slug;
  els.back.href = `/control.html?t=${encodeURIComponent(slug)}`;

  let current = null;
  let unsub = null;

  function teamNameById(state, id) {
    if (!id) return '<span class="muted">TBD</span>';
    const t = (state.teams || []).find(x => x.id === id);
    return t ? t.name : "—";
  }

  function matchCard(state, m0) {
    const m = ENG.emptyMatchPatch(m0);
    const a = teamNameById(state, m.teamAId);
    const b = teamNameById(state, m.teamBId);
    const sum = ENG.scoreSummary(m);
    const setLine = `${sum.setsA}:${sum.setsB}`;
    const pts = (m.sets || []).map((s, i) => {
      const min = (i === 2 ? 15 : 25);
      const done = (Math.abs((+s.a || 0) - (+s.b || 0)) >= 2) && ((+s.a || 0) >= min || (+s.b || 0) >= min);
      return done ? `${s.a}:${s.b}` : null;
    }).filter(Boolean).join(", ");
    const status = m.status || "pending";
    const badge = status === "confirmed" ? "🟢" : status === "finished" ? "🟠" : status === "live" ? "🔵" : "🟡";
    const label = m.label ? `<div class="muted small">${m.label}</div>` : "";
    return `
      <div class="card inner">
        <div class="row" style="border-top:none; padding-top:0">
          <div class="grow">
            <div><b>${a}</b> <span class="muted">vs</span> <b>${b}</b></div>
            ${label}
            <div class="muted small">Status: ${badge} ${status}</div>
          </div>
          <div class="right">
            <div class="scoreMono">${setLine}</div>
            <div class="muted small">${pts || "&nbsp;"}</div>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    if (!current) return;
    const state = current.state || {};
    const po = state.playoffs;
    if (!po?.generated) {
      els.info.textContent = "Playoff nie został jeszcze wygenerowany.";
      els.bracket.innerHTML = "";
      return;
    }
    const gAt = po.generatedAt ? new Date(po.generatedAt).toLocaleString("pl") : "—";
    els.info.textContent = `Wygenerowano: ${gAt}`;

    const byId = new Map((state.matches || []).map(m => [m.id, m]));
    const br = po.bracket || {};

    function col(title, ids, note) {
      const items = (ids || []).map(id => {
        const m = byId.get(id);
        return m
          ? matchCard(state, m)
          : `<div class="card inner"><div class="muted">Brak meczu</div></div>`;
      }).join("");
      const noteHtml = note ? `<div class="muted small" style="margin-bottom:8px">${note}</div>` : "";
      return `<div class="card"><h3>${title}</h3>${noteHtml}${items}</div>`;
    }

    const cols = [];

    // Ćwierćfinały
    if ((br.qf || []).length) {
      cols.push(col("Ćwierćfinały", br.qf));
    }

    // Półfinały
    if ((br.sf || []).length) {
      cols.push(col("Półfinały", br.sf));
    }

    // Finał + mecz o 3. miejsce obok siebie
    const finalsRow = [];
    if (br.final) finalsRow.push(col("Finał", [br.final]));
    if (br.third) finalsRow.push(col("Mecz o 3. miejsce", [br.third]));
    if (finalsRow.length) {
      cols.push(`<div class="grid" style="grid-template-columns: repeat(${finalsRow.length}, 1fr); gap:12px">${finalsRow.join("")}</div>`);
    }

    // Miejsca 9–12
    if ((br.place9 || []).length) {
      cols.push(col(
        "Miejsca 9–12",
        br.place9,
        "Zwycięzcy zdobywają miejsca 9–10, przegrani miejsca 11–12"
      ));
    }

    els.bracket.innerHTML = cols.join("");
  }

  async function init() {
    current = await STORE.fetchState(slug);
    render();
    unsub = STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      render();
    });
  }

  init().catch(e => {
    console.error(e);
    document.getElementById("info").textContent = "Błąd: " + (e.message || e);
  });
})();
