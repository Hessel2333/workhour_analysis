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

const STAGE_RULES: Array<{ label: string; keywords: string[]; topics?: string[] }> = [
  {
    label: '需求/设计',
    keywords: ['需求', '原型', '设计', 'ui', '视觉', '大屏', '白皮书', '方案'],
    topics: ['设计', '文档'],
  },
  {
    label: '开发',
    keywords: ['开发', '实现', '搭建', '页面', '接口', '功能', '模块', '智能体', 'ocr', '转写', '定位'],
    topics: ['开发'],
  },
  {
    label: '联调/测试',
    keywords: ['联调', '测试', '验收', '调试', '回归'],
    topics: ['测试'],
  },
  {
    label: '上线/发布',
    keywords: ['部署', '上线', '发布', '环境'],
    topics: ['部署'],
  },
  {
    label: '维护/反馈',
    keywords: ['修改', 'bug', '修复', '调整', '客户反馈', '运维', '维护', '驻点', '支持', '问题处理'],
    topics: ['维护', '现场支持'],
  },
];

const WORKSTREAM_LABEL_BY_TOPIC: Record<string, string> = {
  开发: '建设型',
  设计: '建设型',
  部署: '建设型',
  测试: '修补型',
  维护: '修补型',
  会议: '支撑型',
  文档: '支撑型',
  现场支持: '支撑型',
  运营: '支撑型',
  合规管理: '支撑型',
  学习: '成长型',
  待确认: '待确认',
  未分类: '待确认',
  其他: '待确认',
};

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

export function detectTaskStage(task: Pick<Task, 'taskName' | 'topicLabel'>) {
  if (!analysisConfig.ruleToggles.enableStageDetectionRules) {
    return '其他';
  }
  const normalized = task.taskName.toLowerCase();
  const matched = STAGE_RULES.find(
    (rule) =>
      rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())) ||
      rule.topics?.includes(task.topicLabel),
  );
  return matched?.label ?? '其他';
}

export function classifyTaskWorkstream(task: Pick<Task, 'taskName' | 'topicLabel'>) {
  if (isReworkTask(task)) return '修补型';
  return WORKSTREAM_LABEL_BY_TOPIC[task.topicLabel] ?? '待确认';
}

export const PROJECT_STAGE_ORDER = [
  '需求/设计',
  '开发',
  '联调/测试',
  '上线/发布',
  '维护/反馈',
  '其他',
] as const;

export const WORKSTREAM_ORDER = ['建设型', '修补型', '支撑型', '成长型', '待确认'] as const;
