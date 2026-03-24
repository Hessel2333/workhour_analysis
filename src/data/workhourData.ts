import rawSource from '../../工时数据.txt?raw';
import { buildMockConnectors } from './connectors';
import { classifyTaskTopic } from './topicRules';
import type {
  BaseDataset,
  Employee,
  EmployeeDay,
  QualityFlag,
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

export function parseWorkhourSource(source: string): BaseDataset {
  const parsed = JSON.parse(source) as RawWorkhourResponse;
  const employees: Employee[] = [];
  const employeeDays: EmployeeDay[] = [];
  const tasks: Task[] = [];
  const taskTopics: TaskTopic[] = [];
  const qualityFlags: QualityFlag[] = [];

  parsed.result.forEach((employee, employeeIndex) => {
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
      const projectCount = new Set(dayTasks.map((item) => item.ProjectName)).size;
      const anomalyScore =
        (detail.ReportHour >= 9 ? 1 : 0) +
        (dayTasks.length >= 3 ? 1 : 0) +
        (projectCount >= 3 ? 1 : 0) +
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
        isAnomalous: anomalyScore >= 2,
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

      if (projectCount >= 3) {
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
          keywordHits: topic.keywordHits,
        };

        tasks.push(normalizedTask);
        taskTopics.push({
          taskId: task.Id,
          topicLabel: topic.topicLabel,
          topicConfidence: topic.topicConfidence,
          topicSource: topic.topicSource,
        });

        if (topic.topicLabel === '未分类') {
          qualityFlags.push({
            entityType: 'task',
            entityId: task.Id,
            flagType: 'uncategorized_task',
            severity: 'low',
            message: `任务“${task.Name}”尚未命中主题词典。`,
          });
        }
      });
    });
  });

  const allDates = employeeDays.map((item) => item.date).sort(sortDates);
  const uniqueDates = Array.from(new Set(allDates));
  const projectNames = Array.from(new Set(tasks.map((item) => item.projectName)));
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
    dateRange: {
      start: uniqueDates[0] ?? '',
      end: uniqueDates[uniqueDates.length - 1] ?? '',
    },
    notes: [
      `样本覆盖 ${uniqueDates[0]} 到 ${uniqueDates[uniqueDates.length - 1]}。`,
      `共有 ${employees.length} 名员工记录，其中 ${employees.filter((item) => item.hasDetail).length} 名有工时明细。`,
      `当前核验数据全部缺失，报告中的质量判断以填报数据和任务结构为主。`,
    ],
    connectors,
  };
}

export const defaultDataset = parseWorkhourSource(rawSource);
