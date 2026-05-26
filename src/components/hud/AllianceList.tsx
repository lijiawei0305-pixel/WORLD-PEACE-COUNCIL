import type { CSSProperties } from 'react';
import type { AllianceProfile } from '../../data/worldPeaceCouncil';
import { useLanguage } from '../../lib/i18n';

type AllianceListProps = {
  alliances: AllianceProfile[];
};

export default function AllianceList({ alliances }: AllianceListProps) {
  const { t } = useLanguage();
  return (
    <div className="wpc-alliance-table" role="table" aria-label={t('alliancesOverview')}>
      <div className="wpc-alliance-table__head" role="row">
        <span role="columnheader">{t('alliance')}</span>
        <span role="columnheader">{t('stance')}</span>
        <span role="columnheader">{t('satisfaction')}</span>
      </div>
      {alliances.map((alliance) => (
        <div key={alliance.id} className="wpc-alliance-row" role="row">
          <span className="wpc-alliance-row__name" role="cell">
            <i style={{ '--alliance-color': alliance.color } as CSSProperties}>
              <img src={alliance.iconUrl} alt="" />
            </i>
            <strong>{alliance.name}</strong>
          </span>
          <span className={`wpc-stance wpc-stance--${alliance.stanceTone}`} role="cell">
            {alliance.stance}
          </span>
          <span className="wpc-satisfaction" role="cell">
            <b>{alliance.satisfaction}</b>
            <i style={{ width: `${alliance.satisfaction}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
