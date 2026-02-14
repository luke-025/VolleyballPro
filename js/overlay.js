// js/overlay.js
(function () {
  const UI = window.VP_UI;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const slug = UI.getSlug();
  if (!slug) {
    document.getElementById("root").innerHTML = "<div class='overlayNotice'>Brak parametru ?t=...</div>";
    return;
  }

  let current = null;
  let unsub = null;

  const el = {
    aName: document.getElementById("aName"),
    bName: document.getElementById("bName"),
    aScore: document.getElementById("aScore"),
    bScore: document.getElementById("bScore"),
    sets: document.getElementById("sets"),
    setInfo: document.getElementById("setInfo"),
    badge: document.getElementById("badge"),
  };

  function render() {
    const st = current?.state;
    if (!st) return;
    const pmId = st.meta?.programMatchId;
    const pm0 = (st.matches||[]).find(m=>m.id===pmId);
    if (!pmId || !pm0) {
      el.badge.textContent = slug;
      el.aName.textContent = "BRAK";
      el.bName.textContent = "PROGRAMU";
      el.aScore.textContent = "—";
      el.bScore.textContent = "—";
      el.sets.textContent = "";
      el.setInfo.textContent = "";
      return;
    }
    const pm = ENG.emptyMatchPatch(pm0);
    const ta = (st.teams||[]).find(x=>x.id===pm.teamAId);
    const tb = (st.teams||[]).find(x=>x.id===pm.teamBId);
    const idx = ENG.currentSetIndex(pm);
    const s = pm.sets[idx];
    const sum = ENG.scoreSummary(pm);

    el.badge.textContent = UI.stageLabel(pm.stage) + (pm.stage==="group" && pm.group ? (" • Grupa "+pm.group) : "");
    el.aName.textContent = ta?.name || "Drużyna A";
    el.bName.textContent = tb?.name || "Drużyna B";
    el.aScore.textContent = s.a;
    el.bScore.textContent = s.b;
    el.sets.textContent = `${sum.setsA}:${sum.setsB}`;
    el.setInfo.textContent = `Set ${idx+1}/3`;
  }

  async function start() {
    const tid = await STORE.getTournamentId(slug);
    if (!tid) return;
    current = await STORE.fetchState(slug);
    render();
    if (unsub) unsub();
    unsub = STORE.subscribeState(slug, (snap)=>{ current = { tournamentId:snap.tournamentId, version:snap.version, state:snap.state }; render(); });
  }

  start().catch(console.error);
})();
