// Weekday label arrays exported so callers can localize via useLanguage()
export const WEEKDAYS_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
export const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function padZ(n) { return String(n).padStart(2, '0') }
function localDateStr(d) {
  return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`
}

// Bug M8：使用本地日期避免 UTC 偏移，避免 UTC-8 使用者在早上 8 點前看到錯誤日期
export function getDaysInRange(startStr, endStr) {
  if (!startStr || !endStr) return []
  const result = []
  const current = new Date(startStr + 'T00:00:00')
  const end = new Date(endStr + 'T00:00:00')
  while (current <= end) {
    result.push(localDateStr(current))
    current.setDate(current.getDate() + 1)
  }
  return result
}

// 格式化顯示日期，例：10/2 (週四)。lang 為 'zh' 或 'en'
export function formatDisplayDate(dateStr, lang = 'zh') {
  const date = new Date(dateStr + 'T00:00:00')
  const weekdays = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = weekdays[date.getDay()]
  return `${month}/${day} (${weekday})`
}

// 計算天數
export function getTripDuration(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
}

// Bug #8：取得本地日期字串 YYYY-MM-DD（避免使用 toISOString() 造成 UTC 時區偏移）
export function getLocalDateStr(date = new Date()) {
  return localDateStr(date)
}
