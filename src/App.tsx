import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGate from './components/auth/AuthGate';
import DiplomacyGlobe from './components/globe/DiplomacyGlobe';
import GameOverModal, { type GameOverStatus } from './components/GameOverModal';
import BottomCommandPanel from './components/hud/BottomCommandPanel';
import LeftPanels from './components/hud/LeftPanels';
import RightPanels from './components/hud/RightPanels';
import TopBar from './components/hud/TopBar';
import { useGameSession } from './hooks/useGameSession';
import {
  mapAllianceStatesToProfiles,
  mapRoundEventsToTurnEvents,
  mapWorldStateToMetrics,
  stageIndexByRoundStage,
} from './lib/snapshotMappers';
import type { GameSnapshot, GameStatus } from './contracts/game';
import type { GlobeSelection } from './data/worldPeaceCouncil';
import { formatRoundDate, localizeText, useLanguage } from './lib/i18n';
import './styles/app.css';
import './styles/globe.css';
import './styles/hud.css';
import './styles/wpc.css';
import './styles/auth.css';

/**
 * 把后端 game.status 映射到 GameOverModal 的 props 枚举：
 *   WON       → WON
 *   FAILED    → LOST
 *   COLD_PEACE / ABANDONED → STALEMATE
 *   ACTIVE    → null（不展示 modal）
 */
function toGameOverStatus(status: GameStatus | undefined): GameOverStatus | null {
  if (!status || status === 'ACTIVE') return null;
  if (status === 'WON') return 'WON';
  if (status === 'FAILED') return 'LOST';
  return 'STALEMATE';
}

/** 失败时尽量给出具体原因。当前规则下 FAILED 唯一触发条件是 globalTension >= 100。 */
function buildLostSubtitle(snapshot: GameSnapshot | null, lostText: string): string | undefined {
  if (!snapshot) return undefined;
  if (snapshot.worldState.globalTension >= 100) {
    return lostText;
  }
  return undefined;
}


export default function App() {
  const { language, t } = useLanguage();
  const { snapshot, roundMeta, lastMetricChanges, isBusy, statusMessage, errorMessage, needsLogin, actions } =
    useGameSession();
  const [selectedLocation, setSelectedLocation] = useState<GlobeSelection>();
  /**
   * 右栏"可用行动方式"按钮 → 底部 textarea 的桥接 state。
   * nonce 单调递增，每次点击都触发 BottomCommandPanel 的插入 effect，
   * 即使连续点同一动作也不被 React 状态相等性优化跳过。
   */
  const [pendingActionInsert, setPendingActionInsert] = useState<{ text: string; nonce: number } | null>(null);
  const handleInsertAction = useCallback((text: string) => {
    setPendingActionInsert((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  // 推进到新回合时，snapshot 切换会让 selectedLocation 失去语义，自动清空一次
  useEffect(() => {
    if (!snapshot) {
      setSelectedLocation(undefined);
    }
  }, [snapshot?.game.id, snapshot?.currentRound, snapshot]);

  const handleLocationSelect = useCallback((selection: GlobeSelection) => {
    setSelectedLocation(selection);
  }, []);

  const round = snapshot?.game.currentRound ?? 1;
  const maxRounds = snapshot?.game.maxRounds ?? 20;
  const activeStageIndex = snapshot ? stageIndexByRoundStage[snapshot.game.stage] : 0;
  const submittedProposal = snapshot?.proposal?.proposalText ?? '';
  const currentRoundMeta = roundMeta?.roundNumber === round ? roundMeta : null;
  const metrics = useMemo(() => mapWorldStateToMetrics(snapshot?.worldState, language), [snapshot?.worldState, language]);
  const alliances = useMemo(() => mapAllianceStatesToProfiles(snapshot?.alliances, language), [snapshot?.alliances, language]);
  const events = useMemo(() => mapRoundEventsToTurnEvents(snapshot?.events, language), [snapshot?.events, language]);
  // 收集本回合事件涉及的国家 ISO A3 集合，传给地球渲染层做高亮发光。
  // 结算阶段（事件已 RESOLVED/PARTIALLY_RESOLVED/WORSENED）后仍保留亮起，让玩家在结算视图里能回看事件位置。
  const highlightedCountries = useMemo(() => {
    if (!snapshot?.events?.length) return [];
    const set = new Set<string>();
    for (const event of snapshot.events) {
      for (const iso of event.involvedCountries ?? []) {
        const normalized = iso.trim().toUpperCase();
        if (normalized) set.add(normalized);
      }
    }
    return Array.from(set);
  }, [snapshot?.events]);
  const displayedMetricChanges = snapshot?.settlement?.metricChanges ?? lastMetricChanges;
  const gameOverStatus = toGameOverStatus(snapshot?.game.status);

  if (needsLogin) {
    return <AuthGate onAuthenticated={actions.onLoginSuccess} />;
  }

  return (
    <main className="game-shell">
      <div className="space-bg" />
      <DiplomacyGlobe
        selectedCountry={selectedLocation?.isoA3 ?? ''}
        selectedLocation={selectedLocation}
        highlightedCountries={highlightedCountries}
        onLocationSelect={handleLocationSelect}
      />

      <section className="hud-layer" aria-label="Game interface">
        <TopBar
          activeStageIndex={activeStageIndex}
          round={round}
          maxRounds={maxRounds}
          date={formatRoundDate(round, language)}
          gameStatus={snapshot?.game.status}
          isBusy={isBusy}
          onNewGame={actions.startNewGame}
          onSignOut={actions.signOut}
          worldState={snapshot?.worldState}
        />
        <LeftPanels
          activeStageIndex={activeStageIndex}
          alliances={alliances}
          briefing={localizeText(currentRoundMeta?.briefing, language)}
          eventCount={snapshot?.events.length ?? 0}
          gameStatus={snapshot?.game.status}
          metrics={metrics}
          selectedLocation={selectedLocation}
        />
        <RightPanels
          activeStageIndex={activeStageIndex}
          adjudication={snapshot?.adjudication}
          alliances={alliances}
          events={events}
          priorityIssue={localizeText(currentRoundMeta?.priorityIssue, language)}
          settlement={snapshot?.settlement}
          submittedProposal={submittedProposal}
          onInsertAction={handleInsertAction}
        />
        <BottomCommandPanel
          activeStageIndex={activeStageIndex}
          errorMessage={errorMessage}
          gameStatus={snapshot?.game.status}
          hasEvents={(snapshot?.events.length ?? 0) > 0}
          hasGame={Boolean(snapshot)}
          isBusy={isBusy}
          metricChanges={displayedMetricChanges}
          statusMessage={statusMessage}
          submittedProposal={submittedProposal}
          pendingActionInsert={pendingActionInsert}
          onAdvanceStage={actions.advance}
          onSubmitProposal={actions.submitProposal}
        />
      </section>

      {gameOverStatus && snapshot ? (
        <GameOverModal
          status={gameOverStatus}
          finalRound={snapshot.game.currentRound}
          peaceScore={snapshot.worldState.peaceAgreement}
          onNewGame={actions.startNewGame}
          subtitleOverride={gameOverStatus === 'LOST' ? buildLostSubtitle(snapshot, t('lostSubtitle')) : undefined}
        />
      ) : null}
    </main>
  );
}
