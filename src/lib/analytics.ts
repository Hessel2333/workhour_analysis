import { analysisConfig } from '../config/analysisConfig';
import type {
  AnalyticsView,
  AgentIssue,
  AgentRecommendation,
  AgentReport,
  BaseDataset,
  CorrelationCell,
  EmployeeDay,
  EmployeeStat,
  Filters,
  GlobalMetrics,
  ProjectStat,
  DataHealthSummary,
  QualityFlag,
  QualitySummary,
  ReportBlock,
  Task,
  TopicStat,
} from '../types';
import { formatNumber, formatPercent } from './format';
import {
  getDataHealthMetric,
  getFocusScoreMetric,
  getHighSeverityRateMetric,
  getMultiProjectRateMetric,
  getUncategorizedRateMetric,
} from './metrics';

function dateInRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function pearson(valuesX: number[], valuesY: number[]) {
  if (valuesX.length !== valuesY.length || valuesX.length < 2) return 0;
  const meanX = average(valuesX);
  const meanY = average(valuesY);
  const numerator = valuesX.reduce(
    (acc, current, index) => acc + (current - meanX) * (valuesY[index] - meanY),
    0,
  );
  const denominatorX = Math.sqrt(
    valuesX.reduce((acc, current) => acc + (current - meanX) ** 2, 0),
  );
  const denominatorY = Math.sqrt(
    valuesY.reduce((acc, current) => acc + (current - meanY) ** 2, 0),
  );
  if (!denominatorX || !denominatorY) return 0;
  return numerator / (denominatorX * denominatorY);
}

function computeTrendSlope(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return 0;
  const meanX = average(points.map((point) => point.x));
  const meanY = average(points.map((point) => point.y));
  const numerator = points.reduce(
    (acc, point) => acc + (point.x - meanX) * (point.y - meanY),
    0,
  );
  const denominator = points.reduce((acc, point) => acc + (point.x - meanX) ** 2, 0);
  return denominator ? numerator / denominator : 0;
}

function aggregateEmployeeDays(tasks: Task[], dataset: BaseDataset) {
  const dayMap = new Map<string, EmployeeDay>();
  const employeeNameById = new Map(
    dataset.employees.map((employee) => [employee.employeeId, employee.name]),
  );
  const projectMap = new Map<string, Set<string>>();

  tasks.forEach((task) => {
    const key = `${task.employeeId}:${task.date}`;
    const existing = dayMap.get(key);
    const existingProjects = projectMap.get(key) ?? new Set<string>();
    existingProjects.add(task.projectName);
    projectMap.set(key, existingProjects);

    if (existing) {
      existing.reportHour += task.reportHour;
      existing.reportDay += task.reportDay;
      existing.verifyHour += task.verifyHour;
      existing.verifyDay += task.verifyDay;
      existing.taskCount += 1;
      existing.projectCount = existingProjects.size;
      return;
    }

    dayMap.set(key, {
      employeeId: task.employeeId,
      employeeName: employeeNameById.get(task.employeeId) ?? task.employeeName,
      date: task.date,
      reportDay: task.reportDay,
      reportHour: task.reportHour,
      verifyDay: task.verifyDay,
      verifyHour: task.verifyHour,
      taskCount: 1,
      projectCount: existingProjects.size,
      isOvertime: false,
      isHeavyOvertime: false,
      isAnomalous: false,
      anomalyScore: 0,
    });
  });

  return Array.from(dayMap.values())
    .map((day) => {
      const projects = projectMap.get(`${day.employeeId}:${day.date}`) ?? new Set();
      const isOvertime = day.reportHour > analysisConfig.thresholds.standardDailyHours;
      const isHeavyOvertime = day.reportHour > analysisConfig.thresholds.highIntensityOvertimeHours;
      const anomalyScore =
        (day.reportHour >= analysisConfig.thresholds.anomalyDailyHours ? 1 : 0) +
        (day.taskCount >= analysisConfig.thresholds.highTaskFragmentationCount ? 1 : 0) +
        (projects.size >= analysisConfig.thresholds.highProjectSwitchCount ? 1 : 0) +
        (day.verifyHour === 0 && day.reportHour > 0 ? 1 : 0);

      return {
        ...day,
        projectCount: projects.size,
        isOvertime,
        isHeavyOvertime,
        anomalyScore,
        isAnomalous: anomalyScore >= analysisConfig.thresholds.anomalyScoreThreshold,
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function computeGlobalMetrics(
  dataset: BaseDataset,
  employeeDays: EmployeeDay[],
  tasks: Task[],
): GlobalMetrics {
  const totalHours = sum(employeeDays.map((item) => item.reportHour));
  const activeEmployees = unique(employeeDays.map((item) => item.employeeId)).length;
  const uniqueDates = unique(employeeDays.map((item) => item.date));
  const crossProjectEmployees = unique(
    employeeDays.filter((item) => item.projectCount > 1).map((item) => item.employeeId),
  ).length;

  return {
    totalHours,
    activeEmployees,
    projectCount: unique(tasks.map((item) => item.projectName)).length,
    averageHoursPerEmployee: activeEmployees ? totalHours / activeEmployees : 0,
    averageDailyHours: uniqueDates.length ? totalHours / uniqueDates.length : 0,
    crossProjectEmployees,
    fragmentationRate: employeeDays.length
      ? average(employeeDays.map((item) => item.taskCount))
      : 0,
    coverageRate: dataset.employees.length
      ? dataset.employees.filter((item) => item.hasDetail).length / dataset.employees.length
      : 0,
    anomalyDayRate: employeeDays.length
      ? employeeDays.filter((item) => item.isAnomalous).length / employeeDays.length
      : 0,
    sampleDays: uniqueDates.length,
  };
}

function computeEmployeeStats(dataset: BaseDataset, employeeDays: EmployeeDay[], tasks: Task[]) {
  return dataset.employees
    .filter((employee) => employeeDays.some((day) => day.employeeId === employee.employeeId))
    .map<EmployeeStat>((employee) => {
      const days = employeeDays.filter((day) => day.employeeId === employee.employeeId);
      const employeeTasks = tasks.filter((task) => task.employeeId === employee.employeeId);
      const totalHours = sum(days.map((day) => day.reportHour));
      const multiProjectRateMetric = getMultiProjectRateMetric(days);
      const focusScoreMetric = getFocusScoreMetric(employeeTasks);

      return {
        employeeId: employee.employeeId,
        name: employee.name,
        maskedLabel: employee.maskedLabel,
        totalHours,
        averageDailyHours: average(days.map((day) => day.reportHour)),
        projectCount: unique(employeeTasks.map((task) => task.projectName)).length,
        taskCount: employeeTasks.length,
        multiProjectRate: multiProjectRateMetric.value,
        focusScore: focusScoreMetric.value,
        overtimeDayCount: days.filter((day) => day.isOvertime).length,
        heavyOvertimeDayCount: days.filter((day) => day.isHeavyOvertime).length,
        anomalyDayCount: days.filter((day) => day.isAnomalous).length,
      };
    })
    .sort((left, right) => right.totalHours - left.totalHours);
}

function computeProjectStats(tasks: Task[]) {
  const projectNames = unique(tasks.map((task) => task.projectName));

  return projectNames
    .map<ProjectStat>((projectName) => {
      const projectTasks = tasks.filter((task) => task.projectName === projectName);
      const groupedDates = unique(projectTasks.map((task) => task.date)).sort();
      const dailyHours = groupedDates.map((date, index) => ({
        x: index + 1,
        y: sum(
          projectTasks.filter((task) => task.date === date).map((task) => task.reportHour),
        ),
      }));
      const topicHours = unique(projectTasks.map((task) => task.topicLabel)).map((topicLabel) => ({
        topicLabel,
        hours: sum(
          projectTasks
            .filter((task) => task.topicLabel === topicLabel)
            .map((task) => task.reportHour),
        ),
      }));
      const primaryTopic = topicHours.sort((left, right) => right.hours - left.hours)[0];
      const totalHours = sum(projectTasks.map((task) => task.reportHour));
      const participantCount = unique(projectTasks.map((task) => task.employeeId)).length;

      return {
        projectName,
        totalHours,
        participantCount,
        taskCount: projectTasks.length,
        trendSlope: computeTrendSlope(dailyHours),
        averageHoursPerPerson: participantCount ? totalHours / participantCount : 0,
        topicDiversity: unique(projectTasks.map((task) => task.topicLabel)).length,
        primaryTopic: primaryTopic?.topicLabel ?? '未分类',
      };
    })
    .sort((left, right) => right.totalHours - left.totalHours);
}

function computeTopicStats(tasks: Task[]) {
  const totalTaskCount = tasks.length;
  return unique(tasks.map((task) => task.topicLabel))
    .map<TopicStat>((topicLabel) => {
      const topicTasks = tasks.filter((task) => task.topicLabel === topicLabel);
      return {
        topicLabel,
        totalHours: sum(topicTasks.map((task) => task.reportHour)),
        taskCount: topicTasks.length,
        coverageRate: totalTaskCount ? topicTasks.length / totalTaskCount : 0,
        keywords: unique(topicTasks.flatMap((task) => task.keywordHits)).slice(
          0,
          analysisConfig.displayLimits.topicKeywordPreview,
        ),
      };
    })
    .sort((left, right) => right.totalHours - left.totalHours);
}

function computeCorrelations(employeeDays: EmployeeDay[]): CorrelationCell[] {
  const features = {
    工时: employeeDays.map((day) => day.reportHour),
    任务数: employeeDays.map((day) => day.taskCount),
    项目数: employeeDays.map((day) => day.projectCount),
  };

  const labels = Object.keys(features) as Array<keyof typeof features>;
  const cells: CorrelationCell[] = [];

  labels.forEach((xLabel) => {
    labels.forEach((yLabel) => {
      cells.push({
        x: xLabel,
        y: yLabel,
        value: pearson(features[xLabel], features[yLabel]),
      });
    });
  });

  return cells;
}

function filterQualityFlags(
  qualityFlags: QualityFlag[],
  employeeDays: EmployeeDay[],
  tasks: Task[],
) {
  const validEmployeeDayIds = new Set(
    employeeDays.map((day) => `${day.employeeId}:${day.date}`),
  );
  const validTaskIds = new Set(tasks.map((task) => task.taskId));
  const validEmployeeIds = new Set(employeeDays.map((day) => day.employeeId));

  return qualityFlags.filter((flag) => {
    if (flag.entityType === 'dataset') return true;
    if (flag.entityType === 'employee') return validEmployeeIds.has(flag.entityId);
    if (flag.entityType === 'employeeDay') return validEmployeeDayIds.has(flag.entityId);
    if (flag.entityType === 'task') return validTaskIds.has(flag.entityId);
    return false;
  });
}

function summarizeQuality(qualityFlags: QualityFlag[]): QualitySummary {
  return qualityFlags.reduce<QualitySummary>(
    (summary, flag) => {
      summary.total += 1;
      summary[flag.severity] += 1;
      return summary;
    },
    { high: 0, medium: 0, low: 0, total: 0 },
  );
}

function buildDataHealthSummary(
  tasks: Task[],
  qualityFlags: QualityFlag[],
  globalMetrics: GlobalMetrics,
): DataHealthSummary {
  const uncategorizedRateMetric = getUncategorizedRateMetric(tasks);
  const highSeverityCount = qualityFlags.filter((flag) => flag.severity === 'high').length;
  const highSeverityRateMetric = getHighSeverityRateMetric({
    qualityFlagCount: qualityFlags.length,
    highSeverityCount,
  });
  const healthMetric = getDataHealthMetric({
    coverageRate: globalMetrics.coverageRate,
    uncategorizedRate: uncategorizedRateMetric.value,
    highSeverityRate: highSeverityRateMetric.value,
    sampleDays: globalMetrics.sampleDays,
  });

  return {
    score: healthMetric.value,
    status: healthMetric.status,
    coverageRate: globalMetrics.coverageRate,
    uncategorizedRate: uncategorizedRateMetric.value,
    highSeverityRate: highSeverityRateMetric.value,
    sampleDays: globalMetrics.sampleDays,
    summary: healthMetric.summary,
  };
}

function buildReportBlocks(
  dataset: BaseDataset,
  globalMetrics: GlobalMetrics,
  projectStats: ProjectStat[],
  employeeStats: EmployeeStat[],
  qualityFlags: QualityFlag[],
  agentReport: AgentReport,
) {
  const topProject = projectStats[0];
  const highestSwitch = employeeStats.sort(
    (left, right) => right.multiProjectRate - left.multiProjectRate,
  )[0];

  const blocks: ReportBlock[] = [
    {
      title: '管理层摘要',
      body: `当前筛选范围内共计 ${formatNumber(globalMetrics.totalHours)} 小时，覆盖 ${globalMetrics.activeEmployees} 名活跃员工与 ${globalMetrics.projectCount} 个项目。样本仅 ${globalMetrics.sampleDays} 天，应以结构和波动观察为主。`,
    },
    {
      title: '重点项目',
      body: topProject
        ? `${topProject.projectName} 当前累计 ${formatNumber(topProject.totalHours)} 小时，涉及 ${topProject.participantCount} 人，主导主题为 ${topProject.primaryTopic}。`
        : '当前筛选范围内没有可展示的项目。',
    },
    {
      title: '异常负载日',
      body: `异常负载日占比 ${formatPercent(globalMetrics.anomalyDayRate)}，建议重点关注 ≥${analysisConfig.thresholds.anomalyDailyHours}h 且叠加高碎片、高切换或核验缺口的工作日。`,
    },
    {
      title: '数据质量限制',
      body: `当前共有 ${qualityFlags.length} 条质量提醒，已知限制包括明细缺失、核验数据为 0，以及部分任务名称未命中主题规则。`,
    },
    {
      title: '下一步接入建议',
      body: `建议优先接入 Git/PR 与项目反馈，再结合默认脱敏的 AI 使用日志，验证投入、交付和用户结果之间的相关性。当前数据范围不足以支持因果判断。`,
    },
    {
      title: '智能分析摘要',
      body: agentReport.summary,
    },
  ];

  if (highestSwitch) {
    blocks[2].body += ` 当前切换率最高的是 ${highestSwitch.name}，多项目日占比 ${formatPercent(highestSwitch.multiProjectRate)}。`;
  }

  if (dataset.notes.length) {
    blocks.push({
      title: '样本说明',
      body: dataset.notes.join(' '),
    });
  }

  return blocks;
}

function buildAgentReport(
  dataset: BaseDataset,
  filters: Filters,
  globalMetrics: GlobalMetrics,
  employeeStats: EmployeeStat[],
  projectStats: ProjectStat[],
  employeeDays: EmployeeDay[],
  tasks: Task[],
  qualityFlags: QualityFlag[],
): AgentReport {
  const issues: AgentIssue[] = [];
  const recommendations: AgentRecommendation[] = [];
  const avgHours = globalMetrics.averageHoursPerEmployee;
  const avgFragmentation = globalMetrics.fragmentationRate;

  const aiByEmployee = dataset.connectors.ai
    .filter((item) => dateInRange(item.date, filters.startDate, filters.endDate))
    .reduce((map, item) => {
      const current = map.get(item.employeeId) ?? {
        callCount: 0,
        depthScore: 0,
        recordCount: 0,
      };
      current.callCount += item.callCount;
      current.depthScore += item.depthScore;
      current.recordCount += 1;
      map.set(item.employeeId, current);
      return map;
    }, new Map<string, { callCount: number; depthScore: number; recordCount: number }>());

  employeeStats.slice(0, analysisConfig.displayLimits.topNDefault).forEach((employee) => {
    const evidence: string[] = [];
    const advice: string[] = [];
    let score = 0;

    if (employee.totalHours > avgHours * analysisConfig.thresholds.employeeOverloadHoursMultiplier) {
      evidence.push(
        `总工时 ${formatNumber(employee.totalHours)}h，高于当前筛选人均 ${formatNumber(avgHours)}h。`,
      );
      advice.push('核查是否存在关键人过载，必要时拆分需求或安排结对支援。');
      score += 2;
    }

    if (employee.multiProjectRate >= analysisConfig.thresholds.highMultiProjectRate) {
      evidence.push(
        `多项目切换率 ${formatPercent(employee.multiProjectRate)}，存在上下文切换损耗。`,
      );
      advice.push('优先减少同一周内并行项目数量，尽量按项目块分配。');
      score += 2;
    }

    if (
      employee.focusScore <= analysisConfig.thresholds.lowFocusScore &&
      employee.projectCount >= analysisConfig.thresholds.highProjectSwitchCount
    ) {
      evidence.push(
        `工时集中度 ${formatPercent(employee.focusScore)}，项目分散到 ${employee.projectCount} 个方向。`,
      );
      advice.push('为该成员设定主项目，次要事项通过固定时段集中处理。');
      score += 1;
    }

    if (employee.anomalyDayCount >= analysisConfig.thresholds.employeeIssueAnomalyDays) {
      evidence.push(`异常负载日 ${employee.anomalyDayCount} 天，建议结合每日任务切分复核。`);
      advice.push('让项目经理复盘这些异常负载日的任务拆分是否过碎，是否存在临时插单。');
      score += 2;
    }

    const ai = aiByEmployee.get(employee.employeeId);
    if (ai && ai.recordCount > 0) {
      const avgDepth = ai.depthScore / ai.recordCount;
      if (
        avgDepth < analysisConfig.thresholds.aiLowDepthScore &&
        ai.callCount >= analysisConfig.thresholds.aiHighCallCount
      ) {
        evidence.push(
          `AI 调用较频繁（${ai.callCount} 次），但平均深度仅 ${formatNumber(avgDepth)}，提示可能存在浅层反复提问。`,
        );
        advice.push('针对该成员补充提示词结构化训练，减少低质量多轮试错。');
        score += 1;
      }
    }

    if (score >= analysisConfig.thresholds.employeeIssueScoreThreshold) {
      issues.push({
        id: `employee-${employee.employeeId}`,
        title: '员工负载异常',
        severity:
          score >= analysisConfig.thresholds.employeeHighSeverityScore ? 'high' : 'medium',
        scope: 'employee',
        subject: employee.name,
        subjectMasked: employee.name,
        subjectReal: employee.name,
        summary: '该成员在当前样本中表现出过载、切换或异常负载日聚集特征。',
        evidence,
        recommendations: Array.from(new Set(advice)),
        score,
      });
    }
  });

  projectStats.slice(0, analysisConfig.displayLimits.projectPrimary).forEach((project) => {
    const evidence: string[] = [];
    const advice: string[] = [];
    let score = 0;

    if (
      project.participantCount >= analysisConfig.thresholds.projectWideParticipationCount &&
      project.averageHoursPerPerson <= analysisConfig.thresholds.projectLowAverageHoursPerPerson
    ) {
      evidence.push(
        `参与人数 ${project.participantCount} 较多，但人均投入仅 ${formatNumber(project.averageHoursPerPerson)}h。`,
      );
      advice.push('检查是否存在多人浅介入导致协作成本抬升，应收敛角色边界。');
      score += 1;
    }

    if (project.trendSlope >= analysisConfig.thresholds.projectHighTrendSlope) {
      evidence.push(`工时趋势斜率 ${formatNumber(project.trendSlope)}，近期投入抬升明显。`);
      advice.push('结合里程碑或风险点确认是正常冲刺还是返工前兆。');
      score += 2;
    }

    if (project.topicDiversity >= analysisConfig.thresholds.projectHighTopicDiversity) {
      evidence.push(`主题复杂度 ${project.topicDiversity}，同一项目同时覆盖较多工作类型。`);
      advice.push('将设计、开发、联调、文档拆成清晰工作包，减少同周期混跑。');
      score += 1;
    }

    const feedbackRows = dataset.connectors.feedback.filter(
      (item) =>
        item.projectName === project.projectName &&
        dateInRange(item.date, filters.startDate, filters.endDate),
    );
    if (feedbackRows.length) {
      const avgScore = average(feedbackRows.map((item) => item.score));
      if (avgScore < analysisConfig.thresholds.lowFeedbackScore) {
        evidence.push(`反馈 mock 平均评分 ${formatNumber(avgScore)}，需关注投入与用户结果错位。`);
        advice.push('优先把工时投向稳定性和体验问题，而不是继续摊薄在低优先事项。');
        score += 1;
      }
    }

    if (score >= analysisConfig.thresholds.projectIssueScoreThreshold) {
      issues.push({
        id: `project-${project.projectName}`,
        title: '项目投入风险',
        severity:
          score >= analysisConfig.thresholds.projectHighSeverityScore ? 'high' : 'medium',
        scope: 'project',
        subject: project.projectName,
        subjectMasked: project.projectName,
        subjectReal: project.projectName,
        summary: `${project.projectName} 当前同时出现投入波动、复杂度或协作扩散信号。`,
        evidence,
        recommendations: Array.from(new Set(advice)),
        score,
      });
    }
  });

  if (qualityFlags.some((flag) => flag.severity === 'high')) {
    issues.push({
      id: 'dataset-quality',
      title: '数据质量限制',
      severity: 'high',
      scope: 'dataset',
      subject: '当前样本',
      subjectMasked: '当前样本',
      subjectReal: '当前样本',
      summary: '数据覆盖时间较短且核验字段缺失，智能体结论只能用于观察和复盘，不可直接用于绩效决策。',
      evidence: [
        `样本时间仅 ${globalMetrics.sampleDays} 天。`,
        `高风险质量提醒 ${qualityFlags.filter((flag) => flag.severity === 'high').length} 条。`,
        `核验缺口与未分类任务会放大偏差。`,
      ],
      recommendations: [
        '至少累计 8 到 12 周数据后再启用正式趋势判断。',
        '补齐核验数据和跨系统映射，再做人员或项目比较。',
      ],
      score: 5,
    });
  }

  issues.sort((left, right) => right.score - left.score);

  const overloadedPeople = employeeStats.filter(
    (employee) =>
      employee.totalHours > avgHours * analysisConfig.thresholds.employeeOverloadHoursMultiplier,
  ).length;
  const fragmentedDays = employeeDays.filter(
    (day) => day.taskCount > avgFragmentation || day.projectCount > 1,
  ).length;
  const activeProjects = projectStats.filter((project) => project.totalHours > 0).length;

  recommendations.push(
    {
      title: '先处理高切换成员',
      priority: 'P1',
      rationale: '员工同时跨多个项目会直接放大沟通与上下文恢复成本。',
      actions: [
        `优先梳理 ${overloadedPeople} 名高负载成员的任务归属和插单来源。`,
        '将高切换任务合并为半天或一天的固定时间块。',
      ],
    },
    {
      title: '重排高复杂度项目节奏',
      priority: 'P2',
      rationale: '主题复杂度高但人均投入低的项目，容易形成多人浅参与。',
      actions: [
        `对当前 ${activeProjects} 个活跃项目进行主次排序，限制同周期并发数。`,
        '为重点项目设立单一责任人和固定评审窗口。',
      ],
    },
    {
      title: '把 AI 使用从“调用量”转向“问题质量”',
      priority: 'P2',
      rationale: '频繁但浅层的 AI 调用很容易变成碎片化劳动放大器。',
      actions: [
        '记录脱敏后的主题、深度分数和采纳结果，不直接看原文。',
        '针对低深度高调用成员做提示词模板和任务拆解训练。',
      ],
    },
  );

  const llmPrompt = [
    '你是软件研发效能分析助手，请根据以下结构化信息输出异常报告和优化建议。',
    `样本范围：${filters.startDate} 到 ${filters.endDate}。`,
    `全局指标：总工时 ${formatNumber(globalMetrics.totalHours)}，活跃员工 ${globalMetrics.activeEmployees}，异常负载日占比 ${formatPercent(globalMetrics.anomalyDayRate)}。`,
    `主要异常：${issues
      .slice(0, analysisConfig.displayLimits.llmIssuePreview)
      .map((issue) => `${issue.subject} - ${issue.summary}`)
      .join('；')}`,
    `质量限制：${qualityFlags
      .slice(0, analysisConfig.displayLimits.llmQualityPreview)
      .map((flag) => flag.message)
      .join('；')}`,
    `任务主题 Top：${tasks
      .slice(0, analysisConfig.displayLimits.llmTaskPreview)
      .map((task) => `${task.projectName}/${task.topicLabel}/${task.reportHour}h`)
      .join('；')}`,
    '请输出：1. 异常综述 2. 员工侧风险 3. 项目侧风险 4. 下周优化建议 5. 需要补采的数据。',
  ].join('\n');

  const summary =
    issues.length > 0
      ? `智能体识别出 ${issues.length} 个重点风险，其中优先级最高的是${issues
          .slice(0, 2)
          .map((issue) => `“${issue.subject}”`)
          .join('和')}。当前主要问题集中在多项目切换、局部过载、项目复杂度偏高与样本核验缺口。`
      : '当前筛选范围内未发现显著异常，样本更接近稳态分布，但仍需关注数据质量和时间跨度不足。';

  return {
    mode: 'local_rules',
    generatedAt: new Date().toISOString(),
    summary,
    issues,
    recommendations,
    llmPrompt,
  };
}

export function buildAnalyticsView(dataset: BaseDataset, filters: Filters): AnalyticsView {
  const filteredTasksBySelectors = dataset.tasks.filter((task) => {
    const matchesDate = dateInRange(task.date, filters.startDate, filters.endDate);
    const matchesEmployee = !filters.employeeId || task.employeeId === filters.employeeId;
    const matchesProject = !filters.projectName || task.projectName === filters.projectName;
    const matchesTopic = !filters.topicLabel || task.topicLabel === filters.topicLabel;
    return matchesDate && matchesEmployee && matchesProject && matchesTopic;
  });

  let employeeDays = aggregateEmployeeDays(filteredTasksBySelectors, dataset);

  const allowedDayKeys = new Set(
    employeeDays.map((day) => `${day.employeeId}:${day.date}`),
  );
  const tasks = filteredTasksBySelectors.filter((task) =>
    allowedDayKeys.has(`${task.employeeId}:${task.date}`),
  );
  const taskTopics = dataset.taskTopics.filter((topic) =>
    tasks.some((task) => task.taskId === topic.taskId),
  );
  const employees = dataset.employees.filter((employee) =>
    employeeDays.some((day) => day.employeeId === employee.employeeId),
  );
  const qualityFlags = filterQualityFlags(dataset.qualityFlags, employeeDays, tasks);
  const globalMetrics = computeGlobalMetrics(dataset, employeeDays, tasks);
  const employeeStats = computeEmployeeStats(dataset, employeeDays, tasks);
  const projectStats = computeProjectStats(tasks);
  const topicStats = computeTopicStats(tasks);
  const correlations = computeCorrelations(employeeDays);
  const qualitySummary = summarizeQuality(qualityFlags);
  const dataHealth = buildDataHealthSummary(tasks, qualityFlags, globalMetrics);
  const agentReport = buildAgentReport(
    dataset,
    filters,
    globalMetrics,
    employeeStats,
    projectStats,
    employeeDays,
    tasks,
    qualityFlags,
  );
  const reportBlocks = buildReportBlocks(
    dataset,
    globalMetrics,
    projectStats,
    employeeStats,
    qualityFlags,
    agentReport,
  );

  return {
    employees,
    employeeDays,
    tasks,
    taskTopics,
    qualityFlags,
    globalMetrics,
    employeeStats,
    projectStats,
    topicStats,
    correlations,
    reportBlocks,
    qualitySummary,
    dataHealth,
    uniqueDates: unique(employeeDays.map((day) => day.date)).sort(),
    projectNames: unique(tasks.map((task) => task.projectName)),
    agentReport,
  };
}
