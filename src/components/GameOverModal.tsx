/**
 * 终局 modal：覆盖整张 HUD，显示胜利 / 失败 / 冷和平结局。
 *
 * 注意：组件 props 用产品语义命名（'WON' | 'LOST' | 'STALEMATE'），
 * 后端 game.status 是 'WON' | 'FAILED' | 'COLD_PEACE' | 'ABANDONED'。
 * App.tsx 在传入前做映射（FAILED → LOST、COLD_PEACE / ABANDONED → STALEMATE）。
 */
import type { ReactNode } from 'react';

export type GameOverStatus = 'WON' | 'LOST' | 'STALEMATE';

export interface GameOverModalProps {
  status: GameOverStatus;
  finalRound: number;
  peaceScore: number;
  onNewGame: () => void;
  /** 可选：覆盖默认副标题（例如失败时附带具体失控原因） */
  subtitleOverride?: string;
}

type ToneCopy = {
  modifier: 'won' | 'lost' | 'stalemate';
  title: string;
  defaultSubtitle: (finalRound: number) => ReactNode;
  scoreLabel: string;
};

const TONE_COPY: Record<GameOverStatus, ToneCopy> = {
  WON: {
    modifier: 'won',
    title: '和平达成',
    defaultSubtitle: (finalRound) => `第 ${finalRound} 回合达成和平框架。`,
    scoreLabel: '和平协议进度',
  },
  LOST: {
    modifier: 'lost',
    title: '文明崩溃',
    defaultSubtitle: () => '全球紧张度突破红线，世界秩序崩溃。',
    scoreLabel: '和平协议进度',
  },
  STALEMATE: {
    modifier: 'stalemate',
    title: '冷和平',
    defaultSubtitle: () => '世界维持在紧张的平衡中。',
    scoreLabel: '和平协议进度',
  },
};

export default function GameOverModal({
  status,
  finalRound,
  peaceScore,
  onNewGame,
  subtitleOverride,
}: GameOverModalProps) {
  const copy = TONE_COPY[status];
  const subtitle = subtitleOverride ?? copy.defaultSubtitle(finalRound);

  return (
    <div
      className="wpc-game-over-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wpc-game-over-title"
    >
      <div className={`wpc-game-over wpc-game-over--${copy.modifier}`}>
        <h2 id="wpc-game-over-title" className="wpc-game-over__title">
          {copy.title}
        </h2>
        <p className="wpc-game-over__subtitle">{subtitle}</p>

        <dl className="wpc-game-over__stats">
          <div>
            <dt>最终回合</dt>
            <dd>{finalRound} / 20</dd>
          </div>
          <div>
            <dt>{copy.scoreLabel}</dt>
            <dd>{peaceScore} / 100</dd>
          </div>
        </dl>

        <button type="button" className="wpc-game-over__action" onClick={onNewGame}>
          开始新局
        </button>
      </div>
    </div>
  );
}
