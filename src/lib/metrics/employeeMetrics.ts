import type { EmployeeDay, Task } from '../../types';
import type { MetricDefinition } from './index';

export function getMultiProjectRateMetric(
  days: Array<Pick<EmployeeDay, 'projectCount'>>,
): MetricDefinition<number> {
  const value = days.length ? days.filter((day) => day.projectCount > 1).length / days.length : 0;
  return {
    value,
    label: '多项目切换率',
    description: '在观察期内，员工处于多项目工作日的占比。',
    formula: '多项目工作日数 / 全部工作日数',
    limitations: [
      '只反映跨项目切换频率，不直接代表效率高低。',
      '若任务拆分粒度不一致，多项目率会被放大或压缩。',
    ],
  };
}

export function getFocusScoreMetric(
  tasks: Array<Pick<Task, 'projectName' | 'reportHour'>>,
): MetricDefinition<number> {
  const totalHours = tasks.reduce((sum, task) => sum + task.reportHour, 0);
  const projectHours = new Map<string, number>();
  tasks.forEach((task) => {
    projectHours.set(task.projectName, (projectHours.get(task.projectName) ?? 0) + task.reportHour);
  });
  const topProjectHours = Math.max(...projectHours.values(), 0);
  const value = totalHours ? topProjectHours / totalHours : 0;

  return {
    value,
    label: '集中度',
    description: '员工总工时中，投入最多的单一项目所占比例。',
    formula: '单一项目最大工时 / 总工时',
    limitations: [
      '集中度高不一定更好，也可能意味着关键人依赖偏高。',
      '当样本时间窗很短时，集中度会更容易受单个项目节点影响。',
    ],
  };
}

export function getEmployeeRiskMetric(input: {
  multiProjectRate: number;
  focusScore: number;
  anomalyDayCount: number;
  taskCount: number;
}): MetricDefinition<number> {
  const value =
    input.multiProjectRate * 45 +
    (1 - input.focusScore) * 30 +
    input.anomalyDayCount * 6 +
    Math.min(input.taskCount / 40, 1) * 19;

  return {
    value,
    label: '员工风险分',
    description: '综合切换频率、集中度、异常日和任务量得到的复盘优先级分数。',
    formula: '多项目率×45 + (1-集中度)×30 + 异常日×6 + min(任务数/40,1)×19',
    limitations: [
      '这是复盘优先级线索，不是绩效评价分。',
      '不同团队任务拆分习惯不同，分数不适合跨团队横比。',
    ],
  };
}

export function getFirefightingMetric(input: {
  totalHours: number;
  reworkHours: number;
  supportHours: number;
  multiProjectRate: number;
  anomalyDayCount: number;
}): MetricDefinition<number> & {
  reworkShare: number;
  supportShare: number;
} {
  const reworkShare = input.totalHours ? input.reworkHours / input.totalHours : 0;
  const supportShare = input.totalHours ? input.supportHours / input.totalHours : 0;
  const value =
    reworkShare * 44 +
    supportShare * 22 +
    input.multiProjectRate * 20 +
    Math.min(input.anomalyDayCount / 8, 1) * 14;

  return {
    value,
    label: '救火指数',
    description: '综合返工、现场支持、高切换和异常日，估计员工是否长期处在救火型工作状态。',
    formula: '返工占比×44 + 现场支持占比×22 + 多项目率×20 + min(异常日/8,1)×14',
    limitations: [
      '依赖返工和现场支持的规则识别，文本命名会影响结果。',
      '更适合发现流程与排班问题，不适合直接用于个人评价。',
    ],
    reworkShare,
    supportShare,
  };
}
