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
  const activeStage = councilStages[activeStageIndex];
  const currentBriefing = briefing?.trim() || stageBrief[activeStage.id];

  return (
    <aside className="wpc-left hud-column" aria-label="世界状态与联盟概览">
      <section className="wpc-panel">
        <div className="wpc-panel-heading">
          <span>游戏目标 / 世界状态</span>
          <strong>OBJECTIVE</strong>
        </div>

        <div className="wpc-objective">
          <div>
            <span>主要目标</span>
            <strong>在 20 回合内避免世界大战</strong>
          </div>
          <div>
            <span>失败条件</span>
            <strong>全球紧张度 &gt;= 100</strong>
          </div>
        </div>

        <div className="wpc-metric-list">
          {metrics.map((metric) => (
            <MetricBar key={metric.id} metric={metric} />
          ))}
        </div>

        <div className="wpc-state-grid">
          <div>
            <span>本回合危机数</span>
            <strong>{eventCount}</strong>
          </div>
          <div>
            <span>当前阶段</span>
            <strong>{activeStage.statusLabel}</strong>
          </div>
          <div>
            <span>游戏状态</span>
            <strong>{gameStatusText[gameStatus]}</strong>
          </div>
        </div>
      </section>

      <section className="wpc-panel">
        <div className="wpc-panel-heading">
          <span>七大联盟概览</span>
          <strong>ALLIANCES</strong>
        </div>
        <AllianceList alliances={alliances} />
      </section>

      <section className="wpc-panel wpc-brief-panel">
        <div className="wpc-panel-heading">
          <span>本回合简报</span>
          <strong>BRIEFING</strong>
        </div>
        <p>{currentBriefing}</p>
        {selectedLocation ? (
          <div className="wpc-selected-brief" style={{ '--selection-color': selectedLocation.allianceColor } as CSSProperties}>
            <span>{selectedLocation.kind === 'city' ? selectedLocation.cityName : selectedLocation.countryName}</span>
            <strong>{selectedLocation.allianceName}</strong>
          </div>
        ) : null}
      </section>
    </aside>
  );
}
