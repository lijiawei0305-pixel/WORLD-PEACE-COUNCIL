import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import DiplomacyGlobe from './components/globe/DiplomacyGlobe';
import GameOverModal, { type GameOverStatus } from './components/GameOverModal';
import BottomCommandPanel from './components/hud/BottomCommandPanel';
import LeftPanels from './components/hud/LeftPanels';
import RightPanels from './components/hud/RightPanels';
import TopBar from './components/hud/TopBar';
import { useGameSession } from './hooks/useGameSession';
import { getSupabaseClient } from './lib/apiClient';
import {
  mapAllianceStatesToProfiles,
  mapRoundEventsToTurnEvents,
  mapWorldStateToMetrics,
  stageIndexByRoundStage,
} from './lib/snapshotMappers';
import type { GameSnapshot, GameStatus } from './contracts/game';
import type { GlobeSelection } from './data/worldPeaceCouncil';
import './styles/app.css';
import './styles/globe.css';
import './styles/hud.css';
import './styles/wpc.css';

function getRoundDate(round: number): string {
  const date = new Date(Date.UTC(2038, 0, 18));
  date.setUTCMonth(date.getUTCMonth() + round - 1);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

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
function buildLostSubtitle(snapshot: GameSnapshot | null): string | undefined {
  if (!snapshot) return undefined;
  if (snapshot.worldState.globalTension >= 100) {
    return '全球紧张度突破红线，世界秩序崩溃。';
  }
  return undefined;
}

function LoginGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password || isSubmitting) return;

    setIsSubmitting(true);
    setErrorText('');

    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setErrorText(error?.message ?? '登录失败，请检查邮箱或密码。');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onAuthenticated();
  };

  return (
    <main>
      <form onSubmit={handleSubmit}>
        <h1>登录</h1>
        <label>邮箱<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>密码<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button type="submit" disabled={isSubmitting || !email || !password}>{isSubmitting ? '登录中...' : '登录'}</button>
        {errorText ? <p role="alert">{errorText}</p> : null}
      </form>
    </main>
  );
}

export default function App() {
  const { snapshot, roundMeta, lastMetricChanges, isBusy, statusMessage, errorMessage, needsLogin, actions } =
    useGameSession();
  const [selectedLocation, setSelectedLocation] = useState<GlobeSelection>();

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
  const metrics = useMemo(() => mapWorldStateToMetrics(snapshot?.worldState), [snapshot?.worldState]);
  const alliances = useMemo(() => mapAllianceStatesToProfiles(snapshot?.alliances), [snapshot?.alliances]);
  const events = useMemo(() => mapRoundEventsToTurnEvents(snapshot?.events), [snapshot?.events]);
  const displayedMetricChanges = snapshot?.settlement?.metricChanges ?? lastMetricChanges;
  const gameOverStatus = toGameOverStatus(snapshot?.game.status);

  if (needsLogin) {
    return <LoginGate onAuthenticated={actions.onLoginSuccess} />;
  }

  return (
    <main className="game-shell">
      <div className="space-bg" />
      <DiplomacyGlobe
        selectedCountry={selectedLocation?.isoA3 ?? ''}
        selectedLocation={selectedLocation}
        onLocationSelect={handleLocationSelect}
      />

      <section className="hud-layer" aria-label="Game interface">
        <TopBar
          activeStageIndex={activeStageIndex}
          round={round}
          maxRounds={maxRounds}
          date={getRoundDate(round)}
          gameStatus={snapshot?.game.status}
          isBusy={isBusy}
          onNewGame={actions.startNewGame}
          worldState={snapshot?.worldState}
        />
        <LeftPanels
          activeStageIndex={activeStageIndex}
          alliances={alliances}
          briefing={currentRoundMeta?.briefing}
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
          priorityIssue={currentRoundMeta?.priorityIssue}
          settlement={snapshot?.settlement}
          submittedProposal={submittedProposal}
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
          subtitleOverride={gameOverStatus === 'LOST' ? buildLostSubtitle(snapshot) : undefined}
        />
      ) : null}
    </main>
  );
}
