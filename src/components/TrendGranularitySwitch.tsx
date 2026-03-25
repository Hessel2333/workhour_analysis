import type { TrendGranularity } from '../lib/timeSeries';

interface TrendGranularitySwitchProps {
  value: Extract<TrendGranularity, 'day' | 'week'>;
  onChange: (value: Extract<TrendGranularity, 'day' | 'week'>) => void;
  ariaLabel?: string;
}

export function TrendGranularitySwitch({
  value,
  onChange,
  ariaLabel = '趋势聚合粒度',
}: TrendGranularitySwitchProps) {
  return (
    <div className="mini-segment" aria-label={ariaLabel}>
      {[
        ['day', '日'],
        ['week', '周'],
      ].map(([nextValue, label]) => (
        <button
          key={nextValue}
          type="button"
          className={`mini-segment-button ${value === nextValue ? 'active' : ''}`.trim()}
          onClick={() => onChange(nextValue as Extract<TrendGranularity, 'day' | 'week'>)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
