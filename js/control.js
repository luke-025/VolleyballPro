// js/control.js
// VolleyballPro Control (Supabase) — aligned with js/state.js (VPState.* API)
// Includes stats-lite: total points + max set margin + set-by-set preview.
//
// Requirements provided by control.html IDs:
// slug, status, inpName, inpPin, btnCreate, btnSetPin, inpOldPin, inpNewPin, btnChangePin,
// teamName, teamGroup, btnAddTeam, teamsList,
// matchStage, matchGroupWrap, matchGroup, matchTeamA, matchTeamB, btnAddMatch,
// programBox, matchesList, btnGeneratePlayoffs, btnOpenPlayoffs, playoffsInfo, standingsBox
//
// Depends on globals loaded earlier:
// - window.VPState (from js/state.js)
// - window.VP_UI (from js/ui.js or similar)
// - window.VP_ENG (from js/engine.js) OR window.ENG (fallback)

(function () {
  const VPState = window.VPState;
  const UI = window.VP_UI || {};
  const ENG = window.VPEngine || window.VP_ENG || window.ENG || {};

  const $ = (id) => document.getElementById(id);

  const els = {
    slug: $("slug"),
    status: $("status"),
    inpName: $("inpName"),
    inpPin: $("inpPin"),
    btnCreate: $("btnCreate"),
    btnSetPin: $("btnSetPin"),
    inpOldPin: $("inpOldPin"),
    inpNewPin: $("inpNewPin"),
    btnChangePin: $("btnChangePin"),

    teamName: $("teamName"),
    teamGroup: $("teamGroup"),
    btnAddTeam: $("btnAddTeam"),
    teamsList: $("teamsList"),

    matchStage: $("matchStage"),
    matchGroupWrap: $("matchGroupWrap"),
    matchGroup: $("matchGroup"),
    matchTeamA: $("matchTeamA"),
    matchTeamB: $("matchTeamB"),
    btnAddMatch: $("btnAddMatch"),

    programBox: $("programBox"),
    matchesList: $("matchesList"),

    btnGeneratePlayoffs: $("btnGeneratePlayoffs"),
    btnOpenPlayoffs: $("btnOpenPlayoffs"),
    playoffsInfo: $("playoffsInfo"),

    standingsBox: $("standingsBox")
  };

  function getSlug() {
    const u = new URL(location.href);
    return (u.searchParams.get("t") || "").trim();
  }

  const slug = getSlug();
  if (els.slug) els.slug.textContent = slug || "—";

  let snapshot = null; // { tournamentId, version, state, updatedAt }

  // ---------- helpers ----------
  function stageLabel(stage) {
    if (UI.stageLabel) return UI.stageLabel(stage);
    const map = {
      group: "Grupa",
      quarterfinal: "Ćwierćfinał",
      semifinal: "Półfinał",
      thirdplace: "Mecz o 3 miejsce",
      final: "Finał",
      other: "Inne"
    };
    return map[stage] || (stage ? String(stage) : "—");
  }

  function ensureMatchDefaults(m) {
    if (ENG.emptyMatchPatch) return ENG.emptyMatchPatch(m);
    // fallback minimal
    if (!m.sets) m.sets = [{ a: 0, b: 0 }, { a: 0, b: 0 }, { a: 0, b: 0 }];
    if (!m.status) m.status = "pending";
    if (!m.stage) m.stage = "group";
    return m;
  }

  function scoreSummary(m) {
    if (ENG.scoreSummary) return ENG.scoreSummary(m);
    let setsA = 0, setsB = 0;
    for (const s of (m.sets || [])) {
      if ((s.a || 0) > (s.b || 0)) setsA++;
      else if ((s.b || 0) > (s.a || 0)) setsB++;
    }
    return { setsA, setsB };
  }

  function formatSetPreview(m) {
    return (m.sets || [])
      .filter(s => (s.a ?? 0) !== 0 || (s.b ?? 0) !== 0)
      .map(s => `${s.a}:${s.b}`)
      .join(", ");
  }

  function totalPointsFromSets(m) {
    let a = 0, b = 0;
    for (const s of (m.sets || [])) {
      a += Number(s.a || 0);
      b += Number(s.b || 0);
    }
    return { a, b, total: a + b };
  }

  function maxSetMargin(m) {
    let best = 0;
    for (const s of (m.sets || [])) {
      const d = Math.abs((s.a || 0) - (s.b || 0));
      if (d > best) best = d;
    }
    return best;
  }

  function setStatus(text, kind) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.className = "muted";
    if (kind === "ok") els.status.style.color = "";
    if (kind === "warn") els.status.style.color = "#ffb94f";
    if (kind === "err") els.status.style.color = "#ff4d6d";
  }

  function getPin() {
    const p = (els.inpPin && els.inpPin.value) ? els.inpPin.value.trim() : "";
    return p || (VPState.getPin ? VPState.getPin(slug) : "");
  }

  function savePinToSession(pin) {
    if (VPState.setPin) VPState.setPin(slug, pin);
  }

  // ---------- UI population ----------
  function fillStageSelect() {
    if (!els.matchStage) return;
    const options = [
      { v: "group", t: "Grupa" },
      { v: "quarterfinal", t: "Ćwierćfinał" },
      { v: "semifinal", t: "Półfinał" },
      { v: "thirdplace", t: "Mecz o 3 miejsce" },
      { v: "final", t: "Finał" },
      { v: "other", t: "Inne" }
    ];
    els.matchStage.innerHTML = options.map(o => `<option value="${o.v}">${o.t}</option>`).join("");
    els.matchStage.value = "group";
  }

  function fillGroupSelectFromTeams(state) {
    const groups = Array.from(new Set((state.teams || []).map(t => (t.group || "").trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pl"));
    if (els.matchGroup) {
      const opts = groups.length ? groups : ["A"];
      els.matchGroup.innerHTML = opts.map(g => `<option value="${g}">${g}</option>`).join("");
    }
    if (els.teamGroup) {
      const opts = groups.length ? groups : ["A", "B", "C", "D"];
      els.teamGroup.innerHTML = opts.map(g => `<option value="${g}">${g}</option>`).join("");
    }
  }

  function fillTeamSelects(state) {
    const teams = state.teams || [];
    const mk = (sel) => {
      if (!sel) return;
      sel.innerHTML = `<option value="">— wybierz —</option>` +
        teams.map(t => `<option value="${t.id}">${t.name} (${t.group || "—"})</option>`).join("");
    };
    mk(els.matchTeamA);
    mk(els.matchTeamB);
  }

  function showGroupWrap() {
    const stage = els.matchStage ? els.matchStage.value : "group";
    if (!els.matchGroupWrap) return;
    els.matchGroupWrap.style.display = (stage === "group") ? "" : "none";
  }

  // ---------- rendering ----------
  function renderTeams(state) {
    if (!els.teamsList) return;
    els.teamsList.innerHTML = "";
    for (const t of (state.teams || [])) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="grow"><b>${t.name}</b> <span class="muted">(${t.group || "—"})</span></div>
        <button class="btn btn-ghost" data-del-team="${t.id}">Usuń</button>
      `;
      els.teamsList.appendChild(row);
    }
  }

  function renderMatches(state) {
    if (!els.matchesList) return;
    els.matchesList.innerHTML = "";
    const teams = state.teams || [];

    for (const m0 of (state.matches || [])) {
      const m = ensureMatchDefaults(structuredClone(m0));
      const ta = teams.find(x => x.id === m.teamAId);
      const tb = teams.find(x => x.id === m.teamBId);

      const sum = scoreSummary(m);
      const pts = totalPointsFromSets(m);
      const margin = maxSetMargin(m);

        const streak = (window.VPEngine && typeof window.VPEngine.computeStreaks === "function") ? window.VPEngine.computeStreaks(m) : null;
      const setPreview = (m.status === "finished" || m.status === "confirmed") ? formatSetPreview(m) : "";

      const isProgram = state.meta?.programMatchId === m.id;
      const claimed = m.claimedBy ? "🔒" : "";
      const canConfirm = m.status === "finished";
      const canReopen = (m.status === "finished" || m.status === "confirmed");

      const row = document.createElement("div");
      row.className = "matchRow";
      row.innerHTML = `
        <div class="grow">
          <div class="matchTitle">${claimed} <b>${ta?.name || "?"}</b> vs <b>${tb?.name || "?"}</b></div>
          <div class="muted small">
            ${stageLabel(m.stage)} ${m.stage === "group" ? ("• Grupa " + (m.group || "")) : ""}
            • status: <b>${m.status}</b>
            • sety: ${sum.setsA}:${sum.setsB}
            • punkty: <b>${pts.a}:${pts.b}</b>
            ${margin ? ` • max różnica seta: ${margin}` : ""}
            ${streak ? ` • serie max: A${streak.bestA} B${streak.bestB}` : ""}
            ${(streak && streak.currentLen >= 3) ? ` • teraz: ${String(streak.currentSide||"").toUpperCase()} ${streak.currentLen}` : ""}
            ${setPreview ? ` • przebieg: <b>${setPreview}</b>` : ""}
          </div>
        </div>
        <div class="btnGroup">
          <button class="btn ${isProgram ? "btn-primary" : ""}" data-program="${m.id}">
            ${isProgram ? "PROGRAM" : "Ustaw PROGRAM"}
          </button>
          ${canConfirm ? `<button class="btn btn-primary" data-confirm="${m.id}">Zatwierdź</button>` : ""}
          ${canReopen
            ? `<button class="btn btn-ghost" data-reopen="${m.id}">Cofnij do live</button>`
            : `<button class="btn btn-ghost" data-live="${m.id}">Live</button>`}
          <button class="btn btn-ghost" data-unclaim="${m.id}">Odblokuj</button>
          <button class="btn btn-danger" data-del-match="${m.id}">Usuń</button>
        </div>
      `;
      els.matchesList.appendChild(row);
    }
  }

  function renderProgram(state) {
    if (!els.programBox) return;
    const pm0 = (state.matches || []).find(x => x.id === state.meta?.programMatchId);
    if (!pm0) {
      els.programBox.innerHTML = `<div class="muted">Brak ustawionego meczu PROGRAM.</div>`;
      return;
    }
    const m = ensureMatchDefaults(structuredClone(pm0));
    const teams = state.teams || [];
    const ta = teams.find(x => x.id === m.teamAId);
    const tb = teams.find(x => x.id === m.teamBId);
    const idx = (ENG.currentSetIndex ? ENG.currentSetIndex(m) : 0);
    const s = (m.sets || [])[idx] || { a: 0, b: 0 };
    const pts = totalPointsFromSets(m);
    const sum = scoreSummary(m);
    const streakP = (window.VPEngine && typeof window.VPEngine.computeStreaks === "function") ? window.VPEngine.computeStreaks(m) : null;

    els.programBox.innerHTML = `
      <div class="row">
        <div class="grow"><b>PROGRAM:</b> ${ta?.name || "?"} vs ${tb?.name || "?"}</div>
        <div class="scoreMono">${s.a}:${s.b}</div>
      </div>
      <div class="row">
        <div class="grow muted small">
          sety: <b>${sum.setsA}:${sum.setsB}</b>
          • punkty łącznie: <b>${pts.a}:${pts.b}</b>
          • suma punktów: ${pts.total}
          ${streakP ? ` • serie max: A${streakP.bestA} B${streakP.bestB}` : ""}
        </div>
      </div>
    `;
  }

  function renderStandings(state) {
    if (!els.standingsBox) return;
    if (!ENG.computeStandings) {
      els.standingsBox.innerHTML = `<div class="muted">Brak modułu standings (ENG.computeStandings).</div>`;
      return;
    }
    const groups = ENG.computeStandings(state);
    els.standingsBox.innerHTML = "";
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pl"));
    if (!keys.length) {
      els.standingsBox.innerHTML = `<div class="muted">Brak zatwierdzonych meczów grupowych.</div>`;
      return;
    }
    for (const g of keys) {
      const card = document.createElement("div");
      card.className = "card inner";
      const rows = groups[g].map((s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><b>${s.name}</b></td>
          <td class="right">${s.played}</td>
          <td class="right">${s.wins}</td>
          <td class="right">${s.losses}</td>
          <td class="right"><b>${s.tablePoints}</b></td>
          <td class="right">${s.setsWon}:${s.setsLost}</td>
          <td class="right">${s.pointsWon}:${s.pointsLost}</td>
        </tr>`).join("");
      card.innerHTML = `
        <h4>Grupa ${g}</h4>
        <table class="tbl">
          <thead>
            <tr>
              <th>#</th><th>Drużyna</th><th class="right">M</th><th class="right">W</th><th class="right">L</th>
              <th class="right">Pkt</th><th class="right">Sety</th><th class="right">Małe</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
      els.standingsBox.appendChild(card);
    }
  }

  function renderAll() {
    if (!snapshot) return;
    const state = snapshot.state;
    renderTeams(state);
    fillGroupSelectFromTeams(state);
    fillTeamSelects(state);
    renderProgram(state);
    renderMatches(state);
    renderStandings(state);

    if (els.playoffsInfo) {
      const genAt = state.playoffs?.generatedAt;
      els.playoffsInfo.textContent = genAt ? `Wygenerowano: ${new Date(genAt).toLocaleString("pl-PL")}` : "Playoff nie wygenerowany.";
    }
  }

  // ---------- mutations ----------
  async function doMutate(mutator) {
    const pin = getPin();
    if (!pin) throw new Error("Brak PIN");
    savePinToSession(pin);
    const res = await VPState.mutate(slug, pin, mutator, { maxRetries: 2 });
    // render will happen via realtime; still update snapshot optimistically
    snapshot = { tournamentId: res.tournamentId, version: res.version, state: res.state, updatedAt: res.updatedAt };
    renderAll();
  }

  // ---------- events ----------
  function wireEvents() {
    fillStageSelect();
    showGroupWrap();
    if (els.matchStage) {
      els.matchStage.addEventListener("change", showGroupWrap);
    }

    if (els.btnSetPin) {
      els.btnSetPin.addEventListener("click", () => {
        const pin = getPin();
        if (!pin) return setStatus("Podaj PIN.", "warn");
        savePinToSession(pin);
        setStatus("PIN zapisany w tej sesji.", "ok");
      });
    }

    if (els.btnCreate) {
      els.btnCreate.addEventListener("click", async () => {
        try {
          if (!slug) return setStatus("Brak parametru ?t=turniej", "err");
          const name = (els.inpName?.value || "").trim();
          const pin = getPin();
          if (!pin || pin.length < 3) return setStatus("PIN musi mieć min. 3 znaki.", "warn");
          await VPState.createTournament(slug, name, pin);
          savePinToSession(pin);
          setStatus("Utworzono turniej. Ładuję stan…", "ok");
          const s = await VPState.fetchState(slug);
          if (s) {
            snapshot = s;
            renderAll();
            setStatus("Połączono.", "ok");
          }
        } catch (e) {
          setStatus("Błąd tworzenia: " + (e.message || e), "err");
        }
      });
    }

    if (els.btnChangePin) {
      els.btnChangePin.addEventListener("click", async () => {
        try {
          const oldPin = (els.inpOldPin?.value || "").trim();
          const newPin = (els.inpNewPin?.value || "").trim();
          if (!oldPin || !newPin || newPin.length < 3) return setStatus("Podaj stary i nowy PIN (min. 3 znaki).", "warn");
          await VPState.changePin(slug, oldPin, newPin);
          savePinToSession(newPin);
          if (els.inpPin) els.inpPin.value = newPin;
          setStatus("Zmieniono PIN.", "ok");
        } catch (e) {
          setStatus("Błąd zmiany PIN: " + (e.message || e), "err");
        }
      });
    }

    if (els.btnAddTeam) {
      els.btnAddTeam.addEventListener("click", async () => {
        try {
          const name = (els.teamName?.value || "").trim();
          const group = (els.teamGroup?.value || "").trim();
          if (!name) return setStatus("Podaj nazwę drużyny.", "warn");
          await doMutate((st) => {
            st.teams = st.teams || [];
            st.teams.push({ id: crypto.randomUUID(), name, group });
            return st;
          });
          els.teamName.value = "";
        } catch (e) {
          setStatus("Błąd: " + (e.message || e), "err");
        }
      });
    }

    if (els.btnAddMatch) {
      els.btnAddMatch.addEventListener("click", async () => {
        try {
          const stage = els.matchStage?.value || "group";
          const group = (els.matchGroup?.value || "").trim();
          const a = els.matchTeamA?.value || "";
          const b = els.matchTeamB?.value || "";
          if (!a || !b || a === b) return setStatus("Wybierz dwie różne drużyny.", "warn");
          if (stage === "group" && !group) return setStatus("Wybierz grupę.", "warn");

          await doMutate((st) => {
            st.matches = st.matches || [];
            st.matches.push({
              id: crypto.randomUUID(),
              stage,
              group: stage === "group" ? group : "",
              teamAId: a,
              teamBId: b,
              status: "pending",
              claimedBy: null,
              sets: [{ a: 0, b: 0 }, { a: 0, b: 0 }, { a: 0, b: 0 }]
            });
            return st;
          });
          setStatus("Dodano mecz.", "ok");
        } catch (e) {
          setStatus("Błąd: " + (e.message || e), "err");
        }
      });
    }

    // Delegation: teams list
    if (els.teamsList) {
      els.teamsList.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("button");
        if (!btn) return;
        const id = btn.getAttribute("data-del-team");
        if (!id) return;
        try {
          await doMutate((st) => {
            st.teams = (st.teams || []).filter(t => t.id !== id);
            // Also remove matches that reference this team
            st.matches = (st.matches || []).filter(m => m.teamAId !== id && m.teamBId !== id);
            // Fix program if needed
            if (st.meta?.programMatchId) {
              const ok = (st.matches || []).some(m => m.id === st.meta.programMatchId);
              if (!ok) st.meta.programMatchId = null;
            }
            return st;
          });
        } catch (e) { setStatus("Błąd: " + (e.message || e), "err"); }
      });
    }

    // Delegation: matches list
    if (els.matchesList) {
      els.matchesList.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("button");
        if (!btn) return;

        const programId = btn.getAttribute("data-program");
        const confirmId = btn.getAttribute("data-confirm");
        const reopenId = btn.getAttribute("data-reopen");
        const liveId = btn.getAttribute("data-live");
        const unclaimId = btn.getAttribute("data-unclaim");
        const delId = btn.getAttribute("data-del-match");

        try {
          if (programId) {
            await doMutate((st) => {
              st.meta = st.meta || {};
              st.meta.programMatchId = programId;
              return st;
            });
            return;
          }
          if (confirmId) {
            await doMutate((st) => {
              const m = (st.matches || []).find(x => x.id === confirmId);
              if (m) m.status = "confirmed";
              return st;
            });
            return;
          }
          if (reopenId) {
            await doMutate((st) => {
              const m = (st.matches || []).find(x => x.id === reopenId);
              if (m) m.status = "live";
              return st;
            });
            return;
          }
          if (liveId) {
            await doMutate((st) => {
              const m = (st.matches || []).find(x => x.id === liveId);
              if (m) m.status = "live";
              return st;
            });
            return;
          }
          if (unclaimId) {
            await doMutate((st) => {
              const m = (st.matches || []).find(x => x.id === unclaimId);
              if (m) m.claimedBy = null;
              return st;
            });
            return;
          }
          if (delId) {
            await doMutate((st) => {
              st.matches = (st.matches || []).filter(m => m.id !== delId);
              if (st.meta?.programMatchId === delId) st.meta.programMatchId = null;
              return st;
            });
            return;
          }
        } catch (e) {
          setStatus("Błąd: " + (e.message || e), "err");
        }
      });
    }

    // Playoffs buttons (open page, generate if engine supports it)
    if (els.btnOpenPlayoffs) {
      els.btnOpenPlayoffs.addEventListener("click", () => {
        window.open(`playoffs.html?t=${encodeURIComponent(slug)}`, "_blank");
      });
    }
    if (els.btnGeneratePlayoffs) {
      els.btnGeneratePlayoffs.addEventListener("click", async () => {
        try {
          if (!ENG.generatePlayoffs) {
            return setStatus("Brak generatora playoff (ENG.generatePlayoffs).", "warn");
          }
          await doMutate((st) => {
            st.playoffs = ENG.generatePlayoffs(st);
            st.playoffs.generatedAt = new Date().toISOString();
            return st;
          });
          setStatus("Wygenerowano playoff.", "ok");
        } catch (e) {
          setStatus("Błąd playoff: " + (e.message || e), "err");
        }
      });
    }
  }

  // ---------- init ----------
  async function init() {
    if (!slug) {
      setStatus("Brak parametru w URL: dodaj ?t=twoj-turniej", "err");
      return;
    }
    wireEvents();
    // preload PIN from session
    const saved = VPState.getPin ? VPState.getPin(slug) : "";
    if (saved && els.inpPin) els.inpPin.value = saved;

    setStatus("Ładuję turniej…", "ok");
    try {
      const s = await VPState.fetchState(slug);
      if (!s) {
        setStatus("Turniej nie istnieje. Wpisz PIN i kliknij „Utwórz turniej”.", "warn");
      } else {
        snapshot = s;
        renderAll();
        setStatus("Połączono. Realtime aktywny.", "ok");
      }

      // Realtime subscription (always, even if tournament not yet created)
      VPState.subscribeState(slug, (newSnap) => {
        snapshot = newSnap;
        renderAll();
      });
    } catch (e) {
      setStatus("Błąd połączenia: " + (e.message || e), "err");
    }
  }

  init();
})();
