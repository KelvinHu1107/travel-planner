import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'

const DAYS_ZH = ['日', '一', '二', '三', '四', '五', '六']
const DAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const MONTH_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseISO(str) {
  if (!str || str.length < 10) return null
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function CalendarPicker({ value, onChange, min = '', disabled = false }) {
  const { lang } = useLanguage()
  const today = getToday()
  const selected = parseISO(value)
  const minDate = parseISO(min) || today

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(null)
  const [viewMonth, setViewMonth] = useState(null)
  const [popupStyle, setPopupStyle] = useState({})

  const triggerRef = useRef(null)
  const popupRef = useRef(null)

  // Sync view to selected (or min) each time popup opens
  useEffect(() => {
    if (!open) return
    const base = selected || minDate
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Position popup relative to trigger
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popupH = 310
    const popupW = 284
    const vp = { w: window.innerWidth, h: window.innerHeight }

    const left = Math.max(8, Math.min(rect.left, vp.w - popupW - 8))
    const spaceBelow = vp.h - rect.bottom - 8
    const spaceAbove = rect.top - 8

    const style = { position: 'fixed', left: left + 'px', width: popupW + 'px', zIndex: 9999 }
    if (spaceBelow >= popupH || spaceBelow >= spaceAbove) {
      style.top = (rect.bottom + 4) + 'px'
    } else {
      style.bottom = (vp.h - rect.top + 4) + 'px'
    }
    setPopupStyle(style)
  }, [open])

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (!popupRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [open])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function buildGrid() {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay()
    const total = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells = Array(firstDow).fill(null)
    for (let d = 1; d <= total; d++) cells.push(new Date(viewYear, viewMonth, d))
    return cells
  }

  function selectDate(date) {
    onChange(toISO(date))
    setOpen(false)
  }

  const dayLabels = lang === 'zh' ? DAYS_ZH : DAYS_EN

  const displayValue = selected
    ? lang === 'zh'
      ? `${selected.getFullYear()}年 ${MONTH_ZH[selected.getMonth()]} ${selected.getDate()}日`
      : `${MONTH_EN[selected.getMonth()]} ${selected.getDate()}, ${selected.getFullYear()}`
    : (lang === 'zh' ? '選擇日期' : 'Select date')

  // Don't render calendar until view state is initialized
  const showCalendar = open && viewYear !== null && viewMonth !== null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="game-input"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <Calendar size={14} style={{ flexShrink: 0, opacity: 0.55 }} />
        <span style={{ flex: 1, color: selected ? 'inherit' : 'var(--text-muted, #aaa)', fontWeight: 'inherit' }}>
          {displayValue}
        </span>
      </button>

      {showCalendar && createPortal(
        <div
          ref={popupRef}
          className="calendar-popup"
          style={popupStyle}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} className="cal-nav-btn">
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {lang === 'zh' ? `${viewYear}年 ${MONTH_ZH[viewMonth]}` : `${MONTH_EN[viewMonth]} ${viewYear}`}
            </span>
            <button type="button" onClick={nextMonth} className="cal-nav-btn">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {dayLabels.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, opacity: 0.45, padding: '2px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Date grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 1px' }}>
            {buildGrid().map((date, i) => {
              if (!date) return <div key={i} />
              const isDisabled = date < minDate
              const isSel = isSameDay(date, selected)
              const isToday = isSameDay(date, today)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && selectDate(date)}
                  className={`cal-day${isSel ? ' cal-day-sel' : ''}${isToday && !isSel ? ' cal-day-today' : ''}${isDisabled ? ' cal-day-disabled' : ''}`}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
