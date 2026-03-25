import type { MetricDefinition } from './index';

export function getCorrelationStrengthMetric(value: number): MetricDefinition<number> {
  return {
    value,
    label: '相关强度',
    description: '用相关系数绝对值描述变量之间同步变化的强弱。',
    formula: '|r|',
    limitations: [
      '相关不代表因果，只说明同步变化程度。',
      '样本量偏小或时间窗过短时，相关强度会更不稳定。',
    ],
  };
}
