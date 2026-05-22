import { councilStages, headerStatus } from '../../data/worldPeaceCouncil';
import type { GameStatus, WorldState } from '../../contracts/game';
import StageStepper from './StageStepper';

type TopBarProps = {
  activeStageIndex: number;
  round: number;
  maxRounds: number;
  date: string;
  gameStatus?: GameStatus;
  isBusy?: boolean;
  onNewGame?: () => void;
  worldState?: WorldState;
};

function getStatusChips(worldState?: WorldState) {
  if (!worldState) {
    return [
      { label: '全球紧张度', value: headerStatus.tension, tone: 'red' },
      { label: '和平协议', value: headerStatus.peace, tone: 'blue' },
      { label: 'AI 风险', value: headerStatus.aiRisk, tone: 'yellow' },
    ];
  }

  return [
    { label: '全球紧张度', value: `${worldState.globalTension} / 100`, tone: 'red' },
    { label: '和平协议', value: `${worldState.peaceAgreement}%`, tone: 'blue' },
    { label: 'AI 风险', value: `${worldState.aiRisk} / 100`, tone: 'yellow' },
  ];
}

const gameStatusLabel: Record<GameStatus, string> = {
  ACTIVE: '在线',
  WON: '胜利',
  FAILED: '失败',
  COLD_PEACE: '冷和平',
  ABANDONED: '已放弃',
};

export default function TopBar({
  activeStageIndex,
  round,
  maxRounds,
  date,
  gameStatus = 'ACTIVE',
  isBusy = false,
  onNewGame,
  worldState,
}: TopBarProps) {
  const statusChips = getStatusChips(worldState);

  return (
    <header className="wpc-top-bar">
      <div className="wpc-brand">
        <div className="wpc-brand__mark" aria-hidden="true">
          <img src="/assets/icons/wpc/world-peace-council.svg" alt="" />
        </div>
        <div className="wpc-brand__copy">
          <h1>世界和平理事会</h1>
          <span>WORLD PEACE COUNCIL</span>
        </div>
      </div>

      <div className="wpc-round-center">
        <div className="wpc-round-meta">
          <strong>
            回合 {round} / {maxRounds}
          </strong>
          <span>{date}</span>
        </div>
        <StageStepper stages={councilStages} activeIndex={activeStageIndex} />
      </div>

      <div className="wpc-status-cluster" aria-label="关键状态">
        {statusChips.map((chip) => (
          <div key={chip.label} className={`wpc-status-chip wpc-status-chip--${chip.tone}`}>
            <span>{chip.label}</span>
            <strong>{chip.value}</strong>
          </div>
        ))}
      </div>

      <div className="wpc-top-actions">
        <button type="button" className="wpc-icon-button" aria-label="帮助" title="帮助">
          ?
        </button>
        <button type="button" className="wpc-icon-button" aria-label="设置" title="设置">
          ⚙
        </button>
        <button type="button" className="wpc-icon-button wpc-icon-button--notify" aria-label="通知" title="通知">
          !
          <i />
        </button>
        <button
          type="button"
          className="wpc-operator"
          aria-label="创建新游戏"
          disabled={isBusy}
          onClick={onNewGame}
          title="创建新游戏"
        >
          <span className="wpc-operator__avatar">序</span>
          <span>
            <strong>首席秩序架构师</strong>
            <small>
              <i /> {isBusy ? '同步中' : gameStatusLabel[gameStatus]}
            </small>
          </span>
        </button>
      </div>
    </header>
  );
}
