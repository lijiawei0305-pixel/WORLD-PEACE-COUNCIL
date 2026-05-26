import type { CSSProperties } from 'react';
import type { GameStatus } from '../../contracts/game';
import {
  councilAlliances,
  councilStages,
  type CouncilStageId,
  type AllianceProfile,
  type GlobeSelection,
  type WorldMetric,
  worldMetrics,
} from '../../data/worldPeaceCouncil';
import { localizeAllianceName, localizeGameStatus, localizeStage, useLanguage } from '../../lib/i18n';
import AllianceList from './AllianceList';
import MetricBar from './MetricBar';

type LeftPanelsProps = {
  activeStageIndex: number;
  alliances?: AllianceProfile[];
  briefing?: string;
  eventCount?: number;
  gameStatus?: GameStatus;
  metrics?: WorldMetric[];
  selectedLocation?: GlobeSelection;
};

const stageBrief: Record<CouncilStageId, string> = {
  events: '优先确认高危事件的扩散路径，避免误判在本回合早期累积。',
  overview: '重点比较军演、能源与粮食三条风险线，寻找可交换条件。',
  proposal: '建议同时点名两个以上联盟，形成可被 AI 裁定的多边提案。',
  adjudication: '等待联盟反应汇总，关注有条件同意背后的让步成本。',
  settlement: '复盘未解决事件，并为下一回合预留援助或调查资源。',
};

const stageBriefEn: Record<CouncilStageId, string> = {
  events: 'Confirm the spread path of high-risk events before miscalculation accumulates.',
  overview: 'Compare military, energy, and food risk lines to find negotiable trade-offs.',
  proposal: 'Name at least two alliances so the AI can adjudicate a multilateral plan.',
  adjudication: 'Wait for alliance reactions and watch the cost behind conditional acceptance.',
  settlement: 'Review unresolved events and reserve aid or investigation capacity for the next round.',
};

const gameStatusText: Record<GameStatus, string> = {
  ACTIVE: '秩序仍可维持',
  WON: '和平框架达成',
  FAILED: '世界秩序崩溃',
  COLD_PEACE: '冷和平结局',
  ABANDONED: '已放弃',
};

export default function LeftPanels({
  activeStageIndex,
  alliances = councilAlliances,
  briefing,
  eventCount = 0,
  gameStatus = 'ACTIVE',
  metrics = worldMetrics,
  selectedLocation,
}: LeftPanelsProps) {
  const { language, t } = useLanguage();
  const activeStage = localizeStage(councilStages[activeStageIndex], language);
  const currentBriefing = briefing?.trim() || (language === 'en' ? stageBriefEn[activeStage.id] : stageBrief[activeStage.id]);

  return (
    <aside className="wpc-left hud-column" aria-label={t('objectivePanel')}>
      <section className="wpc-panel">
        <div className="wpc-panel-heading">
          <span>{t('objectivePanel')}</span>
          <strong>OBJECTIVE</strong>
        </div>

        <div className="wpc-objective">
          <div>
            <span>{t('mainObjective')}</span>
            <strong>{t('objectiveText')}</strong>
          </div>
          <div>
            <span>{t('failCondition')}</span>
            <strong>{t('failConditionText')}</strong>
          </div>
        </div>

        <div className="wpc-metric-list">
          {metrics.map((metric) => (
            <MetricBar key={metric.id} metric={metric} />
          ))}
        </div>

        <div className="wpc-state-grid">
          <div>
            <span>{t('crisisCount')}</span>
            <strong>{eventCount}</strong>
          </div>
          <div>
            <span>{t('currentStage')}</span>
            <strong>{activeStage.statusLabel}</strong>
          </div>
          <div>
            <span>{t('gameStatus')}</span>
            <strong>{localizeGameStatus(gameStatus, language, true) || gameStatusText[gameStatus]}</strong>
          </div>
        </div>
      </section>

      <section className="wpc-panel">
        <div className="wpc-panel-heading">
          <span>{t('alliancesOverview')}</span>
          <strong>ALLIANCES</strong>
        </div>
        <AllianceList alliances={alliances} />
      </section>

      <section className="wpc-panel wpc-brief-panel">
        <div className="wpc-panel-heading">
          <span>{t('briefing')}</span>
          <strong>BRIEFING</strong>
        </div>
        <p>{currentBriefing}</p>
        {selectedLocation ? (
          <div className="wpc-selected-brief" style={{ '--selection-color': selectedLocation.allianceColor } as CSSProperties}>
            <span>{selectedLocation.kind === 'city' ? selectedLocation.cityName : selectedLocation.countryName}</span>
            <strong>{localizeAllianceName(selectedLocation.allianceName, language)}</strong>
          </div>
        ) : null}
      </section>
    </aside>
  );
}
