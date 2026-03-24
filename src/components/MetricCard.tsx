interface MetricCardProps {
  label: string;
  value: string;
  hint: string;
  tone?: 'real' | 'mock' | 'derived' | 'model' | 'warning' | 'healthy';
}

export function MetricCard({
  label,
  value,
  hint,
  tone = 'real',
}: MetricCardProps) {
  return (
    <div className={`metric-card tone-${tone}`.trim()}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-hint">{hint}</span>
    </div>
  );
}
