import { formatNumber } from './format';

type ChartOption = Record<string, any>;

function themeAxis(
  axis: ChartOption | ChartOption[] | undefined,
  textColor: string,
  lineColor: string,
): ChartOption | ChartOption[] | undefined {
  if (!axis) return axis;

  if (Array.isArray(axis)) {
    return axis.map((item) => themeAxis(item, textColor, lineColor));
  }

  return {
    ...axis,
    axisLabel: {
      color: textColor,
      fontSize: 10, // 稍微缩小字体以增加空间
      margin: 8,    // 缩小边距
      hideOverlap: true, // 自动隐藏重叠的标签
      ...(axis.type === 'value' && axis.axisLabel?.formatter == null
        ? {
            formatter: (value: number) => formatNumber(Number(value), 1),
          }
        : {}),
      ...(axis.axisLabel ?? {}),
    },
    axisLine: {
      show: true, // 显示轴线有助于界定边界
      lineStyle: { color: lineColor },
      ...(axis.axisLine ?? {}),
    },
    axisTick: {
      show: false,
      ...(axis.axisTick ?? {}),
    },
    splitLine:
      axis.type === 'value' || axis.splitLine
        ? {
            lineStyle: {
              color: lineColor,
              type: 'dashed',
            },
            ...(axis.splitLine ?? {}),
          }
        : axis.splitLine,
    nameTextStyle: {
      color: textColor,
      fontSize: 12,
      ...(axis.nameTextStyle ?? {}),
    },
  };
}

export function withChartTheme(option: ChartOption, isDark = false): ChartOption {
  const textColor = isDark ? '#f5f5f7' : '#1d1d1f';
  const lineColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.06)';
  const secondaryTextColor = isDark ? '#c7c7cc' : '#5b5b60';

  return {
    ...option,
    animationDuration: 280,
    textStyle: {
      color: textColor,
      fontFamily:
        '"SF Pro Display","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
      ...(option.textStyle ?? {}),
    },
    tooltip: {
      backgroundColor: isDark ? 'rgba(28, 28, 30, 0.94)' : 'rgba(255, 255, 255, 0.96)',
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'transparent',
      textStyle: {
        color: textColor,
        fontSize: 12,
        lineHeight: 18,
      },
      extraCssText: `box-shadow: 0 12px 32px ${
        isDark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.12)'
      }; border-radius: 14px; padding: 10px 12px; backdrop-filter: blur(10px);`,
      ...(option.tooltip ?? {}),
    },
    legend: option.legend
      ? {
          textStyle: {
            color: secondaryTextColor,
            fontSize: 12,
            lineHeight: 16,
            ...(option.legend.textStyle ?? {}),
          },
          itemWidth: 10,
          itemHeight: 10,
          ...(option.legend ?? {}),
        }
      : undefined,
    xAxis: themeAxis(option.xAxis, textColor, lineColor),
    yAxis: themeAxis(option.yAxis, textColor, lineColor),
    grid: {
      bottom: 40,
      left: 45,
      right: 25,
      top: 45,
      containLabel: true,
      ...(option.grid ?? {}),
    },
  };
}
