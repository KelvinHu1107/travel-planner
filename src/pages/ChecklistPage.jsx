import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { CopyLinkButton, FullscreenButton } from '../components/ui/TopBarActions'
import { useViewMode } from '../contexts/ViewModeContext'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  getTrip, subscribeToList, addListItem, updateListItem, deleteListItem,
  subscribeToCards, toggleAttachedTodo,
} from '../services/firestore'
import { CATEGORY } from '../components/cards/CardItem'
import { useLanguage } from '../i18n/LanguageContext'

const CFG = {
  todo: {
    emoji: '✅',
    emptyEmoji: '📋',
    color: '#B45309',
    bg: 'rgba(180,83,9,0.08)',
    border: 'rgba(180,83,9,0.28)',
    checkColor: '#D97706',
    shadow: '#78350F',
    titleKey: 'checklist.todo.title',
    placeholderKey: 'checklist.todo.placeholder',
    emptyTextKey: 'checklist.todo.empty',
    emptyHintKey: 'checklist.todo.emptyHint',
  },
  packing: {
    emoji: '🎒',
    emptyEmoji: '🧳',
    color: '#0F766E',
    bg: 'rgba(15,118,110,0.08)',
    border: 'rgba(15,118,110,0.28)',
    checkColor: '#0F766E',
    shadow: '#064E3B',
    titleKey: 'checklist.packing.title',
    placeholderKey: 'checklist.packing.placeholder',
    emptyTextKey: 'checklist.packing.empty',
    emptyHintKey: 'checklist.packing.emptyHint',
  },
}

function ChecklistItem({ item, onToggle, onDelete, cfg }) {
  const [shaking, setShaking] = useState(false)

  const handleToggle = async () => {
    if (!item.checked) {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    }
    await onToggle()
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px', borderRadius: 20,
      background: item.checked
        ? 'rgba(255,252,244,0.60)'
        : 'rgba(255,252,244,0.97)',
      border: `1.5px solid ${item.checked ? 'rgba(165,125,65,0.18)' : 'rgba(165,125,65,0.28)'}`,
      boxShadow: item.checked
        ? 'none'
        : '0 3px 0 rgba(140,100,40,0.16), 0 6px 18px rgba(100,60,10,0.09), inset 0 1.5px 0 rgba(255,255,255,0.85)',
      transition: 'all 0.22s ease',
    }}>
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        className={shaking ? 'checklist-shake' : ''}
        style={{
          width: 30, height: 30, borderRadius: 10, flexShrink: 0,
          border: `2.5px solid ${item.checked ? cfg.checkColor : 'rgba(165,125,65,0.40)'}`,
          background: item.checked
            ? `linear-gradient(135deg, ${cfg.checkColor}cc, ${cfg.checkColor}88)`
            : 'rgba(255,252,244,0.90)',
          boxShadow: item.checked
            ? `0 3px 0 ${cfg.shadow}55, 0 5px 14px ${cfg.checkColor}28`
            : '0 2px 0 rgba(140,100,40,0.20), 0 4px 10px rgba(100,60,10,0.10), inset 0 1.5px 0 rgba(255,255,255,0.90)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: '#fff', fontWeight: 900,
          transition: 'all 0.18s ease',
        }}
      >
        {item.checked ? '✓' : ''}
      </button>

      {/* Text + optional fromCard badge */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontSize: 15, fontWeight: 800,
          color: item.checked ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: item.checked ? 'line-through' : 'none',
          textDecorationColor: 'rgba(158,112,64,0.50)',
          textDecorationThickness: '2px',
          transition: 'all 0.22s ease',
          wordBreak: 'break-word',
        }}>
          {item.text}
        </span>
        {item.fromCard && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3,
            fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
            background: 'rgba(165,125,65,0.10)', border: '1px solid rgba(165,125,65,0.20)',
            borderRadius: 99, padding: '2px 8px',
          }}>
            {CATEGORY[item.fromCard.type]?.icon} {item.fromCard.title}
          </span>
        )}
      </div>

      {/* Delete — only for standalone items */}
      {!item.fromCard && (
        <button
          onClick={onDelete}
          style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: 'rgba(220,38,38,0.07)', border: '1.5px solid rgba(220,38,38,0.20)',
            color: '#DC2626', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.7, transition: 'opacity 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7' }}
        >✕</button>
      )}
    </div>
  )
}

export default function ChecklistPage({ type = 'todo' }) {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const cfg = CFG[type]
  const { isMobileMode, toggleMode } = useViewMode()
  const { t } = useLanguage()

  const [trip, setTrip]   = useState(null)
  const [items, setItems] = useState([])
  const [cards, setCards] = useState([])
  const [newText, setNewText] = useState('')
  const [adding, setAdding]   = useState(false)
  const [btnPressed, setBtnPressed] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    getTrip(tripId).then(setTrip).catch(() => {})
  }, [tripId])

  useEffect(() => {
    const unsub = subscribeToList(tripId, type, setItems)
    return () => unsub()
  }, [tripId, type])

  // For todo page: also subscribe to cards to aggregate card.attachedTodos
  useEffect(() => {
    if (type !== 'todo') return
    const unsub = subscribeToCards(tripId, setCards)
    return () => unsub()
  }, [tripId, type])

  const handleAdd = async (e) => {
    e.preventDefault()
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    try {
      await addListItem(tripId, type, { text, checked: false })
      setNewText('')
      inputRef.current?.focus()
    } finally { setAdding(false) }
  }

  // Build card todos with toggle/delete callbacks
  const cardTodoItems = type === 'todo'
    ? cards.flatMap(card =>
        (card.attachedTodos ?? []).map(todo => ({
          ...todo,
          fromCard: { id: card.id, title: card.title, type: card.type },
          onToggle: () => toggleAttachedTodo(tripId, card.id, todo.id),
          onDelete: null, // 卡片附屬 todo 只能在卡片詳情中刪除
        }))
      )
    : []

  const allItems = [
    ...items.map(item => ({
      ...item,
      onToggle: () => updateListItem(tripId, type, item.id, { checked: !item.checked }).catch(console.error),
      onDelete: () => deleteListItem(tripId, type, item.id).catch(e => {
        console.error(e)
        setDeleteError(t('checklist.error.delete'))
        setTimeout(() => setDeleteError(''), 4000)
      }),
    })),
    ...cardTodoItems,
  ]

  const unchecked = allItems.filter(i => !i.checked)
  const checked   = allItems.filter(i => i.checked)
  const pct = allItems.length ? Math.round(checked.length / allItems.length * 100) : 0

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      ...(trip?.backgroundImage ? {
        backgroundImage: `url(${trip.backgroundImage})`,
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
      } : {}),
    }}>

      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 24px', height: 64,
        background: 'rgba(250,246,234,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '2px solid rgba(165,125,65,0.22)',
        boxShadow: '0 4px 24px rgba(120,80,20,0.10)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <button
          onClick={() => navigate(`/trip/${tripId}`, { state: location.state })}
          style={{
            width: 40, height: 40, borderRadius: 12,
            border: '1.5px solid rgba(165,125,65,0.28)',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 0 rgba(140,100,40,0.18)',
          }}
        ><ArrowLeft size={18} /></button>

        {!isMobileMode && <span style={{ fontSize: 24 }}>{cfg.emoji}</span>}

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {t(cfg.titleKey)}
          </h1>
          {trip && (
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.name}
            </p>
          )}
        </div>

        {allItems.length > 0 && (
          <div style={{
            padding: '5px 14px', borderRadius: 99,
            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
            fontSize: 12, fontWeight: 900, color: cfg.color, flexShrink: 0,
          }}>
            {t('checklist.progress', { done: checked.length, total: allItems.length })}
          </div>
        )}
        {!isMobileMode && <CopyLinkButton style={{ marginLeft: 4 }} />}
        {!isMobileMode && <FullscreenButton />}
        <button onClick={toggleMode} style={{
          padding: '5px 9px', borderRadius: 9, border: '1.5px solid rgba(165,125,65,0.28)',
          background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 900, cursor: 'pointer',
        }}>{isMobileMode ? '💻' : '📱'}</button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(16px, 4vw, 28px) clamp(14px, 4vw, 20px) 80px' }}>

        {/* Add form (standalone items only) */}
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <input
            ref={inputRef}
            className="game-input"
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder={t(cfg.placeholderKey)}
            style={{ flex: 1, fontSize: 15 }}
          />
          <button
            type="submit"
            disabled={!newText.trim() || adding}
            onMouseDown={() => newText.trim() && setBtnPressed(true)}
            onMouseUp={() => setBtnPressed(false)}
            onMouseLeave={() => setBtnPressed(false)}
            onTouchStart={() => newText.trim() && setBtnPressed(true)}
            onTouchEnd={() => setBtnPressed(false)}
            style={{
              padding: '0 22px', borderRadius: 16, flexShrink: 0,
              background: newText.trim()
                ? `linear-gradient(135deg, ${cfg.checkColor}, ${cfg.color})`
                : 'rgba(165,125,65,0.15)',
              boxShadow: newText.trim() && !btnPressed
                ? `0 5px 0 ${cfg.shadow}, 0 8px 20px ${cfg.checkColor}30`
                : 'none',
              border: 'none', color: newText.trim() ? '#fff' : 'var(--text-muted)',
              fontSize: 24, fontWeight: 900, cursor: newText.trim() ? 'pointer' : 'default',
              transition: 'all 0.12s cubic-bezier(0.34,1.56,0.64,1)',
              transform: btnPressed ? 'scale(0.88) translateY(3px)' : 'scale(1) translateY(0)',
            }}
          ><Plus size={22} /></button>
        </form>

        {/* 刪除錯誤提示 */}
        {deleteError && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 10,
            background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.25)',
            fontSize: 12, fontWeight: 800, color: '#DC2626' }}>
            ⚠️ {deleteError}
          </div>
        )}

        {/* Progress bar */}
        {allItems.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)' }}>{t('checklist.progress.label')}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: cfg.color }}>{pct}%</span>
            </div>
            <div style={{
              height: 10, borderRadius: 99,
              background: 'rgba(165,125,65,0.14)',
              overflow: 'hidden',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.08)',
            }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 99,
                background: `linear-gradient(90deg, ${cfg.checkColor}, ${cfg.color})`,
                boxShadow: `0 2px 6px ${cfg.checkColor}40`,
                transition: 'width 0.5s cubic-bezier(0.34,1.56,0.64,1)',
              }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {allItems.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '70px 0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}>
            <div style={{ fontSize: 56 }}>{cfg.emptyEmoji}</div>
            <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-secondary)' }}>
              {t(cfg.emptyTextKey)}
            </p>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>
              {t(cfg.emptyHintKey)}
            </p>
          </div>
        )}

        {/* Unchecked items */}
        {unchecked.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {unchecked.map(item => (
              <ChecklistItem
                key={`${item.fromCard ? 'card' : 'list'}-${item.id}`}
                item={item}
                cfg={cfg}
                onToggle={item.onToggle}
                onDelete={item.onDelete}
              />
            ))}
          </div>
        )}

        {/* Divider */}
        {checked.length > 0 && unchecked.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1.5, background: 'rgba(165,125,65,0.18)' }} />
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)' }}>{t('checklist.completed.label')}</span>
            <div style={{ flex: 1, height: 1.5, background: 'rgba(165,125,65,0.18)' }} />
          </div>
        )}

        {/* Checked items */}
        {checked.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checked.map(item => (
              <ChecklistItem
                key={`${item.fromCard ? 'card' : 'list'}-${item.id}`}
                item={item}
                cfg={cfg}
                onToggle={item.onToggle}
                onDelete={item.onDelete}
              />
            ))}
          </div>
        )}

        {/* Completion message */}
        {allItems.length > 0 && checked.length === allItems.length && (
          <div style={{
            marginTop: 28, padding: '18px', borderRadius: 18, textAlign: 'center',
            background: `${cfg.bg}`,
            border: `2px solid ${cfg.border}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <p style={{ fontSize: 15, fontWeight: 900, color: cfg.color }}>{t('checklist.allDone')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
