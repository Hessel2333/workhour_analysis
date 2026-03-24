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
  const toneLabel =
    tone === 'real'
      ? '真实工时'
      : tone === 'derived'
        ? '规则推导'
        : tone === 'warning'
          ? '低样本'
          : tone === 'healthy'
            ? '健康'
            : tone === 'model'
              ? '模型结果'
              : '示意数据';

  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <span className={`metric-source tone-${tone}`}>{toneLabel}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-hint">{hint}</span>
    </div>
  );
}
