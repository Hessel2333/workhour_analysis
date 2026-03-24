import type { BaseDataset, Filters } from '../types';

interface FilterBarProps {
  dataset: BaseDataset;
  filters: Filters;
  immersiveMode: boolean;
  parseError: string;
  onPatchFilters: (patch: Partial<Filters>) => void;
  onReset: () => void;
  onToggleImmersive: (value: boolean) => void;
}

function clampRange(
  startDate: string,
  endDate: string,
  dataset: BaseDataset,
) {
  return {
    startDate: startDate < dataset.dateRange.start ? dataset.dateRange.start : startDate,
    endDate: endDate > dataset.dateRange.end ? dataset.dateRange.end : endDate,
  };
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string) {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  return formatLocalDate(new Date(year, month, 0));
}

function shiftMonth(date: string, diff: number) {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  return formatLocalDate(new Date(year, month - 1 + diff, 1));
}

function yearStart(date: string) {
  return `${date.slice(0, 4)}-01-01`;
}

function yearEnd(date: string) {
  return `${date.slice(0, 4)}-12-31`;
}

function shiftYear(date: string, diff: number) {
  const year = Number(date.slice(0, 4)) + diff;
  return `${year}-01-01`;
}

export function FilterBar({
  dataset,
  filters,
  immersiveMode,
  parseError,
  onPatchFilters,
  onReset,
  onToggleImmersive,
}: FilterBarProps) {
  const topicOptions = Array.from(new Set(dataset.taskTopics.map((item) => item.topicLabel)));
  const projectOptions = Array.from(new Set(dataset.tasks.map((item) => item.projectName)));
  const focusDate = filters.startDate || dataset.dateRange.start;
  const periodLabel =
    filters.periodMode === 'month'
      ? `${focusDate.slice(0, 4)}年${Number(focusDate.slice(5, 7))}月`
      : `${focusDate.slice(0, 4)}年`;

  const changePeriodMode = (mode: 'month' | 'year') => {
    if (mode === filters.periodMode) return;
    const anchor = filters.startDate || dataset.dateRange.start;
    const nextRange =
      mode === 'month'
        ? clampRange(monthStart(anchor), monthEnd(anchor), dataset)
        : clampRange(yearStart(anchor), yearEnd(anchor), dataset);
    onPatchFilters({ periodMode: mode, ...nextRange });
  };

  const navigatePeriod = (diff: number) => {
    const nextAnchor =
      filters.periodMode === 'month'
        ? shiftMonth(focusDate, diff)
        : shiftYear(focusDate, diff);
    const nextRange =
      filters.periodMode === 'month'
        ? clampRange(monthStart(nextAnchor), monthEnd(nextAnchor), dataset)
        : clampRange(yearStart(nextAnchor), yearEnd(nextAnchor), dataset);

    if (
      nextRange.startDate > dataset.dateRange.end ||
      nextRange.endDate < dataset.dateRange.start
    ) {
      return;
    }

    onPatchFilters(nextRange);
  };

  return (
    <div className="filter-wrap">
      <div className="toolbar toolbar-stacked">
        <div className="toolbar-row toolbar-row-period">
          <div className="period-switcher">
            <div className="mini-segment">
              {[
                ['month', '月份'],
                ['year', '年份'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`mini-segment-button ${filters.periodMode === value ? 'active' : ''}`.trim()}
                  onClick={() => changePeriodMode(value as 'month' | 'year')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="period-navigator">
              <button
                type="button"
                className="ghost-button toolbar-button period-arrow"
                aria-label={`上一${filters.periodMode === 'month' ? '月' : '年'}`}
                onClick={() => navigatePeriod(-1)}
              >
                ‹
              </button>
              <div className="period-label">{periodLabel}</div>
              <button
                type="button"
                className="ghost-button toolbar-button period-arrow"
                aria-label={`下一${filters.periodMode === 'month' ? '月' : '年'}`}
                onClick={() => navigatePeriod(1)}
              >
                ›
              </button>
            </div>
          </div>
        </div>

        <div className="toolbar-row toolbar-row-filters">
          <div className="filters filters-inline filters-inline-secondary">
            <label className="field field-inline-control">
              <select
                aria-label="项目筛选"
                value={filters.projectName}
                onChange={(event) => onPatchFilters({ projectName: event.target.value })}
              >
                <option value="">全部项目</option>
                {projectOptions.map((projectName) => (
                  <option key={projectName} value={projectName}>
                    {projectName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-inline-control">
              <select
                aria-label="主题筛选"
                value={filters.topicLabel}
                onChange={(event) => onPatchFilters({ topicLabel: event.target.value })}
              >
                <option value="">全部主题</option>
                {topicOptions.map((topicLabel) => (
                  <option key={topicLabel} value={topicLabel}>
                    {topicLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-inline-control field-employee">
              <select
                aria-label="员工筛选"
                value={filters.employeeId}
                onChange={(event) => onPatchFilters({ employeeId: event.target.value })}
              >
                <option value="">全部员工</option>
                {dataset.employees
                  .filter((employee) => employee.hasDetail)
                  .map((employee) => (
                    <option key={employee.employeeId} value={employee.employeeId}>
                      {employee.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="toolbar-actions toolbar-actions-inline">
            <button
              type="button"
              className={`ghost-button toolbar-button view-toggle ${immersiveMode ? 'active' : ''}`.trim()}
              onClick={() => onToggleImmersive(!immersiveMode)}
            >
              {immersiveMode ? '退出沉浸' : '沉浸'}
            </button>
            <button className="ghost-button secondary-action" onClick={onReset} type="button">
              重置
            </button>
          </div>
        </div>
      </div>
      {parseError ? (
        <div className="sample-banner error">
          <strong>解析失败：{parseError}</strong>
        </div>
      ) : null}
    </div>
  );
}
