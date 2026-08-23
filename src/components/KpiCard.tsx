 import type { LucideIcon } from 'lucide-react'
 import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

 interface KpiCardProps {
   title: string
   value: string
   subtitle?: string
   trend?: number
   icon: LucideIcon
   iconColor?: string
 }

 export default function KpiCard({ title, value, subtitle, trend, icon: Icon, iconColor = 'bg-primary-100 text-primary-600' }: KpiCardProps) {
   const TrendIcon = trend === undefined ? Minus : trend >= 0 ? TrendingUp : TrendingDown
   const trendColor = trend === undefined ? 'text-slate-400' : trend >= 0 ? 'text-emerald-600' : 'text-red-500'

   return (
    <div className="ui-kpi-card">
       <div className="flex items-start justify-between">
         <div>
           <p className="text-sm font-medium text-slate-500">{title}</p>
           <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
           {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
         </div>
         <div className={`ui-kpi-icon w-10 h-10 flex items-center justify-center ${iconColor}`}>
           <Icon size={20} />
         </div>
       </div>
       {trend !== undefined && (
         <div className={`flex items-center gap-1 mt-4 text-xs font-medium ${trendColor}`}>
           <TrendIcon size={14} />
           <span>{`${trend >= 0 ? '+' : ''}${(trend * 100).toFixed(1)}%`}</span>
           <span className="text-slate-400 font-normal ml-1">较昨日</span>
         </div>
       )}
     </div>
   )
 }
