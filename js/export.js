// js/export.js
// XLSX export of tournament results. Pure data-building functions + SheetJS bridge.
// Loaded after engine.js; attaches window.VPExport.

(function () {
  const ENG = (typeof window !== "undefined") ? window.VPEngine : null;

  // ---------- helpers ----------
  function teamName(state, id) {
    if (!id) return "";
    const t = (state?.teams || []).find(x => x.id === id);
    return t ? t.name : "";
  }

  function fmtSetPts(sets) {
    return (sets || [])
      .map(s => `${(+s.a) || 0}:${(+s.b) || 0}`)
      .filter(pair => pair !== "0:0")
      .join(", ");
  }

  function stageLabel(stage) {
    switch (stage) {
      case "group":        return "Grupa";
      case "quarterfinal": return "Ćwierćfinał";
      case "semifinal":    return "Półfinał";
      case "final":        return "Finał";
      case "thirdplace":   return "Mecz o 3. miejsce";
      case "place9":       return "Miejsca 9-12";
      default:             return stage || "";
    }
  }

  function pluralMatches(n) {
    if (n === 1) return "mecz";
    const last2 = n % 100;
    const last = n % 10;
    if (last2 >= 12 && last2 <= 14) return "meczów";
    if (last >= 2 && last <= 4) return "mecze";
    return "meczów";
  }

  function countMissing(state) {
    const matches = Array.isArray(state?.matches) ? state.matches : [];
    return matches.filter(m => (m?.status || "pending") !== "confirmed").length;
  }

  function isReady(state) {
    const st = state || {};
    if (!st.playoffs?.generated) return false;
    const matches = Array.isArray(st.matches) ? st.matches : [];
    if (matches.length === 0) return false;
    return matches.every(m => m.status === "confirmed");
  }

  function matchWinner(state, match) {
    const sum = ENG.scoreSummary(match);
    if (sum.setsA > sum.setsB) return match.teamAId || null;
    if (sum.setsB > sum.setsA) return match.teamBId || null;
    return null;
  }
  function matchLoser(state, match) {
    const w = matchWinner(state, match);
    if (!w) return null;
    return w === match.teamAId ? (match.teamBId || null) : (match.teamAId || null);
  }

  // ---------- sheet builders ----------

  function buildFinalRanking(state) {
    const st = state || {};
    const matches = (st.matches || []).map(m => ENG.emptyMatchPatch(m));
    const byId = new Map(matches.map(m => [m.id, m]));
    const br = st.playoffs?.bracket || {};

    function winById(matchId) {
      const m = byId.get(matchId);
      return m ? matchWinner(state, m) : null;
    }
    function loseById(matchId) {
      const m = byId.get(matchId);
      return m ? matchLoser(state, m) : null;
    }

    const rank = [];

    // 1 & 2
    if (br.final) {
      const w = winById(br.final);
      const l = loseById(br.final);
      if (w) rank.push({ place: "1", teamId: w, teamName: teamName(state, w) });
      if (l) rank.push({ place: "2", teamId: l, teamName: teamName(state, l) });
    }
    // 3 & 4
    if (br.third) {
      const w = winById(br.third);
      const l = loseById(br.third);
      if (w) rank.push({ place: "3", teamId: w, teamName: teamName(state, w) });
      if (l) rank.push({ place: "4", teamId: l, teamName: teamName(state, l) });
    }
    // 5-8 (QF losers)
    if (Array.isArray(br.qf)) {
      for (const id of br.qf) {
        const l = loseById(id);
        if (l) rank.push({ place: "5-8", teamId: l, teamName: teamName(state, l) });
      }
    }
    // 9-10 & 11-12 (place9 winners/losers)
    if (Array.isArray(br.place9)) {
      for (const id of br.place9) {
        const w = winById(id);
        const l = loseById(id);
        if (w) rank.push({ place: "9-10",  teamId: w, teamName: teamName(state, w) });
        if (l) rank.push({ place: "11-12", teamId: l, teamName: teamName(state, l) });
      }
    }
    return rank;
  }

  function buildSummarySheet(state) {
    const meta = state?.meta || {};
    const teams = state?.teams || [];
    const matches = state?.matches || [];
    const groupMatches   = matches.filter(m => m.stage === "group");
    const playoffMatches = matches.filter(m => m.stage !== "group");

    const rank = buildFinalRanking(state);
    const champion = rank.find(r => r.place === "1")?.teamName || "";
    const vice     = rank.find(r => r.place === "2")?.teamName || "";
    const third    = rank.find(r => r.place === "3")?.teamName || "";

    return [
      ["VolleyballPro — raport końcowy"],
      [""],
      ["Nazwa turnieju",      meta.name || "(bez nazwy)"],
      ["Data eksportu",       new Date().toLocaleString("pl-PL")],
      ["Liczba zespołów",     teams.length],
      ["Mecze — łącznie",     matches.length],
      ["Mecze — grupowe",     groupMatches.length],
      ["Mecze — playoff",     playoffMatches.length],
      [""],
      ["🏆 Zwycięzca",        champion],
      ["🥈 Wicemistrz",       vice],
      ["🥉 3. miejsce",       third],
    ];
  }

  function buildTeamsSheet(state) {
    const rows = [["Grupa", "Nazwa zespołu"]];
    const teams = (state?.teams || []).slice().sort((a, b) => {
      const g = (a.group || "").localeCompare(b.group || "", "pl");
      if (g !== 0) return g;
      return (a.name || "").localeCompare(b.name || "", "pl");
    });
    for (const t of teams) rows.push([t.group || "", t.name || ""]);
    return rows;
  }

  function buildGroupMatchesSheet(state) {
    const rows = [["Grupa", "Boisko", "Godzina", "Drużyna A", "Drużyna B", "Sety", "Punkty", "Zwycięzca", "Status"]];
    const matches = (state?.matches || [])
      .filter(m => m.stage === "group")
      .map(m => ENG.emptyMatchPatch(m))
      .sort((a, b) => {
        const g = (a.group || "").localeCompare(b.group || "", "pl");
        if (g !== 0) return g;
        const c = (a.court || "").localeCompare(b.court || "", "pl");
        if (c !== 0) return c;
        return (a.scheduledAt || "").localeCompare(b.scheduledAt || "");
      });
    for (const m of matches) {
      const sum = ENG.scoreSummary(m);
      const winId = matchWinner(state, m);
      rows.push([
        m.group || "",
        m.court || "",
        m.scheduledAt || "",
        teamName(state, m.teamAId),
        teamName(state, m.teamBId),
        `${sum.setsA}:${sum.setsB}`,
        fmtSetPts(m.sets),
        winId ? teamName(state, winId) : "",
        m.status || "pending",
      ]);
    }
    return rows;
  }

  function buildStandingsSheet(state) {
    const groups = ENG.computeStandings(state);
    const rows = [[
      "Grupa", "Miejsce", "Zespół",
      "Mecze", "Zwycięstwa", "Porażki", "Pkt.",
      "Sety wyg.", "Sety przeg.", "Bilans setów",
      "Małe pkt wyg.", "Małe pkt przeg.", "Bilans małych pkt"
    ]];
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pl"));
    for (const g of keys) {
      if (!g) continue;
      const arr = groups[g] || [];
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        rows.push([
          g, i + 1, s.name,
          s.played, s.wins, s.losses, s.tablePoints,
          s.setsWon, s.setsLost, s.setsWon - s.setsLost,
          s.pointsWon, s.pointsLost, s.pointsWon - s.pointsLost
        ]);
      }
      rows.push([]);
    }
    return rows;
  }

  function buildPlayoffSheet(state) {
    const rows = [["Faza", "Opis meczu", "Boisko", "Godzina", "Drużyna A", "Drużyna B", "Sety", "Punkty", "Zwycięzca", "Status"]];
    const stageOrder = { quarterfinal: 1, semifinal: 2, final: 3, thirdplace: 4, place9: 5 };
    const playoffs = (state?.matches || [])
      .filter(m => m.stage !== "group")
      .map(m => ENG.emptyMatchPatch(m))
      .sort((a, b) => {
        const s = (stageOrder[a.stage] || 99) - (stageOrder[b.stage] || 99);
        if (s !== 0) return s;
        const c = (a.court || "").localeCompare(b.court || "", "pl");
        if (c !== 0) return c;
        return (a.scheduledAt || "").localeCompare(b.scheduledAt || "");
      });
    for (const m of playoffs) {
      const sum = ENG.scoreSummary(m);
      const winId = matchWinner(state, m);
      rows.push([
        stageLabel(m.stage),
        m.label || "",
        m.court || "",
        m.scheduledAt || "",
        teamName(state, m.teamAId),
        teamName(state, m.teamBId),
        `${sum.setsA}:${sum.setsB}`,
        fmtSetPts(m.sets),
        winId ? teamName(state, winId) : "",
        m.status || "pending",
      ]);
    }
    return rows;
  }

  function buildFinalRankingSheet(state) {
    const rows = [["Miejsce", "Zespół"]];
    for (const r of buildFinalRanking(state)) {
      rows.push([r.place, r.teamName]);
    }
    return rows;
  }

  function buildExportData(state) {
    return {
      ready: isReady(state),
      missing: countMissing(state),
      sheets: {
        "Podsumowanie":          buildSummarySheet(state),
        "Zespoły":               buildTeamsSheet(state),
        "Faza grupowa":          buildGroupMatchesSheet(state),
        "Tabele grup":           buildStandingsSheet(state),
        "Playoff":               buildPlayoffSheet(state),
        "Klasyfikacja końcowa": buildFinalRankingSheet(state),
      }
    };
  }

  // ---------- XLSX generation (browser-only) ----------

  function exportXlsx(state, slug) {
    if (typeof window === "undefined" || !window.XLSX) {
      throw new Error("Biblioteka SheetJS nie została załadowana.");
    }
    const data = buildExportData(state);
    if (!data.ready) {
      const err = new Error(`Nie można eksportować — ${data.missing} ${pluralMatches(data.missing)} nie zostało jeszcze potwierdzonych.`);
      err.missing = data.missing;
      throw err;
    }

    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    for (const [name, rows] of Object.entries(data.sheets)) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const cols = rows[0]?.length || 0;
      const colWidths = [];
      for (let c = 0; c < cols; c++) {
        let max = 0;
        for (const row of rows) {
          const v = row && row[c];
          const len = v == null ? 0 : String(v).length;
          if (len > max) max = len;
        }
        colWidths.push({ wch: Math.min(Math.max(max + 2, 8), 50) });
      }
      ws["!cols"] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    const safeSlug = (slug || "turniej").replace(/[^a-z0-9_-]/gi, "_");
    const ts = new Date().toISOString().slice(0, 10);
    const filename = `wyniki_${safeSlug}_${ts}.xlsx`;
    XLSX.writeFile(wb, filename);
    return filename;
  }

  // ---------- Button wiring (browser-only) ----------

  function getSlug() {
    try {
      const u = new URL(window.location.href);
      return (u.searchParams.get("t") || "").trim();
    } catch { return ""; }
  }

  function bindExportButton(btn, getState) {
    if (!btn || btn._vpBound) return;
    btn._vpBound = true;
    btn.addEventListener("click", () => {
      try {
        const state = getState();
        const filename = exportXlsx(state, getSlug());
        const toast = window.VP_UTIL?.toast;
        if (toast) toast(`Wyeksportowano: ${filename}`, "success");
      } catch (e) {
        const msg = e?.message || String(e);
        const toast = window.VP_UTIL?.toast;
        if (toast) toast(msg, "error");
        else console.error(msg);
      }
    });
  }

  function updateExportButton(btn, state) {
    if (!btn) return;
    const data = buildExportData(state || {});
    if (data.ready) {
      btn.disabled = false;
      btn.title = "Gotowe — pobierz raport XLSX";
      btn.textContent = "📥 Pobierz wyniki (XLSX)";
    } else {
      btn.disabled = true;
      const miss = data.missing;
      const noun = pluralMatches(miss);
      if (miss === 0) {
        btn.title = "Eksport dostępny po wygenerowaniu drabinki playoff.";
        btn.textContent = "📥 Pobierz wyniki (XLSX) · czeka na playoff";
      } else {
        btn.title = `Eksport będzie dostępny po zakończeniu wszystkich meczów. Pozostało: ${miss} ${noun}.`;
        btn.textContent = `📥 Pobierz wyniki (XLSX) · ${miss} ${noun} do zakończenia`;
      }
    }
  }

  const api = {
    buildExportData,
    buildFinalRanking,
    buildSummarySheet,
    buildTeamsSheet,
    buildGroupMatchesSheet,
    buildStandingsSheet,
    buildPlayoffSheet,
    buildFinalRankingSheet,
    exportXlsx,
    bindExportButton,
    updateExportButton,
    isReady,
    countMissing,
    pluralMatches,
  };

  if (typeof window !== "undefined") {
    window.VPExport = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
