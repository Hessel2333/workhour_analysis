import { useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { MetricCard } from '../components/MetricCard';
import { Panel } from '../components/Panel';
import { formatNumber, formatPercent } from '../lib/format';
import type { AnalyticsView } from '../types';

interface ReportPageProps {
  view: AnalyticsView;
}

export function ReportPage({ view }: ReportPageProps) {
  const exportRef = useRef<HTMLDivElement>(null);

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
          hint="仅 6 天样本，结论偏向观察性"
        />
        <MetricCard
          label="智能体异常数"
          value={`${view.agentReport.issues.length}`}
          hint="来自本地规则推理的异常和建议"
        />
      </div>

      <div className="report-sheet" ref={exportRef}>
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
            {view.agentReport.issues.slice(0, 5).map((issue) => (
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
            <li>当前样本仅覆盖 2026-03-16 至 2026-03-21，共 6 天。</li>
            <li>核验工时为 0，当前分析主要反映填报结构与任务切分。</li>
            <li>本版本不提供员工绩效评分，也不建议对个体做公开排名。</li>
            <li>Git、AI、用户反馈相关图表目前为接口和 mock 验证，不应视作真实业务结论。</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
