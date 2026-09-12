-- Preserve provider values while presenting the remaining schedule venues in
-- Korean. These localized columns remain authoritative after provider syncs.
update public.stadiums as stadium
set name_en = coalesce(stadium.name_en, stadium.name),
    address_en = coalesce(stadium.address_en, stadium.address),
    name_ko = localized.name_ko,
    address_ko = localized.address_ko,
    name = localized.name_ko,
    address = localized.address_ko
from (
  values
    ('sportmonks-venue-13542', '천안축구센터 주경기장', '충청남도 천안시 서북구 축구센터로 150'),
    ('sportmonks-venue-13852', '용인축구센터', '경기도 용인시 처인구 원삼면 보개원삼로 1752'),
    ('sportmonks-venue-14052', '안산 와스타디움', '경기도 안산시 단원구 화랑로 260')
) as localized(stadium_id, name_ko, address_ko)
where stadium.id = localized.stadium_id;
