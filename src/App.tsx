import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AgentPage } from './pages/AgentPage';
import { DetailDrawer } from './components/DetailDrawer';
import { FilterBar } from './components/FilterBar';
import { Sidebar } from './components/Sidebar';
import { CorrelationPage } from './pages/CorrelationPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { QualityPage } from './pages/QualityPage';
import { ReportPage } from './pages/ReportPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { MethodsPage } from './pages/MethodsPage';
import { useAppStore } from './store/appStore';

export default function App() {
  const {
    activePage,
    closeDetail,
    dataset,
    detailSelection,
    filters,
    immersiveMode,
    openDetail,
    parseError,
    patchFilters,
    replaceSource,
    resetFilters,
    setActivePage,
    setImmersiveMode,
    view,
  } = useAppStore();

  const pageNode = useMemo(() => {
    switch (activePage) {
      case 'agent':
        return <AgentPage view={view} onNavigate={setActivePage} />;
      case 'methods':
        return <MethodsPage view={view} />;
      case 'settings':
        return (
          <SettingsPage
            dataset={dataset}
            filters={filters}
            onPatchFilters={patchFilters}
            onUpload={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === 'string') {
                  replaceSource(reader.result);
                }
              };
              reader.readAsText(file, 'utf-8');
            }}
          />
        );
      case 'employees':
        return <EmployeesPage view={view} onOpenDetail={openDetail} />;
      case 'projects':
        return <ProjectsPage view={view} filters={filters} onOpenDetail={openDetail} />;
      case 'tasks':
        return <TasksPage view={view} onOpenDetail={openDetail} />;
      case 'quality':
        return <QualityPage view={view} onOpenDetail={openDetail} />;
      case 'correlation':
        return <CorrelationPage dataset={dataset} view={view} filters={filters} />;
      case 'report':
        return <ReportPage view={view} />;
      case 'overview':
      default:
        return (
          <OverviewPage
            dataset={dataset}
            view={view}
            filters={filters}
            onOpenDetail={openDetail}
          />
        );
    }
  }, [activePage, dataset, filters, openDetail, view]);

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onChange={setActivePage} />
      <main className={`app-main ${immersiveMode ? 'immersive-mode' : ''}`.trim()}>
        <FilterBar
          dataset={dataset}
          filters={filters}
          immersiveMode={immersiveMode}
          parseError={parseError}
          onPatchFilters={patchFilters}
          onReset={resetFilters}
          onToggleImmersive={setImmersiveMode}
        />
        <motion.div
          key={activePage}
          className="workspace"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {pageNode}
        </motion.div>
      </main>
      <DetailDrawer
        detail={detailSelection}
        view={view}
        filters={filters}
        onClose={closeDetail}
      />
    </div>
  );
}
