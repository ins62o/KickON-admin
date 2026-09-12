import { publishFixtureLineup } from '../_shared/publishFixtureLineup.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  recordFootballProviderUsage,
  type FootballRateLimit,
} from '../_shared/footballProviderUsage.ts';

const API_BASE_URL = 'https://api.sportmonks.com/v3/football';
const DEFAULT_LEAGUE_ID = 1034;
const DEFAULT_SEASON_ID = 26894;
const DEFAULT_SEASON = 2026;
const ENABLED_SEASON_IDS: Record<number, number> = {
  2024: 23091,
  2025: 25044,
  2026: 26894,
};
const DEFAULT_LINEUP_FIXTURE_LIMIT = 40;
const K_LEAGUE_2_ID = 1362;
const K_LEAGUE_2_SEASON_ID = 27443;
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
  player_id: number;
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
  player_id: number;
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
  [['ansangreeners', '안산그리너스'], 'ansan-greeners'],
  [['busanipark', '부산아이파크'], 'busan-ipark'],
  [['cheonancity', '천안시티'], 'cheonan-city'],
  [['cheongju', '충북청주'], 'chungbuk-cheongju'],
  [['seouleland', '서울이랜드'], 'seoul-eland'],
  [['suwonfc', '수원fc'], 'suwon-fc'],
  [['suwonbluewings', '수원삼성'], 'suwon-bluewings'],
  [['chungnamasan', '충남아산'], 'chungnam-asan'],
  [['gimhaecity', '김해'], 'gimhae'],
  [['gimpo', '김포'], 'gimpo'],
  [['gyeongnam', '경남'], 'gyeongnam'],
  [['hwaseong', '화성'], 'hwaseong'],
  [['jeonnamdragons', '전남'], 'jeonnam'],
  [['pajucitizen', '파주'], 'paju'],
  [['seongnam', '성남'], 'seongnam'],
  [['yongincity', '용인'], 'yongin'],
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
  2690: 'busan-ipark',
  2366: 'suwon-bluewings',
  3605: 'seongnam',
  6201: 'ansan-greeners',
  7389: 'gimhae',
  7971: 'jeonnam',
  7983: 'gyeongnam',
  14732: 'seoul-eland',
  17812: 'chungnam-asan',
  17818: 'cheonan-city',
  18123: 'yongin',
  18294: 'hwaseong',
  18334: 'chungbuk-cheongju',
  18344: 'paju',
  18351: 'gimpo',
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
  'ansan-greeners': 'sportmonks-venue-14052',
  'busan-ipark': 'sportmonks-venue-2678',
  'cheonan-city': 'sportmonks-venue-14080',
  'chungbuk-cheongju': 'sportmonks-venue-14117',
  'chungnam-asan': 'sportmonks-venue-14115',
  daegu: 'sportmonks-venue-320604',
  gimhae: 'sportmonks-venue-4787',
  gimpo: 'sportmonks-venue-14093',
  gyeongnam: 'sportmonks-venue-5190',
  hwaseong: 'hwaseong-sports-town',
  jeonnam: 'sportmonks-venue-5186',
  paju: 'sportmonks-venue-14120',
  seongnam: 'sportmonks-venue-2112',
  'seoul-eland': 'sportmonks-venue-343344',
  'suwon-bluewings': 'sportmonks-venue-324',
  'suwon-fc': 'sportmonks-venue-14076',
  yongin: 'yongin-mireu-stadium',
};

type StadiumLocalization = {
  nameEn: string;
  nameKo: string;
  latitude?: number;
  longitude?: number;
  addressEn?: string;
  addressKo?: string;
  sportmonksId?: number | null;
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
  'ansan-greeners': {
    nameEn: 'Ansan Wa Stadium',
    nameKo: '안산 와스타디움',
    latitude: 37.3193957,
    longitude: 126.8186467,
    addressEn: '260 Hwarang-ro, Danwon-gu, Ansan-si, Gyeonggi-do',
    addressKo: '경기도 안산시 단원구 화랑로 260',
    sportmonksId: 14052,
  },
  'busan-ipark': {
    nameEn: 'Busan Gudeok Stadium',
    nameKo: '부산 구덕운동장',
    latitude: 35.1165225,
    longitude: 129.01449,
    addressEn: '57 Mangyang-ro, Seo-gu, Busan',
    addressKo: '부산광역시 서구 망양로 57',
    sportmonksId: 2678,
  },
  'cheonan-city': {
    nameEn: 'Cheonan Stadium',
    nameKo: '천안종합운동장',
    latitude: 36.8187472,
    longitude: 127.1151474,
    addressEn: '208 Beonyeong-ro, Seobuk-gu, Cheonan-si, Chungcheongnam-do',
    addressKo: '충청남도 천안시 서북구 번영로 208',
    sportmonksId: 14080,
  },
  'chungbuk-cheongju': {
    nameEn: 'Cheongju Stadium',
    nameKo: '청주종합경기장',
    latitude: 36.6378917,
    longitude: 127.4723813,
    addressEn: '229 Sajik-daero, Seowon-gu, Cheongju-si, Chungcheongbuk-do',
    addressKo: '충청북도 청주시 서원구 사직대로 229',
    sportmonksId: 14117,
  },
  'chungnam-asan': {
    nameEn: 'Yi Sun-sin Stadium',
    nameKo: '이순신종합운동장',
    latitude: 36.7681989,
    longitude: 127.0216292,
    addressEn: '370-24 Nambu-ro, Asan-si, Chungcheongnam-do',
    addressKo: '충청남도 아산시 남부로 370-24',
    sportmonksId: 14115,
  },
  daegu: {
    nameEn: 'Daegu iM Bank PARK',
    nameKo: '대구iM뱅크PARK',
    latitude: 35.8812967,
    longitude: 128.5879941,
    addressEn: '191 Goseong-ro, Buk-gu, Daegu',
    addressKo: '대구광역시 북구 고성로 191',
    sportmonksId: 320604,
  },
  gimhae: {
    nameEn: 'Gimhae Stadium',
    nameKo: '김해종합운동장',
    latitude: 35.2576238,
    longitude: 128.8753665,
    addressEn: '50 Guji-ro, Gimhae-si, Gyeongsangnam-do',
    addressKo: '경상남도 김해시 구지로 50',
    sportmonksId: 4787,
  },
  gimpo: {
    nameEn: 'Gimpo Solteo Football Field',
    nameKo: '김포솔터축구장',
    latitude: 37.6408155,
    longitude: 126.6500187,
    addressEn: '385 Gimpohangang 3-ro, Gimpo-si, Gyeonggi-do',
    addressKo: '경기도 김포시 김포한강3로 385',
    sportmonksId: 14093,
  },
  gyeongnam: {
    nameEn: 'Changwon Football Center',
    nameKo: '창원축구센터',
    latitude: 35.2226675,
    longitude: 128.7060856,
    addressEn: '97 Bieum-ro, Seongsan-gu, Changwon-si, Gyeongsangnam-do',
    addressKo: '경상남도 창원시 성산구 비음로 97',
    sportmonksId: 5190,
  },
  hwaseong: {
    nameEn: 'Hwaseong Sports Town',
    nameKo: '화성종합경기타운',
    latitude: 37.1372825,
    longitude: 126.924715,
    addressEn: '470 Hyangnam-ro, Hyangnam-eup, Hwaseong-si, Gyeonggi-do',
    addressKo: '경기도 화성시 향남읍 향남로 470',
    sportmonksId: null,
  },
  jeonnam: {
    nameEn: 'Gwangyang Football Stadium',
    nameKo: '광양축구전용구장',
    latitude: 34.9330583,
    longitude: 127.7274262,
    addressEn: '1641 Baegun-ro, Gwangyang-si, Jeollanam-do',
    addressKo: '전라남도 광양시 백운로 1641',
    sportmonksId: 5186,
  },
  paju: {
    nameEn: 'Paju Stadium',
    nameKo: '파주스타디움',
    latitude: 37.7561209,
    longitude: 126.7865965,
    addressEn: '160 Jungang-ro, Paju-si, Gyeonggi-do',
    addressKo: '경기도 파주시 중앙로 160',
    sportmonksId: 14120,
  },
  seongnam: {
    nameEn: 'Tancheon Stadium',
    nameKo: '탄천종합운동장',
    latitude: 37.4101669,
    longitude: 127.1211863,
    addressEn: '215 Tancheon-ro, Bundang-gu, Seongnam-si, Gyeonggi-do',
    addressKo: '경기도 성남시 분당구 탄천로 215',
    sportmonksId: 2112,
  },
  'seoul-eland': {
    nameEn: 'Mokdong Stadium',
    nameKo: '목동종합운동장',
    latitude: 37.5305043,
    longitude: 126.8830581,
    addressEn: '939 Anyangcheon-ro, Yangcheon-gu, Seoul',
    addressKo: '서울특별시 양천구 안양천로 939',
    sportmonksId: 343344,
  },
  'suwon-bluewings': {
    nameEn: 'Suwon World Cup Stadium',
    nameKo: '수원월드컵경기장',
    latitude: 37.2863794,
    longitude: 127.0367951,
    addressEn: '310 World Cup-ro, Paldal-gu, Suwon-si, Gyeonggi-do',
    addressKo: '경기도 수원시 팔달구 월드컵로 310',
    sportmonksId: 324,
  },
  'suwon-fc': {
    nameEn: 'Suwon Stadium',
    nameKo: '수원종합운동장',
    latitude: 37.2977947,
    longitude: 127.0113949,
    addressEn: '893 Gyeongsu-daero, Jangan-gu, Suwon-si, Gyeonggi-do',
    addressKo: '경기도 수원시 장안구 경수대로 893',
    sportmonksId: 14076,
  },
  yongin: {
    nameEn: 'Yongin Mireu Stadium',
    nameKo: '용인미르스타디움',
    latitude: 37.2496378,
    longitude: 127.16547,
    addressEn: '61 Dongbaekjukjeon-daero, Cheoin-gu, Yongin-si, Gyeonggi-do',
    addressKo: '경기도 용인시 처인구 동백죽전대로 61',
    sportmonksId: null,
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
  return detail ? Math.max(0, Math.trunc(toNumber(detail.value))) : 0;
}

function getTeamStatisticValue(
  statistics: TeamStatistic[] | undefined,
  seasonId: number,
  typeId: number,
) {
  const statistic = (statistics ?? []).find(
    item => item.season_id === seasonId || item.season_id == null,
  );
  const detail = statistic?.details?.find(item => item.type_id === typeId);
  if (!detail) return null;

  const readValue = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of ['average', 'percentage', 'value', 'total', 'count']) {
      const parsed = readValue(record[key]);
      if (parsed !== null) return parsed;
    }
    for (const key of ['all', 'overall']) {
      const parsed = readValue(record[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  return readValue(detail.value);
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

function getPositionName(positionId?: number | null) {
  if (positionId === 24) return 'Goalkeeper';
  if (positionId === 25) return 'Defender';
  if (positionId === 26) return 'Midfielder';
  if (positionId === 27) return 'Attacker';
  return null;
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

async function handleSyncRequest(request: Request) {
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
  if (body.mode === 'discover-seasons') {
    try {
      const providerLeagueId = Number(body.leagueId ?? DEFAULT_LEAGUE_ID);
      if (!Number.isSafeInteger(providerLeagueId) || providerLeagueId <= 0) {
        return Response.json(
          { error: 'A valid leagueId is required' },
          { status: 400 },
        );
      }
      const seasons = await apiGetAll<ProviderSeason>(admin, token, 'seasons', {
        filters: `seasonLeagues:${providerLeagueId}`,
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
        leagueId: providerLeagueId,
        seasons: rows,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(message);
      return Response.json({ error: message }, { status: 502 });
    }
  }
  if (body.mode === 'discover-teams') {
    try {
      const providerSeasonId = Number(body.seasonId);
      if (!Number.isSafeInteger(providerSeasonId) || providerSeasonId <= 0) {
        return Response.json(
          { error: 'A valid seasonId is required' },
          { status: 400 },
        );
      }
      const season = await apiGet<ProviderSeason>(
        admin,
        token,
        `seasons/${providerSeasonId}`,
      );
      const providerTeams = await apiGetAll<Team>(
        admin,
        token,
        `teams/seasons/${providerSeasonId}`,
      );
      const rows = providerTeams.map(team => ({
        provider: 'sportmonks',
        provider_season_id: providerSeasonId,
        provider_team_id: team.id,
        provider_team_name: team.name,
        internal_team_id: null,
        mapping_status: 'UNMAPPED',
        discovered_at: new Date().toISOString(),
      }));
      const { error } = await admin
        .from('football_provider_teams')
        .upsert(rows, {
          onConflict: 'provider,provider_season_id,provider_team_id',
        });
      if (error) throw error;
      return Response.json({
        provider: 'sportmonks',
        leagueId: season.data.league_id,
        seasonId: providerSeasonId,
        teams: rows.map(row => ({
          id: row.provider_team_id,
          name: row.provider_team_name,
        })),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(message);
      return Response.json({ error: message }, { status: 502 });
    }
  }
  if (body.mode === 'backfill-history') {
    await admin
      .from('football_provider_seasons')
      .update({ sync_status: 'RUNNING', sync_error_code: null })
      .eq('provider', 'sportmonks')
      .neq('sync_status', 'READY')
      .in('provider_season_id', Object.values(ENABLED_SEASON_IDS));
    const { data: claimed, error: claimError } = await admin.rpc(
      'claim_football_sync',
      {
        target_sync_key: 'sportmonks-history-2024-2026',
        target_cooldown_seconds: 300,
      },
    );
    if (claimError) {
      return Response.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed) return Response.json({ status: 'already-running' });

    const results: Record<string, unknown>[] = [];
    try {
      const { data: existingSeasonStates } = await admin
        .from('football_provider_seasons')
        .select('provider_season_id, sync_status')
        .eq('provider', 'sportmonks')
        .in('provider_season_id', Object.values(ENABLED_SEASON_IDS));
      const readySeasonIds = new Set(
        (existingSeasonStates ?? [])
          .filter(state => state.sync_status === 'READY')
          .map(state => Number(state.provider_season_id)),
      );
      for (const [targetSeason, targetSeasonId] of Object.entries(
        ENABLED_SEASON_IDS,
      )) {
        if (readySeasonIds.has(targetSeasonId)) {
          results.push({ season: Number(targetSeason), status: 'cached' });
          continue;
        }
        const response = await fetch(
          `${supabaseUrl}/functions/v1/sync-football-data`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-sync-secret': suppliedSecret,
            },
            body: JSON.stringify({
              leagueId: DEFAULT_LEAGUE_ID,
              seasonId: targetSeasonId,
              season: Number(targetSeason),
              syncLineups: false,
            }),
          },
        );
        const result = await response.json();
        results.push({ season: Number(targetSeason), ...result });
        if (!response.ok) {
          throw new Error(
            `Season ${targetSeason} backfill failed: ${JSON.stringify(result)}`,
          );
        }
      }
      const goalBackfillResponse = await fetch(
        `${supabaseUrl}/functions/v1/sync-live-football`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-sync-secret': suppliedSecret,
          },
          body: JSON.stringify({ mode: 'backfill-goals', limit: 1000 }),
        },
      );
      const goalBackfill = await goalBackfillResponse.json();
      if (!goalBackfillResponse.ok) {
        throw new Error(
          `Goal-event backfill failed: ${JSON.stringify(goalBackfill)}`,
        );
      }
      await admin.from('football_sync_state').upsert(
        {
          sync_key: 'sportmonks-history-2024-2026',
          last_succeeded_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: 'sync_key' },
      );
      return Response.json({ status: 'completed', results, goalBackfill });
    } catch (error) {
      const message = getErrorMessage(error);
      await admin
        .from('football_provider_seasons')
        .update({ sync_status: 'ERROR', sync_error_code: 'UNKNOWN' })
        .eq('provider', 'sportmonks')
        .eq('sync_status', 'RUNNING')
        .in('provider_season_id', Object.values(ENABLED_SEASON_IDS));
      await admin.from('football_sync_state').upsert(
        {
          sync_key: 'sportmonks-history-2024-2026',
          last_error: message,
        },
        { onConflict: 'sync_key' },
      );
      console.error(message);
      return Response.json({ error: message, results }, { status: 502 });
    }
  }
  const leagueId = Number(body.leagueId ?? DEFAULT_LEAGUE_ID);
  const seasonId = Number(body.seasonId ?? DEFAULT_SEASON_ID);
  const season = Number(body.season ?? DEFAULT_SEASON);
  const syncLineups = body.syncLineups === true;
  const lineupFixtureLimit = Math.min(
    40,
    Math.max(
      0,
      Number(body.lineupFixtureLimit ?? DEFAULT_LINEUP_FIXTURE_LIMIT),
    ),
  );
  const internalLeagueId =
    leagueId === DEFAULT_LEAGUE_ID && ENABLED_SEASON_IDS[season] === seasonId
      ? 'kleague'
      : leagueId === K_LEAGUE_2_ID &&
        season === DEFAULT_SEASON &&
        seasonId === K_LEAGUE_2_SEASON_ID
      ? 'kleague2'
      : null;
  if (!internalLeagueId) {
    return Response.json(
      { error: 'The requested K League season is not enabled' },
      { status: 400 },
    );
  }

  const postMatch = body.postMatch === true;
  const postMatchSyncKey = `sportmonks-post-match-${internalLeagueId}-${season}`;
  if (postMatch) {
    const { data: claimed, error: claimError } = await admin.rpc(
      'claim_football_sync',
      {
        target_sync_key: postMatchSyncKey,
        target_cooldown_seconds: 240,
      },
    );
    if (claimError) {
      return Response.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed) return Response.json({ status: 'already-running' });
  }

  await admin
    .from('football_provider_seasons')
    .update({ sync_status: 'RUNNING', sync_error_code: null })
    .eq('provider', 'sportmonks')
    .eq('provider_season_id', seasonId);

  try {
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
      const useCanonicalHomeVenue =
        internalLeagueId === 'kleague2' && Boolean(preferredId && homeTeamId);
      const id =
        (useCanonicalHomeVenue ? preferredId : undefined) ??
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
        (useCanonicalHomeVenue ? localization?.nameEn : venue.name) ??
        (pending?.name_en as string | null | undefined) ??
        stored?.name_en ??
        localization?.nameEn ??
        venue.name ??
        stored?.name ??
        `Venue ${venue.id}`;
      const nameKo =
        localization?.nameKo ??
        (pending?.name_ko as string | null | undefined) ??
        stored?.name_ko ??
        null;
      const addressEn =
        (useCanonicalHomeVenue ? localization?.addressEn : undefined) ||
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
          useCanonicalHomeVenue && localization?.latitude !== undefined
            ? localization.latitude
            : stored && Number(stored.latitude) !== 0
            ? stored.latitude
            : toNumber(venue.latitude),
        longitude:
          useCanonicalHomeVenue && localization?.longitude !== undefined
            ? localization.longitude
            : stored && Number(stored.longitude) !== 0
            ? stored.longitude
            : toNumber(venue.longitude),
        address: addressKo ?? addressEn ?? stored?.address ?? null,
        address_en: addressEn,
        address_ko: addressKo,
        sportmonks_id: useCanonicalHomeVenue
          ? localization?.sportmonksId ?? null
          : venue.id,
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
        .select('id, home_team_id, away_team_id, kickoff_at, sportmonks_id')
        .eq('league_id', internalLeagueId)
        .gte('kickoff_at', seasonStart)
        .lt('kickoff_at', seasonEnd);
    if (storedFixtureError) {
      throw new Error(`FIXTURE_READ: ${getErrorMessage(storedFixtureError)}`);
    }
    const usedStoredFixtureIds = new Set<string>();
    const fixtureIdBySportmonksId = new Map<number, string>();
    const resolveFixtureId = (
      providerFixtureId: number,
      homeTeamId: string,
      awayTeamId: string,
      kickoffAt: string,
    ) => {
      const byProviderId = (storedSeasonFixtures ?? []).find(
        stored => Number(stored.sportmonks_id) === providerFixtureId,
      );
      if (byProviderId) return String(byProviderId.id);
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
        return String(equivalent.id);
      }
      return `sportmonks-${providerFixtureId}`;
    };

    const unmappedFixtureDetails: string[] = [];
    const fixtureRows = fixturesPayload.flatMap(fixture => {
      const home = getParticipant(fixture, 'home');
      const away = getParticipant(fixture, 'away');
      const homeTeamId = home ? teamIdBySportmonksId.get(home.id) : undefined;
      const awayTeamId = away ? teamIdBySportmonksId.get(away.id) : undefined;
      const stadiumId =
        internalLeagueId === 'kleague2' && homeTeamId
          ? HOME_STADIUM_BY_TEAM[homeTeamId]
          : fixture.venue_id
          ? stadiumIdBySportmonksId.get(fixture.venue_id)
          : homeTeamId
          ? HOME_STADIUM_BY_TEAM[homeTeamId]
          : undefined;
      if (!home || !away || !homeTeamId || !awayTeamId || !stadiumId) {
        unmappedFixtureDetails.push(
          `${fixture.id}:${home?.name ?? 'unknown'}-${
            away?.name ?? 'unknown'
          }:venue=${fixture.venue_id ?? fixture.venue?.id ?? 'none'}`,
        );
        return [];
      }
      const kickoffAt = normalizeKickoff(fixture.starting_at);
      const fixtureId = resolveFixtureId(
        fixture.id,
        homeTeamId,
        awayTeamId,
        kickoffAt,
      );
      fixtureIdBySportmonksId.set(fixture.id, fixtureId);
      return [
        {
          id: fixtureId,
          sportmonks_id: fixture.id,
          league_id: internalLeagueId,
          round: parseRound(fixture.round?.name),
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          stadium_id: stadiumId,
          kickoff_at: kickoffAt,
          status: mapStatus(fixture),
          home_score: getScore(fixture, home),
          away_score: getScore(fixture, away),
          updated_at: new Date().toISOString(),
        },
      ];
    });
    if (fixtureRows.length !== fixturesPayload.length) {
      throw new Error(
        `Only ${fixtureRows.length}/${
          fixturesPayload.length
        } fixtures could be mapped: ${unmappedFixtureDetails
          .slice(0, 20)
          .join(', ')}`,
      );
    }
    const { error: fixtureError } = await admin
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'id' });
    if (fixtureError) {
      throw new Error(`FIXTURE_WRITE: ${getErrorMessage(fixtureError)}`);
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
        const providerTeam = teamsPayload.find(
          team => team.id === standing.participant_id,
        );
        const possession = getTeamStatisticValue(
          providerTeam?.statistics,
          seasonId,
          45,
        );
        return [
          {
            season,
            league_id: internalLeagueId,
            team_id: teamId,
            rank: standing.position,
            played: getDetailValue(details, STANDING_TYPE_IDS.played, [
              'OVERALL_MATCHED_PLAYED',
              'MATCHES_PLAYED',
            ]),
            points: standing.points,
            won: getDetailValue(details, STANDING_TYPE_IDS.won, [
              'OVERALL_WON',
              'WINS',
            ]),
            drawn: getDetailValue(details, STANDING_TYPE_IDS.drawn, [
              'OVERALL_DRAW',
              'DRAWS',
            ]),
            lost: getDetailValue(details, STANDING_TYPE_IDS.lost, [
              'OVERALL_LOST',
              'LOSSES',
            ]),
            goals_for: getDetailValue(details, STANDING_TYPE_IDS.goalsFor, [
              'OVERALL_GOALS_FOR',
              'GOALS_FOR',
            ]),
            goals_against: getDetailValue(
              details,
              STANDING_TYPE_IDS.goalsAgainst,
              ['OVERALL_GOALS_AGAINST', 'GOALS_AGAINST'],
            ),
            goal_difference: getDetailValue(
              details,
              STANDING_TYPE_IDS.goalDifference,
              ['GOAL_DIFFERENCE'],
            ),
            clean_sheets: getCleanSheetCount(
              fixturesPayload,
              standing.participant_id,
            ),
            average_possession:
              possession === null
                ? null
                : Math.min(100, Math.max(0, possession)),
            updated_at: new Date().toISOString(),
          },
        ];
      },
    );
    if (standingRows.length) {
      const { error } = await admin
        .from('league_standings')
        .upsert(standingRows, {
          onConflict: 'season,league_id,team_id',
        });
      if (error) throw error;
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
    const incompleteSquadCount = squadResponses.filter(
      squad => squad.length < 11,
    ).length;
    if (incompleteSquadCount > 0) {
      throw new Error(
        `PROVIDER_READ: ${incompleteSquadCount}/${squadResponses.length} team squads were incomplete`,
      );
    }
    const scorerByPlayerId = new Map<string, Record<string, unknown>>();
    const teamPlayerByPlayerId = new Map<string, Record<string, unknown>>();
    const localizationByPlayerId = new Map<string, Record<string, unknown>>();
    for (const member of squadResponses.flat()) {
      const teamId = teamIdBySportmonksId.get(member.team_id);
      if (!teamId) continue;
      const goals = getDetailValue(member.details, SCORER_TYPE_IDS.goals, [
        'GOALS',
      ]);
      const appearances = getDetailValue(
        member.details,
        SCORER_TYPE_IDS.appearances,
        ['APPEARANCES'],
      );
      const assists = getDetailValue(member.details, SCORER_TYPE_IDS.assists, [
        'ASSISTS',
      ]);
      const playerId = String(member.player_id);
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
        league_id: internalLeagueId,
        team_id: teamId,
        player_id: playerId,
        player_name: playerName,
        goals,
        appearances,
        updated_at: new Date().toISOString(),
      };
      const current = scorerByPlayerId.get(playerId);
      if (
        !current ||
        goals > Number(current.goals) ||
        appearances > Number(current.appearances)
      )
        scorerByPlayerId.set(playerId, row);

      const player = member.player;
      const squadRow = {
        season,
        league_id: internalLeagueId,
        team_id: teamId,
        player_id: playerId,
        player_name: playerName,
        display_name: sourceDisplayName,
        display_name_ko: koreanName,
        image_url: player?.image_path ?? null,
        shirt_number: member.jersey_number ?? null,
        position:
          member.position?.name ??
          getPositionName(member.position_id ?? member.player?.position_id),
        detailed_position:
          member.detailedPosition?.name ??
          member.detailed_position?.name ??
          null,
        appearances,
        goals,
        assists,
        height: player?.height ?? null,
        weight: player?.weight ?? null,
        date_of_birth: player?.date_of_birth ?? null,
        in_squad: player?.in_squad !== false,
        updated_at: new Date().toISOString(),
      };
      const currentSquadRow = teamPlayerByPlayerId.get(playerId);
      if (
        !currentSquadRow ||
        appearances > Number(currentSquadRow.appearances) ||
        goals > Number(currentSquadRow.goals)
      )
        teamPlayerByPlayerId.set(playerId, squadRow);
    }
    const scorerRows = [...scorerByPlayerId.values()];
    const teamPlayerRows = [...teamPlayerByPlayerId.values()];
    const localizationRows = [...localizationByPlayerId.values()];
    if (localizationRows.length) {
      const { error } = await admin
        .from('football_player_localizations')
        .upsert(localizationRows, {
          onConflict: 'provider,provider_player_id',
        });
      if (error) throw error;
    }
    const { error: scorerDeleteError } = await admin
      .from('player_scoring_stats')
      .delete()
      .eq('season', season)
      .eq('league_id', internalLeagueId);
    if (scorerDeleteError) throw scorerDeleteError;
    if (scorerRows.length) {
      const { error } = await admin
        .from('player_scoring_stats')
        .upsert(scorerRows, {
          onConflict: 'season,league_id,player_id',
        });
      if (error) throw error;
    }
    const { error: teamPlayerDeleteError } = await admin
      .from('team_players')
      .delete()
      .eq('season', season)
      .eq('league_id', internalLeagueId);
    if (teamPlayerDeleteError) throw teamPlayerDeleteError;
    if (teamPlayerRows.length) {
      const { error } = await admin
        .from('team_players')
        .upsert(teamPlayerRows, {
          onConflict: 'season,league_id,player_id',
        });
      if (error) throw error;
    }

    let lineupCount = 0;
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
      for (const player of fixture.lineups ?? []) {
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
        players.forEach((player, index) => {
          const role = player.type_id === 11 ? 'STARTER' : 'SUBSTITUTE';
          playerRows.push({
            fixture_id: fixtureId,
            team_id: teamId,
            player_id: String(player.player_id),
            player_name: getPlayerName(player),
            display_name_ko:
              koreanPlayerNameById.get(String(player.player_id)) ?? null,
            shirt_number: player.jersey_number ?? null,
            position: player.position?.name ?? null,
            grid:
              player.formation_field ??
              (player.formation_position === null ||
              player.formation_position === undefined
                ? null
                : String(player.formation_position)),
            role,
            sort_order: index,
          });
        });
      }
      if (
        lineupRows.length !== 2 ||
        playerRows.filter(player => player.role === 'STARTER').length < 22
      )
        continue;
      await publishFixtureLineup(admin, fixtureId, lineupRows, playerRows);
      lineupCount += lineupRows.length;
    }

    const { error: devFixtureDeleteError } = await admin
      .from('fixtures')
      .delete()
      .like('id', 'dev-%');
    if (devFixtureDeleteError) throw devFixtureDeleteError;

    const topScorersByTeam = [...teamIdBySportmonksId.values()].map(teamId => ({
      teamId,
      players: scorerRows
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

    if (postMatch) {
      const syncedAt = new Date().toISOString();
      const { error: postMatchFixtureError } = await admin
        .from('fixtures')
        .update({ post_match_synced_at: syncedAt })
        .eq('status', 'FINISHED')
        .lte('post_match_sync_due_at', syncedAt)
        .is('post_match_synced_at', null)
        .gte('kickoff_at', seasonStart)
        .lt('kickoff_at', seasonEnd);
      if (postMatchFixtureError) throw postMatchFixtureError;
      await admin.from('football_sync_state').upsert(
        {
          sync_key: postMatchSyncKey,
          last_succeeded_at: syncedAt,
          last_error: null,
        },
        { onConflict: 'sync_key' },
      );
    }

    await admin
      .from('football_provider_seasons')
      .update({
        sync_status: 'READY',
        sync_error_code: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('provider', 'sportmonks')
      .eq('provider_season_id', seasonId);

    return Response.json({
      provider: 'sportmonks',
      leagueId,
      seasonId,
      season,
      teams: teamRows.length,
      fixtures: fixtureRows.length,
      standings: standingRows.length,
      scorers: scorerRows.length,
      players: teamPlayerRows.length,
      lineups: lineupCount,
      topScorersByTeam,
      playerNames:
        body.includePlayerNames === true
          ? teamPlayerRows.map(row => ({
              teamId: row.team_id,
              playerId: row.player_id,
              name: row.player_name,
            }))
          : undefined,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    await admin
      .from('football_provider_seasons')
      .update({
        sync_status: 'ERROR',
        sync_error_code: getSyncErrorCode(message),
      })
      .eq('provider', 'sportmonks')
      .eq('provider_season_id', seasonId);
    if (postMatch) {
      await admin
        .from('football_sync_state')
        .upsert(
          { sync_key: postMatchSyncKey, last_error: message },
          { onConflict: 'sync_key' },
        );
    }
    console.error(message);
    return Response.json({ error: message }, { status: 500 });
  }
}

type BackgroundSyncResult = {
  ok: boolean;
  status: number;
  error: string | null;
};

function backgroundRuntime() {
  return (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
}

async function runBackgroundSync(
  request: Request,
  requests: Record<string, unknown>[],
  syncRunId: string | null,
) {
  const results: BackgroundSyncResult[] = await Promise.all(
    requests.map(async payload => {
      try {
        const response = await handleSyncRequest(
          new Request(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(payload),
          }),
        );
        const body = await response.clone().json().catch(() => ({}));
        const error = body && typeof body === 'object' && !Array.isArray(body) &&
            typeof (body as { error?: unknown }).error === 'string'
          ? (body as { error: string }).error
          : null;
        return { ok: response.ok, status: response.status, error };
      } catch (error) {
        return { ok: false, status: 500, error: getErrorMessage(error) };
      }
    }),
  );

  if (!syncRunId) return;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Background sync could not finalize its sync run');
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const failures = results.filter(result => !result.ok);
  const status = failures.length === 0
    ? 'succeeded'
    : failures.length === results.length
    ? 'failed'
    : 'partial';
  const errorMessage = failures
    .map(result => result.error ?? `HTTP ${result.status}`)
    .join(' | ')
    .slice(0, 1_000) || null;
  const { error } = await admin
    .from('sync_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      failed_count: failures.length,
      error_code: failures.length ? 'sync_failure' : null,
      error_message: errorMessage,
    })
    .eq('id', syncRunId)
    .eq('status', 'running');
  if (error) console.error(`Background sync run finalization failed: ${error.message}`);
}

Deno.serve(async request => {
  if (request.method !== 'POST') return handleSyncRequest(request);
  const body = await request.clone().json().catch(() => ({}));
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      (body as { background?: unknown }).background !== true) {
    return handleSyncRequest(request);
  }

  const suppliedSecret = request.headers.get('x-sync-secret') ?? '';
  const expectedSecret = Deno.env.get('FOOTBALL_SYNC_SECRET');
  let authorized = Boolean(expectedSecret && suppliedSecret === expectedSecret);
  if (!authorized) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { error: 'Supabase server config is missing' },
        { status: 500 },
      );
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verified, error } = await admin.rpc(
      'verify_live_football_sync_secret',
      { candidate: suppliedSecret },
    );
    authorized = !error && verified === true;
  }
  if (!authorized) {
    return new Response('Unauthorized', { status: 401 });
  }
  const requests = (body as { requests?: unknown }).requests;
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 2 ||
      requests.some(payload => !payload || typeof payload !== 'object' || Array.isArray(payload))) {
    return Response.json({ error: 'One or two sync requests are required' }, { status: 400 });
  }
  const runtime = backgroundRuntime();
  if (!runtime) {
    return Response.json({ error: 'Background execution is unavailable' }, { status: 503 });
  }
  const syncRunIdValue = (body as { syncRunId?: unknown }).syncRunId;
  const syncRunId = typeof syncRunIdValue === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncRunIdValue)
    ? syncRunIdValue
    : null;
  runtime.waitUntil(
    runBackgroundSync(
      request,
      requests as Record<string, unknown>[],
      syncRunId,
    ).catch(error => console.error(`Background sync failed: ${getErrorMessage(error)}`)),
  );
  return Response.json(
    { status: 'accepted', requests: requests.length },
    { status: 202 },
  );
});
