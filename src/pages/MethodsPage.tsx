import { Panel } from '../components/Panel';
import { MetaPill } from '../components/MetaPill';
import { formatNumber, formatPercent } from '../lib/format';
import type { AnalyticsView } from '../types';

interface MethodsPageProps {
  view: AnalyticsView;
}

export function MethodsPage({ view }: MethodsPageProps) {
  const lowSample = view.dataHealth.sampleDays < 14;
  const topSwitcher = view.employeeStats[0];
  const topProject = view.projectStats[0];

  return (
    <div className="page-grid">
      <Panel
        title="阅读顺序"
        subtitle="先理解口径，再解读图表"
        note="这个页面把当前版本里最容易被误读的指标和图表口径集中说明，避免把观察性结果误当成结论。"
        className="panel-wide"
        meta={
          <div className="chart-meta">
            <MetaPill tone={lowSample ? 'warning' : 'healthy'}>
              {lowSample ? '低样本模式' : '样本相对充足'}
            </MetaPill>
            <span>当前样本天数：{view.dataHealth.sampleDays}</span>
            <span>数据健康分：{view.dataHealth.score}</span>
          </div>
        }
      >
        <div className="callout">
          <strong>推荐顺序：先看质量页，再看总览，再看相关性和智能体。</strong>
          <span>
            如果质量页提示样本不足、覆盖率偏低或未分类任务偏高，应把所有异常视为线索，而不是直接作为管理结论。
          </span>
        </div>
      </Panel>

      <Panel
        title="核心指标"
        subtitle="KPI 是怎么来的"
        note="这些指标都基于当前解析后的工时数据和规则推导结果。"
      >
        <ul className="report-list">
          <li>`总工时`：筛选范围内所有员工日工时之和。</li>
          <li>`人均工时`：总工时 / 活跃员工数，属于规则推导指标。</li>
          <li>`跨项目人数`：至少有 1 天涉及多个项目的员工数。</li>
          <li>`异常员工日`：由高工时、任务过碎、多项目切换、核验缺口叠加得到。</li>
          <li>`数据健康分`：覆盖率、未分类任务率、高风险 flag 比例、样本长度的组合分。</li>
        </ul>
      </Panel>

      <Panel
        title="重点参数说明"
        subtitle="斜率、多项目率、参与度这些参数怎么解释"
        note="这些参数可以用于图表和分析语句，但前提是先理解口径和限制。"
        className="panel-wide"
      >
        <div className="methods-grid">
          <div className="method-card">
            <MetaPill tone="derived">趋势斜率</MetaPill>
            <p>定义：把项目每天工时视为时间序列，用线性回归得到的斜率。</p>
            <p>含义：大于 0 代表近期投入上升，小于 0 代表近期投入回落，接近 0 代表相对平稳。</p>
            <p>适合：项目趋势折线图、项目清单、智能体项目风险语句。</p>
            <p>限制：样本太短时非常敏感，不能直接代表项目“变好”或“变差”。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="derived">多项目率</MetaPill>
            <p>定义：员工在观察期内，多项目工作日 / 全部工作日。</p>
            <p>含义：越高说明上下文切换越频繁，沟通与恢复成本通常也越高。</p>
            <p>适合：员工散点图、员工表格、异常检测、智能体建议。</p>
            <p>限制：高多项目率有时来自岗位职责，不一定等于低效，需要结合任务主题和工时看。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="derived">集中度</MetaPill>
            <p>定义：员工在单一项目上的最大工时占总工时比例。</p>
            <p>含义：越高说明更聚焦在主项目，越低说明工时更分散。</p>
            <p>适合：员工统计表、员工热力图详情、智能体负载判断。</p>
            <p>限制：集中度高不一定更好，可能只是某个项目压垮了关键人。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="derived">参与人数</MetaPill>
            <p>定义：观察期内在某项目上至少有 1 条任务记录的员工人数。</p>
            <p>含义：越高表示项目参与面更广，但不代表协作一定更高效。</p>
            <p>适合：项目气泡图、项目清单、资源配置讨论。</p>
            <p>限制：参与人数高但人均投入低，往往意味着多人浅介入而不是高效协同。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="derived">人均投入</MetaPill>
            <p>定义：项目总工时 / 参与人数。</p>
            <p>含义：帮助识别项目是“少人深耕”还是“多人浅介入”。</p>
            <p>适合：项目清单、项目气泡图、智能体建议语句。</p>
            <p>限制：不能单独评价效率，必须结合趋势斜率和主题复杂度一起看。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="derived">主题复杂度</MetaPill>
            <p>定义：一个项目中出现过多少种任务主题标签。</p>
            <p>含义：越高说明项目同时承载的工作类型越多，协同要求通常更高。</p>
            <p>适合：项目气泡图、智能体项目异常说明。</p>
            <p>限制：当前主题来自规则词典，复杂度会受分类质量影响。</p>
          </div>
        </div>
      </Panel>

      <Panel
        title="示例分析语句"
        subtitle="这些参数适不适合直接写进分析结论"
        note="可以，但必须带限定语。建议使用“提示”“可能”“需要复核”这类表达，而不是绝对判断。"
      >
        <ul className="report-list">
          <li>
            {topProject
              ? `“${topProject.projectName} 的趋势斜率为 ${formatNumber(topProject.trendSlope)}，提示近期投入呈上升态势，建议结合里程碑或返工信号进一步复核。”`
              : '“某项目趋势斜率上升，提示近期投入抬升，需要结合里程碑判断是否正常。”'}
          </li>
          <li>
            {topSwitcher
              ? `“${topSwitcher.name} 的多项目率为 ${formatPercent(topSwitcher.multiProjectRate)}，提示存在较高上下文切换风险，建议复核任务排班。”`
              : '“某成员多项目率偏高，提示存在上下文切换损耗风险。”'}
          </li>
          <li>“某项目参与人数高但人均投入低，提示可能存在多人浅介入，需要澄清角色边界。”</li>
          <li>“某成员集中度偏低，说明工时分散到多个方向，建议确认是否存在临时插单。”</li>
          <li>不建议写：“斜率高说明项目做得好”“多项目率高说明员工效率低”“参与人数多说明协同质量高”。</li>
        </ul>
      </Panel>

      <Panel
        title="图表口径"
        subtitle="应该如何阅读当前各页图表"
        note="图表右上和图表下方的标签已经开始显示来源、方法和可靠性。"
      >
        <ul className="report-list">
          <li>`总览趋势`：按日期聚合真实工时，只适合看波动，不适合判断长期效率。</li>
          <li>`工时流向`：真实工时叠加规则主题分类，受任务命名质量影响。</li>
          <li>`相关性热力图`：当前使用皮尔逊相关，只能发现候选关系，不能推出因果。</li>
          <li>`异常散点`：来自规则阈值异常检测，不代表人员绩效异常。</li>
          <li>`协同分析预留位`：目前仍是示意数据，只验证图面和未来接口结构。</li>
        </ul>
      </Panel>

      <Panel
        title="数据来源"
        subtitle="不同颜色的标签分别代表什么"
        note="建议任何管理会议都先确认看的是哪类数据。"
        className="panel-wide"
      >
        <div className="methods-grid">
          <div className="method-card">
            <MetaPill tone="real">真实工时</MetaPill>
            <p>直接来自当前 `工时数据.txt` 的解析结果。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="derived">规则推导</MetaPill>
            <p>由真实数据进一步计算得到，例如异常分、集中度、主题分类。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="mock">示意数据</MetaPill>
            <p>用于验证 Git / AI / 用户反馈协同分析界面，当前不代表真实业务数据。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="model">模型结果</MetaPill>
            <p>来自 Gemini 或智能体生成的文本，应被视为辅助解释，而不是原始事实。</p>
          </div>
          <div className="method-card">
            <MetaPill tone="warning">低样本</MetaPill>
            <p>说明当前页结果受样本长度或质量限制，建议谨慎解读。</p>
          </div>
        </div>
      </Panel>

      <Panel
        title="当前限制"
        subtitle="哪些结论现在还不能下"
        note="这一部分直接来自需求和 research 文档约束。"
      >
        <ul className="report-list">
          <li>当前只有短样本工时数据，不能做稳定绩效判断。</li>
          <li>真实 Git、PR、用户反馈、AI 使用还未全量接入，协同分析不能下正式结论。</li>
          <li>相关性分析没有显著性和因果检验，不应当作因果证据。</li>
          <li>任务主题分类仍主要依赖规则词典，语义复杂任务可能被误分类。</li>
        </ul>
      </Panel>
    </div>
  );
}
