// js/engine.js
// Pure rules & computations for volleyball (best of 3)

(function () {
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function emptyMatchPatch(match) {
    const m = clone(match);
    if (!m.sets || !Array.isArray(m.sets) || m.sets.length !== 3) {
      m.sets = [{ a:0, b:0 }, { a:0, b:0 }, { a:0, b:0 }];
    } else {
      m.sets = m.sets.map(s => ({ a: +s.a||0, b:+s.b||0 })).slice(0,3);
      while (m.sets.length < 3) m.sets.push({a:0,b:0});
    }
    if (!m.status) m.status = "pending";
    if (!Array.isArray(m.events)) m.events = [];
    if (!m.stage) m.stage = "group";
    m.winner = m.winner ?? null;
    m.claimedBy = m.claimedBy ?? null;
    m.claimedAt = m.claimedAt ?? null;
    m.updatedAt = m.updatedAt ?? new Date().toISOString();
    return m;
  }

  function setWins(match) {
    const wins = { a:0, b:0 };
    for (let i=0;i<3;i++) {
      const s = match.sets[i];
      const a = s.a, b = s.b;
      const min = (i===2 ? 15 : 25);
      if (a>=min || b>=min) {
        if (Math.abs(a-b) >= 2) {
          if (a>b) wins.a++;
          else if (b>a) wins.b++;
        }
      }
    }
    return wins;
  }

  function currentSetIndex(match) {
    const wins = setWins(match);
    if (wins.a>=2 || wins.b>=2) return 2;
    for (let i=0;i<3;i++) {
      const s = match.sets[i];
      const min = (i===2 ? 15 : 25);
      if (!((s.a>=min || s.b>=min) && Math.abs(s.a-s.b)>=2)) return i;
    }
    return 2;
  }

  function tryAutoFinish(match) {
    const m = emptyMatchPatch(match);
    const wins = setWins(m);
    if (wins.a>=2) {
      m.status = "finished";
      m.winner = "a";
    } else if (wins.b>=2) {
      m.status = "finished";
      m.winner = "b";
    }
    return m;
  }

  function addPoint(match, side, delta) {
    const m = emptyMatchPatch(match);
    if (m.status === "finished" || m.status === "confirmed") return m;

    const idx = currentSetIndex(m);
    const s = m.sets[idx];
    s[side] = Math.max(0, (+s[side] || 0) + delta);

    if (!Array.isArray(m.events)) m.events = [];
    if (delta > 0) {
      m.events.push({ ts: Date.now(), set: idx, side });
    } else if (delta < 0) {
      for (let i = m.events.length - 1; i >= 0; i--) {
        const e = m.events[i];
        if (e && e.set === idx && e.side === side) {
          m.events.splice(i, 1);
          break;
        }
      }
    }

    return tryAutoFinish(m);
  }

  function resetCurrentSet(match) {
    const m = emptyMatchPatch(match);
    if (m.status === "finished" || m.status === "confirmed") return m;
    const idx = currentSetIndex(m);
    m.sets[idx] = { a:0, b:0 };
    return tryAutoFinish(m);
  }

  function markLive(match) {
    const m = emptyMatchPatch(match);
    if (m.status === "pending") m.status = "live";
    m.updatedAt = new Date().toISOString();
    return m;
  }

  function confirmMatch(match) {
    const m = emptyMatchPatch(match);
    if (m.status === "finished") m.status = "confirmed";
    m.updatedAt = new Date().toISOString();
    return m;
  }

  function scoreSummary(match) {
    const m = emptyMatchPatch(match);
    const wins = setWins(m);
    return { setsA: wins.a, setsB: wins.b };
  }

  function computeStandings(state) {
    const teams = state.teams || [];
    const matches = state.matches || [];
    const stats = {};
    for (const t of teams) {
      stats[t.id] = {
        teamId: t.id,
        name: t.name,
        group: t.group || "",
        played: 0,
        wins: 0,
        losses: 0,
        tablePoints: 0,
        setsWon: 0,
        setsLost: 0,
        pointsWon: 0,
        pointsLost: 0
      };
    }

    function addMatch(m) {
      const A = stats[m.teamAId], B = stats[m.teamBId];
      if (!A || !B) return;
      const sum = scoreSummary(m);
      const aSets = sum.setsA, bSets = sum.setsB;
      if (aSets + bSets === 0) return;

      A.played++; B.played++;
      A.setsWon += aSets; A.setsLost += bSets;
      B.setsWon += bSets; B.setsLost += aSets;

      for (const s of (m.sets || [])) {
        A.pointsWon += +s.a||0; A.pointsLost += +s.b||0;
        B.pointsWon += +s.b||0; B.pointsLost += +s.a||0;
      }

      if (aSets > bSets) { A.wins++; B.losses++; }
      else { B.wins++; A.losses++; }

      if (aSets === 2 && bSets === 0) { A.tablePoints += 3; B.tablePoints += 0; }
      else if (aSets === 2 && bSets === 1) { A.tablePoints += 2; B.tablePoints += 1; }
      else if (bSets === 2 && aSets === 1) { B.tablePoints += 2; A.tablePoints += 1; }
      else if (bSets === 2 && aSets === 0) { B.tablePoints += 3; A.tablePoints += 0; }
    }

    for (const m of matches) {
      if (m.stage !== "group") continue;
      if (m.status !== "confirmed") continue;
      addMatch(emptyMatchPatch(m));
    }

    const groups = {};
    for (const id in stats) {
      const s = stats[id];
      const g = s.group || "";
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    }

    function setDiff(s) { return s.setsWon - s.setsLost; }
    function pointRatio(s) { return (s.pointsLost === 0) ? (s.pointsWon>0?9999:0) : (s.pointsWon / s.pointsLost); }

    for (const g in groups) {
      groups[g].sort((x,y) => {
        if (y.tablePoints !== x.tablePoints) return y.tablePoints - x.tablePoints;
        const sd = setDiff(y) - setDiff(x);
        if (sd !== 0) return sd;
        const pr = pointRatio(y) - pointRatio(x);
        if (pr !== 0) return pr>0?1:-1;
        return x.name.localeCompare(y.name, "pl");
      });
    }
    return groups;
  }

  function ensureMatchId(m) {
    if (!m.id) m.id = crypto.randomUUID();
    return m.id;
  }

  function winnerTeamId(match) {
    const sum = scoreSummary(match);
    if (sum.setsA >= 2) return match.teamAId || null;
    if (sum.setsB >= 2) return match.teamBId || null;
    return null;
  }

  // ============================================================
  // generatePlayoffs — nowa logika (QF cross A-D, mecze o 9-12)
  // ============================================================
  function generatePlayoffs(state, opts = {}) {
    const st = clone(state || {});
    if (!st.playoffs) st.playoffs = {};
    if (st.playoffs.generated && !opts.force) return st;

    const groups = computeStandings(st);
    const gk = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pl")); // [A,B,C,D]

    const byGroup = {};
    for (const g of gk) {
      const arr = groups[g] || [];
      byGroup[g] = {};
      if (arr[0]?.teamId) byGroup[g][1] = arr[0].teamId;
      if (arr[1]?.teamId) byGroup[g][2] = arr[1].teamId;
      if (arr[2]?.teamId) byGroup[g][3] = arr[2].teamId;
    }

    const [A, B, C, D] = ["A", "B", "C", "D"];

    function mkMatch(stage, teamAId, teamBId, label) {
      return emptyMatchPatch({
        id: crypto.randomUUID(),
        stage,
        group: null,
        label: label || "",
        teamAId: teamAId || null,
        teamBId: teamBId || null,
        sets: [{ a: 0, b: 0 }, { a: 0, b: 0 }, { a: 0, b: 0 }],
        status: "pending",
        winner: null,
        claimedBy: null,
        claimedAt: null,
        updatedAt: new Date().toISOString()
      });
    }

    const matchesToAdd = [];
    const bracket = { qf: [], sf: [], final: null, third: null, place9: [] };

    // QF1: A1 vs C2, QF2: B1 vs D2, QF3: C1 vs A2, QF4: D1 vs B2
    const qf1 = mkMatch("quarterfinal", byGroup[A]?.[1], byGroup[C]?.[2], "QF1: A1 vs C2");
    const qf2 = mkMatch("quarterfinal", byGroup[B]?.[1], byGroup[D]?.[2], "QF2: B1 vs D2");
    const qf3 = mkMatch("quarterfinal", byGroup[C]?.[1], byGroup[A]?.[2], "QF3: C1 vs A2");
    const qf4 = mkMatch("quarterfinal", byGroup[D]?.[1], byGroup[B]?.[2], "QF4: D1 vs B2");
    matchesToAdd.push(qf1, qf2, qf3, qf4);
    bracket.qf.push(qf1.id, qf2.id, qf3.id, qf4.id);

    // SF1: winner(QF1) vs winner(QF2), SF2: winner(QF3) vs winner(QF4)
    const sf1 = mkMatch("semifinal", null, null, "Półfinał 1 (QF1 vs QF2)");
    const sf2 = mkMatch("semifinal", null, null, "Półfinał 2 (QF3 vs QF4)");
    matchesToAdd.push(sf1, sf2);
    bracket.sf.push(sf1.id, sf2.id);

    const fin   = mkMatch("final",      null, null, "Finał");
    const third = mkMatch("thirdplace", null, null, "Mecz o 3. miejsce");
    matchesToAdd.push(fin, third);
    bracket.final = fin.id;
    bracket.third = third.id;

    // Miejsca 9-12: B3 vs D3, A3 vs C3
    const p9a = mkMatch("place9", byGroup[B]?.[3], byGroup[D]?.[3], "Miejsca 9-12: B3 vs D3");
    const p9b = mkMatch("place9", byGroup[A]?.[3], byGroup[C]?.[3], "Miejsca 9-12: A3 vs C3");
    matchesToAdd.push(p9a, p9b);
    bracket.place9.push(p9a.id, p9b.id);

    st.matches = Array.isArray(st.matches) ? st.matches.slice() : [];
    st.matches.push(...matchesToAdd);

    const seeds = [];
    for (const g of gk) {
      const arr = groups[g] || [];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]?.teamId) seeds.push({ key: `${g}${i + 1}`, teamId: arr[i].teamId, group: g, place: i + 1 });
      }
    }

    st.playoffs = {
      generated: true,
      generatedAt: new Date().toISOString(),
      seeds,
      bracket
    };

    return st;
  }

  // ============================================================
  // applyPlayoffsProgression
  // ============================================================
  function applyPlayoffsProgression(state) {
    const st = clone(state || {});
    if (!st.playoffs?.generated) return st;

    const idToMatch = new Map((st.matches || []).map(m => [m.id, m]));
    const br = st.playoffs.bracket || {};

    function winner(matchId) {
      const m = idToMatch.get(matchId);
      return m ? winnerTeamId(m) : null;
    }
    function loser(matchId) {
      const m = idToMatch.get(matchId);
      if (!m) return null;
      const w = winnerTeamId(m);
      if (!w || !m.teamAId || !m.teamBId) return null;
      return w === m.teamAId ? m.teamBId : m.teamAId;
    }
    function setTeams(matchId, aId, bId) {
      const m = idToMatch.get(matchId);
      if (!m) return;
      if (aId !== undefined) m.teamAId = aId || null;
      if (bId !== undefined) m.teamBId = bId || null;
      m.updatedAt = new Date().toISOString);
    }

    // QF -> SF
    if (br.qf?.length >= 4 && br.sf?.length >= 2) {
      setTeams(br.sf[0], winner(br.qf[0]), winner(br.qf[1]));
      setTeams(br.sf[1], winner(br.qf[2]), winner(br.qf[3]));
    }

    // SF -> Final / 3rd place
    if (br.sf?.length >= 2 && br.final && br.third) {
      setTeams(br.final, winner(br.sf[0]), winner(br.sf[1]));
      setTeams(br.third, loser(br.sf[0]),  loser(br.sf[1]));
    }

    // Write back
    st.matches = (st.matches || []).map(m => idToMatch.get(m.id) || m);
    st.playoffs.bracket = br;
    return st;
  }

  // ===== PRO stats (based on match.events) =====
  function getEvents(match) {
    const m = emptyMatchPatch(match);
    return Array.isArray(m.events) ? m.events.slice().sort((a,b)=> (+a.ts||0) - (+b.ts||0)) : [];
  }

  function computeStreaks(match) {
    const ev = getEvents(match);
    let bestA = 0, bestB = 0;
    let currentSide = null;
    let currentLen = 0;

    for (const e of ev) {
      if (!e || (e.side !== "a" && e.side !== "b")) continue;
      if (e.side === currentSide) currentLen += 1;
      else { currentSide = e.side; currentLen = 1; }
      if (currentSide === "a") bestA = Math.max(bestA, currentLen);
      else bestB = Math.max(bestB, currentLen);
    }

    return { bestA, bestB, currentSide, currentLen };
  }

  function computeMaxLead(match) {
    const ev = getEvents(match);
    const bySet = [[],[],[]];
    for (const e of ev) {
      const si = +e.set;
      if (si >= 0 && si < 3) bySet[si].push(e);
    }

    let best = { side: null, value: 0, set: null };
    for (let si = 0; si < 3; si++) {
      let a = 0, b = 0;
      for (const e of bySet[si]) {
        if (e.side === "a") a++;
        else if (e.side === "b") b++;
        const diff = a - b;
        const abs = Math.abs(diff);
        if (abs > best.value) {
          best = { side: diff >= 0 ? "a" : "b", value: abs, set: si };
        }
      }
    }
    return best;
  }

  function lastPlayedSetIndex(match) {
    const m = emptyMatchPatch(match);
    for (let i = 2; i >= 0; i--) {
      const s = m.sets[i];
      if ((+s.a||0) > 0 || (+s.b||0) > 0) return i;
    }
    return currentSetIndex(m);
  }

  function computeLastPointsTimeline(match, setIndex, limit) {
    const m = emptyMatchPatch(match);
    const ev = getEvents(m).filter(e => +e.set === +setIndex && (e.side === "a" || e.side === "b"));
    const N = limit || 10;
    const last = ev.slice(-N);
    return last.map(e => e.side);
  }

  window.VPEngine = {
    emptyMatchPatch,
    addPoint,
    resetCurrentSet,
    markLive,
    confirmMatch,
    scoreSummary,
    currentSetIndex,
    computeStandings,
    generatePlayoffs,
    applyPlayoffsProgression,
    computeStreaks,
    computeMaxLead,
    computeLastPointsTimeline,
    lastPlayedSetIndex,
  };
})();
