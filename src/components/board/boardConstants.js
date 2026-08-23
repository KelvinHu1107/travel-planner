export const SLOT_HEIGHT = 56    // px / 30 分鐘
export const TIME_COL_W  = 76    // 左側時間欄
export const DAY_COL_W   = 230   // 每天欄寬
export const HEADER_H    = 88    // 日期標頭高
export const START_HOUR  = 6
export const END_HOUR    = 24

export const TIME_SLOTS = Array.from(
  { length: (END_HOUR - START_HOUR) * 2 },
  (_, i) => {
    const totalMin = START_HOUR * 60 + i * 30
    const h = String(Math.floor(totalMin / 60)).padStart(2, '0')
    const m = String(totalMin % 60).padStart(2, '0')
    return { time: `${h}:${m}`, isHour: m === '00' }
  }
)
