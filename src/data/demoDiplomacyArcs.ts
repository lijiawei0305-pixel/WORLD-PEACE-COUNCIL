import { capitalById } from './capitals';

export type DiplomacyArcType = 'alliance' | 'trade' | 'rivalry' | 'sanction' | 'military' | 'intel';
export type DiplomacyArcStatus = 'stable' | 'rising' | 'falling' | 'critical';

export type DiplomacyArc = {
  id: string;
  from: string;
  to: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  type: DiplomacyArcType;
  strength: number;
  status: DiplomacyArcStatus;
  visualRole?: 'base' | 'pulse';
};

function relation(
  fromId: string,
  toId: string,
  type: DiplomacyArcType,
  strength: number,
  status: DiplomacyArcStatus = 'stable',
): DiplomacyArc {
  const start = capitalById[fromId];
  const end = capitalById[toId];

  return {
    id: `${fromId}-${toId}-${type}`,
    from: start.name,
    to: end.name,
    startLat: start.lat,
    startLng: start.lng,
    endLat: end.lat,
    endLng: end.lng,
    type,
    strength,
    status,
  };
}

export const demoDiplomacyArcs: DiplomacyArc[] = [
  relation('beijing', 'moscow', 'trade', 78, 'rising'),
  relation('moscow', 'beijing', 'military', 74, 'critical'),
  relation('beijing', 'washington', 'rivalry', 88, 'rising'),
  relation('washington', 'beijing', 'sanction', 82, 'rising'),
  relation('beijing', 'singapore', 'trade', 76, 'rising'),
  relation('beijing', 'riyadh', 'trade', 70, 'stable'),
  relation('beijing', 'lagos', 'trade', 62, 'rising'),

  relation('washington', 'moscow', 'sanction', 91, 'critical'),
  relation('washington', 'singapore', 'alliance', 66, 'rising'),
  relation('washington', 'brasilia', 'trade', 64, 'stable'),
  relation('washington', 'riyadh', 'trade', 68, 'stable'),
  relation('washington', 'lagos', 'intel', 58, 'stable'),

  relation('moscow', 'riyadh', 'military', 70, 'critical'),
  relation('moscow', 'singapore', 'trade', 61, 'stable'),
  relation('singapore', 'riyadh', 'trade', 72, 'stable'),
  relation('singapore', 'lagos', 'trade', 56, 'rising'),
  relation('riyadh', 'lagos', 'trade', 67, 'rising'),
  relation('lagos', 'brasilia', 'trade', 52, 'stable'),
  relation('brasilia', 'washington', 'trade', 59, 'stable'),
  relation('brasilia', 'beijing', 'trade', 57, 'rising'),
];
