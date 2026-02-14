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
    s[side] = Math.max(0, (+s[side]||0) + delta);
    // auto-finish set? (we don't store explicit set-finish flags; rules infer from points)
    // if either side reached min and 2-pt lead, set is finished; match may be finished too
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

  window.VPEngine = {
    emptyMatchPatch,
    addPoint,
    resetCurrentSet,
    markLive,
    confirmMatch,
    scoreSummary,
    currentSetIndex,
    computeStandings
  };
})();
