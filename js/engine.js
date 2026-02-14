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
    // current = first set that isn't finished by rules
    for (let i=0;i<3;i++) {
      const s = match.sets[i];
      const min = (i===2 ? 15 : 25);
      if (!((s.a>=min || s.b>=min) && Math.abs(s.a-s.b)>=2)) return i;
    }
    return 2;
  }

  function canFinishSet(a,b,min) {
    return (a>=min || b>=min) && Math.abs(a-b) >= 2;
  }

  function tryAutoFinish(match) {
    const m = emptyMatchPatch(match);
    const idx = currentSetIndex(m);
    const s = m.sets[idx];
    const min = (idx===2 ? 15 : 25);
    // if set finished, compute match winner
    const wins = setWins(m);
    if (wins.a>=2) {
      m.status = "finished";
      m.winner = "a";
    } else if (wins.b>=2) {
      m.status = "finished";
      m.winner = "b";
    } else {
      // if current set became finishable, leave it (wins computed already)
      // nothing else to do
    }
    return m;
  }

  function addPoint(match, side /*'a'|'b'*/, delta) {
    const m = emptyMatchPatch(match);
    if (m.status === "finished" || m.status === "confirmed") return m;

    const idx = currentSetIndex(m);
    const s = m.sets[idx];

    // apply delta
    s[side] = Math.max(0, (+s[side] || 0) + delta);

    // point-by-point event log (for PRO stats)
    // We only log +/-1 changes (court uses step 1). For safety, we treat any positive delta as one event.
    if (!Array.isArray(m.events)) m.events = [];

    if (delta > 0) {
      m.events.push({ ts: Date.now(), set: idx, side });
    } else if (delta < 0) {
      // remove the last matching event for this side in this set (best-effort undo)
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

  // Standings: only stage='group' and status='confirmed'
  function computeStandings(state) {
    const teams = state.teams || [];
    const matches = state.matches || [];
    const byId = new Map(teams.map(t => [t.id, t]));
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

      // points per set
      for (const s of (m.sets || [])) {
        A.pointsWon += +s.a||0; A.pointsLost += +s.b||0;
        B.pointsWon += +s.b||0; B.pointsLost += +s.a||0;
      }

      if (aSets > bSets) { A.wins++; B.losses++; }
      else { B.wins++; A.losses++; }

      // 3-2-1-0
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

    // group -> list
    const groups = {};
    for (const id in stats) {
      const s = stats[id];
      const g = s.group || "";
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    }

    // sorting with head-to-head fallback (simple for now: points, set diff, point ratio, name)
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

  // Generate basic playoffs bracket from group standings:
  // - takes top2 from each group (stage='group', status='confirmed')
  // - if 4 groups -> QF; if 2 groups -> SF
  // - creates SF, Final, 3rd place placeholders (teams filled when prior rounds confirmed)
  function generatePlayoffs(state, opts = {}) {
    const st = clone(state || {});
    if (!st.playoffs) st.playoffs = {};
    if (st.playoffs.generated && !opts.force) {
      return st;
    }

    const groups = computeStandings(st);
    const groupKeys = Object.keys(groups).sort((a,b)=>a.localeCompare(b, "pl"));
    const seeds = [];
    for (const g of groupKeys) {
      const arr = groups[g] || [];
      if (arr[0]?.teamId) seeds.push({ key: `${g}1`, teamId: arr[0].teamId, group:g, place:1 });
      if (arr[1]?.teamId) seeds.push({ key: `${g}2`, teamId: arr[1].teamId, group:g, place:2 });
    }

    // need at least 4 teams
    if (seeds.length < 4) {
      return st;
    }

    function mkMatch(stage, teamAId, teamBId, label) {
      const m = emptyMatchPatch({
        id: crypto.randomUUID(),
        stage,
        group: null,
        label: label || "",
        teamAId: teamAId || null,
        teamBId: teamBId || null,
        sets: [{a:0,b:0},{a:0,b:0},{a:0,b:0}],
        status: "pending",
        winner: null,
        claimedBy: null,
        claimedAt: null,
        updatedAt: new Date().toISOString()
      });
      return m;
    }

    const byGroup = {};
    for (const s of seeds) {
      byGroup[s.group] = byGroup[s.group] || {};
      byGroup[s.group][s.place] = s.teamId;
    }

    const matchesToAdd = [];
    const bracket = { qf: [], sf: [], final: null, third: null };
    const gk = Object.keys(byGroup).sort((a,b)=>a.localeCompare(b, "pl"));

    // Decide starting round
    const startRound = (gk.length >= 4) ? "quarterfinal" : "semifinal";

    if (startRound === "quarterfinal") {
      for (let i=0; i<gk.length; i+=2) {
        const g1 = gk[i], g2 = gk[i+1];
        if (!g2) break;
        const m1 = mkMatch("quarterfinal", byGroup[g1]?.[1], byGroup[g2]?.[2], `${g1}1 vs ${g2}2`);
        const m2 = mkMatch("quarterfinal", byGroup[g2]?.[1], byGroup[g1]?.[2], `${g2}1 vs ${g1}2`);
        matchesToAdd.push(m1, m2);
        bracket.qf.push(m1.id, m2.id);
      }
      // SF placeholders
      const sf1 = mkMatch("semifinal", null, null, "Półfinał 1");
      const sf2 = mkMatch("semifinal", null, null, "Półfinał 2");
      matchesToAdd.push(sf1, sf2);
      bracket.sf.push(sf1.id, sf2.id);
    } else {
      // directly semifinals from two groups
      const g1 = gk[0], g2 = gk[1];
      const sf1 = mkMatch("semifinal", byGroup[g1]?.[1], byGroup[g2]?.[2], `${g1}1 vs ${g2}2`);
      const sf2 = mkMatch("semifinal", byGroup[g2]?.[1], byGroup[g1]?.[2], `${g2}1 vs ${g1}2`);
      matchesToAdd.push(sf1, sf2);
      bracket.sf.push(sf1.id, sf2.id);
    }

    const fin = mkMatch("final", null, null, "Finał");
    const third = mkMatch("thirdplace", null, null, "Mecz o 3 miejsce");
    matchesToAdd.push(fin, third);
    bracket.final = fin.id;
    bracket.third = third.id;

    st.matches = Array.isArray(st.matches) ? st.matches.slice() : [];
    st.matches.push(...matchesToAdd);

    st.playoffs = {
      generated: true,
      generatedAt: new Date().toISOString(),
      seeds: seeds,
      bracket
    };

    return st;
  }

  function applyPlayoffsProgression(state) {
    const st = clone(state || {});
    if (!st.playoffs?.generated) return st;
    const idToMatch = new Map((st.matches||[]).map(m => [m.id, m]));
    const br = st.playoffs.bracket || {};
    function setTeams(matchId, aId, bId) {
      const m = idToMatch.get(matchId);
      if (!m) return;
      if (!m.teamAId) m.teamAId = aId || null;
      if (!m.teamBId) m.teamBId = bId || null;
      m.updatedAt = new Date().toISOString();
    }
    // determine winners/losers for qf -> sf
    if (Array.isArray(br.qf) && br.qf.length >= 2 && Array.isArray(br.sf) && br.sf.length >= 2) {
      const qf = br.qf.map(id => idToMatch.get(id)).filter(Boolean);
      const winners = qf.map(winnerTeamId);
      if (winners.length >= 4) {
        // Pair winners in order: (0,1)->sf1, (2,3)->sf2
        setTeams(br.sf[0], winners[0], winners[1]);
        setTeams(br.sf[1], winners[2], winners[3]);
      }
    }
    // sf -> final/third
    if (Array.isArray(br.sf) && br.sf.length >= 2 && br.final && br.third) {
      const sf1 = idToMatch.get(br.sf[0]);
      const sf2 = idToMatch.get(br.sf[1]);
      const w1 = sf1 ? winnerTeamId(sf1) : null;
      const w2 = sf2 ? winnerTeamId(sf2) : null;
      const l1 = sf1 ? ((w1 && sf1.teamAId && sf1.teamBId) ? (w1 === sf1.teamAId ? sf1.teamBId : sf1.teamAId) : null) : null;
      const l2 = sf2 ? ((w2 && sf2.teamAId && sf2.teamBId) ? (w2 === sf2.teamAId ? sf2.teamBId : sf2.teamAId) : null) : null;
      if (w1 && w2) setTeams(br.final, w1, w2);
      if (l1 && l2) setTeams(br.third, l1, l2);
    }
    // Write back
    st.matches = (st.matches||[]).map(m => idToMatch.get(m.id) || m);
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
    // group by set
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
    return best; // {side:'a'|'b'|null, value:number, set:number|null}
  }

  function lastPlayedSetIndex(match) {
    const m = emptyMatchPatch(match);
    // choose last set with any points
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
    // oldest -> newest
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
    applyPlayoffsProgression
    computeStreaks,
    computeMaxLead,
    computeLastPointsTimeline,
    lastPlayedSetIndex,
  };
})();
