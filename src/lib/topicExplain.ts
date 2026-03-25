import type { Task } from '../types';

const RULE_LABELS: Record<string, string> = {
  pending_pattern: '待确认占位规则',
  special_case_pending: '特殊待确认规则',
  uncategorized_fallback: '未分类兜底规则',
  direct_development_keywords: '开发直达规则',
  direct_document_keywords: '文档直达规则',
  direct_design_keywords: '设计直达规则',
  direct_learning_keywords: '学习直达规则',
  direct_compliance_keywords: '合规直达规则',
  development_keywords: '开发关键词词典',
  testing_keywords: '测试关键词词典',
  deployment_keywords: '部署关键词词典',
  maintenance_keywords: '维护关键词词典',
  design_keywords: '设计关键词词典',
  meeting_keywords: '会议关键词词典',
  learning_keywords: '学习关键词词典',
  document_keywords: '文档关键词词典',
  operations_keywords: '运营关键词词典',
  onsite_support_keywords: '现场支持关键词词典',
  compliance_keywords: '合规管理关键词词典',
};

const RULE_NOTES: Record<string, string> = {
  pending_pattern: '任务名命中了日期占位或考试类模式，先标为待确认，避免误归类。',
  special_case_pending: '任务名命中了内部缩写或版本类特殊项，默认进入待确认列表。',
  uncategorized_fallback: '当前没有命中主题词典，只保留了拆分出来的高频片段供人工复核。',
};

export interface TopicExplanation {
  ruleName: string;
  ruleLabel: string;
  matchedKeywords: string[];
  confidence: number;
  usedFallback: boolean;
  sourceLabel: string;
  summary: string;
  note: string;
}

export function buildTopicExplanation(
  task: Pick<
    Task,
    'topicLabel' | 'topicConfidence' | 'topicSource' | 'topicRuleName' | 'keywordHits'
  >,
): TopicExplanation {
  const usedFallback = task.topicSource === 'fallback';
  const ruleLabel = RULE_LABELS[task.topicRuleName] ?? task.topicRuleName;
  const matchedKeywords = task.keywordHits.filter(Boolean);
  const sourceLabel = usedFallback ? 'Fallback 兜底' : '规则词典';
  const summary = usedFallback
    ? `当前未直接命中稳定主题规则，系统按“${ruleLabel}”给出保守分类。`
    : `当前命中“${ruleLabel}”，因此归类为“${task.topicLabel}”。`;
  const note =
    RULE_NOTES[task.topicRuleName] ??
    (matchedKeywords.length
      ? `命中关键词：${matchedKeywords.join(' / ')}。`
      : '当前规则没有额外命中词可展示。');

  return {
    ruleName: task.topicRuleName,
    ruleLabel,
    matchedKeywords,
    confidence: task.topicConfidence,
    usedFallback,
    sourceLabel,
    summary,
    note,
  };
}
