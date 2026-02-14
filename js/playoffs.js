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
    const t = (state.teams||[]).find(x => x.id === id);
    return t ? t.name : "—";
  }

  function matchCard(state, m0) {
    const m = ENG.emptyMatchPatch(m0);
    const a = teamNameById(state, m.teamAId);
    const b = teamNameById(state, m.teamBId);
    const sum = ENG.scoreSummary(m);
    const setLine = `${sum.setsA}:${sum.setsB}`;
    const pts = (m.sets||[]).map((s,i)=>{
      const min = (i===2?15:25);
      const done = (Math.abs((+s.a||0)-(+s.b||0))>=2) && ((+s.a||0)>=min || (+s.b||0)>=min);
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

    const byId = new Map((state.matches||[]).map(m => [m.id, m]));
    const br = po.bracket || {};
    const cols = [];

    function col(title, ids) {
      const items = (ids||[]).map(id => {
        const m = byId.get(id);
        return m ? matchCard(state, m) : `<div class="card inner"><div class="muted">Brak meczu</div></div>`;
      }).join("");
      return `<div class="card"><h3>${title}</h3>${items}</div>`;
    }

    if ((br.qf||[]).length) cols.push(col("Ćwierćfinały", br.qf));
    if ((br.sf||[]).length) cols.push(col("Półfinały", br.sf));
    if (br.final) cols.push(col("Finał", [br.final]));
    if (br.third) cols.push(col("Mecz o 3 miejsce", [br.third]));

    els.bracket.innerHTML = cols.join("");
  }

  async function init() {
    current = await STORE.fetchState(slug);
    render();
    unsub = STORE.subscribeState(slug, (snap) => { current = snap; render(); });
  }

  init().catch(e => {
    console.error(e);
    document.getElementById("info").textContent = "Błąd: " + (e.message||e);
  });
})();
