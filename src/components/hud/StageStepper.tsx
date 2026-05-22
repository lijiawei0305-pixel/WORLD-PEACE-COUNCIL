import type { CouncilStage } from '../../data/worldPeaceCouncil';

type StageStepperProps = {
  stages: CouncilStage[];
  activeIndex: number;
};

export default function StageStepper({ stages, activeIndex }: StageStepperProps) {
  return (
    <nav className="wpc-stage-stepper" aria-label="回合阶段">
      {stages.map((stage, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'locked';

        return (
          <div key={stage.id} className={`wpc-stage-step wpc-stage-step--${state}`}>
            <span className="wpc-stage-step__dot">{index + 1}</span>
            <span className="wpc-stage-step__label">{stage.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
