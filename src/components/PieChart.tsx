 import { useEffect, useRef } from 'react'
 import * as echarts from 'echarts'

 interface PieChartProps {
   title: string
   data: { name: string; value: number }[]
 }

 export default function PieChart({ title, data }: PieChartProps) {
   const chartRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
     if (!chartRef.current) return
     const instance = echarts.init(chartRef.current)
     const option: echarts.EChartsOption = {
       tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
       legend: { bottom: 0, left: 'center', textStyle: { color: '#787777', fontSize: 11 } },
       color: ['#1e1e1e', '#e1a300', '#950000', '#787777', '#d5d5d5'],
       series: [
         {
           name: title,
           type: 'pie',
           radius: ['45%', '70%'],
           center: ['50%', '45%'],
           avoidLabelOverlap: true,
           itemStyle: { borderRadius: 0, borderColor: '#ffffff', borderWidth: 2 },
           label: { show: false },
           data
         }
       ]
     }
     instance.setOption(option)
     const handleResize = () => instance.resize()
     window.addEventListener('resize', handleResize)
     return () => {
       window.removeEventListener('resize', handleResize)
       instance.dispose()
     }
   }, [title, data])

   return (
    <div className="ui-chart-panel">
      <h3 className="mb-4">{title}</h3>
       <div ref={chartRef} className="w-full h-64" />
     </div>
   )
 }
