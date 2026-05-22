export type FactionId =
  | 'zhonghua_alliance'
  | 'north_american_western_alliance'
  | 'russian_alliance'
  | 'latin_american_south_american_alliance'
  | 'middle_east_islamic_alliance'
  | 'african_union'
  | 'southeast_asia_alliance';

export type FactionDisplayId = FactionId | 'neutral';

export type FactionConfig = {
  id: FactionDisplayId;
  name: string;
  shortName: string;
  color: string;
  fill: string;
  stroke: string;
  glow: string;
};

export const factionConfigs: Record<FactionId, FactionConfig> = {
  zhonghua_alliance: {
    id: 'zhonghua_alliance',
    name: '中华联盟',
    shortName: 'ZHN',
    color: '#21d4ff',
    fill: 'rgba(33, 212, 255, 0.28)',
    stroke: 'rgba(33, 212, 255, 0.82)',
    glow: 'rgba(33, 212, 255, 0.42)',
  },
  north_american_western_alliance: {
    id: 'north_american_western_alliance',
    name: '北美·西方联盟',
    shortName: 'NAW',
    color: '#4aa8ff',
    fill: 'rgba(74, 168, 255, 0.26)',
    stroke: 'rgba(122, 199, 255, 0.82)',
    glow: 'rgba(74, 168, 255, 0.38)',
  },
  russian_alliance: {
    id: 'russian_alliance',
    name: '俄罗斯联邦',
    shortName: 'RUS',
    color: '#ff7a3d',
    fill: 'rgba(255, 122, 61, 0.25)',
    stroke: 'rgba(255, 152, 96, 0.85)',
    glow: 'rgba(255, 122, 61, 0.38)',
  },
  latin_american_south_american_alliance: {
    id: 'latin_american_south_american_alliance',
    name: '拉美·南美联盟',
    shortName: 'LAT',
    color: '#42e27f',
    fill: 'rgba(66, 226, 127, 0.22)',
    stroke: 'rgba(98, 238, 150, 0.78)',
    glow: 'rgba(66, 226, 127, 0.36)',
  },
  middle_east_islamic_alliance: {
    id: 'middle_east_islamic_alliance',
    name: '中东·和平联盟',
    shortName: 'MEP',
    color: '#f7c948',
    fill: 'rgba(247, 201, 72, 0.24)',
    stroke: 'rgba(247, 201, 72, 0.78)',
    glow: 'rgba(247, 201, 72, 0.38)',
  },
  african_union: {
    id: 'african_union',
    name: '非洲团结联盟',
    shortName: 'AFR',
    color: '#ff9f43',
    fill: 'rgba(255, 159, 67, 0.23)',
    stroke: 'rgba(255, 178, 98, 0.78)',
    glow: 'rgba(255, 159, 67, 0.36)',
  },
  southeast_asia_alliance: {
    id: 'southeast_asia_alliance',
    name: '东南亚联盟',
    shortName: 'SEA',
    color: '#28f0c4',
    fill: 'rgba(40, 240, 196, 0.23)',
    stroke: 'rgba(84, 255, 215, 0.8)',
    glow: 'rgba(40, 240, 196, 0.38)',
  },
};

export const neutralFaction: FactionConfig = {
  id: 'neutral',
  name: '理事会观察区',
  shortName: 'OBS',
  color: '#9fb5c1',
  fill: 'rgba(120, 150, 160, 0.10)',
  stroke: 'rgba(130, 160, 180, 0.28)',
  glow: 'rgba(160, 190, 205, 0.18)',
};

export const allFactionConfigs = [...Object.values(factionConfigs), neutralFaction];

export function getFactionConfig(id?: FactionDisplayId): FactionConfig {
  if (!id || id === 'neutral') {
    return neutralFaction;
  }

  return factionConfigs[id];
}
