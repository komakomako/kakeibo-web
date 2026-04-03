import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toISODate, monthStart } from '../lib/date'

type Category = { id: string; name: string; color: string | null; is_drinking: boolean; sort_order: number }
type Budget = { id?: string; category_id: string; budget_amount: number }
type Template = { id: string; title: string; amount: number; category_id: string | null; day_of_month: number; memo: string | null; is_active: boolean }
type Suggestion = { category_id: string; suggested_amount: number; months_count: number }

const COLORS = [
  '#3b82f6','#1d4ed8','#0ea5e9','#06b6d4','#0891b2',
  '#22c55e','#16a34a','#10b981','#14b8a6','#84cc16',
  '#ef4444','#dc2626','#f43f5e','#ec4899','#db2777',
  '#f97316','#ea580c','#f59e0b','#d97706','#eab308',
  '#8b5cf6','#7c3aed','#a855f7','#9333ea','#6366f1',
  '#64748b','#475569','#6b7280','#78716c','#71717a',
]

function getNextMonthISO() {
  const d = new Date()
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()
  const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2
  return `${y}-${String(m).padStart(2, '0')}-01`
}

export default function Settings() {
  const [tab, setTab] = useState<'cat' | 'budget' | 'recurring' | 'csv'>('cat')
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const monthISO = toISODate(monthStart(new Date()))
  const NEXT_MONTH_ISO = getNextMonthISO()

  const [newCatName, setNewCatName] = useState('')
  const [newCatDrinking, setNewCatDrinking] = useState(false)
  const [newCatColor, setNewCatColor] = useState(COLORS[0])
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingColor, setEditingColor] = useState(COLORS[0])
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

  async function loadSuggestions() {
    const { data } = await supabase.from('v_budget_suggestion').select('category_id,suggested_amount,months_count')
    setSuggestions((data ?? []) as Suggestion[])
  }

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (tab === 'budget') loadSuggestions() }, [tab])

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

  async function updateCategoryColor(id: string, color: string) {
    await supabase.from('categories').update({ color }).eq('id', id)
    setEditingCatId(null)
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

  async function applyNextMonthBudgets() {
    const { data: { user } } = await supabase.auth.getUser()
    const rows = suggestions.filter(s => s.suggested_amount > 0).map(s => ({
      user_id: user!.id, month: NEXT_MONTH_ISO, category_id: s.category_id, budget_amount: Number(s.suggested_amount),
    }))
    if (rows.length === 0) { alert('提案データがありません'); return }
    await supabase.from('budgets').upsert(rows, { onConflict: 'user_id,month,category_id' })
    alert(`来月(${NEXT_MONTH_ISO.slice(0, 7)})の予算を${rows.length}件設定しました`)
  }

  async function addTemplate() {
    if (!newTpl.title || !newTpl.amount) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('recurring_templates').insert({ user_id: user!.id, title: newTpl.title, amount: Number(newTpl.amount), category_id: newTpl.category_id || null, day_of_month: Number(newTpl.day_of_month), memo: newTpl.memo || null })
    setNewTpl({ title: '', amount: '', category_id: '', day_of_month: '1', memo: '' })
    loadAll()
  }

  async function deleteTemplate(id: string) {
    await supabase.from('recurring_templates').update({ is_active: false }).eq('id', id)
    loadAll()
  }

  return (
    <div>
      <div className="hrow" style={{ marginBottom: 16, paddingTop: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>設定</h2>
        <span className="spacer" />
        <button className="btn" style={{ fontSize: 12 }} onClick={() => supabase.auth.signOut()}>ログアウト</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 16 }}>
        {([['cat','カテゴリ'],['budget','予算'],['recurring','固定費'],['csv','CSV']] as const).map(([key, label]) => (
          <button key={key} className={`btn ${tab === key ? 'primary' : ''}`} style={{ fontSize: 12 }} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* カテゴリ */}
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
                <label>カラー（30色＋カスタム）</label>
                <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setNewCatColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: newCatColor === c ? '2px solid white' : '2px solid transparent', boxShadow: newCatColor === c ? `0 0 0 2px ${c}` : 'none', flexShrink: 0 }} />
                  ))}
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: newCatColor, border: '2px solid rgba(255,255,255,0.3)' }} />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{newCatColor}</span>
                  <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} style={{ width: 32, height: 26, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>カスタム色</span>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={newCatDrinking} onChange={e => setNewCatDrinking(e.target.checked)} />
                <span style={{ fontSize: 13 }}>飲み会費カテゴリ</span>
              </label>
              <button className="btn primary" onClick={addCategory}>追加</button>
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 14 }}>カテゴリ一覧</h3>
            {categories.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>カテゴリがありません</p>}
            {categories.map(c => (
              <div key={c.id}>
                {/* カテゴリ行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #1e293b' }}>
                  {/* カラードット（タップで編集モード切替） */}
                  <div
                    onClick={() => {
                      if (editingCatId === c.id) { setEditingCatId(null) }
                      else { setEditingCatId(c.id); setEditingColor(c.color ?? COLORS[0]) }
                    }}
                    style={{ width: 22, height: 22, borderRadius: '50%', background: c.color ?? '#888', flexShrink: 0, cursor: 'pointer', border: editingCatId === c.id ? '2px solid white' : '2px solid rgba(255,255,255,0.2)', boxShadow: editingCatId === c.id ? `0 0 0 2px ${c.color ?? '#888'}` : 'none' }}
                    title="タップしてカラー編集"
                  />
                  <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
                  {c.is_drinking && <span className="badge warn">飲み会</span>}
                  <button className="btn danger" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => deleteCategory(c.id)}>削除</button>
                </div>

                {/* インラインカラー編集パネル */}
                {editingCatId === c.id && (
                  <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>「{c.name}」のカラーを選択</p>
                    {/* 30色パレット */}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                      {COLORS.map(col => (
                        <div key={col} onClick={() => setEditingColor(col)} style={{ width: 24, height: 24, borderRadius: '50%', background: col, cursor: 'pointer', border: editingColor === col ? '2px solid white' : '2px solid transparent', boxShadow: editingColor === col ? `0 0 0 2px ${col}` : 'none', flexShrink: 0 }} />
                      ))}
                    </div>
                    {/* カスタムカラー */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: editingColor, border: '2px solid rgba(255,255,255,0.3)' }} />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{editingColor}</span>
                      <input type="color" value={editingColor} onChange={e => setEditingColor(e.target.value)} style={{ width: 32, height: 26, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                      <span style={{ fontSize: 11, color: '#64748b' }}>カスタム色</span>
                    </div>
                    {/* ボタン */}
                    <div className="hrow" style={{ gap: 8 }}>
                      <button className="btn" style={{ flex: 1, fontSize: 13 }} onClick={() => setEditingCatId(null)}>キャンセル</button>
                      <button className="btn primary" style={{ flex: 1, fontSize: 13 }} onClick={() => updateCategoryColor(c.id, editingColor)}>保存</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {categories.length > 0 && (
              <p style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>💡 カラードットをタップするとカラーを変更できます</p>
            )}
          </div>
        </>
      )}

      {/* 予算 */}
      {tab === 'budget' && (
        <>
          <div className="card" style={{ borderColor: '#3b82f6' }}>
            <div className="hrow" style={{ marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, color: '#3b82f6' }}>💡 来月の予算提案</h3>
              <span className="spacer" />
              <span style={{ fontSize: 11, color: '#64748b' }}>過去3ヶ月の平均</span>
            </div>
            {suggestions.length === 0
              ? <p style={{ color: '#94a3b8', fontSize: 13 }}>3ヶ月分の支出データがたまると提案が表示されます</p>
              : <>
                {suggestions.map(s => {
                  const cat = categories.find(c => c.id === s.category_id)
                  if (!cat) return null
                  return (
                    <div key={s.category_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #1e293b' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color ?? '#888' }} />
                      <span style={{ flex: 1, fontSize: 13 }}>{cat.name}</span>
                      <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 700 }}>¥{Number(s.suggested_amount).toLocaleString()}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{s.months_count}ヶ月平均</span>
                    </div>
                  )
                })}
                <button className="btn primary" style={{ marginTop: 12, width: '100%', fontSize: 13 }} onClick={applyNextMonthBudgets}>
                  来月（{NEXT_MONTH_ISO.slice(0, 7)}）に一括適用
                </button>
              </>
            }
          </div>
          <div className="card">
            <div className="hrow" style={{ marginBottom: 4 }}>
              <h3 style={{ fontSize: 14 }}>今月の予算設定</h3>
              <span className="spacer" />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>予算合計</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>
                  ¥{budgets.reduce((s, b) => s + b.budget_amount, 0).toLocaleString()}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>フォーカスを外すと自動保存されます</p>
            {categories.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>先にカテゴリを追加してください</p>}
            {categories.map(c => {
              const b = budgets.find(x => x.category_id === c.id)
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #1e293b' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color ?? '#888' }} />
                  <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
                  <input className="input" type="number" inputMode="numeric" defaultValue={b?.budget_amount ?? ''} placeholder="予算（円）"
                    style={{ width: 130, textAlign: 'right' }}
                    onBlur={e => { const v = Number(e.target.value); if (v > 0) saveBudget(c.id, v) }} />
                </div>
              )
            })}
            {budgets.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '10px 0 2px', borderTop: '1px solid #334155', marginTop: 4 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>合計</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
                  ¥{budgets.reduce((s, b) => s + b.budget_amount, 0).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* 固定費 */}
      {tab === 'recurring' && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 14 }}>固定費テンプレート追加</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label>名前</label><input className="input" placeholder="例: 家賃" value={newTpl.title} onChange={e => setNewTpl(p => ({ ...p, title: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label>金額</label><input className="input" type="number" value={newTpl.amount} onChange={e => setNewTpl(p => ({ ...p, amount: e.target.value }))} /></div>
                <div><label>毎月何日</label><input className="input" type="number" min="1" max="31" value={newTpl.day_of_month} onChange={e => setNewTpl(p => ({ ...p, day_of_month: e.target.value }))} /></div>
              </div>
              <div>
                <label>カテゴリ</label>
                <select className="input" value={newTpl.category_id} onChange={e => setNewTpl(p => ({ ...p, category_id: e.target.value }))}>
                  <option value="">未分類</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label>メモ（任意）</label><input className="input" value={newTpl.memo} onChange={e => setNewTpl(p => ({ ...p, memo: e.target.value }))} /></div>
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

      {/* CSV出力 */}
      {tab === 'csv' && (
        <CsvSection categories={categories} />
      )}
    </div>
  )
}

function CsvSection({ categories }: { categories: { id: string; name: string }[] }) {
  const [csvMonth, setCsvMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [exporting, setExporting] = useState(false)

  async function csvExport() {
    setExporting(true)
    const monthISO = csvMonth + '-01'
    const d = new Date(monthISO)
    const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const nextISO = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`
    const { data } = await supabase
      .from('expenses')
      .select('spent_on,amount,memo,categories(name)')
      .gte('spent_on', monthISO)
      .lt('spent_on', nextISO)
      .order('spent_on')
    if (!data) { setExporting(false); return }
    const rows = [['日付', 'カテゴリ', '金額', 'メモ']]
    for (const r of data as any[]) rows.push([r.spent_on, r.categories?.name ?? '', r.amount, r.memo ?? ''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv)
    a.download = `kakeibo-${csvMonth}.csv`
    a.click()
    setExporting(false)
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 14, fontSize: 14 }}>CSV出力</h3>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
        指定した月の支出データをCSVファイルとしてダウンロードします。<br />
        Excelやスプレッドシートで開けます。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label>出力する月</label>
          <input
            className="input"
            type="month"
            value={csvMonth}
            onChange={e => setCsvMonth(e.target.value)}
          />
        </div>
        <button className="btn primary" onClick={csvExport} disabled={exporting}>
          {exporting ? 'エクスポート中...' : `${csvMonth} のCSVをダウンロード`}
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#475569', marginTop: 16 }}>
        出力項目：日付・カテゴリ・金額・メモ（UTF-8 BOM付き）
      </p>
    </div>
  )
}
