export function formatNumber(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.0';
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatCompactDate(date: string) {
  return date.replace('2026-', '');
}

export function severityLabel(level: 'high' | 'medium' | 'low') {
  if (level === 'high') return '高';
  if (level === 'medium') return '中';
  return '低';
}
