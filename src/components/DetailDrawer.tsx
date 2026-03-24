import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import { withChartTheme } from '../lib/chartTheme';
import { MetaPill } from './MetaPill';
import { formatNumber, formatPercent } from '../lib/format';
import type { AnalyticsView, DetailSelection } from '../types';

interface DetailDrawerProps {
  detail: DetailSelection | null;
  view: AnalyticsView;
  onClose: () => void;
}

type FocusTab = 'overview' | 'tasks';

function MiniMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="focus-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function chartShell(title: string, subtitle: string, option: Record<string, unknown>) {
  return (
    <section className="focus-chart-card">
      <div className="focus-chart-header">
        <p className="panel-kicker">{title}</p>
        <h4>{subtitle}</h4>
      </div>
      <ReactECharts option={withChartTheme(option)} style={{ height: 240 }} />
    </section>
  );
}

function FocusTabs({
  labels,
  activeTab,
  onChange,
}: {
  labels: Array<{ key: FocusTab; label: string }>;
  activeTab: FocusTab;
  onChange: (tab: FocusTab) => void;
}) {
  return (
    <div className="focus-tabs" role="tablist">
      {labels.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={activeTab === item.key}
          className={`focus-tab ${activeTab === item.key ? 'active' : ''}`.trim()}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function DetailDrawer({
  detail,
  view,
  onClose,
}: DetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<FocusTab>('overview');

  useEffect(() => {
    setActiveTab('overview');
  }, [detail?.kind, detail?.employeeId, detail?.projectName, detail?.date]);

  const renderContent = () => {
    if (!detail) return null;

    if (detail.kind === 'employee' && detail.employeeId) {
      const employeeStat = view.employeeStats.find(
        (item) => item.employeeId === detail.employeeId,
      );
      if (!employeeStat) return null;

      const employeeDays = view.employeeDays.filter(
        (day) => day.employeeId === detail.employeeId,
      );
      const employeeTasks = view.tasks.filter((task) => task.employeeId === detail.employeeId);
      const employeeName = employeeStat.name;
      const dates = view.uniqueDates;
      const projectNames = Array.from(
        new Set(employeeTasks.map((task) => task.projectName)),
      ).slice(0, 6);
      const topicNames = Array.from(new Set(employeeTasks.map((task) => task.topicLabel)));

      const hoursTrendOption = {
        tooltip: { trigger: 'axis' },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: dates },
        yAxis: { type: 'value' },
        series: [
          {
            type: 'line',
            smooth: true,
            color: '#0a84ff',
            data: dates.map(
              (date) =>
                employeeDays.find((day) => day.date === date)?.reportHour ?? 0,
            ),
          },
        ],
      };

      const projectStackOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { top: 0 },
        grid: { left: 24, right: 18, top: 50, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: dates },
        yAxis: { type: 'value' },
        series: projectNames.map((projectName, index) => ({
          name: projectName,
          type: 'bar',
          stack: 'projects',
          data: dates.map((date) =>
            employeeTasks
              .filter((task) => task.projectName === projectName && task.date === date)
              .reduce((sum, task) => sum + task.reportHour, 0),
          ),
          color: ['#0a84ff', '#34c759', '#ff9f0a', '#6e6dfb', '#ff375f', '#5ac8fa'][index],
        })),
      };

      const topicBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: topicNames },
        series: [
          {
            type: 'bar',
            data: topicNames.map((topicLabel) =>
              employeeTasks
                .filter((task) => task.topicLabel === topicLabel)
                .reduce((sum, task) => sum + task.reportHour, 0),
            ),
            itemStyle: { color: '#6e6dfb', borderRadius: 10 },
          },
        ],
      };

      const overviewPanel = (
        <>
          <div className="focus-overview">
            <div>
              <p className="panel-kicker">{detail.title}</p>
              <h3>{employeeName}</h3>
              <p className="focus-lead">
                这里聚焦展示该员工在当前筛选范围内的工时趋势、项目分布、任务主题和近期任务。
              </p>
            </div>
            <div className="focus-tags">
              <MetaPill tone="real">真实工时</MetaPill>
              <MetaPill tone="derived">规则推导</MetaPill>
              {detail.highlightDate ? (
                <MetaPill tone="warning">{`关注日期 ${detail.highlightDate}`}</MetaPill>
              ) : null}
            </div>
          </div>
          <div className="focus-metrics-grid">
            <MiniMetric label="总工时" value={`${formatNumber(employeeStat.totalHours)} h`} hint="当前筛选范围" />
            <MiniMetric label="日均工时" value={`${formatNumber(employeeStat.averageDailyHours)} h`} hint="每个工作日平均" />
            <MiniMetric label="多项目率" value={formatPercent(employeeStat.multiProjectRate)} hint="多项目工作日占比" />
            <MiniMetric label="集中度" value={formatPercent(employeeStat.focusScore)} hint="单一项目最大工时占比" />
          </div>
          <div className="focus-summary-card">
            <strong>分析提示</strong>
            <p>
              {employeeStat.multiProjectRate > 0.34
                ? `${employeeName} 的多项目率偏高，提示存在上下文切换损耗。`
                : `${employeeName} 的多项目率相对可控，当前切换负担不算突出。`}{' '}
              {employeeStat.focusScore < 0.58
                ? '同时集中度偏低，说明工时较分散，应检查是否存在临时插单或多人浅参与。'
                : '集中度尚可，说明当前投入相对聚焦在少数重点项目。'}
            </p>
          </div>
          <div className="focus-chart-grid">
            {chartShell('工时趋势', '按日期观察个人投入变化', hoursTrendOption)}
            {chartShell('项目构成', '该员工在不同项目上的工时分布', projectStackOption)}
            {chartShell('任务主题', '当前主要工作类型构成', topicBarOption)}
          </div>
        </>
      );

      const tasksPanel = (
        <section className="focus-table-card">
          <div className="focus-chart-header">
            <p className="panel-kicker">近期任务</p>
            <h4>该员工参与的任务明细</h4>
          </div>
          <div className="focus-list">
            {employeeTasks.slice(0, 16).map((task) => (
              <div
                className={`focus-list-row ${detail.highlightDate === task.date ? 'highlight' : ''}`.trim()}
                key={`${task.taskId}-${task.date}`}
              >
                <div>
                  <span>{task.date}</span>
                  <strong>{task.projectName}</strong>
                </div>
                <div>
                  <span>{task.topicLabel}</span>
                  <strong>{task.taskName}</strong>
                </div>
                <div>
                  <span>工时</span>
                  <strong>{formatNumber(task.reportHour)} h</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

      return (
        <>
          <FocusTabs
            labels={[
              { key: 'overview', label: '概览' },
              { key: 'tasks', label: '任务' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="focus-tab-panel">
            {activeTab === 'overview' ? overviewPanel : null}
            {activeTab === 'tasks' ? tasksPanel : null}
          </div>
        </>
      );
    }

    if (detail.kind === 'project' && detail.projectName) {
      const projectStat = view.projectStats.find(
        (item) => item.projectName === detail.projectName,
      );
      if (!projectStat) return null;

      const projectTasks = view.tasks.filter((task) => task.projectName === detail.projectName);
      const dates = view.uniqueDates;
      const participants = Array.from(
        new Set(projectTasks.map((task) => task.employeeId)),
      )
        .map((employeeId) => {
          const stat = view.employeeStats.find((item) => item.employeeId === employeeId);
          const name = stat ? stat.name : employeeId;
          const hours = projectTasks
            .filter((task) => task.employeeId === employeeId)
            .reduce((sum, task) => sum + task.reportHour, 0);
          return { name, hours };
        })
        .sort((left, right) => right.hours - left.hours);

      const topicNames = Array.from(new Set(projectTasks.map((task) => task.topicLabel)));

      const trendOption = {
        tooltip: { trigger: 'axis' },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: dates },
        yAxis: { type: 'value' },
        series: [
          {
            type: 'line',
            smooth: true,
            color: '#2a9d8f',
            data: dates.map((date) =>
              projectTasks
                .filter((task) => task.date === date)
                .reduce((sum, task) => sum + task.reportHour, 0),
            ),
          },
        ],
      };

      const participantBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: participants.map((item) => item.name) },
        series: [
          {
            type: 'bar',
            data: participants.map((item) => item.hours),
            itemStyle: { color: '#0a84ff', borderRadius: 10 },
          },
        ],
      };

      const topicBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: topicNames },
        series: [
          {
            type: 'bar',
            data: topicNames.map((topicLabel) =>
              projectTasks
                .filter((task) => task.topicLabel === topicLabel)
                .reduce((sum, task) => sum + task.reportHour, 0),
            ),
            itemStyle: { color: '#6e6dfb', borderRadius: 10 },
          },
        ],
      };

      const overviewPanel = (
        <>
          <div className="focus-overview">
            <div>
              <p className="panel-kicker">{detail.title}</p>
              <h3>{detail.projectName}</h3>
              <p className="focus-lead">
                这里聚焦展示该项目的投入趋势、人员构成、任务主题和近期任务明细，适合做项目纵览。
              </p>
            </div>
            <div className="focus-tags">
              <MetaPill tone="real">真实工时</MetaPill>
              <MetaPill tone="derived">规则推导</MetaPill>
            </div>
          </div>
          <div className="focus-metrics-grid">
            <MiniMetric label="总工时" value={`${formatNumber(projectStat.totalHours)} h`} hint="当前筛选范围" />
            <MiniMetric label="参与人数" value={`${projectStat.participantCount}`} hint="至少 1 条任务记录" />
            <MiniMetric label="人均投入" value={`${formatNumber(projectStat.averageHoursPerPerson)} h`} hint="总工时 / 参与人数" />
            <MiniMetric label="趋势斜率" value={formatNumber(projectStat.trendSlope, 2)} hint="近期投入方向" />
          </div>
          <div className="focus-summary-card">
            <strong>分析提示</strong>
            <p>
              {projectStat.trendSlope > 0.8
                ? `${detail.projectName} 的投入呈上升趋势，需确认这是正常冲刺还是返工增加。`
                : projectStat.trendSlope < -0.8
                  ? `${detail.projectName} 的投入近期回落，可能进入收尾或优先级下降阶段。`
                  : `${detail.projectName} 的投入相对平稳，更适合关注人员分布和主题复杂度。`}{' '}
              {projectStat.participantCount >= 4 &&
              projectStat.averageHoursPerPerson <= 8
                ? '当前参与人数较多但人均投入偏低，需警惕多人浅介入。'
                : '当前参与面和人均投入相对匹配。'}
            </p>
          </div>
          <div className="focus-chart-grid">
            {chartShell('项目趋势', '按日期观察项目投入变化', trendOption)}
            {chartShell('人员构成', '项目内各成员投入分布', participantBarOption)}
            {chartShell('任务主题', '项目当前主要工作类型', topicBarOption)}
          </div>
        </>
      );

      const tasksPanel = (
        <section className="focus-table-card">
          <div className="focus-chart-header">
            <p className="panel-kicker">近期任务</p>
            <h4>该项目的任务明细</h4>
          </div>
          <div className="focus-list">
            {projectTasks.slice(0, 16).map((task) => (
              <div className="focus-list-row" key={`${task.taskId}-${task.date}`}>
                <div>
                  <span>{task.date}</span>
                  <strong>
                    {task.employeeName}
                  </strong>
                </div>
                <div>
                  <span>{task.topicLabel}</span>
                  <strong>{task.taskName}</strong>
                </div>
                <div>
                  <span>工时</span>
                  <strong>{formatNumber(task.reportHour)} h</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

      return (
        <>
          <FocusTabs
            labels={[
              { key: 'overview', label: '概览' },
              { key: 'tasks', label: '任务' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="focus-tab-panel">
            {activeTab === 'overview' ? overviewPanel : null}
            {activeTab === 'tasks' ? tasksPanel : null}
          </div>
        </>
      );
    }

    if (detail.kind === 'date' && detail.date) {
      const dayRows = view.employeeDays.filter((day) => day.date === detail.date);
      const dayTasks = view.tasks.filter((task) => task.date === detail.date);
      const projectNames = Array.from(new Set(dayTasks.map((task) => task.projectName)));
      const topicNames = Array.from(new Set(dayTasks.map((task) => task.topicLabel)));

      const employeeBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: {
          type: 'category',
          data: dayRows.map((day) =>
            day.employeeName,
          ),
        },
        series: [
          {
            type: 'bar',
            data: dayRows.map((day) => day.reportHour),
            itemStyle: { color: '#0a84ff', borderRadius: 10 },
          },
        ],
      };

      const projectBarOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 24, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: projectNames },
        series: [
          {
            type: 'bar',
            data: projectNames.map((projectName) =>
              dayTasks
                .filter((task) => task.projectName === projectName)
                .reduce((sum, task) => sum + task.reportHour, 0),
            ),
            itemStyle: { color: '#34c759', borderRadius: 10 },
          },
        ],
      };

      const topicPieOption = {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [
          {
            type: 'pie',
            radius: ['44%', '68%'],
            data: topicNames.map((topicLabel) => ({
              name: topicLabel,
              value: dayTasks
                .filter((task) => task.topicLabel === topicLabel)
                .reduce((sum, task) => sum + task.reportHour, 0),
            })),
          },
        ],
      };

      const overviewPanel = (
        <>
          <div className="focus-overview">
            <div>
              <p className="panel-kicker">{detail.title}</p>
              <h3>{detail.date}</h3>
              <p className="focus-lead">
                这里聚焦展示这一天的投入结构，适合看谁最忙、哪些项目吸收了工时、当天任务主题偏向什么。
              </p>
            </div>
            <div className="focus-tags">
              <MetaPill tone="real">真实工时</MetaPill>
            </div>
          </div>
          <div className="focus-metrics-grid">
            <MiniMetric label="总工时" value={`${formatNumber(dayRows.reduce((sum, day) => sum + day.reportHour, 0))} h`} hint="当天总投入" />
            <MiniMetric label="活跃员工" value={`${dayRows.length}`} hint="当天有记录的人数" />
            <MiniMetric label="项目数" value={`${projectNames.length}`} hint="当天涉及的项目" />
            <MiniMetric label="异常员工日" value={`${dayRows.filter((day) => day.isAnomalous).length}`} hint="当天命中的异常规则" />
          </div>
          <div className="focus-summary-card">
            <strong>分析提示</strong>
            <p>这个日期视角适合识别当天是否出现异常高负载、多人同时切换项目，或项目投入是否异常集中。</p>
          </div>
          <div className="focus-chart-grid">
            {chartShell('员工负载', '当天每位成员投入情况', employeeBarOption)}
            {chartShell('项目分布', '当天工时流向了哪些项目', projectBarOption)}
            {chartShell('主题构成', '当天任务类型占比', topicPieOption)}
          </div>
        </>
      );

      const tasksPanel = (
        <section className="focus-table-card">
          <div className="focus-chart-header">
            <p className="panel-kicker">当日任务</p>
            <h4>该日期下的任务明细</h4>
          </div>
          <div className="focus-list">
            {dayTasks.slice(0, 16).map((task) => (
              <div className="focus-list-row" key={`${task.taskId}-${task.employeeId}`}>
                <div>
                  <span>
                    {task.employeeName}
                  </span>
                  <strong>{task.projectName}</strong>
                </div>
                <div>
                  <span>{task.topicLabel}</span>
                  <strong>{task.taskName}</strong>
                </div>
                <div>
                  <span>工时</span>
                  <strong>{formatNumber(task.reportHour)} h</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

      return (
        <>
          <FocusTabs
            labels={[
              { key: 'overview', label: '概览' },
              { key: 'tasks', label: '任务' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <div className="focus-tab-panel">
            {activeTab === 'overview' ? overviewPanel : null}
            {activeTab === 'tasks' ? tasksPanel : null}
          </div>
        </>
      );
    }

    return (
      <>
        <div className="focus-overview">
          <div>
            <p className="panel-kicker">{detail.title}</p>
            <h3>{detail.subtitle}</h3>
          </div>
          <div className="focus-tags">
            <MetaPill tone="derived">基础明细</MetaPill>
          </div>
        </div>
        <section className="focus-table-card">
          <div className="focus-list">
            {detail.rows.map((row, index) => (
              <div className="focus-list-row" key={`${detail.subtitle}-${index}`}>
                {Object.entries(row).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </>
    );
  };

  return (
    <AnimatePresence>
      {detail ? (
        <motion.div
          className="detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.aside
            className="detail-drawer"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.24 }}
          >
            <div className="detail-header">
              <div>
                <p className="panel-kicker">Focused Analysis</p>
                <h3>聚焦分析面板</h3>
              </div>
              <button className="ghost-button" onClick={onClose} type="button">
                关闭
              </button>
            </div>
            <div className="detail-content">{renderContent()}</div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
