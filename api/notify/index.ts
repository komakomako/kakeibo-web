import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  const auth = req.headers['authorization']
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstNow = new Date(today.getTime() + jstOffset)

  const yyyy = jstNow.getUTCFullYear()
  const mm = String(jstNow.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(jstNow.getUTCDate()).padStart(2, '0')
  const todayISO = `${yyyy}-${mm}-${dd}`
  const monthISO = `${yyyy}-${mm}-01`

  const yesterday = new Date(jstNow.getTime() - 86400000)
  const yyyyy = yesterday.getUTCFullYear()
  const ymm = String(yesterday.getUTCMonth() + 1).padStart(2, '0')
  const ydd = String(yesterday.getUTCDate()).padStart(2, '0')
  const yesterdayISO = `${yyyyy}-${ymm}-${ydd}`

  const daysInMonth = new Date(yyyy, jstNow.getUTCMonth() + 1, 0).getDate()
  const elapsed = jstNow.getUTCDate()

  // 全ユーザーの予算・支出を取得（自分だけなのでuser_id直取得）
  const { data: users } = await supabase.auth.admin.listUsers()
  if (!users?.users?.length) return res.json({ ok: true, note: 'no users' })

  for (const user of users.users) {
    const uid = user.id

    const [budgetsRes, spentRes, yesterdayRes] = await Promise.all([
      supabase.from('budgets').select('category_id, budget_amount, categories(name)').eq('month', monthISO).eq('user_id', uid),
      supabase.from('v_monthly_by_category').select('category_id, spent_amount').eq('month', monthISO),
      supabase.from('expenses').select('amount').eq('spent_on', yesterdayISO).eq('user_id', uid),
    ])

    const budgets = (budgetsRes.data ?? []) as any[]
    const spentByCat = (spentRes.data ?? []) as any[]
    const yesterdayExp = (yesterdayRes.data ?? []) as any[]

    const spentMap = new Map(spentByCat.map((r: any) => [r.category_id, r.spent_amount]))
    const totalBudget = budgets.reduce((s: number, r: any) => s + r.budget_amount, 0)
    const totalSpent = budgets.reduce((s: number, r: any) => s + (spentMap.get(r.category_id) ?? 0), 0)
    const yesterdayTotal = yesterdayExp.reduce((s: number, r: any) => s + r.amount, 0)
    const allowToToday = totalBudget > 0 ? Math.floor(totalBudget * elapsed / daysInMonth) : 0
    const remainingDays = daysInMonth - elapsed + 1
    const dailyAllowance = remainingDays > 0 && totalBudget > 0 ? Math.floor((totalBudget - totalSpent) / remainingDays) : 0
    const overDaily = totalSpent > allowToToday && totalBudget > 0

    const lines: string[] = [
      `📅 ${todayISO}　家計レポート`,
      ``,
      `💰 今日使っていい金額（日割り）`,
      `　¥${dailyAllowance.toLocaleString()}`,
      ``,
      `📊 今月の残り予算`,
      `　¥${(totalBudget - totalSpent).toLocaleString()} / ¥${totalBudget.toLocaleString()}`,
      overDaily ? `　⚠️ 日割りペースを超過中` : `　✅ 日割りペース内`,
      ``,
      `🧾 昨日の支出`,
      `　¥${yesterdayTotal.toLocaleString()}`,
      ``,
      `📂 カテゴリ別消化率`,
    ]

    for (const b of budgets) {
      const s = spentMap.get(b.category_id) ?? 0
      const pct = b.budget_amount > 0 ? Math.round(s * 100 / b.budget_amount) : 0
      const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢'
      lines.push(`　${icon} ${b.categories?.name}：${pct}%（¥${s.toLocaleString()} / ¥${b.budget_amount.toLocaleString()}）`)
    }

    const message = lines.join('\n')

    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
      },
      body: JSON.stringify({
        to: process.env.LINE_USER_ID,
        messages: [{ type: 'text', text: message }],
      }),
    })
  }

  return res.json({ ok: true })
}
