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

  const totalSpent = spentByCat.reduce((s, r) => s + r.spent_amount, 0)
  const hasData = spentByCat.some(s => s.spent_amount > 0)

  const catData = categories
    .map((c, i) => ({ c, i, s: spentByCat.find(x => x.category_id === c.id)?.spent_amount ?? 0 }))
    .filter(x => x.s > 0)

  const pieData = {
    labels: catData.map(x => {
      const pct = totalSpent > 0 ? Math.round(x.s * 100 / totalSpent) : 0
      return `${x.c.name} ${pct}%`
    }),
    datasets: [{
      data: catData.map(x => x.s),
      backgroundColor: catData.map(x => x.c.color || COLORS[x.i % COLORS.length]),
      borderWidth: 2,
      borderColor: '#0f172a',
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

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: '#94a3b8', font: { size: 11 }, padding: 10, boxWidth: 12 }
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `¥${ctx.raw.toLocaleString()}`
        }
      }
    }
  }

  const lineOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v: any) => `¥${Number(v).toLocaleString()}` }, grid: { color: '#1e293b' } },
    }
  }

  return (
    <>
      {hasData && (
        <div className="card">
          <div className="hrow" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>カテゴリ別内訳</h3>
            <span className="spacer" />
            <span style={{ fontSize: 13, color: '#94a3b8' }}>合計 ¥{totalSpent.toLocaleString()}</span>
          </div>
          <div style={{ maxWidth: 300, margin: '0 auto' }}>
            <Pie data={pieData} options={pieOptions} />
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
