// ============================================================
// Zastąp funkcje generatePlayoffs i applyPlayoffsProgression
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

  // Potrzebujemy grup A,B,C,D
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

  // === ĆWIERĆFINAŁY ===
  // QF1: A1 vs C2
  // QF2: B1 vs D2
  // QF3: C1 vs A2
  // QF4: D1 vs B2
  const qf1 = mkMatch("quarterfinal", byGroup[A]?.[1], byGroup[C]?.[2], "QF1: A1 vs C2");
  const qf2 = mkMatch("quarterfinal", byGroup[B]?.[1], byGroup[D]?.[2], "QF2: B1 vs D2");
  const qf3 = mkMatch("quarterfinal", byGroup[C]?.[1], byGroup[A]?.[2], "QF3: C1 vs A2");
  const qf4 = mkMatch("quarterfinal", byGroup[D]?.[1], byGroup[B]?.[2], "QF4: D1 vs B2");
  matchesToAdd.push(qf1, qf2, qf3, qf4);
  bracket.qf.push(qf1.id, qf2.id, qf3.id, qf4.id);

  // === PÓŁFINAŁY ===
  // SF1: zwycięzca QF1 vs zwycięzca QF2
  // SF2: zwycięzca QF3 vs zwycięzca QF4
  const sf1 = mkMatch("semifinal", null, null, "Półfinał 1 (QF1 vs QF2)");
  const sf2 = mkMatch("semifinal", null, null, "Półfinał 2 (QF3 vs QF4)");
  matchesToAdd.push(sf1, sf2);
  bracket.sf.push(sf1.id, sf2.id);

  // === FINAŁ i MECZ O 3. MIEJSCE ===
  const fin   = mkMatch("final",      null, null, "Finał");
  const third = mkMatch("thirdplace", null, null, "Mecz o 3. miejsce");
  matchesToAdd.push(fin, third);
  bracket.final = fin.id;
  bracket.third = third.id;

  // === MECZE O MIEJSCA 9-12 ===
  // p9a: B3 vs D3  (zwycięzca → miejsce 9-10, przegrany → 11-12)
  // p9b: A3 vs C3  (zwycięzca → miejsce 9-10, przegrany → 11-12)
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
    if (!m.teamAId) m.teamAId = aId || null;
    if (!m.teamBId) m.teamBId = bId || null;
    m.updatedAt = new Date().toISOString();
  }

  // QF -> SF
  // SF1 = winner(QF1) vs winner(QF2)
  // SF2 = winner(QF3) vs winner(QF4)
  if (br.qf?.length >= 4 && br.sf?.length >= 2) {
    setTeams(br.sf[0], winner(br.qf[0]), winner(br.qf[1]));
    setTeams(br.sf[1], winner(br.qf[2]), winner(br.qf[3]));
  }

  // SF -> Final / 3rd place
  if (br.sf?.length >= 2 && br.final && br.third) {
    setTeams(br.final, winner(br.sf[0]), winner(br.sf[1]));
    setTeams(br.third, loser(br.sf[0]),  loser(br.sf[1]));
  }

  return st;
}
