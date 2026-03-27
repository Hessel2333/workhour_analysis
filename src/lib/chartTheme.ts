import { formatNumber } from './format';

type ChartOption = Record<string, any>;

function axisItems(axis: ChartOption | ChartOption[] | undefined) {
  if (!axis) return [];
  return Array.isArray(axis) ? axis : [axis];
}

function hasAxisName(axis: ChartOption | ChartOption[] | undefined) {
  return axisItems(axis).some(
    (item) => typeof item?.name === 'string' && item.name.trim().length > 0,
  );
}

function visualMapItems(visualMap: ChartOption | ChartOption[] | undefined) {
  if (!visualMap) return [];
  return Array.isArray(visualMap) ? visualMap : [visualMap];
}

function hasBottomHorizontalVisualMap(visualMap: ChartOption | ChartOption[] | undefined) {
  return visualMapItems(visualMap).some((item) => {
    const orient = item?.orient ?? 'horizontal';
    return orient === 'horizontal' && item?.bottom != null;
  });
}

function seriesItems(series: ChartOption | ChartOption[] | undefined) {
  if (!series) return [];
  return Array.isArray(series) ? series : [series];
}

function hasSeriesType(series: ChartOption | ChartOption[] | undefined, type: string) {
  return seriesItems(series).some((item) => item?.type === type);
}

function gridItems(grid: ChartOption | ChartOption[] | undefined) {
  if (!grid) return [];
  return Array.isArray(grid) ? grid : [grid];
}

function normalizeVisualMap(
  visualMap: ChartOption | ChartOption[] | undefined,
  isCompact: boolean,
  secondaryTextColor: string,
): ChartOption | ChartOption[] | undefined {
  if (!visualMap) return visualMap;

  const normalizeItem = (item: ChartOption) => {
    const orient = item?.orient ?? 'horizontal';
    const isBottomHorizontal = orient === 'horizontal' && item?.bottom != null;

    return {
      ...item,
      textStyle: {
        color: secondaryTextColor,
        fontSize: isCompact ? 11 : 12,
        ...(item?.textStyle ?? {}),
      },
      textGap: item?.textGap ?? (isCompact ? 8 : 10),
      inRange: item?.inRange,
      text: item?.text,
      borderColor: item?.borderColor ?? 'transparent',
      backgroundColor: item?.backgroundColor ?? 'transparent',
      ...(isBottomHorizontal
        ? {
            bottom:
              typeof item.bottom === 'number'
                ? Math.max(item.bottom, isCompact ? 10 : 12)
                : item.bottom ?? (isCompact ? 10 : 12),
          }
        : {}),
    };
  };

  return Array.isArray(visualMap)
    ? visualMap.map((item) => normalizeItem(item))
    : normalizeItem(visualMap);
}

function ensureGridMin(value: unknown, minimum: number) {
  if (typeof value === 'number') {
    return Math.max(value, minimum);
  }
  return value ?? minimum;
}

function compactGridInset(
  value: unknown,
  fallback: number,
  maximum?: number,
) {
  if (typeof value === 'number') {
    const clamped = Math.max(value, fallback);
    return maximum != null ? Math.min(clamped, maximum) : clamped;
  }

  return fallback;
}

function formatTooltipValue(value: unknown) {
  if (typeof value === 'number') {
    return formatNumber(value, 1);
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '');
    const numeric = Number(normalized);
    if (!Number.isNaN(numeric) && normalized.trim() !== '') {
      return formatNumber(numeric, 1);
    }
  }

  return String(value ?? '');
}

function middleEllipsisLabel(value: unknown, isCompact: boolean) {
  const text = String(value ?? '');
  const maxLength = isCompact ? 10 : 18;
  if (text.length <= maxLength) {
    return text;
  }

  const headLength = isCompact ? 5 : 10;
  const tailLength = isCompact ? 3 : 5;
  return `${text.slice(0, headLength)}…${text.slice(-tailLength)}`;
}

function truncateCategoryLabel(
  value: unknown,
  isCompact: boolean,
  dimension: 'x' | 'y',
) {
  const text = String(value ?? '');
  const maxLength = isCompact
    ? dimension === 'x'
      ? 8
      : 10
    : dimension === 'x'
      ? 12
      : 18;

  if (text.length <= maxLength) {
    return text;
  }

  if (dimension === 'x') {
    return `${text.slice(0, Math.max(maxLength - 1, 1))}…`;
  }

  return middleEllipsisLabel(text, isCompact);
}

function inferTimeAxisName(data: unknown) {
  if (!Array.isArray(data) || data.length === 0) return '';
  const labels = data.map((item) => String(item ?? '')).filter(Boolean);
  if (!labels.length) return '';

  if (labels.every((label) => /^\d{4}-\d{2}-\d{2}$/.test(label))) {
    return '日期';
  }

  if (labels.every((label) => /^\d{4}-\d{2}$/.test(label))) {
    return '月份';
  }

  if (labels.every((label) => /^\d{4}-W\d{2}$/.test(label))) {
    return '周次';
  }

  return '';
}

function isPercentSemanticName(name: string) {
  return /(占比|多项目率|集中度|聚焦度)/.test(name);
}

function isHourSemanticName(name: string) {
  return /(工时|小时)/.test(name) && !isPercentSemanticName(name);
}

function normalizeAxisName(axis: ChartOption, dimension: 'x' | 'y') {
  const inferredTimeName =
    dimension === 'x' && axis.type === 'category' && !axis.name
      ? inferTimeAxisName(axis.data)
      : '';
  const rawName = String(axis.name ?? inferredTimeName ?? '').trim();
  if (!rawName) return rawName;

  if (isPercentSemanticName(rawName)) {
    return /[%％]/.test(rawName) ? rawName : `${rawName}（%）`;
  }

  if (isHourSemanticName(rawName)) {
    if (/[（(]h[）)]/i.test(rawName)) {
      return rawName;
    }
    if (rawName.includes('小时')) {
      return rawName.replace(/小时/g, '（h）');
    }
    return `${rawName}（h）`;
  }

  return rawName;
}

function themeAxis(
  axis: ChartOption | ChartOption[] | undefined,
  textColor: string,
  lineColor: string,
  isCompact: boolean,
  dimension: 'x' | 'y',
): ChartOption | ChartOption[] | undefined {
  if (!axis) return axis;

  if (Array.isArray(axis)) {
    return axis.map((item) => themeAxis(item, textColor, lineColor, isCompact, dimension));
  }

  return {
    ...axis,
    name: normalizeAxisName(axis, dimension),
    ...(dimension === 'x' && (axis.name || inferTimeAxisName(axis.data))
      ? {
          nameLocation: axis.nameLocation ?? 'middle',
          nameGap: axis.nameGap ?? (isCompact ? 28 : 34),
        }
      : {}),
    axisLabel: {
      ...(
        axis.type === 'category'
          ? {
              width:
                dimension === 'y'
                  ? isCompact
                    ? 132
                    : 220
                  : isCompact
                    ? 64
                    : 96,
              overflow: 'truncate',
              ellipsis: '…',
              ...(axis.axisLabel?.formatter == null
                ? {
                    formatter: (value: unknown) =>
                      truncateCategoryLabel(value, isCompact, dimension),
                  }
                : {}),
              ...(dimension === 'x' && isCompact && axis.axisLabel?.rotate == null
                ? {
                    rotate: Array.isArray(axis.data) && axis.data.length > 4 ? 24 : 0,
                  }
                : {}),
            }
          : {}
      ),
      color: textColor,
      fontSize: isCompact ? 9 : 10,
      margin: isCompact ? (dimension === 'x' ? 10 : 6) : 8,
      hideOverlap: true, // 自动隐藏重叠的标签
      ...(axis.type === 'value' && isPercentSemanticName(normalizeAxisName(axis, dimension)) && axis.axisLabel?.formatter == null
        ? {
            formatter: '{value}%',
          }
        : {}),
      ...(axis.type === 'value' && !isPercentSemanticName(normalizeAxisName(axis, dimension)) && axis.axisLabel?.formatter == null
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
      fontSize: isCompact ? 10 : 12,
      ...(axis.nameTextStyle ?? {}),
    },
  };
}

export function withChartTheme(
  option: ChartOption,
  isDark = false,
  isCompact = false,
): ChartOption {
  const textColor = isDark ? '#f5f5f7' : '#1d1d1f';
  const lineColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.06)';
  const secondaryTextColor = isDark ? '#c7c7cc' : '#5b5b60';
  const optionGrid = option.grid ?? {};
  const gridList = gridItems(option.grid);
  const hasGridArray = Array.isArray(option.grid);
  const hasHeatmapSeries = hasSeriesType(option.series, 'heatmap');
  const legend = option.legend
    ? {
        type: isCompact ? 'scroll' : option.legend.type,
        textStyle: {
          color: secondaryTextColor,
          fontSize: isCompact ? 10 : 12,
          lineHeight: isCompact ? 14 : 16,
          ...(option.legend.textStyle ?? {}),
        },
        itemWidth: isCompact ? 8 : 10,
        itemHeight: isCompact ? 8 : 10,
        itemGap: option.legend.itemGap ?? (isCompact ? 10 : 16),
        pageIconColor: textColor,
        pageTextStyle: {
          color: secondaryTextColor,
          ...(option.legend.pageTextStyle ?? {}),
        },
        ...(isCompact && option.legend.formatter == null
          ? {
              formatter: (name: string) => truncateCategoryLabel(name, true, 'x'),
            }
          : {}),
        ...(option.legend ?? {}),
      }
    : undefined;
  const visualMap = normalizeVisualMap(
    option.visualMap,
    isCompact,
    secondaryTextColor,
  );

  const hasTopLegend = Boolean(legend && legend.top != null && legend.bottom == null);
  const hasBottomLegend = Boolean(legend && legend.bottom != null);
  const hasBottomVisualMap = hasBottomHorizontalVisualMap(visualMap);
  const xAxis = themeAxis(option.xAxis, textColor, lineColor, isCompact, 'x');
  const yAxis = themeAxis(option.yAxis, textColor, lineColor, isCompact, 'y');
  const hasXAxisName = hasAxisName(xAxis);
  const defaultBottom = isCompact ? (hasBottomLegend ? 58 : 34) : 40;
  let minimumBottom = defaultBottom;

  if (hasBottomVisualMap) {
    minimumBottom = Math.max(
      minimumBottom,
      hasHeatmapSeries ? (isCompact ? 64 : 70) : (isCompact ? 82 : 86),
    );
  }

  if (hasXAxisName) {
    minimumBottom = Math.max(minimumBottom, isCompact ? 50 : 50);
  }

  if (hasBottomVisualMap && hasXAxisName) {
    minimumBottom = Math.max(
      minimumBottom,
      hasHeatmapSeries ? (isCompact ? 78 : 84) : (isCompact ? 102 : 110),
    );
  }

  const compactTop = hasTopLegend ? 40 : 18;
  const compactTopMax = hasTopLegend ? 44 : 24;
  const compactBottom = hasBottomVisualMap
    ? minimumBottom
    : hasBottomLegend
      ? 52
      : hasXAxisName
        ? 46
        : 28;

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
      triggerOn: 'mousemove|click',
      backgroundColor: isDark ? 'rgba(28, 28, 30, 0.94)' : 'rgba(255, 255, 255, 0.96)',
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'transparent',
      textStyle: {
        color: textColor,
        fontSize: isCompact ? 11 : 12,
        lineHeight: isCompact ? 17 : 18,
      },
      extraCssText: `box-shadow: 0 12px 32px ${
        isDark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.12)'
      }; border-radius: 14px; padding: ${isCompact ? '8px 10px' : '10px 12px'}; max-width: ${
        isCompact ? '72vw' : 'min(360px, 80vw)'
      }; white-space: normal; backdrop-filter: blur(10px);`,
      valueFormatter:
        option.tooltip?.valueFormatter ??
        ((value: unknown) => formatTooltipValue(value)),
      ...(option.tooltip ?? {}),
    },
    legend,
    visualMap,
    xAxis,
    yAxis,
    grid: hasGridArray
      ? gridList.map((grid) => ({
          ...grid,
          bottom: isCompact
            ? compactGridInset(grid.bottom, compactBottom)
            : ensureGridMin(grid.bottom, minimumBottom),
          left: ensureGridMin(grid.left, isCompact ? 34 : 38),
          right: ensureGridMin(grid.right, 18),
          top: isCompact
            ? compactGridInset(grid.top, compactTop, compactTopMax)
            : ensureGridMin(grid.top, 40),
          containLabel: grid.containLabel ?? true,
        }))
      : {
          ...optionGrid,
          bottom: isCompact
            ? compactGridInset(optionGrid.bottom, compactBottom)
            : ensureGridMin(optionGrid.bottom, minimumBottom),
          left: ensureGridMin(optionGrid.left, isCompact ? 34 : 38),
          right: ensureGridMin(optionGrid.right, 18),
          top: isCompact
            ? compactGridInset(optionGrid.top, compactTop, compactTopMax)
            : ensureGridMin(optionGrid.top, 40),
          containLabel: optionGrid.containLabel ?? true,
        },
  };
}
