import { analysisConfig } from '../config/analysisConfig';
import type { EmployeeDay, EmployeeStat, Task } from '../types';

const REVIEW_STOP_TOKENS = new Set(['相关', '处理', '工作', '项目', '任务', '跟进', '整理', '其他']);
const REVIEW_BIN_LABELS = ['0%', '0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50%+'] as const;
const REVIEW_CLUSTER_LABELS = ['主题簇 A', '主题簇 B', '主题簇 C'] as const;

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function countBy<T>(items: T[], keyOf: (item: T) => string) {
  return items.reduce((map, item) => {
    const key = keyOf(item);
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
}

export function buildReviewPoolTasks(tasks: Task[]) {
  return tasks.filter(
    (task) =>
      task.topicLabel === '未分类' ||
      task.topicLabel === '待确认' ||
      task.topicConfidence < analysisConfig.thresholds.lowTopicConfidence,
  );
}

export function extractReviewKeywords(text: string) {
  const value = text.trim();
  if (!value) return ['空任务'];

  const tokens = new Set<string>();
  const asciiTokens = value.match(/[A-Za-z][A-Za-z0-9_+#-]*/g) ?? [];
  asciiTokens
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2)
    .forEach((token) => tokens.add(token));

  const chineseSequences = value.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  chineseSequences.forEach((sequence) => {
    const chars = Array.from(sequence);
    if (chars.length >= 2 && chars.length <= 4) {
      tokens.add(sequence);
    }
    if (chars.length >= 2) {
      for (let index = 0; index < chars.length - 1; index += 1) {
        tokens.add(chars.slice(index, index + 2).join(''));
      }
    }
  });

  const filtered = Array.from(tokens).filter(
    (token) => token.length >= 2 && !REVIEW_STOP_TOKENS.has(token),
  );
  return filtered.length ? filtered : ['空任务'];
}

export function buildVerifyGapDistribution(employeeStats: EmployeeStat[], employeeDays: EmployeeDay[]) {
  const rates = employeeStats.map((employee) => {
    const days = employeeDays.filter((day) => day.employeeId === employee.employeeId);
    if (!days.length) return 0;
    return average(
      days.map((day) => (Number(day.verifyHour) === 0 && Number(day.reportHour) > 0 ? 1 : 0)),
    );
  });

  const bins = REVIEW_BIN_LABELS.map((label) => ({ label, count: 0 }));
  rates.forEach((rate) => {
    const percent = rate * 100;
    const index =
      percent <= 0
        ? 0
        : percent <= 10
          ? 1
          : percent <= 20
            ? 2
            : percent <= 30
              ? 3
              : percent <= 40
                ? 4
                : percent <= 50
                  ? 5
                  : 6;
    bins[index].count += 1;
  });

  return {
    sampleSize: employeeStats.length,
    averageRate: average(rates) * 100,
    medianRate: median(rates) * 100,
    bins,
  };
}

export function buildReviewKeywordFrequency(tasks: Task[]) {
  const reviewPool = buildReviewPoolTasks(tasks);
  const keywordCounts = countBy(
    reviewPool.flatMap((task) => extractReviewKeywords(task.taskName)),
    (keyword) => keyword,
  );
  const items = Array.from(keywordCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 12)
    .map(([keyword, count]) => ({ keyword, count }));

  return {
    totalReviewTasks: reviewPool.length,
    items,
  };
}

export function buildKeywordNetwork(tasks: Task[]) {
  const reviewPool = buildReviewPoolTasks(tasks);
  const keywordCounts = countBy(
    reviewPool.flatMap((task) => extractReviewKeywords(task.taskName)),
    (keyword) => keyword,
  );
  const topKeywords = Array.from(keywordCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 12)
    .map(([keyword]) => keyword);

  const pairCounts = new Map<string, number>();
  reviewPool.forEach((task) => {
    const taskKeywords = Array.from(
      new Set(extractReviewKeywords(task.taskName).filter((keyword) => topKeywords.includes(keyword))),
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

    for (let i = 0; i < taskKeywords.length; i += 1) {
      for (let j = i + 1; j < taskKeywords.length; j += 1) {
        const key = `${taskKeywords[i]}||${taskKeywords[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  });

  const nodes = topKeywords.map((keyword) => {
    const count = keywordCounts.get(keyword) ?? 0;
    return {
      name: keyword,
      value: count,
      symbolSize: Math.max(18, Math.min(50, 14 + count * 4)),
      category: /^[A-Za-z]/.test(keyword) ? '英文/术语' : '中文关键词',
    };
  });

  const links = Array.from(pairCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 18)
    .map(([pair, value]) => {
      const [source, target] = pair.split('||');
      return { source, target, value };
    });

  return { nodes, links };
}

export function buildReviewTopicMap(tasks: Task[]) {
  const { nodes, links } = buildKeywordNetwork(tasks);
  if (!nodes.length) {
    return { sampleSize: 0, points: [] as Array<{ name: string; x: number; y: number; clusterLabel: string; value: number }> };
  }

  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((node) => adjacency.set(node.name, new Set()));
  links.forEach((link) => {
    if (link.value >= 2) {
      adjacency.get(link.source)?.add(link.target);
      adjacency.get(link.target)?.add(link.source);
    }
  });

  const visited = new Set<string>();
  const clusters: string[][] = [];
  nodes.forEach((node) => {
    if (visited.has(node.name)) return;
    const queue = [node.name];
    const cluster: string[] = [];
    visited.add(node.name);
    while (queue.length) {
      const current = queue.shift()!;
      cluster.push(current);
      adjacency.get(current)?.forEach((next) => {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      });
    }
    clusters.push(cluster);
  });

  const sortedClusters = clusters
    .map((cluster) =>
      cluster.slice().sort((left, right) => {
        const leftValue = nodes.find((node) => node.name === left)?.value ?? 0;
        const rightValue = nodes.find((node) => node.name === right)?.value ?? 0;
        return rightValue - leftValue || left.localeCompare(right, 'zh-CN');
      }),
    )
    .sort((left, right) => right.length - left.length);

  const points = sortedClusters.slice(0, 3).flatMap((cluster, clusterIndex) => {
    const centerX = clusterIndex * 3.2;
    return cluster.map((keyword, index) => {
      const node = nodes.find((item) => item.name === keyword)!;
      const offsetY = cluster.length === 1 ? 0 : index - (cluster.length - 1) / 2;
      return {
        name: keyword,
        x: Number((centerX + (index % 2 === 0 ? 0.4 : -0.4)).toFixed(3)),
        y: Number((offsetY * 0.85).toFixed(3)),
        clusterLabel: REVIEW_CLUSTER_LABELS[Math.min(clusterIndex, REVIEW_CLUSTER_LABELS.length - 1)],
        value: node.value,
      };
    });
  });

  return {
    sampleSize: points.length,
    points,
  };
}
