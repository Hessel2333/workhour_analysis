import type { ProjectStat } from '../types';

export type ProjectStructureLabel =
  | '大盘协作型'
  | '高密度投入'
  | '主题分散型'
  | '增长拉升型'
  | '稳态项目';

export interface ProjectStructureProfile extends ProjectStat {
  structureLabel: ProjectStructureLabel;
  zScores: {
    totalHours: number;
    participantCount: number;
    topicDiversity: number;
    averageHoursPerPerson: number;
    trendSlope: number;
  };
}

export const PROJECT_STRUCTURE_LABEL_RULES = [
  {
    label: '大盘协作型' as const,
    rule: '总工时标准化值 >= 0.45 且参与人数标准化值 >= 0.30',
    meaning: '项目规模和协作面都明显高于当前样本均值，适合先从多人协同与资源编排角度看。',
  },
  {
    label: '高密度投入' as const,
    rule: '人均投入标准化值 >= 0.40',
    meaning: '人均投入显著偏高，更像少数核心成员深度投入的项目。',
  },
  {
    label: '主题分散型' as const,
    rule: '主题复杂度标准化值 >= 0.35',
    meaning: '项目内主题标签更分散，常见于同时承载多类工作内容的项目。',
  },
  {
    label: '增长拉升型' as const,
    rule: '趋势斜率标准化值 >= 0.35',
    meaning: '近期投入相对样本整体更明显抬升，适合结合时间窗口看是否进入冲刺或升温阶段。',
  },
  {
    label: '稳态项目' as const,
    rule: '以上条件都不满足时回落到默认标签',
    meaning: '结构与节奏都更接近样本均值，没有特别突出的单一结构特征。',
  },
] as const;

const PROJECT_STRUCTURE_LABEL_COLORS: Record<ProjectStructureLabel, string> = {
  大盘协作型: '#2563eb',
  高密度投入: '#ef4444',
  主题分散型: '#8b5cf6',
  增长拉升型: '#14b8a6',
  稳态项目: '#64748b',
};

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function safeScale(value: number, values: number[]) {
  const deviation = standardDeviation(values);
  if (!Number.isFinite(deviation) || deviation === 0) {
    return 0;
  }
  return (value - average(values)) / deviation;
}

export function labelProjectStructure(zScores: ProjectStructureProfile['zScores']): ProjectStructureLabel {
  if (zScores.totalHours >= 0.45 && zScores.participantCount >= 0.3) {
    return '大盘协作型';
  }
  if (zScores.averageHoursPerPerson >= 0.4) {
    return '高密度投入';
  }
  if (zScores.topicDiversity >= 0.35) {
    return '主题分散型';
  }
  if (zScores.trendSlope >= 0.35) {
    return '增长拉升型';
  }
  return '稳态项目';
}

export function buildProjectStructureProfiles(projectStats: ProjectStat[]): ProjectStructureProfile[] {
  const totalHoursValues = projectStats.map((item) => item.totalHours);
  const participantValues = projectStats.map((item) => item.participantCount);
  const topicValues = projectStats.map((item) => item.topicDiversity);
  const averageHoursValues = projectStats.map((item) => item.averageHoursPerPerson);
  const trendValues = projectStats.map((item) => item.trendSlope);

  return projectStats.map((project) => {
    const zScores = {
      totalHours: safeScale(project.totalHours, totalHoursValues),
      participantCount: safeScale(project.participantCount, participantValues),
      topicDiversity: safeScale(project.topicDiversity, topicValues),
      averageHoursPerPerson: safeScale(project.averageHoursPerPerson, averageHoursValues),
      trendSlope: safeScale(project.trendSlope, trendValues),
    };

    return {
      ...project,
      structureLabel: labelProjectStructure(zScores),
      zScores,
    };
  });
}

export function projectStructureLabelColor(label: ProjectStructureLabel) {
  return PROJECT_STRUCTURE_LABEL_COLORS[label];
}
