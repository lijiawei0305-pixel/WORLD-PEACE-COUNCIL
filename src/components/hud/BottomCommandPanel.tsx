import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import type { GameStatus, MetricChanges } from '../../contracts/game';
import {
  councilAlliances,
  councilStages,
  type AllianceProfile,
} from '../../data/worldPeaceCouncil';

type ImpactTone = 'green' | 'neutral' | 'red';
type MetricChangeKey = keyof Pick<MetricChanges, 'aiRisk' | 'economicPressure' | 'globalTension' | 'worldStability'>;

type BottomCommandPanelProps = {
  activeStageIndex: number;
  errorMessage?: string;
  gameStatus?: GameStatus;
  hasEvents?: boolean;
  hasGame?: boolean;
  isBusy?: boolean;
  metricChanges?: MetricChanges | null;
  statusMessage?: string;
  submittedProposal: string;
  onAdvanceStage: () => void | Promise<void>;
  onSubmitProposal: (proposal: string) => void | Promise<void>;
};

type MentionState = {
  open: boolean;
  atIndex: number;
  query: string;
};

const roundMetricChangeItems: Array<{
  key: MetricChangeKey;
  label: string;
  lowerIsBetter: boolean;
}> = [
  { key: 'globalTension', label: '全球紧张度', lowerIsBetter: true },
  { key: 'worldStability', label: '世界稳定度', lowerIsBetter: false },
  { key: 'aiRisk', label: 'AI 风险', lowerIsBetter: true },
  { key: 'economicPressure', label: '经济压力', lowerIsBetter: true },
];

const baseStageGuidance = {
  events: '本阶段：AI 生成随机事件，玩家暂不可提交提案。',
  overview: '请先完成局势研判，再进入外交提案阶段。',
  proposal: '输入外交提案，可使用 @ 快速点名七大联盟。',
  adjudication: '提案已提交，等待 AI 裁定与联盟反应。',
  settlement: '回合结算已完成，所有提案已处理，等待下一回合开始。',
};

const stageButtonLabel = {
  events: '生成本回合事件',
  overview: '下一步：外交提案',
  proposal: '提交提案',
  adjudication: '进入回合结算',
  settlement: '开始下一回合',
};

function getStageGuidance(stageId: keyof typeof baseStageGuidance, hasGame: boolean, hasEvents: boolean): string {
  if (!hasGame) {
    return '正在连接后端，必要时会创建一局新的游戏。';
  }

  if (stageId === 'events' && hasEvents) {
    return '本回合事件已生成，可进入局势总览。';
  }

  return baseStageGuidance[stageId];
}

function getStageButtonLabel({
  gameStatus,
  hasEvents,
  hasGame,
  stageId,
}: {
  gameStatus: GameStatus;
  hasEvents: boolean;
  hasGame: boolean;
  stageId: keyof typeof stageButtonLabel;
}): string {
  if (!hasGame) {
    return '连接 / 创建游戏';
  }

  if (gameStatus !== 'ACTIVE' && stageId === 'settlement') {
    return '游戏已结束';
  }

  if (stageId === 'events') {
    return hasEvents ? '下一步：局势总览' : stageButtonLabel.events;
  }

  return stageButtonLabel[stageId];
}

function formatMetricDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function getMetricDeltaTone(value: number, lowerIsBetter: boolean): ImpactTone {
  if (value === 0) {
    return 'neutral';
  }

  const isImprovement = lowerIsBetter ? value < 0 : value > 0;
  return isImprovement ? 'green' : 'red';
}

function getMentionState(value: string): MentionState {
  const atIndex = value.lastIndexOf('@');

  if (atIndex < 0) {
    return { open: false, atIndex: -1, query: '' };
  }

  const query = value.slice(atIndex + 1);

  if (/\s/.test(query)) {
    return { open: false, atIndex: -1, query: '' };
  }

  return { open: true, atIndex, query };
}

function AllianceOption({
  alliance,
  index,
  selected,
  onSelect,
  onHover,
}: {
  alliance: AllianceProfile;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className="wpc-mention-option"
      onMouseEnter={onHover}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      <span className="wpc-mention-option__icon" style={{ '--alliance-color': alliance.color } as CSSProperties}>
        <img src={alliance.iconUrl} alt="" />
      </span>
      <span className="wpc-mention-option__copy">
        <strong>{alliance.name}</strong>
        <small>
          {alliance.shortName} / {alliance.stance}
        </small>
      </span>
      <em>{String(index + 1).padStart(2, '0')}</em>
    </button>
  );
}

export default function BottomCommandPanel({
  activeStageIndex,
  errorMessage = '',
  gameStatus = 'ACTIVE',
  hasEvents = false,
  hasGame = false,
  isBusy = false,
  metricChanges,
  statusMessage = '',
  submittedProposal,
  onAdvanceStage,
  onSubmitProposal,
}: BottomCommandPanelProps) {
  const activeStage = councilStages[activeStageIndex];
  const isProposalStage = activeStage.id === 'proposal';
  const terminalGame = gameStatus !== 'ACTIVE';
  const stageActionLabel = getStageButtonLabel({
    gameStatus,
    hasEvents,
    hasGame,
    stageId: activeStage.id as keyof typeof stageButtonLabel,
  });
  const stageGuidance = getStageGuidance(activeStage.id, hasGame, hasEvents);
  const [draft, setDraft] = useState('');
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [showEstimate, setShowEstimate] = useState(false);
  const metricDeltaItems = useMemo(() => (
    roundMetricChangeItems.map((item) => {
      const value = metricChanges?.[item.key] ?? 0;

      return {
        label: item.label,
        tone: getMetricDeltaTone(value, item.lowerIsBetter),
        value: formatMetricDelta(value),
      };
    })
  ), [metricChanges]);

  const mentionState = useMemo(() => getMentionState(draft), [draft]);
  const filteredAlliances = useMemo(() => {
    if (!mentionState.open) {
      return [];
    }

    const query = mentionState.query.trim().toLowerCase();

    if (!query) {
      return councilAlliances;
    }

    return councilAlliances.filter((alliance) => alliance.name.toLowerCase().includes(query));
  }, [mentionState.open, mentionState.query]);

  const showMentionMenu = isProposalStage && mentionState.open;

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [mentionState.query, activeStage.id]);

  useEffect(() => {
    if (activeStage.id === 'events') {
      setDraft('');
      setShowEstimate(false);
    }
  }, [activeStage.id]);

  const selectAlliance = (alliance: AllianceProfile) => {
    setDraft((current) => {
      const state = getMentionState(current);

      if (!state.open) {
        return `${current}@${alliance.name} `;
      }

      const suffixStart = state.atIndex + state.query.length + 1;
      return `${current.slice(0, state.atIndex)}@${alliance.name} ${current.slice(suffixStart)}`;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentionMenu || filteredAlliances.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveMentionIndex((current) => (current + 1) % filteredAlliances.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveMentionIndex((current) => (current - 1 + filteredAlliances.length) % filteredAlliances.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      selectAlliance(filteredAlliances[activeMentionIndex]);
    }
  };

  const handleSubmit = () => {
    const proposal = draft.trim();

    if (!proposal || isBusy) {
      return;
    }

    setShowEstimate(true);
    void onSubmitProposal(proposal);
  };

  const displayedValue =
    activeStage.id === 'adjudication'
      ? submittedProposal || '未提交正式提案，系统将使用保守降温方案。'
      : activeStage.id === 'settlement'
        ? '本回合已结算'
        : draft;

  return (
    <section className={`wpc-bottom-console wpc-bottom-console--${activeStage.id}`} aria-label="外交提案控制台">
      {showMentionMenu ? (
        <div className="wpc-mention-menu" role="listbox" aria-label="@ 联盟自动补全">
          <div className="wpc-mention-menu__title">
            <span>选择联盟</span>
            <strong>{filteredAlliances.length || councilAlliances.length} / 7</strong>
          </div>
          <div className="wpc-mention-menu__list">
            {filteredAlliances.length > 0 ? (
              filteredAlliances.map((alliance, index) => (
                <AllianceOption
                  key={alliance.id}
                  alliance={alliance}
                  index={index}
                  selected={index === activeMentionIndex}
                  onHover={() => setActiveMentionIndex(index)}
                  onSelect={() => selectAlliance(alliance)}
                />
              ))
            ) : (
              <div className="wpc-mention-empty">未匹配到联盟，删除 @ 后面的文字可查看完整列表。</div>
            )}
          </div>
          <div className="wpc-mention-menu__hint">
            <span>↑↓ 选择</span>
            <span>Enter 确认</span>
            <span>点击插入</span>
          </div>
        </div>
      ) : null}

      <div className="wpc-console-heading">
        <div>
          <span>外交提案控制台</span>
          <strong>DIPLOMATIC PROPOSAL CONSOLE</strong>
        </div>
        <small>{stageGuidance}</small>
      </div>

      <div className="wpc-console-body">
        <textarea
          value={displayedValue}
          disabled={!isProposalStage || isBusy || terminalGame || !hasGame}
          placeholder={
            isProposalStage
              ? '输入外交提案，例如：@北美·西方联盟 @俄罗斯联邦 建立军事热线，并由 @中东·和平联盟 主持能源安全会谈'
              : stageGuidance
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="wpc-console-actions">
          {isProposalStage ? (
            <>
              <button
                type="button"
                className="wpc-console-button wpc-console-button--ghost"
                disabled={!draft.trim() || isBusy || terminalGame || !hasGame}
                onClick={() => setShowEstimate(true)}
              >
                预估反应
              </button>
              <button
                type="button"
                className="wpc-console-button wpc-console-button--primary"
                disabled={!draft.trim() || isBusy || terminalGame || !hasGame}
                onClick={handleSubmit}
              >
                {isBusy ? '提交中...' : '提交提案'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="wpc-console-button wpc-console-button--primary"
              disabled={isBusy || (terminalGame && activeStage.id === 'settlement')}
              onClick={() => void onAdvanceStage()}
            >
              {isBusy ? '同步中...' : stageActionLabel}
            </button>
          )}
        </div>
      </div>

      <div className="wpc-console-footer">
        <div className="wpc-console-footer__left">
          {errorMessage || statusMessage ? (
            <div className={`wpc-console-message${errorMessage ? ' wpc-console-message--error' : ''}`}>
              {errorMessage || statusMessage}
            </div>
          ) : null}
          <div className={`wpc-impact-grid${showEstimate || !isProposalStage ? ' wpc-impact-grid--visible' : ''}`}>
            {metricDeltaItems.map((impact) => (
              <span key={impact.label} className={`wpc-impact wpc-impact--${impact.tone}`}>
                <small>{impact.label}</small>
                <strong>{impact.value}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="wpc-proposal-count">
          本回合提案次数：<strong>{submittedProposal ? 1 : 0} / 1</strong>
        </div>
      </div>
    </section>
  );
}
