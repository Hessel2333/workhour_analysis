import { Panel } from '../components/Panel';
import { MetaPill } from '../components/MetaPill';
import { analysisConfig } from '../config/analysisConfig';
import { formatNumber, formatPercent } from '../lib/format';
import { getUncategorizedRateMetric, getVerificationCoverageMetric } from '../lib/metrics';
import type { AnalyticsView } from '../types';

interface MethodsPageProps {
  view: AnalyticsView;
}

type MethodTone = 'real' | 'mock' | 'derived' | 'model' | 'warning' | 'healthy';

interface ReadingStep {
  step: string;
  title: string;
  body: string;
}

interface MetricDefinitionCard {
  name: string;
  explanation: string;
  formula: string;
  fields: string[];
  applies: string[];
  avoid: string[];
  tone: MethodTone;
  sourceLabel: string;
}

interface MetricDefinitionGroup {
  id: string;
  title: string;
  description: string;
  metrics: MetricDefinitionCard[];
}

const METHOD_SECTION_LINKS = [
  { href: '#methods-overview', label: '概览' },
  { href: '#methods-employee-metrics', label: '员工指标' },
  { href: '#methods-project-metrics', label: '项目指标' },
  { href: '#methods-quality-metrics', label: '质量指标' },
  { href: '#methods-reading-guide', label: '图表写法' },
  { href: '#methods-boundary', label: '来源边界' },
] as const;

const READING_STEPS: ReadingStep[] = [
  {
    step: '01',
    title: '先看质量页',
    body: '先确认样本长度、未分类率、核验覆盖率和高风险提醒，判断当前结果是“可描述”还是“只能找线索”。',
  },
  {
    step: '02',
    title: '再看总览 / 员工 / 项目',
    body: '总览负责找方向，员工页看负载与切换，项目页看投入结构与返工压力，不要把多种口径混成一个结论。',
  },
  {
    step: '03',
    title: '相关性只做候选关系',
    body: '相关图当前只说明同步变化强弱，不代表因果，也不适合直接写成管理动作。',
  },
  {
    step: '04',
    title: '智能体结论必须复核',
    body: '模型输出适合作为解释草稿和复盘提示，最终判断仍然要回到任务明细、规则口径和业务节点。',
  },
];

const METRIC_GROUPS: MetricDefinitionGroup[] = [
  {
    id: 'methods-employee-metrics',
    title: '员工负载与排班',
    description: '这组指标主要回答“谁更值得优先复盘、谁更像在持续切换或救火”。',
    metrics: [
      {
        name: '员工风险分',
        explanation: '用于给员工复盘优先级排序的综合分数，重点反映切换负担、投入分散和异常工作日叠加后的风险线索。',
        formula: '多项目率 × 45 + (1 - 集中度) × 30 + 异常日数量 × 6 + min(任务数 / 40, 1) × 19',
        fields: ['employeeDays.projectCount', 'employeeDays.isAnomalous', 'tasks.reportHour', 'tasks.projectName', 'employee.taskCount'],
        applies: ['团队内部识别更值得优先复盘的员工样本', '辅助分析切换负担、工时分散和任务堆叠'],
        avoid: ['不适合用于绩效考核', '不适合跨团队、跨岗位横向比较'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
      {
        name: '救火指数',
        explanation: '用于识别员工是否长期处于返工、支持、插单处理等救火型工作状态。',
        formula: '返工占比 × 44 + 现场支持占比 × 22 + 多项目率 × 20 + min(异常日 / 8, 1) × 14',
        fields: ['tasks.topicLabel', 'tasks.taskName', 'tasks.reportHour', 'employee.multiProjectRate', 'employee.anomalyDayCount'],
        applies: ['识别流程性救火、高支持负担、频繁插单', '作为排班、资源分配、流程治理的线索'],
        avoid: ['不适合作为个人工作价值判断', '不适合脱离任务详情单独解读'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
      {
        name: '多项目切换率',
        explanation: '员工在全部工作日中，参与多个项目的工作日占比，适合描述上下文切换负担。',
        formula: '多项目工作日数 / 全部工作日数',
        fields: ['employeeDays.projectCount'],
        applies: ['衡量上下文切换负担', '作为员工风险分与救火指数的基础项'],
        avoid: ['不适合代表协同能力强弱', '不适合在任务拆分粒度差异很大的团队间直接比较'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
      {
        name: '集中度',
        explanation: '员工总工时中，投入最多的单一项目所占比例，用来判断投入是否过于分散或过于集中。',
        formula: '单一项目最大工时 / 总工时',
        fields: ['tasks.projectName', 'tasks.reportHour'],
        applies: ['判断一个员工的投入是否集中在少数重点项目', '作为员工风险分的基础项'],
        avoid: ['不适合简单把高集中度理解成更好', '样本时间很短时容易被单个项目节点放大'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
    ],
  },
  {
    id: 'methods-project-metrics',
    title: '项目结构与节奏',
    description: '这组指标主要帮助判断项目是在建设、修补、维护还是多线并行推进。',
    metrics: [
      {
        name: '项目返工占比',
        explanation: '衡量某项目总工时中，返工、修补、反馈处理等工时占比。',
        formula: '返工类工时 / 项目总工时',
        fields: ['tasks.taskName', 'tasks.topicLabel', 'tasks.reportHour'],
        applies: ['识别修补型占比偏高的项目', '作为项目复盘、阶段判断、工作流治理的辅助线索'],
        avoid: ['不适合单独判断项目成败', '不适合忽略里程碑和上线节点直接横比'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
      {
        name: '项目阶段占比',
        explanation: '描述项目工时在需求/设计、开发、联调/测试、上线/发布、维护/反馈等阶段上的分布。',
        formula: '某阶段工时 / 项目总工时',
        fields: ['tasks.taskName', 'tasks.topicLabel', 'tasks.reportHour', 'detectTaskStage'],
        applies: ['观察项目是否长期停留在维护/反馈阶段', '查看阶段迁移是否符合预期节奏'],
        avoid: ['不适合当作标准项目管理流程审计结果', '不适合在任务命名极不规范时直接下结论'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
      {
        name: '趋势斜率',
        explanation: '把项目每天工时视为时间序列，用线性回归得到的斜率，大于 0 表示近期投入抬升，小于 0 表示回落。',
        formula: '按时间序列做线性回归后得到 slope',
        fields: ['tasks.date', 'tasks.projectName', 'tasks.reportHour'],
        applies: ['项目趋势折线图、项目清单、项目风险提示语句', '判断近期投入是升温、回落还是平稳'],
        avoid: ['不适合代表项目变好或变差', '样本太短时非常敏感，必须结合里程碑一起读'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
      {
        name: '参与人数 / 人均投入 / 主题复杂度',
        explanation: '这三个指标通常要一起看，用来分辨项目是少人深耕、多人浅介入，还是同时承载了过多主题。',
        formula: '参与人数 = 至少 1 条任务记录的员工数；人均投入 = 总工时 / 参与人数；主题复杂度 = 项目出现的主题标签数',
        fields: ['tasks.employeeId', 'tasks.projectName', 'tasks.reportHour', 'tasks.topicLabel'],
        applies: ['项目气泡图、项目清单、资源配置讨论', '识别多人浅介入或主题过多的项目'],
        avoid: ['不适合孤立评价效率', '主题复杂度受规则词典覆盖度影响'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
    ],
  },
  {
    id: 'methods-quality-metrics',
    title: '质量与可信度',
    description: '这组指标回答“当前页面到底能不能信到可以开会用”的问题。',
    metrics: [
      {
        name: '数据健康分',
        explanation: '评估当前筛选结果是否适合做描述性分析，重点衡量覆盖率、分类完整性、质量风险和样本长度。',
        formula: '100 - (1 - 覆盖率) × 35 - 未分类率 × 20 - 高风险提醒占比 × 25 - max(0, 7 - 样本天数) × 3',
        fields: ['globalMetrics.coverageRate', 'tasks.topicLabel', 'qualityFlags.severity', 'globalMetrics.sampleDays'],
        applies: ['判断当前图表更适合描述性分析还是线索发现', '辅助阅读质量页、总览页、方法页'],
        avoid: ['不代表业务健康度', '不代表团队执行质量或成员表现'],
        tone: 'healthy',
        sourceLabel: '真实 + 规则',
      },
      {
        name: '未分类率',
        explanation: '当前任务样本中，未命中任务主题分类规则的占比，用来判断规则词典覆盖度。',
        formula: '未分类任务数 / 全部任务数',
        fields: ['tasks.topicLabel'],
        applies: ['判断当前规则词典覆盖度', '辅助评估质量页与数据健康分'],
        avoid: ['不适合直接代表任务文本质量优劣', '不适合作为业务风险本身来解读'],
        tone: 'derived',
        sourceLabel: '规则推导',
      },
      {
        name: '核验覆盖率',
        explanation: '当前任务样本中，处于已核验状态的任务占比，用来判断流程完整度和后续质量分析的基础可信度。',
        formula: '已核验任务数 / 全部任务数',
        fields: ['tasks.verifyState'],
        applies: ['判断流程完整度', '作为后续质量漏斗和数据可信度分析的基础指标'],
        avoid: ['不适合把已核验直接理解成完全准确', '不适合忽略核验标准差异就做跨团队对比'],
        tone: 'real',
        sourceLabel: '真实工时',
      },
    ],
  },
  {
    id: 'methods-collab-metrics',
    title: '协同扩展与占位指标',
    description: '这组指标目前主要用于未来接 Git / AI / 用户反馈后的扩展分析，现阶段不能按真实业务结论使用。',
    metrics: [
      {
        name: 'AI 深度分',
        explanation: '用于描述 AI 使用记录中调用深度与复杂度的示意性分数，当前仅服务于 UI 占位、交互验证和未来真实接入预留。',
        formula: '当前阶段无真实业务公式，来自 mock connector 的示意值',
        fields: ['connectors.ai.depthScore', 'connectors.ai.callCount', 'connectors.ai.inputTokens', 'connectors.ai.outputTokens'],
        applies: ['只用于 UI 占位、交互验证和未来真实接入预留'],
        avoid: ['不可用于任何个人或团队管理判断', '不可与真实工时、返工率做正式相关性结论'],
        tone: 'mock',
        sourceLabel: '模拟来源',
      },
    ],
  },
];

const CHART_GUIDES = [
  {
    title: '总览趋势只看波动，不看绩效',
    body: '总览趋势图是按日期聚合真实工时，用来识别投入上升、回落和节假日扰动，不适合直接评价长期效率。',
  },
  {
    title: '相关性图只给候选关系',
    body: '热力图和散点图当前只说明同步变化强弱，不代表因果，也没有显著性检验。',
  },
  {
    title: '异常点先回到任务明细',
    body: '员工异常、项目返工和质量提醒都来自阈值或规则命中，看到异常点时应先点开详情再决定动作。',
  },
];

const SOURCE_GUIDES = [
  {
    tone: 'real' as const,
    title: '真实工时',
    body: '直接来自当前上传的工时明细，是所有分析的底层事实来源。',
  },
  {
    tone: 'derived' as const,
    title: '规则推导',
    body: '由真实数据继续计算得到，例如异常分、集中度、阶段占比和主题分类。',
  },
  {
    tone: 'mock' as const,
    title: '模拟来源',
    body: '只用于验证 Git / AI / 用户反馈协同分析界面，当前不代表真实业务数据。',
  },
  {
    tone: 'model' as const,
    title: '模型结果',
    body: '来自 Gemini 或智能体生成的解释，应被视为辅助说明，而不是原始事实。',
  },
];

export function MethodsPage({ view }: MethodsPageProps) {
  const lowSample = view.dataHealth.sampleDays < analysisConfig.thresholds.lowSampleDays;
  const topSwitcher = view.employeeStats[0];
  const topProject = view.projectStats[0];
  const uncategorizedRateMetric = getUncategorizedRateMetric(view.tasks);
  const verificationCoverageMetric = getVerificationCoverageMetric(view.tasks);
  const highSeverityCount = view.qualityFlags.filter((flag) => flag.severity === 'high').length;
  const highSeverityRate = view.qualityFlags.length ? highSeverityCount / view.qualityFlags.length : 0;

  return (
    <div className="page-grid">
      <div className="methods-floating-nav methods-anchor-section">
        <nav className="methods-anchor-nav" aria-label="方法说明页内导航">
          {METHOD_SECTION_LINKS.map((item) => (
            <a className="methods-anchor-link" href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <section className="methods-anchor-section" id="methods-overview">
        <Panel
          title="方法说明"
          subtitle="先确认边界，再读趋势、异常和建议"
          note="这里已经把 metric-definitions.md 里的核心指标口径整合成页面内手册。先用这一页校准理解，再去看总览、员工、项目和相关性页面。"
          className="panel-wide panel-strip methods-hero-panel"
          meta={
            <div className="chart-meta">
              <MetaPill tone={lowSample ? 'warning' : 'healthy'}>
                {lowSample ? '低样本模式' : '样本相对充足'}
              </MetaPill>
              <span>当前样本天数：{view.dataHealth.sampleDays}</span>
              <span>覆盖率：{formatPercent(view.dataHealth.coverageRate)}</span>
              <span>高风险提醒占比：{formatPercent(highSeverityRate)}</span>
            </div>
          }
        >
          <div className="methods-hero-grid">
            <div className="methods-hero-lead">
              <p className="methods-lead">
                方法页的目标不是证明系统“算得很复杂”，而是让你在几分钟内判断:
                现在看到的是事实、推导、示意，还是只能继续复核的线索。
              </p>
              <div className="methods-health-strip">
                <div className="methods-health-card">
                  <span>数据健康分</span>
                  <strong>{view.dataHealth.score}</strong>
                  <small>{view.dataHealth.summary}</small>
                </div>
                <div className="methods-health-card">
                  <span>未分类率</span>
                  <strong>{formatPercent(uncategorizedRateMetric.value)}</strong>
                  <small>{uncategorizedRateMetric.uncategorizedTaskCount} 条任务未命中规则</small>
                </div>
                <div className="methods-health-card">
                  <span>核验覆盖率</span>
                  <strong>{formatPercent(verificationCoverageMetric.value)}</strong>
                  <small>{verificationCoverageMetric.verifiedTaskCount} 条任务已核验</small>
                </div>
              </div>
            </div>

            <div className="methods-route-grid">
              {READING_STEPS.map((item) => (
                <div className="methods-route-card" key={item.step}>
                  <span className="methods-route-step">{item.step}</span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </section>

      <section className="methods-anchor-section" id="methods-metric-library">
        <Panel
          title="指标定义库"
          subtitle="把公式、字段、适用范围和限制放到一页里"
          note="建议把这里当作术语表使用。看到图表里的某个指标不确定是什么意思时，直接回到这一页查定义、字段来源和不适用场景。"
          className="panel-wide"
        >
          <div className="metric-library">
            {METRIC_GROUPS.map((group) => (
              <section className="metric-group methods-anchor-section" id={group.id} key={group.title}>
                <div className="metric-group-header">
                  <div>
                    <p className="panel-kicker">{group.title}</p>
                    <h3 className="metric-group-title">{group.description}</h3>
                  </div>
                </div>

                <div className="metric-group-grid">
                  {group.metrics.map((metric) => (
                    <article className="metric-card" key={metric.name}>
                      <div className="metric-card-header">
                        <div>
                          <h4>{metric.name}</h4>
                        </div>
                        <MetaPill tone={metric.tone}>{metric.sourceLabel}</MetaPill>
                      </div>

                      <p className="metric-card-text">{metric.explanation}</p>

                      <div className="metric-formula-block">
                        <span className="metric-section-label">计算公式</span>
                        <code className="metric-formula">{metric.formula}</code>
                      </div>

                      <div className="metric-formula-block">
                        <span className="metric-section-label">使用字段</span>
                        <div className="metric-chip-row">
                          {metric.fields.map((field) => (
                            <span className="metric-chip" key={field}>
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="metric-usage-grid">
                        <div className="metric-usage-card">
                          <strong>适用范围</strong>
                          {metric.applies.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                        <div className="metric-usage-card caution">
                          <strong>不适用场景</strong>
                          {metric.avoid.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Panel>
      </section>

      <section className="methods-anchor-section" id="methods-reading-guide">
        <Panel
          title="图表读法与写法"
          subtitle="把线索写成谨慎、可执行的句子"
          note="推荐使用“提示”“可能”“建议复核”这类表达，而不是直接把观察性结果写成定论。"
          className="panel-wide"
        >
          <div className="methods-dual-grid">
            <div className="methods-guide-grid">
              {CHART_GUIDES.map((item) => (
                <div className="methods-guide-card" key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>

            <div className="methods-writing">
              <div className="callout">
                <strong>推荐写法</strong>
                <span>
                  {topProject
                    ? `“${topProject.projectName} 的趋势斜率为 ${formatNumber(topProject.trendSlope, 1)}，提示近期投入呈上升态势，建议结合里程碑与返工信号继续复核。”`
                    : '“某项目趋势斜率上升，提示近期投入抬升，需要结合里程碑判断是否正常。”'}
                </span>
                <span>
                  {topSwitcher
                    ? `“${topSwitcher.name} 的多项目率为 ${formatPercent(topSwitcher.multiProjectRate)}，提示上下文切换风险偏高，建议回看排班和插单情况。”`
                    : '“某成员多项目率偏高，提示存在上下文切换损耗风险。”'}
                </span>
              </div>

              <div className="callout methods-writing-warning">
                <strong>不建议直接这么写</strong>
                <span>“斜率高说明项目做得好”</span>
                <span>“多项目率高说明员工效率低”</span>
                <span>“参与人数多说明协同质量高”</span>
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="methods-anchor-section" id="methods-boundary">
        <Panel
          title="来源标签与当前边界"
          subtitle="先问数据来自哪里，再问能不能下结论"
          note="任何管理会议前都建议先对齐来源标签。真实工时、规则推导、模拟来源和模型解释的可信等级并不一样。"
          className="panel-wide"
        >
          <div className="methods-dual-grid">
            <div className="methods-grid">
              {SOURCE_GUIDES.map((item) => (
                <div className="method-card" key={item.title}>
                  <MetaPill tone={item.tone}>{item.title}</MetaPill>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>

            <div className="methods-limits">
              <div className="callout">
                <strong>当前版本里不能直接下的结论</strong>
                <span>当前只有短样本工时数据，不能做稳定绩效判断。</span>
                <span>真实 Git、PR、用户反馈、AI 使用尚未全量接入，协同分析不能下正式结论。</span>
                <span>相关性分析没有显著性和因果检验，不应当作因果证据。</span>
                <span>任务主题分类仍主要依赖规则词典，复杂语义任务可能被误分类。</span>
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
