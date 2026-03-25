import { useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { DataSourceBoundaryBanner } from '../components/DataSourceBoundaryBanner';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { analysisConfig } from '../config/analysisConfig';
import { formatNumber, formatPercent } from '../lib/format';
import { getProjectReworkShareMetric } from '../lib/metrics';
import { buildOvertimeRecords } from '../lib/overtime';
import { isReworkTask } from '../lib/taskSignals';
import type { AnalyticsView } from '../types';

interface ReportPageProps {
  view: AnalyticsView;
}

export function ReportPage({ view }: ReportPageProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const sampleDateRange = `${view.uniqueDates[0] ?? '暂无'} 至 ${view.uniqueDates[view.uniqueDates.length - 1] ?? '暂无'}`;
  const sampleHint =
    view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays
      ? `仅 ${view.dataHealth.sampleDays} 天样本，结论偏向观察性`
      : `当前样本 ${view.dataHealth.sampleDays} 天，可用于观察趋势`;
  const overtimeRecords = buildOvertimeRecords(view.employeeDays, 'bigSmallWeek');
  const highLoadEmployees = [...view.employeeStats]
    .map((employee) => {
      const days = view.employeeDays.filter((day) => day.employeeId === employee.employeeId);
      const employeeOvertime = overtimeRecords.filter((record) => record.employeeId === employee.employeeId);
      return {
        ...employee,
        overtimeHours: employeeOvertime.reduce((sum, record) => sum + record.overtimeHours, 0),
        overloadedDayCount: days.filter(
          (day) => day.reportHour >= analysisConfig.thresholds.standardDailyHours,
        ).length,
      };
    })
    .sort((left, right) => {
      const leftScore =
        left.totalHours + left.overtimeHours * 1.4 + left.anomalyDayCount * 12 + left.multiProjectRate * 40;
      const rightScore =
        right.totalHours + right.overtimeHours * 1.4 + right.anomalyDayCount * 12 + right.multiProjectRate * 40;
      return rightScore - leftScore;
    })
    .slice(0, 5);
  const highRiskProjects = [...view.projectStats]
    .map((project) => {
      const projectTasks = view.tasks.filter((task) => task.projectName === project.projectName);
      const reworkHours = projectTasks
        .filter((task) => isReworkTask(task))
        .reduce((sum, task) => sum + task.reportHour, 0);
      const reworkShare = getProjectReworkShareMetric({
        totalHours: project.totalHours,
        reworkHours,
      }).value;
      return {
        ...project,
        reworkHours,
        reworkShare,
        issueCount: view.agentReport.issues.filter(
          (issue) => issue.scope === 'project' && issue.subjectReal === project.projectName,
        ).length,
      };
    })
    .sort((left, right) => {
      const leftScore =
        left.totalHours * 0.35 +
        left.reworkShare * 100 * 0.45 +
        left.issueCount * 10 +
        Math.max(left.trendSlope, 0) * 6;
      const rightScore =
        right.totalHours * 0.35 +
        right.reworkShare * 100 * 0.45 +
        right.issueCount * 10 +
        Math.max(right.trendSlope, 0) * 6;
      return rightScore - leftScore;
    })
    .slice(0, 5);
  const topIssue = view.agentReport.issues[0];
  const highestLoadEmployee = highLoadEmployees[0];
  const highestRiskProject = highRiskProjects[0];
  const qualityHighlights = [
    `当前数据健康分为 ${view.dataHealth.score}，状态为 ${
      view.dataHealth.status === 'healthy' ? '健康' : view.dataHealth.status === 'watch' ? '观察' : '风险'
    }。`,
    `当前样本覆盖 ${sampleDateRange}，共 ${view.dataHealth.sampleDays} 天，${sampleHint}。`,
    `核验覆盖率 ${formatPercent(view.dataHealth.coverageRate)}，未分类任务占比 ${formatPercent(
      view.dataHealth.uncategorizedRate,
    )}，高风险提醒占比 ${formatPercent(view.dataHealth.highSeverityRate)}。`,
    `当前共有 ${view.qualitySummary.total} 条质量提醒，其中高风险 ${view.qualitySummary.high} 条，中风险 ${view.qualitySummary.medium} 条。`,
  ];
  const coreFindings = [
    topIssue
      ? `${topIssue.subjectReal} 是当前最值得优先复盘的对象，主要因为“${topIssue.title}”，当前得分 ${formatNumber(
          topIssue.score,
          1,
        )}。`
      : null,
    highestRiskProject
      ? `${highestRiskProject.projectName} 当前更值得优先复盘，总工时 ${formatNumber(
          highestRiskProject.totalHours,
        )} h，返工占比 ${formatPercent(highestRiskProject.reworkShare)}。`
      : null,
    highestLoadEmployee
      ? `${highestLoadEmployee.name} 是当前最重负载员工，总工时 ${formatNumber(
          highestLoadEmployee.totalHours,
        )} h，异常日 ${highestLoadEmployee.anomalyDayCount} 天，多项目率 ${formatPercent(
          highestLoadEmployee.multiProjectRate,
        )}。`
      : null,
    view.reportBlocks[0]?.body ?? null,
    `当前报告以真实工时和规则推导为主，${
      analysisConfig.ruleToggles.showMockCharts
        ? 'Git、AI、用户反馈仍属于模拟来源，只能作为扩展方向。'
        : '当前未纳入模拟协同数据。'
    }`,
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);

  const handleExport = async () => {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, {
      backgroundColor: '#f3f5f8',
      scale: 2,
    });
    const imageData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = (canvas.height * pageWidth) / canvas.width;
    pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight);
    pdf.save('workhour-report.pdf');
  };

  return (
    <div className="page-grid report-page">
      <div className="report-toolbar">
        <div>
          <p className="toolbar-kicker">Export-ready</p>
          <h3>面向老板的五段式报告</h3>
        </div>
        <button className="primary-button" onClick={handleExport} type="button">
          导出 PDF
        </button>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="样本总工时"
          value={`${formatNumber(view.globalMetrics.totalHours)} h`}
          hint="当前筛选后的投入体量"
        />
        <MetricCard
          label="异常员工日占比"
          value={formatPercent(view.globalMetrics.anomalyDayRate)}
          hint="高工时、高碎片或核验缺口的叠加情况"
        />
        <MetricCard
          label="数据覆盖率"
          value={formatPercent(view.globalMetrics.coverageRate)}
          hint={sampleHint}
        />
        <MetricCard
          label="智能体异常数"
          value={`${view.agentReport.issues.length}`}
          hint="来自本地规则推理的异常和建议"
        />
      </div>

      <div className="report-sheet" ref={exportRef}>
        <DataSourceBoundaryBanner
          className="panel-wide"
          compact
          realSources={['工时原始数据', '任务明细', '核验状态', '规则推导指标']}
          mockSources={
            analysisConfig.ruleToggles.showMockCharts ? ['Git', 'AI 使用', '用户反馈'] : []
          }
        />
        <Panel
          title="管理摘要"
          subtitle="这份报告更适合老板先看什么"
          note="这一页优先提供可读文字和治理对象，不要求先理解全部图表。"
        >
          <div className="chart-meta">
            <MetaPill tone="derived">管理摘要</MetaPill>
            <span>样本区间：{sampleDateRange}</span>
            <span>样本天数：{view.dataHealth.sampleDays}</span>
            <span>当前优先级：结构复盘 & 资源调度</span>
          </div>
          <ul className="report-list">
            {coreFindings.map((finding, index) => (
              <li key={`${index + 1}-${finding}`}>{finding}</li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="本期核心发现"
          subtitle="3 到 5 条能直接带去汇报的结论"
          note="下面这些结论默认跟随当前筛选条件变化。"
        >
          <ol className="report-list report-list-numbered">
            {coreFindings.map((finding, index) => (
              <li key={`finding-${index + 1}`}>{finding}</li>
            ))}
          </ol>
        </Panel>
        <Panel
          title="高风险项目清单"
          subtitle="更适合优先安排项目复盘的对象"
          note="综合总工时、返工占比、趋势和当前异常项数量排序。"
        >
          <ol className="report-list report-list-numbered">
            {highRiskProjects.map((project) => (
              <li key={project.projectName}>
                {project.projectName}
                {`：总工时 ${formatNumber(project.totalHours)} h，返工占比 ${formatPercent(
                  project.reworkShare,
                )}，参与人数 ${project.participantCount}，当前异常项 ${project.issueCount} 个。`}
              </li>
            ))}
          </ol>
        </Panel>
        <Panel
          title="高负载员工清单"
          subtitle="仅作资源调度参考，不作绩效结论"
          note="综合总工时、加班小时、异常日和多项目率排序。"
        >
          <ol className="report-list report-list-numbered">
            {highLoadEmployees.map((employee) => (
              <li key={employee.employeeId}>
                {employee.name}
                {`：总工时 ${formatNumber(employee.totalHours)} h，估算加班 ${formatNumber(
                  employee.overtimeHours,
                )} h，异常日 ${employee.anomalyDayCount} 天，多项目率 ${formatPercent(
                  employee.multiProjectRate,
                )}。`}
              </li>
            ))}
          </ol>
          <p className="report-text">
            说明：这份清单仅用于资源调度、排班和流程复盘，不用于个人绩效排名或公开比较。
          </p>
        </Panel>
        <Panel
          title="数据质量说明"
          subtitle="这份报告的可信边界在哪里"
          note="先看质量，再决定结论能不能直接用于管理动作。"
        >
          <ul className="report-list">
            {qualityHighlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
        {view.reportBlocks.map((block) => (
          <Panel
            key={block.title}
            title="报告段落"
            subtitle={block.title}
            note="导出时会按当前筛选口径写入。"
          >
            <p className="report-text">{block.body}</p>
          </Panel>
        ))}
        <Panel
          title="重点对象"
          subtitle="当前筛选下的重点对象"
          note="按当前分析结果列出优先关注的员工或项目。"
        >
          <ul className="report-list">
            {view.agentReport.issues
              .slice(0, analysisConfig.displayLimits.reportIssueHighlights)
              .map((issue) => (
              <li key={issue.id}>
                {issue.subjectReal + '：' + issue.title}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="限制声明"
          subtitle="报告默认附带的谨慎说明"
          note="这是管理层必须看到的限制项。"
        >
          <ul className="report-list">
            <li>当前样本覆盖 {sampleDateRange}，共 {view.dataHealth.sampleDays} 天。</li>
            <li>
              核验覆盖率为 {formatPercent(view.globalMetrics.coverageRate)}，
              当前分析主要反映填报结构与任务切分。
            </li>
            <li>本版本不提供员工绩效评分，也不建议对个体做公开排名。</li>
            {analysisConfig.ruleToggles.showMockCharts ? (
              <li>Git、AI、用户反馈相关图表目前为接口和 mock 验证，不应视作真实业务结论。</li>
            ) : (
              <li>当前报告未纳入 Git、AI、用户反馈模拟图表，结论仅来自真实工时数据。</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
