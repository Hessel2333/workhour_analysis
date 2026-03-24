import { ChartPanel } from '../components/ChartPanel';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { formatNumber } from '../lib/format';
import type { BaseDataset, Filters } from '../types';

interface CorrelationPageProps {
  dataset: BaseDataset;
  view: import('../types').AnalyticsView;
  filters: Filters;
}

function quartiles(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return [0, 0, 0, 0, 0];
  const pick = (ratio: number) => sorted[Math.floor((sorted.length - 1) * ratio)];
  return [sorted[0], pick(0.25), pick(0.5), pick(0.75), sorted[sorted.length - 1]];
}

export function CorrelationPage({
  dataset,
  view,
  filters,
}: CorrelationPageProps) {
  const labels = Array.from(new Set(view.correlations.map((item) => item.x)));
  const heatmapOption = {
    tooltip: {
      formatter: (params: { value: [number, number, number] }) =>
        `${labels[params.value[0]]} / ${labels[params.value[1]]}: ${params.value[2].toFixed(2)}`,
    },
    grid: { left: 56, right: 24, top: 24, bottom: 40 },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'category', data: labels },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
    },
    series: [
      {
        type: 'heatmap',
        data: view.correlations.map((item) => [
          labels.indexOf(item.x),
          labels.indexOf(item.y),
          Number(item.value.toFixed(2)),
        ]),
      },
    ],
  };

  const scatterOption = {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '工时' },
    yAxis: { type: 'value', name: '任务数' },
    series: [
      {
        type: 'scatter',
        data: view.employeeDays.map((day) => [day.reportHour, day.taskCount, day.projectCount]),
        symbolSize: (value: number[]) => 14 + value[2] * 6,
      },
    ],
  };

  const employeeBox = quartiles(view.employeeStats.map((item) => item.totalHours));
  const projectBox = quartiles(view.projectStats.map((item) => item.totalHours));
  const boxplotOption = {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', data: ['员工总工时', '项目总工时'] },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'boxplot',
        data: [employeeBox, projectBox],
      },
    ],
  };

  const gitByProject = Array.from(
    dataset.connectors.git.reduce((map, item) => {
      if (filters.projectName && item.projectName !== filters.projectName) return map;
      map.set(item.projectName, (map.get(item.projectName) ?? 0) + item.commitCount);
      return map;
    }, new Map<string, number>()),
  );

  const aiByDate = Array.from(
    dataset.connectors.ai.reduce((map, item) => {
      if (item.date < filters.startDate || item.date > filters.endDate) return map;
      map.set(item.date, (map.get(item.date) ?? 0) + item.callCount);
      return map;
    }, new Map<string, number>()),
  ).sort((left, right) => left[0].localeCompare(right[0]));

  const feedbackByProject = Array.from(
    dataset.connectors.feedback.reduce((map, item) => {
      if (filters.projectName && item.projectName !== filters.projectName) return map;
      const current = map.get(item.projectName) ?? { score: 0, count: 0 };
      current.score += item.score;
      current.count += 1;
      map.set(item.projectName, current);
      return map;
    }, new Map<string, { score: number; count: number }>()),
  );

  const gitOption = {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '项目工时' },
    yAxis: { type: 'value', name: 'Commit 数' },
    series: [
      {
        type: 'scatter',
        data: view.projectStats
          .map((project) => [
            project.totalHours,
            gitByProject.find(([name]) => name === project.projectName)?.[1] ?? 0,
            project.projectName,
          ])
          .filter((item) => item[1] !== 0),
        symbolSize: 18,
      },
    ],
  };

  const aiOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: aiByDate.map(([date]) => date) },
    yAxis: { type: 'value' },
    series: [{ type: 'line', smooth: true, data: aiByDate.map(([, count]) => count) }],
  };

  const feedbackOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 24, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: feedbackByProject.map(([projectName]) => projectName) },
    yAxis: { type: 'value', min: 0, max: 5 },
    series: [
      {
        type: 'bar',
        data: feedbackByProject.map(([, value]) => value.score / value.count),
        itemStyle: { color: '#34c759', borderRadius: 10 },
      },
    ],
  };

  return (
    <div className="page-grid">
      {view.dataHealth.sampleDays < 14 ? (
        <Panel
          title="低样本模式"
          subtitle="相关性页当前处于谨慎解释状态"
          note="相关性更适合做候选关系发现，不应直接当作因果或绩效解释。"
          className="panel-wide panel-strip"
          meta={
            <div className="chart-meta">
              <MetaPill tone="warning">低样本模式</MetaPill>
              <span>当前样本天数：{view.dataHealth.sampleDays}</span>
              <span>未做显著性检验</span>
              <span>建议结合质量页共同阅读</span>
            </div>
          }
        >
          <div className="callout">
            <strong>推荐用法：筛出值得继续验证的变量关系。</strong>
            <span>不建议把颜色深浅直接解释成效率结论。</span>
          </div>
        </Panel>
      ) : null}

      <div className="metrics-grid">
        <MetricCard
          label="Git mock"
          value={`${dataset.connectors.git.length}`}
          hint="已生成 commit / PR 协同示意数据"
          tone="mock"
        />
        <MetricCard
          label="AI mock"
          value={`${dataset.connectors.ai.length}`}
          hint="默认仅保留脱敏主题和使用深度"
          tone="mock"
        />
        <MetricCard
          label="反馈 mock"
          value={`${dataset.connectors.feedback.length}`}
          hint="用于项目工时与满意度趋势联动"
          tone="mock"
        />
        <MetricCard
          label="相关性可信度"
          value={view.dataHealth.sampleDays < 14 ? '偏低' : '中等'}
          hint="当前相关性未提供显著性检验，只能用于发现候选关系"
          tone="warning"
        />
      </div>

      <ChartPanel
        title="相关性热力图"
        subtitle="工时、任务数、项目数和异常分数如何联动"
        note="这张图回答：当前样本里哪些变量同步变化。相关性不等于因果。"
        option={heatmapOption}
        source="derived"
        method="皮尔逊相关，按员工日聚合"
        reliability={view.dataHealth.sampleDays < 14 ? '低，样本偏短' : '中'}
        caution="未做显著性检验，不可当作因果结论"
      />

      <ChartPanel
        title="工时 vs 任务数"
        subtitle="更高工时是否伴随更高碎片化"
        note="气泡大小表示项目数，用于观察工时增长是否来自多项目切换。"
        option={scatterOption}
        source="derived"
        method="员工日级散点观察"
        reliability="中"
        caution="异常点可能来自填报粒度差异，而非真实低效"
      />

      <ChartPanel
        title="箱线图"
        subtitle="员工和项目的工时分布是否偏斜"
        note="这张图回答：当前工时分布是否有明显离群值。"
        option={boxplotOption}
        source="derived"
        method="四分位统计"
        reliability="中"
        caution="样本过短时更适合找离群值，不适合判断稳定分布"
      />

      <Panel
        title="协同分析预留位"
        subtitle="V1 用 mock 数据验证图面和接口"
        note="真实 Git、AI、用户反馈接入后，这些图将直接消费统一 connector 数据结构。"
        meta={
          <div className="chart-meta">
            <MetaPill tone="mock">示意数据</MetaPill>
            <span>方法：mock connector</span>
            <span>注意：仅用于界面验证</span>
          </div>
        }
      >
        <div className="connector-grid">
          <ChartPanel
            title="Git 协同"
            subtitle="工时 vs Commit 数"
            note="当前图面使用 mock connector 数据，仅用于验证协同分析界面。真实接入后可替换为工时 vs PR、工时 vs churn 等指标。"
            option={gitOption}
            height={260}
            badge="示意数据"
            source="mock"
            method="模拟 Git 聚合"
            reliability="低，仅示意"
            caution="当前不代表真实提交表现"
          />
          <ChartPanel
            title="AI 使用"
            subtitle="脱敏后的调用次数趋势"
            note="当前图面使用 mock connector 数据，仅用于验证 AI 使用分析布局。默认不展示原始对话，只展示 token、调用次数和深度分数。"
            option={aiOption}
            height={260}
            badge="示意数据"
            source="mock"
            method="模拟 AI 使用时序"
            reliability="低，仅示意"
            caution="当前不代表真实 AI 使用强度"
          />
          <ChartPanel
            title="用户反馈"
            subtitle="项目满意度示意"
            note="当前图面使用 mock connector 数据，仅用于验证项目反馈联动。真实项目反馈接入后可叠加双轴图和滞后相关。"
            option={feedbackOption}
            height={260}
            badge="示意数据"
            source="mock"
            method="模拟反馈评分聚合"
            reliability="低，仅示意"
            caution="当前不代表真实客户满意度"
          />
        </div>
      </Panel>
    </div>
  );
}
