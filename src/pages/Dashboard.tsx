import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { monthStart, toISODate, daysInMonth, toDateString } from '../lib/date'
import { yen } from '../lib/money'
import ExpenseForm from '../components/ExpenseForm'
import Charts from '../components/Charts'

type Category = { id: string; name: string; color: string | null; is_drinking: boolean; is_active: boolean; sort_order: number; exclude_from_daily: boolean; is_food: boolean }
type Budget = { category_id: string; budget_amount: number }
type MonthlySpent = { category_id: string; spent_amount: number }
type Allocation = { id: string; category_id: string | null; label: string; amount: number; allocated_date: string }
type CatExpense = { id: string; amount: number; memo: string | null; spent_on: string; category_id: string | null }

const COLORS_LIST = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#a855f7']

export default function Dashboard() {
  const [current, setCurrent] = useState(() => monthStart(new Date()))
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [spentByCat, setSpentByCat] = useState<MonthlySpent[]>([])
  const [monthlyTotal, setMonthlyTotal] = useState(0)
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  // 1. カテゴリ別履歴モーダル
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [catExpenses, setCatExpenses] = useState<CatExpense[]>([])
  const [catExpLoading, setCatExpLoading] = useState(false)

  const monthISO = useMemo(() => toISODate(current), [current])

  async function reload() {
    setLoading(true)
    await supabase.rpc('apply_recurring_for_month', { p_month: monthISO })
    const [catsRes, budgetsRes, spentRes, totalRes, allocRes] = await Promise.all([
      supabase.from('categories').select('id,name,color,is_drinking,is_active,sort_order,exclude_from_daily,is_food').eq('is_active', true).order('sort_order'),
      supabase.from('budgets').select('category_id,budget_amount').eq('month', monthISO),
      supabase.from('v_monthly_by_category').select('category_id,spent_amount').eq('month', monthISO),
      supabase.from('v_monthly_total').select('spent_amount').eq('month', monthISO).maybeSingle(),
      supabase.from('budget_allocations').select('id,category_id,label,amount,allocated_date').eq('month', monthISO),
    ])
    setCategories((catsRes.data ?? []) as Category[])
    setBudgets((budgetsRes.data ?? []) as Budget[])
    setSpentByCat((spentRes.data ?? []) as MonthlySpent[])
    setMonthlyTotal((totalRes.data?.spent_amount ?? 0) as number)
    setAllocations((allocRes.data ?? []) as Allocation[])
    setLoading(false)
  }

  useEffect(() => { reload() }, [monthISO])

  // 1. カテゴリ別履歴取得
  async function openCatHistory(cat: Category) {
    setSelectedCat(cat)
    setCatExpLoading(true)
    const d = new Date(monthISO)
    const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const nextISO = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`
    const { data } = await supabase
      .from('expenses')
      .select('id,amount,memo,spent_on,category_id')
      .eq('category_id', cat.id)
      .gte('spent_on', monthISO)
      .lt('spent_on', nextISO)
      .order('spent_on', { ascending: false })
    setCatExpenses((data ?? []) as CatExpense[])
    setCatExpLoading(false)
  }

  const budgetMap = useMemo(() => new Map(budgets.map(x => [x.category_id, x.budget_amount])), [budgets])
  const spentMap = useMemo(() => new Map(spentByCat.map(x => [x.category_id, x.spent_amount])), [spentByCat])

  // 5. 日常計算用予算（exclude_from_daily を除外）
  const dailyBudgetTotal = useMemo(() =>
    categories.filter(c => !c.exclude_from_daily).reduce((s, c) => s + (budgetMap.get(c.id) ?? 0), 0),
    [categories, budgetMap])

  // 5. 日常支出合計（exclude_from_daily を除外）
  const dailySpentTotal = useMemo(() =>
    categories.filter(c => !c.exclude_from_daily).reduce((s, c) => s + (spentMap.get(c.id) ?? 0), 0),
    [categories, spentMap])

  // 3. 割り当て済み合計（今日より未来分のみ除外）
  const today = new Date()
  const todayStr = toDateString(today)
  const isThisMonth = today.getFullYear() === current.getFullYear() && today.getMonth() === current.getMonth()
  const elapsed = isThisMonth ? today.getDate() : daysInMonth(current)
  const dim = daysInMonth(current)

  // 未来割り当て額（今日以降）を日常計算から除外
  const futureAllocTotal = useMemo(() =>
    allocations.filter(a => a.allocated_date > todayStr).reduce((s, a) => s + a.amount, 0),
    [allocations, todayStr])

  // 5. 今日使っていい金額（日常カテゴリのみ・割り当て除外）
  const adjustedDailyBudget = dailyBudgetTotal - futureAllocTotal
  const allowToToday = adjustedDailyBudget > 0 ? Math.floor(adjustedDailyBudget * elapsed / dim) : 0
  const remainingToday = allowToToday - dailySpentTotal
  const overDaily = dailySpentTotal > allowToToday && adjustedDailyBudget > 0

  // 全体残り予算
  const monthBudgetTotal = useMemo(() => categories.reduce((s, c) => s + (budgetMap.get(c.id) ?? 0), 0), [categories, budgetMap])
  const remainingMonth = monthBudgetTotal - monthlyTotal
  const overMonth = monthlyTotal > monthBudgetTotal && monthBudgetTotal > 0

  // 4. 食費の今日使っていい額
  const foodCat = useMemo(() => categories.find(c => c.is_food), [categories])
  const foodBudget = foodCat ? (budgetMap.get(foodCat.id) ?? 0) : 0
  const foodSpent = foodCat ? (spentMap.get(foodCat.id) ?? 0) : 0
  const foodRemaining = foodBudget > 0 ? Math.floor((foodBudget - foodSpent) / Math.max(dim - elapsed + 1, 1)) : 0

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
          {/* 4. 食費の今日使っていい額 */}
          {foodCat && foodBudget > 0 && (
            <div className="kpiSub" style={{ color: '#f59e0b' }}>
              🍚 食費 {yen(foodRemaining)}
            </div>
          )}
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
        <h3 style={{ marginBottom: 4, fontSize: 14 }}>カテゴリ別 予算消化率</h3>
        <p style={{ fontSize: 11, color: '#475569', marginBottom: 12 }}>カテゴリをタップして取引履歴を確認</p>
        {loading ? <p style={{ color: '#94a3b8', fontSize: 13 }}>読み込み中...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {categories.map((c, i) => {
              const b = budgetMap.get(c.id) ?? 0
              const s = spentMap.get(c.id) ?? 0
              const pct = b > 0 ? Math.round(s * 100 / b) : 0
              const over = b > 0 && s > b
              const color = c.color || COLORS_LIST[i % COLORS_LIST.length]
              return (
                <div key={c.id} onClick={() => openCatHistory(c)} style={{ cursor: 'pointer' }}>
                  <div className="hrow" style={{ marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, marginLeft: 6 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>¥{s.toLocaleString()} / ¥{b.toLocaleString()}</span>
                    {/* 2. 超過率を%で表示 */}
                    {over
                      ? <span className="badge danger">{pct}%</span>
                      : pct >= 80
                      ? <span className="badge warn">{pct}%</span>
                      : <span className="badge ok">{pct}%</span>
                    }
                    {c.exclude_from_daily && <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>除外</span>}
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

      {/* 7. 円グラフ・推移グラフ */}
      <Charts monthISO={monthISO} categories={categories} spentByCat={spentByCat} />

      {/* 1. カテゴリ別履歴モーダル */}
      {selectedCat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedCat(null) }}>
          <div style={{ background: '#1e293b', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, maxHeight: '75dvh', display: 'flex', flexDirection: 'column' }}>
            {/* ヘッダー */}
            <div className="hrow" style={{ padding: '16px 16px 12px', borderBottom: '1px solid #334155' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: selectedCat.color ?? '#888' }} />
              <span style={{ fontWeight: 700, fontSize: 16, marginLeft: 8, flex: 1 }}>{selectedCat.name}の履歴</span>
              <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 700 }}>
                ¥{(spentMap.get(selectedCat.id) ?? 0).toLocaleString()}
              </span>
              <button className="btn" style={{ marginLeft: 12, padding: '4px 10px', fontSize: 13 }} onClick={() => setSelectedCat(null)}>✕</button>
            </div>
            {/* 一覧 */}
            <div style={{ overflowY: 'auto', padding: '8px 16px 24px' }}>
              {catExpLoading && <p style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>読み込み中...</p>}
              {!catExpLoading && catExpenses.length === 0 && (
                <p style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>この月の取引はありません</p>
              )}
              {catExpenses.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #0f172a' }}>
                  <div style={{ flex: 1 }}>
                    <div className="hrow">
                      <span style={{ fontWeight: 700, fontSize: 15 }}>¥{e.amount.toLocaleString()}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{e.spent_on.slice(5).replace('-', '月')}日</span>
                    </div>
                    {e.memo && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{e.memo}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
