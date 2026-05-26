import { councilStages, headerStatus } from '../../data/worldPeaceCouncil';
import type { GameStatus, WorldState } from '../../contracts/game';
import { localizeGameStatus, localizeStage, useLanguage } from '../../lib/i18n';
import StageStepper from './StageStepper';

type TopBarProps = {
  activeStageIndex: number;
  round: number;
  maxRounds: number;
  date: string;
  gameStatus?: GameStatus;
  isBusy?: boolean;
  onNewGame?: () => void;
  onSignOut?: () => void;
  worldState?: WorldState;
};

function getStatusChips(worldState: WorldState | undefined, language: 'zh' | 'en') {
  if (!worldState) {
    return [
      { label: language === 'en' ? 'Global Tension' : '全球紧张度', value: headerStatus.tension, tone: 'red' },
      { label: language === 'en' ? 'Peace Agreement' : '和平协议', value: headerStatus.peace, tone: 'blue' },
      { label: language === 'en' ? 'AI Risk' : 'AI 风险', value: headerStatus.aiRisk, tone: 'yellow' },
    ];
  }

  return [
    { label: language === 'en' ? 'Global Tension' : '全球紧张度', value: `${worldState.globalTension} / 100`, tone: 'red' },
    { label: language === 'en' ? 'Peace Agreement' : '和平协议', value: `${worldState.peaceAgreement}%`, tone: 'blue' },
    { label: language === 'en' ? 'AI Risk' : 'AI 风险', value: `${worldState.aiRisk} / 100`, tone: 'yellow' },
  ];
}

export default function TopBar({
  activeStageIndex,
  round,
  maxRounds,
  date,
  gameStatus = 'ACTIVE',
  isBusy = false,
  onNewGame,
  onSignOut,
  worldState,
}: TopBarProps) {
  const { language, t } = useLanguage();
  const statusChips = getStatusChips(worldState, language);
  const stages = councilStages.map((stage) => localizeStage(stage, language));

  return (
    <header className="wpc-top-bar">
      <div className="wpc-brand">
        <div className="wpc-brand__mark" aria-hidden="true">
          <img src="/assets/icons/wpc/world-peace-council.svg" alt="" />
        </div>
        <div className="wpc-brand__copy">
          <h1>{t('brand')}</h1>
          <span>WORLD PEACE COUNCIL</span>
        </div>
      </div>

      <div className="wpc-round-center">
        <div className="wpc-round-meta">
          <strong>
            {t('round')} {round} / {maxRounds}
          </strong>
          <span>{date}</span>
        </div>
        <StageStepper stages={stages} activeIndex={activeStageIndex} />
      </div>

      <div className="wpc-status-cluster" aria-label={t('keyStatus')}>
        {statusChips.map((chip) => (
          <div key={chip.label} className={`wpc-status-chip wpc-status-chip--${chip.tone}`}>
            <span>{chip.label}</span>
            <strong>{chip.value}</strong>
          </div>
        ))}
      </div>

      <div className="wpc-top-actions">
        <button type="button" className="wpc-icon-button" aria-label={t('help')} title={t('help')}>
          ?
        </button>
        <button type="button" className="wpc-icon-button" aria-label={t('settings')} title={t('settings')}>
          ⚙
        </button>
        <button type="button" className="wpc-icon-button wpc-icon-button--notify" aria-label={t('notifications')} title={t('notifications')}>
          !
          <i />
        </button>
        {onSignOut ? (
          <button
            type="button"
            className="wpc-icon-button"
            aria-label={t('signOut')}
            title={t('signOut')}
            disabled={isBusy}
            onClick={onSignOut}
          >
            ⎋
          </button>
        ) : null}
        <button
          type="button"
          className="wpc-operator"
          aria-label={t('newGame')}
          disabled={isBusy}
          onClick={onNewGame}
          title={t('newGame')}
        >
          <span className="wpc-operator__avatar">序</span>
          <span>
            <strong>{t('brandRole')}</strong>
            <small>
              <i /> {isBusy ? t('syncing') : localizeGameStatus(gameStatus, language)}
            </small>
          </span>
        </button>
      </div>
    </header>
  );
}
