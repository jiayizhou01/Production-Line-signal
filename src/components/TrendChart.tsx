 import { useEffect, useRef } from 'react'
 import * as echarts from 'echarts'

 interface SeriesConfig {
   name: string
   data: number[]
   color?: string
   type?: 'line' | 'bar'
 }

 interface TrendChartProps {
   title: string
   xAxis: string[]
   series: SeriesConfig[]
  yAxisName?: string
  formatter?: string
  onPointClick?: (dataIndex: number, seriesIndex: number) => void
  onRangeClick?: () => void
}

export default function TrendChart({ title, xAxis, series, yAxisName, formatter = '{value}', onPointClick, onRangeClick }: TrendChartProps) {
   const chartRef = useRef<HTMLDivElement>(null)
   const chartInstance = useRef<echarts.ECharts | null>(null)

   useEffect(() => {
     if (!chartRef.current) return
     const instance = echarts.init(chartRef.current)
     chartInstance.current = instance

     const option: echarts.EChartsOption = {
       tooltip: {
         trigger: 'axis',
        backgroundColor: '#ffffff',
        borderColor: '#d5d5d5',
        textStyle: { color: '#1e1e1e' }
       },
      grid: { left: 48, right: 12, top: 38, bottom: 28 },
      legend: { top: 2, right: 0, textStyle: { color: '#787777', fontSize: 11 } },
       xAxis: {
         type: 'category',
         data: xAxis,
        axisLine: { lineStyle: { color: '#d5d5d5' } },
        axisLabel: { color: '#787777', fontSize: 11 }
       },
       yAxis: {
         type: 'value',
         name: yAxisName,
        nameTextStyle: { color: '#787777', fontSize: 11 },
        splitLine: { lineStyle: { color: '#d5d5d5', type: 'dashed' } },
        axisLabel: { color: '#787777', formatter, fontSize: 11 }
       },
       series: series.map((s) => ({
         name: s.name,
         type: s.type || 'line',
         data: s.data,
         smooth: true,
         symbolSize: 6,
         itemStyle: { color: s.color },
        lineStyle: { width: 2, color: s.color || '#1e1e1e' }
       }))
     }
     instance.setOption(option)
     const handleClick = (params: { componentType?: string; dataIndex?: number; seriesIndex?: number }) => {
       if (params.componentType === 'series' && typeof params.dataIndex === 'number') onPointClick?.(params.dataIndex, params.seriesIndex ?? 0)
     }
     instance.on('click', handleClick)

     const handleResize = () => instance.resize()
     window.addEventListener('resize', handleResize)
     return () => {
       window.removeEventListener('resize', handleResize)
       instance.dispose()
     }
   }, [title, xAxis, series, yAxisName, formatter])

  return (
    <div className="ui-chart-panel">
      {onRangeClick ? <button type="button" onClick={onRangeClick} className="mb-4 block text-left font-bold text-[#1e1e1e] hover:text-[#950000] focus:outline-none focus:ring-2 focus:ring-[#e1a300]" title="查看当前筛选时间段的数据">{title}</button> : <h3 className="mb-4">{title}</h3>}
       <div ref={chartRef} className="w-full h-72" role={onPointClick ? "button" : undefined} tabIndex={onPointClick ? 0 : undefined} title={onPointClick ? "查看对应生产日报" : undefined} onKeyDown={(event) => { if (onPointClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onPointClick(Math.max(0, xAxis.length - 1), 0) } }} />
     </div>
  )
}
