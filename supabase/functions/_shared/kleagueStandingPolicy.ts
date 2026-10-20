export interface PolicyStanding {
  teamId: string;
  providerRank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  statisticsComplete: boolean;
}

export interface KleagueStandingRankResolution {
  source: 'provider' | 'kleague-rule-prefix' | 'needs-verification';
  ranks: Record<string, number> | null;
  reasons: string[];
  comparisons: {
    teamId: string;
    providerRank: number;
    calculatedRank: number | null;
  }[];
}

const numericFields = [
  'played',
  'won',
  'drawn',
  'lost',
  'goalsFor',
  'goalsAgainst',
  'goalDifference',
  'points',
] as const;

// 2026 K2 competition rules, articles 5, 28 and 30:
// https://www.kleague.com/about/competition.do
// The remaining head-to-head, penalty-point and draw stages need evidence
// that this provider standings payload does not contain.
function compareRulePrefix(a: PolicyStanding, b: PolicyStanding): number {
  return (
    b.points - a.points ||
    b.goalsFor - a.goalsFor ||
    b.goalDifference - a.goalDifference ||
    b.won - a.won
  );
}

export function resolveKleagueStandingRanks({
  leagueId,
  season,
  standings,
  rankingAdjustmentDetected = false,
}: {
  leagueId: string;
  season: number;
  standings: PolicyStanding[];
  rankingAdjustmentDetected?: boolean;
}): KleagueStandingRankResolution {
  const comparisons: KleagueStandingRankResolution['comparisons'] =
    standings.map(row => ({
      teamId: row.teamId,
      providerRank: row.providerRank,
      calculatedRank: null,
    }));

  // Other seasons and K1's split groups require their own verified rules.
  if (leagueId !== 'kleague2' || season !== 2026) {
    return {
      source: 'provider',
      ranks: Object.fromEntries(
        standings.map(row => [row.teamId, row.providerRank]),
      ),
      reasons: [
        `Rule-prefix scope is kleague2 season 2026 only; preserving provider ranks for ${leagueId} season ${season}.`,
      ],
      comparisons,
    };
  }

  const reasons: string[] = [];
  if (rankingAdjustmentDetected) {
    reasons.push(
      'Known official or manual ranking adjustment requires verification before writing any standings row.',
    );
  }
  if (standings.length !== 17) {
    reasons.push(
      `Expected exactly 17 standings rows; received ${standings.length}.`,
    );
  }
  if (new Set(standings.map(row => row.teamId)).size !== standings.length) {
    reasons.push('Expected distinct team IDs for every standings row.');
  }
  if (
    standings.some(
      row => typeof row.teamId !== 'string' || row.teamId.trim() === '',
    )
  ) {
    reasons.push('Every standings row must have a nonempty teamId.');
  }
  if (
    new Set(standings.map(row => row.providerRank)).size !== 17 ||
    standings.some(
      row =>
        !Number.isInteger(row.providerRank) ||
        row.providerRank < 1 ||
        row.providerRank > 17,
    )
  ) {
    reasons.push('Expected unique provider ranks covering exactly 1..17.');
  }

  for (const row of standings) {
    if (row.statisticsComplete !== true) {
      reasons.push(
        `Missing complete observed statistics evidence for ${row.teamId}.`,
      );
    }
    const invalidFields = numericFields.filter(
      field =>
        !Number.isFinite(row[field]) ||
        !Number.isInteger(row[field]) ||
        (field !== 'goalDifference' && row[field] < 0),
    );
    if (invalidFields.length > 0) {
      reasons.push(
        `Invalid statistics for ${row.teamId}: ${invalidFields.join(
          ', ',
        )} must be finite integers and counts must be nonnegative.`,
      );
      continue;
    }
    if (row.played !== row.won + row.drawn + row.lost) {
      reasons.push(
        `played does not equal won + drawn + lost for ${row.teamId}.`,
      );
    }
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) {
      reasons.push(
        `goalDifference does not equal goalsFor - goalsAgainst for ${row.teamId}.`,
      );
    }
    if (row.points !== row.won * 3 + row.drawn) {
      reasons.push(
        `points do not equal 3 * won + drawn for ${row.teamId}; disciplinary or other adjustments need verification.`,
      );
    }
  }

  // Never calculate even partial replacement ranks from unverified evidence.
  if (reasons.length > 0) {
    return { source: 'needs-verification', ranks: null, reasons, comparisons };
  }

  const ordered = [...standings].sort(compareRulePrefix);
  for (let index = 1; index < ordered.length; index += 1) {
    if (compareRulePrefix(ordered[index - 1], ordered[index]) === 0) {
      reasons.push(
        `Unresolved rule-prefix tie between ${ordered[index - 1].teamId} and ${
          ordered[index].teamId
        }; head-to-head, penalty points or draw evidence is required.`,
      );
    }
  }
  if (reasons.length > 0) {
    return { source: 'needs-verification', ranks: null, reasons, comparisons };
  }

  const ranks: Record<string, number> = Object.fromEntries(
    ordered.map((row, index) => [row.teamId, index + 1]),
  );
  return {
    source: 'kleague-rule-prefix',
    ranks,
    reasons: [
      '2026 K League 2 ranks resolved by points, goals scored, goal difference and wins; no later tiebreaker was required.',
    ],
    comparisons: comparisons.map(row => ({
      ...row,
      calculatedRank: ranks[row.teamId],
    })),
  };
}
