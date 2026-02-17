/**
 * overlay-game-fx.js
 * Wskaźnik serwisu + Set Point / Match Point overlay + animacja wygranego seta/meczu
 * Nie modyfikuje overlay.js — działa jako osobna warstwa na scenie GAME.
 *
 * Wymaga w overlay.html:
 *   <div id="serveIndicatorA"></div>   ← wewnątrz #rowA .teamName (lub obok)
 *   <div id="serveIndicatorB"></div>   ← wewnątrz #rowB .teamName (lub obok)
 *   <div id="gameFxOverlay"></div>     ← wewnątrz #sceneGame, na końcu
 */
(function () {
  "use strict";

  const UI    = window.VP_UI;
  const STORE = window.VPState;
  const ENG   = window.VPEngine;

  /* -------------------------------------------------- */
  /*  CSS                                               */
  /* -------------------------------------------------- */
  function ensureStyle() {
    if (document.getElementById("vpGameFxStyle")) return;
    const css = `
      /* === Wskaźnik serwisu === */
      .serveIndicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #d9ff7a;
        box-shadow: 0 0 10px rgba(217,255,122,.7), 0 0 24px rgba(217,255,122,.35);
        opacity: 0;
        transform: scale(0.5);
        transition: opacity 300ms ease, transform 300ms ease;
        flex-shrink: 0;
      }
      .serveIndicator.active {
        opacity: 1;
        transform: scale(1);
        animation: servePulse 1.8s ease-in-out infinite;
      }
      @keyframes servePulse {
        0%, 100% { box-shadow: 0 0 10px rgba(217,255,122,.7), 0 0 24px rgba(217,255,122,.35); }
        50%       { box-shadow: 0 0 18px rgba(217,255,122,1),  0 0 48px rgba(217,255,122,.55); }
      }

      /* === FX Overlay (Set Point / Match Point / Winner) === */
      #gameFxOverlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 50;
      }

      /* Tło vignette podczas animacji */
      #gameFxOverlay.fx-active::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at center,
          rgba(0,0,0,0) 30%,
          rgba(0,0,0,.55) 100%);
        animation: fxFadeIn 400ms ease forwards;
      }
      @keyframes fxFadeIn {
        from { opacity: 0; } to { opacity: 1; }
      }

      .fxCard {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        padding: 48px 80px;
        border-radius: 32px;
        background: rgba(8, 12, 24, .82);
        border: 1px solid rgba(255,255,255,.14);
        box-shadow: 0 40px 120px rgba(0,0,0,.70), inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter: blur(24px);
        text-align: center;
        opacity: 0;
        transform: scale(.85) translateY(28px);
      }
      .fxCard.fxIn {
        animation: fxCardIn 480ms cubic-bezier(.18,.9,.18,1) forwards;
      }
      .fxCard.fxOut {
        animation: fxCardOut 380ms cubic-bezier(.6,0,.8,1) forwards;
      }
      @keyframes fxCardIn {
        0%   { opacity: 0; transform: scale(.85) translateY(28px); }
        100% { opacity: 1; transform: scale(1)   translateY(0); }
      }
      @keyframes fxCardOut {
        0%   { opacity: 1; transform: scale(1) translateY(0); }
        100% { opacity: 0; transform: scale(.95) translateY(-18px); }
      }

      .fxKicker {
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: rgba(255,255,255,.55);
      }
      .fxTitle {
        font-size: 72px;
        font-weight: 1000;
        letter-spacing: .5px;
        line-height: 1;
        color: #fff;
        text-shadow: 0 8px 40px rgba(0,0,0,.5);
      }
      .fxTitle.fxGold  { color: #ffe566; text-shadow: 0 0 60px rgba(255,220,60,.5), 0 8px 40px rgba(0,0,0,.5); }
      .fxTitle.fxGreen { color: #d9ff7a; text-shadow: 0 0 60px rgba(217,255,122,.4), 0 8px 40px rgba(0,0,0,.5); }
      .fxTeam {
        font-size: 38px;
        font-weight: 900;
        color: rgba(255,255,255,.90);
        letter-spacing: .2px;
        max-width: 800px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .fxSets {
        font-size: 22px;
        font-weight: 700;
        color: rgba(255,255,255,.50);
        letter-spacing: 2px;
      }
      /* Separator bar */
      .fxBar {
        width: 80px;
        height: 4px;
        border-radius: 2px;
        background: currentColor;
        opacity: .35;
      }

      /* === Konfetti === */
      #fxConfetti {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .confettiPiece {
        position: absolute;
        top: -20px;
        width: 10px;
        height: 14px;
        border-radius: 2px;
        opacity: 0;
        animation: confettiFall linear forwards;
      }
      @keyframes confettiFall {
        0%   { opacity: 1; transform: translateY(0)      rotate(0deg)    scaleX(1); }
        25%  {              transform: translateY(25vh)   rotate(180deg)  scaleX(.6); }
        50%  {              transform: translateY(50vh)   rotate(360deg)  scaleX(1); }
        75%  {              transform: translateY(75vh)   rotate(540deg)  scaleX(.4); }
        100% { opacity: 0;  transform: translateY(105vh)  rotate(720deg)  scaleX(1); }
      }
    `;
    const st = document.createElement("style");
    st.id = "vpGameFxStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* -------------------------------------------------- */
  /*  DOM – wstrzyknij elementy do istniejącego HUDu   */
  /* -------------------------------------------------- */
  function ensureDOM() {
    // Wskaźniki serwisu – wstawiamy PRZED .teamName wewnątrz .teamPill
    ["A", "B"].forEach(side => {
      const id = "serveIndicator" + side;
      if (document.getElementById(id)) return;
      const row = document.getElementById("row" + side);
      if (!row) return;
      const pill = row.querySelector(".teamPill");
      if (!pill) return;
      const ind = document.createElement("div");
      ind.id = id;
      ind.className = "serveIndicator";
      pill.insertBefore(ind, pill.firstChild);
    });

    // FX overlay – na końcu sceneGame
    if (!document.getElementById("gameFxOverlay")) {
      const scene = document.getElementById("sceneGame");
      if (scene) {
        scene.insertAdjacentHTML("beforeend", `
          <div id="gameFxOverlay"></div>
        `);
      }
    }
  }

  // Upewnij się że DOM jest gotowy — retry jeśli elementy jeszcze nie istnieją
  function ensureDOMRetry(cb, retries = 20, interval = 100) {
    const check = () => {
      ensureDOM();
      const ok = document.getElementById("serveIndicatorA") &&
                 document.getElementById("serveIndicatorB") &&
                 document.getElementById("gameFxOverlay");
      if (ok) { cb(); return; }
      if (retries-- > 0) setTimeout(check, interval);
    };
    check();
  }

  /* -------------------------------------------------- */
  /*  Logika serwisu                                    */
  /*  Kto zdobył ostatni punkt → ten serwuje            */
  /* -------------------------------------------------- */

  // Fallback: śledzimy poprzedni wynik żeby wykryć kto właśnie zdobył punkt
  let prevScore = { a: -1, b: -1, setIdx: -1 };

  function getServingSide(match) {
    if (!match) return null;
    const m = ENG.emptyMatchPatch(match);

    // Metoda 1: event log (preferowana)
    const events = Array.isArray(m.events) ? m.events : [];
    if (events.length > 0) {
      const sorted = events.slice().sort((a, b) => (+a.ts || 0) - (+b.ts || 0));
      const last = sorted[sorted.length - 1];
      if (last?.side === "a" || last?.side === "b") {
        console.debug("[GameFX] serve via events:", last.side, "total events:", events.length);
        return last.side;
      }
    }

    // Metoda 2: porównaj z poprzednim stanem (działa gdy brak eventów)
    const idx = ENG.currentSetIndex(m);
    const s = m.sets[idx];
    const a = +s.a || 0;
    const b = +s.b || 0;

    let side = null;
    if (prevScore.setIdx === idx) {
      if (a > prevScore.a) side = "a";
      else if (b > prevScore.b) side = "b";
    }

    // Zaktualizuj prev (tylko jeśli punkt faktycznie się zmienił lub nowy set)
    if (prevScore.setIdx !== idx || a !== prevScore.a || b !== prevScore.b) {
      prevScore = { a, b, setIdx: idx };
    }

    if (side) console.debug("[GameFX] serve via score diff:", side);
    return side;
  }

  // Zapamiętaj ostatni znany serwis (żeby nie gubić wskaźnika gdy stan nie zmienia sich)
  let lastKnownServe = null;

  function getServingSideCached(match) {
    const side = getServingSide(match);
    if (side) lastKnownServe = side;
    return lastKnownServe;
  }

  function renderServe(side) {
    const indA = document.getElementById("serveIndicatorA");
    const indB = document.getElementById("serveIndicatorB");
    if (indA) indA.classList.toggle("active", side === "a");
    if (indB) indB.classList.toggle("active", side === "b");
  }

  /* -------------------------------------------------- */
  /*  Logika set point / match point                    */
  /* -------------------------------------------------- */
  function getGameAlert(match, state) {
    if (!match) return null;
    const m = ENG.emptyMatchPatch(match);
    if (m.status === "finished" || m.status === "confirmed") return null;

    const idx   = ENG.currentSetIndex(m);
    const s     = m.sets[idx];
    const a     = +s.a || 0;
    const b     = +s.b || 0;
    const wins  = ENG.scoreSummary(m); // {setsA, setsB}
    const isSet3 = idx === 2;
    const MIN   = isSet3 ? 15 : 25;

    function teamName(id) {
      return (state?.teams || []).find(t => t.id === id)?.name || "—";
    }

    // Match point: drużyna ma 1 set do wygrania meczu i jest na set/match point
    function isMatchPoint(sideScore, oppScore, sideWins) {
      if (sideWins !== 1) return false; // potrzebuje jeszcze 1 seta
      // Na set point gdy: wystarczy jeden punkt do wygrania seta
      return (sideScore >= MIN - 1) && (sideScore >= oppScore) &&
             !((sideScore >= MIN && Math.abs(sideScore - oppScore) >= 2));
    }
    // Set point (nie match point)
    function isSetPoint(sideScore, oppScore) {
      return (sideScore >= MIN - 1) && (sideScore >= oppScore) &&
             !((sideScore >= MIN && Math.abs(sideScore - oppScore) >= 2));
    }

    const mpA = isMatchPoint(a, b, wins.setsA);
    const mpB = isMatchPoint(b, a, wins.setsB);
    const spA = !mpA && isSetPoint(a, b);
    const spB = !mpB && isSetPoint(b, a);

    if (mpA) return { type: "matchpoint", team: teamName(m.teamAId), setsA: wins.setsA, setsB: wins.setsB };
    if (mpB) return { type: "matchpoint", team: teamName(m.teamBId), setsA: wins.setsB, setsB: wins.setsA };
    if (spA) return { type: "setpoint",   team: teamName(m.teamAId) };
    if (spB) return { type: "setpoint",   team: teamName(m.teamBId) };

    return null;
  }

  function getWinnerAlert(match, state) {
    if (!match) return null;
    const m = ENG.emptyMatchPatch(match);

    function teamName(id) {
      return (state?.teams || []).find(t => t.id === id)?.name || "—";
    }

    // Mecz wygrany
    if (m.status === "finished" || m.status === "confirmed") {
      const wins = ENG.scoreSummary(m);
      const winnerSide = wins.setsA >= 2 ? "a" : "b";
      const winnerId   = winnerSide === "a" ? m.teamAId : m.teamBId;
      return {
        type: "winner",
        team: teamName(winnerId),
        setsA: wins.setsA,
        setsB: wins.setsB,
      };
    }

    // Set wygrany (mecz trwa dalej) — wykrywamy przez porównanie z poprzednim stanem setów
    const wins = ENG.scoreSummary(m);
    const totalSets = wins.setsA + wins.setsB;
    if (totalSets > prevTotalSets && prevTotalSets >= 0) {
      // Właśnie wygrany set — sprawdź kto go wygrał
      const prevIdx = totalSets - 1; // indeks właśnie zakończonego seta
      const s = m.sets[prevIdx];
      if (s) {
        const setWinnerSide = (+s.a || 0) > (+s.b || 0) ? "a" : "b";
        const setWinnerId   = setWinnerSide === "a" ? m.teamAId : m.teamBId;
        prevTotalSets = totalSets;
        return {
          type: "setwon",
          team: teamName(setWinnerId),
          setsA: wins.setsA,
          setsB: wins.setsB,
        };
      }
    }
    prevTotalSets = totalSets;

    return null;
  }

  let prevTotalSets = -1;

  /* -------------------------------------------------- */
  /*  FX Overlay render                                 */
  /* -------------------------------------------------- */
  let fxState = null;   // aktualnie wyświetlany alert
  let fxTimer = null;

  function fxKey(alert) {
    if (!alert) return null;
    return alert.type + "|" + alert.team;
  }

  function showFx(alert) {
    const overlay = document.getElementById("gameFxOverlay");
    if (!overlay) return;

    // Wyczyść poprzedni timer
    if (fxTimer) { clearTimeout(fxTimer); fxTimer = null; }

    // Ten sam komunikat? Nie przerywaj
    if (fxKey(fxState) === fxKey(alert) && alert !== null) return;
    fxState = alert;

    // Usuń istniejącą kartę
    const existing = overlay.querySelector(".fxCard");
    if (existing) {
      existing.classList.remove("fxIn");
      existing.classList.add("fxOut");
      setTimeout(() => existing.remove(), 400);
    }
    overlay.classList.remove("fx-active");

    if (!alert) return;

    // Zbuduj kartę
    const card = document.createElement("div");
    card.className = "fxCard";

    if (alert.type === "setpoint") {
      card.innerHTML = `
        <div class="fxKicker">Set Point</div>
        <div class="fxTitle fxGreen">SET POINT</div>
        <div class="fxBar" style="color:#d9ff7a"></div>
        <div class="fxTeam">${esc(alert.team)}</div>
      `;
    } else if (alert.type === "setwon") {
      card.innerHTML = `
        <div class="fxKicker">Koniec seta</div>
        <div class="fxTitle fxGreen">SET DLA</div>
        <div class="fxBar" style="color:#d9ff7a"></div>
        <div class="fxTeam">${esc(alert.team)}</div>
        <div class="fxSets">${alert.setsA} – ${alert.setsB}</div>
      `;
      launchConfetti();
    } else if (alert.type === "matchpoint") {
      card.innerHTML = `
        <div class="fxKicker">Match Point</div>
        <div class="fxTitle fxGold">MATCH POINT</div>
        <div class="fxBar" style="color:#ffe566"></div>
        <div class="fxTeam">${esc(alert.team)}</div>
        <div class="fxSets">${alert.setsA} – ${alert.setsB}</div>
      `;
    } else if (alert.type === "winner") {
      card.innerHTML = `
        <div class="fxKicker">Mecz zakończony</div>
        <div class="fxTitle fxGold">MECZ DLA</div>
        <div class="fxBar" style="color:#ffe566"></div>
        <div class="fxTeam">${esc(alert.team)}</div>
        <div class="fxSets">${alert.setsA} – ${alert.setsB}</div>
      `;
      // Konfetti tylko przy zwycięzcy
      launchConfetti();
    }

    overlay.classList.add("fx-active");
    overlay.appendChild(card);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => card.classList.add("fxIn"));
    });

    // Auto-schowanie: set point po 4s, match point po 5s, winner po 8s
    const duration = { setpoint: 4000, setwon: 5000, matchpoint: 5000, winner: 8000 }[alert.type] || 5000;
    fxTimer = setTimeout(() => {
      fxState = null;
      card.classList.remove("fxIn");
      card.classList.add("fxOut");
      overlay.classList.remove("fx-active");
      setTimeout(() => card.remove(), 400);
    }, duration);
  }

  /* -------------------------------------------------- */
  /*  Konfetti                                          */
  /* -------------------------------------------------- */
  const CONFETTI_COLORS = ["#ffe566","#d9ff7a","#7af6ff","#ff7ab0","#fff","#ffaa44"];

  function launchConfetti() {
    const overlay = document.getElementById("gameFxOverlay");
    if (!overlay) return;

    const count = 90;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "confettiPiece";
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const left  = Math.random() * 100;
      const delay = Math.random() * 1.2;
      const dur   = 2.5 + Math.random() * 2;
      const size  = 8 + Math.random() * 10;
      el.style.cssText = `
        left: ${left}%;
        background: ${color};
        width: ${size}px;
        height: ${size * 1.4}px;
        animation-duration: ${dur}s;
        animation-delay: ${delay}s;
        border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};
      `;
      overlay.appendChild(el);
      // Usuń po zakończeniu animacji
      setTimeout(() => el.remove(), (delay + dur + 0.2) * 1000);
    }
  }

  /* -------------------------------------------------- */
  /*  Escape HTML                                       */
  /* -------------------------------------------------- */
  function esc(text) {
    const d = document.createElement("div");
    d.textContent = String(text || "");
    return d.innerHTML;
  }

  /* -------------------------------------------------- */
  /*  Główna funkcja update – wywoływana przy każdym   */
  /*  renderGame (obserwujemy zmiany stanu)             */
  /* -------------------------------------------------- */
  let lastMatchId  = null;
  let lastVersion  = null;

  function onState(state) {
    const pmId = state?.meta?.programMatchId || null;
    const pm   = pmId ? (state.matches || []).find(m => m.id === pmId) : null;
    const scene = state?.meta?.scene || "game";

    if (scene !== "game") {
      renderServe(null);
      showFx(null);
      return;
    }

    // Serwis
    const servingSide = getServingSideCached(pm);
    renderServe(servingSide);

    // Zwycięzca seta/meczu
    const winnerAlert = getWinnerAlert(pm, state);
    if (winnerAlert) {
      showFx(winnerAlert);
      return;
    }

    // Set/Match point
    const alert = getGameAlert(pm, state);
    showFx(alert);
  }

  /* -------------------------------------------------- */
  /*  Init                                              */
  /* -------------------------------------------------- */
  function init() {
    ensureStyle();

    // Podpinamy się pod renderGame overlay.js przez monkey-patch.
    // overlay.js wywołuje renderGame(st) przy każdej zmianie stanu —
    // wystarczy opakować tę funkcję żeby dostać ten sam state.
    function hookIntoOverlay() {
      // renderGame jest zdefiniowane wewnątrz IIFE overlay.js więc nie jest globalny.
      // Zamiast tego obserwujemy zmiany DOM na elementach score — gdy overlay.js
      // zaktualizuje wynik, my odczytujemy stan z VPState (już jest w cache przeglądarki).
      const slug = (() => { try { return UI.getSlug(); } catch { return ""; } })();
      if (!slug) return;

      ensureDOMRetry(() => {
        // Obserwuj zmiany na aScore i bScore — to odpala się dokładnie gdy overlay.js renderuje
        const targets = [
          document.getElementById("aScore"),
          document.getElementById("bScore"),
          document.getElementById("aSets"),
          document.getElementById("bSets"),
        ].filter(Boolean);

        if (!targets.length) {
          console.warn("[GameFX] Brak elementów score do obserwacji");
          return;
        }

        const mo = new MutationObserver(() => {
          // Pobierz aktualny stan z cache (fetchState jest tanie — Supabase cachuje)
          STORE.fetchState(slug).then(snap => {
            onState(snap?.state || {});
          }).catch(() => {});
        });

        targets.forEach(el => mo.observe(el, { childList: true, characterData: true, subtree: true }));
        console.debug("[GameFX] Podpięto MutationObserver na score elements");

        // Pierwsze uruchomienie
        STORE.fetchState(slug).then(snap => onState(snap?.state || {})).catch(() => {});
      });
    }

    hookIntoOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
