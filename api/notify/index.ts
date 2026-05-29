import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GETもCronから来る場合があるので両方許可
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  // 10. CRON_SECRET 検証
  const authHeader = req.headers['authorization'] ?? ''
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const LINE_TOKEN = process.env.LINE_CHANNEL_TOKEN
  const LINE_USER = process.env.LINE_USER_ID

  if (!LINE_TOKEN || !LINE_USER) {
    return res.status(500).json({ error: 'LINE env vars not set' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // JST日付計算
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = jstNow.getUTCFullYear()
  const mm = pad(jstNow.getUTCMonth() + 1)
  const dd = pad(jstNow.getUTCDate())
  const todayISO = `${yyyy}-${mm}-${dd}`
  const monthISO = `${yyyy}-${mm}-01`
  const dim = new Date(yyyy, jstNow.getUTCMonth() + 1, 0).getDate()
  const elapsed = jstNow.getUTCDate()

  // 昨日
  const yd = new Date(jstNow.getTime() - 86400000)
  const yesterdayISO = `${yd.getUTCFullYear()}-${pad(yd.getUTCMonth() + 1)}-${pad(yd.getUTCDate())}`

  // ユーザー一覧（自分だけ想定）
  const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 10 })
  const users = usersData?.users ?? []

  for (const user of users) {
    const uid = user.id

    const [budgetsRes, spentRes, yesterdayRes, allocRes] = await Promise.all([
      supabase.from('budgets').select('category_id,budget_amount,categories(name,exclude_from_daily,is_food)').eq('month', monthISO).eq('user_id', uid),
      supabase.from('v_monthly_by_category').select('category_id,spent_amount').eq('month', monthISO),
      supabase.from('expenses').select('amount').eq('spent_on', yesterdayISO).eq('user_id', uid),
      supabase.from('budget_allocations').select('amount,allocated_date').eq('month', monthISO).eq('user_id', uid).gt('allocated_date', todayISO),
    ])

    const budgets = (budgetsRes.data ?? []) as any[]
    const spentByCat = (spentRes.data ?? []) as any[]
    const yesterdayExp = (yesterdayRes.data ?? []) as any[]
    const futureAllocs = (allocRes.data ?? []) as any[]

    const spentMap = new Map(spentByCat.map((r: any) => [r.category_id, r.spent_amount]))
    const totalBudget = budgets.reduce((s: number, r: any) => s + r.budget_amount, 0)
    const totalSpent = budgets.reduce((s: number, r: any) => s + (spentMap.get(r.category_id) ?? 0), 0)
    const yesterdayTotal = yesterdayExp.reduce((s: number, r: any) => s + r.amount, 0)

    // 日常計算用（除外カテゴリを除く）
    const dailyBudgets = budgets.filter((r: any) => !r.categories?.exclude_from_daily)
    const dailyBudgetTotal = dailyBudgets.reduce((s: number, r: any) => s + r.budget_amount, 0)
    const dailySpentTotal = dailyBudgets.reduce((s: number, r: any) => s + (spentMap.get(r.category_id) ?? 0), 0)
    const futureAllocTotal = futureAllocs.reduce((s: number, r: any) => s + r.amount, 0)
    const adjustedDailyBudget = dailyBudgetTotal - futureAllocTotal
    const allowToToday = adjustedDailyBudget > 0 ? Math.floor(adjustedDailyBudget * elapsed / dim) : 0
    const dailyAllowance = Math.max(0, Math.floor((adjustedDailyBudget - dailySpentTotal) / Math.max(dim - elapsed + 1, 1)))
    const overDaily = dailySpentTotal > allowToToday

    // 食費
    const foodBudget = budgets.find((r: any) => r.categories?.is_food)
    const foodBudgetAmt = foodBudget?.budget_amount ?? 0
    const foodSpent = foodBudget ? (spentMap.get(foodBudget.category_id) ?? 0) : 0
    const foodDaily = foodBudgetAmt > 0 ? Math.floor((foodBudgetAmt - foodSpent) / Math.max(dim - elapsed + 1, 1)) : 0

    const lines = [
      `📅 ${todayISO}　家計レポート`,
      ``,
      `💰 今日使っていい金額（日常費）`,
      `　¥${dailyAllowance.toLocaleString()}`,
      foodBudgetAmt > 0 ? `　🍚 食費 ¥${foodDaily.toLocaleString()}` : '',
      overDaily ? `　⚠️ 日割りペース超過中` : `　✅ 日割りペース内`,
      ``,
      `📊 今月の残り予算`,
      `　¥${(totalBudget - totalSpent).toLocaleString()} / ¥${totalBudget.toLocaleString()}`,
      ``,
      `🧾 昨日の支出`,
      `　¥${yesterdayTotal.toLocaleString()}`,
      ``,
      `📂 カテゴリ別消化率`,
    ].filter(l => l !== '')

    for (const b of budgets) {
      const s = spentMap.get(b.category_id) ?? 0
      const pct = b.budget_amount > 0 ? Math.round(s * 100 / b.budget_amount) : 0
      const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢'
      lines.push(`　${icon} ${b.categories?.name}：${pct}%（¥${s.toLocaleString()} / ¥${b.budget_amount.toLocaleString()}）`)
    }

    const message = lines.join('\n')

    // 10. LINE送信
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
      body: JSON.stringify({ to: LINE_USER, messages: [{ type: 'text', text: message }] }),
    })

    if (!lineRes.ok) {
      const err = await lineRes.text()
      console.error('LINE API error:', err)
      return res.status(500).json({ error: err })
    }
  }

  return res.json({ ok: true, sent: users.length })
}
