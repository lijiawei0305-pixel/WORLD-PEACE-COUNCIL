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
  type AllianceProfile,
  type CouncilStageId,
  type TurnEvent,
} from '../../data/worldPeaceCouncil';
import {
  localizeAlliances,
  localizeResolution,
  localizeStage,
  localizeText,
  useLanguage,
} from '../../lib/i18n';
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
  /**
   * 用户在外交提案阶段点击右栏"可用行动方式"中某个动作时触发。
   * 由 App 桥接到 BottomCommandPanel 的 textarea，追加该动作词。
   */
  onInsertAction?: (text: string) => void;
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

function TopicChips({ language }: { language: 'zh' | 'en' }) {
  return (
    <div className="wpc-topic-chips">
      {focusTopics.map((topic) => (
        <span key={topic}>{localizeText(topic, language)}</span>
      ))}
    </div>
  );
}

function EventsStage({ events, priorityIssue }: { events: TurnEvent[]; priorityIssue?: string }) {
  const { language, t } = useLanguage();
  return (
    <>
      <RightPanelSection title={t('eventsThisRound')} code="EVENTS">
        {events.length > 0 ? <EventList events={events} /> : <p className="wpc-right-copy">{t('waitingEvents')}</p>}
      </RightPanelSection>
      <RightPanelSection title={t('eventInfo')} code="PHASE 01">
        <p className="wpc-right-copy">
          {events.length > 0 ? t('eventInfoReady') : t('eventInfoEmpty')}
        </p>
      </RightPanelSection>
      <RightPanelSection title={t('focusTopics')} code="FOCUS">
        {priorityIssue ? <p className="wpc-right-copy">{priorityIssue}</p> : <TopicChips language={language} />}
      </RightPanelSection>
    </>
  );
}

function OverviewStage({ alliances, events }: { alliances: AllianceProfile[]; events: TurnEvent[] }) {
  const { language, t } = useLanguage();
  return (
    <>
      <RightPanelSection title={t('eventsThisRound')} code="EVENTS">
        {events.length > 0 ? <EventList events={events} compact /> : <p className="wpc-right-copy">{t('noEventsRead')}</p>}
      </RightPanelSection>
      <RightPanelSection title={t('keyRisks')} code="RISKS">
        <ul className="wpc-risk-list">
          {(events.length > 0 ? events.map((event) => `${event.title}: ${event.topic}`) : keyRisks.map((risk) => localizeText(risk, language))).map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      </RightPanelSection>
      <RightPanelSection title={t('allianceDemands')} code="DEMANDS">
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

function ProposalStage({
  events,
  onInsertAction,
}: {
  events: TurnEvent[];
  onInsertAction?: (text: string) => void;
}) {
  const { language, t } = useLanguage();
  return (
    <>
      <RightPanelSection title={t('eventsThisRound')} code="SUMMARY">
        {events.length > 0 ? <EventList events={events.slice(0, 3)} compact /> : <p className="wpc-right-copy">{t('eventSummaryPrompt')}</p>}
      </RightPanelSection>
      <RightPanelSection title={t('actions')} code="ACTIONS">
        <div className="wpc-action-grid">
          {diplomaticActions.map((rawAction) => {
            const action = localizeText(rawAction, language);
            return (
              <button
                key={rawAction}
                type="button"
                onClick={() => onInsertAction?.(action)}
                title={onInsertAction ? t('appendAction', { action }) : undefined}
              >
                <span>{action.slice(0, 1)}</span>
                {action}
              </button>
            );
          })}
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
  const { language, t } = useLanguage();
  const reactionRows = adjudication?.allianceReactions ?? [];

  return (
    <>
      <RightPanelSection title={t('aiRuling')} code="AI RULING">
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
                  <i>{localizeText(item.statusLabel, language)}</i>
                </div>
              );
            })
          ) : (
            aiReactions.map((item) => {
              const alliance = localizeAlliances([allianceProfiles[item.allianceId]], language)[0];

              return (
                <div key={item.allianceId} className="wpc-reaction-row">
                  <span style={{ '--alliance-color': alliance.color } as CSSProperties}>
                    <img src={alliance.iconUrl} alt="" />
                  </span>
                  <div>
                    <strong>{alliance.name}</strong>
                    <p>{localizeText(item.reaction, language)}</p>
                  </div>
                  <i>{localizeText(item.status, language)}</i>
                </div>
              );
            })
          )}
        </div>
      </RightPanelSection>
      <RightPanelSection title={t('aiAssessment')} code="ASSESSMENT">
        <p className="wpc-right-copy">
          {adjudication?.aiAssessment.summary ??
            (submittedProposal ? t('assessmentDone') : t('assessmentEmpty'))}
        </p>
      </RightPanelSection>
    </>
  );
}

function SettlementStage({ settlement }: { settlement?: RoundSettlement | null }) {
  const { language, t } = useLanguage();
  return (
    <>
      <RightPanelSection title={t('settlementDetails')} code="RESULTS">
        <div className="wpc-settlement-list">
          {settlement
            ? settlement.eventResults.map((item) => (
                <div key={item.eventId}>
                  <span>{item.title}</span>
                  <strong className="wpc-result wpc-result--yellow">{localizeResolution(item.resolutionStatus, language)}</strong>
                </div>
              ))
            : settlementResults.map((item) => (
                <div key={item.label}>
                  <span>{localizeText(item.label, language)}</span>
                  <strong className={`wpc-result wpc-result--${item.tone}`}>{localizeText(item.result, language)}</strong>
                </div>
              ))}
        </div>
      </RightPanelSection>
      <RightPanelSection title={t('nextRoundWarning')} code="WARNING">
        <ul className="wpc-risk-list">
          {(settlement?.nextRoundWarnings.length ? settlement.nextRoundWarnings : nextTurnWarnings).map((warning) => (
            <li key={warning}>{localizeText(warning, language)}</li>
          ))}
        </ul>
      </RightPanelSection>
      <RightPanelSection title={t('roundRating')} code="RATING">
        <div className="wpc-rating">
          <strong>{settlement?.rating ?? 'A'}</strong>
          <p>{settlement?.ratingText ?? t('fallbackRating')}</p>
        </div>
      </RightPanelSection>
    </>
  );
}

const stageContent: Record<CouncilStageId, (props: RightPanelsProps) => ReactElement> = {
  events: (props) => <EventsStage events={props.events ?? []} priorityIssue={props.priorityIssue} />,
  overview: (props) => <OverviewStage alliances={props.alliances ?? Object.values(allianceProfiles)} events={props.events ?? []} />,
  proposal: (props) => <ProposalStage events={props.events ?? []} onInsertAction={props.onInsertAction} />,
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
  const { language, t } = useLanguage();
  const activeStage = localizeStage(councilStages[props.activeStageIndex], language);
  const renderStage = stageContent[activeStage.id];

  return (
    <aside className="wpc-right hud-column" aria-label={t('currentStage')}>
      <div className="wpc-right-stage">
        <span>{t('currentStage')}</span>
        <strong>{activeStage.label}</strong>
      </div>
      {renderStage(props)}
    </aside>
  );
}
