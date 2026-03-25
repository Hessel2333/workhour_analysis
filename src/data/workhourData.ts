import rawSource from '../../data.json?raw';
import { analysisConfig } from '../config/analysisConfig';
import { buildMockConnectors } from './connectors';
import { classifyTaskTopic } from './topicRules';
import type {
  BaseDataset,
  Employee,
  EmployeeDay,
  QualityFlag,
  RawEmployee,
  RawWorkhourResponse,
  Task,
  TaskTopic,
} from '../types';

function maskLabel(index: number) {
  return `成员 ${String(index + 1).padStart(2, '0')}`;
}

function sortDates(dateA: string, dateB: string) {
  return new Date(dateA).getTime() - new Date(dateB).getTime();
}

function normalizeRawEmployees(source: string): RawEmployee[] {
  const parsed = JSON.parse(source) as RawWorkhourResponse | RawEmployee[];

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.result)) {
    return parsed.result;
  }

  throw new Error('工时文件格式不符合预期，缺少 result 列表。');
}

export function parseWorkhourSource(source: string): BaseDataset {
  const parsedEmployees = normalizeRawEmployees(source);
  const employees: Employee[] = [];
  const employeeDays: EmployeeDay[] = [];
  const tasks: Task[] = [];
  const taskTopics: TaskTopic[] = [];
  const qualityFlags: QualityFlag[] = [];
  let rawTaskCount = 0;
  let rawEmployeeDayCount = 0;
  let excludedImpossibleDayCount = 0;
  let excludedImpossibleTaskCount = 0;

  parsedEmployees.forEach((employee, employeeIndex) => {
    const normalizedEmployee: Employee = {
      employeeId: employee.Id,
      name: employee.Name,
      avatar: employee.Avatar,
      hasDetail: Array.isArray(employee.DetailList),
      maskedLabel: maskLabel(employeeIndex),
    };

    employees.push(normalizedEmployee);

    if (!employee.DetailList) {
      qualityFlags.push({
        entityType: 'employee',
        entityId: employee.Id,
        flagType: 'missing_detail_list',
        severity: 'high',
        message: `${employee.Name} 当前无工时明细，无法进入趋势和任务分析。`,
      });
      return;
    }

    employee.DetailList.forEach((detail) => {
      const dayTasks = detail.TaskList ?? [];
      rawEmployeeDayCount += 1;
      rawTaskCount += dayTasks.length;
      const impossibleTasks = dayTasks.filter((item) => item.ReportHour > 24 || item.ReportHour < 0);
      const hasImpossibleDayHours = detail.ReportHour > 24 || detail.ReportHour < 0;

      if (hasImpossibleDayHours || impossibleTasks.length) {
        excludedImpossibleDayCount += 1;
        excludedImpossibleTaskCount += impossibleTasks.length || dayTasks.length;
        qualityFlags.push({
          entityType: 'employeeDay',
          entityId: `${employee.Id}:${detail.Date}`,
          flagType: 'impossible_daily_hours',
          severity: 'high',
          message: `${employee.Name} 在 ${detail.Date} 的工时记录异常（日工时 ${detail.ReportHour}h，任务最大值 ${Math.max(0, ...dayTasks.map((item) => item.ReportHour))}h），已默认从分析中剔除，请优先修正原始数据。`,
        });
        return;
      }

      const projectCount = new Set(dayTasks.map((item) => item.ProjectName)).size;
      const anomalyScore =
        (detail.ReportHour >= analysisConfig.thresholds.anomalyDailyHours ? 1 : 0) +
        (dayTasks.length >= analysisConfig.thresholds.highTaskFragmentationCount ? 1 : 0) +
        (projectCount >= analysisConfig.thresholds.highProjectSwitchCount ? 1 : 0) +
        (detail.VerifyHour === 0 && detail.ReportHour > 0 ? 1 : 0);

      employeeDays.push({
        employeeId: employee.Id,
        employeeName: employee.Name,
        date: detail.Date,
        reportDay: detail.ReportDay,
        reportHour: detail.ReportHour,
        verifyDay: detail.VerifyDay,
        verifyHour: detail.VerifyHour,
        taskCount: dayTasks.length,
        projectCount,
        isAnomalous: anomalyScore >= analysisConfig.thresholds.anomalyScoreThreshold,
        anomalyScore,
      });

      if (detail.VerifyHour === 0 && detail.ReportHour > 0) {
        qualityFlags.push({
          entityType: 'employeeDay',
          entityId: `${employee.Id}:${detail.Date}`,
          flagType: 'verify_missing',
          severity: 'medium',
          message: `${employee.Name} 在 ${detail.Date} 的 ${detail.ReportHour} 小时尚未核验。`,
        });
      }

      if (projectCount >= analysisConfig.thresholds.highProjectSwitchCount) {
        qualityFlags.push({
          entityType: 'employeeDay',
          entityId: `${employee.Id}:${detail.Date}`,
          flagType: 'high_project_switch',
          severity: 'medium',
          message: `${employee.Name} 在 ${detail.Date} 涉及 ${projectCount} 个项目，存在多项目切换。`,
        });
      }

      dayTasks.forEach((task) => {
        const topic = classifyTaskTopic(task.Name);
        const normalizedTask: Task = {
          taskId: task.Id,
          employeeId: employee.Id,
          employeeName: employee.Name,
          date: detail.Date,
          projectName: task.ProjectName,
          taskName: task.Name,
          reportHour: task.ReportHour,
          reportDay: task.ReportDay,
          verifyHour: task.VerifyHour,
          verifyDay: task.VerifyDay,
          verifyState: task.VerifyState,
          topicLabel: topic.topicLabel,
          topicConfidence: topic.topicConfidence,
          topicSource: topic.topicSource,
          topicRuleName: topic.topicRuleName,
          keywordHits: topic.keywordHits,
        };

        tasks.push(normalizedTask);
        taskTopics.push({
          taskId: task.Id,
          topicLabel: topic.topicLabel,
          topicConfidence: topic.topicConfidence,
          topicSource: topic.topicSource,
          topicRuleName: topic.topicRuleName,
        });

        if (topic.topicLabel === '未分类') {
          qualityFlags.push({
            entityType: 'task',
            entityId: task.Id,
            flagType: 'uncategorized_task',
            severity: 'low',
            message: `任务“${task.Name}”尚未命中主题词典。`,
          });
        } else if (topic.topicLabel === '待确认') {
          qualityFlags.push({
            entityType: 'task',
            entityId: task.Id,
            flagType: 'pending_topic_confirmation',
            severity: 'low',
            message: `任务“${task.Name}”命中了待确认规则，建议人工确认最终类别。`,
          });
        }
      });
    });
  });

  const allDates = employeeDays.map((item) => item.date).sort(sortDates);
  const uniqueDates = Array.from(new Set(allDates));
  const projectNames = Array.from(new Set(tasks.map((item) => item.projectName)));
  const verifiedTasks = tasks.filter((item) => item.verifyState === '已核验').length;
  const verifyCoverageRate = tasks.length ? verifiedTasks / tasks.length : 0;
  const uncategorizedTaskCount = tasks.filter((item) => item.topicLabel === '未分类').length;
  const uncategorizedRate = tasks.length ? uncategorizedTaskCount / tasks.length : 0;
  const connectors = buildMockConnectors(
    projectNames,
    employees.map((item) => item.employeeId),
    uniqueDates,
  );

  qualityFlags.push({
    entityType: 'dataset',
    entityId: 'sample_range',
    flagType: 'limited_window',
    severity: 'high',
    message: `当前样本时间跨度仅 ${uniqueDates.length} 天，适合做分布和异常观察，不适合做稳定绩效判断。`,
  });

  return {
    employees,
    employeeDays,
    tasks,
    taskTopics,
    qualityFlags,
    ingestionSummary: {
      rawTaskCount,
      validTaskCount: tasks.length,
      excludedImpossibleTaskCount,
      rawEmployeeDayCount,
      validEmployeeDayCount: employeeDays.length,
      excludedImpossibleDayCount,
    },
    dateRange: {
      start: uniqueDates[0] ?? '',
      end: uniqueDates[uniqueDates.length - 1] ?? '',
    },
    notes: [
      `样本覆盖 ${uniqueDates[0]} 到 ${uniqueDates[uniqueDates.length - 1]}。`,
      `共有 ${employees.length} 名员工记录，其中 ${employees.filter((item) => item.hasDetail).length} 名有工时明细。`,
      `当前共解析 ${tasks.length} 条任务、${projectNames.length} 个项目，核验覆盖率约 ${(verifyCoverageRate * 100).toFixed(1)}%。`,
      `当前任务分类未命中率约 ${(uncategorizedRate * 100).toFixed(1)}%，复杂语义任务仍建议人工复核。`,
      excludedImpossibleDayCount
        ? `已自动剔除 ${excludedImpossibleDayCount} 个不可能工时员工日（涉及约 ${excludedImpossibleTaskCount} 条任务），避免污染统计结果。`
        : '当前未发现超过 24 小时的明显工时脏数据。',
    ],
    connectors,
  };
}

export const defaultDataset = parseWorkhourSource(rawSource);
