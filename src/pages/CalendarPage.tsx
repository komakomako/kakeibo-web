import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { monthStart, toISODate, daysInMonth, toDateString } from '../lib/date'

type Expense = { id: string; amount: number; memo: string | null; category_id: string | null; spent_on: string; categories: { name: string; is_drinking: boolean } | null }

export default function CalendarPage() {
  const [current, setCurrent] = useState(() => monthStart(new Date()))
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMemo, setEditMemo] = useState('')

  const monthISO = useMemo(() => toISODate(current), [current])

  useEffect(() => {
    const next = toISODate(new Date(current.getFullYear(), current.getMonth() + 1, 1))
    supabase.from('expenses')
      .select('id,amount,memo,category_id,spent_on,categories(name,is_drinking)')
      .gte('spent_on', monthISO).lt('spent_on', next)
      .order('spent_on')
      .then(({ data }) => setExpenses((data ?? []) as Expense[]))
  }, [monthISO])

  const byDate = useMemo(() => {
    const m = new Map<string, Expense[]>()
    for (const e of expenses) {
      const arr = m.get(e.spent_on) ?? []
      arr.push(e)
      m.set(e.spent_on, arr)
    }
    return m
  }, [expenses])

  const dim = daysInMonth(current)
  const firstDow = new Date(current.getFullYear(), current.getMonth(), 1).getDay()
  const today = toDateString(new Date())
  const DOW = ['日','月','火','水','木','金','土']

  const selectedItems = selectedDate ? (byDate.get(selectedDate) ?? []) : []
  const selectedTotal = selectedItems.reduce((s, e) => s + e.amount, 0)

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
    if (selectedDate && byDate.get(selectedDate)?.length === 1) setSelectedDate(null)
  }

  async function saveEdit() {
    if (!editTarget) return
    await supabase.from('expenses').update({ amount: Number(editAmount), memo: editMemo || null }).eq('id', editTarget.id)
    setExpenses(prev => prev.map(e => e.id === editTarget.id ? { ...e, amount: Number(editAmount), memo: editMemo || null } : e))
    setEditTarget(null)
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

      {/* 凡例 */}
      <div className="hrow" style={{ marginBottom: 10, gap: 12, fontSize: 11, color: '#94a3b8' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(59,130,246,0.2)', display: 'inline-block' }} />支出あり
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(239,68,68,0.25)', display: 'inline-block' }} />飲み会あり
        </span>
      </div>

      {/* カレンダー */}
      <div className="card" style={{ padding: 10 }}>
        <div className="cal-grid" style={{ marginBottom: 6 }}>
          {DOW.map((d, i) => (
            <div key={d} className="cal-day-header" style={{ color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8' }}>{d}</div>
          ))}
        </div>
        <div className="cal-grid">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: dim }).map((_, i) => {
            const day = i + 1
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const items = byDate.get(dateStr) ?? []
            const total = items.reduce((s, e) => s + e.amount, 0)
            const hasDrinking = items.some(e => e.categories?.is_drinking)
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const dow = (firstDow + i) % 7

            return (
              <div key={day}
                className={`cal-cell ${hasDrinking ? 'drinking' : items.length > 0 ? 'has-expense' : ''} ${isToday ? 'today' : ''}`}
                style={{ background: isSelected ? 'rgba(59,130,246,0.3)' : undefined }}
                onClick={() => setSelectedDate(selectedDate === dateStr ? null : dateStr)}
              >
                <span className="cal-date" style={{ color: dow === 0 ? '#ef4444' : dow === 6 ? '#60a5fa' : '#f1f5f9' }}>{day}</span>
                {total > 0 && <span className="cal-amount">¥{total >= 10000 ? Math.floor(total / 1000) + 'k' : total.toLocaleString()}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* 選択日の明細 */}
      {selectedDate && (
        <div className="card">
          <div className="hrow" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 14 }}>{selectedDate.slice(5).replace('-', '月')}日の支出</h3>
            <span className="spacer" />
            <span style={{ fontWeight: 700, color: '#3b82f6' }}>合計 ¥{selectedTotal.toLocaleString()}</span>
          </div>
          {selectedItems.length === 0
            ? <p style={{ color: '#94a3b8', fontSize: 13 }}>支出なし</p>
            : selectedItems.map(e => (
              <div key={e.id} style={{ borderTop: '1px solid #1e293b', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div className="hrow">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>¥{e.amount.toLocaleString()}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', background: '#0f172a', padding: '1px 8px', borderRadius: 999 }}>{e.categories?.name ?? '未分類'}</span>
                  </div>
                  {e.memo && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{e.memo}</p>}
                </div>
                <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setEditTarget(e); setEditAmount(String(e.amount)); setEditMemo(e.memo ?? '') }}>編集</button>
                <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => deleteExpense(e.id)}>削除</button>
              </div>
            ))
          }
        </div>
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 200 }}>
          <div className="card" style={{ width: '100%', maxWidth: 360, margin: 0 }}>
            <h3 style={{ marginBottom: 14, fontSize: 15 }}>支出を編集</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label>金額</label>
                <input className="input" type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
              </div>
              <div>
                <label>メモ</label>
                <input className="input" value={editMemo} onChange={e => setEditMemo(e.target.value)} />
              </div>
              <div className="hrow">
                <button className="btn" onClick={() => setEditTarget(null)} style={{ flex: 1 }}>キャンセル</button>
                <button className="btn primary" onClick={saveEdit} style={{ flex: 1 }}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
