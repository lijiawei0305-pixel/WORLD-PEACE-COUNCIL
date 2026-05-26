import type { TurnEvent } from '../../data/worldPeaceCouncil';
import { riskTone } from '../../lib/i18n';

type EventListProps = {
  events: TurnEvent[];
  compact?: boolean;
};

export default function EventList({ events, compact = false }: EventListProps) {
  return (
    <div className={`wpc-event-list${compact ? ' wpc-event-list--compact' : ''}`}>
      {events.map((event, index) => (
        <div key={event.id} className="wpc-event-row">
          <span className="wpc-event-row__index">{index + 1}</span>
          <span className="wpc-event-row__title">{event.title}</span>
          <span className={`wpc-risk wpc-risk--${riskTone(event.risk)}`}>{event.risk}</span>
        </div>
      ))}
    </div>
  );
}
