// js/court.js
(function () {
  const UI = window.VP_UI;
  const ENG = window.VPEngine;
  const STORE = window.VPState;
  const esc = (s)=>String(s??'').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));

  const slug = UI.getSlug();

  function getUrlParam(name) {
    try { return new URLSearchParams(location.search).get(name) || ""; } catch (e) { return ""; }
  }
  function getCourtFromUrl() {
    return (getUrlParam("court") || getUrlParam("c") || "").trim();
  }

  if (!slug) {
    document.getElementById("app").innerHTML = "<div class='card'><h2>Brak parametru turnieju</h2><p>Dodaj do linku <code>?t=twoj-turniej</code></p></div>";
    return;
  }

  const deviceId = STORE.getDeviceId();

  let current = null;
  let unsub = null;
  let activeMatchId = null;

  const els = {
    slug: document.getElementById("slug"),
    status: document.getElementById("status"),
    pin: document.getElementById("pin"),
    btnSavePin: document.getElementById("btnSavePin"),
    stage: document.getElementById("stage"),
    groupWrap: document.getElementById("groupWrap"),
    group: document.getElementById("group"),
    court: document.getElementById("court"),
    matches: document.getElementById("matches"),
    liveBox: document.getElementById("liveBox"),
    btnRelease: document.getElementById("btnRelease"),
    aName: document.getElementById("aName"),
    bName: document.getElementById("bName"),
    aScore: document.getElementById("aScore"),
    bScore: document.getElementById("bScore"),
    sets: document.getElementById("sets"),
    btnAPlus: document.getElementById("btnAPlus"),
    btnAMinus: document.getElementById("btnAMinus"),
    btnBPlus: document.getElementById("btnBPlus"),
    btnBMinus: document.getElementById("btnBMinus"),
    btnResetSet: document.getElementById("btnResetSet"),
    btnConfirm: document.getElementById("btnConfirm"),
    liveHint: document.getElementById("liveHint"),
  };

  // ensure court filter UI exists (older court.html may not have it)
  function ensureCourtFilterUI() {
    if (els.court) return;
    // Try to insert after groupWrap
    const host = els.groupWrap ? els.groupWrap.parentElement : null;
    if (!host) return;

    const wrap = document.createElement("div");
    wrap.className = "formRow";
    wrap.style.marginTop = "10px";
    wrap.innerHTML = `
      <div id="courtWrap">
        <label>Boisko</label>
        <select id="court">
          <option value="">Wszystkie</option>
        </select>
      </div>
    `;
    // Insert after groupWrap if possible
    if (els.groupWrap && els.groupWrap.nextSibling) host.insertBefore(wrap, els.groupWrap.nextSibling);
    else host.appendChild(wrap);

    els.court = wrap.querySelector("#court");
    els.court.addEventListener("change", renderMatchList);
  }

  function populateCourtOptions() {
    if (!current || !els.court) return;
    const st = current.state;
    const courts = Array.from(new Set((st.matches||[]).map(m => (m.court||"").trim()).filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b,"pl",{numeric:true,sensitivity:"base"}));

    const cur = els.court.value || "";
    els.court.innerHTML = `<option value="">Wszystkie</option>` + courts.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    // restore selection if still exists
    if ([...els.court.options].some(o=>o.value===cur)) els.court.value = cur;
  }


  els.slug.textContent = slug;
  els.pin.value = STORE.getPin(slug);

  function requirePin() {
    const pin = STORE.getPin(slug);
    if (!pin) {
      UI.toast("Wpisz PIN turnieju", "warn");
      return null;
    }
    return pin;
  }

  function getMatchById(id) {
    return (current?.state?.matches || []).find(m => m.id === id) || null;
  }

  function renderFilters() {
    // stages
    els.stage.innerHTML = UI.STAGES.map(s=>`<option value="${s.key}">${s.label}</option>`).join("");
    // groups derived from teams
    const groupsSet = new Set((current?.state?.teams||[]).map(t => (t.group||"").trim()).filter(Boolean));
    const list = Array.from(groupsSet).sort((a,b)=>a.localeCompare(b,"pl"));
    els.group.innerHTML = list.length ? list.map(g=>`<option value="${g}">${g}</option>`).join("") : `<option value="">—</option>`;
  }

  function renderMatchList() {
    if (!current) return;
    const st = current.state;
    const stage = els.stage.value;
    const group = (els.group.value||"").trim();
    const court = (els.court && (els.court.value||"").trim()) || "";

    const filtered = (st.matches||[])
      .filter(m => (m.stage||"group") === stage)
      .filter(m => stage !== "group" ? true : (m.group||"") === group)
      .filter(m => ["pending","live","finished"].includes(m.status||"pending"))
      .filter(m => !court ? true : ((m.court||"").trim() === court))
      .sort((a,b) => (a.status||"").localeCompare(b.status||""));

    els.matches.innerHTML = "";
    if (!filtered.length) {
      els.matches.innerHTML = `<div class="muted">Brak meczów w tym filtrze.</div>`;
      return;
    }
    for (const m0 of filtered) {
      const m = ENG.emptyMatchPatch(m0);
      const ta = (st.teams||[]).find(x=>x.id===m.teamAId);
      const tb = (st.teams||[]).find(x=>x.id===m.teamBId);
      const sum = ENG.scoreSummary(m);
      const locked = m.claimedBy && m.claimedBy !== deviceId;
      const mine = m.claimedBy === deviceId;
      const btnText = mine ? "Obsługujesz" : (locked ? "Zajęty" : "Przejmij");
      const row = document.createElement("div");
      row.className = "matchRow";
      row.innerHTML = `
        <div class="grow">
          <div class="matchTitle"><b>${ta?.name||"?"}</b> vs <b>${tb?.name||"?"}</b></div>
          <div class="muted small">${UI.stageLabel(m.stage)} ${m.stage==="group"?("• Grupa "+(m.group||"")):""}${(m.court&&String(m.court).trim())?(" • Boisko "+String(m.court).trim()):""} • ${m.status} • sety ${sum.setsA}:${sum.setsB}</div>
        </div>
        <button class="btn ${mine ? "btn-primary" : ""}" data-claim="${m.id}" ${locked ? "disabled":""}>${btnText}</button>
      `;
      els.matches.appendChild(row);
    }
  }

  function renderLive() {
    const st = current?.state;
    if (!st || !activeMatchId) {
      els.liveBox.style.display = "none";
      return;
    }
    const m0 = getMatchById(activeMatchId);
    if (!m0) { activeMatchId = null; els.liveBox.style.display = "none"; return; }
    const m = ENG.emptyMatchPatch(m0);
    if (m.claimedBy !== deviceId) { activeMatchId = null; els.liveBox.style.display = "none"; return; }

    const ta = (st.teams||[]).find(x=>x.id===m.teamAId);
    const tb = (st.teams||[]).find(x=>x.id===m.teamBId);
    const idx = ENG.currentSetIndex(m);
    const s = m.sets[idx];
    const sum = ENG.scoreSummary(m);

    els.liveBox.style.display = "";
    els.aName.textContent = ta?.name || "A";
    els.bName.textContent = tb?.name || "B";
    els.aScore.textContent = s.a;
    els.bScore.textContent = s.b;
    els.sets.textContent = `${sum.setsA}:${sum.setsB}  •  Set ${idx+1}/3`;

    const locked = !!st.meta?.locked;
    const finished = (m.status === "finished" || m.status === "confirmed");

    els.btnAPlus.disabled = finished || locked;
    els.btnAMinus.disabled = finished || locked || s.a <= 0;
    els.btnBPlus.disabled = finished || locked;
    els.btnBMinus.disabled = finished || locked || s.b <= 0;
    els.btnResetSet.disabled = finished || locked;


    // Option A: results are confirmed only in Control, not on the phone.
    els.btnConfirm.style.display = "none";

    // Hint for operator
    if (els.liveHint) {
      if (locked) {
        els.liveHint.innerHTML = "<b>Turniej zablokowany.</b> Edycja punktów jest wyłączona (odblokuj w Control).";
      } else if (m.status === "finished") {
        els.liveHint.innerHTML = "<b>Mecz zakończony.</b> Wynik czeka na zatwierdzenie w panelu Control.";
      } else if (m.status === "confirmed") {
        els.liveHint.innerHTML = "<b>Wynik zatwierdzony.</b> Mecz jest już w tabeli (jeśli był grupowy).";
      } else {
        els.liveHint.textContent = "";
      }
    }
  }

  async function ensureTournamentAndSubscribe() {
    els.status.textContent = "Ładowanie…";
    const tid = await STORE.getTournamentId(slug);
    if (!tid) {
      els.status.innerHTML = "<b>Turniej nie istnieje.</b> Poproś organizatora o poprawny link lub utwórz turniej w Control.";
      return;
    }
    current = await STORE.fetchState(slug);
    els.status.textContent = "Połączono.";
    const urlCourtHint = getCourtFromUrl();
    if (urlCourtHint) {
      UI.toast("Tryb boiska: " + urlCourtHint, "info");
    }
    ensureCourtFilterUI();
    renderFilters();
    populateCourtOptions();

    // Apply court filter from URL (?court=1 or ?c=1)
    const urlCourt = getCourtFromUrl();
    if (urlCourt && els.court) {
      const exists = [...els.court.options].some(o => (o.value||"") === urlCourt);
      if (exists) els.court.value = urlCourt;
      // If court doesn't exist yet, keep showing all.
    }

    // show/hide group
    updateGroupVisibility();
    renderMatchList();
    renderLive();

    if (unsub) unsub();
    unsub = STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      populateCourtOptions();
      const urlCourt2 = getCourtFromUrl();
      if (urlCourt2 && els.court && !(els.court.value||"")) {
        const exists2 = [...els.court.options].some(o => (o.value||"") === urlCourt2);
        if (exists2) els.court.value = urlCourt2;
      }
      renderFilters();
      updateGroupVisibility();
      renderMatchList();
      renderLive();
    });
  }

  function updateGroupVisibility() {
    const isGroup = els.stage.value === "group";
    els.groupWrap.style.display = isGroup ? "" : "none";
  }

  els.btnSavePin.addEventListener("click", () => {
    const pin = (els.pin.value||"").trim();
    if (pin.length < 3) { UI.toast("PIN za krótki", "warn"); return; }
    STORE.setPin(slug, pin);
    UI.toast("PIN zapisany", "success");
  });

  els.stage.addEventListener("change", () => { updateGroupVisibility(); renderMatchList(); });
  els.group.addEventListener("change", renderMatchList);

  // claim match
  els.matches.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-claim]");
    if (!btn) return;
    const matchId = btn.getAttribute("data-claim");
    const pin = requirePin(); if (!pin) return;

    try {
      await STORE.mutate(slug, pin, (st) => {
        const m = st.matches.find(x=>x.id===matchId);
        if (!m) throw new Error("Match not found");
        if (m.claimedBy && m.claimedBy !== deviceId) throw new Error("Mecz zajęty na innym urządzeniu");
        // release any other match claimed by this device
        for (const mm of st.matches) {
          if (mm.claimedBy === deviceId && mm.id !== matchId) {
            mm.claimedBy = null;
            mm.claimedAt = null;
          }
        }
        m.claimedBy = deviceId;
        m.claimedAt = new Date().toISOString();
        if (m.status === "pending") m.status = "live";
        return st;
      });
      activeMatchId = matchId;
      UI.toast("Przejęto mecz", "success");
    } catch (e) {
      UI.toast("Nie można przejąć: " + (e.message||e), "error");
    }
  });

  // release
  els.btnRelease.addEventListener("click", async () => {
    const pin = requirePin(); if (!pin) return;
    if (!activeMatchId) return;
    try {
      await STORE.mutate(slug, pin, (st) => {
        const m = st.matches.find(x=>x.id===activeMatchId);
        if (m && m.claimedBy === deviceId) {
          m.claimedBy = null;
          m.claimedAt = null;
        }
        return st;
      });
      activeMatchId = null;
      UI.toast("Zwolniono mecz", "success");
      renderLive();
      renderMatchList();
    } catch (e) {
      UI.toast("Błąd: " + (e.message||e), "error");
    }
  });

  async function mutateMatch(mutator) {
    const pin = requirePin(); if (!pin) return;
    const id = activeMatchId;
    if (!id) return;
    await STORE.mutate(slug, pin, (st) => {
      const idx = st.matches.findIndex(x=>x.id===id);
      if (idx === -1) return st;
      const m = ENG.emptyMatchPatch(st.matches[idx]);
      if (m.claimedBy !== deviceId) throw new Error("Brak kontroli nad meczem");
      const next = mutator(m);
      st.matches[idx] = next;
      return st;
    });
  }

  // point buttons
  els.btnAPlus.addEventListener("click", ()=> mutateMatch(m => ENG.addPoint(m,"a",+1)));
  els.btnAMinus.addEventListener("click", ()=> mutateMatch(m => ENG.addPoint(m,"a",-1)));
  els.btnBPlus.addEventListener("click", ()=> mutateMatch(m => ENG.addPoint(m,"b",+1)));
  els.btnBMinus.addEventListener("click", ()=> mutateMatch(m => ENG.addPoint(m,"b",-1)));
  els.btnResetSet.addEventListener("click", ()=> mutateMatch(m => ENG.resetCurrentSet(m)));

  // NOTE: confirmation happens in Control (Option A)

  // keyboard shortcuts: Q/W A +/-, O/P B +/-
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

    const k = e.key.toLowerCase();
    if (k === "q") { els.btnAPlus.click(); }
    else if (k === "w") { els.btnAMinus.click(); }
    else if (k === "o") { els.btnBPlus.click(); }
    else if (k === "p") { els.btnBMinus.click(); }
  });

  // init filters
  els.stage.innerHTML = UI.STAGES.map(s=>`<option value="${s.key}">${s.label}</option>`).join("");
  els.stage.value = "group";

  ensureTournamentAndSubscribe().catch(e => {
    console.error(e);
    els.status.textContent = "Błąd połączenia: " + (e.message||e);
  });
})();
