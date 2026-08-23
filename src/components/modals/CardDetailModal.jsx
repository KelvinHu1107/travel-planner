import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, CircleCheck, Trash2, Plus, MoreHorizontal } from 'lucide-react'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../services/firebase'
import {
  addStorageUsedBytes, getStorageUsedMB,
  addAttachedTodo, removeAttachedTodo, toggleAttachedTodo,
  addAttachedExpense, removeAttachedExpense,
} from '../../services/firestore'
import { compressImage, IMAGE_LIMIT_MB, TRIP_LIMIT_MB } from '../../utils/imageUtils'
import { CATEGORY, timeToMinutes, minutesToTime } from '../cards/CardItem'
import { getDaysInRange } from '../../utils/dateUtils'
import FormatToolbar from '../ui/FormatToolbar'

const TRANSPORT_LABEL = { flight: '飛機', car: '自駕/計程車', transit: '大眾運輸', walk: '步行', boat: '船' }
const CURRENCY_FLAG = {
  TWD: '🇹🇼', JPY: '🇯🇵', USD: '🇺🇸', EUR: '🇪🇺',
  KRW: '🇰🇷', HKD: '🇭🇰', SGD: '🇸🇬', AUD: '🇦🇺',
}
const CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'KRW', 'HKD', 'SGD', 'AUD']

// ── 通用確認對話框 ────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel = '確認', danger = false, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onCancel}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: 'rgba(255,252,244,0.99)', borderRadius: 22,
        padding: '28px 24px', width: '100%', maxWidth: 340,
        boxShadow: '0 20px 60px rgba(80,40,5,0.32)',
        border: '1.5px solid rgba(165,125,65,0.28)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 10 }}>{title}</h3>
        {message && (
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 22 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px', borderRadius: 12,
            border: '1.5px solid rgba(165,125,65,0.25)',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            fontSize: 14, fontWeight: 900, cursor: 'pointer',
          }}>取消</button>
          <button onClick={onConfirm} style={{
            flex: 2, padding: '12px', borderRadius: 12, border: 'none',
            background: danger
              ? 'linear-gradient(135deg,#EF4444,#B91C1C)'
              : 'linear-gradient(135deg,#D97706,#B45309)',
            boxShadow: danger ? '0 4px 0 #7F1D1D' : '0 4px 0 #78350F',
            color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── 複製到其他天對話框 ────────────────────────
function CopyDaysDialog({ open, availableDays, onConfirm, onCancel }) {
  const [selected, setSelected] = useState([])
  const [copying, setCopying]   = useState(false)
  const [error, setError]       = useState('')

  if (!open) return null

  const toggle = (d) => setSelected(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
  )

  const handleConfirm = async () => {
    if (!selected.length) return
    setCopying(true); setError('')
    try { await onConfirm(selected) }
    catch { setError('複製失敗，請稍後再試') }
    finally { setCopying(false) }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onCancel}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: 'rgba(255,252,244,0.99)', borderRadius: 22,
        padding: '24px', width: '100%', maxWidth: 360,
        boxShadow: '0 20px 60px rgba(80,40,5,0.32)',
        border: '1.5px solid rgba(165,125,65,0.28)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 5 }}>複製到其他天</h3>
        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 16 }}>
          選擇要複製到哪幾天（可多選）
        </p>
        {error && (
          <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, color: '#DC2626',
            padding: '7px 11px', background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.22)', borderRadius: 9 }}>
            ⚠️ {error}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 20 }}>
          {availableDays.map(d => {
            const date = new Date(d + 'T00:00:00')
            const label = `${date.getMonth() + 1}/${date.getDate()}`
            const sel = selected.includes(d)
            return (
              <button key={d} onClick={() => toggle(d)} style={{
                padding: '7px 16px', borderRadius: 99, fontSize: 13, fontWeight: 900, cursor: 'pointer',
                border: `1.5px solid ${sel ? 'var(--accent)' : 'rgba(165,125,65,0.25)'}`,
                background: sel ? 'rgba(180,83,9,0.14)' : 'transparent',
                color: sel ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.12s',
              }}>{label}</button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px', borderRadius: 12,
            border: '1.5px solid rgba(165,125,65,0.25)',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            fontSize: 14, fontWeight: 900, cursor: 'pointer',
          }}>取消</button>
          <button onClick={handleConfirm} disabled={!selected.length || copying} style={{
            flex: 2, padding: '12px', borderRadius: 12, border: 'none',
            background: selected.length ? 'linear-gradient(135deg,#D97706,#B45309)' : 'rgba(165,125,65,0.15)',
            boxShadow: selected.length ? '0 4px 0 #78350F' : 'none',
            color: selected.length ? '#fff' : 'var(--text-muted)',
            fontSize: 14, fontWeight: 900, cursor: selected.length ? 'pointer' : 'default',
          }}>
            {copying ? '複製中…' : `複製到 ${selected.length || ''} 天`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 更多操作選單 ──────────────────────────────
function MoreMenuPopup({ items, onClose }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 490 }} onClick={onClose} />
      <div style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 500,
        background: 'rgba(255,252,244,0.99)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(80,40,5,0.22)',
        border: '1.5px solid rgba(165,125,65,0.25)',
        minWidth: 168,
      }}>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose() }}
            style={{
              width: '100%', padding: '13px 18px', border: 'none', background: 'transparent',
              textAlign: 'left', fontSize: 13, fontWeight: 900, cursor: 'pointer',
              color: 'var(--text-secondary)',
              borderBottom: i < items.length - 1 ? '1px solid rgba(165,125,65,0.12)' : 'none',
              display: 'flex', alignItems: 'center', gap: 11,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(165,125,65,0.07)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontSize: 17 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

// ── 圖片上傳工具 ──────────────────────────────
async function uploadImages(files, tripId) {
  const usedMB = await getStorageUsedMB(tripId)
  const compressed = await Promise.all(files.map(f => compressImage(f, IMAGE_LIMIT_MB)))
  const totalNewMB = compressed.reduce((s, f) => s + f.size, 0) / (1024 * 1024)
  if (usedMB + totalNewMB > TRIP_LIMIT_MB)
    throw new Error(`已超過旅遊計畫儲存上限 ${TRIP_LIMIT_MB}MB（目前使用 ${usedMB.toFixed(1)}MB）`)
  const urls = await Promise.all(compressed.map(async file => {
    const path = `trips/${tripId}/images/${Date.now()}_${file.name}`
    const fRef = storageRef(storage, path)
    await uploadBytes(fRef, file)
    return getDownloadURL(fRef)
  }))
  await addStorageUsedBytes(tripId, compressed.reduce((s, f) => s + f.size, 0))
  return urls
}

// ── 圖片 Grid ─────────────────────────────────
function ImageGrid({ images, onDelete, canEdit }) {
  if (!images?.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(82px,1fr))', gap: 8 }}>
      {images.map((url, i) => (
        <div key={i} style={{ position: 'relative' }}>
          <img src={url} alt="" onClick={() => window.open(url, '_blank')}
            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12,
              cursor: 'pointer', border: '1.5px solid rgba(165,125,65,0.22)',
              boxShadow: '0 2px 8px rgba(100,60,10,0.10)', transition: 'transform 0.1s, box-shadow 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(100,60,10,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(100,60,10,0.10)' }}
          />
          {canEdit && onDelete && (
            <button onClick={() => onDelete(i)} style={{
              position: 'absolute', top: -5, right: -5, width: 20, height: 20,
              borderRadius: '50%', background: '#DC2626', border: '2px solid #FAF6ED',
              color: '#fff', fontSize: 10, cursor: 'pointer', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><X size={12} /></button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── 單筆附加筆記 ─────────────────────────────
function AttachedNoteItem({ note, tripId, onSave, onRequestDelete }) {
  const [editing, setEditing]     = useState(false)
  const [draft, setDraft]         = useState({ ...note })
  const [uploading, setUploading] = useState(false)
  const noteTextareaRef = useRef(null)
  const cfg = CATEGORY.note

  const handleSave = () => { onSave(draft); setEditing(false) }
  const handleCancel = () => { setDraft({ ...note }); setEditing(false) }
  const handleContentChange = useCallback((val) => setDraft(d => ({ ...d, content: val })), [])

  return (
    <div style={{
      borderRadius: 16, background: cfg.bg,
      border: `1.5px solid ${editing ? cfg.border : 'rgba(91,33,182,0.18)'}`,
      overflow: 'hidden', transition: 'border 0.15s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 13px', borderBottom: '1px solid rgba(91,33,182,0.12)',
        background: 'rgba(91,33,182,0.05)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: cfg.color }}>
          📝 {editing ? '編輯筆記' : (note.title || '附加筆記')}
        </span>
        {!editing && (
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={() => setEditing(true)} style={{
              padding: '3px 9px', borderRadius: 7, fontSize: 11, fontWeight: 900,
              background: 'rgba(91,33,182,0.10)', border: '1px solid rgba(91,33,182,0.25)',
              color: cfg.color, cursor: 'pointer',
            }}>✏️ 編輯</button>
            <button onClick={onRequestDelete} style={{
              padding: '3px 9px', borderRadius: 7, fontSize: 11, fontWeight: 900,
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)',
              color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}><Trash2 size={13} /></button>
          </div>
        )}
      </div>
      <div style={{ padding: editing ? '0 0 12px' : '12px 14px' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '10px 14px 0' }}>
              <input className="game-input" type="text" placeholder="筆記標題（選填）"
                value={draft.title ?? ''} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                style={{ fontSize: 13 }} />
            </div>
            <FormatToolbar textareaRef={noteTextareaRef} content={draft.content ?? ''} onChange={handleContentChange} />
            <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea ref={noteTextareaRef} className="game-input"
                placeholder="筆記內容…" value={draft.content ?? ''}
                onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                rows={4} style={{ resize: 'vertical', lineHeight: 1.6, fontSize: 12, borderRadius: '0 0 12px 12px' }} />
              {(draft.images?.length ?? 0) > 0 && (
                <ImageGrid images={draft.images} canEdit
                  onDelete={i => setDraft(d => ({ ...d, images: d.images.filter((_, j) => j !== i) }))} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCancel} style={{
                  flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 900,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}>取消</button>
                <button onClick={handleSave} style={{
                  flex: 2, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 900,
                  background: 'linear-gradient(135deg,#D97706,#B45309)',
                  border: 'none', boxShadow: '0 4px 0 #78350F', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}><CircleCheck size={15} />儲存</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {note.title && <div style={{ fontSize: 13, fontWeight: 900, color: cfg.color, marginBottom: 5 }}>{note.title}</div>}
            {note.content && (
              <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)',
                lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{note.content}</p>
            )}
            {note.images?.length > 0 && (
              <div style={{ marginTop: 8 }}><ImageGrid images={note.images} canEdit={false} /></div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── 新增筆記表單 ──────────────────────────────
function AddNoteForm({ tripId, onAdd, onCancel }) {
  const [draft, setDraft]         = useState({ title: '', content: '', images: [] })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files).slice(0, 6 - draft.images.length)
    if (!files.length) return
    setUploading(true)
    try {
      const urls = await uploadImages(files, tripId)
      setDraft(d => ({ ...d, images: [...d.images, ...urls] }))
    } catch (err) { alert('上傳失敗：' + err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  return (
    <div style={{ borderRadius: 16, border: '1.5px solid rgba(91,33,182,0.35)',
      background: 'rgba(91,33,182,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '9px 13px', borderBottom: '1px solid rgba(91,33,182,0.12)',
        background: 'rgba(91,33,182,0.08)', fontSize: 12, fontWeight: 900, color: '#5B21B6' }}>
        ✍️ 新增筆記
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input className="game-input" type="text" placeholder="標題（選填）"
          value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          style={{ fontSize: 13 }} />
        <textarea className="game-input" placeholder="輸入筆記內容…"
          value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
          rows={3} style={{ resize: 'vertical', lineHeight: 1.6, fontSize: 12 }} autoFocus />
        {draft.images.length > 0 && (
          <ImageGrid images={draft.images} canEdit
            onDelete={i => setDraft(d => ({ ...d, images: d.images.filter((_, j) => j !== i) }))} />
        )}
        {draft.images.length < 6 && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              width: '100%', padding: '8px', borderRadius: 10, fontSize: 12, fontWeight: 900,
              border: '1.5px dashed rgba(165,125,65,0.35)', background: 'transparent',
              color: uploading ? 'var(--text-muted)' : 'var(--accent)', cursor: uploading ? 'not-allowed' : 'pointer',
            }}>{uploading ? '⏳ 上傳中…' : '🖼️ 附加圖片'}</button>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 900,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', cursor: 'pointer',
          }}>取消</button>
          <button
            onClick={() => { if (draft.content.trim() || draft.title.trim()) onAdd(draft) }}
            disabled={!draft.content.trim() && !draft.title.trim()}
            style={{
              flex: 2, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 900,
              background: 'linear-gradient(135deg,#D97706,#B45309)',
              border: 'none', boxShadow: '0 4px 0 #78350F', color: '#fff', cursor: 'pointer',
              opacity: (!draft.content.trim() && !draft.title.trim()) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><CircleCheck size={14} />加入筆記</button>
        </div>
      </div>
    </div>
  )
}

// ── 待辦事項區段 ──────────────────────────────
function AttachedTodosSection({ card, tripId }) {
  const [newText, setNewText] = useState('')
  const [adding, setAdding]   = useState(false)
  const todos = card.attachedTodos ?? []

  const handleAdd = async (e) => {
    e.preventDefault()
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    await addAttachedTodo(tripId, card.id, { id: `todo-${Date.now()}`, text, checked: false, createdAt: Date.now() })
    setNewText('')
    setAdding(false)
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)',
        letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <CircleCheck size={13} />待辦事項
        {todos.length > 0 && (
          <span style={{ background: 'rgba(180,83,9,0.10)', border: '1px solid rgba(180,83,9,0.25)',
            borderRadius: 20, padding: '2px 8px', fontSize: 10, color: '#B45309' }}>
            {todos.filter(t => t.checked).length}/{todos.length}
          </span>
        )}
      </div>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 7, marginBottom: todos.length ? 9 : 0 }}>
        <input className="game-input" type="text" placeholder="新增待辦項目…"
          value={newText} onChange={e => setNewText(e.target.value)}
          style={{ flex: 1, fontSize: 12, padding: '8px 12px' }} autoFocus />
        <button type="submit" disabled={!newText.trim() || adding} style={{
          padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 900, flexShrink: 0,
          background: newText.trim() ? 'linear-gradient(135deg,#D97706,#B45309)' : 'rgba(165,125,65,0.15)',
          border: 'none', boxShadow: newText.trim() ? '0 3px 0 #78350F' : 'none',
          color: newText.trim() ? '#fff' : 'var(--text-muted)', cursor: newText.trim() ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center',
        }}><Plus size={17} /></button>
      </form>
      {todos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {todos.map(todo => (
            <div key={todo.id} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 12,
              background: todo.checked ? 'rgba(165,125,65,0.05)' : 'rgba(255,252,244,0.90)',
              border: `1.5px solid ${todo.checked ? 'rgba(165,125,65,0.15)' : 'rgba(165,125,65,0.25)'}`,
              boxShadow: todo.checked ? 'none' : '0 2px 0 rgba(140,100,40,0.12)',
              transition: 'all 0.18s',
            }}>
              <button onClick={() => toggleAttachedTodo(tripId, card.id, todo.id)} style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                border: `2px solid ${todo.checked ? '#D97706' : 'rgba(165,125,65,0.40)'}`,
                background: todo.checked ? 'linear-gradient(135deg,#D97706cc,#B4530988)' : 'rgba(255,252,244,0.90)',
                boxShadow: todo.checked ? '0 2px 0 #78350F55' : '0 1.5px 0 rgba(140,100,40,0.18)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: '#fff', fontWeight: 900, transition: 'all 0.15s',
              }}>{todo.checked ? '✓' : ''}</button>
              <span style={{
                flex: 1, fontSize: 12, fontWeight: 800,
                color: todo.checked ? 'var(--text-muted)' : 'var(--text-secondary)',
                textDecoration: todo.checked ? 'line-through' : 'none',
                textDecorationColor: 'rgba(158,112,64,0.50)',
              }}>{todo.text}</span>
              <button onClick={() => removeAttachedTodo(tripId, card.id, todo)} style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.18)',
                color: '#DC2626', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 消費記帳區段 ──────────────────────────────
function AttachedExpensesSection({ card, tripId, autoShowForm }) {
  const [showForm, setShowForm] = useState(!!autoShowForm)
  const [form, setForm]         = useState({ name: '', amount: '', currency: 'TWD', notes: '' })
  const [saving, setSaving]     = useState(false)
  const expenses = card.attachedExpenses ?? []

  const totals = expenses.reduce((acc, e) => {
    const cur = e.currency ?? 'TWD'
    acc[cur] = (acc[cur] ?? 0) + Number(e.amount ?? 0)
    return acc
  }, {})

  const handleAdd = async (ev) => {
    ev.preventDefault()
    if (!form.name.trim() || !form.amount) return
    setSaving(true)
    await addAttachedExpense(tripId, card.id, {
      id: `aexp-${Date.now()}`, name: form.name.trim(),
      amount: Number(form.amount), currency: form.currency,
      notes: form.notes.trim(), createdAt: Date.now(),
    })
    setForm({ name: '', amount: '', currency: 'TWD', notes: '' })
    setShowForm(false)
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)',
          letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          💰 消費記帳
          {expenses.length > 0 && (
            <span style={{ background: 'rgba(146,64,14,0.12)', border: '1px solid rgba(146,64,14,0.28)',
              borderRadius: 20, padding: '2px 8px', fontSize: 10, color: '#92400E' }}>
              {expenses.length}
            </span>
          )}
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={{
            padding: '4px 11px', borderRadius: 18, fontSize: 11, fontWeight: 900,
            background: 'rgba(146,64,14,0.08)', border: '1.5px solid rgba(146,64,14,0.25)',
            color: '#92400E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}><Plus size={13} />新增</button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={{
          marginBottom: 10, padding: '14px', borderRadius: 16,
          background: 'rgba(146,64,14,0.05)', border: '1.5px solid rgba(146,64,14,0.20)',
          display: 'flex', flexDirection: 'column', gap: 9,
        }}>
          <input className="game-input" type="text" placeholder="消費名稱（例：門票）"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ fontSize: 13 }} required autoFocus />
          <div style={{ display: 'flex', gap: 9 }}>
            <input className="game-input" type="number" placeholder="金額" min="0" step="1"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              style={{ flex: 2, fontSize: 13 }} required />
            <select className="game-input" value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              style={{ flex: 1, fontSize: 13 }}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input className="game-input" type="text" placeholder="備注（選填）"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button"
              onClick={() => { setShowForm(false); setForm({ name: '', amount: '', currency: 'TWD', notes: '' }) }}
              style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 900,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer' }}>取消</button>
            <button type="submit" disabled={!form.name.trim() || !form.amount || saving}
              style={{ flex: 2, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 900,
                background: form.name.trim() && form.amount ? 'linear-gradient(135deg,#D97706,#B45309)' : 'rgba(165,125,65,0.15)',
                border: 'none', boxShadow: form.name.trim() && form.amount ? '0 4px 0 #78350F' : 'none',
                color: form.name.trim() && form.amount ? '#fff' : 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {saving ? '新增中…' : <><CircleCheck size={14} />加入</>}
            </button>
          </div>
        </form>
      )}

      {expenses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {expenses.map(exp => (
            <div key={exp.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 13px', borderRadius: 13,
              background: 'rgba(146,64,14,0.04)', border: '1px solid rgba(146,64,14,0.14)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>{exp.name}</div>
                {exp.notes && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>{exp.notes}</div>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#92400E', flexShrink: 0 }}>
                {CURRENCY_FLAG[exp.currency] ?? '💱'} {Number(exp.amount).toLocaleString()}
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 4 }}>{exp.currency ?? 'TWD'}</span>
              </div>
              <button onClick={() => removeAttachedExpense(tripId, card.id, exp)} style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.20)',
                color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><X size={12} /></button>
            </div>
          ))}
          {Object.keys(totals).length > 0 && (
            <div style={{ padding: '10px 13px', borderRadius: 13,
              background: 'rgba(146,64,14,0.08)', border: '1.5px solid rgba(146,64,14,0.22)',
              display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', marginRight: 4 }}>小計</span>
              {Object.entries(totals).map(([cur, total]) => (
                <span key={cur} style={{ fontSize: 14, fontWeight: 900, color: '#92400E' }}>
                  {CURRENCY_FLAG[cur] ?? '💱'} {Number(total).toLocaleString()} {cur}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 主 Modal ─────────────────────────────────
export default function CardDetailModal({ card, onClose, onDelete, onEdit, onUpdate, tripId, isMobile, trip, onCopyCard }) {
  const navigate = useNavigate()

  // 對話框狀態
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [confirmDeleteNoteIdx, setConfirmDeleteNoteIdx] = useState(null)
  const [showCopyDialog, setShowCopyDialog]       = useState(false)

  // 更多選單
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  // 新增區段觸發
  const [showAddTodo, setShowAddTodo]       = useState(false)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddNote, setShowAddNote]       = useState(false)

  // 圖片上傳
  const [uploadingImg, setUploadingImg] = useState(false)
  const cardImgRef = useRef(null)

  const cfg     = CATEGORY[card.type] ?? CATEGORY.note
  const endTime = minutesToTime(timeToMinutes(card.startTime) + card.duration)
  const todayIdx   = (new Date().getDay() + 6) % 7
  const todayHours = card.weekdayText?.[todayIdx]?.replace(/^[^:]+: ?/, '') ?? null

  const availableDays = trip ? getDaysInRange(trip.startDate, trip.endDate).filter(d => d !== card.day) : []

  // 導航
  const handleNavigate = () => {
    const base = 'https://www.google.com/maps/dir/?api=1'
    const url = card.placeId
      ? `${base}&destination=${encodeURIComponent(card.address || card.title)}&destination_place_id=${card.placeId}`
      : card.lat && card.lng
      ? `${base}&destination=${card.lat},${card.lng}`
      : `${base}&destination=${encodeURIComponent(card.address || card.title)}`
    window.open(url, '_blank')
  }

  // 筆記 CRUD
  const saveNotes = (notes) => onUpdate?.(card.id, { attachedNotes: notes })
  const handleEditNote   = (idx, updated) => { const n = [...(card.attachedNotes ?? [])]; n[idx] = { ...n[idx], ...updated }; saveNotes(n) }
  const handleDeleteNote = (idx) => { saveNotes((card.attachedNotes ?? []).filter((_, i) => i !== idx)); setConfirmDeleteNoteIdx(null) }
  const handleAddNote    = (draft) => {
    saveNotes([...(card.attachedNotes ?? []), { id: `note-${Date.now()}`, ...draft, attachedAt: Date.now() }])
    setShowAddNote(false)
  }

  // 卡片圖片
  const handleCardImgPick = async (e) => {
    const files = Array.from(e.target.files).slice(0, 6 - (card.images?.length ?? 0))
    if (!files.length || !tripId) return
    setUploadingImg(true)
    try {
      const urls = await uploadImages(files, tripId)
      onUpdate?.(card.id, { images: [...(card.images ?? []), ...urls] })
    } catch (err) { alert('上傳失敗：' + err.message) }
    finally { setUploadingImg(false); e.target.value = '' }
  }

  const handleDeleteCardImage = (idx) => {
    onUpdate?.(card.id, { images: (card.images ?? []).filter((_, i) => i !== idx) })
  }

  // 複製到其他天
  const handleCopyTodays = async (days) => {
    await onCopyCard(card, days)
    setShowCopyDialog(false)
  }

  // MoreMenu 選項
  const moreItems = [
    { icon: '🖼️', label: '新增圖片', onClick: () => { cardImgRef.current?.click() } },
    { icon: '📝', label: '新增筆記', onClick: () => setShowAddNote(true) },
    { icon: '💰', label: '新增消費', onClick: () => setShowAddExpense(true) },
    { icon: '✅', label: '新增待辦', onClick: () => setShowAddTodo(true) },
    ...(onCopyCard && availableDays.length > 0
      ? [{ icon: '📋', label: '複製到其他天', onClick: () => setShowCopyDialog(true) }]
      : []),
  ]

  const hasTodos    = (card.attachedTodos?.length ?? 0) > 0
  const hasExpenses = (card.attachedExpenses?.length ?? 0) > 0
  const hasNotes    = (card.attachedNotes?.length ?? 0) > 0
  const hasImages   = (card.images?.length ?? 0) > 0

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(120,80,20,0.30)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: isMobile ? 'flex-end' : 'center',
          justifyContent: 'center',
          padding: isMobile ? 0 : 20,
        }}
        onClick={onClose}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: isMobile ? '100%' : 500,
            maxHeight: isMobile ? '92vh' : '90vh',
            background: 'rgba(255,252,244,0.98)',
            border: isMobile ? 'none' : `1.5px solid ${cfg.border}`,
            borderTop: `4px solid ${cfg.color}`,
            borderRadius: isMobile ? '26px 26px 0 0' : 24,
            boxShadow: `0 -4px 50px ${cfg.color}18, 0 20px 80px rgba(80,40,5,0.25)`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* 景點封面照 */}
          {card.photo && (
            <div style={{ position: 'relative', height: 160, flexShrink: 0 }}>
              <img src={card.photo} alt={card.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, rgba(255,252,244,0) 40%, rgba(255,252,244,0.95) 100%)' }} />
            </div>
          )}

          {/* 標頭 */}
          <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
            {isMobile && (
              <div style={{ width: 38, height: 4, borderRadius: 99,
                background: 'rgba(165,125,65,0.30)', margin: '0 auto 16px' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                background: cfg.bg, border: `2px solid ${cfg.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {cfg.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: cfg.color,
                  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 }}>{cfg.label}</div>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)',
                  lineHeight: 1.3, wordBreak: 'break-word' }}>{card.title}</h2>
              </div>
              <button onClick={onClose} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10,
                background: 'rgba(165,125,65,0.12)', border: '1px solid rgba(165,125,65,0.22)',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={13} />
              </button>
            </div>

            {/* 時間 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
              padding: '10px 13px', borderRadius: 13,
              background: 'rgba(165,125,65,0.08)', border: '1px solid rgba(165,125,65,0.18)' }}>
              <span style={{ fontSize: 15 }}>📅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>
                  {card.day}　{card.startTime} – {endTime}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginTop: 1 }}>
                  共 {card.duration >= 60
                    ? `${Math.floor(card.duration/60)} 小時${card.duration%60 ? ` ${card.duration%60} 分` : ''}`
                    : `${card.duration} 分鐘`}
                </div>
              </div>
            </div>
          </div>

          {/* 捲動內容區 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* ── 景點資訊（地址 + 營業時間，不顯示評分）── */}
              {card.type === 'attraction' && (card.address || todayHours || card.weekdayText) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {card.address && (
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start',
                      padding: '11px 14px', borderRadius: 13,
                      background: 'rgba(165,125,65,0.07)', border: '1px solid rgba(165,125,65,0.18)' }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>📍</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)',
                        lineHeight: 1.5, wordBreak: 'break-all' }}>{card.address}</span>
                    </div>
                  )}
                  {todayHours && (
                    <div style={{ padding: '11px 14px', borderRadius: 13,
                      background: 'rgba(15,118,110,0.07)', border: '1px solid rgba(15,118,110,0.20)' }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: '#0F766E',
                        letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>今日營業時間</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>🕐 {todayHours}</div>
                    </div>
                  )}
                  {!todayHours && card.weekdayText && (
                    <details style={{ cursor: 'pointer' }}>
                      <summary style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)',
                        padding: '7px 0', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>📋</span> 查看本週完整時段
                      </summary>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {card.weekdayText.map((line, i) => (
                          <div key={i} style={{ fontSize: 12, fontWeight: 800,
                            color: i === todayIdx ? 'var(--accent)' : 'var(--text-secondary)',
                            padding: '5px 11px', borderRadius: 9,
                            background: i === todayIdx ? 'rgba(180,83,9,0.08)' : 'transparent' }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* ── 交通 ── */}
              {card.type === 'transport' && (card.from || card.to) && (
                <div style={{ padding: '14px', borderRadius: 13,
                  background: 'rgba(15,118,110,0.07)', border: '1px solid rgba(15,118,110,0.20)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)',
                        letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>出發地</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{card.from || '—'}</div>
                    </div>
                    <div style={{ fontSize: 20, color: 'var(--text-muted)' }}>→</div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)',
                        letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>目的地</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{card.to || '—'}</div>
                    </div>
                  </div>
                  {card.mode && (
                    <div style={{ marginTop: 9, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#0F766E' }}>
                      {TRANSPORT_LABEL[card.mode] ?? card.mode}
                    </div>
                  )}
                </div>
              )}

              {/* ── 開銷 ── */}
              {card.type === 'expense' && card.amount != null && (
                <div style={{ padding: '18px', borderRadius: 13, textAlign: 'center',
                  background: 'rgba(146,64,14,0.07)', border: '1px solid rgba(146,64,14,0.20)' }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)',
                    letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>金額</div>
                  <div style={{ fontSize: 34, fontWeight: 900, color: '#92400E' }}>
                    {CURRENCY_FLAG[card.currency] ?? '💱'} {Number(card.amount).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', marginTop: 3 }}>
                    {card.currency ?? 'TWD'}
                  </div>
                  {card.notes && (
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, textAlign: 'left',
                      background: 'rgba(146,64,14,0.06)', border: '1px solid rgba(146,64,14,0.18)',
                      fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      📝 {card.notes}
                    </div>
                  )}
                </div>
              )}

              {/* ── 筆記內容 ── */}
              {card.type === 'note' && card.content && (
                <div style={{ padding: '14px', borderRadius: 13,
                  background: 'rgba(91,33,182,0.06)', border: '1px solid rgba(91,33,182,0.18)' }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#5B21B6',
                    letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>筆記內容</div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)',
                    lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>{card.content}</p>
                </div>
              )}

              {/* ── 圖片（只有有圖片時才顯示）── */}
              {hasImages && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)',
                    letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 6 }}>
                    🖼️ 圖片
                    <span style={{ background: 'rgba(165,125,65,0.15)', border: '1px solid rgba(165,125,65,0.30)',
                      borderRadius: 20, padding: '2px 8px', fontSize: 10, color: 'var(--accent)' }}>
                      {card.images.length}
                    </span>
                  </div>
                  <ImageGrid images={card.images} canEdit onDelete={handleDeleteCardImage} />
                  {card.images.length < 6 && (
                    <button type="button"
                      onClick={() => !uploadingImg && cardImgRef.current?.click()}
                      disabled={uploadingImg}
                      style={{ marginTop: 8, width: '100%', padding: '9px', borderRadius: 12, fontSize: 12, fontWeight: 900,
                        border: '1.5px dashed rgba(165,125,65,0.35)', background: 'transparent',
                        color: uploadingImg ? 'var(--text-muted)' : 'var(--accent)',
                        cursor: uploadingImg ? 'not-allowed' : 'pointer' }}>
                      {uploadingImg ? '⏳ 上傳中…' : `🖼️ 繼續上傳（最多 ${6 - card.images.length} 張）`}
                    </button>
                  )}
                </div>
              )}
              <input ref={cardImgRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleCardImgPick} />

              {/* ── 待辦事項（有內容 or 觸發新增時顯示）── */}
              {(hasTodos || showAddTodo) && (
                <div style={{ borderTop: '1px solid rgba(165,125,65,0.12)', paddingTop: 14 }}>
                  <AttachedTodosSection card={card} tripId={tripId} />
                </div>
              )}

              {/* ── 消費記帳（有內容 or 觸發新增時顯示）── */}
              {(hasExpenses || showAddExpense) && (
                <div style={{ borderTop: '1px solid rgba(165,125,65,0.12)', paddingTop: 14 }}>
                  <AttachedExpensesSection card={card} tripId={tripId} autoShowForm={showAddExpense && !hasExpenses} />
                </div>
              )}

              {/* ── 附加筆記（有內容 or 觸發新增時顯示）── */}
              {(hasNotes || showAddNote) && (
                <div style={{ borderTop: '1px solid rgba(165,125,65,0.12)', paddingTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)',
                    letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 6 }}>
                    📝 附加筆記
                    {hasNotes && (
                      <span style={{ background: 'rgba(91,33,182,0.12)', border: '1px solid rgba(91,33,182,0.28)',
                        borderRadius: 20, padding: '2px 8px', fontSize: 10, color: '#5B21B6' }}>
                        {card.attachedNotes.length}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {(card.attachedNotes ?? []).map((note, i) => (
                      <AttachedNoteItem
                        key={note.id ?? i}
                        note={note}
                        tripId={tripId}
                        onSave={(updated) => handleEditNote(i, updated)}
                        onRequestDelete={() => setConfirmDeleteNoteIdx(i)}
                      />
                    ))}
                    {showAddNote && (
                      <AddNoteForm
                        tripId={tripId}
                        onAdd={handleAddNote}
                        onCancel={() => setShowAddNote(false)}
                      />
                    )}
                    {!showAddNote && hasNotes && (
                      <button onClick={() => setShowAddNote(true)} style={{
                        width: '100%', padding: '9px', borderRadius: 12, fontSize: 12, fontWeight: 900,
                        border: '1.5px dashed rgba(91,33,182,0.28)', background: 'transparent',
                        color: '#5B21B6', cursor: 'pointer',
                      }}>+ 再加一則筆記</button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* 底部操作列 */}
          <div style={{ padding: '12px 20px 18px', flexShrink: 0,
            borderTop: '1px solid rgba(165,125,65,0.15)' }}>

            {/* 主要動作（Maps / 筆記頁）*/}
            {card.type === 'attraction' && (
              <button onClick={handleNavigate} className="btn-game" style={{
                width: '100%', padding: '12px', fontSize: 13, marginBottom: 10,
                background: 'linear-gradient(135deg,#C2410C,#9A3412)',
                boxShadow: '0 5px 0 #7C2D12', color: '#fff', borderRadius: 14,
              }}>🗺️ 開啟 Google Maps 導航</button>
            )}
            {card.type === 'transport' && (card.from || card.to) && (
              <button onClick={() => {
                const base = 'https://www.google.com/maps/dir/?api=1'
                const from = encodeURIComponent(card.from || '')
                const to   = encodeURIComponent(card.to || '')
                const mode = card.mode === 'transit' ? 'transit' : card.mode === 'walk' ? 'walking' : 'driving'
                window.open(card.from && card.to
                  ? `${base}&origin=${from}&destination=${to}&travelmode=${mode}`
                  : `${base}&destination=${from || to}`, '_blank')
              }} className="btn-game" style={{
                width: '100%', padding: '12px', fontSize: 13, marginBottom: 10,
                background: 'linear-gradient(135deg,#0F766E,#0D5C56)',
                boxShadow: '0 5px 0 #064E3B', color: '#fff', borderRadius: 14,
              }}>🗺️ 開啟 Google Maps 路線規劃</button>
            )}
            {card.type === 'note' && (
              <button onClick={() => { onClose(); navigate(`/trip/${tripId}/note/${card.id}`) }} style={{
                width: '100%', padding: '12px', fontSize: 13, marginBottom: 10,
                background: 'linear-gradient(135deg,#7C3AED,#5B21B6)',
                boxShadow: '0 5px 0 #3B0764', color: '#fff', fontWeight: 900,
                cursor: 'pointer', border: 'none', borderRadius: 14,
              }}>📄 開啟完整筆記頁面</button>
            )}

            {/* 次要動作：編輯 ｜ ... ｜ 刪除 */}
            <div style={{ display: 'flex', gap: 9 }}>
              <button onClick={() => onEdit(card)} style={{
                flex: 2, padding: '11px', borderRadius: 12,
                background: 'linear-gradient(135deg,#D97706,#B45309)',
                border: 'none', boxShadow: '0 4px 0 #78350F',
                color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer',
              }}>✏️ 編輯</button>

              {/* 更多選單 */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setShowMoreMenu(v => !v)}
                  style={{
                    width: 46, height: 46, borderRadius: 12,
                    background: 'rgba(165,125,65,0.10)', border: '1.5px solid rgba(165,125,65,0.28)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <MoreHorizontal size={20} />
                </button>
                {showMoreMenu && (
                  <MoreMenuPopup items={moreItems} onClose={() => setShowMoreMenu(false)} />
                )}
              </div>

              <button onClick={() => setShowConfirmDelete(true)} style={{
                width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.25)',
                color: '#DC2626', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Trash2 size={17} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 對話框（在 modal 之外，z-index 更高）── */}
      <ConfirmDialog
        open={showConfirmDelete}
        title="刪除行程卡片"
        message={`確定要刪除「${card.title}」？此操作無法復原。`}
        confirmLabel="確認刪除"
        danger
        onConfirm={() => { onDelete(card.id); onClose() }}
        onCancel={() => setShowConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmDeleteNoteIdx !== null}
        title="刪除附加筆記"
        message="確定要刪除這則筆記嗎？"
        confirmLabel="確認刪除"
        danger
        onConfirm={() => handleDeleteNote(confirmDeleteNoteIdx)}
        onCancel={() => setConfirmDeleteNoteIdx(null)}
      />
      <CopyDaysDialog
        open={showCopyDialog}
        availableDays={availableDays}
        onConfirm={handleCopyTodays}
        onCancel={() => setShowCopyDialog(false)}
      />
    </>
  )
}
