import type { CSSProperties, ReactElement } from 'react';
import type { AIAdjudication, RoundSettlement } from '../../contracts/game';
import {
  aiReactions,
  allianceProfiles,
  councilStages,
  diplomaticActions,
  focusTopics,
  keyRisks,
  nextTurnWarnings,
  settlementResults,
  turnEvents,
  type AllianceProfile,
  type CouncilStageId,
  type TurnEvent,
} from '../../data/worldPeaceCouncil';
import EventList from './EventList';
import RightPanelSection from './RightPanelSection';

type RightPanelsProps = {
  activeStageIndex: number;
  adjudication?: AIAdjudication | null;
  alliances?: AllianceProfile[];
  events?: TurnEvent[];
  priorityIssue?: string;
  settlement?: RoundSettlement | null;
  submittedProposal?: string;
};

const backendAllianceIdToDisplayId: Record<string, AllianceProfile['id']> = {
  north_west: 'north_american_western_alliance',
  china: 'zhonghua_alliance',
  russia: 'russian_alliance',
  middle_east: 'middle_east_islamic_alliance',
  africa: 'african_union',
  latin_america: 'latin_american_south_american_alliance',
  southeast_asia: 'southeast_asia_alliance',
};

function findAlliance(alliances: AllianceProfile[], value: string): AllianceProfile | undefined {
  const mappedId = backendAllianceIdToDisplayId[value];

  return alliances.find((alliance) => (
    alliance.id === value ||
    alliance.id === mappedId ||
    alliance.name === value ||
    alliance.shortName === value
  ));
}

function TopicChips() {
  return (
    <div className="wpc-topic-chips">
      {focusTopics.map((topic) => (
        <span key={topic}>{topic}</span>
      ))}
    </div>
  );
}

function EventsStage({ events, priorityIssue }: { events: TurnEvent[]; priorityIssue?: string }) {
  return (
    <>
      <RightPanelSection title="本回合事件" code="EVENTS">
        {events.length > 0 ? <EventList events={events} /> : <p className="wpc-right-copy">等待生成本回合随机事件。</p>}
      </RightPanelSection>
      <RightPanelSection title="事件说明" code="PHASE 01">
        <p className="wpc-right-copy">
          {events.length > 0
            ? 'AI 已基于当前全球态势生成本回合随机事件，请审阅事件列表与说明，下一步将进入局势总览阶段。'
            : '点击底部控制台按钮后，后端会调用 AI 生成本回合事件并保存到数据库。'}
        </p>
      </RightPanelSection>
      <RightPanelSection title="可关注议题" code="FOCUS">
        {priorityIssue ? <p className="wpc-right-copy">{priorityIssue}</p> : <TopicChips />}
      </RightPanelSection>
    </>
  );
}

function OverviewStage({ alliances, events }: { alliances: AllianceProfile[]; events: TurnEvent[] }) {
  return (
    <>
      <RightPanelSection title="本回合事件" code="EVENTS">
        {events.length > 0 ? <EventList events={events} compact /> : <p className="wpc-right-copy">尚未读取到本回合事件。</p>}
      </RightPanelSection>
      <RightPanelSection title="关键风险" code="RISKS">
        <ul className="wpc-risk-list">
          {(events.length > 0 ? events.map((event) => `${event.title}：${event.topic}`) : keyRisks).map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      </RightPanelSection>
      <RightPanelSection title="联盟诉求" code="DEMANDS">
        <div className="wpc-demand-list">
          {alliances.map((alliance) => (
            <div key={alliance.id}>
              <span style={{ '--alliance-color': alliance.color } as CSSProperties}>
                <img src={alliance.iconUrl} alt="" />
              </span>
              <strong>{alliance.name}</strong>
              <p>{alliance.demand}</p>
            </div>
          ))}
        </div>
      </RightPanelSection>
    </>
  );
}

function ProposalStage({ events }: { events: TurnEvent[] }) {
  return (
    <>
      <RightPanelSection title="本回合事件" code="SUMMARY">
        {events.length > 0 ? <EventList events={events.slice(0, 3)} compact /> : <p className="wpc-right-copy">请先生成并审阅本回合事件。</p>}
      </RightPanelSection>
      <RightPanelSection title="可用行动方式" code="ACTIONS">
        <div className="wpc-action-grid">
          {diplomaticActions.map((action) => (
            <button key={action} type="button">
              <span>{action.slice(0, 1)}</span>
              {action}
            </button>
          ))}
        </div>
      </RightPanelSection>
    </>
  );
}

function AdjudicationStage({
  adjudication,
  alliances,
  submittedProposal,
}: {
  adjudication?: AIAdjudication | null;
  alliances: AllianceProfile[];
  submittedProposal?: string;
}) {
  const reactionRows = adjudication?.allianceReactions ?? [];

  return (
    <>
      <RightPanelSection title="AI裁定 / 联盟反应" code="AI RULING">
        <div className="wpc-reaction-list">
          {reactionRows.length > 0 ? (
            reactionRows.map((item) => {
              const alliance = findAlliance(alliances, item.allianceId);

              return (
                <div key={`${item.allianceId}-${item.statusLabel}`} className="wpc-reaction-row">
                  <span style={{ '--alliance-color': alliance?.color ?? '#9fb5c1' } as CSSProperties}>
                    {alliance ? <img src={alliance.iconUrl} alt="" /> : null}
                  </span>
                  <div>
                    <strong>{alliance?.name ?? item.allianceId}</strong>
                    <p>{item.reaction}</p>
                  </div>
                  <i>{item.statusLabel}</i>
                </div>
              );
            })
          ) : (
            aiReactions.map((item) => {
              const alliance = allianceProfiles[item.allianceId];

              return (
                <div key={item.allianceId} className="wpc-reaction-row">
                  <span style={{ '--alliance-color': alliance.color } as CSSProperties}>
                    <img src={alliance.iconUrl} alt="" />
                  </span>
                  <div>
                    <strong>{alliance.name}</strong>
                    <p>{item.reaction}</p>
                  </div>
                  <i>{item.status}</i>
                </div>
              );
            })
          )}
        </div>
      </RightPanelSection>
      <RightPanelSection title="AI综合评估" code="ASSESSMENT">
        <p className="wpc-right-copy">
          {adjudication?.aiAssessment.summary ??
            (submittedProposal ? '已基于提交内容完成模拟。' : '尚未检测到正式提案，当前使用默认多边降温方案预估。')}
        </p>
      </RightPanelSection>
    </>
  );
}

function SettlementStage({ settlement }: { settlement?: RoundSettlement | null }) {
  return (
    <>
      <RightPanelSection title="结算明细" code="RESULTS">
        <div className="wpc-settlement-list">
          {settlement
            ? settlement.eventResults.map((item) => (
                <div key={item.eventId}>
                  <span>{item.title}</span>
                  <strong className="wpc-result wpc-result--yellow">{item.resolutionStatus}</strong>
                </div>
              ))
            : settlementResults.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong className={`wpc-result wpc-result--${item.tone}`}>{item.result}</strong>
                </div>
              ))}
        </div>
      </RightPanelSection>
      <RightPanelSection title="下一回合预警" code="WARNING">
        <ul className="wpc-risk-list">
          {(settlement?.nextRoundWarnings.length ? settlement.nextRoundWarnings : nextTurnWarnings).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </RightPanelSection>
      <RightPanelSection title="本回合评价" code="RATING">
        <div className="wpc-rating">
          <strong>{settlement?.rating ?? 'A'}</strong>
          <p>{settlement?.ratingText ?? '积极推动多边对话，局势显著改善。'}</p>
        </div>
      </RightPanelSection>
    </>
  );
}

const stageContent: Record<CouncilStageId, (props: RightPanelsProps) => ReactElement> = {
  events: (props) => <EventsStage events={props.events ?? []} priorityIssue={props.priorityIssue} />,
  overview: (props) => <OverviewStage alliances={props.alliances ?? Object.values(allianceProfiles)} events={props.events ?? []} />,
  proposal: (props) => <ProposalStage events={props.events ?? []} />,
  adjudication: (props) => (
    <AdjudicationStage
      adjudication={props.adjudication}
      alliances={props.alliances ?? Object.values(allianceProfiles)}
      submittedProposal={props.submittedProposal}
    />
  ),
  settlement: (props) => <SettlementStage settlement={props.settlement} />,
};

export default function RightPanels(props: RightPanelsProps) {
  const activeStage = councilStages[props.activeStageIndex];
  const renderStage = stageContent[activeStage.id];

  return (
    <aside className="wpc-right hud-column" aria-label="动态阶段信息栏">
      <div className="wpc-right-stage">
        <span>当前阶段</span>
        <strong>{activeStage.label}</strong>
      </div>
      {renderStage(props)}
    </aside>
  );
}
