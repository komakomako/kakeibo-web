import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { toDateString } from '../lib/date'

type Category = { id: string; name: string; color: string | null }

export default function ExpenseForm({ categories, defaultDate, onSaved }: {
  categories: Category[]
  defaultDate: Date
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [date, setDate] = useState(toDateString(defaultDate))
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    if (!categoryId && categories.length > 0) setCategoryId(categories[0].id)
  }, [categories])

  async function save() {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('expenses').insert({
      user_id: user!.id,
      amount: Math.round(Number(amount)),
      category_id: categoryId || null,
      spent_on: date,
      memo: memo || null,
    })
    setAmount(''); setMemo('')
    setSaving(false)
    onSaved()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label>金額（円）</label>
        <input className="input" type="number" inputMode="numeric" placeholder="0" value={amount}
          onChange={e => setAmount(e.target.value)} style={{ fontSize: 20, fontWeight: 700 }} />
      </div>
      <div>
        <label>カテゴリ</label>
        <select className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label>日付</label>
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ WebkitAppearance: 'none', appearance: 'none' }} />
      </div>
      <div>
        <label>メモ（任意）</label>
        <input className="input" placeholder="メモ" value={memo} onChange={e => setMemo(e.target.value)} />
      </div>
      <button className="btn primary" onClick={save} disabled={saving}>
        {saving ? '保存中...' : '支出を記録'}
      </button>
    </div>
  )
}
