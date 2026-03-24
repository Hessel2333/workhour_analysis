import type { ChangeEvent } from 'react';
import { Panel } from '../components/Panel';
import type { BaseDataset, Filters } from '../types';

interface SettingsPageProps {
  dataset: BaseDataset;
  filters: Filters;
  onPatchFilters: (patch: Partial<Filters>) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function SettingsPage({
  dataset,
  filters,
  onPatchFilters,
  onUpload,
}: SettingsPageProps) {
  return (
    <div className="page-grid">
      <Panel
        title="设置"
        subtitle="管理数据源和工时制口径"
        className="panel-wide"
      >
        <div className="settings-grid">
          <div className="settings-card">
            <strong>工时文件</strong>
            <p>当前默认数据范围：{dataset.dateRange.start} 至 {dataset.dateRange.end}</p>
            <label className="upload-button settings-upload" htmlFor="workhour-upload-settings">
              更换文件
            </label>
            <input
              className="hidden-input"
              id="workhour-upload-settings"
              onChange={onUpload}
              type="file"
              accept=".txt,.json"
            />
          </div>

          <div className="settings-card">
            <strong>工时制</strong>
            <p>控制周六是否按正常工作日计算加班。</p>
            <div className="mini-segment settings-segment">
              <button
                type="button"
                className={`mini-segment-button ${filters.overtimeMode === 'bigSmallWeek' ? 'active' : ''}`.trim()}
                onClick={() => onPatchFilters({ overtimeMode: 'bigSmallWeek' })}
              >
                大小周
              </button>
              <button
                type="button"
                className={`mini-segment-button ${filters.overtimeMode === 'standard' ? 'active' : ''}`.trim()}
                onClick={() => onPatchFilters({ overtimeMode: 'standard' })}
              >
                双休
              </button>
            </div>
            <small>
              当前大小周口径：从 2025-07-05 起隔周周六按正常工作日处理。
            </small>
          </div>
        </div>
      </Panel>
    </div>
  );
}
