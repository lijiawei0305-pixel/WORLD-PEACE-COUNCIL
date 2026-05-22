import type { WorldMetric } from '../../data/worldPeaceCouncil';

type MetricBarProps = {
  metric: WorldMetric;
};

export default function MetricBar({ metric }: MetricBarProps) {
  const percentage = Math.min(100, Math.round((metric.value / metric.max) * 100));

  return (
    <div className={`wpc-metric wpc-metric--${metric.tone}`}>
      <span className="wpc-metric__icon">{metric.icon}</span>
      <span className="wpc-metric__label">{metric.label}</span>
      <strong className="wpc-metric__value">
        {metric.value} / {metric.max}
      </strong>
      <span className="wpc-metric__track" aria-hidden="true">
        <i style={{ width: `${percentage}%` }} />
      </span>
    </div>
  );
}
