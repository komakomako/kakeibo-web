import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toISODate, monthStart } from '../lib/date'

type Expense = {
  id: string
  amount: number
  memo: string | null
  spent_on: string
  categories: { name: string; color: string | null } | null
}

export default function HistoryPage() {
  const [historyMonth, setHistoryMonth] = useState(() => toISODate(monthStart(new Date())))
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMemo, setEditMemo] = useState('')

  async function load(month: string) {
    setLoading(true)
    const d = new Date(month)
    const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const nextISO = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`
    const { data } = await supabase
      .from('expenses')
      .select('id,amount,memo,spent_on,categories(name,color)')
      .gte('spent_on', month)
      .lt('spent_on', nextISO)
      .order('spent_on', { ascending: false })
    setExpenses((data ?? []) as Expense[])
    setLoading(false)
  }

  useEffect(() => { load(historyMonth) }, [historyMonth])

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    load(historyMonth)
  }

  async function saveEdit() {
    if (!editTarget) return
    await supabase.from('expenses').update({
      amount: Number(editAmount),
      memo: editMemo || null,
    }).eq('id', editTarget.id)
    setEditTarget(null)
    load(historyMonth)
  }

  function csvExport() {
    const rows = [['日付', 'カテゴリ', '金額', 'メモ']]
    for (const e of expenses) {
      rows.push([e.spent_on, e.categories?.name ?? '', String(e.amount), e.memo ?? ''])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv)
    a.download = `kakeibo-${historyMonth.slice(0, 7)}.csv`
    a.click()
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      {/* ヘッダー */}
      <div className="hrow" style={{ marginBottom: 12, paddingTop: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>履歴</h2>
        <span className="spacer" />
        <button className="btn" style={{ fontSize: 12 }} onClick={csvExport} disabled={expenses.length === 0}>
          CSV出力
        </button>
      </div>

      {/* 月選択 */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div className="hrow">
          <button className="btn" style={{ padding: '6px 12px' }}
            onClick={() => {
              const d = new Date(historyMonth)
              setHistoryMonth(toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)))
            }}>◀</button>
          <input
            className="input"
            type="month"
            value={historyMonth.slice(0, 7)}
            onChange={e => setHistoryMonth(e.target.value + '-01')}
            style={{ flex: 1, textAlign: 'center' }}
          />
          <button className="btn" style={{ padding: '6px 12px' }}
            onClick={() => {
              const d = new Date(historyMonth)
              setHistoryMonth(toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1)))
            }}>▶</button>
        </div>
      </div>

      {/* 合計 */}
      {!loading && expenses.length > 0 && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: 12 }}>
          <div className="hrow">
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{historyMonth.slice(0, 7)} の支出合計</span>
            <span className="spacer" />
            <span style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>¥{total.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* 一覧 */}
      <div className="card">
        {loading && <p style={{ color: '#94a3b8', fontSize: 13 }}>読み込み中...</p>}
        {!loading && expenses.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: 13 }}>この月の支出はありません</p>
        )}

        {expenses.map((e, i) => {
          const prev = expenses[i - 1]
          const showDate = !prev || prev.spent_on !== e.spent_on
          return (
            <React.Fragment key={e.id}>
              {showDate && (
                <div style={{
                  fontSize: 12, color: '#64748b', fontWeight: 600,
                  padding: '10px 0 4px',
                  borderTop: i === 0 ? 'none' : '1px solid #1e293b'
                }}>
                  {e.spent_on.slice(5).replace('-', '月')}日（{['日','月','火','水','木','金','土'][new Date(e.spent_on).getDay()]}）
                </div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderTop: showDate ? 'none' : '1px solid #0f172a'
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: e.categories?.color ?? '#64748b', flexShrink: 0
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hrow" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>¥{e.amount.toLocaleString()}</span>
                    <span style={{
                      fontSize: 11, color: '#94a3b8',
                      background: '#0f172a', padding: '1px 8px', borderRadius: 999,
                      whiteSpace: 'nowrap'
                    }}>
                      {e.categories?.name ?? '未分類'}
                    </span>
                  </div>
                  {e.memo && (
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.memo}
                    </p>
                  )}
                </div>
                <button className="btn" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                  onClick={() => { setEditTarget(e); setEditAmount(String(e.amount)); setEditMemo(e.memo ?? '') }}>
                  編集
                </button>
                <button className="btn danger" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                  onClick={() => deleteExpense(e.id)}>
                  削除
                </button>
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {/* 編集モーダル */}
      {editTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, zIndex: 200
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 360, margin: 0 }}>
            <h3 style={{ marginBottom: 14, fontSize: 15 }}>支出を編集</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label>金額</label>
                <input className="input" type="number" inputMode="numeric"
                  value={editAmount} onChange={e => setEditAmount(e.target.value)} />
              </div>
              <div>
                <label>メモ</label>
                <input className="input" value={editMemo} onChange={e => setEditMemo(e.target.value)} />
              </div>
              <div className="hrow" style={{ gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => setEditTarget(null)}>キャンセル</button>
                <button className="btn primary" style={{ flex: 1 }} onClick={saveEdit}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
