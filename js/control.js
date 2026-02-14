// js/control.js
(function () {
  const UI = window.VP_UI;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const slug = UI.getSlug();
  if (!slug) {
    document.getElementById("app").innerHTML = "<div class='card'><h2>Brak parametru turnieju</h2><p>Dodaj do linku <code>?t=twoj-turniej</code></p></div>";
    return;
  }

  let current = null; // {tournamentId, version, state}
  let unsub = null;

  const els = {
    app: document.getElementById("app"),
    titleSlug: document.getElementById("slug"),
    status: document.getElementById("status"),
    pinArea: document.getElementById("pinArea"),
    pinLabel: document.getElementById("pinLabel"),
    btnSetPin: document.getElementById("btnSetPin"),
    btnCreate: document.getElementById("btnCreate"),
    inpPin: document.getElementById("inpPin"),
    inpName: document.getElementById("inpName"),
    btnChangePin: document.getElementById("btnChangePin"),
    inpOldPin: document.getElementById("inpOldPin"),
    inpNewPin: document.getElementById("inpNewPin"),

    teamName: document.getElementById("teamName"),
    teamGroup: document.getElementById("teamGroup"),
    btnAddTeam: document.getElementById("btnAddTeam"),
    teamsList: document.getElementById("teamsList"),

    matchStage: document.getElementById("matchStage"),
    matchGroup: document.getElementById("matchGroup"),
    matchTeamA: document.getElementById("matchTeamA"),
    matchTeamB: document.getElementById("matchTeamB"),
    btnAddMatch: document.getElementById("btnAddMatch"),
    matchesList: document.getElementById("matchesList"),

    programBox: document.getElementById("programBox"),
    standingsBox: document.getElementById("standingsBox")
  };

  els.titleSlug.textContent = slug;

  function requirePin() {
    const pin = STORE.getPin(slug);
    if (!pin) {
      UI.toast("Wpisz PIN turnieju (Control)", "warn");
      return null;
    }
    return pin;
  }

  function render() {
    if (!current) return;
    const state = current.state;
    // teams
    els.teamsList.innerHTML = "";
    for (const t of state.teams || []) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="grow"><b>${t.name}</b> <span class="muted">(${t.group||"—"})</span></div>
        <button class="btn btn-ghost" data-del-team="${t.id}">Usuń</button>`;
      els.teamsList.appendChild(row);
    }

    // matches
    els.matchesList.innerHTML = "";
    for (const m0 of state.matches || []) {
      const m = ENG.emptyMatchPatch(m0);
      const teamA = (state.teams||[]).find(x=>x.id===m.teamAId);
      const teamB = (state.teams||[]).find(x=>x.id===m.teamBId);
      const sum = ENG.scoreSummary(m);
      const isProgram = state.meta?.programMatchId === m.id;
      const claimed = m.claimedBy ? "🔒" : "";
      const row = document.createElement("div");
      row.className = "matchRow";
      row.innerHTML = `
        <div class="grow">
          <div class="matchTitle">${claimed} <b>${teamA?.name||"?"}</b> vs <b>${teamB?.name||"?"}</b></div>
          <div class="muted small">${UI.stageLabel(m.stage)} ${m.stage==="group" ? ("• Grupa "+(m.group||"")) : ""} • status: <b>${m.status}</b> • sety: ${sum.setsA}:${sum.setsB}</div>
        </div>
        <div class="btnGroup">
          <button class="btn ${isProgram?"btn-primary":""}" data-program="${m.id}">${isProgram?"PROGRAM":"Ustaw PROGRAM"}</button>
          <button class="btn btn-ghost" data-live="${m.id}">Live</button>
          <button class="btn btn-ghost" data-unclaim="${m.id}">Odblokuj</button>
          <button class="btn btn-danger" data-del-match="${m.id}">Usuń</button>
        </div>
      `;
      els.matchesList.appendChild(row);
    }

    // program info
    const pm = (state.matches||[]).find(x=>x.id===state.meta?.programMatchId);
    if (pm) {
      const m = ENG.emptyMatchPatch(pm);
      const ta = (state.teams||[]).find(x=>x.id===m.teamAId);
      const tb = (state.teams||[]).find(x=>x.id===m.teamBId);
      const s = m.sets[ENG.currentSetIndex(m)];
      els.programBox.innerHTML = `<div class="row">
        <div class="grow"><b>PROGRAM:</b> ${ta?.name||"?"} vs ${tb?.name||"?"}</div>
        <div class="scoreMono">${s.a}:${s.b}</div>
      </div>`;
    } else {
      els.programBox.innerHTML = `<div class="muted">Brak ustawionego meczu PROGRAM.</div>`;
    }

    // standings
    const groups = ENG.computeStandings(state);
    els.standingsBox.innerHTML = "";
    const groupKeys = Object.keys(groups).sort((a,b)=>a.localeCompare(b,"pl"));
    if (groupKeys.length === 0) {
      els.standingsBox.innerHTML = `<div class="muted">Brak zatwierdzonych meczów grupowych.</div>`;
    } else {
      for (const g of groupKeys) {
        const card = document.createElement("div");
        card.className = "card inner";
        const rows = groups[g].map((s,i)=>`
          <tr>
            <td>${i+1}</td>
            <td><b>${s.name}</b></td>
            <td class="right">${s.played}</td>
            <td class="right">${s.wins}</td>
            <td class="right">${s.losses}</td>
            <td class="right"><b>${s.tablePoints}</b></td>
            <td class="right">${s.setsWon}:${s.setsLost}</td>
            <td class="right">${s.pointsWon}:${s.pointsLost}</td>
          </tr>`).join("");
        card.innerHTML = `<h4>Grupa ${g||"—"}</h4>
          <table class="tbl">
            <thead><tr><th>#</th><th>Drużyna</th><th class="right">M</th><th class="right">W</th><th class="right">L</th><th class="right">Pkt</th><th class="right">Sety</th><th class="right">Małe</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
        els.standingsBox.appendChild(card);
      }
    }

    // update match dropdowns
    const teamOpts = (state.teams||[]).map(t=>`<option value="${t.id}">${t.name} (${t.group||"—"})</option>`).join("");
    els.matchTeamA.innerHTML = `<option value="">—</option>` + teamOpts;
    els.matchTeamB.innerHTML = `<option value="">—</option>` + teamOpts;

    // group list (dynamic)
    const groupsSet = new Set((state.teams||[]).map(t=> (t.group||"").trim()).filter(Boolean));
    const list = Array.from(groupsSet).sort((a,b)=>a.localeCompare(b,"pl"));
    els.matchGroup.innerHTML = `<option value="">—</option>` + list.map(g=>`<option value="${g}">${g}</option>`).join("");
  }

  async function ensureTournament() {
    els.status.textContent = "Ładowanie…";
    const tid = await STORE.getTournamentId(slug);
    if (!tid) {
      els.status.innerHTML = "<b>Turniej nie istnieje.</b> Uzupełnij nazwę i PIN, a potem kliknij „Utwórz turniej”.";
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

  // Create tournament
  els.btnCreate.addEventListener("click", async () => {
    try {
      const name = (els.inpName.value||"").trim();
      const pin = (els.inpPin.value||"").trim();
      if (pin.length < 3) { UI.toast("PIN za krótki (min 3)", "warn"); return; }
      await STORE.createTournament(slug, name || slug, pin);
      STORE.setPin(slug, pin);
      UI.toast("Turniej utworzony", "success");
      await ensureTournament();
    } catch (e) {
      UI.toast("Błąd tworzenia: " + (e.message||e), "error");
      console.error(e);
    }
  });

  // Set PIN for this session
  els.btnSetPin.addEventListener("click", () => {
    const pin = (els.inpPin.value||"").trim();
    if (pin.length < 3) { UI.toast("PIN za krótki (min 3)", "warn"); return; }
    STORE.setPin(slug, pin);
    UI.toast("PIN zapisany na tę sesję", "success");
  });

  // Change PIN
  els.btnChangePin.addEventListener("click", async () => {
    try {
      const oldPin = (els.inpOldPin.value||"").trim();
      const newPin = (els.inpNewPin.value||"").trim();
      if (newPin.length < 3) { UI.toast("Nowy PIN za krótki", "warn"); return; }
      await STORE.changePin(slug, oldPin, newPin);
      STORE.setPin(slug, newPin);
      els.inpOldPin.value = "";
      els.inpNewPin.value = "";
      UI.toast("PIN zmieniony", "success");
    } catch (e) {
      UI.toast("Błąd zmiany PIN: " + (e.message||e), "error");
    }
  });

  // Add team
  els.btnAddTeam.addEventListener("click", async () => {
    const pin = requirePin(); if (!pin) return;
    const name = (els.teamName.value||"").trim();
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
    } catch (e) {
      UI.toast("Błąd: " + (e.message||e), "error");
    }
  });

  // Add match
  els.btnAddMatch.addEventListener("click", async () => {
    const pin = requirePin(); if (!pin) return;
    const stage = els.matchStage.value;
    const group = (els.matchGroup.value||"").trim();
    const teamAId = els.matchTeamA.value;
    const teamBId = els.matchTeamB.value;
    if (!teamAId || !teamBId || teamAId === teamBId) { UI.toast("Wybierz dwie różne drużyny", "warn"); return; }
    if (stage === "group" && !group) { UI.toast("Wybierz grupę dla meczu grupowego", "warn"); return; }

    try {
      await STORE.mutate(slug, pin, (st) => {
        st.matches = st.matches || [];
        st.matches.push({
          id: crypto.randomUUID(),
          stage,
          group: stage==="group" ? group : "",
          teamAId,
          teamBId,
          status: "pending",
          sets: [{a:0,b:0},{a:0,b:0},{a:0,b:0}],
          claimedBy: null,
          claimedAt: null,
          updatedAt: new Date().toISOString()
        });
        return st;
      });
      UI.toast("Dodano mecz", "success");
    } catch (e) {
      UI.toast("Błąd: " + (e.message||e), "error");
    }
  });

  // click handlers (program/live/unclaim/delete)
  els.matchesList.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const pin = requirePin(); if (!pin) return;

    const programId = btn.getAttribute("data-program");
    const liveId = btn.getAttribute("data-live");
    const unclaimId = btn.getAttribute("data-unclaim");
    const delId = btn.getAttribute("data-del-match");

    try {
      if (programId) {
        await STORE.mutate(slug, pin, (st) => {
          st.meta = st.meta || {};
          st.meta.programMatchId = programId;
          return st;
        });
        UI.toast("Ustawiono PROGRAM", "success");
      } else if (liveId) {
        await STORE.mutate(slug, pin, (st) => {
          st.matches = (st.matches||[]).map(m => m.id===liveId ? ENG.markLive(m) : m);
          return st;
        });
        UI.toast("Ustawiono live", "success");
      } else if (unclaimId) {
        await STORE.mutate(slug, pin, (st) => {
          st.matches = (st.matches||[]).map(m => m.id===unclaimId ? ({...m, claimedBy:null, claimedAt:null}) : m);
          return st;
        });
        UI.toast("Odblokowano mecz", "success");
      } else if (delId) {
        if (!UI.confirmDialog("Usuń mecz?", "Ta operacja jest nieodwracalna.")) return;
        await STORE.mutate(slug, pin, (st) => {
          st.matches = (st.matches||[]).filter(m => m.id!==delId);
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

  // Stage/group UI behavior
  els.matchStage.addEventListener("change", () => {
    const isGroup = els.matchStage.value === "group";
    document.getElementById("matchGroupWrap").style.display = isGroup ? "" : "none";
  });

  // init stage options
  els.matchStage.innerHTML = UI.STAGES.map(s=>`<option value="${s.key}">${s.label}</option>`).join("");
  document.getElementById("matchGroupWrap").style.display = "";

  ensureTournament().catch(e => {
    console.error(e);
    els.status.textContent = "Błąd połączenia: " + (e.message||e);
  });
})();
