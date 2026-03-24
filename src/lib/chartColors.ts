const PROJECT_PALETTE = [
  '#2563eb',
  '#0ea5e9',
  '#06b6d4',
  '#14b8a6',
  '#22c55e',
  '#84cc16',
  '#3b82f6',
  '#38bdf8',
  '#2dd4bf',
  '#10b981',
];

const TOPIC_COLOR_MAP: Record<string, string> = {
  开发: '#2563eb',
  测试: '#10b981',
  部署: '#f59e0b',
  维护: '#ef4444',
  设计: '#8b5cf6',
  会议: '#14b8a6',
  学习: '#ec4899',
  文档: '#a16207',
  运营: '#0f766e',
  现场支持: '#f97316',
  合规管理: '#64748b',
  未分类: '#94a3b8',
  待确认: '#a855f7',
  其他: '#cbd5e1',
};

const TOPIC_FALLBACKS = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#ec4899',
  '#a16207',
  '#0f766e',
  '#f97316',
];

export function projectColor(index: number) {
  return PROJECT_PALETTE[index % PROJECT_PALETTE.length];
}

export function topicColor(label: string, index = 0) {
  return TOPIC_COLOR_MAP[label] ?? TOPIC_FALLBACKS[index % TOPIC_FALLBACKS.length];
}
