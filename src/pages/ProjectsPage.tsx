import { ChartPanel } from '../components/ChartPanel';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { projectColor } from '../lib/chartColors';
import { formatNumber, formatPercent } from '../lib/format';
import { detectTaskStage, isReworkTask } from '../lib/taskSignals';
import {
  buildGranularityLabels,
  fillGroupedSeries,
  groupSeriesByGranularity,
  type TrendGranularity,
} from '../lib/timeSeries';
import type { AnalyticsView, DetailSelection, Filters } from '../types';

interface ProjectsPageProps {
  view: AnalyticsView;
  filters: Filters;
  onOpenDetail: (detail: DetailSelection) => void;
}

export function ProjectsPage({ view, filters, onOpenDetail }: ProjectsPageProps) {
  const trendGranularity: TrendGranularity =
    filters.periodMode === 'month' ? 'day' : 'month';
  const trendLabels = buildGranularityLabels(
    filters.startDate,
    filters.endDate,
    trendGranularity,
  );
  const topProjects = view.projectStats.slice(0, 8);
  const steepestProject = [...view.projectStats].sort(
    (left, right) => right.trendSlope - left.trendSlope,
  )[0];
  const widestProject = [...view.projectStats].sort(
    (left, right) => right.participantCount - left.participantCount,
  )[0];
  const topProject = topProjects[0];
  const projectReworkStats = view.projectStats.map((project) => {
    const tasks = view.tasks.filter((task) => task.projectName === project.projectName);
    const reworkHours = tasks
      .filter((task) => isReworkTask(task))
      .reduce((sum, task) => sum + task.reportHour, 0);
    const stageHours = new Map<string, number>();
    tasks.forEach((task) => {
      const stage = detectTaskStage(task);
      stageHours.set(stage, (stageHours.get(stage) ?? 0) + task.reportHour);
    });
    const dominantStage = [...stageHours.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '其他';
    const developmentHours = (stageHours.get('开发') ?? 0) + (stageHours.get('需求/设计') ?? 0);
    const maintenanceHours = (stageHours.get('维护/反馈') ?? 0) + reworkHours;
    return {
      ...project,
      reworkHours,
      reworkRate: project.totalHours ? reworkHours / project.totalHours : 0,
      dominantStage,
      developmentHours,
      maintenanceHours,
    };
  });
  const fixHeavyProjects = [...projectReworkStats]
    .filter(
      (project) =>
        project.totalHours >= 40 &&
        project.maintenanceHours > project.developmentHours * 1.2 &&
        project.reworkRate >= 0.25,
    )
    .sort(
      (left, right) =>
        right.maintenanceHours / Math.max(right.developmentHours, 1) -
        left.maintenanceHours / Math.max(left.developmentHours, 1),
    );
  const fixHeavySummary =
    fixHeavyProjects.length > 0
      ? `${fixHeavyProjects
          .slice(0, 2)
          .map(
            (project) =>
              `${project.projectName}（修改/维护 ${formatNumber(project.maintenanceHours)}h，高于开发 ${formatNumber(project.developmentHours)}h）`,
          )
          .join('、')} 更像“开发期短、修改期长”的项目。`
      : '当前未发现明显“开发期短、修改期长”的重点项目。';

  const groupedProjectSeries = topProjects.slice(0, 5).map((project) => ({
    projectName: project.projectName,
    points: groupSeriesByGranularity(
      view.uniqueDates.map((date) => ({
        date,
        value: view.tasks
          .filter((task) => task.projectName === project.projectName && task.date === date)
          .reduce((sum, task) => sum + task.reportHour, 0),
      })),
      trendGranularity,
    ),
  }));

  const barOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: topProjects.map((item) => item.projectName) },
    series: [
      {
        type: 'bar',
        data: topProjects.map((item) => item.totalHours),
        itemStyle: { color: '#2a9d8f', borderRadius: 10 },
      },
    ],
  };

  const trendOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 24, right: 20, top: 48, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: trendLabels,
    },
    yAxis: { type: 'value' },
    series: topProjects.slice(0, 5).map((project, index) => ({
      name: project.projectName,
      type: 'line',
      smooth: true,
      data: fillGroupedSeries(
        trendLabels,
        groupedProjectSeries.find((item) => item.projectName === project.projectName)?.points ?? [],
      ).map((item) => item.value),
      color: projectColor(index),
    })),
  };

  const bubbleOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const projectName = String(value[3] ?? '');
        const project = view.projectStats.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        return [
          `<strong>${project.projectName}</strong>`,
          `参与人数：${project.participantCount}`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `主题复杂度：${project.topicDiversity}`,
          `人均投入：${formatNumber(project.averageHoursPerPerson)} h`,
          `主导主题：${project.primaryTopic}`,
        ].join('<br/>');
      },
    },
    xAxis: { type: 'value', name: '参与人数' },
    yAxis: { type: 'value', name: '总工时' },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => 16 + value[2] * 5,
        data: view.projectStats.map((project) => [
          project.participantCount,
          project.totalHours,
          project.topicDiversity,
          project.projectName,
        ]),
      },
    ],
  };

  const quadrantOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { value?: Array<string | number> }) => {
        const value = params.value ?? [];
        const projectName = String(value[3] ?? '');
        const project = projectReworkStats.find((item) => item.projectName === projectName);
        if (!project) return projectName;
        return [
          `<strong>${project.projectName}</strong>`,
          `总工时：${formatNumber(project.totalHours)} h`,
          `返工类工时占比：${formatPercent(project.reworkRate)}`,
          `返工类工时：${formatNumber(project.reworkHours)} h`,
          `参与人数：${project.participantCount}`,
          `主阶段：${project.dominantStage}`,
        ].join('<br/>');
      },
    },
    xAxis: { type: 'value', name: '总工时' },
    yAxis: {
      type: 'value',
      name: '返工类工时占比',
      axisLabel: { formatter: '{value}%' },
      max: 100,
    },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: number[]) => 16 + Number(value[2] ?? 0) * 3,
        data: projectReworkStats.map((project) => [
          Number(project.totalHours.toFixed(1)),
          Number((project.reworkRate * 100).toFixed(1)),
          project.participantCount,
          project.projectName,
        ]),
        itemStyle: { color: '#ef4444', opacity: 0.84 },
      },
    ],
  };

  return (
    <div className="page-grid">
      <Panel
        title="项目洞察"
        subtitle="先看重点项目，再点开项目纵览"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>趋势斜率：按日工时线性回归斜率</span>
            <span>参与人数：观察期内至少有 1 条任务的员工数</span>
            <span>人均投入：总工时 / 参与人数</span>
          </div>
        }
      >
        <div className="insight-grid">
          <div className="insight-card">
            <strong>当前投入最高</strong>
            <p>
              {topProject
                ? `${topProject.projectName} 是当前投入最高的项目，总工时 ${formatNumber(topProject.totalHours)}h。`
                : '当前没有可解释的项目样本。'}
            </p>
          </div>
          <div className="insight-card">
            <strong>变化最快</strong>
            <p>
              {steepestProject
                ? `${steepestProject.projectName} 的趋势斜率最高，为 ${steepestProject.trendSlope.toFixed(2)}。`
                : '当前没有可解释的项目趋势样本。'}
            </p>
          </div>
          <div className="insight-card">
            <strong>修改期偏长</strong>
            <p>
              {fixHeavySummary}
            </p>
          </div>
        </div>
      </Panel>

      <ChartPanel
        title="项目投入规模"
        subtitle="哪些项目吸收了最多工时"
        note={`这张图先回答“资源去哪了”。当前头部项目是 ${topProject?.projectName ?? '暂无'}。`}
        option={barOption}
        source="real"
        method="按项目聚合总工时"
        reliability="高"
        caution="工时高只说明投入高，不代表交付质量或业务结果更好"
        onChartClick={(params) =>
          onOpenDetail({
            kind: 'project',
            title: '项目聚焦分析',
            subtitle: String(params.name ?? ''),
            projectName: String(params.name ?? ''),
            rows: [],
          })
        }
      />

      <ChartPanel
        title="趋势对比"
        subtitle="重点项目是否出现投入波动"
        note={`这张图看“变化”。当前按${trendGranularity === 'day' ? '日' : '月'}聚合，优先看抬升最快和回落最快的项目。`}
        option={trendOption}
        source="real"
        method={`按项目和${trendGranularity === 'day' ? '日' : '月'}聚合的趋势折线`}
        reliability={view.dataHealth.sampleDays < 14 ? '中低，短样本敏感' : '中'}
        caution="趋势斜率适合看投入方向，不适合直接评价项目成败"
        badge={trendGranularity === 'day' ? '日' : '月'}
      />

      <ChartPanel
        title="项目气泡图"
        subtitle="参与人数、总工时、主题复杂度联动"
        note={`这张图看“谁更复杂”。${widestProject ? `${widestProject.projectName} 当前参与人数最多。` : ''}`}
        option={bubbleOption}
        source="derived"
        method="参与人数 + 总工时 + 主题复杂度联动"
        reliability="中"
        caution="参与人数高不自动代表协同效率高，应和人均投入一起解读"
        onChartClick={(params) =>
          onOpenDetail({
            kind: 'project',
            title: '项目聚焦分析',
            subtitle: String((params.value as Array<string | number>)?.[3] ?? ''),
            projectName: String((params.value as Array<string | number>)?.[3] ?? ''),
            rows: [],
          })
        }
      />

      <ChartPanel
        title="项目返工四象限"
        subtitle="总工时高且返工占比高的项目更值得优先复盘"
        note={`${fixHeavyProjects[0] ? `${fixHeavyProjects[0].projectName} 当前最接近“开发短、修改长”的模式。` : '纵轴越高，说明修改、bug、调整、客户反馈类工时占比越高。'}`}
        option={quadrantOption}
        source="derived"
        method="总工时 + 返工类关键词占比 + 项目参与人数"
        reliability="中"
        caution="返工类识别来自任务文本规则，适合快速发现线索"
        onChartClick={(params) =>
          onOpenDetail({
            kind: 'project',
            title: '项目聚焦分析',
            subtitle: String((params.value as Array<string | number>)?.[3] ?? ''),
            projectName: String((params.value as Array<string | number>)?.[3] ?? ''),
            rows: [],
          })
        }
      />

      <Panel
        title="使用建议"
        subtitle="项目页只做定位，不做明细核查"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="real">真实工时</MetaPill>
            <span>项目详情请直接点击图表进入项目纵览</span>
          </div>
        }
      >
        <div className="callout">
          <strong>建议先从“项目投入规模”和“项目气泡图”两张图开始点开项目。</strong>
          <span>项目页回答的是组合结构和复杂度，单个项目的趋势、成员构成和任务主题请在项目弹窗里看。</span>
        </div>
      </Panel>
    </div>
  );
}
