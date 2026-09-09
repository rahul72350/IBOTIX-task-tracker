import { useTheme } from '../context/ThemeContext'

// Central place for chart colours so every chart matches the active theme.
export function useChartColors() {
  const { isDark } = useTheme()

  const light = {
    accent: '#17B8A6',
    presales: '#7F77DD',
    postsales: '#0F8577',
    dev: '#B45A15',
    success: '#1D9E75',
    warning: '#B4750F',
    neutral: '#9297AA',
    danger: '#C2483C',
    grid: '#E7E8F0',
    axis: '#5B6178',
    tooltipBg: '#FFFFFF',
    tooltipBorder: '#E7E8F0',
    tooltipText: '#12172B',
  }

  const dark = {
    accent: '#20D3BE',
    presales: '#A49CF5',
    postsales: '#3FCB97',
    dev: '#E09253',
    success: '#3FCB97',
    warning: '#E0A33C',
    neutral: '#767D93',
    danger: '#E8695C',
    grid: '#242B40',
    axis: '#A3A9BD',
    tooltipBg: '#1B2134',
    tooltipBorder: '#2E3650',
    tooltipText: '#E8EAF2',
  }

  const c = isDark ? dark : light

  return {
    ...c,
    // Palette used when slices/bars need distinct colours
    palette: [c.accent, c.presales, c.dev, c.warning, c.success, c.danger, c.neutral],
    byDepartment: {
      'Presales BA': c.presales,
      'Postsales BA': c.postsales,
      'Development': c.dev,
    },
    byStatus: {
      'Completed': c.neutral,
      'In Progress': c.success,
      'Active': c.success,
      'Not Started': c.neutral,
      'On Hold': c.warning,
      'Pending from Client': c.warning,
    },
    tooltipStyle: {
      background: c.tooltipBg,
      border: `1px solid ${c.tooltipBorder}`,
      borderRadius: 8,
      fontSize: 12.5,
      color: c.tooltipText,
    },
    axisTick: { fontSize: 12, fill: c.axis },
  }
}
