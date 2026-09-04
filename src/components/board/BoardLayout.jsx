import { useRef, useEffect, useState } from 'react'
import { getDaysInRange } from '../../utils/dateUtils'
import CardItem from '../cards/CardItem'
import {
  SLOT_HEIGHT, TIME_COL_W, DAY_COL_W, HEADER_H,
  START_HOUR, END_HOUR, TIME_SLOTS
} from './boardConstants'

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

function getTodayStr() { return new Date().toISOString().split('T')[0] }

function getCurrentTimePx() {
  const now = new Date()
  const h = now.getHours(), m = now.getMinutes()
  if (h < START_HOUR || h >= END_HOUR) return null
  return ((h - START_HOUR) * 60 + m) / 30 * SLOT_HEIGHT
}

// ── 左側時間欄 ──────────────────────────────
function TimeColumn() {
  return (
    <div style={{
      position: 'sticky', left: 0, zIndex: 20,
      width: TIME_COL_W, flexShrink: 0,
      background: 'var(--board-col-bg)',
      borderRight: '2px solid rgba(165,125,65,0.22)',
    }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        height: HEADER_H,
        background: 'var(--board-col-bg)',
        borderBottom: '2px solid rgba(165,125,65,0.25)',
      }} />

      {TIME_SLOTS.map(({ time, isHour }, idx) => (
        <div key={time} style={{
          height: SLOT_HEIGHT,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
          paddingRight: 12,
          borderBottom: isHour
            ? '2px solid rgba(165,125,65,0.18)'
            : '1px solid rgba(165,125,65,0.08)',
        }}>
          {isHour && (
            <span style={{
              fontSize: 12, fontWeight: 900,
              color: 'var(--text-muted)',
              transform: idx === 0 ? 'translateY(5px)' : 'translateY(-7px)',
              letterSpacing: '0.3px',
            }}>
              {time}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── 單天欄 ──────────────────────────────────
function DayColumn({ day, dayIndex, isToday, currentTimePx, onSlotClick, cards, onDeleteCard, onCardClick, droppedCardId, shakingCardIds, mobileMode = false, firstCardTutorialId }) {
  const date     = new Date(day + 'T00:00:00')
  const monthDay = `${date.getMonth() + 1}/${date.getDate()}`
  const weekday  = WEEKDAYS[date.getDay()]

  return (
    <div style={{
      ...(mobileMode ? { flex: 1, minWidth: 0 } : { width: DAY_COL_W, flexShrink: 0 }),
      borderRight: '2px solid rgba(165,125,65,0.12)',
    }}>
      {/* 日期標頭 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        height: HEADER_H,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
        background: isToday ? 'rgba(180,100,20,0.11)' : 'var(--board-col-bg)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `3px solid ${isToday ? 'rgba(180,100,20,0.50)' : 'rgba(165,125,65,0.20)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            fontSize: 10, fontWeight: 900,
            color: isToday ? 'var(--accent-bright)' : 'var(--text-muted)',
            background: isToday ? 'rgba(180,100,20,0.14)' : 'rgba(165,125,65,0.10)',
            border: isToday ? '1.5px solid rgba(180,100,20,0.40)' : 'none',
            borderRadius: 7, padding: '2px 8px', letterSpacing: '0.5px',
          }}>
            DAY {dayIndex}
          </span>
          {isToday && (
            <span style={{
              fontSize: 10, fontWeight: 900, color: '#fff',
              background: 'var(--accent)',
              borderRadius: 7, padding: '2px 8px',
            }}>
              今天
            </span>
          )}
        </div>

        <div style={{
          fontSize: 28, fontWeight: 900, lineHeight: 1,
          color: isToday ? 'var(--accent)' : 'var(--text-primary)',
        }}>
          {monthDay}
        </div>

        <div style={{
          fontSize: 12, fontWeight: 800,
          color: isToday ? 'var(--accent-bright)' : 'var(--text-muted)',
        }}>
          {weekday}
        </div>
      </div>

      {/* 格線 + 卡片區 */}
      <div style={{
        position: 'relative',
        height: TIME_SLOTS.length * SLOT_HEIGHT,
        background: isToday ? 'rgba(180,100,20,0.025)' : 'transparent',
      }}>
        {/* 格線 */}
        {TIME_SLOTS.map(({ time, isHour }) => (
          <div
            key={time}
            onClick={() => onSlotClick(day, time)}
            style={{
              height: SLOT_HEIGHT,
              borderBottom: isHour
                ? '2px solid rgba(165,125,65,0.16)'
                : '1px solid rgba(165,125,65,0.07)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(180,100,20,0.06)'
              const hint = e.currentTarget.querySelector('.slot-hint')
              if (hint) hint.style.opacity = '1'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              const hint = e.currentTarget.querySelector('.slot-hint')
              if (hint) hint.style.opacity = '0'
            }}
          >
            <div className="slot-hint" style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, right: 0,
              display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 7,
              opacity: 0, transition: 'opacity 0.12s', pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: 'rgba(180,100,20,0.65)' }}>＋</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(180,100,20,0.55)', letterSpacing: '0.3px' }}>
                {time}
              </span>
            </div>
          </div>
        ))}

        {/* 現在時間線（紅色，普遍認知） */}
        {isToday && currentTimePx !== null && (
          <div style={{
            position: 'absolute', top: currentTimePx, left: 0, right: 0,
            height: 2.5, background: '#DC2626', zIndex: 5, pointerEvents: 'none',
            boxShadow: '0 0 8px rgba(220,38,38,0.60)',
          }}>
            <div style={{
              position: 'absolute', left: -5, top: -4.5,
              width: 11, height: 11, borderRadius: '50%',
              background: '#DC2626',
              boxShadow: '0 0 7px rgba(220,38,38,0.80)',
            }} />
          </div>
        )}

        {[...cards].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')).map((card, idx) => (
          <CardItem key={card.id} card={card} onDelete={onDeleteCard} onCardClick={onCardClick} droppedId={droppedCardId} shakingIds={shakingCardIds} tutorialId={idx === 0 ? firstCardTutorialId : undefined} />
        ))}
      </div>
    </div>
  )
}

// ── 主看板 ──────────────────────────────────
export default function BoardLayout({ trip, cards = [], days: daysProp, mobileMode = false, onSlotClick, onDeleteCard, onCardClick, droppedCardId, shakingCardIds = [], firstCardTutorialId }) {
  const allDays   = getDaysInRange(trip.startDate, trip.endDate)
  const days      = daysProp ?? allDays
  const todayStr  = getTodayStr()
  const scrollRef = useRef(null)
  const [timePx, setTimePx] = useState(getCurrentTimePx())
  const scrollKey = `board-scroll-${trip.code ?? ''}${mobileMode ? '-m' : ''}`

  useEffect(() => {
    const id = setInterval(() => setTimePx(getCurrentTimePx()), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!scrollRef.current) return
    let saved = null
    try { saved = sessionStorage.getItem(scrollKey) } catch { /* LINE WebView may restrict sessionStorage */ }
    if (saved) {
      try {
        const { top, left } = JSON.parse(saved)
        scrollRef.current.scrollTop = top
        if (!mobileMode) scrollRef.current.scrollLeft = left
        return
      } catch {}
    }
    const top = ((8 - START_HOUR) * 2) * SLOT_HEIGHT - HEADER_H / 2
    scrollRef.current.scrollTop = Math.max(0, top)
    if (!mobileMode) {
      const todayIdx = days.indexOf(todayStr)
      if (todayIdx >= 0) {
        const left = TIME_COL_W + todayIdx * DAY_COL_W - 40
        scrollRef.current.scrollLeft = Math.max(0, left)
      }
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // When drag tutorial step activates, scroll so the drag card sits ~35% from the top
  // of the visible area — card is in the center with empty slots visible below.
  useEffect(() => {
    if (!firstCardTutorialId || !scrollRef.current) return
    const containerH   = scrollRef.current.clientHeight
    const cardTopPx    = ((8 - START_HOUR) * 2) * SLOT_HEIGHT  // 08:00 row
    const desiredOffset = Math.max(60, (containerH - HEADER_H) * 0.30)
    scrollRef.current.scrollTop = Math.max(0, cardTopPx - desiredOffset)
  }, [firstCardTutorialId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
    if (!scrollRef.current) return
    try {
      sessionStorage.setItem(scrollKey, JSON.stringify({
        top: scrollRef.current.scrollTop,
        left: scrollRef.current.scrollLeft,
      }))
    } catch { /* ignore */ }
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
      <div style={{
        display: 'flex',
        ...(mobileMode ? { width: '100%' } : { minWidth: `${TIME_COL_W + DAY_COL_W * days.length}px` }),
        paddingBottom: mobileMode ? 80 : 0,
      }}>
        <TimeColumn />
        {days.map((day, i) => {
          const globalIdx = allDays.indexOf(day)
          return (
            <DayColumn
              key={day}
              day={day}
              dayIndex={globalIdx >= 0 ? globalIdx + 1 : i + 1}
              isToday={day === todayStr}
              currentTimePx={timePx}
              onSlotClick={onSlotClick}
              cards={cards.filter(c => c.day === day)}
              onDeleteCard={onDeleteCard}
              onCardClick={onCardClick}
              droppedCardId={droppedCardId}
              shakingCardIds={shakingCardIds}
              mobileMode={mobileMode}
              firstCardTutorialId={i === 0 ? firstCardTutorialId : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
