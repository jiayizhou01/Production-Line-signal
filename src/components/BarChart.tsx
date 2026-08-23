 import { useEffect, useRef } from 'react'
 import * as echarts from 'echarts'

interface BarChartProps {
  title: string
  xAxis: string[]
  series: { name: string; data: number[]; color?: string; yAxisIndex?: number }[]
  dualAxis?: boolean
  onBarClick?: (dataIndex: number, seriesIndex: number) => void
}

export default function BarChart({ title, xAxis, series, dualAxis = false, onBarClick }: BarChartProps) {
   const chartRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
     if (!chartRef.current) return
     const instance = echarts.init(chartRef.current)
     const option: echarts.EChartsOption = {
       tooltip: { trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#d5d5d5', textStyle: { color: '#1e1e1e' } },
       grid: { left: 40, right: 12, top: 30, bottom: 28 },
       legend: { top: 0, right: 0, textStyle: { color: '#787777', fontSize: 11 } },
       xAxis: {
         type: 'category',
         data: xAxis,
         axisLine: { lineStyle: { color: '#d5d5d5' } },
         axisLabel: { color: '#787777', fontSize: 11 }
       },
       yAxis: dualAxis
         ? [
             { type: 'value', name: '比例(%)', splitLine: { lineStyle: { color: '#d5d5d5', type: 'dashed' } }, axisLabel: { color: '#787777', fontSize: 11 } },
             { type: 'value', name: 'UPPH', position: 'right', splitLine: { show: false }, axisLabel: { color: '#787777', fontSize: 11 } }
           ]
         : {
             type: 'value',
             splitLine: { lineStyle: { color: '#d5d5d5', type: 'dashed' } },
             axisLabel: { color: '#787777', fontSize: 11 }
           },
       series: series.map((s) => ({
         name: s.name,
         type: 'bar',
         data: s.data,
         yAxisIndex: s.yAxisIndex ?? 0,
         itemStyle: { color: s.color || '#1e1e1e', borderRadius: 0 },
         barMaxWidth: 32
       }))
     }
     instance.setOption(option)
     const handleClick = (params: { componentType?: string; dataIndex?: number; seriesIndex?: number }) => {
       if (params.componentType === 'series' && typeof params.dataIndex === 'number') onBarClick?.(params.dataIndex, params.seriesIndex ?? 0)
     }
     instance.on('click', handleClick)
     const handleResize = () => instance.resize()
     window.addEventListener('resize', handleResize)
     return () => {
       window.removeEventListener('resize', handleResize)
       instance.dispose()
     }
   }, [title, xAxis, series, dualAxis])

   return (
    <div className="ui-chart-panel">
      <h3 className="mb-4">{title}</h3>
       <div ref={chartRef} className="w-full h-72" role={onBarClick ? "button" : undefined} tabIndex={onBarClick ? 0 : undefined} title={onBarClick ? "查看对应生产日报" : undefined} onKeyDown={(event) => { if (onBarClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onBarClick(0, 0) } }} />
     </div>
   )
 }
