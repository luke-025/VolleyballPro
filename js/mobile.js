// js/mobile.js
// Mobile score-entry page for the organizer walking between courts.
// PIN-protected. Lists all matches, lets the operator tap a match and
// type in set scores. Overwriting a confirmed match requires confirmation.
// Writes via STORE.mutate (same optimistic-locking path as Control).
// Realtime-subscribed so other devices see updates instantly.

(function () {
  const UI = window.VP_UI;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const els = {
    slug:     document.getElementById("mSlug"),
    pin:      document.getElementById("pin"),
    btnLoad:  document.getElementById("btnLoad"),
    pinCard:  document.getElementById("pinCard"),
    filterWrap: document.getElementById("filterWrap"),
    courtTabs: document.getElementById("courtTabs"),
    matchList: document.getElementById("matchList"),
    title:    document.getElementById("mTitle"),
  };

  const slug = UI.getSlug();
  els.slug.textContent = slug ? `t=${slug}` : "brak slug";

  // Seed PIN from sessionStorage if already logged in on this device.
  const seeded = slug ? STORE.getPin(slug) : "";
  if (seeded) els.pin.value = seeded;

  let loaded = false;
  let snapshot = null;           // { tournamentId, version, state, updatedAt }
  let courtFilter = "all";       // "all" | "1" | "2" | "—" etc.
  let unsub = null;

  // -------- Helpers --------
  function teamName(id) {
    return (snapshot?.state?.teams || []).find(t => t.id === id)?.name || "—";
  }

  function stageLabel(m) {
    if (m.stage === "group") return m.group ? `Grupa ${m.group}` : "Grupa";
    return UI.stageLabel(m.stage);
  }

  function statusLabel(m) {
    if (m.status === "live") return "LIVE";
    if (m.status === "confirmed") return "ZATW.";
    if (m.status === "finished") return "KONIEC";
    return "—";
  }

  function validateVolleyball(sets) {
    const warnings = [];
    sets.forEach((s, idx) => {
      const target = (idx === 2) ? 15 : 25;
      const hi = Math.max(s.a, s.b);
      const lo = Math.min(s.a, s.b);
      if (hi < target) warnings.push(`Set ${idx+1}: zwycięski wynik < ${target}`);
      if (hi - lo < 2) warnings.push(`Set ${idx+1}: brak 2 pkt przewagi`);
    });
    const winsA = sets.filter(s => s.a > s.b).length;
    const winsB = sets.filter(s => s.b > s.a).length;
    if (!((winsA === 2 && winsB <= 1) || (winsB === 2 && winsA <= 1))) {
      warnings.push(`Nietypowy wynik (A:${winsA} B:${winsB}) — zwykle 2 wygrane sety`);
    }
    return warnings;
  }

  // -------- Sorting: court (numeric first), then stage order, then time --------
  function sortMatches(matches) {
    const stageOrder = { group: 0, quarterfinal: 10, semifinal: 20, thirdplace: 25, final: 30, place9: 40 };
    return matches.slice().sort((a, b) => {
      const ca = (a.court || "").trim(), cb = (b.court || "").trim();
      const na = Number(ca), nb = Number(cb);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      if (Number.isFinite(na) && !Number.isFinite(nb)) return -1;
      if (!Number.isFinite(na) && Number.isFinite(nb)) return 1;
      if (ca !== cb) return ca.localeCompare(cb, "pl");
      const sr = (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99);
      if (sr) return sr;
      return (a.scheduledAt || "").localeCompare(b.scheduledAt || "");
    });
  }

  // -------- Render --------
  function renderCourtTabs(matches) {
    const courts = new Set();
    matches.forEach(m => courts.add((m.court || "").trim() || "—"));
    const courtList = Array.from(courts).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      if (Number.isFinite(na)) return -1;
      if (Number.isFinite(nb)) return 1;
      return a.localeCompare(b, "pl");
    });

    const tabs = [
      `<button class="courtTab ${courtFilter === "all" ? "active" : ""}" data-court="all">Wszystkie (${matches.length})</button>`,
      ...courtList.map(c => {
        const count = matches.filter(m => ((m.court || "").trim() || "—") === c).length;
        const label = c === "—" ? "Bez boiska" : `Boisko ${c}`;
        return `<button class="courtTab ${courtFilter === c ? "active" : ""}" data-court="${UI.esc(c)}">${UI.esc(label)} (${count})</button>`;
      }),
    ];
    els.courtTabs.innerHTML = tabs.join("");
    els.courtTabs.querySelectorAll(".courtTab").forEach(btn => {
      btn.addEventListener("click", () => {
        courtFilter = btn.getAttribute("data-court");
        renderAll();
      });
    });
  }

  function renderMatchCard(m) {
    const sum = ENG.scoreSummary(m);
    const wA = m.winner === "a";
    const wB = m.winner === "b";
    const cls = (m.status === "live") ? "live" : (m.status === "confirmed") ? "confirmed" : "";
    const setsDetail = (m.sets || [])
      .filter(s => (+s.a||0) + (+s.b||0) > 0)
      .map(s => `${s.a}:${s.b}`)
      .join(" · ");
    const timeBits = [];
    if (m.scheduledAt) timeBits.push(m.scheduledAt);
    if (m.court) timeBits.push(`Boisko ${m.court}`);
    timeBits.push(stageLabel(m));

    return `
      <div class="mCard ${cls}" data-mid="${UI.esc(m.id)}">
        <div class="teams">
          <div class="tm ${wA ? "winner" : (m.winner && !wA ? "loser" : "")}">${UI.esc(teamName(m.teamAId))}</div>
          <div class="tm ${wB ? "winner" : (m.winner && !wB ? "loser" : "")}">${UI.esc(teamName(m.teamBId))}</div>
          <div class="meta">${UI.esc(timeBits.filter(Boolean).join(" · "))}</div>
        </div>
        <div class="right">
          <div class="score">${sum.setsA}:${sum.setsB}</div>
          ${setsDetail ? `<div class="sets">${UI.esc(setsDetail)}</div>` : ""}
          <div class="stat ${m.status}">${statusLabel(m)}</div>
        </div>
      </div>
    `;
  }

  function renderAll() {
    if (!snapshot) return;
    const state = snapshot.state || {};
    els.title.textContent = state.meta?.name ? `${state.meta.name} — wyniki` : "Wyniki — tryb mobilny";
    const all = sortMatches(state.matches || []);
    renderCourtTabs(all);

    const filtered = courtFilter === "all"
      ? all
      : all.filter(m => ((m.court || "").trim() || "—") === courtFilter);

    if (filtered.length === 0) {
      els.matchList.innerHTML = `<div class="emptyMsg"><b>Brak meczów</b>W tej kategorii nie ma zaplanowanych meczów.</div>`;
      return;
    }
    els.matchList.innerHTML = filtered.map(renderMatchCard).join("");

    // Wire taps
    els.matchList.querySelectorAll(".mCard").forEach(card => {
      const mid = card.getAttribute("data-mid");
      card.addEventListener("click", () => openMatch(mid));
    });
  }

  // -------- Score modal --------
  function openMatch(mid) {
    const state = snapshot?.state || {};
    const m = (state.matches || []).find(x => x.id === mid);
    if (!m) return;

    const isConfirmed = m.status === "confirmed";
    if (isConfirmed) {
      const ok = confirm("Ten mecz jest już zatwierdzony. Nadpisać wynik?");
      if (!ok) return;
    }
    showScoreModal(m);
  }

  function showScoreModal(m) {
    const ta = teamName(m.teamAId);
    const tb = teamName(m.teamBId);

    // Pre-fill with current sets (skip 0:0 placeholders so the inputs look empty)
    const currentSets = (m.sets || []).map(s => ({
      a: (+s.a||0) + (+s.b||0) > 0 ? String(s.a) : "",
      b: (+s.a||0) + (+s.b||0) > 0 ? String(s.b) : "",
    }));
    while (currentSets.length < 3) currentSets.push({ a: "", b: "" });

    const overlay = document.createElement("div");
    overlay.className = "mobOverlay";
    overlay.innerHTML = `
      <div class="mobModal" role="dialog" aria-labelledby="smTitle">
        <h2 id="smTitle">Wpisz wynik meczu</h2>
        <div class="matchName">${UI.esc(ta)} vs ${UI.esc(tb)}</div>
        <div class="setGrid">
          <span class="setLbl">Set 1</span>
          <input class="setInp" id="s1a" type="number" inputmode="numeric" min="0" max="99" placeholder="0" value="${UI.esc(currentSets[0].a)}">
          <span class="sep">–</span>
          <input class="setInp" id="s1b" type="number" inputmode="numeric" min="0" max="99" placeholder="0" value="${UI.esc(currentSets[0].b)}">

          <span class="setLbl">Set 2</span>
          <input class="setInp" id="s2a" type="number" inputmode="numeric" min="0" max="99" placeholder="0" value="${UI.esc(currentSets[1].a)}">
          <span class="sep">–</span>
          <input class="setInp" id="s2b" type="number" inputmode="numeric" min="0" max="99" placeholder="0" value="${UI.esc(currentSets[1].b)}">

          <span class="setLbl">Set 3</span>
          <input class="setInp" id="s3a" type="number" inputmode="numeric" min="0" max="99" placeholder="opc." value="${UI.esc(currentSets[2].a)}">
          <span class="sep">–</span>
          <input class="setInp" id="s3b" type="number" inputmode="numeric" min="0" max="99" placeholder="opc." value="${UI.esc(currentSets[2].b)}">
        </div>
        <div class="warn" id="smWarn"></div>
        <div class="btnRow">
          <button class="btn btnBig" type="button" id="smCancel">Anuluj</button>
          <button class="btn btn-primary btnBig" type="button" id="smOk">Zapisz</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const $ = (id) => overlay.querySelector(`#${id}`);
    const s1a = $("s1a"), s1b = $("s1b");
    const s2a = $("s2a"), s2b = $("s2b");
    const s3a = $("s3a"), s3b = $("s3b");
    const warnEl = $("smWarn");

    function readSets() {
      const rows = [
        { a: s1a.value, b: s1b.value },
        { a: s2a.value, b: s2b.value },
        { a: s3a.value, b: s3b.value },
      ];
      const sets = [];
      for (const r of rows) {
        if (r.a === "" && r.b === "") continue;
        if (r.a === "" || r.b === "") return null;
        const a = Number(r.a), b = Number(r.b);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        sets.push({ a, b });
      }
      return sets.length >= 2 ? sets : null;
    }

    function updateWarn() {
      const sets = readSets();
      if (!sets) { warnEl.textContent = ""; return; }
      const w = validateVolleyball(sets);
      warnEl.textContent = w.length ? "⚠ " + w.join(" · ") : "";
    }

    [s1a, s1b, s2a, s2b, s3a, s3b].forEach(inp => {
      inp.addEventListener("input", updateWarn);
      // Auto-advance focus on 2-digit entry (nice mobile touch)
      inp.addEventListener("input", () => {
        if (inp.value.length >= 2) {
          const all = [s1a, s1b, s2a, s2b, s3a, s3b];
          const idx = all.indexOf(inp);
          if (idx >= 0 && idx < all.length - 1) all[idx + 1].focus();
        }
      });
    });

    updateWarn();

    function close() { overlay.remove(); }

    $("smCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    $("smOk").addEventListener("click", async () => {
      const sets = readSets();
      if (!sets) {
        warnEl.textContent = "⚠ Wypełnij przynajmniej Set 1 i Set 2.";
        return;
      }
      if (sets.length > 3) {
        warnEl.textContent = "⚠ Maksymalnie 3 sety.";
        return;
      }
      await saveMatch(m.id, sets, close);
    });

    // Focus Set 1 team A on open (but only if empty, so editing doesn't jump)
    setTimeout(() => { if (!s1a.value) s1a.focus(); }, 100);
  }

  async function saveMatch(matchId, sets, onDone) {
    const pin = (els.pin.value || "").trim();
    if (!pin) return UI.toast("Brak PIN-u.", "warn");

    // Pad to exactly 3 sets (required by engine.emptyMatchPatch).
    const padded = sets.map(s => ({ a: s.a, b: s.b }));
    while (padded.length < 3) padded.push({ a: 0, b: 0 });

    try {
      const result = await STORE.mutate(slug, pin, (st) => {
        const m = (st.matches || []).find(x => x.id === matchId);
        if (!m) throw new Error("Nie znaleziono meczu.");
        m.sets = padded;

        const sw = ENG.scoreSummary(m);
        m.setsWonA = sw.setsA;
        m.setsWonB = sw.setsB;

        if (!m.stage) m.stage = "group";

        if (sw.setsA === 2 || sw.setsB === 2) {
          m.status = "confirmed";
          m.winner = (sw.setsA > sw.setsB) ? "a" : "b";
        } else {
          m.status = m.status === "confirmed" ? "live" : (m.status || "live");
          m.winner = null;
        }
        m.updatedAt = new Date().toISOString();

        if (st.playoffs?.generated) st = ENG.applyPlayoffsProgression(st);
        else if (ENG.maybeAutoGeneratePlayoffs) st = ENG.maybeAutoGeneratePlayoffs(st);
        return st;
      });
      // Reflect the write locally immediately so the card on the list repaints
      // without waiting for realtime/polling to come back around.
      if (result) {
        snapshot = result;
        renderAll();
      }
      UI.toast("Zapisano.", "success");
      onDone();
    } catch (e) {
      UI.toast(UI.fmtError(e), "error");
    }
  }

  // -------- Boot --------
  async function load() {
    if (!slug) return UI.toast("Brak ?t=slug w URL.", "warn");
    const pin = (els.pin.value || "").trim();
    if (!pin) return UI.toast("Podaj PIN.", "warn");

    try {
      snapshot = await STORE.fetchState(slug);
      if (!snapshot) { UI.toast("Turniej nie istnieje.", "error"); return; }
      STORE.setPin(slug, pin);
      loaded = true;
      els.filterWrap.style.display = "block";
      renderAll();
      UI.toast("Wczytano.", "success");

      // Subscribe for live updates from other devices.
      if (!unsub) {
        try {
          unsub = STORE.subscribeState(slug, (snap) => {
            snapshot = snap;
            renderAll();
          });
        } catch { /* ignore — polling will catch up */ }
      }

      // Polling fallback (8s, matches display.js).
      setInterval(async () => {
        if (!loaded) return;
        try {
          const fresh = await STORE.fetchState(slug);
          if (fresh && fresh.version !== snapshot?.version) {
            snapshot = fresh;
            renderAll();
          }
        } catch { /* ignore */ }
      }, 8 * 1000);
    } catch (e) {
      UI.toast(UI.fmtError(e), "error");
    }
  }

  els.btnLoad.addEventListener("click", load);
  els.pin.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
})();
