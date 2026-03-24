import type { ChangeEvent } from 'react';
import type { BaseDataset, Filters } from '../types';

interface FilterBarProps {
  dataset: BaseDataset;
  filters: Filters;
  immersiveMode: boolean;
  parseError: string;
  onPatchFilters: (patch: Partial<Filters>) => void;
  onReset: () => void;
  onToggleImmersive: (value: boolean) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function FilterBar({
  dataset,
  filters,
  immersiveMode,
  parseError,
  onPatchFilters,
  onReset,
  onToggleImmersive,
  onUpload,
}: FilterBarProps) {
  const topicOptions = Array.from(new Set(dataset.taskTopics.map((item) => item.topicLabel)));
  const projectOptions = Array.from(new Set(dataset.tasks.map((item) => item.projectName)));

  return (
    <div className="filter-wrap">
      <div className="toolbar toolbar-compact">
        <div className="toolbar-compact-title">
          <h2>工时分析</h2>
        </div>
        <div className="filters filters-inline">
          <label className="field">
            <span>起始日期</span>
            <input
              type="date"
              value={filters.startDate}
              min={dataset.dateRange.start}
              max={dataset.dateRange.end}
              onChange={(event) => onPatchFilters({ startDate: event.target.value })}
            />
          </label>
          <label className="field">
            <span>结束日期</span>
            <input
              type="date"
              value={filters.endDate}
              min={dataset.dateRange.start}
              max={dataset.dateRange.end}
              onChange={(event) => onPatchFilters({ endDate: event.target.value })}
            />
          </label>
          <label className="field">
            <span>项目</span>
            <select
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
          <label className="field">
            <span>任务主题</span>
            <select
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
          <label className="field field-employee">
            <span>员工</span>
            <select
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
          <label className="checkbox-chip">
            <input
              type="checkbox"
              checked={filters.onlyMultiProject}
              onChange={(event) =>
                onPatchFilters({ onlyMultiProject: event.target.checked })
              }
            />
            <span>仅看多项目切换</span>
          </label>
          <label className="checkbox-chip">
            <input
              type="checkbox"
              checked={filters.onlyAnomalous}
              onChange={(event) =>
                onPatchFilters({ onlyAnomalous: event.target.checked })
              }
            />
            <span>仅看异常员工日</span>
          </label>
          <button
            type="button"
            className={`ghost-button view-toggle ${immersiveMode ? 'active' : ''}`.trim()}
            onClick={() => onToggleImmersive(!immersiveMode)}
          >
            {immersiveMode ? '退出沉浸' : '沉浸模式'}
          </button>
          <label className="upload-button compact-upload" htmlFor="workhour-upload">
            替换文件
          </label>
          <input
            className="hidden-input"
            id="workhour-upload"
            onChange={onUpload}
            type="file"
            accept=".txt,.json"
          />
          <button className="ghost-button secondary-action" onClick={onReset} type="button">
            重置筛选
          </button>
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
