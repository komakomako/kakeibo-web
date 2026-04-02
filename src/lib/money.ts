export const yen = (n: number): string =>
  `¥${Math.abs(n).toLocaleString('ja-JP')}${n < 0 ? ' (超過)' : ''}`
