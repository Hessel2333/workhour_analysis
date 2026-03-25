export interface MetricDefinition<T = number> {
  value: T;
  label: string;
  description: string;
  formula?: string;
  limitations: string[];
}

export * from './employeeMetrics';
export * from './projectMetrics';
export * from './taskMetrics';
export * from './qualityMetrics';
export * from './correlationMetrics';
