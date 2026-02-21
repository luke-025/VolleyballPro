// js/control-manual-result.js
// Adds "Wpisz wynik" (manual match result entry) to Control without modifying control.js
(function () {
  const UI = window.VP_UI;
  const STORE = window.VPState;

  function toast(msg, kind) {
    try { UI.toast(msg, kind || "info"); } catch (e) { console.log(msg); }
  }
  function getSlug() {
    try { return UI.getSlug(); } catch (e) { return ""; }
  }
  function getPin(slug) {
    try { return STORE.getPin(slug) || ""; } catch (e) { return ""; }
  }

  function parseSets(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;

    const parts = raw
      .replace(/[;|]/g, ",")
      .replace(/\s+/g, " ")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const sets = [];
    for (const p of parts) {
      const m = p.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      sets.push({ a, b });
    }
    return sets.length ? sets : null;
  }

  function computeSetsWon(sets) {
    let a = 0, b = 0;
    for (const s of sets) {
      if (s.a > s.b) a++;
      else if (s.b > s.a) b++;
    }
    return { a, b };
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
    const sw = computeSetsWon(sets);
    if (!((sw.a === 2 && sw.b <= 1) || (sw.b === 2 && sw.a <= 1))) {
      warnings.push(`Nietypowy wynik setów (A:${sw.a} B:${sw.b}) — zwykle gramy do 2 wygranych setów`);
    }
    return warnings;
  }

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

      if (row.querySelector("[data-manual-result]")) continue;

      const actions =
        row.querySelector(".matchActions") ||
        btn.closest(".actions") ||
        btn.parentElement;

      if (!actions) continue;

      const b = document.createElement("button");
      b.className = "btn small";
      b.type = "button";
      b.textContent = "Wpisz wynik";
      b.setAttribute("data-manual-result", matchId);

      actions.appendChild(b);
    }
  }

async function saveManualResult(matchId, sets) {
    const slug = getSlug();
    if (!slug) return toast("Brak slug turnieju.", "warn");
    const pin = getPin(slug);
    if (!pin) return toast("Podaj PIN w Control, żeby zapisywać wyniki.", "warn");

    await STORE.mutate(slug, pin, (st) => {
      const m = (st.matches || []).find(x => x.id === matchId);
      if (!m) throw new Error("Nie znaleziono meczu.");

      m.sets = sets.map(s => ({ a: s.a, b: s.b }));

      const sw = computeSetsWon(m.sets);
      m.setsWonA = sw.a;
      m.setsWonB = sw.b;

      // Upewnij się że stage jest ustawiony — bez tego mecz nie pojawi się w tabeli grup
      if (!m.stage) m.stage = "group";

      if (sw.a === 2 || sw.b === 2) {
        m.status = "confirmed";
        m.winner = (sw.a > sw.b) ? "A" : "B";
      } else {
        m.status = m.status || "live";
        m.winner = null;
      }

      if (st.playoffs) st.playoffs.generated = false;

      return st;
    });

    toast("Zapisano wynik ręcznie.", "ok");
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
      const example = "25-18, 22-25, 15-13";
      const input = prompt(
        "Wpisz wyniki setów (format: 25-18, 22-25, 15-13).\nDla 2 setów: 25-18, 25-23",
        example
      );
      if (input === null) return;

      const sets = parseSets(input);
      if (!sets) return toast("Nie rozpoznano formatu. Użyj np.: 25-18, 25-23", "err");
      if (sets.length > 3) return toast("Maksymalnie 3 sety.", "err");

      const warns = validateVolleyball(sets);
      if (warns.length) {
        const ok = confirm("Uwaga:\n- " + warns.join("\n- ") + "\n\nZapisać mimo to?");
        if (!ok) return;
      }

      btn.disabled = true;
      try {
        await saveManualResult(matchId, sets);
      } catch (e) {
        toast("Błąd zapisu: " + (e?.message || e), "err");
      } finally {
        btn.disabled = false;
      }
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();