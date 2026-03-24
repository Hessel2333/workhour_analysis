import { create } from 'zustand';
import { buildAnalyticsView } from '../lib/analytics';
import { defaultDataset, parseWorkhourSource } from '../data/workhourData';
import type {
  AnalyticsView,
  BaseDataset,
  DetailSelection,
  Filters,
  PageKey,
} from '../types';

interface AppState {
  dataset: BaseDataset;
  view: AnalyticsView;
  filters: Filters;
  activePage: PageKey;
  immersiveMode: boolean;
  detailSelection: DetailSelection | null;
  parseError: string;
  setActivePage: (page: PageKey) => void;
  patchFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  setImmersiveMode: (value: boolean) => void;
  openDetail: (detail: DetailSelection) => void;
  closeDetail: () => void;
  replaceSource: (source: string) => void;
}

function createDefaultFilters(dataset: BaseDataset): Filters {
  return {
    periodMode: 'year',
    overtimeMode: 'bigSmallWeek',
    startDate: dataset.dateRange.start,
    endDate: dataset.dateRange.end,
    employeeId: '',
    projectName: '',
    topicLabel: '',
  };
}

const initialDataset = defaultDataset;
const initialFilters = createDefaultFilters(initialDataset);

export const useAppStore = create<AppState>((set, get) => ({
  dataset: initialDataset,
  view: buildAnalyticsView(initialDataset, initialFilters),
  filters: initialFilters,
  activePage: 'overview',
  immersiveMode: false,
  detailSelection: null,
  parseError: '',
  setActivePage: (activePage) => set({ activePage }),
  patchFilters: (patch) => {
    const nextFilters = { ...get().filters, ...patch };
    set({
      filters: nextFilters,
      view: buildAnalyticsView(get().dataset, nextFilters),
    });
  },
  resetFilters: () => {
    const nextFilters = createDefaultFilters(get().dataset);
    set({
      filters: nextFilters,
      view: buildAnalyticsView(get().dataset, nextFilters),
    });
  },
  setImmersiveMode: (immersiveMode) => set({ immersiveMode }),
  openDetail: (detailSelection) => set({ detailSelection }),
  closeDetail: () => set({ detailSelection: null }),
  replaceSource: (source) => {
    try {
      const dataset = parseWorkhourSource(source);
      const filters = createDefaultFilters(dataset);
      set({
        dataset,
        filters,
        view: buildAnalyticsView(dataset, filters),
        parseError: '',
      });
    } catch (error) {
      set({
        parseError:
          error instanceof Error ? error.message : '无法解析上传的工时文件。',
      });
    }
  },
}));
