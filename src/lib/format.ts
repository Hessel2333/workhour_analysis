export function formatNumber(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.0';
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatCompactDate(date: string) {
  return date.replace(/^\d{4}-/, '');
}

export function severityLabel(level: 'high' | 'medium' | 'low') {
  if (level === 'high') return '高';
  if (level === 'medium') return '中';
  return '低';
}

export function qualityFlagTypeLabel(flagType: string) {
  const map: Record<string, string> = {
    missing_detail_list: '缺少工时明细',
    impossible_daily_hours: '不可能工时',
    verify_missing: '核验缺失',
    high_project_switch: '多项目切换过高',
    uncategorized_task: '任务未分类',
    pending_topic_confirmation: '任务待确认',
    limited_window: '样本时间限制',
  };
  return map[flagType] ?? flagType;
}

export function qualityEntityTypeLabel(entityType: string) {
  const map: Record<string, string> = {
    employee: '员工',
    employeeDay: '员工日',
    task: '任务',
    dataset: '数据集',
  };
  return map[entityType] ?? entityType;
}
