import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { SLOT_HEIGHT, START_HOUR } from '../board/boardConstants'
import { Trash2, Clock, Map, Image, FileText as FileTextIcon } from 'lucide-react'
import {
  Compass, AirplaneTilt, Receipt,
  AirplaneTakeoff, Car, Train, PersonSimpleWalk, Boat,
  ForkKnife, Bus, Bed, ShoppingBag, Ticket, Package,
} from '@phosphor-icons/react'

const IS_TOUCH = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0

// 分裂互補配色對應淺色沙底背景
export const CATEGORY = {
  attraction:    { icon: '📍', IconComp: Compass,     label: '景點',  color: '#C2410C', bg: 'rgba(194,65,12,0.07)',  border: 'rgba(194,65,12,0.28)'  },
  restaurant:    { icon: '🍽️', IconComp: ForkKnife,   label: '餐廳',  color: '#B45309', bg: 'rgba(180,83,9,0.07)',   border: 'rgba(180,83,9,0.28)'   },
  accommodation: { icon: '🏨', IconComp: Bed,          label: '住宿',  color: '#1D4ED8', bg: 'rgba(29,78,216,0.07)',  border: 'rgba(29,78,216,0.28)'  },
  transport:     { icon: '🚌', IconComp: AirplaneTilt, label: '交通',  color: '#0F766E', bg: 'rgba(15,118,110,0.07)', border: 'rgba(15,118,110,0.28)' },
}

const PLACE_TYPES = new Set(['attraction', 'restaurant', 'accommodation'])

const TRANSPORT_ICON_COMP = {
  flight:  AirplaneTakeoff,
  car:     Car,
  transit: Train,
  walk:    PersonSimpleWalk,
  boat:    Boat,
}
const TRANSPORT_ICON  = { flight:'✈️', car:'🚗', transit:'🚇', walk:'🚶', boat:'⛴️' }

const EXPENSE_CAT_ICON_COMP = {
  food:          ForkKnife,
  transport:     Bus,
  accommodation: Bed,
  shopping:      ShoppingBag,
  ticket:        Ticket,
  other:         Package,
}
const EXPENSE_CAT_ICON = { food:'🍜', transport:'🚌', accommodation:'🏨', shopping:'🛍️', ticket:'🎟️', other:'💼' }

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export function minutesToTime(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0')
  const m = String(min % 60).padStart(2, '0')
  return `${h}:${m}`
}

export default function CardItem({ card, onDelete, onCardClick, droppedId, shakingIds = [], tutorialId }) {
  const [hovered, setHovered] = useState(false)
  const cfg = CATEGORY[card.type] ?? CATEGORY.attraction

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  })

  const topPx    = (timeToMinutes(card.startTime) - START_HOUR * 60) / 30 * SLOT_HEIGHT
  const heightPx = Math.max((card.duration / 30) * SLOT_HEIGHT - 8, 44)
  const isCompact = heightPx < 80
  const endTime = minutesToTime(timeToMinutes(card.startTime) + card.duration)

  const dragStyle = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, transition: 'none' }
    : {}

  const hasNotes  = (card.attachedNotes?.length ?? 0) > 0
  const hasImages = card.images?.length > 0 ||
    card.attachedNotes?.some(n => n.images?.length > 0)

  const handleNavigate = (e) => {    e.stopPropagation()
    const base = 'https://www.google.com/maps/dir/?api=1'
    const url = card.placeId
      ? `${base}&destination=${encodeURIComponent(card.address || card.title)}&destination_place_id=${card.placeId}`
      : card.lat && card.lng
      ? `${base}&destination=${card.lat},${card.lng}`
      : `${base}&destination=${encodeURIComponent(card.address || card.title)}`
    window.open(url, '_blank')
  }

  const handlePadLeft = isCompact ? 10 : 12

  const touchPadLeft = IS_TOUCH ? 48 : (isCompact ? 10 : 12)

  return (
    <div
      ref={setDragRef}
      {...attributes}
      {...(IS_TOUCH ? {} : listeners)}
      {...(tutorialId ? { 'data-tutorial-id': tutorialId } : {})}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !isDragging && onCardClick?.(card)}
      style={{
        position: 'absolute',
        top: topPx + 3,
        left: 8,
        right: 8,
        height: heightPx,
        borderRadius: 16,
        background: hovered ? `${cfg.color}12` : cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        borderLeft: `5px solid ${cfg.color}`,
        boxShadow: isDragging
          ? `0 14px 36px ${cfg.color}40, 0 0 0 2px ${cfg.color}55`
          : hovered
          ? `0 7px 0 ${cfg.color}28, 0 10px 28px ${cfg.color}30, 0 2px 8px rgba(0,0,0,0.10), inset 0 1.5px 0 rgba(255,255,255,0.85)`
          : `0 3px 0 rgba(140,100,40,0.18), 0 5px 16px rgba(100,60,10,0.10), inset 0 1.5px 0 rgba(255,255,255,0.72)`,
        paddingTop: isCompact ? 5 : 9,
        paddingRight: 10,
        paddingBottom: isCompact ? 5 : 9,
        paddingLeft: IS_TOUCH ? touchPadLeft : handlePadLeft,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        cursor: IS_TOUCH ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        touchAction: 'auto',
        opacity: isDragging ? 0 : 1,
        zIndex: isDragging ? 0 : (hovered ? 15 : 5),
        userSelect: 'none',
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'border 0.1s, box-shadow 0.15s, background 0.1s, opacity 0.08s',
        ...dragStyle,
      }}
      className={
        droppedId === card.id ? 'card-drop-bounce'
        : shakingIds.includes(card.id) ? 'card-collision-shake'
        : undefined
      }
    >
      {/* Touch drag handle — press and move to drag */}
      {IS_TOUCH && (
        <div
          {...listeners}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 44,
            touchAction: 'none', cursor: 'grab', zIndex: 8,
            borderRadius: '16px 0 0 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(90deg, ${cfg.color}22 0%, transparent 100%)`,
          }}
        >
          {/* 2×3 grip dots */}
          <div style={{ display: 'flex', gap: 3, paddingLeft: 10 }}>
            {[0, 1].map(col => (
              <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[0, 1, 2].map(row => (
                  <div key={row} style={{
                    width: 3.5, height: 3.5, borderRadius: '50%',
                    background: cfg.color,
                    opacity: 0.55,
                  }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 頂行：圖示 + 標題 + 刪除 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: isCompact ? 14 : 16, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {cfg.IconComp
              ? <cfg.IconComp size={isCompact ? 13 : 15} weight="regular" color="var(--text-primary)" />
              : cfg.icon}
          </span>
          <span style={{
            fontSize: isCompact ? 12 : 14, fontWeight: 900, color: cfg.color,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {card.title}
          </span>
        </div>

        {card.images?.length > 0 && !isDragging && (
          <div style={{
            width: 24, height: 24, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
            border: '1.5px solid rgba(255,255,255,0.80)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            opacity: hovered ? 0 : 1, transition: 'opacity 0.1s',
          }}>
            <img src={card.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(card.id) }}
            onPointerDown={e => e.stopPropagation()}
            style={{
              flexShrink: 0, background: 'rgba(220,38,38,0.10)',
              border: '1.5px solid rgba(220,38,38,0.35)',
              borderRadius: 8, padding: '4px 6px',
              cursor: 'pointer', color: '#DC2626', lineHeight: 1,
              display: 'flex', alignItems: 'center',
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* 時間 */}
      {!isCompact && (
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.2px' }}>
          {card.startTime} – {endTime}
        </div>
      )}

      {/* 交通 */}
      {!isCompact && card.type === 'transport' && (card.from || card.to) && (
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {(() => { const TC = TRANSPORT_ICON_COMP[card.mode]; return TC ? <TC size={13} color="var(--text-muted)" /> : <span>{TRANSPORT_ICON[card.mode] ?? '🚌'}</span> })()}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.from} → {card.to}
          </span>
        </div>
      )}

      {/* 景點/餐廳：當日營業時間 */}
      {!isCompact && PLACE_TYPES.has(card.type) && card.weekdayText && (() => {
        const todayIdx = (new Date().getDay() + 6) % 7
        const hoursOnly = card.weekdayText[todayIdx]?.replace(/^[^:]+: ?/, '') ?? null
        return hoursOnly ? (
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Clock size={10} color="var(--text-muted)" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hoursOnly}</span>
          </div>
        ) : null
      })()}

      {/* 景點/餐廳/住宿導航 */}
      {!isCompact && PLACE_TYPES.has(card.type) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          {card.address && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
              {card.address}
            </span>
          )}
          <button
            onClick={handleNavigate}
            onPointerDown={e => e.stopPropagation()}
            style={{
              flexShrink: 0, background: `${cfg.color}1a`,
              border: `1.5px solid ${cfg.color}50`, borderRadius: 8,
              padding: '3px 10px', fontSize: 11, fontWeight: 900, color: cfg.color,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Map size={11} style={{ marginRight: 4 }} /> 導航
          </button>
        </div>
      )}

      {/* ── 底部 badge 列（圖片 + 筆記，明顯顯示） ── */}
      {!isDragging && (hasNotes || hasImages) && (
        <div style={{
          display: 'flex', gap: 5, flexWrap: 'wrap',
          marginTop: isCompact ? 0 : 'auto',
          paddingTop: isCompact ? 0 : 4,
          borderTop: isCompact ? 'none' : `1px solid ${cfg.color}18`,
        }}>
          {hasImages && (
            <span style={{
              fontSize: 10, fontWeight: 900,
              color: cfg.color,
              background: `${cfg.color}12`,
              border: `1px solid ${cfg.color}30`,
              borderRadius: 20, padding: '1px 7px',
            }}><Image size={9} style={{ marginRight: 3, display: 'inline', verticalAlign: 'middle' }} /> 圖片</span>
          )}
          {hasNotes && (
            <span style={{
              fontSize: 10, fontWeight: 900,
              color: cfg.color,
              background: `${cfg.color}12`,
              border: `1px solid ${cfg.color}30`,
              borderRadius: 20, padding: '1px 7px',
            }}><FileTextIcon size={9} style={{ marginRight: 3, display: 'inline', verticalAlign: 'middle' }} /> 筆記</span>
          )}
        </div>
      )}
    </div>
  )
}

export function CardPreview({ card }) {
  const cfg = CATEGORY[card.type] ?? CATEGORY.attraction
  const heightPx = Math.max((card.duration / 30) * SLOT_HEIGHT - 8, 44)
  const endTime = minutesToTime(timeToMinutes(card.startTime) + card.duration)

  return (
    <div style={{
      width: '100%', height: heightPx, borderRadius: 16,
      background: cfg.bg,
      border: `1.5px solid ${cfg.border}`,
      borderLeft: `5px solid ${cfg.color}`,
      boxShadow: `0 24px 60px ${cfg.color}55, 0 0 0 3px ${cfg.color}60, 0 8px 24px rgba(0,0,0,0.16)`,
      padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 3,
      pointerEvents: 'none', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{cfg.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: cfg.color,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.title}
        </span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>
        {card.startTime} – {endTime}
      </div>
    </div>
  )
}
