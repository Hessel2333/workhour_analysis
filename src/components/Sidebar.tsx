import type { PageKey } from '../types';

const ITEMS: Array<{ key: PageKey; label: string; hint: string }> = [
  { key: 'overview', label: '总览', hint: '投入与趋势' },
  { key: 'agent', label: 'AI 智能体', hint: '异常报告与建议' },
  { key: 'employees', label: '员工视图', hint: '工时热图与碎片化' },
  { key: 'projects', label: '项目视图', hint: '投入构成与波动' },
  { key: 'tasks', label: '任务洞察', hint: '主题、关键词与明细' },
  { key: 'quality', label: '数据质量', hint: '缺口、异常与提醒' },
  { key: 'correlation', label: '相关性实验室', hint: '相关性与协同 mock' },
  { key: 'report', label: '报告', hint: '管理层摘要与导出' },
];

interface SidebarProps {
  activePage: PageKey;
  onChange: (page: PageKey) => void;
}

export function Sidebar({ activePage, onChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-eyebrow">Workhour Intelligence</span>
        <h1>工时分析工作台</h1>
        <p>本地样本驱动的研发效能观察台</p>
      </div>
      <nav className="sidebar-nav">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activePage === item.key ? 'active' : ''}`.trim()}
            onClick={() => onChange(item.key)}
            type="button"
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>
      <div className="sidebar-secondary">
        <button
          className={`nav-item nav-item-secondary ${activePage === 'methods' ? 'active' : ''}`.trim()}
          onClick={() => onChange('methods')}
          type="button"
        >
          <span>方法说明</span>
          <small>口径、公式与边界</small>
        </button>
      </div>
    </aside>
  );
}
