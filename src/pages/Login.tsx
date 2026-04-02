import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setMsg(error.message)
    setLoading(false)
  }

  async function signUp() {
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signUp({ email, password: pw })
    if (error) setMsg(error.message)
    else setMsg('登録完了！メール確認が必要な場合は受信トレイを確認してください。')
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>💰</div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>家計簿</h1>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>あなただけの家計管理アプリ</p>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label>メールアドレス</label>
            <input className="input" type="email" placeholder="mail@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label>パスワード</label>
            <input className="input" type="password" placeholder="6文字以上" value={pw} onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && signIn()} />
          </div>
          {msg && <p style={{ fontSize: 13, color: msg.includes('完了') ? '#22c55e' : '#ef4444' }}>{msg}</p>}
          <button className="btn primary" onClick={signIn} disabled={loading} style={{ width: '100%' }}>
            {loading ? '...' : 'ログイン'}
          </button>
          <button className="btn" onClick={signUp} disabled={loading} style={{ width: '100%' }}>
            新規登録
          </button>
        </div>
      </div>
    </div>
  )
}
