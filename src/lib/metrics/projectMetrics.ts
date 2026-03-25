import type { MetricDefinition } from './index';

export function getProjectReworkShareMetric(input: {
  totalHours: number;
  reworkHours: number;
}): MetricDefinition<number> {
  const value = input.totalHours ? input.reworkHours / input.totalHours : 0;
  return {
    value,
    label: '项目返工占比',
    description: '项目总工时中，返工类任务所占的工时比例。',
    formula: '返工类工时 / 项目总工时',
    limitations: [
      '返工识别来自任务文本规则，复杂任务可能被低估或高估。',
      '返工占比高只说明修补压力大，不直接代表项目结果差。',
    ],
  };
}
