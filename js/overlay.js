// js/overlay.js (PRO overlay + sponsors rotation) — styled GAME HUD + streak indicator + live ticker
(function () {
  const UI = window.VP_UI;
  const U = window.VP_UTIL;
  const ENG = window.VPEngine;
  const STORE = window.VPState;

  const slug = UI.getSlug();
  const $ = (id) => document.getElementById(id);

  // ----- Responsive scale (1920x1080 base) -----
  const BASE_W = 1920;
  const BASE_H = 1080;
  const stage = $("stage");

  function applyScale() {
    if (!stage) return;
    const vw = window.innerWidth || document.documentElement.clientWidth || BASE_W;
    const vh = window.innerHeight || document.documentElement.clientHeight || BASE_H;
    const s = Math.min(vw / BASE_W, vh / BASE_H);
    stage.style.transform = `scale(${s})`;
  }
  window.addEventListener("resize", applyScale);
  window.addEventListener("orientationchange", applyScale);

  // ----- Scene switching -----
  const scenes = {
    game: $("sceneGame"),
    break: $("sceneBreak"),
    technical: $("sceneTechnical"),
    sponsors: $("sceneSponsors"),
  };
  let activeScene = "game";

  function setActiveScene(scene) {
    const target = scenes[scene] ? scene : "game";
    if (target === activeScene) return;

    for (const k of Object.keys(scenes)) {
      if (scenes[k]) scenes[k].classList.toggle("active", k === target);
    }
    activeScene = target;

    if (target === "sponsors") startSponsors();
    else stopSponsors();
  }

  // ----- GAME render -----
  const elGame = {
    aName: $("aName"),
    bName: $("bName"),
    aSets: $("aSets"),
    bSets: $("bSets"),
    aScore: $("aScore"),
    bScore: $("bScore"),
    ticker: $("liveTicker"),
    metaStage: $("metaStage"),
    metaSet: $("metaSet"),
  };
  }


  
  function renderTicker(state) {
    if (!elGame.ticker) return;
    const st = state || {};
    const pid = st.meta?.programMatchId;
    const live = (st.matches || [])
      .map(m => ENG.emptyMatchPatch(m))
      .filter(m => m.status === "live" && m.id !== pid);

    if (!live.length) {
      elGame.ticker.innerHTML = `<div><span class="muted">Brak innych meczów na żywo</span></div><div><span class="muted">Brak innych meczów na żywo</span></div>`;
      // stop animation by setting duration
      elGame.ticker.style.animationDuration = "0s";
      return;
    }

    const items = live.slice(0, 6).map((m) => {
      const ta = (st.teams || []).find(x => x.id === m.teamAId)?.name || "—";
      const tb = (st.teams || []).find(x => x.id === m.teamBId)?.name || "—";
      const idx = ENG.currentSetIndex(m);
      const s = m.sets[idx];
      const score = `${s.a}:${s.b}`;
      return `<span class="tickItem">${ta} ${score} ${tb}</span>`;
    }).join('<span class="tickSep">•</span>');

    // Duplicate for seamless loop (two halves)
    elGame.ticker.innerHTML = `<div>${items}</div><div>${items}</div>`;

    // Compute a reasonable duration (longer content -> longer duration)
    // fallback if we can't measure yet
    requestAnimationFrame(() => {
      try {
        const w = elGame.ticker.scrollWidth || 1200;
        const pxPerSec = 140; // speed
        const dur = Math.max(12, Math.min(45, w / pxPerSec));
        elGame.ticker.style.animationDuration = dur + "s";
      } catch (e) {}
    });
  }

  function renderMeta(state, match) {
    if (!elGame.metaStage || !elGame.metaSet) return;
    if (!match) {
      elGame.metaStage.textContent = slug ? String(slug).toUpperCase() : "—";
      elGame.metaSet.textContent = "SET —/3";
      return;
    }
    const stage = match.stage || "";
    const stageLabel = (UI && typeof UI.stageLabel === "function") ? UI.stageLabel(stage) : stage;
    const grp = (stage === "group" && match.group) ? (" • GRUPA " + String(match.group).toUpperCase()) : "";
    elGame.metaStage.textContent = (stageLabel + grp).toUpperCase();

    const idx = ENG.currentSetIndex(match);
    elGame.metaSet.textContent = `SET ${idx + 1}/3`;
  }

  function renderGame(state) {
    const st = state || {};
    const pmId = st.meta?.programMatchId;
    const pm0 = (st.matches || []).find(m => m.id === pmId);

    renderTicker(st);

    if (!pmId || !pm0) {
      renderMeta(st, null);
      if (elGame.aName) elGame.aName.textContent = "BRAK MECZU";
      if (elGame.bName) elGame.bName.textContent = "NA TRANSMISJI";
      if (elGame.aSets) elGame.aSets.textContent = "0";
      if (elGame.bSets) elGame.bSets.textContent = "0";
      if (elGame.aScore) elGame.aScore.textContent = "—";
      if (elGame.bScore) elGame.bScore.textContent = "—";      return;
    }

    const pm = ENG.emptyMatchPatch(pm0);
    renderMeta(st, pm);
    const ta = (st.teams || []).find(x => x.id === pm.teamAId)?.name || "Drużyna A";
    const tb = (st.teams || []).find(x => x.id === pm.teamBId)?.name || "Drużyna B";

    const idx = ENG.currentSetIndex(pm);
    const s = pm.sets[idx];
    const sum = ENG.scoreSummary(pm);

    if (elGame.aName) elGame.aName.textContent = ta;
    if (elGame.bName) elGame.bName.textContent = tb;
    if (elGame.aSets) elGame.aSets.textContent = String(sum.setsA);
    if (elGame.bSets) elGame.bSets.textContent = String(sum.setsB);
    if (elGame.aScore) elGame.aScore.textContent = String(s.a);
    if (elGame.bScore) elGame.bScore.textContent = String(s.b);

    // Streak indicator (current streak)
    if (typeof ENG.computeStreaks === "function") {
      const streak = ENG.computeStreaks(pm);
      const side = streak.currentSide; // "a"|"b"|null
      const len = streak.currentLen || 0;    } else {    }
  }

  // ----- BREAK render (existing) -----
  function safeText(el, txt) { if (el) el.textContent = txt || ""; }

  function fmtStage(stage) {
    return (U && U.stageLabels && U.stageLabels[stage]) ? U.stageLabels[stage] : (stage || "");
  }

  function teamName(state, id) {
    const t = (state.teams || []).find(x => x.id === id);
    return t ? t.name : "—";
  }

  function setsLine(match) {
    const m = ENG.emptyMatchPatch(match);
    const sum = ENG.scoreSummary(m);
    const setScores = [];
    for (let i = 0; i < 3; i++) {
      const s = m.sets[i];
      if ((+s.a || 0) === 0 && (+s.b || 0) === 0) continue;
      setScores.push(`${s.a}:${s.b}`);
    }
    return { sets: `${sum.setsA}:${sum.setsB}`, setScores: setScores.join(", ") };
  }

  function matchLabel(state, m) {
    const a = teamName(state, m.teamAId);
    const b = teamName(state, m.teamBId);
    const stage = fmtStage(m.stage);
    const grp = (m.stage === "group" && m.group) ? ` • Grupa ${m.group}` : "";
    return `${a} vs ${b} • ${stage}${grp}`;
  }

  function renderTables(state) {
    const host = $("breakTables");
    if (!host) return;
    host.innerHTML = "";

    const groups = ENG.computeStandings(state);
    const keys = Object.keys(groups).filter(k => (k || "").trim() !== "").sort((a, b) => a.localeCompare(b, "pl"));

    if (keys.length === 0) {
      host.innerHTML = `<div class="muted small">Brak zatwierdzonych meczów grupowych.</div>`;
      return;
    }

    for (const g of keys) {
      const arr = groups[g] || [];
      const card = document.createElement("div");
      card.className = "breakTableCard";
      card.innerHTML = `
        <div class="breakTableHeader">Grupa ${g}</div>
        <table class="tbl breakTbl">
          <thead>
            <tr>
              <th>#</th><th>Drużyna</th><th>M</th><th>W</th><th>P</th><th>Sety</th><th>Małe</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;
      const tb = card.querySelector("tbody");
      arr.forEach((s, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="muted">${idx + 1}</td>
          <td><span class="breakTeam">${s.name}</span></td>
          <td>${s.played}</td>
          <td>${s.wins}</td>
          <td><b>${s.tablePoints}</b></td>
          <td class="muted">${s.setsWon}:${s.setsLost}</td>
          <td class="muted">${s.pointsWon}:${s.pointsLost}</td>
        `;
        tb.appendChild(tr);
      });
      host.appendChild(card);
    }
  }

  function renderLastNext(state) {
    const matches = (state.matches || []).map(m => ENG.emptyMatchPatch(m));

    const finished = matches
      .filter(m => m.status === "confirmed" || m.status === "finished")
      .slice()
      .reverse();

    const pending = matches
      .filter(m => m.status === "pending" || m.status === "live")
      .slice();

    const lastHost = $("breakLast");
    const nextHost = $("breakNext");

    if (lastHost) {
      lastHost.innerHTML = "";
      const list = finished.slice(0, 6);
      if (list.length === 0) {
        lastHost.innerHTML = `<div class="muted small">Brak zakończonych meczów.</div>`;
      } else {
        for (const m of list) {
          const { sets, setScores } = setsLine(m);
          const row = document.createElement("div");
          row.className = "breakItem";
          row.innerHTML = `
            <div class="breakItemMain">
              <div class="breakItemTitle">${matchLabel(state, m)}</div>
              <div class="breakItemSub muted">${setScores || "—"}</div>
            </div>
            <div class="breakItemScore">${sets}</div>
          `;
          lastHost.appendChild(row);
        }
      }
    }

    if (nextHost) {
      nextHost.innerHTML = "";
      const list = pending.slice(0, 8);
      if (list.length === 0) {
        nextHost.innerHTML = `<div class="muted small">Brak zaplanowanych meczów.</div>`;
      } else {
        for (const m of list) {
          const row = document.createElement("div");
          row.className = "breakItem";
          const badge = (m.status === "live") ? `<span class="breakLive">LIVE</span>` : `<span class="breakPending">NEXT</span>`;
          row.innerHTML = `
            <div class="breakItemMain">
              <div class="breakItemTitle">${badge} ${matchLabel(state, m)}</div>
              <div class="breakItemSub muted">${(m.court && m.court !== "") ? ("Boisko: " + m.court) : ""}</div>
            </div>
            <div class="breakItemScore muted">—</div>
          `;
          nextHost.appendChild(row);
        }
      }
    }
  }

  function renderProgram(state) {
    const host = $("breakProgram");
    if (!host) return;
    const pid = state?.meta?.programMatchId || null;
    if (!pid) {
      host.innerHTML = `<div class="muted small">Nie ustawiono meczu na transmisji.</div>`;
      return;
    }
    const m = (state.matches || []).find(x => x.id === pid);
    if (!m) {
      host.innerHTML = `<div class="muted small">Mecz na transmisji nie istnieje.</div>`;
      return;
    }
    const mm = ENG.emptyMatchPatch(m);
    const a = teamName(state, mm.teamAId);
    const b = teamName(state, mm.teamBId);
    const sum = ENG.scoreSummary(mm);
    const score = `${sum.pointsA}:${sum.pointsB}`;
    const sets = `${sum.setsA}:${sum.setsB}`;
    host.innerHTML = `
      <div class="breakProgramRow">
        <div class="breakProgramTeams">
          <div class="breakProgramA">${a}</div>
          <div class="breakProgramVs">vs</div>
          <div class="breakProgramB">${b}</div>
        </div>
        <div class="breakProgramScore">
          <div class="breakProgramPoints">${score}</div>
          <div class="breakProgramSets muted">sety ${sets}</div>
        </div>
      </div>
    `;
  }

  function tickClock() {
    const el = $("btClock");
    if (!el) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    safeText(el, `${hh}:${mm}`);
  }

  function renderBreak(state) {
    safeText($("btSlug"), slug ? `t=${slug}` : "");
    safeText($("btName"), state?.tournament?.name || state?.meta?.name || "VolleyballPro");
    renderTables(state);
    renderLastNext(state);
    renderProgram(state);
  }

  // ----- TECHNICAL clock -----
  function tickTechClock() {
    const el = $("techClock");
    if (!el) return;
    const d = new Date();
    el.textContent = d.toLocaleTimeString();
  }

  // ----- SPONSORS render + rotation (existing) -----
  let sponsorsTimer = null;
  let sponsorsIdx = 0;
  let sponsorsCache = { listKey: "", enabled: true, interval: 8, list: [] };
  let current = null;

  function ensureSponsorsDom() {
    const root = $("sceneSponsors");
    if (!root) return null;

    let imgA = root.querySelector("#sponsorImgA");
    let imgB = root.querySelector("#sponsorImgB");

    if (!imgA || !imgB) {
      root.innerHTML = `
        <div class="sponsorsStage">
          <div class="sponsorImgWrap">
            <img id="sponsorImgA" class="sponsorImg show" alt="Sponsor" />
            <img id="sponsorImgB" class="sponsorImg" alt="Sponsor" />
          </div>
          <div class="sponsorHint">Sponsorzy • VolleyballPro</div>
        </div>
      `;
      imgA = root.querySelector("#sponsorImgA");
      imgB = root.querySelector("#sponsorImgB");
    }
    return { root, imgA, imgB };
  }

  function preload(url) {
    if (!url) return;
    const i = new Image();
    i.decoding = "async";
    i.src = url;
  }

  function sponsorsListKey(list) {
    return (list || []).map(x => x.url).join("|");
  }

  function setSponsorImage(dom, url) {
    if (!dom) return;
    const { imgA, imgB } = dom;
    const aShowing = imgA.classList.contains("show");
    const showEl = aShowing ? imgB : imgA;
    const hideEl = aShowing ? imgA : imgB;

    showEl.src = url || "";
    showEl.classList.add("show");
    hideEl.classList.remove("show");
  }

  function startSponsors() {
    if (sponsorsTimer) return;
    sponsorsTimer = setInterval(() => {
      if (activeScene !== "sponsors") return;
      rotateSponsors();
    }, 1000);
    rotateSponsors(true);
  }

  function stopSponsors() {
    if (!sponsorsTimer) return;
    clearInterval(sponsorsTimer);
    sponsorsTimer = null;
  }

  let lastTick = 0;
  function rotateSponsors(force = false) {
    if (!current || !current.state) return;
    const meta = current.state.meta || {};
    const list = Array.isArray(meta.sponsors) ? meta.sponsors : [];
    const enabled = meta.sponsorsEnabled !== false;
    const interval = Math.max(2, Math.min(60, Number(meta.sponsorsIntervalSec || 8)));

    const key = sponsorsListKey(list);
    if (key !== sponsorsCache.listKey) {
      sponsorsCache = { listKey: key, enabled, interval, list };
      sponsorsIdx = 0;
      (list || []).forEach(sp => preload(sp.url));
      force = true;
    } else {
      sponsorsCache.enabled = enabled;
      sponsorsCache.interval = interval;
      sponsorsCache.list = list;
    }

    const dom = ensureSponsorsDom();
    if (!dom) return;

    if (!list.length) {
      dom.root.innerHTML = `<div class="sponsorCard"><h2>Sponsorzy</h2><div class="muted">Brak sponsorów. Dodaj URL w Control.</div></div>`;
      return;
    }

    const now = Date.now();
    if (!force && enabled) {
      if (lastTick && (now - lastTick) < interval * 1000) return;
    }
    if (!enabled && !force) return;

    const idx = enabled ? (sponsorsIdx % list.length) : 0;
    const url = list[idx]?.url || "";
    setSponsorImage(dom, url);

    if (enabled) sponsorsIdx = (idx + 1) % list.length;
    lastTick = now;
  }

  // ----- Wiring -----
  if (!slug) {
    applyScale();
    return;
  }

  function renderAll() {
    const st = current?.state || {};
    const scene = st.meta?.scene || "game";
    setActiveScene(scene);
    renderGame(st);
    renderBreak(st);
    if (scene === "sponsors") rotateSponsors(false);
  }

  async function start() {
    applyScale();
    tickClock();
    setInterval(tickClock, 1000);
    tickTechClock();
    setInterval(tickTechClock, 1000);

    const tid = await STORE.getTournamentId(slug);
    if (!tid) return;

    current = await STORE.fetchState(slug);
    renderAll();

    STORE.subscribeState(slug, (snap) => {
      current = { tournamentId: snap.tournamentId, version: snap.version, state: snap.state };
      renderAll();
    });
  }

  start().catch(console.error);
})();