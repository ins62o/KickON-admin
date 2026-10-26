import {selectPostMatchRows} from '../_shared/postMatchScope.ts';
import { beginFootballMaintenance, withExpectedFixtureRows, maintenanceFailureResult } from '../_shared/footballMaintenance.ts';
import { publishFixtureLineup } from '../_shared/publishFixtureLineup.ts';
import { recoverMissingLineupPlayerIds, type SeasonSquadMember } from '../_shared/lineupIdentityRecovery.ts';
import { getOfficialFixtureVenueDecision, resolveCanonicalFixtureStadiumId } from '../_shared/canonicalFixtureStadium.ts';
import { resolveKleagueStandingRanks } from '../_shared/kleagueStandingPolicy.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  recordFootballProviderUsage,
  type FootballRateLimit,
} from '../_shared/footballProviderUsage.ts';
import {
  footballHistorySyncKey,
  type FootballLeagueConfig,
  validateFootballLeagueRequest,
} from '../_shared/footballLeagueConfig.ts';
import { persistPlayerProviderSnapshot } from '../_shared/providerSnapshots.ts';
import { readObservedStandingDetailValue, toStandingDetailValue } from '../_shared/standingDetailValue.ts';
import {
  parseProviderPlayerId,
  resolveLineupPlayerIdentity,
} from '../_shared/providerPlayerId.ts';
import {
  readPlayerStatisticEvidence,
  type PlayerStatisticEvidenceSet,
} from '../_shared/playerStatisticEvidence.ts';
import {
  buildCandidateQuarantineTelemetry,
  fetchGlobalTransferCandidatePlayerProtections,
  fetchTransferCandidateProtections,
  partitionCandidateProtectedRows,
} from '../_shared/transferCandidateProtection.ts';

const API_BASE_URL = 'https://api.sportmonks.com/v3/football';
const DEFAULT_LINEUP_FIXTURE_LIMIT = 40;
const LINEUP_CONFIRMED_TYPE_ID = 572;

type ApiEnvelope<T> = {
  data: T;
  message?: string;
  rate_limit?: FootballRateLimit;
  pagination?: {
    current_page?: number;
    last_page?: number;
    has_more?: boolean;
  };
};

type Venue = {
  id: number;
  name?: string | null;
  address?: string | null;
  city_name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

type Team = {
  id: number;
  venue_id?: number | null;
  name: string;
  short_code?: string | null;
  venue?: Venue | null;
  statistics?: TeamStatistic[];
};

type Participant = Team & {
  meta?: { location?: 'home' | 'away'; winner?: boolean | null };
};

type FixtureScore = {
  participant_id?: number | null;
  description?: string | null;
  score?: { goals?: number | null; participant?: 'home' | 'away' };
};

type Fixture = {
  id: number;
  league_id: number;
  season_id: number;
  venue_id?: number | null;
  starting_at: string;
  state?: {
    state?: string | null;
    developer_name?: string | null;
    short_name?: string | null;
  } | null;
  round?: { name?: string | null } | null;
  participants?: Participant[];
  venue?: Venue | null;
  scores?: FixtureScore[];
};

type StatisticType = {
  id?: number;
  name?: string | null;
  developer_name?: string | null;
  code?: string | null;
};

type StatisticDetail = {
  type_id: number;
  value: unknown;
  type?: StatisticType | null;
};

type TeamStatistic = {
  season_id?: number | null;
  details?: StatisticDetail[];
};

type Standing = {
  participant_id: number;
  position: number;
  points: number;
  details?: StatisticDetail[];
};

type SquadPlayer = {
  id: number;
  position_id?: number | null;
  detailed_position_id?: number | null;
  name?: string | null;
  display_name?: string | null;
  common_name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  image_path?: string | null;
  height?: number | null;
  weight?: number | null;
  date_of_birth?: string | null;
  in_squad?: boolean | null;
};

type SquadMember = {
  player_id: unknown;
  team_id: number;
  jersey_number?: number | null;
  position_id?: number | null;
  detailed_position_id?: number | null;
  position?: { name?: string | null } | null;
  detailedPosition?: { name?: string | null } | null;
  detailed_position?: { name?: string | null } | null;
  player?: SquadPlayer | null;
  details?: StatisticDetail[];
};

type Formation = {
  participant_id: number;
  formation?: string | null;
};

type LineupPlayer = {
  player_id: number | null;
  team_id: number;
  type_id?: number | null;
  player_name?: string | null;
  jersey_number?: number | null;
  formation_field?: string | null;
  formation_position?: number | null;
  position?: { name?: string | null } | null;
  player?: SquadPlayer | null;
};

type FixtureWithLineups = Fixture & {
  metadata?: Array<{ type_id?: number; values?: unknown }>;
  lineups?: LineupPlayer[];
  formations?: Formation[];
};

function metadataBoolean(value: unknown): boolean {
  if (value === true || value === 1 || value === 'true' || value === '1') {
    return true;
  }
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(item => metadataBoolean(item));
}

function isConfirmedLineup(fixture: FixtureWithLineups) {
  const metadata = fixture.metadata?.find(
    item => item.type_id === LINEUP_CONFIRMED_TYPE_ID,
  );
  return metadataBoolean(metadata?.values);
}

type SeasonWithFixtures = {
  id: number;
  league_id: number;
  fixtures?: Fixture[];
};

type ProviderSeason = {
  id: number;
  league_id: number;
  name: string;
  finished?: boolean | null;
  pending?: boolean | null;
  is_current?: boolean | null;
  starting_at?: string | null;
  ending_at?: string | null;
};

const TEAM_NAME_RULES: Array<[string[], string]> = [
  [['seouleland', '서울이랜드'], 'seoul-eland'],
  [['suwonfc', '수원fc'], 'suwon-fc'],
  [['chungnamasan', '충남아산'], 'chungnam-asan'],
  [['fcseoul', 'seoul', '서울'], 'seoul'],
  [['jeonbuk', '전북'], 'jeonbuk'],
  [['ulsan', '울산'], 'ulsan'],
  [['incheon', '인천'], 'incheon'],
  [['daejeon', '대전'], 'daejeon'],
  [['pohang', '포항'], 'pohang'],
  [['anyang', '안양'], 'anyang'],
  [['bucheon', '부천'], 'bucheon'],
  [['gangwon', '강원'], 'gangwon'],
  [['jeju', '제주'], 'jeju'],
  [['gwangju', '광주'], 'gwangju'],
  [['gimcheon', '김천'], 'gimcheon'],
  [['daegu', '대구'], 'daegu'],
];

const TEAM_ID_BY_PROVIDER_ID: Record<number, string> = {
  904: 'suwon-fc',
};

const HOME_STADIUM_BY_TEAM: Record<string, string> = {
  incheon: 'incheon-football-stadium',
  seoul: 'seoul-world-cup-stadium',
  jeonbuk: 'jeonju-world-cup-stadium',
  ulsan: 'ulsan-munsu-football-stadium',
  daejeon: 'daejeon-world-cup-stadium',
  pohang: 'pohang-steel-yard',
  anyang: 'anyang-stadium',
  bucheon: 'bucheon-stadium',
  gangwon: 'gangneung-high1-arena',
  jeju: 'jeju-world-cup-stadium',
  gwangju: 'gwangju-football-stadium',
  gimcheon: 'gimcheon-stadium',
};

type StadiumLocalization = {
  nameEn: string;
  nameKo: string;
  addressKo?: string;
};

const STADIUM_LOCALIZATION_BY_TEAM: Record<string, StadiumLocalization> = {
  incheon: {
    nameEn: 'Incheon Football Stadium',
    nameKo: '인천축구전용경기장',
    addressKo: '인천광역시 중구 참외전로 246',
  },
  seoul: {
    nameEn: 'Seoul World Cup Stadium',
    nameKo: '서울월드컵경기장',
    addressKo: '서울특별시 마포구 월드컵로 240',
  },
  jeonbuk: {
    nameEn: 'Jeonju World Cup Stadium',
    nameKo: '전주월드컵경기장',
    addressKo: '전북특별자치도 전주시 덕진구 기린대로 1055',
  },
  ulsan: {
    nameEn: 'Ulsan Munsu Football Stadium',
    nameKo: '울산문수축구경기장',
  },
  daejeon: {
    nameEn: 'Daejeon World Cup Stadium',
    nameKo: '대전월드컵경기장',
  },
  pohang: {
    nameEn: 'Pohang Steel Yard',
    nameKo: '포항스틸야드',
  },
  anyang: {
    nameEn: 'Anyang Stadium',
    nameKo: '안양종합운동장',
  },
  bucheon: {
    nameEn: 'Bucheon Stadium',
    nameKo: '부천종합운동장',
  },
  gangwon: {
    nameEn: 'Gangneung High1 Arena',
    nameKo: '강릉하이원아레나',
  },
  jeju: {
    nameEn: 'Jeju World Cup Stadium',
    nameKo: '제주월드컵경기장',
  },
  gwangju: {
    nameEn: 'Gwangju Football Stadium',
    nameKo: '광주축구전용구장',
  },
  gimcheon: {
    nameEn: 'Gimcheon Stadium',
    nameKo: '김천종합운동장',
  },
};

const STADIUM_LOCALIZATION_BY_PROVIDER_ID: Record<number, StadiumLocalization> =
  {
    175: STADIUM_LOCALIZATION_BY_TEAM.seoul,
    709: {
      nameEn: 'Steelyard Stadium',
      nameKo: '포항스틸야드',
      addressKo: '경상북도 포항시 남구 동해안로6213번길 20',
    },
    1957: STADIUM_LOCALIZATION_BY_TEAM.jeonbuk,
    2288: {
      nameEn: 'Sangju Stadium',
      nameKo: '상주시민운동장',
      addressKo: '경상북도 상주시 북상주로 24-7',
    },
    3718: {
      nameEn: 'Daejeon World Cup Stadium',
      nameKo: '대전월드컵경기장',
      addressKo: '대전광역시 유성구 월드컵대로 32',
    },
    4526: STADIUM_LOCALIZATION_BY_TEAM.incheon,
    4772: {
      nameEn: 'Bucheon Stadium',
      nameKo: '부천종합운동장',
      addressKo: '경기도 부천시 원미구 소사로 482',
    },
    5222: {
      nameEn: 'Anyang Stadium',
      nameKo: '안양종합운동장',
      addressKo: '경기도 안양시 동안구 평촌대로 389',
    },
    5224: {
      nameEn: 'Jeju World Cup Stadium',
      nameKo: '제주월드컵경기장',
      addressKo: '제주특별자치도 서귀포시 월드컵로 33',
    },
    14088: {
      nameEn: 'Gangnam Soccer Park',
      nameKo: '강남축구공원',
      addressKo: '강원특별자치도 강릉시 노암동 산35',
    },
    14112: {
      nameEn: 'Chuncheon Songam Stadium',
      nameKo: '춘천송암스포츠타운 주경기장',
      addressKo: '강원특별자치도 춘천시 스포츠타운길 136',
    },
    27065: {
      nameEn: 'Ulsan Munsu Football Stadium',
      nameKo: '울산문수축구경기장',
      addressKo: '울산광역시 남구 문수로 44',
    },
    33528: {
      nameEn: 'Gwangju World Cup Stadium',
      nameKo: '광주월드컵경기장',
      addressKo: '광주광역시 서구 금화로 240',
    },
    71560: {
      nameEn: 'Gimcheon Stadium',
      nameKo: '김천종합운동장',
      addressKo: '경상북도 김천시 운동장길 1',
    },
  };

const KOREAN_PLAYER_NAMES: Record<string, string> = {
  '321257': '정원진',
  '37623452': '박호민',
  '37735557': '백민규',
  '37918802': '이상현',
  '12126934': '정태욱',
  '37499625': '강영훈',
  '787504': '이상기',
  '751156': '문지환',
  '37624628': '여승원',
  '12844068': '오후성',
  '1452543': '정치인',
  '322907': '김연수',
  '160077': '레안드로',
  '189184': '이케르',
  '320976': '이태희',
  '37677365': '박승호',
  '159119': '제르소',
  '37627499': '김성민',
  '37677358': '김건희',
  '37342726': '서재민',
  '320839': '이주용',
  '37918803': '박경섭',
  '37735554': '최승구',
  '316': '이청용',
  '15662': '모건',
  '307696': '이명주',
  '448352': '후안 이비자',
  '31626461': '이동률',
  '37739133': '김영환',
  '29311996': '김동헌',
  '34690': '무고사',
  '37581707': '김명순',
};

const KOREAN_PLAYER_NAMES_BY_SOURCE: Record<string, string> = {
  minhyuklee: '이민혁',
  leeminhyuk: '이민혁',
};

const STANDING_TYPE_IDS = {
  played: 129,
  won: 130,
  drawn: 131,
  lost: 132,
  goalsFor: 133,
  goalsAgainst: 134,
  goalDifference: 179,
} as const;

const SCORER_TYPE_IDS = {
  goals: 52,
  assists: 79,
  appearances: 321,
} as const;

function normalizeName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function getSyncErrorCode(message: string) {
  for (const stage of [
    'TEAM_READ',
    'TEAM_WRITE',
    'STADIUM_READ',
    'STADIUM_WRITE',
    'FIXTURE_READ',
    'FIXTURE_WRITE',
  ]) {
    if (message.startsWith(`${stage}:`)) return stage;
  }
  if (
    message.includes('Missing internal team mappings') ||
    message.includes('duplicate internal teams')
  ) {
    return 'TEAM_MAPPING';
  }
  if (message.includes('fixtures could be mapped')) return 'FIXTURE_MAPPING';
  if (
    message.includes('Sportmonks') ||
    message.includes('returned no K League')
  ) {
    return 'PROVIDER_READ';
  }
  if (
    message.includes('duplicate key') ||
    message.includes('constraint') ||
    message.includes('column')
  ) {
    return 'DATABASE_WRITE';
  }
  return 'UNKNOWN';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getStadiumLocalization(
  providerVenueId: number,
  homeTeamId: string | undefined,
  venueName: string | null | undefined,
) {
  const byProviderId = STADIUM_LOCALIZATION_BY_PROVIDER_ID[providerVenueId];
  if (byProviderId) return byProviderId;
  const normalizedVenue = normalizeName(venueName ?? '');
  const byVenueName = Object.values(STADIUM_LOCALIZATION_BY_TEAM).find(
    localization =>
      normalizeName(localization.nameEn) === normalizedVenue ||
      normalizeName(localization.nameKo) === normalizedVenue,
  );
  return (
    byVenueName ??
    (homeTeamId ? STADIUM_LOCALIZATION_BY_TEAM[homeTeamId] : undefined)
  );
}

function getKoreanPlayerName(playerId: string, sourceName: string) {
  return (
    KOREAN_PLAYER_NAMES[playerId] ??
    KOREAN_PLAYER_NAMES_BY_SOURCE[
      sourceName.toLocaleLowerCase().replace(/[^a-z]/g, '')
    ] ??
    null
  );
}

function resolveInternalTeamId(name: string) {
  const normalized = normalizeName(name);
  return TEAM_NAME_RULES.find(([aliases]) =>
    aliases.some(alias => normalized.includes(normalizeName(alias))),
  )?.[1];
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['total', 'count', 'value', 'all']) {
      const parsed = toNumber(record[key], Number.NaN);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function getDetailValue(
  details: StatisticDetail[] | undefined,
  typeId: number,
  developerNames: string[],
  options: { signed?: boolean; requireObserved?: boolean } = {},
) {
  const detail = (details ?? []).find(item => {
    if (item.type_id === typeId) return true;
    const identifiers = [
      item.type?.developer_name,
      item.type?.name,
      item.type?.code,
    ]
      .filter(Boolean)
      .map(value => normalizeName(String(value)));
    return developerNames.some(name =>
      identifiers.includes(normalizeName(name)),
    );
  });
  if (options.requireObserved) return readObservedStandingDetailValue(detail?.value, options);
  return detail ? toStandingDetailValue(toNumber(detail.value), options) : 0;
}

function normalizeKickoff(value: string) {
  if (/([zZ]|[+-]\d\d:\d\d)$/.test(value)) return value;
  return `${value.replace(' ', 'T')}Z`;
}

function parseRound(value?: string | null) {
  const round = value?.match(/(\d+)(?!.*\d)/)?.[1];
  return round ? Number(round) : null;
}

function mapStatus(fixture: Fixture) {
  const state = [
    fixture.state?.developer_name,
    fixture.state?.short_name,
    fixture.state?.state,
  ]
    .filter(Boolean)
    .join('_')
    .toLocaleUpperCase();
  if (
    ['FINISHED', 'FT', 'AET', 'PEN', 'AWARDED', 'WALKOVER'].some(value =>
      state.includes(value),
    )
  )
    return 'FINISHED';
  if (
    ['CANCELED', 'CANCELLED', 'CANC', 'POSTPONED', 'ABANDONED', 'ABD'].some(
      value => state.includes(value),
    )
  )
    return 'CANCELED';
  if (
    [
      'INPLAY',
      'LIVE',
      '1ST_HALF',
      '2ND_HALF',
      'HALF_TIME',
      'BREAK',
      'EXTRA_TIME',
    ].some(value => state.includes(value))
  )
    return 'LIVE';
  return 'SCHEDULED';
}

function getParticipant(fixture: Fixture, location: 'home' | 'away') {
  return fixture.participants?.find(
    participant => participant.meta?.location === location,
  );
}

function getScore(fixture: Fixture, participant: Participant) {
  const scores = (fixture.scores ?? []).filter(
    score =>
      score.participant_id === participant.id ||
      score.score?.participant === participant.meta?.location,
  );
  const selected =
    scores.find(score => score.description === 'CURRENT') ?? scores.at(-1);
  const goals = selected?.score?.goals;
  return typeof goals === 'number' ? goals : null;
}

function getCleanSheetCount(fixtures: Fixture[], participantId: number) {
  return fixtures.reduce((count, fixture) => {
    if (mapStatus(fixture) !== 'FINISHED') return count;
    const home = getParticipant(fixture, 'home');
    const away = getParticipant(fixture, 'away');
    if (!home || !away) return count;
    const teamIsHome = home.id === participantId;
    const teamIsAway = away.id === participantId;
    if (!teamIsHome && !teamIsAway) return count;
    const opponent = teamIsHome ? away : home;
    return getScore(fixture, opponent) === 0 ? count + 1 : count;
  }, 0);
}

function getPlayerName(member: SquadMember | LineupPlayer) {
  const player = member.player;
  const explicit = 'player_name' in member ? member.player_name : null;
  const fullName = [player?.firstname, player?.lastname]
    .filter(Boolean)
    .join(' ');
  return (
    explicit ??
    player?.display_name ??
    player?.common_name ??
    player?.name ??
    (fullName || `Player ${member.player_id}`)
  );
}

async function inspectHistoryFixtureMappings(
  admin: SupabaseClient,
  token: string,
  config: FootballLeagueConfig,
) {
  const [teamsPayload, seasonPayload] = await Promise.all([
    apiInspectGetAll<Team>(token, `teams/seasons/${config.providerSeasonId}`, {
      include: 'venue',
    }),
    apiInspectGet<SeasonWithFixtures>(
      token,
      `seasons/${config.providerSeasonId}`,
      {
        include:
          'fixtures.participants;fixtures.venue;fixtures.state;fixtures.round',
      },
    ),
  ]);
  if (seasonPayload.data.league_id !== config.providerLeagueId) {
    throw new Error(
      `Season ${config.providerSeasonId} belongs to league ${seasonPayload.data.league_id}, not ${config.providerLeagueId}`,
    );
  }

  const seasonStart = `${config.season}-01-01T00:00:00.000Z`;
  const seasonEnd = `${config.season + 1}-01-01T00:00:00.000Z`;
  const [storedTeamsResult, storedStadiumsResult, storedFixturesResult] =
    await Promise.all([
      admin.from('teams').select('id, name, short_name, code, sportmonks_id'),
      admin.from('stadiums').select('id, sportmonks_id'),
      admin
        .from('fixtures')
        .select(
          'id, sportmonks_id, league_id, home_team_id, away_team_id, kickoff_at, round, status',
        )
        .eq('league_id', config.internalLeagueId)
        .gte('kickoff_at', seasonStart)
        .lt('kickoff_at', seasonEnd),
    ]);
  if (storedTeamsResult.error) throw storedTeamsResult.error;
  if (storedStadiumsResult.error) throw storedStadiumsResult.error;
  if (storedFixturesResult.error) throw storedFixturesResult.error;

  const storedTeamById = new Map(
    (storedTeamsResult.data ?? []).map(team => [String(team.id), team]),
  );
  const storedTeamIdByProviderId = new Map<number, string>(
    (storedTeamsResult.data ?? []).flatMap(team =>
      team.sportmonks_id == null
        ? []
        : [[Number(team.sportmonks_id), String(team.id)] as const],
    ),
  );
  const teamIdByProviderId = new Map<number, string>();
  for (const team of teamsPayload) {
    const internalId =
      storedTeamIdByProviderId.get(team.id) ??
      TEAM_ID_BY_PROVIDER_ID[team.id] ??
      resolveInternalTeamId(team.name);
    if (internalId && storedTeamById.has(internalId)) {
      teamIdByProviderId.set(team.id, internalId);
    }
  }

  const stadiumIdByProviderId = new Map<number, string>(
    (storedStadiumsResult.data ?? []).flatMap(stadium =>
      stadium.sportmonks_id == null
        ? []
        : [[Number(stadium.sportmonks_id), String(stadium.id)] as const],
    ),
  );
  const simulatedStadiumId = (
    providerVenueId: number,
    homeTeamId?: string,
  ) =>
    stadiumIdByProviderId.get(providerVenueId) ??
    (homeTeamId ? HOME_STADIUM_BY_TEAM[homeTeamId] : undefined) ??
    `sportmonks-venue-${providerVenueId}`;
  const homeVenueFallbackByProviderTeamId = new Map<number, string>();
  for (const team of teamsPayload) {
    const internalTeamId = teamIdByProviderId.get(team.id);
    const providerVenueId = team.venue?.id ?? team.venue_id ?? null;
    if (providerVenueId == null) continue;
    const stadiumId = simulatedStadiumId(providerVenueId, internalTeamId);
    stadiumIdByProviderId.set(providerVenueId, stadiumId);
    homeVenueFallbackByProviderTeamId.set(team.id, stadiumId);
  }

  const fixturesPayload = seasonPayload.data.fixtures ?? [];
  for (const fixture of fixturesPayload) {
    const home = getParticipant(fixture, 'home');
    const homeTeamId = home ? teamIdByProviderId.get(home.id) : undefined;
    const providerVenueId = fixture.venue?.id ?? fixture.venue_id ?? null;
    if (providerVenueId == null) continue;
    stadiumIdByProviderId.set(
      providerVenueId,
      simulatedStadiumId(providerVenueId, homeTeamId),
    );
  }

  const storedFixtures = storedFixturesResult.data ?? [];
  const storedFixtureByProviderId = new Map(
    storedFixtures.flatMap(fixture =>
      fixture.sportmonks_id == null
        ? []
        : [[Number(fixture.sportmonks_id), fixture] as const],
    ),
  );
  const describeTeam = (participant: Participant | undefined) => {
    if (!participant) return null;
    const currentInternalTeamId = teamIdByProviderId.get(participant.id) ?? null;
    const potentialInternalTeamId =
      storedTeamIdByProviderId.get(participant.id) ??
      TEAM_ID_BY_PROVIDER_ID[participant.id] ??
      resolveInternalTeamId(participant.name) ??
      null;
    return {
      provider_team_id: participant.id,
      name: participant.name,
      current_internal_team_id: currentInternalTeamId,
      potential_internal_team_id: potentialInternalTeamId,
      season_team_listed: teamsPayload.some(team => team.id === participant.id),
    };
  };

  const unmapped = fixturesPayload.flatMap(fixture => {
    const home = getParticipant(fixture, 'home');
    const away = getParticipant(fixture, 'away');
    const homeTeamId = home ? teamIdByProviderId.get(home.id) : undefined;
    const awayTeamId = away ? teamIdByProviderId.get(away.id) : undefined;
    const providerVenueId = fixture.venue_id ?? fixture.venue?.id ?? null;
    const currentStadiumId = resolveCanonicalFixtureStadiumId(
      homeTeamId,
      providerVenueId,
      providerVenueId === null ? undefined : stadiumIdByProviderId.get(providerVenueId),
      undefined,
      homeTeamId ? HOME_STADIUM_BY_TEAM[homeTeamId] : undefined,
      fixture.id,
      {
        fixtureId: String(storedFixtureByProviderId.get(fixture.id)?.id ?? `sportmonks-${fixture.id}`),
        awayTeamId, kickoffAt: normalizeKickoff(fixture.starting_at),
        leagueId: config.internalLeagueId, season: config.season,
        observedAt: new Date().toISOString(),
      },
    );
    const reasons: string[] = [];
    if (!home) reasons.push('missing_home_participant');
    else if (!homeTeamId) reasons.push('unmapped_home_team');
    if (!away) reasons.push('missing_away_participant');
    else if (!awayTeamId) reasons.push('unmapped_away_team');
    if (!currentStadiumId) reasons.push('missing_current_stadium_mapping');
    if (!reasons.length) return [];

    const kickoff = new Date(normalizeKickoff(fixture.starting_at)).getTime();
    const providerFixture = storedFixtureByProviderId.get(fixture.id);
    const equivalentFixture =
      providerFixture ??
      (homeTeamId && awayTeamId
        ? storedFixtures
            .filter(
              stored =>
                stored.home_team_id === homeTeamId &&
                stored.away_team_id === awayTeamId,
            )
            .map(stored => ({
              ...stored,
              difference_ms: Math.abs(
                new Date(String(stored.kickoff_at)).getTime() - kickoff,
              ),
            }))
            .filter(stored => stored.difference_ms <= 12 * 60 * 60 * 1_000)
            .sort((left, right) => left.difference_ms - right.difference_ms)[0]
        : undefined);

    return [
      {
        provider_fixture_id: fixture.id,
        home: home
          ? { provider_team_id: home.id, name: home.name }
          : null,
        away: away
          ? { provider_team_id: away.id, name: away.name }
          : null,
        starting_at: fixture.starting_at,
        round: fixture.round?.name ?? null,
        state:
          fixture.state?.developer_name ??
          fixture.state?.short_name ??
          fixture.state?.state ??
          null,
        provider_season_id: fixture.season_id,
        provider_league_id: fixture.league_id,
        internal_league_id: config.internalLeagueId,
        db_fixture: equivalentFixture ?? null,
        team_mapping: {
          home: describeTeam(home),
          away: describeTeam(away),
        },
        fixture_venue_id: fixture.venue_id ?? null,
        nested_fixture_venue_id: fixture.venue?.id ?? null,
        current_stadium_id: currentStadiumId ?? null,
        home_team_venue_fallback_id: home
          ? homeVenueFallbackByProviderTeamId.get(home.id) ?? null
          : null,
        reasons,
      },
    ];
  });

  return {
    status: 'inspected',
    mode: 'inspect-history-fixture-mapping',
    provider: 'sportmonks',
    provider_league_id: config.providerLeagueId,
    provider_season_id: config.providerSeasonId,
    internal_league_id: config.internalLeagueId,
    season: config.season,
    raw_fixture_count: fixturesPayload.length,
    mapped_fixture_count: fixturesPayload.length - unmapped.length,
    unmapped_fixture_count: unmapped.length,
    endpoint: `seasons/${config.providerSeasonId}`,
    inspected_at: new Date().toISOString(),
    unmapped_fixtures: unmapped,
  };
}

async function apiInspectGet<T>(
  token: string,
  path: string,
  params: Record<string, string | number> = {},
) {
  const url = new URL(`${API_BASE_URL}/${path}`);
  url.searchParams.set('api_token', token);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, String(value)),
  );
  const response = await fetch(url);
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.message) {
    throw new Error(
      `Sportmonks ${path} failed (${response.status}): ${
        payload.message ?? 'unknown error'
      }`,
    );
  }
  return payload;
}

async function apiInspectGetAll<T>(
  token: string,
  path: string,
  params: Record<string, string | number> = {},
) {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const payload = await apiInspectGet<T[]>(token, path, {
      ...params,
      page,
      per_page: 100,
    });
    rows.push(...payload.data);
    const hasMore =
      payload.pagination?.has_more === true ||
      (payload.pagination?.last_page ?? page) > page;
    if (!hasMore) return rows;
    page += 1;
  }
}

async function apiGet<T>(
  admin: SupabaseClient,
  token: string,
  path: string,
  params: Record<string, string | number> = {},
) {
  const url = new URL(`${API_BASE_URL}/${path}`);
  url.searchParams.set('api_token', token);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, String(value)),
  );
  const response = await fetch(url);
  const payload = (await response.json()) as ApiEnvelope<T>;
  await recordFootballProviderUsage(admin, {
    source: 'full-football-sync',
    endpoint: path,
    statusCode: response.status,
    rateLimit: payload.rate_limit,
  });
  if (!response.ok || payload.message) {
    throw new Error(
      `Sportmonks ${path} failed (${response.status}): ${
        payload.message ?? 'unknown error'
      }`,
    );
  }
  return payload;
}

async function apiGetAll<T>(
  admin: SupabaseClient,
  token: string,
  path: string,
  params: Record<string, string | number> = {},
) {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const payload = await apiGet<T[]>(admin, token, path, {
      ...params,
      page,
      per_page: 100,
    });
    rows.push(...payload.data);
    const hasMore =
      payload.pagination?.has_more === true ||
      (payload.pagination?.last_page ?? page) > page;
    if (!hasMore) return rows;
    page += 1;
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const token =
    Deno.env.get('SPORTMONKS_API_TOKEN') ?? Deno.env.get('FOOTBALL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !supabaseUrl || !serviceRoleKey) {
    return Response.json(
      {
        error:
          'SPORTMONKS_API_TOKEN (or legacy FOOTBALL) or Supabase server config is missing',
      },
      { status: 500 },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suppliedSecret = request.headers.get('x-sync-secret') ?? '';
  const expectedSecret = Deno.env.get('FOOTBALL_SYNC_SECRET');
  let authorized = Boolean(expectedSecret && suppliedSecret === expectedSecret);
  if (!authorized) {
    const { data: verified, error: verifyError } = await admin.rpc(
      'verify_live_football_sync_secret',
      { candidate: suppliedSecret },
    );
    authorized = !verifyError && verified === true;
  }
  if (!authorized) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({}));
  const scope = validateFootballLeagueRequest(body, { allowHistorical: true });
  if ('error' in scope) {
    return Response.json({ error: scope.error }, { status: 400 });
  }
  const { config } = scope;

  if (body.mode === 'inspect-history-fixture-mapping') {
    try {
      return Response.json(
        await inspectHistoryFixtureMappings(admin, token, config),
      );
    } catch (error) {
      return Response.json({ error: getErrorMessage(error) }, { status: 502 });
    }
  }

  if (body.mode === 'discover-seasons') {
    try {
      const seasons = await apiGetAll<ProviderSeason>(admin, token, 'seasons', {
        filters: `seasonLeagues:${config.providerLeagueId}`,
      });
      const rows = seasons.map(providerSeason => ({
        provider: 'sportmonks',
        provider_league_id: providerSeason.league_id,
        provider_season_id: providerSeason.id,
        season_name: providerSeason.name,
        finished: providerSeason.finished ?? false,
        pending: providerSeason.pending ?? false,
        is_current: providerSeason.is_current ?? false,
        starting_at: providerSeason.starting_at ?? null,
        ending_at: providerSeason.ending_at ?? null,
        discovered_at: new Date().toISOString(),
      }));
      const { error } = await admin
        .from('football_provider_seasons')
        .upsert(rows, { onConflict: 'provider,provider_season_id' });
      if (error) throw error;
      return Response.json({
        provider: 'sportmonks',
        leagueId: config.providerLeagueId,
        seasons: rows,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(message);
      return Response.json({ error: message }, { status: 502 });
    }
  }
  const historyMode = body.mode === 'backfill-history';
  const historySyncKey = historyMode ? footballHistorySyncKey(config) : null;
  const postMatch = !historyMode && body.postMatch === true;
  let retryRunId: string | null = null;
  const recordRetry = async (status: string, message: string | null = null) => {
    if (!retryRunId) return;
    const { error } = await admin.from('sync_runs').update({ status, ...(status === 'running' ? {started_at: new Date().toISOString()} : {finished_at: new Date().toISOString()}), error_message: message }).eq('id', retryRunId).eq('job_key', 'kickon-post-match-football-sync');
    if (error) throw new Error('ADMIN_RETRY_RECORD_FAILED');
  };
  if (body.adminRetryRunId !== undefined) {
    if (!postMatch || typeof body.adminRetryRunId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.adminRetryRunId)) return Response.json({error:'INVALID_RETRY_REQUEST'}, {status:400});
    const {data: run, error} = await admin.from('sync_runs').select('id,metadata').eq('id',body.adminRetryRunId).eq('job_key','kickon-post-match-football-sync').eq('target_id',config.internalLeagueId).eq('trigger_type','retry').eq('status','queued').maybeSingle();
    if (error || !run || run.metadata?.internal_season !== config.season) return Response.json({error:'RETRY_REQUEST_NOT_QUEUED'}, {status:409});
    const claimed=await admin.from('sync_runs').update({status:'running',started_at:new Date().toISOString()}).eq('id',run.id).eq('status','queued').select('id').maybeSingle();
    if(claimed.error||!claimed.data)return Response.json({error:'RETRY_REQUEST_ALREADY_CLAIMED'}, {status:409});
    retryRunId=run.id;
    const ready=await admin.rpc('admin_post_match_retry_scope');
    const current=Array.isArray(ready.data)?ready.data.find(scope=>scope.league_id===config.internalLeagueId):null;
    if(ready.error||!current||current.generation!==run.metadata.previous_generation){
      await recordRetry('cancelled','대상 상태가 변경되어 오래된 재시도 요청은 실행하지 않았어요');
      return Response.json({status:'STALE_RETRY_REQUEST'},{status:409});
    }
  }
  let maintenance: Awaited<ReturnType<typeof beginFootballMaintenance>>['run'] = null;
  if (historyMode || postMatch) {
    try {
      const started = await beginFootballMaintenance(admin, historyMode ? 'history' : 'post_match', config);
      if (!started.run) {
        await recordRetry('cancelled', '다른 실행 또는 대기 조건으로 이번 재시도는 시작하지 않았어요');
        return Response.json({status: started.status}, {
        status: ['BLOCKED', 'LEGACY_RUNNING_UNKNOWN'].includes(started.status) ? 409 : 200,
      });
      }
      maintenance = started.run;
    } catch (error) {
      await recordRetry('failed', '경기 후 처리 시작 조건을 확인하지 못했어요');
      return Response.json({error: getErrorMessage(error)}, {status: 502});
    }
  }
  const leagueId = config.providerLeagueId;
  const seasonId = config.providerSeasonId;
  const season = config.season;
  const syncLineups = !historyMode && body.syncLineups === true;
  const lineupFixtureLimit = Math.min(
    40,
    Math.max(
      0,
      Number(body.lineupFixtureLimit ?? DEFAULT_LINEUP_FIXTURE_LIMIT),
    ),
  );
  if (!historyMode && !postMatch) {
    const { error: runningError } = await admin
      .from('football_provider_seasons')
      .update({ sync_status: 'RUNNING', sync_error_code: null })
      .eq('provider', 'sportmonks')
      .eq('provider_league_id', config.providerLeagueId)
      .eq('provider_season_id', seasonId);
    if (runningError) {
      return Response.json({ error: runningError.message }, { status: 500 });
    }
  }

  try {
    // Protection is DB-derived and fixed before any provider payload is read.
    // Provider true/false/absent state can therefore never weaken quarantine.
    const candidateProtections = await fetchTransferCandidateProtections(
      admin,
      {
        season,
        leagueId: config.internalLeagueId,
      },
    );
    const protectedPlayerIds = new Set(
      candidateProtections.map(protection => protection.player_id),
    );
    const [teamsPayload, seasonPayload, standingsPayload] = await Promise.all([
      apiGetAll<Team>(admin, token, `teams/seasons/${seasonId}`, {
        include: 'venue;statistics.details.type',
        filters: `teamStatisticSeasons:${seasonId}`,
      }),
      apiGet<SeasonWithFixtures>(admin, token, `seasons/${seasonId}`, {
        include:
          'fixtures.participants;fixtures.venue;fixtures.state;fixtures.scores;fixtures.round',
      }),
      apiGetAll<Standing>(admin, token, `standings/seasons/${seasonId}`, {
        include: 'details',
      }),
    ]);
    const fixturesPayload = seasonPayload.data.fixtures ?? [];

    if (seasonPayload.data.league_id !== leagueId) {
      throw new Error(
        `Season ${seasonId} belongs to league ${seasonPayload.data.league_id}, not ${leagueId}`,
      );
    }

    if (!teamsPayload.length || !fixturesPayload.length) {
      throw new Error('Sportmonks returned no teams or fixtures');
    }

    const { data: storedTeams, error: storedTeamError } = await admin
      .from('teams')
      .select('id, name, short_name, code, sportmonks_id');
    if (storedTeamError) {
      throw new Error(`TEAM_READ: ${getErrorMessage(storedTeamError)}`);
    }
    const storedTeamById = new Map(
      (storedTeams ?? []).map(team => [String(team.id), team]),
    );
    const storedTeamIdBySportmonksId = new Map<number, string>(
      (storedTeams ?? []).flatMap(team =>
        team.sportmonks_id === null
          ? []
          : [[Number(team.sportmonks_id), String(team.id)] as const],
      ),
    );
    const teamIdBySportmonksId = new Map<number, string>();
    const teamRows: Record<string, unknown>[] = [];
    const providerTeamRows: Record<string, unknown>[] = [];
    const unmappedTeamNames: string[] = [];
    for (const team of teamsPayload) {
      const internalId =
        storedTeamIdBySportmonksId.get(team.id) ??
        TEAM_ID_BY_PROVIDER_ID[team.id] ??
        resolveInternalTeamId(team.name);
      const stored = internalId ? storedTeamById.get(internalId) : undefined;
      if (!internalId || !stored) {
        unmappedTeamNames.push(`${team.name} (${team.id})`);
        providerTeamRows.push({
          provider: 'sportmonks',
          provider_season_id: seasonId,
          provider_team_id: team.id,
          provider_team_name: team.name,
          internal_team_id: null,
          mapping_status: 'UNMAPPED',
          discovered_at: new Date().toISOString(),
        });
        continue;
      }
      teamIdBySportmonksId.set(team.id, internalId);
      providerTeamRows.push({
        provider: 'sportmonks',
        provider_season_id: seasonId,
        provider_team_id: team.id,
        provider_team_name: team.name,
        internal_team_id: internalId,
        mapping_status: 'MAPPED',
        discovered_at: new Date().toISOString(),
      });
      teamRows.push({
        id: stored.id,
        name: stored.name,
        short_name: stored.short_name,
        code: stored.code,
        sportmonks_id: team.id,
      });
    }
    const { error: providerTeamError } = await admin
      .from('football_provider_teams')
      .upsert(providerTeamRows, {
        onConflict: 'provider,provider_season_id,provider_team_id',
      });
    if (providerTeamError) {
      throw new Error(`TEAM_WRITE: ${getErrorMessage(providerTeamError)}`);
    }
    if (unmappedTeamNames.length) {
      throw new Error(
        `Missing internal team mappings: ${unmappedTeamNames.join(', ')}`,
      );
    }
    if (new Set(teamIdBySportmonksId.values()).size !== teamsPayload.length) {
      throw new Error(
        'Sportmonks team mapping produced duplicate internal teams',
      );
    }
    const { error: teamUpsertError } = await admin
      .from('teams')
      .upsert(teamRows, { onConflict: 'id' });
    if (teamUpsertError) {
      throw new Error(`TEAM_WRITE: ${getErrorMessage(teamUpsertError)}`);
    }

    const { data: storedStadiums, error: stadiumReadError } = await admin
      .from('stadiums')
      .select(
        'id, name, name_en, name_ko, latitude, longitude, address, address_en, address_ko, sportmonks_id',
      );
    if (stadiumReadError) {
      throw new Error(`STADIUM_READ: ${getErrorMessage(stadiumReadError)}`);
    }
    const stadiumById = new Map(
      (storedStadiums ?? []).map(stadium => [String(stadium.id), stadium]),
    );
    const stadiumIdBySportmonksId = new Map<number, string>(
      (storedStadiums ?? []).flatMap(stadium =>
        stadium.sportmonks_id === null
          ? []
          : [[Number(stadium.sportmonks_id), String(stadium.id)] as const],
      ),
    );
    const stadiumRows = new Map<string, Record<string, unknown>>();

    const registerVenue = (venue: Venue, homeTeamId?: string) => {
      const preferredId = homeTeamId
        ? HOME_STADIUM_BY_TEAM[homeTeamId]
        : undefined;
      const id =
        stadiumIdBySportmonksId.get(venue.id) ??
        preferredId ??
        `sportmonks-venue-${venue.id}`;
      const stored = stadiumById.get(id);
      const pending = stadiumRows.get(id);
      const localization = getStadiumLocalization(
        venue.id,
        homeTeamId,
        venue.name,
      );
      const nameEn =
        venue.name ??
        (pending?.name_en as string | null | undefined) ??
        stored?.name_en ??
        localization?.nameEn ??
        stored?.name ??
        `Venue ${venue.id}`;
      const nameKo =
        localization?.nameKo ??
        (pending?.name_ko as string | null | undefined) ??
        stored?.name_ko ??
        null;
      const addressEn =
        [venue.address, venue.city_name].filter(Boolean).join(', ') ||
        (pending?.address_en as string | null | undefined) ||
        stored?.address_en ||
        null;
      const addressKo =
        localization?.addressKo ??
        (pending?.address_ko as string | null | undefined) ??
        stored?.address_ko ??
        null;
      stadiumIdBySportmonksId.set(venue.id, id);
      stadiumRows.set(id, {
        id,
        name: nameKo ?? nameEn,
        name_en: nameEn,
        name_ko: nameKo,
        latitude:
          stored && Number(stored.latitude) !== 0
            ? stored.latitude
            : toNumber(venue.latitude),
        longitude:
          stored && Number(stored.longitude) !== 0
            ? stored.longitude
            : toNumber(venue.longitude),
        address: addressKo ?? addressEn ?? stored?.address ?? null,
        address_en: addressEn,
        address_ko: addressKo,
        sportmonks_id: venue.id,
      });
      return id;
    };

    for (const team of teamsPayload) {
      const internalTeamId = teamIdBySportmonksId.get(team.id);
      if (team.venue?.id) registerVenue(team.venue, internalTeamId);
    }
    for (const fixture of fixturesPayload) {
      const home = getParticipant(fixture, 'home');
      const homeTeamId = home ? teamIdBySportmonksId.get(home.id) : undefined;
      if (fixture.venue?.id) registerVenue(fixture.venue, homeTeamId);
      else if (
        fixture.venue_id &&
        !stadiumIdBySportmonksId.has(fixture.venue_id)
      )
        registerVenue({ id: fixture.venue_id }, homeTeamId);
    }
    if (stadiumRows.size) {
      const { error } = await admin
        .from('stadiums')
        .upsert([...stadiumRows.values()], { onConflict: 'id' });
      if (error) {
        throw new Error(`STADIUM_WRITE: ${getErrorMessage(error)}`);
      }
    }

    const seasonStart = `${season}-01-01T00:00:00.000Z`;
    const seasonEnd = `${season + 1}-01-01T00:00:00.000Z`;
    const { data: storedSeasonFixtures, error: storedFixtureError } =
      await admin
        .from('fixtures')
        .select(
          '*',
        )
        .eq('league_id', config.internalLeagueId)
        .gte('kickoff_at', seasonStart)
        .lt('kickoff_at', seasonEnd);
    if (storedFixtureError) {
      throw new Error(`FIXTURE_READ: ${getErrorMessage(storedFixtureError)}`);
    }
    const usedStoredFixtureIds = new Set<string>();
    const fixtureIdBySportmonksId = new Map<number, string>();
    const resolveStoredFixture = (
      providerFixtureId: number,
      homeTeamId: string,
      awayTeamId: string,
      kickoffAt: string,
    ) => {
      const byProviderId = (storedSeasonFixtures ?? []).find(
        stored => Number(stored.sportmonks_id) === providerFixtureId,
      );
      if (byProviderId) return byProviderId;
      const kickoff = new Date(kickoffAt).getTime();
      const equivalent = (storedSeasonFixtures ?? [])
        .filter(
          stored =>
            !usedStoredFixtureIds.has(String(stored.id)) &&
            stored.home_team_id === homeTeamId &&
            stored.away_team_id === awayTeamId,
        )
        .map(stored => ({
          ...stored,
          difference: Math.abs(
            new Date(String(stored.kickoff_at)).getTime() - kickoff,
          ),
        }))
        .filter(stored => stored.difference <= 12 * 60 * 60 * 1_000)
        .sort((a, b) => a.difference - b.difference)[0];
      if (equivalent) {
        usedStoredFixtureIds.add(String(equivalent.id));
        return equivalent;
      }
      return undefined;
    };

    const fixtureRows = fixturesPayload.flatMap(fixture => {
      const home = getParticipant(fixture, 'home');
      const away = getParticipant(fixture, 'away');
      const homeTeamId = home ? teamIdBySportmonksId.get(home.id) : undefined;
      const awayTeamId = away ? teamIdBySportmonksId.get(away.id) : undefined;
      if (!home || !away || !homeTeamId || !awayTeamId) {
        return [];
      }
      const kickoffAt = normalizeKickoff(fixture.starting_at);
      const storedFixture = resolveStoredFixture(
        fixture.id,
        homeTeamId,
        awayTeamId,
        kickoffAt,
      );
      const providerVenueId = fixture.venue_id ?? fixture.venue?.id ?? null;
      const fixtureId = storedFixture
        ? String(storedFixture.id)
        : `sportmonks-${fixture.id}`;
      const venueContext = {
        fixtureId, awayTeamId, kickoffAt,
        leagueId: config.internalLeagueId, season,
        observedAt: new Date().toISOString(),
      };
      const officialVenue = getOfficialFixtureVenueDecision(homeTeamId, fixture.id, venueContext);
      if (officialVenue?.applied && !stadiumById.has(officialVenue.override.stadiumId)) {
        throw new Error(`FIXTURE_VENUE_REVIEW: missing canonical stadium for ${fixtureId}`);
      }
      const stadiumId = resolveCanonicalFixtureStadiumId(
        homeTeamId,
        providerVenueId,
        providerVenueId === null ? undefined : stadiumIdBySportmonksId.get(providerVenueId),
        storedFixture?.stadium_id ? String(storedFixture.stadium_id) : undefined,
        HOME_STADIUM_BY_TEAM[homeTeamId],
        fixture.id,
        venueContext,
      );
      if (officialVenue) {
        console.log(JSON.stringify({
          event: 'fixture-venue-policy', fixtureId, providerVenueId,
          mappedProviderStadiumId: providerVenueId === null ? null : stadiumIdBySportmonksId.get(providerVenueId),
          selectedStadiumId: stadiumId, ...officialVenue,
        }));
      }
      if (!stadiumId) return [];
      fixtureIdBySportmonksId.set(fixture.id, fixtureId);
      return [
        {
          id: fixtureId,
          sportmonks_id: fixture.id,
          league_id: config.internalLeagueId,
          round: parseRound(fixture.round?.name),
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          stadium_id: stadiumId,
          kickoff_at: kickoffAt,
          status: mapStatus(fixture),
          home_score: getScore(fixture, home),
          away_score: getScore(fixture, away),
          ...(maintenance ? {_historyProviderState: fixture.state?.developer_name ?? fixture.state?.short_name ?? fixture.state?.state ?? null} : {}),
          updated_at: new Date().toISOString(),
        },
      ];
    });
    if (fixtureRows.length !== fixturesPayload.length) {
      throw new Error(
        `Only ${fixtureRows.length}/${fixturesPayload.length} fixtures could be mapped`,
      );
    }
    const fixtureRowsToApply = postMatch ? selectPostMatchRows(fixtureRows, storedSeasonFixtures ?? []) : fixtureRows;
    if (maintenance) {
      await maintenance.apply(fixtureRowsToApply, storedSeasonFixtures ?? []);
    } else {
      const { data: count, error: fixtureError } = await admin.rpc('sync_fixture_metadata_rows', {
        p_rows: withExpectedFixtureRows(fixtureRows, storedSeasonFixtures ?? []),
      });
      if (fixtureError) throw new Error(`FIXTURE_WRITE: ${getErrorMessage(fixtureError)}`);
      if (count !== fixtureRows.length) throw new Error('CRON46_ROW_COUNT_MISMATCH');
    }

    const latestStandingByTeam = new Map<number, Standing>();
    for (const standing of standingsPayload) {
      const played = getDetailValue(
        standing.details,
        STANDING_TYPE_IDS.played,
        ['OVERALL_MATCHED_PLAYED', 'MATCHES_PLAYED'],
      );
      const current = latestStandingByTeam.get(standing.participant_id);
      const currentPlayed = current
        ? getDetailValue(current.details, STANDING_TYPE_IDS.played, [
            'OVERALL_MATCHED_PLAYED',
            'MATCHES_PLAYED',
          ])
        : -1;
      if (!current || played >= currentPlayed) {
        latestStandingByTeam.set(standing.participant_id, standing);
      }
    }
    const standingRows = [...latestStandingByTeam.values()].flatMap(
      standing => {
        const teamId = teamIdBySportmonksId.get(standing.participant_id);
        if (!teamId) return [];
        const details = standing.details;
        const evidenceOptions = { requireObserved: config.internalLeagueId === 'kleague2' && season === 2026 };
        return [
          {
            season,
            league_id: config.internalLeagueId,
            team_id: teamId,
            rank: standing.position,
            played: getDetailValue(details, STANDING_TYPE_IDS.played, [
              'OVERALL_MATCHED_PLAYED',
              'MATCHES_PLAYED',
            ], evidenceOptions),
            points: standing.points,
            won: getDetailValue(details, STANDING_TYPE_IDS.won, [
              'OVERALL_WON',
              'WINS',
            ], evidenceOptions),
            drawn: getDetailValue(details, STANDING_TYPE_IDS.drawn, [
              'OVERALL_DRAW',
              'DRAWS',
            ], evidenceOptions),
            lost: getDetailValue(details, STANDING_TYPE_IDS.lost, [
              'OVERALL_LOST',
              'LOSSES',
            ], evidenceOptions),
            goals_for: getDetailValue(details, STANDING_TYPE_IDS.goalsFor, [
              'OVERALL_GOALS_FOR',
              'GOALS_FOR',
            ], evidenceOptions),
            goals_against: getDetailValue(
              details,
              STANDING_TYPE_IDS.goalsAgainst,
              ['OVERALL_GOALS_AGAINST', 'GOALS_AGAINST'],
              evidenceOptions,
            ),
            goal_difference: getDetailValue(
              details,
              STANDING_TYPE_IDS.goalDifference,
              ['GOAL_DIFFERENCE'],
              { ...evidenceOptions, signed: true },
            ),
            clean_sheets: getCleanSheetCount(
              fixturesPayload,
              standing.participant_id,
            ),
            // average_possession is owned by sync-team-metrics.
            // Omit it from full-sync upserts to preserve existing values/NULL.
            updated_at: new Date().toISOString(),
          },
        ];
      },
    );
    let rankingAdjustmentDetected = false;
    if (config.internalLeagueId === 'kleague2' && season === 2026) {
      const { data: rankingOverrides, error: rankingOverridesError } = await admin
        .from('manual_overrides').select('field_path')
        .eq('entity_type', 'standing').eq('season', season)
        .eq('league_id', config.internalLeagueId).is('released_at', null);
      if (rankingOverridesError) throw rankingOverridesError;
      const rankingFields = new Set(['rank', 'points', 'played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'goal_difference']);
      rankingAdjustmentDetected = (rankingOverrides ?? []).some(row => rankingFields.has(String(row.field_path)));
    }
    const standingPolicy = resolveKleagueStandingRanks({
      leagueId: config.internalLeagueId, season,
      rankingAdjustmentDetected,
      standings: standingRows.map(row => ({
        teamId: row.team_id, providerRank: row.rank,
        played: row.played, won: row.won, drawn: row.drawn, lost: row.lost,
        goalsFor: row.goals_for, goalsAgainst: row.goals_against,
        goalDifference: row.goal_difference, points: row.points,
        statisticsComplete: [row.played, row.won, row.drawn, row.lost, row.goals_for, row.goals_against, row.goal_difference].every(Number.isFinite),
      })),
    });
    // Hold the whole standings batch when stats cannot establish official rank.
    // This also preserves its stored stats: partial upserts risk NOT NULL/default
    // rank values. Fixture and other existing sync stages remain independent.
    const writableStandingRows = standingPolicy.ranks === null ? [] : standingRows.map(row => ({
      ...row, rank: standingPolicy.ranks![row.team_id],
    }));
    if (writableStandingRows.length) {
      const { error } = await admin
        .from('league_standings')
        .upsert(writableStandingRows, {
          onConflict: 'season,league_id,team_id',
        });
      if (error) throw error;
    }
    if (config.internalLeagueId === 'kleague2' && season === 2026) {
      const { data: persistedStandings, error: persistedStandingsError } = await admin
        .from('league_standings').select('team_id, rank')
        .eq('season', season).eq('league_id', config.internalLeagueId);
      if (persistedStandingsError) throw persistedStandingsError;
      const persistedRanks = new Map((persistedStandings ?? []).map(row => [String(row.team_id), Number(row.rank)]));
      console.log(JSON.stringify({
        event: 'standings-ranking-policy', leagueId: config.internalLeagueId, season,
        source: standingPolicy.source, reasons: standingPolicy.reasons,
        writtenRows: writableStandingRows.length,
        comparisons: standingPolicy.comparisons.map(comparison => ({
          ...comparison, persistedRank: persistedRanks.get(comparison.teamId) ?? null,
        })),
      }));
    }

    const { data: storedPlayerNames, error: storedPlayerNamesError } =
      await admin
        .from('football_player_localizations')
        .select('provider_player_id, name_en, name_ko, is_verified')
        .eq('provider', 'sportmonks');
    if (storedPlayerNamesError) throw storedPlayerNamesError;
    const storedLocalizationById = new Map(
      (storedPlayerNames ?? []).map(localization => [
        String(localization.provider_player_id),
        localization,
      ]),
    );
    const koreanPlayerNameById = new Map<string, string>(
      (storedPlayerNames ?? []).flatMap(player =>
        player.name_ko
          ? [[String(player.provider_player_id), String(player.name_ko)]]
          : [],
      ),
    );
    const { data: storedScoringStats, error: storedScoringStatsError } =
      await admin
        .from('player_scoring_stats')
        .select('team_id, player_id')
        .eq('season', season)
        .eq('league_id', config.internalLeagueId);
    if (storedScoringStatsError) throw storedScoringStatsError;
    const storedScoringKeys = new Set(
      (storedScoringStats ?? []).map(
        row => `${String(row.team_id)}:${String(row.player_id)}`,
      ),
    );

    const squadResponses = await Promise.all(
      [...teamIdBySportmonksId.keys()].map(teamId =>
        apiGetAll<SquadMember>(
          admin,
          token,
          `squads/seasons/${seasonId}/teams/${teamId}`,
          { include: 'player;details.type' },
        ),
      ),
    );
    const squadRequestIdByProviderTeamId = new Map(
      [...teamIdBySportmonksId.keys()].map(providerTeamId => [
        providerTeamId,
        crypto.randomUUID(),
      ]),
    );
    const incompleteSquadCount = squadResponses.filter(
      squad => squad.length < 11,
    ).length;
    if (incompleteSquadCount > 0) {
      throw new Error(
        `PROVIDER_READ: ${incompleteSquadCount}/${squadResponses.length} team squads were incomplete`,
      );
    }
    const scorerByTeamPlayerId = new Map<string, Record<string, unknown>>();
    const localizationByPlayerId = new Map<string, Record<string, unknown>>();
    const snapshotInputs: Array<{
      teamId: string;
      providerTeamId: number;
      playerId: string;
      requestId: string;
      statistics: PlayerStatisticEvidenceSet;
      rawPayload: Record<string, unknown>;
    }> = [];
    for (const member of squadResponses.flat()) {
      const teamId = teamIdBySportmonksId.get(member.team_id);
      if (!teamId) continue;
      const requestId = squadRequestIdByProviderTeamId.get(member.team_id);
      if (!requestId) {
        throw new Error('PROVIDER_READ: missing season squad request identity');
      }
      const goalsEvidence = readPlayerStatisticEvidence(
        member.details,
        SCORER_TYPE_IDS.goals,
        ['GOALS'],
      );
      const appearancesEvidence = readPlayerStatisticEvidence(
        member.details,
        SCORER_TYPE_IDS.appearances,
        ['APPEARANCES'],
      );
      const assistsEvidence = readPlayerStatisticEvidence(
        member.details,
        SCORER_TYPE_IDS.assists,
        ['ASSISTS'],
      );
      const goals = goalsEvidence.value ?? 0;
      const appearances = appearancesEvidence.value ?? 0;
      const playerId = parseProviderPlayerId(member.player_id);
      if (!playerId) {
        throw new Error(
          'PROVIDER_READ: season squad contains an invalid provider player ID',
        );
      }
      const playerName = getPlayerName(member);
      const sourceDisplayName =
        member.player?.display_name ?? member.player?.common_name ?? playerName;
      const storedLocalization = storedLocalizationById.get(playerId);
      const koreanName =
        koreanPlayerNameById.get(playerId) ??
        (teamId === 'incheon'
          ? getKoreanPlayerName(playerId, playerName)
          : null);
      if (koreanName) koreanPlayerNameById.set(playerId, koreanName);
      localizationByPlayerId.set(playerId, {
        provider: 'sportmonks',
        provider_player_id: playerId,
        name_en: sourceDisplayName,
        name_ko: koreanName,
        is_verified: storedLocalization?.is_verified ?? Boolean(koreanName),
        updated_at: new Date().toISOString(),
      });
      const row = {
        season,
        league_id: config.internalLeagueId,
        team_id: teamId,
        player_id: playerId,
        player_name: playerName,
        goals,
        appearances,
        updated_at: new Date().toISOString(),
      };
      const scorerKey = `${teamId}:${playerId}`;
      const current = scorerByTeamPlayerId.get(scorerKey);
      if (
        !current ||
        goals > Number(current.goals) ||
        appearances > Number(current.appearances)
      )
        scorerByTeamPlayerId.set(scorerKey, row);

      snapshotInputs.push({
        teamId,
        providerTeamId: member.team_id,
        playerId,
        requestId,
        statistics: {
          appearances: appearancesEvidence,
          goals: goalsEvidence,
          assists: assistsEvidence,
        },
        rawPayload: member as Record<string, unknown>,
      });
    }
    const scorerRows = [...scorerByTeamPlayerId.values()];
    const localizationRows = [...localizationByPlayerId.values()];
    const globalLocalizationProtections =
      await fetchGlobalTransferCandidatePlayerProtections(
        admin,
        localizationRows.map(row => String(row.provider_player_id)),
      );
    const globalProtectedPlayerIds = new Set(
      globalLocalizationProtections.map(protection => protection.player_id),
    );
    const { eligible: eligibleScorerRows, protected: protectedScoringRows } =
      partitionCandidateProtectedRows(
        scorerRows,
        protectedPlayerIds,
        row => row.player_id,
      );
    const {
      eligible: eligibleLocalizationRows,
      protected: protectedLocalizationRows,
    } = partitionCandidateProtectedRows(
      localizationRows,
      globalProtectedPlayerIds,
      row => row.provider_player_id,
    );
    const scoringCreated = eligibleScorerRows.filter(
      row =>
        !storedScoringKeys.has(
          `${String(row.team_id)}:${String(row.player_id)}`,
        ),
    ).length;
    const scoringUpdated = eligibleScorerRows.length - scoringCreated;
    const localizationCreated = eligibleLocalizationRows.filter(
      row => !storedLocalizationById.has(String(row.provider_player_id)),
    ).length;
    const localizationUpdated =
      eligibleLocalizationRows.length - localizationCreated;
    const quarantineTelemetry = buildCandidateQuarantineTelemetry({
      quarantineCount: candidateProtections.length,
      globalLocalizationProtectedCount:
        globalLocalizationProtections.length,
      projectionSkipped: protectedLocalizationRows.length,
      membershipSkipped: 0,
      scoringSkipped: protectedScoringRows.length,
      localizationSkipped: protectedLocalizationRows.length,
      scoringCreated,
      scoringUpdated,
      localizationCreated,
      localizationUpdated,
    });
    const fetchedAt = new Date().toISOString();
    await Promise.all(
      snapshotInputs.map(input =>
        persistPlayerProviderSnapshot(admin, {
          config,
          teamId: input.teamId,
          providerTeamId: input.providerTeamId,
          playerId: input.playerId,
          requestId: input.requestId,
          endpoint: `squads/seasons/${seasonId}/teams/${input.providerTeamId}`,
          rawPayload: input.rawPayload,
          statistics: input.statistics,
          fetchedAt,
        }),
      ),
    );
    if (eligibleLocalizationRows.length) {
      const { error } = await admin
        .from('football_player_localizations')
        .upsert(eligibleLocalizationRows, {
          onConflict: 'provider,provider_player_id',
        });
      if (error) throw error;
    }
    if (eligibleScorerRows.length) {
      const { error } = await admin
        .from('player_scoring_stats')
        .upsert(eligibleScorerRows, {
          onConflict: 'season,league_id,team_id,player_id',
        });
      if (error) throw error;
    }
    console.info(
      JSON.stringify({
        event: 'candidate_quarantine_telemetry',
        writer: 'sync-football-data',
        season,
        league_id: config.internalLeagueId,
        telemetry: quarantineTelemetry,
      }),
    );
    let lineupCount = 0;
    let skippedLineupPlayers = 0;
    const now = Date.now();
    const oldestLineup = now - 45 * 24 * 60 * 60 * 1_000;
    const latestLineup = now + 12 * 60 * 60 * 1_000;
    const lineupCandidates = syncLineups
      ? fixturesPayload
          .filter(fixture => {
            const kickoff = new Date(
              normalizeKickoff(fixture.starting_at),
            ).getTime();
            return kickoff >= oldestLineup && kickoff <= latestLineup;
          })
          .sort(
            (a, b) =>
              new Date(normalizeKickoff(b.starting_at)).getTime() -
              new Date(normalizeKickoff(a.starting_at)).getTime(),
          )
          .slice(0, lineupFixtureLimit)
      : [];
    for (const candidate of lineupCandidates) {
      const payload = await apiGet<FixtureWithLineups>(
        admin,
        token,
        `fixtures/${candidate.id}`,
        { include: 'metadata;lineups.player;lineups.position;formations' },
      );
      const fixture = payload.data;
      if (!isConfirmedLineup(fixture) && mapStatus(fixture) === 'SCHEDULED') {
        continue;
      }
      const lineupGroups = new Map<number, LineupPlayer[]>();
      const recoveredLineups = await recoverMissingLineupPlayerIds(
        fixture.season_id, fixture.lineups ?? [],
        async (squadSeasonId, teamId) => (await apiGet<SeasonSquadMember[]>(
          admin, token, `squads/seasons/${squadSeasonId}/teams/${teamId}`,
          { include: 'player' },
        )).data,
      );
      for (const player of recoveredLineups) {
        const group = lineupGroups.get(player.team_id) ?? [];
        group.push(player);
        lineupGroups.set(player.team_id, group);
      }
      const fixtureId =
        fixtureIdBySportmonksId.get(candidate.id) ??
        `sportmonks-${candidate.id}`;
      const lineupRows: Record<string, unknown>[] = [];
      const playerRows: Record<string, unknown>[] = [];
      for (const [sportmonksTeamId, players] of lineupGroups) {
        const teamId = teamIdBySportmonksId.get(sportmonksTeamId);
        if (!teamId) continue;
        const formation = fixture.formations?.find(
          item => item.participant_id === sportmonksTeamId,
        )?.formation;
        lineupRows.push({
          fixture_id: fixtureId,
          team_id: teamId,
          formation: formation ?? null,
          coach_id: null,
          coach_name: null,
          fetched_at: new Date().toISOString(),
        });
        for (const [index, player] of players.entries()) {
          const isStarter = player.type_id === 11;
          const identity = resolveLineupPlayerIdentity(
            player.player_id,
            isStarter,
          );
          if (identity.status === 'reject') {
            throw new Error(
              `PROVIDER_READ: confirmed lineup ${fixtureId} contains an invalid starter provider player ID`,
            );
          }
          if (identity.status === 'skip') {
            skippedLineupPlayers += 1;
            continue;
          }
          const playerId = identity.playerId;
          playerRows.push({
            fixture_id: fixtureId,
            team_id: teamId,
            player_id: playerId,
            player_name: getPlayerName(player),
            display_name_ko: koreanPlayerNameById.get(playerId) ?? null,
            shirt_number: player.jersey_number ?? null,
            position: player.position?.name ?? null,
            grid:
              player.formation_field ??
              (player.formation_position === null ||
              player.formation_position === undefined
                ? null
                : String(player.formation_position)),
            role: isStarter ? 'STARTER' : 'SUBSTITUTE',
            sort_order: index,
          });
        }
      }
      if (
        lineupRows.length !== 2 ||
        playerRows.filter(player => player.role === 'STARTER').length < 22
      )
        continue;
      await publishFixtureLineup(admin, fixtureId, lineupRows, playerRows);
      lineupCount += lineupRows.length;
    }

    const topScorersByTeam = [...teamIdBySportmonksId.values()].map(teamId => ({
      teamId,
      players: eligibleScorerRows
        .filter(row => row.team_id === teamId)
        .sort(
          (a, b) =>
            Number(b.goals) - Number(a.goals) ||
            Number(a.appearances) - Number(b.appearances),
        )
        .slice(0, 3)
        .map(row => ({
          playerName: row.player_name,
          goals: row.goals,
          appearances: row.appearances,
        })),
    }));

    if (maintenance) {
      await maintenance.finish('SUCCESS');
      await recordRetry('succeeded');
    } else {
      const { error: seasonReadyError } = await admin
        .from('football_provider_seasons')
        .update({sync_status: 'READY', sync_error_code: null, last_synced_at: new Date().toISOString()})
        .eq('provider', 'sportmonks')
        .eq('provider_league_id', config.providerLeagueId)
        .eq('provider_season_id', seasonId);
      if (seasonReadyError) throw seasonReadyError;
    }

    return Response.json({
      provider: 'sportmonks',
      leagueId,
      internalLeagueId: config.internalLeagueId,
      seasonId,
      season,
      historySyncKey: historyMode ? historySyncKey : undefined,
      teams: teamRows.length,
      fixtures: fixtureRowsToApply.length,
      standings: writableStandingRows.length,
      standingsPolicy: { source: standingPolicy.source, reasons: standingPolicy.reasons },
      scorers: eligibleScorerRows.length,
      players: eligibleScorerRows.length,
      lineups: lineupCount,
      skippedLineupPlayers,
      telemetry: quarantineTelemetry,
      topScorersByTeam,
      playerNames:
        body.includePlayerNames === true
          ? eligibleScorerRows.map(row => ({
              teamId: row.team_id,
              playerId: row.player_id,
              name: row.player_name,
            }))
          : undefined,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    if (maintenance) {
      if (maintenance.canRecordFailure) {
        try { await maintenance.finish(maintenanceFailureResult(error), error); }
        catch (completionError) { console.error(getErrorMessage(completionError)); }
      }
      await recordRetry(message.includes('OUTCOME_UNKNOWN') ? 'partial' : 'failed', message.slice(0,1000)).catch(error=>console.error(getErrorMessage(error)));
      console.error(message);
      return Response.json({error: message}, {status: maintenanceFailureResult(error) === 'BLOCKED' ? 409 : 500});
    }
    const { error: seasonErrorUpdateError } = await admin
      .from('football_provider_seasons')
      .update({
        sync_status: 'ERROR',
        sync_error_code: getSyncErrorCode(message),
      })
      .eq('provider', 'sportmonks')
      .eq('provider_league_id', config.providerLeagueId)
      .eq('provider_season_id', seasonId);
    if (seasonErrorUpdateError) console.error(seasonErrorUpdateError.message);
    console.error(message);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await maintenance?.stop();
  }
});
