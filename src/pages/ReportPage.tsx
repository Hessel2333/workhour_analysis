import { useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { DataSourceBoundaryBanner } from '../components/DataSourceBoundaryBanner';
import { MetricCard } from '../components/MetricCard';
import { Panel } from '../components/Panel';
import { analysisConfig } from '../config/analysisConfig';
import { formatNumber, formatPercent } from '../lib/format';
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
