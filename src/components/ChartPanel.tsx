import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { withChartTheme } from '../lib/chartTheme';
import { MetaPill } from './MetaPill';
import { Panel } from './Panel';

interface ChartPanelProps {
  title: string;
  subtitle: string;
  note: string;
  option: Record<string, unknown>;
  height?: number;
  badge?: string;
  source?: 'real' | 'mock' | 'derived' | 'model';
  method?: string;
  reliability?: string;
  caution?: string;
  onChartClick?: (params: { name?: string; value?: unknown; data?: unknown }) => void;
}

export function ChartPanel({
  title,
  subtitle,
  note,
  option,
  height = 320,
  badge,
  source = 'real',
  method,
  reliability,
  caution,
  onChartClick,
}: ChartPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const sourceLabelMap = {
    real: '真实工时',
    mock: '示意数据',
    derived: '规则推导',
    model: '模型生成',
  } as const;

  return (
    <Panel
      className="chart-panel"
      title={title}
      subtitle={subtitle}
      note={showDetails ? note : undefined}
      badge={badge}
      actions={
        method || reliability || caution || note ? (
          <button
            type="button"
            className={`panel-info-toggle ${showDetails ? 'active' : ''}`.trim()}
            onClick={() => setShowDetails((current) => !current)}
          >
            {showDetails ? '收起' : '说明'}
          </button>
        ) : undefined
      }
      meta={
        showDetails ? (
          <div className="chart-meta">
            <MetaPill tone={source}>{sourceLabelMap[source]}</MetaPill>
            {method ? <span>方法：{method}</span> : null}
            {reliability ? <span>可靠性：{reliability}</span> : null}
            {caution ? <span>注意：{caution}</span> : null}
          </div>
        ) : null
      }
    >
      <ReactECharts
        option={withChartTheme(option)}
        style={{ height }}
        onEvents={
          onChartClick
            ? {
                click: onChartClick,
              }
            : undefined
        }
      />
    </Panel>
  );
}
