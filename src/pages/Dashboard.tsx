import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { monthStart, toISODate, daysInMonth, toDateString } from '../lib/date'
import { yen } from '../lib/money'
import ExpenseForm from '../components/ExpenseForm'
import Charts from '../components/Charts'

type Category = { id: string; name: string; color: string | null; is_drinking: boolean; is_active: boolean; sort_order: number }
type Budget = { category_id: string; budget_amount: number }
type MonthlySpent = { category_id: string; spent_amount: number }

export default function Dashboard() {
  const [current, setCurrent] = useState(() => monthStart(new Date()))
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [spentByCat, setSpentByCat] = useState<MonthlySpent[]>([])
  const [monthlyTotal, setMonthlyTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const monthISO = useMemo(() => toISODate(current), [current])

  async function reload() {
    setLoading(true)
    await supabase.rpc('apply_recurring_for_month', { p_month: monthISO })

    const [catsRes, budgetsRes, spentRes, totalRes] = await Promise.all([
      supabase.from('categories').select('id,name,color,is_drinking,is_active,sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('budgets').select('category_id,budget_amount').eq('month', monthISO),
      supabase.from('v_monthly_by_category').select('category_id,spent_amount').eq('month', monthISO),
      supabase.from('v_monthly_total').select('spent_amount').eq('month', monthISO).maybeSingle(),
    ])

    setCategories((catsRes.data ?? []) as Category[])
    setBudgets((budgetsRes.data ?? []) as Budget[])
    setSpentByCat((spentRes.data ?? []) as MonthlySpent[])
    setMonthlyTotal((totalRes.data?.spent_amount ?? 0) as number)
    setLoading(false)
  }

  useEffect(() => { reload() }, [monthISO])

  const budgetMap = useMemo(() => new Map(budgets.map(x => [x.category_id, x.budget_amount])), [budgets])
  const spentMap = useMemo(() => new Map(spentByCat.map(x => [x.category_id, x.spent_amount])), [spentByCat])
  const monthBudgetTotal = useMemo(() => categories.reduce((s, c) => s + (budgetMap.get(c.id) ?? 0), 0), [categories, budgetMap])

  const today = new Date()
  const isThisMonth = today.getFullYear() === current.getFullYear() && today.getMonth() === current.getMonth()
  const elapsed = isThisMonth ? today.getDate() : daysInMonth(current)
  const dim = daysInMonth(current)
  const allowToToday = monthBudgetTotal > 0 ? Math.floor(monthBudgetTotal * elapsed / dim) : 0
  const remainingMonth = monthBudgetTotal - monthlyTotal
  const remainingToday = allowToToday - monthlyTotal
  const overMonth = monthlyTotal > monthBudgetTotal && monthBudgetTotal > 0
  const overDaily = monthlyTotal > allowToToday && monthBudgetTotal > 0

  async function csvExport() {
    const { data } = await supabase.from('expenses')
      .select('spent_on,amount,memo,categories(name)')
      .gte('spent_on', monthISO)
      .lt('spent_on', toISODate(new Date(current.getFullYear(), current.getMonth() + 1, 1)))
      .order('spent_on')
    if (!data) return
    const rows = [['日付', 'カテゴリ', '金額', 'メモ']]
    for (const r of data as any[]) rows.push([r.spent_on, r.categories?.name ?? '', r.amount, r.memo ?? ''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv)
    a.download = `kakeibo-${monthISO}.csv`
    a.click()
  }

  return (
    <div>
      {/* 月ナビ */}
      <div className="hrow" style={{ marginBottom: 12, paddingTop: 4 }}>
        <button className="btn" onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))}>◀</button>
        <span style={{ fontWeight: 700, fontSize: 18, flex: 1, textAlign: 'center' }}>
          {current.getFullYear()}年{current.getMonth() + 1}月
        </span>
        <button className="btn" onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))}>▶</button>
      </div>

      {/* KPIカード */}
      <div className="kpiGrid">
        <div className={`kpiCard ${overMonth ? 'danger' : ''}`}>
          <div className="kpiTitle">今月の残り予算</div>
          <div className="kpiValue" style={{ color: remainingMonth < 0 ? '#ef4444' : '#22c55e', fontSize: 16 }}>
            {yen(remainingMonth)}
          </div>
          <div className="kpiSub">予算 {yen(monthBudgetTotal)}</div>
          <div className="kpiSub">使用 {yen(monthlyTotal)}</div>
        </div>
        <div className={`kpiCard ${overDaily ? 'danger' : ''}`}>
          <div className="kpiTitle">今日使っていい額</div>
          <div className="kpiValue" style={{ color: remainingToday < 0 ? '#ef4444' : '#22c55e', fontSize: 16 }}>
            {yen(remainingToday)}
          </div>
          <div className="kpiSub">{elapsed}/{dim}日 経過</div>
          {overDaily && <span className="badge warn" style={{ marginTop: 4 }}>日割り超過</span>}
        </div>
      </div>

      {/* 支出入力 */}
      <div className="card">
        <h3 style={{ marginBottom: 12, fontSize: 14 }}>支出を記録</h3>
        <ExpenseForm categories={categories} defaultDate={isThisMonth ? today : current} onSaved={reload} />
      </div>

      {/* カテゴリ別消化率 */}
      <div className="card">
        <h3 style={{ marginBottom: 12, fontSize: 14 }}>カテゴリ別 予算消化率</h3>
        {loading ? <p style={{ color: '#94a3b8', fontSize: 13 }}>読み込み中...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {categories.map((c, i) => {
              const b = budgetMap.get(c.id) ?? 0
              const s = spentMap.get(c.id) ?? 0
              const pct = b > 0 ? Math.round(s * 100 / b) : 0
              const over = b > 0 && s > b
              const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#a855f7']
              const color = c.color || COLORS[i % COLORS.length]
              return (
                <div key={c.id}>
                  <div className="hrow" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>¥{s.toLocaleString()} / ¥{b.toLocaleString()}</span>
                    {over ? <span className="badge danger">超過</span> : pct >= 80 ? <span className="badge warn">{pct}%</span> : <span className="badge ok">{pct}%</span>}
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: over ? '#ef4444' : color }} />
                  </div>
                </div>
              )
            })}
            {categories.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>設定からカテゴリを追加してください</p>}
          </div>
        )}
      </div>

      <Charts monthISO={monthISO} categories={categories} spentByCat={spentByCat} />
    </div>
  )
}
