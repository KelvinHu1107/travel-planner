// 產生兩個日期之間的每一天陣列，格式 YYYY-MM-DD
export function getDaysInRange(startDate, endDate) {
  const days = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    days.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return days
}

// 格式化顯示日期，例：10/2 (週四)
export function formatDisplayDate(dateStr) {
  const date = new Date(dateStr)
  const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
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
