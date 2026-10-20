const SUWON_FC_AUXILIARY_PROVIDER_VENUE_ID = 338695;
const SUWON_FC_MAIN_STADIUM_ID = 'sportmonks-venue-14076';
const RELOCATED_ASAN_SUWON_FIXTURE_ID = 19676302;
const YI_SUN_SIN_STADIUM_ID = 'sportmonks-venue-14115';
const GANGNEUNG_STADIUM_ID = 'api-venue-5166';
// Individually verified against the K League 2026 schedule on 2026-09-29.
// Keep historical fixtures, away games and newly reported venues unchanged.
const VERIFIED_GANGWON_2026_FIXTURES = new Set([
  19648199, 19648144, 19648083, 19648056, 19648104, 19648051, 19648042,
]);

export type FixtureVenueContext = {
  fixtureId: string;
  awayTeamId: string | undefined;
  kickoffAt: string;
  leagueId: string;
  season: number;
  observedAt: string;
};

// Fixture-specific official evidence, not a club's default home ground.
// Date guards use Korea's match date; the 11/29 kickoff time is still TBD.
const OFFICIAL_FIXTURE_VENUES = [
  {
    providerFixtureId: 19648065,
    fixtureId: 'sportmonks-19648065',
    homeTeamId: 'pohang',
    awayTeamId: 'gimcheon',
    date: '2026-09-09',
    leagueId: 'kleague',
    season: 2026,
    stadiumId: 'sangju-civic-stadium',
    source: 'https://www.kleague.com/news_view.do?seq=96195',
    reason: 'Official relocation of this Pohang home fixture to Sangju',
  },
  {
    providerFixtureId: 19676300,
    fixtureId: 'sportmonks-19676300',
    homeTeamId: 'cheonan-city',
    awayTeamId: 'ansan-greeners',
    date: '2026-10-25',
    leagueId: 'kleague2',
    season: 2026,
    stadiumId: 'sportmonks-venue-14080',
    source: 'https://www.kleague.com/schedule.do',
    reason:
      'Official 2026 schedule identifies Cheonan Stadium for this fixture',
  },
  {
    providerFixtureId: 19676283,
    fixtureId: 'sportmonks-19676283',
    homeTeamId: 'cheonan-city',
    awayTeamId: 'busan-ipark',
    date: '2026-11-08',
    leagueId: 'kleague2',
    season: 2026,
    stadiumId: 'sportmonks-venue-14080',
    source: 'https://www.kleague.com/schedule.do',
    reason:
      'Official 2026 schedule identifies Cheonan Stadium for this fixture',
  },
  {
    providerFixtureId: 19676271,
    fixtureId: 'sportmonks-19676271',
    homeTeamId: 'cheonan-city',
    awayTeamId: 'daegu',
    date: '2026-11-29',
    leagueId: 'kleague2',
    season: 2026,
    stadiumId: 'sportmonks-venue-14080',
    source: 'https://www.kleague.com/schedule.do',
    reason:
      'Official 2026 schedule identifies Cheonan Stadium; kickoff time unconfirmed',
  },
].map(override => ({
  ...override,
  verifiedAt: '2026-09-29',
  effectiveFrom: '2026-09-29T21:01:47+09:00',
  // A review reminder does not erase verified historical venue evidence.
  reviewAfter: '2026-12-01T00:00:00+09:00',
}));

export function getOfficialFixtureVenueDecision(
  homeTeamId: string | undefined,
  providerFixtureId: number | undefined,
  context?: FixtureVenueContext,
) {
  const override = OFFICIAL_FIXTURE_VENUES.find(
    entry => entry.providerFixtureId === providerFixtureId,
  );
  if (!override) return undefined;
  const kickoffMs =
    context &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      context.kickoffAt,
    )
      ? Date.parse(context.kickoffAt)
      : Number.NaN;
  const matchDate = Number.isFinite(kickoffMs)
    ? new Date(kickoffMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const observedMs = context ? Date.parse(context.observedAt) : Number.NaN;
  const identityMatches =
    context &&
    context.fixtureId === override.fixtureId &&
    homeTeamId === override.homeTeamId &&
    context.awayTeamId === override.awayTeamId &&
    context.leagueId === override.leagueId &&
    context.season === override.season &&
    matchDate === override.date;
  const active =
    Number.isFinite(observedMs) &&
    observedMs >= Date.parse(override.effectiveFrom);
  return {
    override,
    applied: Boolean(identityMatches && active),
    reason: !identityMatches
      ? 'fixture-identity-mismatch'
      : !active
      ? 'override-not-active'
      : 'verified-official-fixture',
    reviewDue: observedMs >= Date.parse(override.reviewAfter),
  };
}

export function resolveCanonicalFixtureStadiumId(
  homeTeamId: string | undefined,
  providerVenueId: number | null,
  mappedProviderStadiumId: string | undefined,
  storedStadiumId: string | undefined,
  homeStadiumId: string | undefined,
  providerFixtureId?: number,
  context?: FixtureVenueContext,
): string | undefined {
  const official = getOfficialFixtureVenueDecision(
    homeTeamId,
    providerFixtureId,
    context,
  );
  if (official?.applied) return official.override.stadiumId;
  if (
    homeTeamId === 'gangwon' &&
    providerFixtureId !== undefined &&
    VERIFIED_GANGWON_2026_FIXTURES.has(providerFixtureId) &&
    (providerVenueId === 14088 || providerVenueId === 14112)
  ) {
    return GANGNEUNG_STADIUM_ID;
  }
  // The May 17, 2026 fixture swapped home/away with October 25.
  // Official notice: https://www.kleague.com/news_view.do?seq=95131
  if (
    homeTeamId === 'chungnam-asan' &&
    providerFixtureId === RELOCATED_ASAN_SUWON_FIXTURE_ID
  ) {
    return YI_SUN_SIN_STADIUM_ID;
  }
  if (
    homeTeamId === 'suwon-fc' &&
    providerVenueId === SUWON_FC_AUXILIARY_PROVIDER_VENUE_ID
  ) {
    return SUWON_FC_MAIN_STADIUM_ID;
  }
  return providerVenueId === null
    ? storedStadiumId ?? homeStadiumId
    : mappedProviderStadiumId;
}
