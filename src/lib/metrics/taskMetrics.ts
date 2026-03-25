import type { Task } from '../../types';
import type { MetricDefinition } from './index';

export function getUncategorizedRateMetric(
  tasks: Array<Pick<Task, 'topicLabel'>>,
): MetricDefinition<number> & { uncategorizedTaskCount: number } {
  const uncategorizedTaskCount = tasks.filter((task) => task.topicLabel === '未分类').length;
  const value = tasks.length ? uncategorizedTaskCount / tasks.length : 0;
  return {
    value,
    label: '未分类率',
    description: '在当前任务样本中，未命中任务分类规则的占比。',
    formula: '未分类任务数 / 全部任务数',
    limitations: [
      '未分类率会随规则词典覆盖范围变化，不代表任务本身质量一定差。',
      '复杂语义任务仍可能需要人工复核。',
    ],
    uncategorizedTaskCount,
  };
}

export function getVerificationCoverageMetric(
  tasks: Array<Pick<Task, 'verifyState'>>,
): MetricDefinition<number> & { verifiedTaskCount: number } {
  const verifiedTaskCount = tasks.filter((task) => task.verifyState === '已核验').length;
  const value = tasks.length ? verifiedTaskCount / tasks.length : 0;
  return {
    value,
    label: '核验覆盖率',
    description: '在当前任务样本中，已完成核验的任务占比。',
    formula: '已核验任务数 / 全部任务数',
    limitations: [
      '依赖源数据中的核验状态是否准确维护。',
      '核验覆盖率高不代表任务分类或工时本身一定无误。',
    ],
    verifiedTaskCount,
  };
}
