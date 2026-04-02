import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toISODate, monthStart } from '../lib/date'

type Category = { id: string; name: string; color: string | null; is_drinking: boolean; sort_order: number }
type Budget = { id?: string; category_id: string; budget_amount: number }
type Template = { id: string; title: string; amount: number; category_id: string | null; day_of_month: number; memo: string | null; is_active: boolean }

const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#a855f7']

export default function Settings() {
  const [tab, setTab] = useState<'cat'|'budget'|'recurring'>('cat')
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const monthISO = toISODate(monthStart(new Date()))

  // カテゴリ
  const [newCatName, setNewCatName] = useState('')
  const [newCatDrinking, setNewCatDrinking] = useState(false)
  const [newCatColor, setNewCatColor] = useState(COLORS[0])

  // 固定費
  const [newTpl, setNewTpl] = useState({ title: '', amount: '', category_id: '', day_of_month: '1', memo: '' })

  async function loadAll() {
    const [cRes, bRes, tRes] = await Promise.all([
      supabase.from('categories').select('id,name,color,is_drinking,sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('budgets').select('id,category_id,budget_amount').eq('month', monthISO),
      supabase.from('recurring_templates').select('*').eq('is_active', true).order('day_of_month'),
    ])
    setCategories((cRes.data ?? []) as Category[])
    setBudgets((bRes.data ?? []) as Budget[])
    setTemplates((tRes.data ?? []) as Template[])
  }

  useEffect(() => { loadAll() }, [])

  async function addCategory() {
    if (!newCatName.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('categories').insert({ user_id: user!.id, name: newCatName.trim(), color: newCatColor, is_drinking: newCatDrinking, sort_order: categories.length })
    setNewCatName(''); setNewCatDrinking(false)
    loadAll()
  }

  async function deleteCategory(id: string) {
    await supabase.from('categories').update({ is_active: false }).eq('id', id)
    loadAll()
  }

  async function saveBudget(catId: string, amount: number) {
    const { data: { user } } = await supabase.auth.getUser()
    const existing = budgets.find(b => b.category_id === catId)
    if (existing?.id) {
      await supabase.from('budgets').update({ budget_amount: amount }).eq('id', existing.id)
    } else {
      await supabase.from('budgets').insert({ user_id: user!.id, month: monthISO, category_id: catId, budget_amount: amount })
    }
    loadAll()
  }

  async function addTemplate() {
    if (!newTpl.title || !newTpl.amount) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('recurring_templates').insert({
      user_id: user!.id, title: newTpl.title, amount: Number(newTpl.amount),
      category_id: newTpl.category_id || null, day_of_month: Number(newTpl.day_of_month), memo: newTpl.memo || null
    })
    setNewTpl({ title: '', amount: '', category_id: '', day_of_month: '1', memo: '' })
    loadAll()
  }

  async function deleteTemplate(id: string) {
    await supabase.from('recurring_templates').update({ is_active: false }).eq('id', id)
    loadAll()
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      <div className="hrow" style={{ marginBottom: 16, paddingTop: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>設定</h2>
        <span className="spacer" />
        <button className="btn" style={{ fontSize: 12 }} onClick={signOut}>ログアウト</button>
      </div>

      {/* タブ */}
      <div className="hrow" style={{ marginBottom: 16, gap: 6 }}>
        {[['cat','カテゴリ'],['budget','予算'],['recurring','固定費']] .map(([key, label]) => (
          <button key={key} className={`btn ${tab === key ? 'primary' : ''}`} style={{ flex: 1, fontSize: 13 }} onClick={() => setTab(key as any)}>{label}</button>
        ))}
      </div>

      {/* カテゴリ管理 */}
      {tab === 'cat' && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 14 }}>新規カテゴリ追加</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label>カテゴリ名</label>
                <input className="input" placeholder="例: 食費" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
              </div>
              <div>
                <label>カラー</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setNewCatColor(c)}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: newCatColor === c ? '3px solid white' : '3px solid transparent' }} />
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={newCatDrinking} onChange={e => setNewCatDrinking(e.target.checked)} />
                <span>飲み会費カテゴリ（カレンダーに色付け）</span>
              </label>
              <button className="btn primary" onClick={addCategory}>追加</button>
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 14 }}>カテゴリ一覧</h3>
            {categories.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>カテゴリがありません</p>}
            {categories.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #1e293b' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: c.color ?? '#888', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
                {c.is_drinking && <span className="badge warn">飲み会</span>}
                <button className="btn danger" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => deleteCategory(c.id)}>削除</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 予算管理 */}
      {tab === 'budget' && (
        <div className="card">
          <h3 style={{ marginBottom: 4, fontSize: 14 }}>今月の予算設定</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>入力後、フォーカスを外すと自動保存されます</p>
          {categories.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>先にカテゴリを追加してください</p>}
          {categories.map(c => {
            const b = budgets.find(x => x.category_id === c.id)
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #1e293b' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color ?? '#888', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
                <input className="input" type="number" inputMode="numeric" defaultValue={b?.budget_amount ?? ''}
                  placeholder="予算（円）" style={{ width: 130, textAlign: 'right' }}
                  onBlur={e => { const v = Number(e.target.value); if (v > 0) saveBudget(c.id, v) }} />
              </div>
            )
          })}
        </div>
      )}

      {/* 固定費管理 */}
      {tab === 'recurring' && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 14 }}>固定費テンプレート追加</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label>名前</label><input className="input" placeholder="例: 家賃" value={newTpl.title} onChange={e => setNewTpl(p => ({...p, title: e.target.value}))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label>金額</label><input className="input" type="number" value={newTpl.amount} onChange={e => setNewTpl(p => ({...p, amount: e.target.value}))} /></div>
                <div><label>毎月何日</label><input className="input" type="number" min="1" max="31" value={newTpl.day_of_month} onChange={e => setNewTpl(p => ({...p, day_of_month: e.target.value}))} /></div>
              </div>
              <div>
                <label>カテゴリ</label>
                <select className="input" value={newTpl.category_id} onChange={e => setNewTpl(p => ({...p, category_id: e.target.value}))}>
                  <option value="">未分類</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label>メモ（任意）</label><input className="input" value={newTpl.memo} onChange={e => setNewTpl(p => ({...p, memo: e.target.value}))} /></div>
              <button className="btn primary" onClick={addTemplate}>追加</button>
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 14 }}>登録済み固定費</h3>
            {templates.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>登録なし</p>}
            {templates.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #1e293b' }}>
                <div style={{ flex: 1 }}>
                  <div className="hrow">
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>毎月{t.day_of_month}日</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#3b82f6', marginTop: 2 }}>¥{t.amount.toLocaleString()}</div>
                </div>
                <button className="btn danger" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => deleteTemplate(t.id)}>削除</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
