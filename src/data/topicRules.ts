import type { TopicRule } from '../types';

export const TOPIC_RULES: TopicRule[] = [
  { label: '开发', keywords: ['开发', '编写', '实现', '搭建', '接口', '功能'] },
  { label: '测试', keywords: ['测试', '联调', '验收', '调试', '回归'] },
  { label: '部署', keywords: ['部署', '上线', '服务器', '发布', '环境'] },
  { label: '维护', keywords: ['维护', '优化', '改造', '修复', 'bug', '修改'] },
  { label: '设计', keywords: ['设计', 'ui', '大屏', '原型', '视觉'] },
  { label: '会议', keywords: ['会议', '讨论', '沟通', '整理', '大会'] },
  { label: '学习', keywords: ['学习', '研究', '调研', 'openclaw'] },
  { label: '文档', keywords: ['文档', '任务书', '方案', '报告', 'pdf'] },
  { label: '运营', keywords: ['运营', '数据', '公众号', '推荐服务'] },
];

const FALLBACK_SPLIT = /[、，,+/.\n\s()（）_-]+/;

export function classifyTaskTopic(taskName: string) {
  const normalized = taskName.toLowerCase();
  const matchedRule = TOPIC_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );

  if (matchedRule) {
    const keywordHits = matchedRule.keywords.filter((keyword) =>
      normalized.includes(keyword.toLowerCase()),
    );
    return {
      topicLabel: matchedRule.label,
      topicConfidence: 0.92,
      topicSource: 'rule' as const,
      keywordHits,
    };
  }

  const fallbackTokens = taskName
    .split(FALLBACK_SPLIT)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 4);

  return {
    topicLabel: '未分类',
    topicConfidence: 0.24,
    topicSource: 'fallback' as const,
    keywordHits: fallbackTokens,
  };
}
