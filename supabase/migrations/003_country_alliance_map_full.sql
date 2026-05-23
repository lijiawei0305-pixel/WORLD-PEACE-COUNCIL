-- 003_country_alliance_map_full.sql
--
-- 背景：001 只在 country_alliance_map 写入了 13 个国家，与前端
-- src/data/worldPeaceCouncil.ts 的 countryAllianceMap 严重不一致；
-- 一旦前端切到后端 alliance-map 接口，地图绝大多数国家会失色。
-- 本 migration：
--   1) 给 alliances 表加 display_id 列（前端使用的长格式 id），加 unique 约束，
--      用 upsert 把 7 条 alliance 的 display_id 补齐。表中已有 7 行 id（north_west / china / ...），
--      所以无需新增行；upsert 形式只是为了让 migration 在任何起点上幂等。
--   2) 给 country_alliance_map.country_code 加 unique 约束 uq_country_code（如不存在）。
--   3) DELETE 掉 country_alliance_map 既有数据，按前端 countryAllianceMap 全量重灌。
--      country_code 同时包含 ISO2 + ISO3，与前端字典严格一致，让前端无论传哪种格式都能命中。
--
-- 前端 → 数据库 alliance.id 映射规则（前端长 id 仅作为 display_id 存档）：
--   north_american_western_alliance        -> north_west
--   zhonghua_alliance                      -> china
--   russian_alliance                       -> russia
--   middle_east_islamic_alliance           -> middle_east
--   african_union                          -> africa
--   latin_american_south_american_alliance -> latin_america
--   southeast_asia_alliance                -> southeast_asia
--
-- country_name 取值规则（country_alliance_map.country_name 是 NOT NULL）：
--   - ISO3 在 src/data/demoCountryState.ts 的 countryNames 字典里有英文名 -> 用英文名
--   - 其余（ISO2、未收录的 ISO3）-> 用 country_code 自身做占位
--   后续如果接入更完整的国名词典，可以再做一次 UPDATE。

-- ============================================================
-- Step 1: alliances.display_id
-- ============================================================
alter table public.alliances
  add column if not exists display_id text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'alliances_display_id_unique'
  ) then
    alter table public.alliances
      add constraint alliances_display_id_unique unique (display_id);
  end if;
end$$;

insert into public.alliances (id, name, display_id)
values
  ('north_west',     '北美·西方联盟',  'north_american_western_alliance'),
  ('china',          '中华联盟',        'zhonghua_alliance'),
  ('russia',         '俄罗斯联邦',      'russian_alliance'),
  ('middle_east',    '中东·和平联盟',  'middle_east_islamic_alliance'),
  ('africa',         '非洲团结联盟',    'african_union'),
  ('latin_america',  '拉美·南美联盟',  'latin_american_south_american_alliance'),
  ('southeast_asia', '东南亚联盟',      'southeast_asia_alliance')
on conflict (id) do update
  set display_id = excluded.display_id;

-- ============================================================
-- Step 2: country_alliance_map.country_code 唯一约束
-- ============================================================
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'uq_country_code'
  ) then
    alter table public.country_alliance_map
      add constraint uq_country_code unique (country_code);
  end if;
end$$;

-- ============================================================
-- Step 3: 重灌 country_alliance_map
-- ============================================================
delete from public.country_alliance_map;

insert into public.country_alliance_map (country_code, country_name, alliance_id)
values
  -- north_west (北美·西方联盟)
  ('US',  'US',                'north_west'),
  ('USA', 'United States',     'north_west'),
  ('CA',  'CA',                'north_west'),
  ('CAN', 'Canada',            'north_west'),
  ('MX',  'MX',                'north_west'),
  ('MEX', 'Mexico',            'north_west'),
  ('GB',  'GB',                'north_west'),
  ('GBR', 'United Kingdom',    'north_west'),
  ('IE',  'IE',                'north_west'),
  ('IRL', 'IRL',               'north_west'),
  ('FR',  'FR',                'north_west'),
  ('FRA', 'France',            'north_west'),
  ('DE',  'DE',                'north_west'),
  ('DEU', 'Germany',           'north_west'),
  ('IT',  'IT',                'north_west'),
  ('ITA', 'Italy',             'north_west'),
  ('ES',  'ES',                'north_west'),
  ('ESP', 'Spain',             'north_west'),
  ('PT',  'PT',                'north_west'),
  ('PRT', 'PRT',               'north_west'),
  ('NL',  'NL',                'north_west'),
  ('NLD', 'NLD',               'north_west'),
  ('BE',  'BE',                'north_west'),
  ('BEL', 'Belgium',           'north_west'),
  ('PL',  'PL',                'north_west'),
  ('POL', 'POL',               'north_west'),
  ('JP',  'JP',                'north_west'),
  ('JPN', 'Japan',             'north_west'),
  ('KR',  'KR',                'north_west'),
  ('KOR', 'South Korea',       'north_west'),
  ('AU',  'AU',                'north_west'),
  ('AUS', 'AUS',               'north_west'),
  ('NZ',  'NZ',                'north_west'),
  ('NZL', 'NZL',               'north_west'),
  ('IL',  'IL',                'north_west'),
  ('ISR', 'ISR',               'north_west'),

  -- china (中华联盟)
  ('CN',  'CN',                'china'),
  ('CHN', 'China',             'china'),
  ('TW',  'TW',                'china'),
  ('TWN', 'Taiwan',            'china'),
  ('HK',  'HK',                'china'),
  ('HKG', 'HKG',               'china'),
  ('MO',  'MO',                'china'),
  ('MAC', 'MAC',               'china'),
  ('MN',  'MN',                'china'),
  ('MNG', 'MNG',               'china'),
  ('KP',  'KP',                'china'),
  ('PRK', 'PRK',               'china'),
  ('PK',  'PK',                'china'),
  ('PAK', 'PAK',               'china'),

  -- russia (俄罗斯联邦)
  ('RU',  'RU',                'russia'),
  ('RUS', 'Russia',            'russia'),
  ('BY',  'BY',                'russia'),
  ('BLR', 'BLR',               'russia'),
  ('KZ',  'KZ',                'russia'),
  ('KAZ', 'KAZ',               'russia'),
  ('KG',  'KG',                'russia'),
  ('KGZ', 'KGZ',               'russia'),
  ('TJ',  'TJ',                'russia'),
  ('TJK', 'TJK',               'russia'),
  ('AM',  'AM',                'russia'),
  ('ARM', 'ARM',               'russia'),
  ('AZ',  'AZ',                'russia'),
  ('AZE', 'AZE',               'russia'),
  ('RS',  'RS',                'russia'),
  ('SRB', 'SRB',               'russia'),
  ('SY',  'SY',                'russia'),
  ('SYR', 'SYR',               'russia'),

  -- middle_east (中东·和平联盟)
  ('SA',  'SA',                'middle_east'),
  ('SAU', 'Saudi Arabia',      'middle_east'),
  ('IR',  'IR',                'middle_east'),
  ('IRN', 'Iran',              'middle_east'),
  ('AE',  'AE',                'middle_east'),
  ('ARE', 'ARE',               'middle_east'),
  ('QA',  'QA',                'middle_east'),
  ('QAT', 'QAT',               'middle_east'),
  ('OM',  'OM',                'middle_east'),
  ('OMN', 'OMN',               'middle_east'),
  ('IQ',  'IQ',                'middle_east'),
  ('IRQ', 'IRQ',               'middle_east'),
  ('TR',  'TR',                'middle_east'),
  ('TUR', 'Turkey',            'middle_east'),
  ('EG',  'EG',                'middle_east'),
  ('EGY', 'Egypt',             'middle_east'),
  ('LY',  'LY',                'middle_east'),
  ('LBY', 'LBY',               'middle_east'),
  ('DZ',  'DZ',                'middle_east'),
  ('DZA', 'Algeria',           'middle_east'),
  ('MA',  'MA',                'middle_east'),
  ('MAR', 'Morocco',           'middle_east'),
  ('TN',  'TN',                'middle_east'),
  ('TUN', 'TUN',               'middle_east'),

  -- africa (非洲团结联盟)
  ('NG',  'NG',                'africa'),
  ('NGA', 'Nigeria',           'africa'),
  ('ZA',  'ZA',                'africa'),
  ('ZAF', 'South Africa',      'africa'),
  ('KE',  'KE',                'africa'),
  ('KEN', 'Kenya',             'africa'),
  ('ET',  'ET',                'africa'),
  ('ETH', 'Ethiopia',          'africa'),

  -- latin_america (拉美·南美联盟)
  ('BR',  'BR',                'latin_america'),
  ('BRA', 'Brazil',            'latin_america'),
  ('AR',  'AR',                'latin_america'),
  ('ARG', 'Argentina',         'latin_america'),
  ('CL',  'CL',                'latin_america'),
  ('CHL', 'CHL',               'latin_america'),
  ('PE',  'PE',                'latin_america'),
  ('PER', 'PER',               'latin_america'),
  ('CO',  'CO',                'latin_america'),
  ('COL', 'COL',               'latin_america'),
  ('VE',  'VE',                'latin_america'),
  ('VEN', 'VEN',               'latin_america'),

  -- southeast_asia (东南亚联盟)
  ('SG',  'SG',                'southeast_asia'),
  ('SGP', 'Singapore',         'southeast_asia'),
  ('ID',  'ID',                'southeast_asia'),
  ('IDN', 'Indonesia',         'southeast_asia'),
  ('VN',  'VN',                'southeast_asia'),
  ('VNM', 'Vietnam',           'southeast_asia'),
  ('TH',  'TH',                'southeast_asia'),
  ('THA', 'Thailand',          'southeast_asia'),
  ('MY',  'MY',                'southeast_asia'),
  ('MYS', 'Malaysia',          'southeast_asia'),
  ('PH',  'PH',                'southeast_asia'),
  ('PHL', 'Philippines',       'southeast_asia'),
  ('KH',  'KH',                'southeast_asia'),
  ('KHM', 'KHM',               'southeast_asia'),
  ('LA',  'LA',                'southeast_asia'),
  ('LAO', 'LAO',               'southeast_asia'),
  ('MM',  'MM',                'southeast_asia'),
  ('MMR', 'MMR',               'southeast_asia'),
  ('BN',  'BN',                'southeast_asia'),
  ('BRN', 'BRN',               'southeast_asia');
