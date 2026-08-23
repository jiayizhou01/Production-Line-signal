import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface ScatterChartProps {
  title: string
  xAxisName: string
  yAxisName: string
  color: string
  points: { x: number; y: number; label: string; reportId?: string }[]
  onPointClick?: (dataIndex: number) => void
}

export default function ScatterChart({ title, xAxisName, yAxisName, color, points, onPointClick }: ScatterChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current) return
    const instance = echarts.init(chartRef.current)
    instance.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: '#ffffff',
        borderColor: '#d5d5d5',
        textStyle: { color: '#1e1e1e' },
        formatter: (params: unknown) => {
          const data = (params as { data?: { label?: string; value?: number[] } }).data
          return `${data?.label ?? ''}<br/>${xAxisName}：${data?.value?.[0]?.toFixed(1) ?? '—'}<br/>${yAxisName}：${data?.value?.[1]?.toFixed(1) ?? '—'}`
        }
      },
      grid: { left: 48, right: 14, top: 42, bottom: 36 },
      xAxis: {
        type: 'value',
        name: xAxisName,
        nameTextStyle: { color: '#787777', fontSize: 11 },
        axisLine: { lineStyle: { color: '#d5d5d5' } },
        axisLabel: { color: '#787777', fontSize: 11 },
        splitLine: { lineStyle: { color: '#d5d5d5', type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        name: yAxisName,
        nameTextStyle: { color: '#787777', fontSize: 11 },
        axisLine: { lineStyle: { color: '#d5d5d5' } },
        axisLabel: { color: '#787777', fontSize: 11 },
        splitLine: { lineStyle: { color: '#d5d5d5', type: 'dashed' } }
      },
      series: [{
        type: 'scatter',
        data: points.map((point) => ({ value: [point.x, point.y], label: point.label, reportId: point.reportId })),
        symbolSize: 8,
        itemStyle: { color }
      }]
    })

    const handleClick = (params: { componentType?: string; dataIndex?: number }) => {
      if (params.componentType === 'series' && typeof params.dataIndex === 'number') onPointClick?.(params.dataIndex)
    }
    instance.on('click', handleClick)

    const handleResize = () => instance.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      instance.dispose()
    }
  }, [color, points, title, xAxisName, yAxisName])

  return (
    <div className="ui-chart-panel">
      <h3 className="mb-4">{title}</h3>
      <div ref={chartRef} className="h-72 w-full" role={onPointClick ? "button" : undefined} tabIndex={onPointClick ? 0 : undefined} title={onPointClick ? "查看对应生产日报" : undefined} onKeyDown={(event) => { if (onPointClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onPointClick(0) } }} />
    </div>
  )
}
