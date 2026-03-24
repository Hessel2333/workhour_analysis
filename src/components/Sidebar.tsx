import { useThemeStore } from '../store/themeStore';
import type { PageKey } from '../types';

export const PRIMARY_NAV_ITEMS: Array<{
  key: PageKey;
  label: string;
  hint: string;
  icon: string;
}> = [
  { key: 'overview', label: '总览', hint: '投入与趋势', icon: '📊' },
  { key: 'agent', label: '智能分析', hint: '规则诊断与 Gemini', icon: '🤖' },
  { key: 'employees', label: '员工视图', hint: '工时热图与碎片化', icon: '👥' },
  { key: 'projects', label: '项目视图', hint: '投入构成与波动', icon: '🏗️' },
  { key: 'tasks', label: '任务洞察', hint: '主题、关键词与明细', icon: '📋' },
  { key: 'quality', label: '数据质量', hint: '缺口、异常与提醒', icon: '🛡️' },
  { key: 'correlation', label: '相关性实验室', hint: '相关性与协同 mock', icon: '🧪' },
  { key: 'report', label: '报告', hint: '管理层摘要与导出', icon: '📄' },
];

export const SECONDARY_NAV_ITEMS: Array<{
  key: PageKey;
  label: string;
  hint: string;
  icon: string;
}> = [
  { key: 'settings', label: '设置', hint: '文件与工时制', icon: '⚙️' },
  { key: 'methods', label: '方法说明', hint: '口径、公式与边界', icon: '📘' },
];

interface SidebarProps {
  activePage: PageKey;
  onChange: (page: PageKey) => void;
}

export function Sidebar({ activePage, onChange }: SidebarProps) {
  const { theme, setTheme } = useThemeStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-eyebrow">Workhour Intelligence</span>
        <h1>工时分析工作台</h1>
        <p>本地样本驱动的研发效能观察台</p>
      </div>
      <nav className="sidebar-nav">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activePage === item.key ? 'active' : ''}`.trim()}
            onClick={() => onChange(item.key)}
            type="button"
            data-icon={item.icon}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>
      <div className="sidebar-secondary">
        {SECONDARY_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item nav-item-secondary ${activePage === item.key ? 'active' : ''}`.trim()}
            onClick={() => onChange(item.key)}
            type="button"
            data-icon={item.icon}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}

        <div className="theme-switcher">
          <button
            type="button"
            className={`theme-button ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
            title="浅色模式"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <span>浅色</span>
          </button>
          <button
            type="button"
            className={`theme-button ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
            title="深色模式"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            <span>深色</span>
          </button>
          <button
            type="button"
            className={`theme-button ${theme === 'system' ? 'active' : ''}`}
            onClick={() => setTheme('system')}
            title="跟随系统"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span>系统</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
