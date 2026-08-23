import { useState } from 'react'
import { useDraggable, useDroppable, useDndMonitor } from '@dnd-kit/core'
import { SLOT_HEIGHT, START_HOUR } from '../board/boardConstants'
import { Trash2 } from 'lucide-react'
import {
  Compass, AirplaneTilt, Receipt, NotePencil,
  AirplaneTakeoff, Car, Train, PersonSimpleWalk, Boat,
  ForkKnife, Bus, Bed, ShoppingBag, Ticket, Package,
} from '@phosphor-icons/react'

// 分裂互補配色對應淺色沙底背景
export const CATEGORY = {
  attraction: { icon: '📍', IconComp: Compass,     label: '景點',  color: '#C2410C', bg: 'rgba(194,65,12,0.07)',  border: 'rgba(194,65,12,0.28)'  },
  transport:  { icon: '🚌', IconComp: AirplaneTilt, label: '交通',  color: '#0F766E', bg: 'rgba(15,118,110,0.07)', border: 'rgba(15,118,110,0.28)' },
  expense:    { icon: '💰', IconComp: Receipt,      label: '開銷',  color: '#92400E', bg: 'rgba(146,64,14,0.07)',  border: 'rgba(146,64,14,0.28)'  },
  note:       { icon: '📝', IconComp: NotePencil,   label: '筆記',  color: '#5B21B6', bg: 'rgba(91,33,182,0.07)',  border: 'rgba(91,33,182,0.28)'  },
}

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

export default function CardItem({ card, onDelete, onCardClick, droppedId, shakingIds = [] }) {
  const [hovered, setHovered] = useState(false)
  const [noteHovering, setNoteHovering] = useState(false)
  const cfg = CATEGORY[card.type] ?? CATEGORY.note

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `card-drop-${card.id}`,
    data: { cardId: card.id },
  })

  useDndMonitor({
    onDragStart({ active }) {
      if (active.data.current?.card?.type === 'note' && active.id !== card.id) {
        setNoteHovering(true)
      }
    },
    onDragEnd()    { setNoteHovering(false) },
    onDragCancel() { setNoteHovering(false) },
  })

  const setRefs = (node) => { setDragRef(node); setDropRef(node) }

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

  const handleNavigate = (e) => {
    e.stopPropagation()
    const base = 'https://www.google.com/maps/dir/?api=1'
    const url = card.placeId
      ? `${base}&destination=${encodeURIComponent(card.address || card.title)}&destination_place_id=${card.placeId}`
      : card.lat && card.lng
      ? `${base}&destination=${card.lat},${card.lng}`
      : `${base}&destination=${encodeURIComponent(card.address || card.title)}`
    window.open(url, '_blank')
  }

  const showDropHint = noteHovering && !isDragging
  const isDropOver   = showDropHint && isOver

  return (
    <div
      ref={setRefs}
      {...listeners}
      {...attributes}
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
        background: isDropOver
          ? `${cfg.color}14`
          : hovered
          ? `${cfg.color}12`
          : cfg.bg,
        border: isDropOver
          ? `2.5px solid ${cfg.color}`
          : showDropHint
          ? `2px dashed ${cfg.color}88`
          : `1.5px solid ${hovered ? cfg.border : cfg.border}`,
        borderLeft: `5px solid ${cfg.color}`,
        boxShadow: isDragging
          ? `0 14px 36px ${cfg.color}40, 0 0 0 2px ${cfg.color}55`
          : isDropOver
          ? `0 0 18px ${cfg.color}45, 0 0 0 1px ${cfg.color}35`
          : hovered
          ? `0 7px 0 ${cfg.color}28, 0 10px 28px ${cfg.color}30, 0 2px 8px rgba(0,0,0,0.10), inset 0 1.5px 0 rgba(255,255,255,0.85)`
          : `0 3px 0 rgba(140,100,40,0.18), 0 5px 16px rgba(100,60,10,0.10), inset 0 1.5px 0 rgba(255,255,255,0.72)`,
        padding: isCompact ? '5px 10px' : '9px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        cursor: isDragging ? 'grabbing' : 'grab',
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
      {/* 頂行：圖示 + 標題 + 刪除 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: isCompact ? 14 : 16, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {card.type === 'expense' && card.expenseCategory && EXPENSE_CAT_ICON_COMP[card.expenseCategory]
              ? (() => { const EC = EXPENSE_CAT_ICON_COMP[card.expenseCategory]; return <EC size={isCompact ? 13 : 15} weight="fill" color={cfg.color} /> })()
              : cfg.IconComp
              ? <cfg.IconComp size={isCompact ? 13 : 15} weight="fill" color={cfg.color} />
              : cfg.icon}
          </span>
          <span style={{
            fontSize: isCompact ? 12 : 14, fontWeight: 900, color: cfg.color,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {card.title}
          </span>
        </div>

        {hovered && !showDropHint && (
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

      {/* Drop hint */}
      {isDropOver && (
        <div style={{ fontSize: 11, fontWeight: 900, color: cfg.color, textAlign: 'center', marginTop: 2 }}>
          放開以附加筆記
        </div>
      )}

      {/* 時間 */}
      {!isCompact && !isDropOver && (
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.2px' }}>
          {card.startTime} – {endTime}
        </div>
      )}

      {/* 交通 */}
      {!isCompact && !isDropOver && card.type === 'transport' && (card.from || card.to) && (
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {(() => { const TC = TRANSPORT_ICON_COMP[card.mode]; return TC ? <TC size={13} color="var(--text-muted)" /> : <span>{TRANSPORT_ICON[card.mode] ?? '🚌'}</span> })()}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.from} → {card.to}
          </span>
        </div>
      )}

      {/* 景點：當日營業時間 */}
      {!isCompact && !isDropOver && card.type === 'attraction' && card.weekdayText && (() => {
        const todayIdx = (new Date().getDay() + 6) % 7
        const hoursOnly = card.weekdayText[todayIdx]?.replace(/^[^:]+: ?/, '') ?? null
        return hoursOnly ? (
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span>🕐</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hoursOnly}</span>
          </div>
        ) : null
      })()}

      {/* 景點導航 */}
      {!isCompact && !isDropOver && card.type === 'attraction' && (
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
              flexShrink: 0, background: 'rgba(194,65,12,0.10)',
              border: '1.5px solid rgba(194,65,12,0.30)', borderRadius: 8,
              padding: '3px 10px', fontSize: 11, fontWeight: 900, color: '#C2410C',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            🗺️ 導航
          </button>
        </div>
      )}

      {/* 開銷 */}
      {!isCompact && !isDropOver && card.type === 'expense' && card.amount != null && (
        <div style={{ fontSize: 14, fontWeight: 900, color: '#92400E', marginTop: 'auto' }}>
          {card.currency ?? 'TWD'} {Number(card.amount).toLocaleString()}
        </div>
      )}

      {/* 筆記摘要 */}
      {!isCompact && !isDropOver && card.type === 'note' && card.content && (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.content.replace(/^#{1,3} /gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^- \[[ x]\] /gm, '').replace(/^- /gm, '').replace(/~~(.+?)~~/g, '$1').replace(/^---+$/gm, '').trim()}
        </div>
      )}

      {/* ── 底部 badge 列（圖片 + 筆記，明顯顯示） ── */}
      {!isDragging && !isDropOver && (hasNotes || hasImages) && (
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
            }}>🖼️ 圖片</span>
          )}
          {hasNotes && (
            <span style={{
              fontSize: 10, fontWeight: 900,
              color: cfg.color,
              background: `${cfg.color}12`,
              border: `1px solid ${cfg.color}30`,
              borderRadius: 20, padding: '1px 7px',
            }}>📝 筆記</span>
          )}
        </div>
      )}
    </div>
  )
}

export function CardPreview({ card }) {
  const cfg = CATEGORY[card.type] ?? CATEGORY.note
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
