import type { FactionId } from './factions';

export type Capital = {
  id: string;
  country: string;
  isoA3: string;
  name: string;
  lat: number;
  lng: number;
  faction: FactionId;
  importance: 'major' | 'regional' | 'normal';
  status?: 'stable' | 'rising' | 'falling' | 'critical';
};

export const capitals: Capital[] = [
  {
    id: 'beijing',
    country: 'China',
    isoA3: 'CHN',
    name: 'Beijing',
    lat: 39.9042,
    lng: 116.4074,
    faction: 'zhonghua_alliance',
    importance: 'major',
    status: 'rising',
  },
  {
    id: 'washington',
    country: 'United States',
    isoA3: 'USA',
    name: 'Washington',
    lat: 38.9072,
    lng: -77.0369,
    faction: 'north_american_western_alliance',
    importance: 'major',
    status: 'stable',
  },
  {
    id: 'moscow',
    country: 'Russia',
    isoA3: 'RUS',
    name: 'Moscow',
    lat: 55.7558,
    lng: 37.6173,
    faction: 'russian_alliance',
    importance: 'major',
    status: 'critical',
  },
  {
    id: 'singapore',
    country: 'Singapore',
    isoA3: 'SGP',
    name: 'Singapore',
    lat: 1.3521,
    lng: 103.8198,
    faction: 'southeast_asia_alliance',
    importance: 'major',
    status: 'stable',
  },
  {
    id: 'brasilia',
    country: 'Brazil',
    isoA3: 'BRA',
    name: 'Brasilia',
    lat: -15.7939,
    lng: -47.8828,
    faction: 'latin_american_south_american_alliance',
    importance: 'major',
    status: 'stable',
  },
  {
    id: 'riyadh',
    country: 'Saudi Arabia',
    isoA3: 'SAU',
    name: 'Riyadh',
    lat: 24.7136,
    lng: 46.6753,
    faction: 'middle_east_islamic_alliance',
    importance: 'major',
    status: 'rising',
  },
  {
    id: 'lagos',
    country: 'Nigeria',
    isoA3: 'NGA',
    name: 'Lagos',
    lat: 6.5244,
    lng: 3.3792,
    faction: 'african_union',
    importance: 'major',
    status: 'rising',
  },
];

export const capitalById = Object.fromEntries(capitals.map((capital) => [capital.id, capital])) as Record<
  string,
  Capital
>;
