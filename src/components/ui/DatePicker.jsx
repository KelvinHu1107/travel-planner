import { useMemo } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'

const MONTH_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const MONTH_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function parseDate(str) {
  if (!str || str.length < 10) return { year: '', month: '', day: '' }
  const [y, m, d] = str.split('-')
  return { year: parseInt(y, 10) || '', month: parseInt(m, 10) || '', day: parseInt(d, 10) || '' }
}

function toISO(year, month, day) {
  if (!year || !month || !day) return ''
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

export default function DatePicker({ value, onChange, min = '', disabled = false }) {
  const { lang } = useLanguage()
  const { year, month, day } = parseDate(value)
  const minParsed = parseDate(min || new Date().toISOString().slice(0,10))

  const baseYear = minParsed.year || new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => baseYear + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const maxDay = (year && month) ? daysInMonth(year, month) : 31
  const days = Array.from({ length: maxDay }, (_, i) => i + 1)

  function emit(y, m, d) {
    const maxD = (y && m) ? daysInMonth(y, m) : 31
    const fixedD = Math.min(Number(d) || 0, maxD) || ''
    const iso = toISO(y, m, fixedD)
    if (iso && min && iso < min) return
    onChange(iso)
  }

  const sel = {
    className: 'game-input',
    disabled,
    style: {
      flex: 1, minWidth: 0, padding: '10px 4px',
      appearance: 'none', WebkitAppearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23785030' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 6px center',
      paddingRight: 22,
      cursor: disabled ? 'not-allowed' : 'pointer',
      textAlign: 'center',
    },
  }

  const monthLabels = lang === 'zh' ? MONTH_ZH : MONTH_EN

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
      <select {...sel} value={year} onChange={e => emit(Number(e.target.value), month, day)}>
        <option value="">{lang === 'zh' ? '年' : 'Year'}</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      <select {...sel} value={month} onChange={e => emit(year, Number(e.target.value), day)}>
        <option value="">{lang === 'zh' ? '月' : 'Mo'}</option>
        {months.map((m, i) => <option key={m} value={m}>{monthLabels[i]}</option>)}
      </select>

      <select {...sel} value={day} onChange={e => emit(year, month, Number(e.target.value))}>
        <option value="">{lang === 'zh' ? '日' : 'Day'}</option>
        {days.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  )
}
