import { PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS } from './Sidebar';
import type { PageKey } from '../types';

interface MobilePageBarProps {
  activePage: PageKey;
  onChange: (page: PageKey) => void;
}

const MOBILE_ITEMS = [...PRIMARY_NAV_ITEMS, ...SECONDARY_NAV_ITEMS];

export function MobilePageBar({ activePage, onChange }: MobilePageBarProps) {
  return (
    <div className="mobile-page-strip" aria-label="移动端页面导航">
      <div className="mobile-page-scroll">
        {MOBILE_ITEMS.map((item) => (
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
  );
}
