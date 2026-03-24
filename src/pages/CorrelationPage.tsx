import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { MetricCard } from '../components/MetricCard';
import { MetaPill } from '../components/MetaPill';
import { Panel } from '../components/Panel';
import { formatNumber, formatPercent } from '../lib/format';
import type { BaseDataset, CorrelationCell, Filters } from '../types';

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

function correlationStrengthLabel(value: number) {
  const absolute = Math.abs(value);
  if (absolute < 0.2) return '很弱';
  if (absolute < 0.4) return '较弱';
  if (absolute < 0.6) return '中等';
  if (absolute < 0.8) return '明显';
  return '强';
}

function getCorrelationValue(cells: CorrelationCell[], x: string, y: string) {
  return cells.find((item) => item.x === x && item.y === y)?.value ?? 0;
}

function getTopPairs(cells: CorrelationCell[]) {
  const seen = new Set<string>();
  return cells
    .filter((item) => item.x !== item.y)
    .filter((item) => {
      const key = [item.x, item.y].sort().join('::');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 5);
}

function countUpperOutliers(values: number[]) {
  if (values.length < 4) return 0;
  const [, q1, , q3] = quartiles(values);
  const fence = q3 + (q3 - q1) * 1.5;
  return values.filter((value) => value > fence).length;
}

export function CorrelationPage({
  dataset,
  view,
  filters,
}: CorrelationPageProps) {
  const labels = Array.from(new Set(view.correlations.map((item) => item.x)));
  const topPairs = getTopPairs(view.correlations);
  const strongestPair = topPairs[0];
  const multiProjectShare = view.employeeDays.length
    ? view.employeeDays.filter((day) => day.projectCount > 1).length / view.employeeDays.length
    : 0;
  const employeeOutlierCount = countUpperOutliers(
    view.employeeStats.map((item) => item.totalHours),
  );
  const projectOutlierCount = countUpperOutliers(
    view.projectStats.map((item) => item.totalHours),
  );
  const tasksCorrelation = getCorrelationValue(view.correlations, '工时', '任务数');
  const projectsCorrelation = getCorrelationValue(view.correlations, '工时', '项目数');
  const topPairSummary = strongestPair
    ? `${strongestPair.x}与${strongestPair.y}呈${correlationStrengthLabel(strongestPair.value)}${
        strongestPair.value >= 0 ? '正' : '负'
      }相关（r=${formatNumber(strongestPair.value, 2)}）`
    : '当前样本不足以形成稳定的候选关系';

  const loadDriverSummary =
    Math.abs(tasksCorrelation - projectsCorrelation) < 0.12
      ? '工时升高同时伴随任务数和项目数增加，说明负载与切换摩擦可能一起出现。'
      : Math.abs(tasksCorrelation) > Math.abs(projectsCorrelation)
        ? '工时升高更常伴随任务数增加，先关注任务拆分粒度和当日任务堆叠。'
        : '工时升高更常伴随跨项目切换，先关注上下文切换和插单干扰。';

  const outlierSummary =
    employeeOutlierCount || projectOutlierCount
      ? `当前发现 ${employeeOutlierCount} 个员工样本离群、${projectOutlierCount} 个项目样本离群，更适合先做个案复盘。`
      : '当前没有特别突出的工时离群项，更适合先看整体结构关系。';

  const heatmapOption = {
    tooltip: {
      formatter: (params: { value: [number, number, number] }) =>
        `${labels[params.value[0]]} / ${labels[params.value[1]]}<br/>相关系数 r = ${params.value[2].toFixed(2)}`,
    },
    grid: { left: 76, right: 28, top: 16, bottom: 56 },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'category', data: labels },
    visualMap: {
      min: -1,
      max: 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 8,
      text: ['更强正相关', '更强负相关'],
      calculable: false,
    },
    series: [
      {
        type: 'heatmap',
        data: view.correlations.map((item) => [
          labels.indexOf(item.x),
          labels.indexOf(item.y),
          Number(item.value.toFixed(2)),
        ]),
        label: {
          show: true,
          color: '#1d1d1f',
          fontSize: 11,
          formatter: ({ value }: { value: [number, number, number] }) => value[2].toFixed(2),
        },
      },
    ],
  };

  const relationRankingOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const item = params[0];
        return `${item.name}<br/>相关系数 r = ${item.value.toFixed(2)}<br/>说明：当前只代表同步变化，不代表因果`;
      },
    },
    grid: { left: 112, right: 24, top: 12, bottom: 24 },
    xAxis: {
      type: 'value',
      min: -1,
      max: 1,
      splitNumber: 4,
      axisLabel: { formatter: (value: number) => value.toFixed(1) },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: topPairs.map((item) => `${item.x} × ${item.y}`),
    },
    series: [
      {
        type: 'bar',
        data: topPairs.map((item) => ({
          value: Number(item.value.toFixed(2)),
          itemStyle: {
            color: item.value >= 0 ? '#0071e3' : '#ff9f0a',
            borderRadius: 10,
          },
        })),
      },
    ],
  };

  const scatterOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        name?: string;
        value: [number, number, number];
        data: { employeeName: string; date: string; value: [number, number, number] };
      }) => {
        const [hours, taskCount, projectCount] = params.value;
        return [
          `${params.data.employeeName} · ${params.data.date}`,
          `单日工时：${hours.toFixed(1)}h`,
          `单日任务数：${taskCount}`,
          `涉及项目数：${projectCount}`,
        ].join('<br/>');
      },
    },
    grid: { left: 56, right: 18, top: 24, bottom: 48 },
    xAxis: { type: 'value', name: '单日工时' },
    yAxis: { type: 'value', name: '单日任务数' },
    series: [
      {
        type: 'scatter',
        data: view.employeeDays.map((day) => ({
          value: [day.reportHour, day.taskCount, day.projectCount],
          employeeName: day.employeeName,
          date: day.date,
        })),
        symbolSize: (value: number[]) => 12 + value[2] * 6,
        itemStyle: { color: '#0071e3', opacity: 0.8 },
        markLine: {
          symbol: 'none',
          lineStyle: { color: 'rgba(29,29,31,0.24)', type: 'dashed' },
          data: [{ type: 'average', xAxis: 0 }, { type: 'average', yAxis: 0 }],
        },
      },
    ],
  };

  const employeeBox = quartiles(view.employeeStats.map((item) => item.totalHours));
  const projectBox = quartiles(view.projectStats.map((item) => item.totalHours));
  const boxplotOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; data: number[] }) =>
        [
          params.name,
          `最小值：${params.data[0].toFixed(1)}h`,
          `Q1：${params.data[1].toFixed(1)}h`,
          `中位数：${params.data[2].toFixed(1)}h`,
          `Q3：${params.data[3].toFixed(1)}h`,
          `最大值：${params.data[4].toFixed(1)}h`,
        ].join('<br/>'),
    },
    grid: { left: 56, right: 20, top: 24, bottom: 40 },
    xAxis: { type: 'category', data: ['员工总工时', '项目总工时'] },
    yAxis: { type: 'value', name: '工时' },
    series: [
      {
        type: 'boxplot',
        itemStyle: { color: '#0071e3', borderColor: '#0071e3' },
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
        itemStyle: { color: '#0071e3' },
      },
    ],
  };

  const aiOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: aiByDate.map(([date]) => date) },
    yAxis: { type: 'value', name: '调用次数' },
    series: [
      {
        type: 'line',
        smooth: true,
        data: aiByDate.map(([, count]) => count),
        lineStyle: { width: 2, color: '#0071e3' },
        itemStyle: { color: '#0071e3' },
      },
    ],
  };

  const feedbackOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 32, right: 20, top: 20, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: feedbackByProject.map(([projectName]) => projectName) },
    yAxis: { type: 'value', min: 0, max: 5, name: '评分' },
    series: [
      {
        type: 'bar',
        data: feedbackByProject.map(([, value]) => value.score / value.count),
        itemStyle: { color: '#0071e3', borderRadius: 8 },
      },
    ],
  };

  return (
    <div className="page-grid">
      <Panel
        title="相关性实验室"
        subtitle="先找值得追问的候选关系，再决定是否继续验证"
        note="参考 research 文档，这一页只负责发现结构摩擦和候选关系，不直接给出因果或绩效结论。"
        className="panel-wide panel-strip"
        meta={
          <div className="chart-meta">
            <MetaPill tone="derived">规则推导</MetaPill>
            <span>当前真实来源：工时员工日聚合</span>
            <span>方法：Pearson 线性相关</span>
            <span>正确用法：描述 → 候选关系 → 再验证</span>
          </div>
        }
      >
        <div className="lab-guide-grid">
          <div className="lab-guide-card">
            <strong>1. 先看候选关系排行</strong>
            <span>先确认哪些指标值得继续追问，不要先盯完整矩阵。</span>
          </div>
          <div className="lab-guide-card">
            <strong>2. 再看结构散点</strong>
            <span>判断工时升高更像来自任务堆叠，还是跨项目切换。</span>
          </div>
          <div className="lab-guide-card">
            <strong>3. 最后看分布离群</strong>
            <span>判断问题是少数离群个案，还是整体流程摩擦。</span>
          </div>
        </div>
      </Panel>

      {view.dataHealth.sampleDays < 14 ? (
        <Panel
          title="样本限制"
          subtitle="当前处于低样本模式，结论只能作为观察线索"
          note="research 文档建议相关性矩阵同时展示样本量与显著性。当前样本仅适合发现候选关系，不适合给个体下判断。"
          className="panel-wide panel-strip"
          meta={
            <div className="chart-meta">
              <MetaPill tone="warning">低样本模式</MetaPill>
              <span>当前样本天数：{view.dataHealth.sampleDays}</span>
              <span>未做显著性检验</span>
              <span>建议与质量页、项目页联读</span>
            </div>
          }
        >
          <div className="callout">
            <strong>当前更适合回答“哪里可能有摩擦”，不适合回答“谁更高效”。</strong>
            <span>如果要做管理动作，建议先落到项目或员工聚焦页做复盘，再决定是否介入。</span>
          </div>
        </Panel>
      ) : null}

      <div className="metrics-grid">
        <MetricCard
          label="最强候选关系"
          value={strongestPair ? `${strongestPair.x} × ${strongestPair.y}` : '样本不足'}
          hint={topPairSummary}
          tone="derived"
        />
        <MetricCard
          label="多项目工作日占比"
          value={formatPercent(multiProjectShare)}
          hint="表示员工单日涉及多个项目的比例，适合观察上下文切换，不适合直接评价绩效。"
          tone="derived"
        />
        <MetricCard
          label="离群样本"
          value={`${employeeOutlierCount + projectOutlierCount} 个`}
          hint={outlierSummary}
          tone="derived"
        />
        <MetricCard
          label="结论等级"
          value={view.dataHealth.sampleDays < 14 ? '观察' : '候选验证'}
          hint="当前页只用于发现值得继续验证的变量关系，不输出因果结论。"
          tone="warning"
        />
      </div>

      <Panel
        title="当前可读结论"
        subtitle="用一句话理解这页，而不是直接盯着热力图"
        className="panel-wide panel-strip"
      >
        <div className="insight-grid">
          <div className="insight-card">
            <strong>最值得继续验证的关系</strong>
            <p>{topPairSummary}</p>
          </div>
          <div className="insight-card">
            <strong>工时升高更像由什么驱动</strong>
            <p>{loadDriverSummary}</p>
          </div>
          <div className="insight-card">
            <strong>当前更像系统问题还是个案问题</strong>
            <p>{outlierSummary}</p>
          </div>
        </div>
      </Panel>

      <ChartPanel
        title="候选关系排行"
        subtitle="先看这张图，再决定要不要读完整矩阵"
        note="这张图把当前最值得继续验证的几组关系排出来。绝对值越高，说明同步变化越明显；但仍然不代表因果。"
        option={relationRankingOption}
        source="derived"
        method="Pearson 相关系数绝对值排序，按员工日聚合"
        reliability={view.dataHealth.sampleDays < 14 ? '低，样本偏短' : '中'}
        caution="只代表同步变化强弱，不代表管理动作优先级"
      />

      <ChartPanel
        title="负载与碎片关系"
        subtitle="工时升高时，更像任务变多，还是项目切换变多"
        note="每个点代表一个员工日。横轴是单日工时，纵轴是任务数，气泡越大表示当天涉及项目越多。先看气泡是否集中在右上区域，再看是否出现大气泡。"
        option={scatterOption}
        source="derived"
        method="员工日级散点观察，气泡大小代表项目数"
        reliability="中"
        caution="任务拆分粒度差异会影响纵轴，不建议把单点直接解释为低效"
      />

      <ChartPanel
        title="分布与离群"
        subtitle="判断问题是少数样本拉高，还是整体分布偏斜"
        note="箱线图适合回答：当前高工时是整体都高，还是只集中在少数员工或项目。优先看中位数和上缘，不要只看最大值。"
        option={boxplotOption}
        source="derived"
        method="四分位统计"
        reliability="中"
        caution="短样本下更适合找离群项，不适合判断长期稳定分布"
      />

      <CollapsiblePanel
        title="完整矩阵"
        subtitle="进阶视图：查看所有指标之间的完整相关矩阵"
        note="只有在前面的候选关系排行已明确目标后，才建议展开这张图。"
        className="panel-wide"
      >
        <ChartPanel
          title="完整相关矩阵"
          subtitle="工时、任务数、项目数的完整联动"
          note="颜色越深只代表相关系数绝对值越大。优先看非对角线，再回到上方候选关系排行确认是否值得继续分析。"
          option={heatmapOption}
          source="derived"
          method="Pearson 相关矩阵"
          reliability={view.dataHealth.sampleDays < 14 ? '低，样本偏短' : '中'}
          caution="未做显著性检验，当前已排除数据质量类指标"
        />
      </CollapsiblePanel>

      <CollapsiblePanel
        title="协同分析预留位"
        subtitle="Git / AI / 用户反馈目前仍是示意图，默认收起"
        note="research 文档建议这部分在真实数据接入后采用周级时间序列、滞后分析和质量指标联读。当前仅用于验证图面和接口。"
        className="panel-wide"
      >
        <div className="connector-grid">
          <ChartPanel
            title="Git 协同"
            subtitle="示意：项目工时 vs Commit 数"
            note="真实接入后建议扩展为 commit、PR、review 时间、code churn，并优先看团队/项目层而非个体排名。"
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
            subtitle="示意：脱敏后的调用次数趋势"
            note="真实接入后建议结合 token、深度分数、主题复杂度与代码采纳质量一起看，不要单独用 token 高低判断价值。"
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
            subtitle="示意：项目满意度联动"
            note="research 文档建议真实反馈按周聚合，并用滞后窗口观察工时投入对评分和情感的后续影响。"
            option={feedbackOption}
            height={260}
            badge="示意数据"
            source="mock"
            method="模拟反馈评分聚合"
            reliability="低，仅示意"
            caution="当前不代表真实客户满意度"
          />
        </div>
      </CollapsiblePanel>
    </div>
  );
}
