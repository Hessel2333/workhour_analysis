export type PageKey =
  | 'overview'
  | 'agent'
  | 'r_lab'
  | 'methods'
  | 'settings'
  | 'employees'
  | 'projects'
  | 'tasks'
  | 'quality'
  | 'correlation'
  | 'report';

export interface RawTask {
  Id: string;
  Name: string;
  ProjectName: string;
  ReportDay: number;
  ReportHour: number;
  VerifyDay: number;
  VerifyHour: number;
  VerifyState: string;
}

export interface RawEmployeeDay {
  Date: string;
  ReportDay: number;
  ReportHour: number;
  TaskList: RawTask[] | null;
  VerifyDay: number;
  VerifyHour: number;
}

export interface RawEmployee {
  Avatar: string;
  DetailList: RawEmployeeDay[] | null;
  Id: string;
  Name: string;
}

export interface RawWorkhourResponse {
  id: string;
  jsonrpc: string;
  result: RawEmployee[];
}

export interface Employee {
  employeeId: string;
  name: string;
  avatar: string;
  hasDetail: boolean;
  maskedLabel: string;
}

export interface EmployeeDay {
  employeeId: string;
  employeeName: string;
  date: string;
  reportDay: number;
  reportHour: number;
  verifyDay: number;
  verifyHour: number;
  taskCount: number;
  projectCount: number;
  isOvertime: boolean;
  isHeavyOvertime: boolean;
  isAnomalous: boolean;
  anomalyScore: number;
}

export interface Task {
  taskId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  projectName: string;
  taskName: string;
  reportHour: number;
  reportDay: number;
  verifyHour: number;
  verifyDay: number;
  verifyState: string;
  topicLabel: string;
  topicConfidence: number;
  topicSource: 'rule' | 'fallback';
  topicRuleName: string;
  keywordHits: string[];
}

export interface TaskTopic {
  taskId: string;
  topicLabel: string;
  topicConfidence: number;
  topicSource: 'rule' | 'fallback';
  topicRuleName: string;
}

export interface QualityFlag {
  entityType: 'employee' | 'employeeDay' | 'task' | 'dataset';
  entityId: string;
  flagType: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface GitMetric {
  projectName: string;
  employeeId: string;
  date: string;
  commitCount: number;
  locAdded: number;
  locDeleted: number;
  prCount: number;
  reviewHours: number;
}

export interface AiUsageMetric {
  employeeId: string;
  date: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  depthScore: number;
  redactedTheme: string;
}

export interface FeedbackMetric {
  projectName: string;
  date: string;
  score: number;
  sentiment: number;
  feedbackCount: number;
  themeLabel: string;
}

export interface ConnectorBundle {
  git: GitMetric[];
  ai: AiUsageMetric[];
  feedback: FeedbackMetric[];
}

export interface BaseDataset {
  employees: Employee[];
  employeeDays: EmployeeDay[];
  tasks: Task[];
  taskTopics: TaskTopic[];
  qualityFlags: QualityFlag[];
  ingestionSummary: {
    rawTaskCount: number;
    validTaskCount: number;
    excludedImpossibleTaskCount: number;
    rawEmployeeDayCount: number;
    validEmployeeDayCount: number;
    excludedImpossibleDayCount: number;
  };
  dateRange: {
    start: string;
    end: string;
  };
  notes: string[];
  connectors: ConnectorBundle;
}

export interface Filters {
  periodMode: 'month' | 'year';
  overtimeMode: 'standard' | 'bigSmallWeek';
  startDate: string;
  endDate: string;
  employeeId: string;
  projectName: string;
  topicLabel: string;
}

export interface GlobalMetrics {
  totalHours: number;
  activeEmployees: number;
  projectCount: number;
  averageHoursPerEmployee: number;
  averageDailyHours: number;
  crossProjectEmployees: number;
  fragmentationRate: number;
  coverageRate: number;
  anomalyDayRate: number;
  sampleDays: number;
}

export interface EmployeeStat {
  employeeId: string;
  name: string;
  maskedLabel: string;
  totalHours: number;
  averageDailyHours: number;
  projectCount: number;
  taskCount: number;
  multiProjectRate: number;
  focusScore: number;
  overtimeDayCount: number;
  heavyOvertimeDayCount: number;
  anomalyDayCount: number;
}

export interface ProjectStat {
  projectName: string;
  totalHours: number;
  participantCount: number;
  taskCount: number;
  trendSlope: number;
  averageHoursPerPerson: number;
  topicDiversity: number;
  primaryTopic: string;
}

export interface TopicStat {
  topicLabel: string;
  totalHours: number;
  taskCount: number;
  coverageRate: number;
  keywords: string[];
}

export interface CorrelationCell {
  x: string;
  y: string;
  value: number;
}

export interface QualitySummary {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DataHealthSummary {
  score: number;
  status: 'healthy' | 'watch' | 'risk';
  coverageRate: number;
  uncategorizedRate: number;
  highSeverityRate: number;
  sampleDays: number;
  summary: string;
}

export interface ReportBlock {
  title: string;
  body: string;
}

export interface AgentIssue {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  scope: 'employee' | 'project' | 'dataset';
  subject: string;
  subjectMasked: string;
  subjectReal: string;
  summary: string;
  evidence: string[];
  recommendations: string[];
  score: number;
}

export interface AgentRecommendation {
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  rationale: string;
  actions: string[];
}

export interface AgentReport {
  mode: 'local_rules';
  generatedAt: string;
  summary: string;
  issues: AgentIssue[];
  recommendations: AgentRecommendation[];
  llmPrompt: string;
}

export interface AnalyticsView {
  employees: Employee[];
  employeeDays: EmployeeDay[];
  tasks: Task[];
  taskTopics: TaskTopic[];
  qualityFlags: QualityFlag[];
  globalMetrics: GlobalMetrics;
  employeeStats: EmployeeStat[];
  projectStats: ProjectStat[];
  topicStats: TopicStat[];
  correlations: CorrelationCell[];
  reportBlocks: ReportBlock[];
  qualitySummary: QualitySummary;
  dataHealth: DataHealthSummary;
  uniqueDates: string[];
  projectNames: string[];
  agentReport: AgentReport;
}

export interface DetailSelection {
  kind: 'employee' | 'project' | 'date' | 'task' | 'generic';
  title: string;
  subtitle: string;
  employeeId?: string;
  projectName?: string;
  date?: string;
  taskId?: string;
  highlightDate?: string;
  rows: Array<Record<string, string | number>>;
}

export interface TopicRule {
  name: string;
  label: string;
  keywords: string[];
}
