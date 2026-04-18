// tests/engine.test.js
// Unit tests for js/engine.js — pure volleyball rules and tournament logic.
// Run with:  npm test   (or)   node --test tests/

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, makeMatch, playMatch, run } = require("./harness");

const E = loadEngine();

// ---------------------------------------------------------------------------
// emptyMatchPatch — normalization
// ---------------------------------------------------------------------------
describe("emptyMatchPatch", () => {
  test("creates three empty sets when missing", () => {
    const m = E.emptyMatchPatch({});
    assert.equal(m.sets.length, 3);
    for (const s of m.sets) assert.deepEqual(s, { a: 0, b: 0 });
  });

  test("wipes sets if the provided array is not exactly length 3", () => {
    // Documents the current (strict) normalization behavior of engine.js:
    // anything other than length===3 is replaced with three empty sets.
    const tooMany = E.emptyMatchPatch({
      sets: [
        { a: 25, b: 10 },
        { a: 25, b: 12 },
        { a: 15, b: 8 },
        { a: 99, b: 99 },
      ],
    });
    assert.equal(tooMany.sets.length, 3);
    assert.deepEqual(tooMany.sets, [
      { a: 0, b: 0 },
      { a: 0, b: 0 },
      { a: 0, b: 0 },
    ]);

    const tooFew = E.emptyMatchPatch({ sets: [{ a: "25", b: "23" }] });
    assert.deepEqual(tooFew.sets, [
      { a: 0, b: 0 },
      { a: 0, b: 0 },
      { a: 0, b: 0 },
    ]);
  });

  test("coerces set scores to numbers when given exactly 3 sets", () => {
    const m = E.emptyMatchPatch({
      sets: [
        { a: "25", b: "23" },
        { a: null, b: undefined },
        { a: 7, b: "9" },
      ],
    });
    assert.equal(m.sets[0].a, 25);
    assert.equal(m.sets[0].b, 23);
    assert.equal(m.sets[1].a, 0);
    assert.equal(m.sets[1].b, 0);
    assert.equal(m.sets[2].b, 9);
    assert.equal(m.status, "pending");
    assert.equal(m.stage, "group");
    assert.deepEqual(m.events, []);
    assert.equal(m.winner, null);
  });
});

// ---------------------------------------------------------------------------
// setWins / currentSetIndex — core volleyball rules
// ---------------------------------------------------------------------------
describe("setWins", () => {
  test("25:23 counts as a finished set for A", () => {
    const m = makeMatch({ sets: [{ a: 25, b: 23 }, { a: 0, b: 0 }, { a: 0, b: 0 }] });
    const w = E.scoreSummary(m);
    assert.deepEqual(w, { setsA: 1, setsB: 0 });
  });

  test("25:24 does NOT count — need 2 point advantage", () => {
    const m = makeMatch({ sets: [{ a: 25, b: 24 }, { a: 0, b: 0 }, { a: 0, b: 0 }] });
    const w = E.scoreSummary(m);
    assert.deepEqual(w, { setsA: 0, setsB: 0 });
  });

  test("extended set 27:25 counts", () => {
    const m = makeMatch({ sets: [{ a: 27, b: 25 }, { a: 0, b: 0 }, { a: 0, b: 0 }] });
    const w = E.scoreSummary(m);
    assert.deepEqual(w, { setsA: 1, setsB: 0 });
  });

  test("3rd set (tie-break) needs 15 points with 2-point lead", () => {
    const m = makeMatch({
      sets: [
        { a: 25, b: 20 },
        { a: 20, b: 25 },
        { a: 15, b: 13 },
      ],
    });
    assert.deepEqual(E.scoreSummary(m), { setsA: 2, setsB: 1 });
  });

  test("tie-break 14:12 is not enough", () => {
    const m = makeMatch({
      sets: [
        { a: 25, b: 20 },
        { a: 20, b: 25 },
        { a: 14, b: 12 },
      ],
    });
    assert.deepEqual(E.scoreSummary(m), { setsA: 1, setsB: 1 });
  });

  test("tie-break extended 17:15 counts", () => {
    const m = makeMatch({
      sets: [
        { a: 25, b: 20 },
        { a: 20, b: 25 },
        { a: 17, b: 15 },
      ],
    });
    assert.deepEqual(E.scoreSummary(m), { setsA: 2, setsB: 1 });
  });
});

describe("currentSetIndex", () => {
  test("new match points at set 0", () => {
    const m = E.emptyMatchPatch({});
    assert.equal(E.currentSetIndex(m), 0);
  });

  test("after one completed set, points at set 1", () => {
    const m = makeMatch({ sets: [{ a: 25, b: 20 }, { a: 0, b: 0 }, { a: 0, b: 0 }] });
    assert.equal(E.currentSetIndex(m), 1);
  });

  test("2-0 match → index 2 (but match is already decided)", () => {
    const m = makeMatch({
      sets: [
        { a: 25, b: 20 },
        { a: 25, b: 18 },
        { a: 0, b: 0 },
      ],
    });
    assert.equal(E.currentSetIndex(m), 2);
  });
});

// ---------------------------------------------------------------------------
// addPoint
// ---------------------------------------------------------------------------
describe("addPoint", () => {
  test("adds a single point to side A in set 0", () => {
    let m = E.emptyMatchPatch({});
    m = E.addPoint(m, "a", +1);
    assert.equal(m.sets[0].a, 1);
    assert.equal(m.sets[0].b, 0);
    assert.equal(m.events.length, 1);
    assert.equal(m.events[0].side, "a");
    assert.equal(m.events[0].set, 0);
  });

  test("negative delta removes the last matching event", () => {
    let m = E.emptyMatchPatch({});
    m = E.addPoint(m, "a", +1);
    m = E.addPoint(m, "b", +1);
    m = E.addPoint(m, "a", +1);
    m = E.addPoint(m, "a", -1);
    assert.equal(m.sets[0].a, 1);
    assert.equal(m.sets[0].b, 1);
    // one a-event removed → 2 events left
    assert.equal(m.events.length, 2);
  });

  test("cannot go below zero", () => {
    let m = E.emptyMatchPatch({});
    m = E.addPoint(m, "a", -1);
    assert.equal(m.sets[0].a, 0);
  });

  test("auto-finishes on 2:0 (A wins both sets 25:0 — edge case)", () => {
    // Minimal script that wins set 1 for A and then set 2 for A.
    // Using 25-0 rallies keeps the script short.
    let m = E.emptyMatchPatch(makeMatch());
    m = playMatch(E, m, [...run("a", 25), ...run("a", 25)]);
    assert.equal(m.status, "finished");
    assert.equal(m.winner, "a");
    assert.equal(E.scoreSummary(m).setsA, 2);
  });

  test("auto-finishes on 2:1 (tie-break decides)", () => {
    // Set 1: A wins 25:0; Set 2: B wins 25:0; Set 3: A wins 15:0.
    let m = E.emptyMatchPatch(makeMatch());
    m = playMatch(E, m, [
      ...run("a", 25),
      ...run("b", 25),
      ...run("a", 15),
    ]);
    assert.equal(m.status, "finished");
    assert.equal(m.winner, "a");
    assert.deepEqual(E.scoreSummary(m), { setsA: 2, setsB: 1 });
  });

  test("finished match does not accept further points", () => {
    let m = E.emptyMatchPatch(makeMatch());
    m = playMatch(E, m, [...run("a", 25), ...run("a", 25)]);
    const before = JSON.stringify(m.sets);
    m = E.addPoint(m, "b", +1);
    assert.equal(JSON.stringify(m.sets), before);
  });

  test("deuce: 25:25 does not end the set — must reach 2-point lead", () => {
    // Rally alternates A, B up to 25:25, then A scores twice → 27:25.
    const alt = [];
    for (let i = 0; i < 25; i++) {
      alt.push("a", "b");
    }
    let m = E.emptyMatchPatch(makeMatch());
    m = playMatch(E, m, alt); // 25:25
    assert.equal(m.status, "pending");
    assert.equal(m.sets[0].a, 25);
    assert.equal(m.sets[0].b, 25);

    m = E.addPoint(m, "a", +1); // 26:25 — still not finished
    assert.equal(E.scoreSummary(m).setsA, 0);

    m = E.addPoint(m, "a", +1); // 27:25 — set over
    assert.equal(E.scoreSummary(m).setsA, 1);
  });
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------
describe("state transitions", () => {
  test("markLive flips pending → live", () => {
    const m = E.markLive(makeMatch({ status: "pending" }));
    assert.equal(m.status, "live");
  });

  test("markLive is a no-op on live/finished/confirmed", () => {
    assert.equal(E.markLive(makeMatch({ status: "live" })).status, "live");
    assert.equal(E.markLive(makeMatch({ status: "finished" })).status, "finished");
    assert.equal(E.markLive(makeMatch({ status: "confirmed" })).status, "confirmed");
  });

  test("confirmMatch only moves finished → confirmed", () => {
    assert.equal(E.confirmMatch(makeMatch({ status: "finished" })).status, "confirmed");
    assert.equal(E.confirmMatch(makeMatch({ status: "pending" })).status, "pending");
    assert.equal(E.confirmMatch(makeMatch({ status: "live" })).status, "live");
  });

  test("resetCurrentSet zeros the in-progress set only", () => {
    let m = makeMatch({
      sets: [
        { a: 25, b: 20 },
        { a: 7, b: 3 },
        { a: 0, b: 0 },
      ],
    });
    m = E.resetCurrentSet(m);
    assert.deepEqual(m.sets[0], { a: 25, b: 20 }); // finished set preserved
    assert.deepEqual(m.sets[1], { a: 0, b: 0 }); // current set zeroed
  });

  test("resetCurrentSet is a no-op on finished matches", () => {
    const finished = makeMatch({
      sets: [
        { a: 25, b: 20 },
        { a: 25, b: 18 },
        { a: 0, b: 0 },
      ],
      status: "finished",
    });
    const out = E.resetCurrentSet(finished);
    assert.deepEqual(out.sets, finished.sets);
  });
});

// ---------------------------------------------------------------------------
// computeStandings — group ranking
// ---------------------------------------------------------------------------
describe("computeStandings", () => {
  function tourney(teams, matches) {
    return { teams, matches };
  }

  function confirmedMatch(overrides) {
    return makeMatch({ status: "confirmed", ...overrides });
  }

  test("ignores non-confirmed matches and non-group stages", () => {
    const state = tourney(
      [
        { id: "t1", name: "Team One", group: "A" },
        { id: "t2", name: "Team Two", group: "A" },
      ],
      [
        confirmedMatch({
          teamAId: "t1",
          teamBId: "t2",
          sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
          stage: "quarterfinal", // wrong stage
        }),
        makeMatch({
          teamAId: "t1",
          teamBId: "t2",
          sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
          status: "finished", // not confirmed
        }),
      ]
    );
    const g = E.computeStandings(state);
    assert.equal(g.A[0].played, 0);
    assert.equal(g.A[1].played, 0);
  });

  test("2:0 win awards 3 tablePoints to winner, 0 to loser", () => {
    const state = tourney(
      [
        { id: "t1", name: "Alfa", group: "A" },
        { id: "t2", name: "Beta", group: "A" },
      ],
      [
        confirmedMatch({
          teamAId: "t1",
          teamBId: "t2",
          sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
        }),
      ]
    );
    const g = E.computeStandings(state);
    const byId = Object.fromEntries(g.A.map((r) => [r.teamId, r]));
    assert.equal(byId.t1.tablePoints, 3);
    assert.equal(byId.t2.tablePoints, 0);
    assert.equal(byId.t1.wins, 1);
    assert.equal(byId.t2.losses, 1);
  });

  test("2:1 win awards 2 to winner, 1 to loser", () => {
    const state = tourney(
      [
        { id: "t1", name: "Alfa", group: "A" },
        { id: "t2", name: "Beta", group: "A" },
      ],
      [
        confirmedMatch({
          teamAId: "t1",
          teamBId: "t2",
          sets: [{ a: 25, b: 20 }, { a: 20, b: 25 }, { a: 15, b: 13 }],
        }),
      ]
    );
    const g = E.computeStandings(state);
    const byId = Object.fromEntries(g.A.map((r) => [r.teamId, r]));
    assert.equal(byId.t1.tablePoints, 2);
    assert.equal(byId.t2.tablePoints, 1);
  });

  test("sorts by tablePoints, then set diff, then point ratio", () => {
    // Three teams: T1 beats T2 2:0, T2 beats T3 2:0, T1 beats T3 2:1.
    // Expected: T1 (6 pts, +3 sets), T2 (3 pts, 0 sets), T3 (1 pt, -3 sets).
    const state = tourney(
      [
        { id: "t1", name: "Alfa", group: "A" },
        { id: "t2", name: "Beta", group: "A" },
        { id: "t3", name: "Gamma", group: "A" },
      ],
      [
        makeMatch({
          status: "confirmed",
          teamAId: "t1",
          teamBId: "t2",
          sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
        }),
        makeMatch({
          status: "confirmed",
          teamAId: "t2",
          teamBId: "t3",
          sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
        }),
        makeMatch({
          status: "confirmed",
          teamAId: "t1",
          teamBId: "t3",
          sets: [{ a: 25, b: 20 }, { a: 20, b: 25 }, { a: 15, b: 10 }],
        }),
      ]
    );
    const g = E.computeStandings(state);
    const order = g.A.map((r) => r.teamId);
    assert.deepEqual(order, ["t1", "t2", "t3"]);
    assert.equal(g.A[0].tablePoints, 5); // 3 (t1 vs t2) + 2 (t1 vs t3, 2:1)
    assert.equal(g.A[1].tablePoints, 3);
    assert.equal(g.A[2].tablePoints, 1);
  });
});

// ---------------------------------------------------------------------------
// generatePlayoffs & applyPlayoffsProgression
// ---------------------------------------------------------------------------
describe("generatePlayoffs", () => {
  function fullGroupState() {
    const groups = ["A", "B", "C", "D"];
    const teams = [];
    for (const g of groups) {
      for (let i = 1; i <= 3; i++) {
        teams.push({ id: `${g}${i}`, name: `${g}${i}`, group: g });
      }
    }
    // Build confirmed matches such that in every group team#1 > team#2 > team#3.
    // Each team plays the two others in its group.
    const matches = [];
    for (const g of groups) {
      matches.push(
        makeMatch({
          group: g,
          stage: "group",
          status: "confirmed",
          teamAId: `${g}1`,
          teamBId: `${g}2`,
          sets: [{ a: 25, b: 20 }, { a: 25, b: 22 }, { a: 0, b: 0 }],
        }),
        makeMatch({
          group: g,
          stage: "group",
          status: "confirmed",
          teamAId: `${g}1`,
          teamBId: `${g}3`,
          sets: [{ a: 25, b: 18 }, { a: 25, b: 19 }, { a: 0, b: 0 }],
        }),
        makeMatch({
          group: g,
          stage: "group",
          status: "confirmed",
          teamAId: `${g}2`,
          teamBId: `${g}3`,
          sets: [{ a: 25, b: 18 }, { a: 25, b: 19 }, { a: 0, b: 0 }],
        })
      );
    }
    return { teams, matches };
  }

  test("creates 4 QF, 2 SF, final, third place, 2 place9 matches", () => {
    const st = E.generatePlayoffs(fullGroupState());
    assert.equal(st.playoffs.generated, true);
    assert.equal(st.playoffs.bracket.qf.length, 4);
    assert.equal(st.playoffs.bracket.sf.length, 2);
    assert.ok(st.playoffs.bracket.final);
    assert.ok(st.playoffs.bracket.third);
    assert.equal(st.playoffs.bracket.place9.length, 2);

    const added = st.matches.filter((m) => m.stage !== "group");
    assert.equal(added.length, 4 + 2 + 1 + 1 + 2);
  });

  test("QF crosses: A1 vs C2, B1 vs D2, C1 vs A2, D1 vs B2", () => {
    const st = E.generatePlayoffs(fullGroupState());
    const qf = st.playoffs.bracket.qf.map((id) =>
      st.matches.find((m) => m.id === id)
    );
    assert.deepEqual(
      qf.map((m) => [m.teamAId, m.teamBId]),
      [
        ["A1", "C2"],
        ["B1", "D2"],
        ["C1", "A2"],
        ["D1", "B2"],
      ]
    );
  });

  test("force=false is idempotent on a second call", () => {
    const st1 = E.generatePlayoffs(fullGroupState());
    const qfCount1 = st1.matches.filter((m) => m.stage === "quarterfinal").length;
    const st2 = E.generatePlayoffs(st1);
    const qfCount2 = st2.matches.filter((m) => m.stage === "quarterfinal").length;
    assert.equal(qfCount1, 4);
    assert.equal(qfCount2, 4); // no duplicates
  });

  test("place9: B3 vs D3 and A3 vs C3", () => {
    const st = E.generatePlayoffs(fullGroupState());
    const [m1, m2] = st.playoffs.bracket.place9.map((id) =>
      st.matches.find((m) => m.id === id)
    );
    assert.deepEqual([m1.teamAId, m1.teamBId], ["B3", "D3"]);
    assert.deepEqual([m2.teamAId, m2.teamBId], ["A3", "C3"]);
  });
});

describe("applyPlayoffsProgression", () => {
  function bracketState() {
    // Re-use generator output, then simulate completed QFs.
    const groups = ["A", "B", "C", "D"];
    const teams = [];
    for (const g of groups) for (let i = 1; i <= 3; i++) teams.push({ id: `${g}${i}`, name: `${g}${i}`, group: g });
    const matches = [];
    for (const g of groups) {
      matches.push(
        makeMatch({ group: g, stage: "group", status: "confirmed", teamAId: `${g}1`, teamBId: `${g}2`, sets: [{ a: 25, b: 0 }, { a: 25, b: 0 }, { a: 0, b: 0 }] }),
        makeMatch({ group: g, stage: "group", status: "confirmed", teamAId: `${g}1`, teamBId: `${g}3`, sets: [{ a: 25, b: 0 }, { a: 25, b: 0 }, { a: 0, b: 0 }] }),
        makeMatch({ group: g, stage: "group", status: "confirmed", teamAId: `${g}2`, teamBId: `${g}3`, sets: [{ a: 25, b: 0 }, { a: 25, b: 0 }, { a: 0, b: 0 }] }),
      );
    }
    return E.generatePlayoffs({ teams, matches });
  }

  test("QF winners flow into SF slots; SF winners into final; SF losers into 3rd place", () => {
    let st = bracketState();
    // Let the "A-side" seed win every quarter-final 2:0.
    const qfIds = st.playoffs.bracket.qf;
    st.matches = st.matches.map((m) => {
      if (!qfIds.includes(m.id)) return m;
      return {
        ...m,
        sets: [{ a: 25, b: 10 }, { a: 25, b: 10 }, { a: 0, b: 0 }],
        status: "confirmed",
      };
    });
    st = E.applyPlayoffsProgression(st);

    const byId = Object.fromEntries(st.matches.map((m) => [m.id, m]));
    const sf0 = byId[st.playoffs.bracket.sf[0]];
    const sf1 = byId[st.playoffs.bracket.sf[1]];
    // SF1 takes winners of QF1 and QF2; SF2 takes winners of QF3 and QF4.
    assert.equal(sf0.teamAId, "A1"); // QF1 winner
    assert.equal(sf0.teamBId, "B1"); // QF2 winner
    assert.equal(sf1.teamAId, "C1"); // QF3 winner
    assert.equal(sf1.teamBId, "D1"); // QF4 winner

    // Now settle the SFs: SF winners go to final, losers to 3rd place.
    st.matches = st.matches.map((m) => {
      if (m.id !== sf0.id && m.id !== sf1.id) return m;
      return {
        ...m,
        sets: [{ a: 25, b: 10 }, { a: 25, b: 10 }, { a: 0, b: 0 }],
        status: "confirmed",
      };
    });
    st = E.applyPlayoffsProgression(st);
    const byId2 = Object.fromEntries(st.matches.map((m) => [m.id, m]));
    const fin = byId2[st.playoffs.bracket.final];
    const third = byId2[st.playoffs.bracket.third];
    assert.deepEqual([fin.teamAId, fin.teamBId], ["A1", "C1"]);
    assert.deepEqual([third.teamAId, third.teamBId], ["B1", "D1"]);
  });
});

// ---------------------------------------------------------------------------
// Stats: streaks, max lead, timeline
// ---------------------------------------------------------------------------
describe("stats helpers", () => {
  test("computeStreaks returns longest run for each side", () => {
    const m = makeMatch();
    const ev = [
      { ts: 1, set: 0, side: "a" },
      { ts: 2, set: 0, side: "a" },
      { ts: 3, set: 0, side: "a" },
      { ts: 4, set: 0, side: "b" },
      { ts: 5, set: 0, side: "a" },
      { ts: 6, set: 0, side: "b" },
      { ts: 7, set: 0, side: "b" },
    ];
    m.events = ev;
    const s = E.computeStreaks(m);
    assert.equal(s.bestA, 3);
    assert.equal(s.bestB, 2);
    assert.equal(s.currentSide, "b");
    assert.equal(s.currentLen, 2);
  });

  test("computeMaxLead tracks biggest absolute lead per set", () => {
    const m = makeMatch();
    // Set 0: A scores 5 in a row → lead = 5 for A.
    // Set 1: sequence ends at +2 for B.
    m.events = [
      { ts: 1, set: 0, side: "a" },
      { ts: 2, set: 0, side: "a" },
      { ts: 3, set: 0, side: "a" },
      { ts: 4, set: 0, side: "a" },
      { ts: 5, set: 0, side: "a" },
      { ts: 6, set: 1, side: "b" },
      { ts: 7, set: 1, side: "b" },
      { ts: 8, set: 1, side: "a" },
      { ts: 9, set: 1, side: "b" },
    ];
    const lead = E.computeMaxLead(m);
    assert.equal(lead.side, "a");
    assert.equal(lead.value, 5);
    assert.equal(lead.set, 0);
  });

  test("computeLastPointsTimeline returns the tail of events for a set", () => {
    const m = makeMatch();
    m.events = [
      { ts: 1, set: 0, side: "a" },
      { ts: 2, set: 0, side: "b" },
      { ts: 3, set: 0, side: "a" },
      { ts: 4, set: 0, side: "a" },
      { ts: 5, set: 0, side: "b" },
      { ts: 6, set: 1, side: "a" }, // different set — ignored
    ];
    const line = E.computeLastPointsTimeline(m, 0, 3);
    assert.deepEqual(line, ["a", "a", "b"]);
  });

  test("lastPlayedSetIndex picks the most recent non-empty set", () => {
    const m = makeMatch({
      sets: [
        { a: 25, b: 20 },
        { a: 10, b: 8 },
        { a: 0, b: 0 },
      ],
    });
    assert.equal(E.lastPlayedSetIndex(m), 1);
  });
});

// ---------------------------------------------------------------------------
// Integration: full match & tournament flow
// ---------------------------------------------------------------------------
describe("integration — full match flow", () => {
  test("pending → live → finished → confirmed", () => {
    let m = E.emptyMatchPatch(makeMatch());
    assert.equal(m.status, "pending");

    m = E.markLive(m);
    assert.equal(m.status, "live");

    // Play to 2:0.
    m = playMatch(E, m, [...run("a", 25), ...run("a", 25)]);
    assert.equal(m.status, "finished");
    assert.equal(m.winner, "a");

    m = E.confirmMatch(m);
    assert.equal(m.status, "confirmed");
  });

  test("round-robin of 3 teams produces a coherent standings table", () => {
    const teams = [
      { id: "t1", name: "Alfa", group: "A" },
      { id: "t2", name: "Beta", group: "A" },
      { id: "t3", name: "Gamma", group: "A" },
    ];
    // Drive matches through addPoint to exercise the whole pipeline, then confirm.
    function drive(teamAId, teamBId, script) {
      let m = E.emptyMatchPatch(makeMatch({ teamAId, teamBId, stage: "group", group: "A" }));
      m = E.markLive(m);
      m = playMatch(E, m, script);
      m = E.confirmMatch(m);
      return m;
    }
    const matches = [
      drive("t1", "t2", [...run("a", 25), ...run("a", 25)]), // 2:0
      drive("t2", "t3", [...run("a", 25), ...run("a", 25)]), // 2:0
      drive("t1", "t3", [...run("a", 25), ...run("b", 25), ...run("a", 15)]), // 2:1
    ];
    const g = E.computeStandings({ teams, matches });
    assert.deepEqual(
      g.A.map((r) => r.teamId),
      ["t1", "t2", "t3"]
    );
    assert.equal(g.A[0].tablePoints, 3 + 2); // 2:0 + 2:1
    assert.equal(g.A[1].tablePoints, 3);
    assert.equal(g.A[2].tablePoints, 1);
  });
});
