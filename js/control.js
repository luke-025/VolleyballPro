// js/control.js
(function () {
  const UI = window.VP_UI;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const slug = UI.getSlug();

  if (!slug) {
    document.body.innerHTML = "<div class='container'><div class='card'><h2>Brak parametru turnieju</h2><p>Dodaj do linku <code>?t=twoj-turniej</code></p></div></div>";
    return;
  }

  let current = null;
  let unsub = null;

  const els = {
    titleSlug:          document.getElementById("slug"),
    status:             document.getElementById("status"),
    btnSetPin:          document.getElementById("btnSetPin"),
    btnCreate:          document.getElementById("btnCreate"),
    inpPin:             document.getElementById("inpPin"),
    inpName:            document.getElementById("inpName"),
    btnChangePin:       document.getElementById("btnChangePin"),
    inpOldPin:          document.getElementById("inpOldPin"),
    inpNewPin:          document.getElementById("inpNewPin"),
    teamName:           document.getElementById("teamName"),
    teamGroup:          document.getElementById("teamGroup"),
    btnAddTeam:         document.getElementById("btnAddTeam"),
    teamsList:          document.getElementById("teamsList"),
    matchStage:         document.getElementById("matchStage"),
    matchGroup:         document.getElementById("matchGroup"),
    matchTeamA:         document.getElementById("matchTeamA"),
    matchTeamB:         document.getElementById("matchTeamB"),
    matchCourt:         document.getElementById("matchCourt"),
    btnAddMatch:        document.getElementById("btnAddMatch"),
    btnGeneratePlayoffs:document.getElementById("btnGeneratePlayoffs"),
    btnOpenPlayoffs:    document.getElementById("btnOpenPlayoffs"),
    playoffsInfo:       document.getElementById("playoffsInfo"),
    matchesList:        document.getElementById("matchesList"),
    programBox:         document.getElementById("programBox"),
    standingsBox:       document.getElementById("standingsBox"),
  };

  // ── Helpers ──────────────────────────────────────────────
  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getQueue(meta) {
    const q = meta?.queue;
    return Array.isArray(q) ? q : [];
  }

  function sceneLabel(key) {
    return ({ game:"Game", break:"Przerwa", technical:"Technical", sponsors:"Sponsorzy" }[key] || key);
  }

  function requirePin() {
    const pin = STORE.getPin(slug);
    if (!pin) { UI.toast("Wpisz PIN turnieju", "warn"); return null; }
    return pin;
  }

  function formatSetPreview(m) {
    const mm = ENG.emptyMatchPatch(m);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const s = mm.sets[i];
      if (+s.a || +s.b) parts.push(`${s.a}:${s.b}`);
    }
    return parts.join(", ");
  }

  // ── Filter state ─────────────────────────────────────────
  const filterState = { q: "", status: "all", stage: "all", group: "all", court: "all" };

  // bind filter inputs (they exist in HTML now)
  function bindFilters() {
    const opQ     = document.getElementById("opQ");
    const opSt    = document.getElementById("opStatus");
    const opStage = document.getElementById("opStage");
    const opCourt = document.getElementById("opCourt");
    const opGroup = document.getElementById("opGroup");
    if (opQ && !opQ._vpBound) {
      opQ._vpBound = true;
      opQ.addEventListener("input",    () => { filterState.q      = opQ.value.trim(); render(); });
      opSt.addEventListener("change",  () => { filterState.status = opSt.value;        render(); });
      opStage.addEventListener("change",() => { filterState.stage  = opStage.value;    render(); });
      opCourt.addEventListener("change",() => { filterState.court  = opCourt.value;    render(); });
      opGroup.addEventListener("change",() => { filterState.group  = opGroup.value;    render(); });
    }
  }

  function updateFilterOptions(state) {
    const opCourt = document.getElementById("opCourt");
    const opGroup = document.getElementById("opGroup");
    if (!opCourt || !opGroup) return;

    const courts = Array.from(new Set((state.matches||[]).map(m => String(m.court||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"pl"));
    const prevC = opCourt.value;
    opCourt.innerHTML = '<option value="all">Wszystkie</option>' + courts.map(c=>`<option value="${c}">Boisko ${c}</option>`).join('');
    if (courts.includes(prevC)) opCourt.value = prevC;

    const groups = Array.from(new Set([
      ...(state.teams||[]).map(t=>(t.group||"").trim()),
      ...(state.matches||[]).filter(m=>m.stage==="group").map(m=>(m.group||"").trim())
    ].filter(Boolean))).sort((a,b)=>a.localeCompare(b,"pl"));
    const prevG = opGroup.value;
    opGroup.innerHTML = '<option value="all">Wszystkie</option>' + groups.map(g=>`<option value="${g}">Grupa ${g}</option>`).join('');
    if (groups.includes(prevG)) opGroup.value = prevG;
  }

  // ── Scene buttons (in Transmisja tab) ────────────────────
  function bindSceneBtns() {
    document.querySelectorAll(".sceneBtn").forEach(btn => {
      if (btn._vpBound) return;
      btn._vpBound = true;
      btn.addEventListener("click", async () => {
        const scene = btn.dataset.scene;
        const pin = requirePin(); if (!pin) return;
        try {
          await STORE.mutate(slug, pin, (st) => {
            st.meta = st.meta || {};
            st.meta.scene = scene;
            return st;
          });
          UI.toast("Scena: " + sceneLabel(scene), "success");
        } catch (e) {
          UI.toast(e?.message || "Błąd zmiany sceny", "error");
        }
      });
    });
  }

  function renderSceneBtns(state) {
    const scene = state?.meta?.scene || "game";
    document.querySelectorAll(".sceneBtn").forEach(btn => {
      btn.classList.toggle("sceneActive", btn.dataset.scene === scene);
    });
  }

  // ── Lock / Export ─────────────────────────────────────────
  function bindToolBtns() {
    const btnLock = document.getElementById("btnLockToggle");
    const btnExport = document.getElementById("btnExportState");
    if (btnLock && !btnLock._vpBound) {
      btnLock._vpBound = true;
      btnLock.addEventListener("click", async () => {
        const pin = requirePin(); if (!pin) return;
        try {
          const locked = !!current?.state?.meta?.locked;
          await STORE.mutate(slug, pin, (st) => {
            st.meta = st.meta || {};
            st.meta.locked = !locked;
            return st;
          });
        } catch (e) { UI.toast(e?.message || "Błąd blokady", "error"); }
      });
    }
    if (btnExport && !btnExport._vpBound) {
      btnExport._vpBound = true;
      btnExport.addEventListener("click", () => {
        const st = current?.state || {};
        const name = `tournament_${slug}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`;
        downloadJson(name, st);
        UI.toast("Zapisano export JSON", "success");
      });
    }
  }

  function renderLockBtn(state) {
    const btnLock = document.getElementById("btnLockToggle");
    if (btnLock) btnLock.textContent = state?.meta?.locked ? "BLOKADA: ON 🔒" : "BLOKADA: OFF";
  }

  // ── Queue ─────────────────────────────────────────────────
  function bindQueueBtns() {
    const qAdd  = document.getElementById("qAdd");
    const qList = document.getElementById("qList");
    if (qAdd && !qAdd._vpBound) {
      qAdd._vpBound = true;
      qAdd.addEventListener("click", async () => {
        const court   = (document.getElementById("qCourt")?.value || "").trim();
        const matchId = (document.getElementById("qMatch")?.value || "").trim();
        if (!court || !matchId) { UI.toast("Wybierz boisko i mecz", "warn"); return; }
        const pin = requirePin(); if (!pin) return;
        try {
          const q = getQueue(current?.state?.meta);
          if (q.some(x => x.matchId === matchId && String(x.court||"") === court)) {
            UI.toast("Ten mecz już jest w kolejce", "info"); return;
          }
          await STORE.mutate(slug, pin, (st) => {
            st.meta = st.meta || {};
            const qq = Array.isArray(st.meta.queue) ? st.meta.queue : [];
            qq.push({ court, matchId });
            st.meta.queue = qq;
            return st;
          });
          UI.toast("Dodano do kolejki", "success");
        } catch (e) { UI.toast(e?.message || "Błąd kolejki", "error"); }
      });
    }
    if (qList && !qList._vpBound) {
      qList._vpBound = true;
      qList.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("button[data-qact]");
        if (!btn) return;
        const act = btn.getAttribute("data-qact");
        const idx = Number(btn.getAttribute("data-idx"));
        const pin = requirePin(); if (!pin) return;
        const q = getQueue(current?.state?.meta);
        if (!q[idx]) return;
        try {
          if (act === "del") {
            const newQ = q.filter((_,i) => i !== idx);
            await STORE.mutate(slug, pin, (st) => { st.meta=st.meta||{}; st.meta.queue=newQ; return st; });
          } else if (act === "up" && idx > 0) {
            const newQ = [...q];
            [newQ[idx-1], newQ[idx]] = [newQ[idx], newQ[idx-1]];
            await STORE.mutate(slug, pin, (st) => { st.meta=st.meta||{}; st.meta.queue=newQ; return st; });
          }
        } catch (e) { UI.toast(e?.message || "Błąd kolejki", "error"); }
      });
    }
  }

  function renderQueue(state) {
    const qList  = document.getElementById("qList");
    const qCourt = document.getElementById("qCourt");
    const qMatch = document.getElementById("qMatch");
    if (!qList) return;

    const q       = getQueue(state?.meta);
    const teams   = state?.teams   || [];
    const matches = state?.matches || [];

    if (qCourt) {
      const courts = Array.from(new Set(matches.map(m=>String(m.court||"").trim()).filter(Boolean))).sort();
      const prev = qCourt.value;
      qCourt.innerHTML = '<option value="">—</option>' + courts.map(c=>`<option value="${c}">${c}</option>`).join('');
      if (courts.includes(prev)) qCourt.value = prev;
    }
    if (qMatch) {
      const pending = matches.filter(m => m.status==="pending" || m.status==="live");
      const prev = qMatch.value;
      qMatch.innerHTML = '<option value="">—</option>' + pending.map(m => {
        const ta = teams.find(t=>t.id===m.teamAId)?.name || "?";
        const tb = teams.find(t=>t.id===m.teamBId)?.name || "?";
        return `<option value="${m.id}">${ta} vs ${tb}</option>`;
      }).join('');
      if (pending.some(m=>m.id===prev)) qMatch.value = prev;
    }

    if (!q.length) { qList.innerHTML = '<div class="muted small">Kolejka pusta.</div>'; return; }
    qList.innerHTML = q.map((item, i) => {
      const m  = matches.find(x => x.id===item.matchId);
      const ta = m ? (teams.find(t=>t.id===m.teamAId)?.name||"?") : "?";
      const tb = m ? (teams.find(t=>t.id===m.teamBId)?.name||"?") : "?";
      return `<div class="row" style="gap:8px">
        <span class="muted">${i+1}.</span>
        <span>Boisko <b>${item.court}</b> — ${ta} vs ${tb}</span>
        ${i>0 ? `<button class="btn btn-ghost" data-qact="up" data-idx="${i}">↑</button>` : ""}
        <button class="btn btn-danger" data-qact="del" data-idx="${i}">Usuń</button>
      </div>`;
    }).join('');
  }

  // ── Scene status header ───────────────────────────────────
  function renderSceneStatus(state) {
    const s  = state?.meta?.scene || "game";
    const el = document.getElementById("sceneStatus");
    if (el) el.innerHTML = `Scena: <span class="kbd">${sceneLabel(s)}</span>`;
  }

  // ── Main render ───────────────────────────────────────────
  function render() {
    if (!current) return;
    const state = current.state;

    bindFilters();
    bindSceneBtns();
    bindToolBtns();
    bindQueueBtns();

    renderSceneStatus(state);
    renderSceneBtns(state);
    renderLockBtn(state);
    updateFilterOptions(state);
    renderQueue(state);

    // ── Teams ──
    els.teamsList.innerHTML = "";
    for (const t of state.teams || []) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="grow"><b>${t.name}</b> <span class="muted">(${t.group||"—"})</span></div>
        <button type="button" class="btn btn-ghost" data-del-team="${t.id}">Usuń</button>`;
      els.teamsList.appendChild(row);
    }

    // ── Matches ──
    els.matchesList.innerHTML = "";
    const matchesAll = (state.matches || []).map(m => ENG.emptyMatchPatch(m));
    const matches = matchesAll.filter(m => {
      if (filterState.status !== "all" && m.status !== filterState.status) return false;
      if (filterState.stage === "group"   && m.stage !== "group") return false;
      if (filterState.stage === "playoffs"&& m.stage === "group") return false;
      if (filterState.group !== "all" && String(m.group||"").trim() !== filterState.group) return false;
      if (filterState.court !== "all" && String(m.court||"").trim() !== filterState.court) return false;
      const q = filterState.q.toLowerCase();
      if (q) {
        const ta  = (state.teams||[]).find(x=>x.id===m.teamAId)?.name || "";
        const tb  = (state.teams||[]).find(x=>x.id===m.teamBId)?.name || "";
        const hay = `${ta} ${tb} ${m.group||""} ${m.stage||""} ${m.court||""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    for (const m of matches) {
      const teamA     = (state.teams||[]).find(x=>x.id===m.teamAId);
      const teamB     = (state.teams||[]).find(x=>x.id===m.teamBId);
      const sum       = ENG.scoreSummary(m);
      const isProgram = state.meta?.programMatchId === m.id;
      const claimed   = m.claimedBy ? "🔒 " : "";
      const canConfirm= m.status === "finished";
      const canReopen = m.status === "finished" || m.status === "confirmed";
      const setPreview= (canConfirm || canReopen) ? formatSetPreview(m) : "";

      const metaParts = [
        UI.stageLabel(m.stage),
        m.stage==="group" && m.group ? `Grupa ${m.group}` : "",
        m.court ? `Boisko ${m.court}` : "",
        setPreview ? `Przebieg: ${setPreview}` : "",
        `Sety: ${sum.setsA}:${sum.setsB}`,
      ].filter(Boolean);

      const card = document.createElement("div");
      card.className = "matchCard";
      card.innerHTML = `
        <div class="matchInfo">
          <div class="matchTeams">${claimed}<b>${teamA?.name||"?"}</b> vs <b>${teamB?.name||"?"}</b></div>
          <div class="matchMeta">${metaParts.join(" · ")}</div>
        </div>
        <span class="statusBadge ${m.status}">${m.status}</span>
        <div class="matchActions">
          <button class="btn ${isProgram?"btn-primary":""}" data-program="${m.id}">${isProgram?"📺 NA ŻYWO":"TRANSMISJA"}</button>
          ${canConfirm ? `<button class="btn btn-primary" data-confirm="${m.id}">Zatwierdź</button>` : ""}
          ${canReopen  ? `<button class="btn btn-ghost"   data-reopen="${m.id}">Cofnij</button>`
                       : `<button class="btn btn-ghost"   data-live="${m.id}">${m.status==="live"?"⏹ Stop":"▶ Live"}</button>`}
          <button class="btn btn-ghost"  data-court="${m.id}">Boisko</button>
          <button class="btn btn-ghost"  data-unclaim="${m.id}">Odblokuj</button>
          <button class="btn btn-danger" data-del-match="${m.id}">Usuń</button>
        </div>
      `;
      els.matchesList.appendChild(card);
    }

    // ── Program box ──
    const pm = (state.matches||[]).find(x => x.id===state.meta?.programMatchId);
    if (pm) {
      const m  = ENG.emptyMatchPatch(pm);
      const ta = (state.teams||[]).find(x=>x.id===m.teamAId);
      const tb = (state.teams||[]).find(x=>x.id===m.teamBId);
      const s  = m.sets[ENG.currentSetIndex(m)];
      els.programBox.innerHTML = `<b>📺 PROGRAM:</b> ${ta?.name||"?"} vs ${tb?.name||"?"} &nbsp;·&nbsp; <b>${s.a}:${s.b}</b>`;
    } else {
      els.programBox.innerHTML = `<span class="muted">Brak ustawionego meczu PROGRAM.</span>`;
    }

    // ── Standings ──
    const groups    = ENG.computeStandings(state);
    els.standingsBox.innerHTML = "";
    const groupKeys = Object.keys(groups).sort((a,b)=>a.localeCompare(b,"pl"));
    if (!groupKeys.length) {
      els.standingsBox.innerHTML = `<div class="muted">Brak zatwierdzonych meczów grupowych.</div>`;
    } else {
      for (const g of groupKeys) {
        const card = document.createElement("div");
        card.className = "card inner";
        const rows = groups[g].map((s,i) => `
          <tr>
            <td>${i+1}</td><td><b>${s.name}</b></td>
            <td class="right">${s.played}</td><td class="right">${s.wins}</td>
            <td class="right">${s.losses}</td><td class="right"><b>${s.tablePoints}</b></td>
            <td class="right">${s.setsWon}:${s.setsLost}</td>
            <td class="right">${s.pointsWon}:${s.pointsLost}</td>
          </tr>`).join("");
        card.innerHTML = `<h4>Grupa ${g||"—"}</h4>
          <table class="tbl">
            <thead><tr><th>#</th><th>Drużyna</th><th class="right">M</th><th class="right">W</th>
            <th class="right">L</th><th class="right">Pkt</th><th class="right">Sety</th><th class="right">Małe</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
        els.standingsBox.appendChild(card);
      }
    }

    // ── Match dropdowns (add match form) ──
    const groupsSet = new Set((state.teams||[]).map(t=>(t.group||"").trim()).filter(Boolean));
    const groupList = Array.from(groupsSet).sort((a,b)=>a.localeCompare(b,"pl"));
    els.matchGroup.innerHTML = `<option value="">—</option>` + groupList.map(g=>`<option value="${g}">${g}</option>`).join("");

    function refreshTeamDropdowns() {
      const stage = els.matchStage.value;
      const grp   = (els.matchGroup.value||"").trim();
      let teams   = state.teams || [];
      if (stage === "group" && grp) teams = teams.filter(t=>(t.group||"").trim()===grp);
      const prevA = els.matchTeamA.value;
      const prevB = els.matchTeamB.value;
      const opts  = teams.map(t=>`<option value="${t.id}">${t.name}${stage!=="group"?` (${t.group||"—"})`:""}</option>`).join("");
      els.matchTeamA.innerHTML = `<option value="">—</option>` + opts;
      els.matchTeamB.innerHTML = `<option value="">—</option>` + opts;
      if (teams.some(t=>t.id===prevA)) els.matchTeamA.value = prevA;
      if (teams.some(t=>t.id===prevB)) els.matchTeamB.value = prevB;
    }
    refreshTeamDropdowns();
    if (!els.matchGroup._vpBound) {
      els.matchGroup._vpBound = true;
      els.matchGroup.addEventListener("change", refreshTeamDropdowns);
      els.matchStage.addEventListener("change", refreshTeamDropdowns);
    }

    // ── Playoffs info ──
    if (els.playoffsInfo) {
      if (state.playoffs?.generated) {
        const gAt = state.playoffs.generatedAt ? new Date(state.playoffs.generatedAt).toLocaleString("pl") : "—";
        const br  = state.playoffs.bracket || {};
        els.playoffsInfo.textContent = `Wygenerowano: ${gAt} · QF: ${(br.qf||[]).length} · SF: ${(br.sf||[]).length} · Finał: ${br.final?"tak":"nie"} · 9-12: ${(br.place9||[]).length?"tak":"nie"}`;
      } else {
        els.playoffsInfo.textContent = "Playoff nie został jeszcze wygenerowany.";
      }
    }
  }

  // ── Tournament init ───────────────────────────────────────
  async function ensureTournament() {
    els.status.textContent = "Ładowanie…";
    const tid = await STORE.getTournamentId(slug);
    if (!tid) {
      els.status.innerHTML = "<b>Turniej nie istnieje.</b> Uzupełnij nazwę i PIN, a potem kliknij 'Utwórz turniej'.";
      els.btnCreate.disabled = false;
      return;
    }
    els.btnCreate.disabled = true;
    els.status.textContent = "Połączono z turniejem.";
    current = await STORE.fetchState(slug);
    render();
    if (unsub) unsub();
    unsub = STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      render();
    });
  }

  // ── Event bindings ────────────────────────────────────────
  els.btnCreate.addEventListener("click", async () => {
    const name = (els.inpName.value||"").trim();
    const pin  = (els.inpPin.value||"").trim();
    if (pin.length < 3) { UI.toast("PIN za krótki (min 3)", "warn"); return; }
    try {
      await STORE.createTournament(slug, name || slug, pin);
      STORE.setPin(slug, pin);
      UI.toast("Turniej utworzony", "success");
      await ensureTournament();
    } catch (e) { UI.toast("Błąd tworzenia: " + (e.message||e), "error"); }
  });

  els.btnSetPin.addEventListener("click", () => {
    const pin = (els.inpPin.value||"").trim();
    if (pin.length < 3) { UI.toast("PIN za krótki (min 3)", "warn"); return; }
    STORE.setPin(slug, pin);
    UI.toast("PIN zapisany na tę sesję", "success");
  });

  els.btnChangePin.addEventListener("click", async () => {
    const oldPin = (els.inpOldPin.value||"").trim();
    const newPin = (els.inpNewPin.value||"").trim();
    if (newPin.length < 3) { UI.toast("Nowy PIN za krótki", "warn"); return; }
    try {
      await STORE.changePin(slug, oldPin, newPin);
      STORE.setPin(slug, newPin);
      els.inpOldPin.value = "";
      els.inpNewPin.value = "";
      UI.toast("PIN zmieniony", "success");
    } catch (e) { UI.toast("Błąd zmiany PIN: " + (e.message||e), "error"); }
  });

  els.btnAddTeam.addEventListener("click", async () => {
    const pin   = requirePin(); if (!pin) return;
    const name  = (els.teamName.value||"").trim();
    const group = (els.teamGroup.value||"").trim();
    if (!name) { UI.toast("Podaj nazwę drużyny", "warn"); return; }
    try {
      await STORE.mutate(slug, pin, (st) => {
        st.teams = st.teams || [];
        st.teams.push({ id: crypto.randomUUID(), name, group });
        return st;
      });
      els.teamName.value = "";
      UI.toast("Dodano drużynę", "success");
    } catch (e) { UI.toast("Błąd: " + (e.message||e), "error"); }
  });

  els.btnAddMatch.addEventListener("click", async () => {
    const pin    = requirePin(); if (!pin) return;
    const stage  = els.matchStage.value;
    const group  = (els.matchGroup.value||"").trim();
    const teamAId= els.matchTeamA.value;
    const teamBId= els.matchTeamB.value;
    const court  = (els.matchCourt?.value||"").trim();

    if (!teamAId || !teamBId)           { UI.toast("Wybierz obie drużyny", "warn"); return; }
    if (teamAId === teamBId)            { UI.toast("Drużyna A i B muszą być różne", "warn"); return; }
    if (stage === "group" && !group)    { UI.toast("Wybierz grupę dla meczu grupowego", "warn"); return; }
    if (stage === "group" && group) {
      const st = current?.state || {};
      const tA = (st.teams||[]).find(t=>t.id===teamAId);
      const tB = (st.teams||[]).find(t=>t.id===teamBId);
      if (tA && (tA.group||"").trim() !== group) { UI.toast(`${tA.name} nie należy do grupy ${group}`, "warn"); return; }
      if (tB && (tB.group||"").trim() !== group) { UI.toast(`${tB.name} nie należy do grupy ${group}`, "warn"); return; }
    }
    try {
      await STORE.mutate(slug, pin, (st) => {
        st.matches = st.matches || [];
        st.matches.push({
          id: crypto.randomUUID(), stage,
          group: stage==="group" ? group : "",
          teamAId, teamBId, court: court||"",
          status: "pending",
          sets: [{a:0,b:0},{a:0,b:0},{a:0,b:0}],
          claimedBy: null, claimedAt: null,
          updatedAt: new Date().toISOString()
        });
        return st;
      });
      UI.toast("Dodano mecz" + (court ? ` (boisko ${court})` : ""), "success");
      if (els.matchCourt) els.matchCourt.value = "";
    } catch (e) { UI.toast("Błąd: " + (e.message||e), "error"); }
  });

  // Delete team
  els.teamsList.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-del-team]");
    if (!btn) return;
    const pin    = requirePin(); if (!pin) return;
    const teamId = btn.getAttribute("data-del-team");
    const state  = current?.state || {};
    const team   = (state.teams||[]).find(t=>t.id===teamId);
    if (!confirm(`Usunąć "${team?.name||"tę drużynę"}"?\n\nUwaga: usunięte zostaną też mecze z jej udziałem.`)) return;
    try {
      await STORE.mutate(slug, pin, (st) => {
        st.teams   = (st.teams||[]).filter(t=>t.id!==teamId);
        st.matches = (st.matches||[]).filter(m=>m.teamAId!==teamId && m.teamBId!==teamId);
        st.meta    = st.meta || {};
        if (st.meta.programMatchId && !(st.matches||[]).some(m=>m.id===st.meta.programMatchId)) st.meta.programMatchId = null;
        if (Array.isArray(st.meta.queue)) st.meta.queue = st.meta.queue.filter(it=>(st.matches||[]).some(m=>m.id===it.matchId));
        if (st.playoffs) st.playoffs.generated = false;
        return st;
      });
      UI.toast(`Usunięto: ${team?.name}`, "success");
    } catch (e) { UI.toast(e?.message || "Błąd usuwania drużyny", "error"); }
  });

  // Match actions
  els.matchesList.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const pin = requirePin(); if (!pin) return;

    const programId = btn.getAttribute("data-program");
    const liveId    = btn.getAttribute("data-live");
    const courtId   = btn.getAttribute("data-court");
    const unclaimId = btn.getAttribute("data-unclaim");
    const delId     = btn.getAttribute("data-del-match");
    const confirmId = btn.getAttribute("data-confirm");
    const reopenId  = btn.getAttribute("data-reopen");

    try {
      if (programId) {
        await STORE.mutate(slug, pin, (st) => {
          st.meta = st.meta || {};
          st.meta.programMatchId = programId;
          st.meta.scene = "game";
          return st;
        });
        UI.toast("Ustawiono PROGRAM", "success");

      } else if (liveId) {
        await STORE.mutate(slug, pin, (st) => {
          st.matches = (st.matches||[]).map(m => {
            if (m.id !== liveId) return m;
            if (m.status === "live") return { ...m, status: "pending", updatedAt: new Date().toISOString() };
            return ENG.markLive(m);
          });
          return st;
        });
        const nowLive = current?.state?.matches?.find(m=>m.id===liveId)?.status === "live";
        UI.toast(nowLive ? "Cofnięto do pending" : "Ustawiono live", "success");

      } else if (confirmId) {
        if (!UI.confirmDialog("Zatwierdzić wynik?", "Po zatwierdzeniu mecz wpłynie na tabelę (tylko etap Grupa).")) return;
        await STORE.mutate(slug, pin, (st) => {
          const idx = (st.matches||[]).findIndex(m=>m.id===confirmId);
          if (idx===-1) return st;
          const mm = ENG.emptyMatchPatch(st.matches[idx]);
          st.matches[idx] = ENG.confirmMatch(mm);
          st.matches[idx].claimedBy = null;
          st.matches[idx].claimedAt = null;
          if (st.playoffs?.generated) st = ENG.applyPlayoffsProgression(st);
          return st;
        });
        UI.toast("Wynik zatwierdzony", "success");

      } else if (reopenId) {
        if (!UI.confirmDialog("Cofnąć mecz do live?", "Pozwoli to ponownie edytować punkty z telefonu.")) return;
        await STORE.mutate(slug, pin, (st) => {
          const idx = (st.matches||[]).findIndex(m=>m.id===reopenId);
          if (idx===-1) return st;
          const mm = ENG.emptyMatchPatch(st.matches[idx]);
          mm.status = "live"; mm.winner = null;
          mm.updatedAt = new Date().toISOString();
          mm.claimedBy = null; mm.claimedAt = null;
          st.matches[idx] = mm;
          return st;
        });
        UI.toast("Cofnięto do live", "success");

      } else if (courtId) {
        const val = prompt("Numer/nazwa boiska (zostaw puste, żeby usunąć):", "");
        if (val === null) return;
        await STORE.mutate(slug, pin, (st) => {
          st.matches = (st.matches||[]).map(m => m.id===courtId ? {...m, court: String(val).trim()} : m);
          return st;
        });
        UI.toast("Zapisano boisko", "success");

      } else if (unclaimId) {
        await STORE.mutate(slug, pin, (st) => {
          st.matches = (st.matches||[]).map(m => m.id===unclaimId ? {...m, claimedBy:null, claimedAt:null} : m);
          return st;
        });
        UI.toast("Odblokowano mecz", "success");

      } else if (delId) {
        if (!UI.confirmDialog("Usuń mecz?", "Ta operacja jest nieodwracalna.")) return;
        await STORE.mutate(slug, pin, (st) => {
          st.matches = (st.matches||[]).filter(m=>m.id!==delId);
          if (st.meta?.programMatchId === delId) st.meta.programMatchId = null;
          return st;
        });
        UI.toast("Usunięto mecz", "success");
      }
    } catch (e) {
      UI.toast("Błąd: " + (e.message||e), "error");
      console.error(e);
    }
  });

  // Stage/group visibility
  els.matchStage.addEventListener("change", () => {
    document.getElementById("matchGroupWrap").style.display = els.matchStage.value==="group" ? "" : "none";
  });

  // Playoffs
  if (els.btnOpenPlayoffs) els.btnOpenPlayoffs.href = `playoffs.html?t=${encodeURIComponent(slug)}`;
  if (els.btnGeneratePlayoffs) {
    els.btnGeneratePlayoffs.addEventListener("click", async () => {
      const pin = requirePin(); if (!pin) return;
      const already = current?.state?.playoffs?.generated;
      if (already && !confirm("Playoff już istnieje. Wygenerować ponownie? (nadpisze istniejącą drabinkę)")) return;
      try {
        await STORE.mutate(slug, pin, (state) => {
          let st = JSON.parse(JSON.stringify(state||{}));
          const old = st.playoffs?.bracket;
          if (already && old) {
            const removeIds = new Set([...(old.qf||[]), ...(old.sf||[]), ...(old.place9||[]), old.final, old.third].filter(Boolean));
            st.matches = (st.matches||[]).filter(m=>!removeIds.has(m.id));
          }
          st = ENG.generatePlayoffs(st, { force: true });
          st = ENG.applyPlayoffsProgression(st);
          return st;
        });
        UI.toast("Wygenerowano playoff", "success");
      } catch (e) {
        UI.toast("Nie udało się wygenerować playoff: " + (e.message||e), "error");
        console.error(e);
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────
  els.matchStage.innerHTML = UI.STAGES.map(s=>`<option value="${s.key}">${s.label}</option>`).join("");
  document.getElementById("matchGroupWrap").style.display = "";
  els.titleSlug.textContent = slug;

  ensureTournament().catch(e => {
    console.error(e);
    els.status.textContent = "Błąd połączenia: " + (e.message||e);
  });
})();
