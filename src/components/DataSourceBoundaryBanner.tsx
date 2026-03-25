import { MetaPill } from './MetaPill';

interface DataSourceBoundaryBannerProps {
  realSources: string[];
  mockSources?: string[];
  className?: string;
  compact?: boolean;
}

export function DataSourceBoundaryBanner({
  realSources,
  mockSources = [],
  className = '',
  compact = false,
}: DataSourceBoundaryBannerProps) {
  const hasMockSources = mockSources.length > 0;

  return (
    <section
      className={`source-boundary ${compact ? 'compact' : ''} ${className}`.trim()}
    >
      <div className="source-boundary-header">
        <div>
          <p className="panel-kicker">来源边界</p>
          <h3 className="panel-title">先区分真实数据和模拟扩展，再解读图表结论</h3>
        </div>
        <div className="source-boundary-pills">
          <MetaPill tone="real">真实来源</MetaPill>
          {hasMockSources ? <MetaPill tone="mock">模拟来源</MetaPill> : null}
        </div>
      </div>
      <div className="source-boundary-grid">
        <div className="source-boundary-card real">
          <strong>当前真实来源</strong>
          <p>{realSources.join('、')}</p>
        </div>
        <div className={`source-boundary-card ${hasMockSources ? 'mock' : 'clean'}`.trim()}>
          <strong>{hasMockSources ? '当前模拟来源' : '当前模拟来源状态'}</strong>
          <p>
            {hasMockSources
              ? `${mockSources.join('、')} 目前仍是示意数据，只用于验证图面、接口和扩展分析口径。`
              : '当前页面未展示模拟来源图表，结论仅来自真实工时与其规则推导结果。'}
          </p>
        </div>
      </div>
    </section>
  );
}
