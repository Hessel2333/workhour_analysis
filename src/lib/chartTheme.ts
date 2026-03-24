type ChartOption = Record<string, any>;

const AXIS_LABEL = {
  color: '#6e6e73',
  fontSize: 12,
  margin: 12,
};

const AXIS_LINE = {
  show: false,
};

const AXIS_TICK = {
  show: false,
};

const SPLIT_LINE = {
  lineStyle: {
    color: 'rgba(15, 23, 42, 0.08)',
  },
};

function themeAxis(
  axis: ChartOption | ChartOption[] | undefined,
): ChartOption | ChartOption[] | undefined {
  if (!axis) return axis;

  if (Array.isArray(axis)) {
    return axis.map((item) => themeAxis(item));
  }

  return {
    ...axis,
    axisLabel: {
      ...AXIS_LABEL,
      ...(axis.axisLabel ?? {}),
    },
    axisLine: {
      ...AXIS_LINE,
      ...(axis.axisLine ?? {}),
    },
    axisTick: {
      ...AXIS_TICK,
      ...(axis.axisTick ?? {}),
    },
    splitLine:
      axis.type === 'value' || axis.splitLine
        ? {
            ...SPLIT_LINE,
            ...(axis.splitLine ?? {}),
          }
        : axis.splitLine,
    nameTextStyle: {
      color: '#6e6e73',
      fontSize: 12,
      ...(axis.nameTextStyle ?? {}),
    },
  };
}

export function withChartTheme(option: ChartOption): ChartOption {
  return {
    ...option,
    animationDuration: 280,
    textStyle: {
      color: '#1d1d1f',
      fontFamily:
        '"SF Pro Display","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
      ...(option.textStyle ?? {}),
    },
    tooltip: {
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderWidth: 0,
      textStyle: {
        color: '#1d1d1f',
        fontSize: 12,
      },
      extraCssText:
        'box-shadow: 0 12px 32px rgba(15,23,42,0.12); border-radius: 14px; padding: 10px 12px;',
      ...(option.tooltip ?? {}),
    },
    legend: option.legend
      ? {
          textStyle: {
            color: '#6e6e73',
            fontSize: 12,
            ...(option.legend.textStyle ?? {}),
          },
          itemWidth: 10,
          itemHeight: 10,
          ...(option.legend ?? {}),
        }
      : undefined,
    xAxis: themeAxis(option.xAxis),
    yAxis: themeAxis(option.yAxis),
    grid: {
      ...(option.grid ?? {}),
    },
  };
}
