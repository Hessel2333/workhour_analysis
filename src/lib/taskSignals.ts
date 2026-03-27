import { analysisConfig } from '../config/analysisConfig';
import type { Task } from '../types';

const REWORK_KEYWORDS = [
  '修改',
  'bug',
  '修复',
  '调整',
  '客户反馈',
  '测试修改',
  '问题处理',
  '改版',
  '反馈',
];

export function isReworkTask(task: Pick<Task, 'taskName' | 'topicLabel'>) {
  const normalized = task.taskName.toLowerCase();
  const matchedKeyword = analysisConfig.ruleToggles.enableReworkKeywordRules
    ? REWORK_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()))
    : false;
  return (
    task.topicLabel === '维护' ||
    task.topicLabel === '现场支持' ||
    matchedKeyword
  );
}
