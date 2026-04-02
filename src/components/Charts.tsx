import React from 'react'
import { Pie, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  LineElement, PointElement, LinearScale, CategoryScale
} from 'chart.js'
import { supabase } from '../lib/supabase'

ChartJS.register(ArcElement, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale)

type Category = { id: string; name: string; color: string | null }
type MonthlySpent = { category_id: string; spent_amount: number }

const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#a855f7']

export default function Charts({ monthISO, categories, spentByCat }: {
  monthISO: string
  categories: Category[]
  spentByCat: MonthlySpent[]
}) {
  const [trend, setTrend] = React.useState<{ month: string; total: number }[]>([])

  React.useEffect(() => {
    supabase.from('v_monthly_total').select('month,spent_amount')
      .then(({ data }) => {
        if (!data) return
        const sorted = [...(data as any[])].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
        setTrend(sorted.map(r => ({ month: r.month.slice(0, 7), total: r.spent_amount })))
      })
  }, [monthISO])

  const pieData = {
    labels: categories.map(c => c.name),
    datasets: [{
      data: categories.map(c => {
        const s = spentByCat.find(x => x.category_id === c.id)
        return s?.spent_amount ?? 0
      }),
      backgroundColor: categories.map((c, i) => c.color || COLORS[i % COLORS.length]),
      borderWidth: 0,
    }]
  }

  const lineData = {
    labels: trend.map(t => t.month),
    datasets: [{
      label: '支出合計',
      data: trend.map(t => t.total),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      tension: 0.3,
      fill: true,
      pointBackgroundColor: '#3b82f6',
    }]
  }

  const chartOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12 } } } },
  }
  const lineOptions = {
    ...chartOptions,
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v: any) => `¥${Number(v).toLocaleString()}` }, grid: { color: '#1e293b' } },
    }
  }

  const hasData = spentByCat.some(s => s.spent_amount > 0)

  return (
    <>
      {hasData && (
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>カテゴリ別内訳</h3>
          <div style={{ maxWidth: 280, margin: '0 auto' }}>
            <Pie data={pieData} options={chartOptions} />
          </div>
        </div>
      )}
      {trend.length > 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>月次支出推移</h3>
          <Line data={lineData} options={lineOptions as any} />
        </div>
      )}
    </>
  )
}
