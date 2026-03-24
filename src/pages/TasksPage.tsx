import type { ColumnDef } from '@tanstack/react-table';
import { ChartPanel } from '../components/ChartPanel';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { DataTable } from '../components/DataTable';
import { formatNumber, formatPercent } from '../lib/format';
import type { AnalyticsView } from '../types';

interface TasksPageProps {
  view: AnalyticsView;
}

export function TasksPage({ view }: TasksPageProps) {
  const topicOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: view.topicStats.map((item) => item.topicLabel) },
    series: [
      {
        type: 'bar',
        data: view.topicStats.map((item) => item.totalHours),
        itemStyle: { color: '#6e6dfb', borderRadius: 10 },
      },
    ],
  };

  const treeOption = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'treemap',
        roam: false,
        breadcrumb: { show: false },
        data: view.topicStats.map((item) => ({
          name: item.topicLabel,
          value: item.taskCount,
        })),
      },
    ],
  };

  const keywordEntries = Array.from(
    view.tasks.reduce((map, task) => {
      task.keywordHits.forEach((keyword) => {
        map.set(keyword, (map.get(keyword) ?? 0) + task.reportHour);
      });
      return map;
    }, new Map<string, number>()),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12);

  const keywordOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 24, right: 20, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: keywordEntries.map(([keyword]) => keyword) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: keywordEntries.map(([, hours]) => hours),
        itemStyle: { color: '#ff9f0a', borderRadius: 10 },
      },
    ],
  };

  const columns: Array<ColumnDef<(typeof view.tasks)[number]>> = [
    { header: '日期', accessorKey: 'date' },
    { header: '项目', accessorKey: 'projectName' },
    { header: '任务名称', accessorKey: 'taskName' },
    {
      header: '工时',
      cell: ({ row }) => `${formatNumber(row.original.reportHour)} h`,
    },
    { header: '主题', accessorKey: 'topicLabel' },
    {
      header: '分类可信度',
      cell: ({ row }) => formatPercent(row.original.topicConfidence),
    },
  ];

  return (
    <div className="page-grid">
      <ChartPanel
        title="主题分类"
        subtitle="工时主要集中在哪类工作"
        note="这张图回答：开发、测试、部署、维护等主题在当前样本中的占比。"
        option={topicOption}
      />

      <ChartPanel
        title="主题树图"
        subtitle="任务主题的任务量分布"
        note="这张图回答：哪些主题更碎、更频繁。"
        option={treeOption}
      />

      <ChartPanel
        title="关键词画像"
        subtitle="高频任务关键词反映了什么工作性质"
        note="这张图回答：任务标题中的高频词更偏开发、维护还是沟通。"
        option={keywordOption}
      />

      <CollapsiblePanel
        title="任务明细"
        subtitle="逐条核查主题映射与任务名"
        note="分类结果来自规则词典，未分类项会在数据质量页集中提示。"
      >
        <DataTable columns={columns} data={view.tasks} />
      </CollapsiblePanel>
    </div>
  );
}
