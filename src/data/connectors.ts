import { analysisConfig } from '../config/analysisConfig';
import type {
  AiUsageMetric,
  ConnectorBundle,
  FeedbackMetric,
  GitMetric,
} from '../types';

export function buildMockConnectors(
  projectNames: string[],
  employeeIds: string[],
  dateLabels: string[],
): ConnectorBundle {
  if (!analysisConfig.ruleToggles.showMockCharts) {
    return { git: [], ai: [], feedback: [] };
  }
  const git: GitMetric[] = [];
  const ai: AiUsageMetric[] = [];
  const feedback: FeedbackMetric[] = [];

  const activeProjects = projectNames.slice(0, analysisConfig.displayLimits.overviewTopProjects);
  const activeEmployees = employeeIds.slice(0, analysisConfig.displayLimits.employeeRank);
  const dates = dateLabels.slice(0, analysisConfig.displayLimits.overviewTopProjects);

  activeProjects.forEach((projectName, projectIndex) => {
    dates.forEach((date, dateIndex) => {
      feedback.push({
        projectName,
        date,
        score: 3.8 + ((projectIndex + dateIndex) % 3) * 0.35,
        sentiment: -0.1 + ((projectIndex * 2 + dateIndex) % 5) * 0.18,
        feedbackCount: 4 + ((projectIndex + dateIndex) % 6),
        themeLabel: ['稳定性', '易用性', '响应速度'][projectIndex % 3],
      });
    });
  });

  activeEmployees.forEach((employeeId, employeeIndex) => {
    dates.forEach((date, dateIndex) => {
      ai.push({
        employeeId,
        date,
        callCount: 3 + ((employeeIndex + dateIndex) % 7),
        inputTokens: 900 + employeeIndex * 260 + dateIndex * 140,
        outputTokens: 1200 + employeeIndex * 310 + dateIndex * 170,
        cost: 0.75 + employeeIndex * 0.22 + dateIndex * 0.11,
        depthScore: 58 + ((employeeIndex + dateIndex) % 5) * 8,
        redactedTheme: ['代码解释', '重构建议', '接口联调', '测试用例'][employeeIndex % 4],
      });
    });
  });

  activeProjects.forEach((projectName, projectIndex) => {
    activeEmployees
      .slice(0, analysisConfig.displayLimits.projectTierSize)
      .forEach((employeeId, employeeIndex) => {
        dates.forEach((date, dateIndex) => {
          if ((projectIndex + employeeIndex + dateIndex) % 2 === 0) {
            git.push({
              projectName,
              employeeId,
              date,
              commitCount: 1 + ((projectIndex + employeeIndex + dateIndex) % 5),
              locAdded: 45 + projectIndex * 18 + employeeIndex * 12,
              locDeleted: 15 + dateIndex * 10,
              prCount: 1 + ((employeeIndex + dateIndex) % 2),
              reviewHours: 0.8 + ((projectIndex + dateIndex) % 4) * 0.6,
            });
          }
        });
      });
  });

  return { git, ai, feedback };
}
