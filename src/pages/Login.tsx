import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  async function signIn() {
    if (!email || !pw) { setMsg({ text: 'メールアドレスとパスワードを入力してください', ok: false }); return }
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) {
      // 8. エラーメッセージを日本語化
      const msgs: Record<string, string> = {
        'Invalid login credentials': 'メールアドレスまたはパスワードが違います',
        'Email not confirmed': 'メールアドレスが確認されていません。受信トレイを確認してください',
        'Too many requests': 'しばらく待ってから再試行してください',
      }
      setMsg({ text: msgs[error.message] ?? error.message, ok: false })
    }
    setLoading(false)
  }

  async function signUp() {
    if (!email || !pw) { setMsg({ text: 'メールアドレスとパスワードを入力してください', ok: false }); return }
    if (pw.length < 6) { setMsg({ text: 'パスワードは6文字以上で設定してください', ok: false }); return }
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signUp({ email: email.trim(), password: pw })
    if (error) {
      const msgs: Record<string, string> = {
        'User already registered': 'このメールアドレスは既に登録されています',
        'Password should be at least 6 characters': 'パスワードは6文字以上で設定してください',
        'Anonymous sign-ins are disabled': 'メールアドレスを入力してください',
      }
      setMsg({ text: msgs[error.message] ?? error.message, ok: false })
    } else {
      setMsg({ text: '登録完了！ログインできます', ok: true })
      setMode('login')
    }
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

        {/* タブ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
          <button className={`btn ${mode === 'login' ? 'primary' : ''}`} onClick={() => { setMode('login'); setMsg(null) }}>ログイン</button>
          <button className={`btn ${mode === 'signup' ? 'primary' : ''}`} onClick={() => { setMode('signup'); setMsg(null) }}>新規登録</button>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label>メールアドレス</label>
            <input className="input" type="email" inputMode="email" placeholder="mail@example.com"
              value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label>パスワード{mode === 'signup' ? '（6文字以上）' : ''}</label>
            <input className="input" type="password" placeholder="••••••"
              value={pw} onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? signIn() : signUp())}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>

          {msg && (
            <p style={{ fontSize: 13, color: msg.ok ? '#22c55e' : '#ef4444', background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: 8 }}>
              {msg.text}
            </p>
          )}

          <button className="btn primary" onClick={mode === 'login' ? signIn : signUp} disabled={loading} style={{ width: '100%' }}>
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '新規登録'}
          </button>
        </div>
      </div>
    </div>
  )
}
