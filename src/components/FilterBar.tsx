import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useToastStore } from '../store/toastStore';
import { getProjectReworkShareMetric } from '../lib/metrics';
import { isReworkTask } from '../lib/taskSignals';
import type { AnalyticsView, BaseDataset, Filters, PageKey } from '../types';
import { Popover, PopoverMenu } from './Popover';

interface QuickScenario {
  id: string;
  label: string;
  description: string;
  page: PageKey;
  patch: Partial<Filters>;
}

interface FilterBarProps {
  dataset: BaseDataset;
  filters: Filters;
  view: AnalyticsView;
  activePage: PageKey;
  immersiveMode: boolean;
  parseError: string;
  onPatchFilters: (patch: Partial<Filters>) => void;
  onReset: () => void;
  onApplyScenario: (scenario: QuickScenario) => void;
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
  view,
  activePage,
  immersiveMode,
  parseError,
  onPatchFilters,
  onReset,
  onApplyScenario,
  onToggleImmersive,
}: FilterBarProps) {
  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    if (parseError) {
      addToast(parseError, 'error');
    }
  }, [parseError, addToast]);

  const topicOptions = Array.from(new Set(dataset.taskTopics.map((item) => item.topicLabel)));
  const projectOptions = Array.from(new Set(dataset.tasks.map((item) => item.projectName)));
  const employeeOptions = dataset.employees
    .filter((e) => e.hasDetail)
    .map((e) => ({ value: e.employeeId, label: e.name }));

  const focusDate = filters.startDate || dataset.dateRange.start;
  const periodLabel =
    filters.periodMode === 'month'
      ? `${focusDate.slice(0, 4)}年${Number(focusDate.slice(5, 7))}月`
      : `${focusDate.slice(0, 4)}年`;
  const topReworkProject = [...view.projectStats]
    .map((project) => {
      const projectTasks = view.tasks.filter((task) => task.projectName === project.projectName);
      const reworkHours = projectTasks
        .filter((task) => isReworkTask(task))
        .reduce((sum, task) => sum + task.reportHour, 0);
      return {
        projectName: project.projectName,
        reworkRate: getProjectReworkShareMetric({
          totalHours: project.totalHours,
          reworkHours,
        }).value,
      };
    })
    .sort((left, right) => right.reworkRate - left.reworkRate)[0];
  const topSwitchEmployee = [...view.employeeStats]
    .sort((left, right) => right.multiProjectRate - left.multiProjectRate)[0];
  const lowVerifyCoverageProject = Array.from(
    view.tasks.reduce((map, task) => {
      const current = map.get(task.projectName) ?? { verified: 0, total: 0 };
      current.total += 1;
      if (task.verifyState === '已核验') current.verified += 1;
      map.set(task.projectName, current);
      return map;
    }, new Map<string, { verified: number; total: number }>()),
  )
    .map(([projectName, current]) => ({
      projectName,
      coverage: current.total ? current.verified / current.total : 0,
      total: current.total,
    }))
    .filter((item) => item.total > 0)
    .sort((left, right) => left.coverage - right.coverage)[0];
  const sprintProject = [...view.projectStats]
    .sort((left, right) => right.trendSlope - left.trendSlope)[0];
  const quickScenarios: QuickScenario[] = [];

  if (topReworkProject) {
    quickScenarios.push({
      id: 'high_rework_project',
      label: '高返工项目',
      description: `${topReworkProject.projectName} 返工压力最高`,
      page: 'projects',
      patch: {
        employeeId: '',
        projectName: topReworkProject.projectName,
        topicLabel: '',
      },
    });
  }

  if (topSwitchEmployee) {
    quickScenarios.push({
      id: 'high_switch_employee',
      label: '高切换员工',
      description: `${topSwitchEmployee.name} 多项目率最高`,
      page: 'employees',
      patch: {
        employeeId: topSwitchEmployee.employeeId,
        projectName: '',
        topicLabel: '',
      },
    });
  }

  if (lowVerifyCoverageProject) {
    quickScenarios.push({
      id: 'low_verify_project',
      label: '低核验覆盖项目',
      description: `${lowVerifyCoverageProject.projectName} 核验覆盖偏低`,
      page: 'quality',
      patch: {
        employeeId: '',
        projectName: lowVerifyCoverageProject.projectName,
        topicLabel: '',
      },
    });
  }

  if (sprintProject) {
    quickScenarios.push({
      id: 'sprint_project',
      label: '冲刺期项目',
      description: `${sprintProject.projectName} 当前上升最快`,
      page: 'projects',
      patch: {
        employeeId: '',
        projectName: sprintProject.projectName,
        topicLabel: '',
      },
    });
  }

  quickScenarios.push({
    id: 'pending_task_review',
    label: '分类待复核任务',
    description: '直接进入待确认任务视角',
    page: 'tasks',
    patch: {
      employeeId: '',
      projectName: '',
      topicLabel: '待确认',
    },
  });

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

  const ChevronDown = (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="filter-wrap">
      <div className="toolbar">
        <div className="toolbar-section">
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
                style={{ position: 'relative', zIndex: 1 }}
              >
                {filters.periodMode === value && (
                  <motion.div
                    layoutId="active-pill"
                    className="active-pill-bg"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: -1,
                    }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-section">
          <div className="period-navigator">
            <button
              type="button"
              className="period-arrow"
              aria-label={`上一${filters.periodMode === 'month' ? '月' : '年'}`}
              onClick={() => navigatePeriod(-1)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 9L4.5 6L7.5 3" />
              </svg>
            </button>
            <div className="period-label">{periodLabel}</div>
            <button
              type="button"
              className="period-arrow"
              aria-label={`下一${filters.periodMode === 'month' ? '月' : '年'}`}
              onClick={() => navigatePeriod(1)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 9L7.5 6L4.5 3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="toolbar-section">
          <div className="filters-inline-secondary" style={{ display: 'flex', gap: '8px' }}>
            <Popover
              trigger={
                <button className="picker-button">
                  <span className="picker-button-label">
                    {filters.projectName || '全部项目'}
                  </span>
                  <span className="picker-button-icon" aria-hidden="true">
                    {ChevronDown}
                  </span>
                </button>
              }
            >
              <PopoverMenu
                options={[
                  { value: '', label: '全部项目' },
                  ...projectOptions.map((p) => ({ value: p, label: p })),
                ]}
                value={filters.projectName}
                onChange={(p) => onPatchFilters({ projectName: p })}
              />
            </Popover>

            <Popover
              trigger={
                <button className="picker-button">
                  <span className="picker-button-label">
                    {filters.topicLabel || '全部主题'}
                  </span>
                  <span className="picker-button-icon" aria-hidden="true">
                    {ChevronDown}
                  </span>
                </button>
              }
            >
              <PopoverMenu
                options={[
                  { value: '', label: '全部主题' },
                  ...topicOptions.map((t) => ({ value: t, label: t })),
                ]}
                value={filters.topicLabel}
                onChange={(t) => onPatchFilters({ topicLabel: t })}
              />
            </Popover>

            <Popover
              trigger={
                <button className="picker-button">
                  <span className="picker-button-label">
                    {dataset.employees.find((e) => e.employeeId === filters.employeeId)?.name || '全部员工'}
                  </span>
                  <span className="picker-button-icon" aria-hidden="true">
                    {ChevronDown}
                  </span>
                </button>
              }
            >
              <PopoverMenu
                options={[
                  { value: '', label: '全部员工' },
                  ...employeeOptions,
                ]}
                value={filters.employeeId}
                onChange={(e) => onPatchFilters({ employeeId: e })}
              />
            </Popover>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className={`ghost-button ${immersiveMode ? 'active' : ''}`.trim()}
              onClick={() => onToggleImmersive(!immersiveMode)}
            >
              {immersiveMode ? '退出沉浸' : '沉浸'}
            </button>
            <button className="ghost-button" onClick={onReset} type="button">
              重置
            </button>
          </div>
        </div>
      </div>
      {quickScenarios.length ? (
        <div className="shortcut-ribbon" aria-label="问题场景快捷筛选">
          <span className="shortcut-ribbon-label">快捷场景</span>
          <div className="shortcut-ribbon-track">
            {quickScenarios.map((scenario) => {
              const isActive =
                activePage === scenario.page &&
                (scenario.patch.employeeId ?? '') === filters.employeeId &&
                (scenario.patch.projectName ?? '') === filters.projectName &&
                (scenario.patch.topicLabel ?? '') === filters.topicLabel;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  className={`shortcut-chip ${isActive ? 'active' : ''}`.trim()}
                  onClick={() => onApplyScenario(scenario)}
                >
                  <strong>{scenario.label}</strong>
                  <span>{scenario.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {parseError ? (
        <div className="sample-banner error">
          <strong>解析失败：{parseError}</strong>
        </div>
      ) : null}
    </div>
  );
}
