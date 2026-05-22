import type { CSSProperties } from 'react';
import type { AllianceProfile } from '../../data/worldPeaceCouncil';

type AllianceListProps = {
  alliances: AllianceProfile[];
};

export default function AllianceList({ alliances }: AllianceListProps) {
  return (
    <div className="wpc-alliance-table" role="table" aria-label="七大联盟立场">
      <div className="wpc-alliance-table__head" role="row">
        <span role="columnheader">联盟</span>
        <span role="columnheader">立场</span>
        <span role="columnheader">满意度</span>
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
