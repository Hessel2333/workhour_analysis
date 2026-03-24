import { useState } from 'react';
import type { ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import { Skeleton } from './Skeleton';
import { withChartTheme } from '../lib/chartTheme';
import { MetaPill } from './MetaPill';
import { Panel } from './Panel';
import { useDarkMode } from '../hooks/useDarkMode';

interface ChartPanelProps {
  title: string;
  subtitle: string;
  note: string;
  option: Record<string, unknown>;
  height?: number;
  className?: string;
  badge?: string;
  source?: 'real' | 'mock' | 'derived' | 'model';
  method?: string;
  reliability?: string;
  caution?: string;
  actions?: ReactNode;
  onChartClick?: (params: { name?: string; value?: unknown; data?: unknown }) => void;
  loading?: boolean;
}

export function ChartPanel({
  title,
  subtitle,
  note,
  option,
  height = 320,
  className = '',
  badge,
  source = 'real',
  method,
  reliability,
  caution,
  actions,
  onChartClick,
  loading = false,
}: ChartPanelProps) {
  const isDark = useDarkMode();
  const [showDetails, setShowDetails] = useState(false);
  const sourceLabelMap = {
    real: '真实工时',
    mock: '示意数据',
    derived: '规则推导',
    model: '模型生成',
  } as const;

  return (
    <Panel
      className={`chart-panel ${className} ${source === 'mock' ? 'is-mock' : ''} ${onChartClick ? 'clickable' : ''}`.trim()}
      title={title}
      subtitle={subtitle}
      note={showDetails ? note : undefined}
      badge={
        badge || (source === 'mock' ? '示意数据' : undefined)
      }
      actions={
        <>
          {actions}
          {method || reliability || caution || note || source === 'mock' ? (
            <button
              type="button"
              className={`panel-info-toggle ${showDetails ? 'active' : ''}`.trim()}
              onClick={() => setShowDetails((current) => !current)}
            >
              {showDetails ? (source === 'mock' ? '明白' : '收起') : (source === 'mock' ? '数据说明' : '说明')}
            </button>
          ) : null}
        </>
      }
      meta={
        showDetails || source === 'mock' ? (
          <div className="chart-meta">
            <MetaPill tone={source === 'mock' ? 'warning' : source}>{sourceLabelMap[source as keyof typeof sourceLabelMap]}</MetaPill>
            {source === 'mock' && <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>⚠️ 当前为生成数据，仅供示意</span>}
            {showDetails && method ? <span>方法：{method}</span> : null}
            {showDetails && reliability ? <span>可靠性：{reliability}</span> : null}
            {showDetails && caution ? <span>注意：{caution}</span> : null}
          </div>
        ) : null
      }
    >
      {loading ? (
        <div style={{ display: 'grid', gap: 12, padding: '20px 0' }}>
          <Skeleton height={height - 40} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton width="30%" height={12} />
            <Skeleton width="20%" height={12} />
          </div>
        </div>
      ) : (
        <ReactECharts
          option={withChartTheme(option, isDark)}
          style={{ height }}
          onEvents={
            onChartClick
              ? {
                  click: onChartClick,
                }
              : undefined
          }
        />
      )}
    </Panel>
  );
}
