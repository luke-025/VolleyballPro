// js/control-manual-result.js
// Adds "Wpisz wynik" (manual match result entry) to Control without modifying control.js
(function () {
  const UI = window.VP_UI;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

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
      warnings.push(`Nietypowy wynik setów (A:${winsA} B:${winsB}) — zwykle gramy do 2 wygranych setów`);
    }
    return warnings;
  }

  // ── Score entry modal ────────────────────────────────────────────────────
  function showScoreModal(teamA, teamB) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "confirmOverlay";
      overlay.innerHTML = `
        <div class="confirmModal scoreModal">
          <div class="confirmTitle">Wpisz wynik meczu</div>
          <div class="scoreModalMatch">${UI.esc(teamA)} vs ${UI.esc(teamB)}</div>
          <div class="scoreGrid">
            <span class="scoreSetLabel">Set 1</span>
            <input class="scoreInput" id="smS1A" type="number" min="0" max="99" placeholder="0">
            <span class="scoreSep">–</span>
            <input class="scoreInput" id="smS1B" type="number" min="0" max="99" placeholder="0">

            <span class="scoreSetLabel">Set 2</span>
            <input class="scoreInput" id="smS2A" type="number" min="0" max="99" placeholder="0">
            <span class="scoreSep">–</span>
            <input class="scoreInput" id="smS2B" type="number" min="0" max="99" placeholder="0">

            <span class="scoreSetLabel" id="smSet3Label">Set 3 <span class="muted">(opcjonalny)</span></span>
            <input class="scoreInput" id="smS3A" type="number" min="0" max="99" placeholder="0" disabled>
            <span class="scoreSep">–</span>
            <input class="scoreInput" id="smS3B" type="number" min="0" max="99" placeholder="0" disabled>
          </div>
          <div class="scoreWarnings" id="smWarnings"></div>
          <div class="confirmBtns">
            <button class="btn btn-ghost smCancel" type="button">Anuluj</button>
            <button class="btn btn-primary smOk" type="button">Zatwierdź</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const $ = (id) => overlay.querySelector(`#${id}`);
      const s1a = $("smS1A"), s1b = $("smS1B");
      const s2a = $("smS2A"), s2b = $("smS2B");
      const s3a = $("smS3A"), s3b = $("smS3B");
      const warningsEl = $("smWarnings");

      // Unlock set 3 when set 1 and set 2 are both filled
      const updateSet3Lock = () => {
        const set1filled = s1a.value !== "" && s1b.value !== "";
        const set2filled = s2a.value !== "" && s2b.value !== "";
        const unlock = set1filled && set2filled;
        s3a.disabled = !unlock;
        s3b.disabled = !unlock;
        if (!unlock) { s3a.value = ""; s3b.value = ""; }
      };

      const updateWarnings = () => {
        const sets = readSets();
        if (!sets || !sets.length) { warningsEl.textContent = ""; return; }
        const warns = validateVolleyball(sets);
        warningsEl.textContent = warns.length ? "⚠ " + warns.join(" · ") : "";
      };

      [s1a, s1b, s2a, s2b, s3a, s3b].forEach(inp => {
        inp.addEventListener("input", () => { updateSet3Lock(); updateWarnings(); });
      });

      function readSets() {
        const rows = [
          { a: s1a.value, b: s1b.value },
          { a: s2a.value, b: s2b.value },
          { a: s3a.value, b: s3b.value },
        ];
        const sets = [];
        for (const r of rows) {
          if (r.a === "" && r.b === "") continue; // skip empty set 3
          if (r.a === "" || r.b === "") return null; // incomplete row
          const a = Number(r.a), b = Number(r.b);
          if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
          sets.push({ a, b });
        }
        return sets.length >= 2 ? sets : null;
      }

      const close = (result) => { overlay.remove(); resolve(result); };

      overlay.querySelector(".smCancel").addEventListener("click", () => close(null));
      overlay.querySelector(".smOk").addEventListener("click", () => {
        const sets = readSets();
        if (!sets) {
          warningsEl.textContent = "⚠ Wypełnij co najmniej Set 1 i Set 2.";
          return;
        }
        if (sets.length > 3) {
          warningsEl.textContent = "⚠ Maksymalnie 3 sety.";
          return;
        }
        close(sets);
      });

      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });

      // Focus first input
      s1a.focus();
    });
  }
  // ────────────────────────────────────────────────────────────────────────

  function ensureButtons() {
    const actionBtns = document.querySelectorAll("[data-live],[data-program],[data-lock],[data-unlock],[data-court]");
    for (const btn of actionBtns) {
      const matchId =
        btn.getAttribute("data-live") ||
        btn.getAttribute("data-program") ||
        btn.getAttribute("data-lock") ||
        btn.getAttribute("data-unlock") ||
        btn.getAttribute("data-court");

      if (!matchId) continue;

      const row = btn.closest(".matchRow, .row, li, tr, .card") || btn.parentElement;
      if (!row) continue;

      // Szukaj w całej karcie meczu, nie tylko w bezpośrednim rodzicu przycisku
      const card = row.closest(".matchCard") || row;
      if (card.querySelector("[data-manual-result]")) continue;

      const actions =
        row.querySelector(".matchActions") ||
        btn.closest(".actions") ||
        btn.parentElement;

      if (!actions) continue;

      // Read team names from the match card title
      const titleBs = row.querySelectorAll(".mcTeams b, .matchTitle b");
      const teamA = titleBs[0]?.textContent?.trim() || "";
      const teamB = titleBs[1]?.textContent?.trim() || "";

      const b = document.createElement("button");
      b.className = "btn small";
      b.type = "button";
      b.textContent = "Wpisz wynik";
      b.setAttribute("data-manual-result", matchId);
      b.dataset.teamA = teamA;
      b.dataset.teamB = teamB;

      actions.appendChild(b);
    }
  }

  async function saveManualResult(matchId, sets) {
    const slug = UI.getSlug();
    if (!slug) return UI.toast("Brak slug turnieju.", "warn");
    const pin = STORE.getPin(slug);
    if (!pin) return UI.toast("Podaj PIN w Control, żeby zapisywać wyniki.", "warn");

    // Uzupełnij do dokładnie 3 setów (wymagane przez emptyMatchPatch w engine.js)
    const paddedSets = sets.map(s => ({ a: s.a, b: s.b }));
    while (paddedSets.length < 3) paddedSets.push({ a: 0, b: 0 });

    await STORE.mutate(slug, pin, (st) => {
      const m = (st.matches || []).find(x => x.id === matchId);
      if (!m) throw new Error("Nie znaleziono meczu.");

      m.sets = paddedSets;

      const sw = ENG.scoreSummary(m);
      m.setsWonA = sw.setsA;
      m.setsWonB = sw.setsB;

      // Upewnij się że stage jest ustawiony — bez tego mecz nie pojawi się w tabeli grup
      if (!m.stage) m.stage = "group";

      if (sw.setsA === 2 || sw.setsB === 2) {
        m.status = "confirmed";
        m.winner = (sw.setsA > sw.setsB) ? "a" : "b";
      } else {
        m.status = m.status || "live";
        m.winner = null;
      }

      // NIE resetujemy playoffs.generated — ręczny wynik nie niszczy drabinki
      // Propagujemy zwycięzców do kolejnej rundy (QF → SF → Finał itd.)
      if (st.playoffs?.generated) st = ENG.applyPlayoffsProgression(st);

      return st;
    });

    UI.toast("Zapisano wynik ręcznie.", "success");
  }

  function bind() {
    ensureButtons();
    const mo = new MutationObserver(() => ensureButtons());
    mo.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-manual-result]");
      if (!btn) return;

      ev.preventDefault();
      ev.stopPropagation();

      const matchId = btn.getAttribute("data-manual-result");
      const teamA = btn.dataset.teamA || "Drużyna A";
      const teamB = btn.dataset.teamB || "Drużyna B";

      const sets = await showScoreModal(teamA, teamB);
      if (!sets) return;

      btn.disabled = true;
      try {
        await saveManualResult(matchId, sets);
      } catch (e) {
        UI.toast("Błąd zapisu: " + UI.fmtError(e), "error");
      } finally {
        btn.disabled = false;
      }
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
