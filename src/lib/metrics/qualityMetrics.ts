import type { MetricDefinition } from './index';

export function getHighSeverityRateMetric(input: {
  qualityFlagCount: number;
  highSeverityCount: number;
}): MetricDefinition<number> {
  const value = input.qualityFlagCount ? input.highSeverityCount / input.qualityFlagCount : 0;
  return {
    value,
    label: '高风险提醒占比',
    description: '当前质量旗标中，高风险问题所占的比例。',
    formula: '高风险旗标数 / 全部质量旗标数',
    limitations: [
      '它反映的是当前规则命中的严重程度，不代表全部真实风险。',
      '不同规则覆盖范围不同，跨数据集对比时需谨慎。',
    ],
  };
}

export function getDataHealthMetric(input: {
  coverageRate: number;
  uncategorizedRate: number;
  highSeverityRate: number;
  sampleDays: number;
}): (MetricDefinition<number> & {
  status: 'healthy' | 'watch' | 'risk';
  summary: string;
}) {
  const value = Math.max(
    0,
    Math.round(
      100 -
        (1 - input.coverageRate) * 35 -
        input.uncategorizedRate * 20 -
        input.highSeverityRate * 25 -
        Math.max(0, 7 - input.sampleDays) * 3,
    ),
  );

  const status = value >= 78 ? 'healthy' : value >= 55 ? 'watch' : 'risk';
  const summary =
    status === 'healthy'
      ? '当前样本可用于描述性分析，但仍应避免把短周期结果直接用于个体判断。'
      : status === 'watch'
        ? '当前数据可用于观察趋势和结构，但未分类任务、样本长度或质量缺口会显著影响结论强度。'
        : '当前数据更适合做线索发现，不适合下稳定结论，应优先补齐质量与时间跨度。';

  return {
    value,
    label: '数据健康分',
    description: '综合覆盖率、未分类率、高风险质量旗标和样本长度后的稳定性评分。',
    formula: '100 - (1-覆盖率)×35 - 未分类率×20 - 高风险提醒占比×25 - max(0,7-样本天数)×3',
    limitations: [
      '这是数据可读性评分，不代表业务运行质量。',
      '短周期样本会被主动降权，避免把偶发波动误读为稳定结论。',
    ],
    status,
    summary,
  };
}
