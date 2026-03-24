import { PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS } from './Sidebar';
import type { PageKey } from '../types';

interface MobilePageBarProps {
  activePage: PageKey;
  onChange: (page: PageKey) => void;
}

const PRIORITY_KEYS: PageKey[] = ['overview', 'projects', 'employees', 'tasks', 'agent'];
const primaryItems = PRIMARY_NAV_ITEMS.filter((item) => PRIORITY_KEYS.includes(item.key));
const secondaryItems = [
  ...PRIMARY_NAV_ITEMS.filter((item) => !PRIORITY_KEYS.includes(item.key)),
  ...SECONDARY_NAV_ITEMS,
];

export function MobilePageBar({ activePage, onChange }: MobilePageBarProps) {
  return (
    <div className="mobile-page-strip" aria-label="移动端页面导航">
      <div className="mobile-page-group">
        <span className="mobile-page-section-label">常用</span>
        <div className="mobile-page-scroll">
          {primaryItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`mobile-page-button ${activePage === item.key ? 'active' : ''}`.trim()}
              onClick={() => onChange(item.key)}
            >
              <span className="mobile-page-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mobile-page-group mobile-page-group-secondary">
        <span className="mobile-page-section-label">更多</span>
        <div className="mobile-page-scroll">
          {secondaryItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mobile-page-button mobile-page-button-secondary ${activePage === item.key ? 'active' : ''}`.trim()}
            onClick={() => onChange(item.key)}
          >
            <span className="mobile-page-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
          ))}
        </div>
      </div>
    </div>
  );
}
