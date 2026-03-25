import type { TopicRule } from '../types';

export const TOPIC_RULES: TopicRule[] = [
  {
    name: 'development_keywords',
    label: '开发',
    keywords: [
      '开发',
      '编写',
      '实现',
      '搭建',
      '接口',
      '功能',
      '页面',
      '组件',
      '小程序',
      'app',
      'uniapp',
      '登录',
      '二维码',
      '交易',
      '菜单配置',
      '低代码',
      'qb库',
    ],
  },
  { name: 'testing_keywords', label: '测试', keywords: ['测试', '联调', '验收', '调试', '回归'] },
  { name: 'deployment_keywords', label: '部署', keywords: ['部署', '上线', '服务器', '发布', '环境'] },
  {
    name: 'maintenance_keywords',
    label: '维护',
    keywords: [
      '维护',
      '优化',
      '改造',
      '修复',
      'bug',
      '修改',
      '更改',
      '调整',
      '问题处理',
      '对接',
      '改版',
      '日常运维',
      '运维',
    ],
  },
  {
    name: 'design_keywords',
    label: '设计',
    keywords: ['设计', 'ui', '大屏', '原型', '视觉', '3d', '图标', '暗黑版本', '改肤色'],
  },
  { name: 'meeting_keywords', label: '会议', keywords: ['会议', '讨论', '沟通', '整理', '大会', '过会', '开会'] },
  { name: 'learning_keywords', label: '学习', keywords: ['学习', '研究', '调研', 'openclaw', 'ai生成', '分析方法'] },
  { name: 'document_keywords', label: '文档', keywords: ['文档', '任务书', '方案', '报告', 'pdf', '填报'] },
  { name: 'operations_keywords', label: '运营', keywords: ['运营', '数据', '公众号', '推荐服务'] },
  { name: 'onsite_support_keywords', label: '现场支持', keywords: ['现场驻点', '驻点', '现场', '委外管理'] },
  { name: 'compliance_keywords', label: '合规管理', keywords: ['合规', '委外', '审核', '许可', '复垦', '水保', '能评', '环评'] },
];

const FALLBACK_SPLIT = /[、，,+/.\n\s()（）_-]+/;
const PENDING_PATTERNS = [/^\d{4}-\d{1,2}-\d{1,2}任务$/];

const DIRECT_LABELS: Array<{ name: string; label: string; confidence: number; keywords: string[] }> = [
  {
    name: 'direct_development_keywords',
    label: '开发',
    confidence: 0.9,
    keywords: [
      'ocr识别',
      '实时语音转写',
      '人员实时定位',
      '知识库多模态文件解析',
      '二级智能体调度',
      '科目仿真模块',
      '选单',
      '弹出框',
      '过滤条件同步',
      '库存管理',
      '调拨单',
      '用款批量申请',
      '佣金逻辑重构',
      'ais信息面版',
      'qb详情展示附件',
    ],
  },
  {
    name: 'direct_document_keywords',
    label: '文档',
    confidence: 0.9,
    keywords: ['ppt', '白皮书', '招标书', '申报', '答辩', '汇报', '内容组织', '课题选题'],
  },
  {
    name: 'direct_design_keywords',
    label: '设计',
    confidence: 0.88,
    keywords: ['ai生图', '角色声音'],
  },
  {
    name: 'direct_learning_keywords',
    label: '学习',
    confidence: 0.86,
    keywords: ['参观', '培训', '考证', '情报分析'],
  },
  {
    name: 'direct_compliance_keywords',
    label: '合规管理',
    confidence: 0.9,
    keywords: ['落实算法安全主体责任'],
  },
];

export function classifyTaskTopic(taskName: string) {
  const normalized = taskName.toLowerCase();

  if (PENDING_PATTERNS.some((pattern) => pattern.test(taskName)) || normalized === '考试任务') {
    return {
      topicLabel: '待确认',
      topicConfidence: 0.56,
      topicSource: 'fallback' as const,
      topicRuleName: 'pending_pattern',
      keywordHits: [taskName],
    };
  }

  const directLabel = DIRECT_LABELS.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );

  if (directLabel) {
    const keywordHits = directLabel.keywords.filter((keyword) =>
      normalized.includes(keyword.toLowerCase()),
    );
    return {
      topicLabel: directLabel.label,
      topicConfidence: directLabel.confidence,
      topicSource: 'rule' as const,
      topicRuleName: directLabel.name,
      keywordHits,
    };
  }

  if (
    normalized.includes('jb相关操作') ||
    normalized === 'v1.2版本' ||
    normalized === '智慧决策平台二期'
  ) {
    return {
      topicLabel: '待确认',
      topicConfidence: 0.56,
      topicSource: 'fallback' as const,
      topicRuleName: 'special_case_pending',
      keywordHits: [taskName],
    };
  }

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
      topicRuleName: matchedRule.name,
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
    topicRuleName: 'uncategorized_fallback',
    keywordHits: fallbackTokens,
  };
}
