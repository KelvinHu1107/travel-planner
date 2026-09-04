import { useState, useRef, useCallback, useEffect } from 'react'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../../services/firebase'
import { addStorageUsedBytes, getStorageUsedMB } from '../../services/firestore'
import { compressImage, IMAGE_LIMIT_MB, TRIP_LIMIT_MB } from '../../utils/imageUtils'
import { CATEGORY } from '../cards/CardItem'
import PlaceSearch from '../ui/PlaceSearch'
import FormatToolbar from '../ui/FormatToolbar'
import { loadGoogleMaps, nearbySearch } from '../../services/maps'
import { ArrowLeft, X, CircleCheck, Plus, FileText, Pencil, AlertTriangle,
  Plane, Car, Train, Footprints, Sailboat,
  UtensilsCrossed, Landmark, BedDouble, SquareParking,
} from 'lucide-react'
import {
  AirplaneTakeoff, PersonSimpleWalk, Boat,
} from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext'

const TRANSPORT_MODES = [
  { id: 'flight',  IconComp: AirplaneTakeoff, labelKey: 'addCard.transport.flight' },
  { id: 'transit', IconComp: Train,           labelKey: 'addCard.transport.transit' },
  { id: 'car',     IconComp: Car,              labelKey: 'addCard.transport.car' },
  { id: 'walk',    IconComp: PersonSimpleWalk, labelKey: 'addCard.transport.walk' },
  { id: 'boat',    IconComp: Boat,             labelKey: 'addCard.transport.boat' },
]

const CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'KRW', 'HKD', 'SGD', 'AUD']

const EXPENSE_CATEGORIES = [
  { id: 'food',          icon: '🍜', labelKey: 'addCard.expense.food' },
  { id: 'transport',     icon: '🚌', labelKey: 'addCard.expense.transport' },
  { id: 'accommodation', icon: '🏨', labelKey: 'addCard.expense.accommodation' },
  { id: 'shopping',      icon: '🛍️', labelKey: 'addCard.expense.shopping' },
  { id: 'ticket',        icon: '🎟️', labelKey: 'addCard.expense.ticket' },
  { id: 'other',         icon: '💼', labelKey: 'addCard.expense.other' },
]

const DURATION_VALUES = [30, 60, 90, 120, 180, 240, 360, 480, 600, 720, 960, 1440]

// CATEGORY 沒有 note/expense 條目，此處提供顯示用的預設樣式（label 走 i18n，不硬編碼）
const CARD_CFG_EXTRA = {
  note:    { icon: '📝', IconComp: null, color: '#5B21B6', bg: 'rgba(91,33,182,0.07)',  border: 'rgba(91,33,182,0.28)' },
  expense: { icon: '💰', IconComp: null, color: '#92400E', bg: 'rgba(146,64,14,0.07)',  border: 'rgba(146,64,14,0.28)' },
}

function getDurationLabel(mins, t) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hr  = t('addCard.field.duration.hour')
  const min = t('addCard.field.duration.min')
  if (h === 0) return `${m} ${min}`
  if (m === 0) return `${h} ${hr}`
  return `${h} ${hr} ${m} ${min}`
}

function Label({ children }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 800,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      display: 'block',
      marginBottom: 7,
    }}>
      {children}
    </label>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

const PLACE_CATEGORIES = new Set(['attraction', 'restaurant', 'accommodation'])
const QUICK_LABEL_KEYS = new Set(['restaurant', 'accommodation'])

function tToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// ── 步驟一：選類別 ──────────────────────────
function CategoryStep({ onSelect }) {
  const { t } = useLanguage()
  return (
    <div>
      <h2 style={{ fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>
        {t('addCard.step1.title')}
      </h2>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 24 }}>
        {t('addCard.step1.subtitle')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {Object.entries(CATEGORY).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              padding: '18px 14px',
              borderRadius: 18,
              background: cfg.bg,
              border: `1.5px solid ${cfg.border}`,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-3px) scale(1.03)'
              e.currentTarget.style.boxShadow = `0 8px 22px ${cfg.color}28`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            {cfg.IconComp
              ? <cfg.IconComp size={30} weight="regular" color={cfg.color} />
              : <span style={{ fontSize: 30 }}>{cfg.icon}</span>}
            <span style={{ fontSize: 14, fontWeight: 900, color: cfg.color }}>
              {QUICK_LABEL_KEYS.has(key) ? t('addCard.quick.' + key) : t('category.' + key)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 附近搜尋區段 ─────────────────────────────
const NEARBY_TYPES = [
  { id: 'restaurant',         labelKey: 'addCard.nearby.type.restaurant',    IconComp: UtensilsCrossed },
  { id: 'tourist_attraction', labelKey: 'addCard.nearby.type.attraction',    IconComp: Landmark },
  { id: 'lodging',            labelKey: 'addCard.nearby.type.accommodation', IconComp: BedDouble },
  { id: 'parking',            labelKey: 'addCard.nearby.type.parking',       IconComp: SquareParking },
]

const CATEGORY_EXCLUDE_TYPE = {
  restaurant:    'restaurant',
  attraction:    'tourist_attraction',
  accommodation: 'lodging',
}

function NearbySearchSection({ lat, lng, pendingNearby, onAddNearby, onClearNearby, defaultSearchType, excludeType }) {
  const { t } = useLanguage()
  const [activeType, setActiveType] = useState(null)
  const [results, setResults]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [searchErr, setSearchErr]   = useState('')
  const [showAll, setShowAll]       = useState(false)

  const runSearch = useCallback(async (typeId) => {
    setActiveType(typeId); setResults([]); setLoading(true); setSearchErr(''); setShowAll(false)
    try {
      await loadGoogleMaps()
      const places = await nearbySearch(lat, lng, typeId, 500, 15)
      setResults(places)
    } catch (e) {
      setSearchErr(t('addCard.nearby.searchError', { message: e.message }))
    } finally { setLoading(false) }
  }, [lat, lng, t])

  useEffect(() => {
    if (defaultSearchType) runSearch(defaultSearchType)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (typeId) => {
    if (activeType === typeId) { setActiveType(null); setResults([]); setShowAll(false); return }
    runSearch(typeId)
  }

  const displayResults = showAll ? results : results.slice(0, 5)

  return (
    <div style={{ borderRadius: 14, border: '1.5px solid rgba(15,118,110,0.28)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'rgba(15,118,110,0.06)', borderBottom: '1px solid rgba(15,118,110,0.15)' }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: '#0F766E', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 9 }}>
          {t('addCard.nearby.searchTitle')}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {NEARBY_TYPES.filter(nt => nt.id !== excludeType).map(nt => (
            <button key={nt.id} type="button" onClick={() => handleSearch(nt.id)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 11, fontWeight: 900,
              border: `1.5px solid ${activeType === nt.id ? '#0F766E' : 'rgba(15,118,110,0.22)'}`,
              background: activeType === nt.id ? 'rgba(15,118,110,0.14)' : 'rgba(255,252,244,0.70)',
              color: activeType === nt.id ? '#0F766E' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
              <nt.IconComp size={16} />
              <span>{t(nt.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ padding: '14px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
          {t('addCard.nearby.searching')}
        </div>
      )}
      {searchErr && (
        <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 5 }}>
          <AlertTriangle size={13} /> {searchErr}
        </div>
      )}
      {results.length > 0 && !loading && (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {displayResults.map(place => {
            const isSelected = pendingNearby?.place.placeId === place.placeId
            return (
              <div key={place.placeId} style={{
                padding: '10px 14px',
                borderBottom: '1px solid rgba(165,125,65,0.10)',
                background: isSelected ? 'rgba(15,118,110,0.06)' : 'transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {place.photo
                    ? <img src={place.photo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(165,125,65,0.12)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📍</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</div>
                    {place.rating && (
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#D97706' }}>★ {place.rating.toFixed(1)}</div>
                    )}
                    <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                      {['before', 'after'].map(pos => {
                        const isActive = isSelected && pendingNearby?.position === pos
                        return (
                          <button key={pos} type="button"
                            onClick={() => isActive ? onClearNearby() : onAddNearby(place, pos)}
                            style={{
                              padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 900, cursor: 'pointer',
                              background: isActive ? 'rgba(15,118,110,0.18)' : 'rgba(165,125,65,0.10)',
                              border: `1.5px solid ${isActive ? '#0F766E' : 'rgba(165,125,65,0.25)'}`,
                              color: isActive ? '#0F766E' : 'var(--text-secondary)',
                            }}>
                            {t(pos === 'before' ? 'addCard.nearby.addBefore' : 'addCard.nearby.addAfter')}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {!showAll && results.length > 5 && (
            <button type="button" onClick={() => setShowAll(true)} style={{
              width: '100%', padding: '10px 14px', fontSize: 11, fontWeight: 900,
              background: 'rgba(15,118,110,0.06)', border: 'none',
              borderTop: '1px solid rgba(15,118,110,0.15)',
              color: '#0F766E', cursor: 'pointer', textAlign: 'center',
            }}>
              {t('addCard.nearby.showMore', { count: results.length - 5 })}
            </button>
          )}
        </div>
      )}
      {results.length === 0 && !loading && activeType && !searchErr && (
        <div style={{ padding: '12px 14px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
          {t('addCard.nearby.empty')}
        </div>
      )}
      {pendingNearby && (
        <div style={{
          padding: '9px 14px', background: 'rgba(15,118,110,0.08)',
          borderTop: '1px solid rgba(15,118,110,0.18)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#0F766E', flex: 1 }}>
            {t(pendingNearby.position === 'before' ? 'addCard.nearby.pendingBefore' : 'addCard.nearby.pendingAfter', { name: pendingNearby.place.name })}
          </span>
          <button type="button" onClick={onClearNearby} style={{
            padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 900,
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)',
            color: '#DC2626', cursor: 'pointer',
          }}>{t('common.cancel')}</button>
        </div>
      )}
    </div>
  )
}

// ── 步驟二：填詳細資料 ──────────────────────
function DetailsStep({ category, defaultDay, defaultTime, editCard, tripId, existingCards, onSubmit, onBack }) {
  const { t } = useLanguage()
  const cfg = CATEGORY[category] ?? CARD_CFG_EXTRA[category] ?? CATEGORY.attraction
  const isEdit = !!editCard
  const isPlaceCategory = PLACE_CATEGORIES.has(category)
  const [uploading, setUploading]                   = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [pendingNearby, setPendingNearby]             = useState(null)
  const [editingTitle, setEditingTitle]               = useState(isEdit)
  const [overlapError, setOverlapError]               = useState('')
  const [amountError, setAmountError]                 = useState('')
  const [uploadError, setUploadError]               = useState('')
  const fileInputRef       = useRef(null)
  const attachmentInputRef = useRef(null)
  const noteTextareaRef    = useRef(null)

  const [form, setForm] = useState(isEdit ? {
    title: editCard.title ?? '',
    startTime: editCard.startTime ?? defaultTime ?? '09:00',
    duration: editCard.duration ?? 60,
    from: editCard.from ?? '', to: editCard.to ?? '', mode: editCard.mode ?? 'transit',
    address: editCard.address ?? '',
    lat: editCard.lat ?? null, lng: editCard.lng ?? null,
    placeId: editCard.placeId ?? null,
    weekdayText: editCard.weekdayText ?? null,
    rating: editCard.rating ?? null,
    photo: editCard.photo ?? null,
    amount: editCard.amount ?? '', currency: editCard.currency ?? 'TWD', expenseCategory: editCard.expenseCategory ?? 'other',
    notes: editCard.notes ?? '',
    content: editCard.content ?? '',
    images: editCard.images ?? [],
    attachments: editCard.attachments ?? [],
  } : {
    title: '',
    startTime: defaultTime || '09:00',
    duration: 60,
    from: '', to: '', mode: 'transit',
    address: '',
    lat: null, lng: null, placeId: null, weekdayText: null, rating: null, photo: null,
    amount: '', currency: 'TWD', expenseCategory: 'other',
    notes: '',
    content: '',
    images: [],
    attachments: [],
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleImagePick = async (e) => {
    const rawFiles = Array.from(e.target.files).slice(0, 6 - form.images.length)
    if (!rawFiles.length || !tripId) return
    setUploading(true)
    try {
      const usedMB = await getStorageUsedMB(tripId)
      const compressed = await Promise.all(rawFiles.map(f => compressImage(f, IMAGE_LIMIT_MB)))
      const totalNewMB = compressed.reduce((s, f) => s + f.size, 0) / (1024 * 1024)

      if (usedMB + totalNewMB > TRIP_LIMIT_MB) {
        setUploadError(t('addCard.storage.limit', { limit: TRIP_LIMIT_MB, used: usedMB.toFixed(1) }))
        return
      }

      const timeout = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))

      const urls = await Promise.all(compressed.map(async file => {
        const path = `trips/${tripId}/images/${Date.now()}_${file.name}`
        const fRef = storageRef(storage, path)
        await Promise.race([uploadBytes(fRef, file), timeout(30000, t('addCard.upload.timeout'))])
        return getDownloadURL(fRef)
      }))

      const totalBytes = compressed.reduce((s, f) => s + f.size, 0)
      await addStorageUsedBytes(tripId, totalBytes)
      set('images', [...form.images, ...urls])
      setUploadError('')
    } catch (err) {
      setUploadError(t('addCard.upload.error', { message: err.message }))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeImage = (idx) => {
    const url = form.images[idx]
    set('images', form.images.filter((_, i) => i !== idx))
    if (url) {
      try {
        const encoded = new URL(url).pathname.split('/o/')[1]
        if (encoded) deleteObject(storageRef(storage, decodeURIComponent(encoded.split('?')[0]))).catch(() => {})
      } catch (_) {}
    }
  }

  const handleAttachmentPick = async (e) => {
    const rawFiles = Array.from(e.target.files).slice(0, 5 - form.attachments.length)
    if (!rawFiles.length || !tripId) return
    const FILE_LIMIT_MB = 3
    const oversized = rawFiles.find(f => f.size > FILE_LIMIT_MB * 1024 * 1024)
    if (oversized) {
      setUploadError(t('addCard.attachment.oversized', {
        name: oversized.name,
        limit: FILE_LIMIT_MB,
        size: (oversized.size / 1024 / 1024).toFixed(1),
      }))
      e.target.value = ''
      return
    }
    setUploadingAttachment(true)
    try {
      const usedMB = await getStorageUsedMB(tripId)
      const totalNewMB = rawFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)
      if (usedMB + totalNewMB > TRIP_LIMIT_MB) {
        setUploadError(t('addCard.storage.limit', { limit: TRIP_LIMIT_MB, used: usedMB.toFixed(1) }))
        return
      }
      const attachTimeout = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
      const newAttachments = await Promise.all(rawFiles.map(async (file) => {
        const path = `trips/${tripId}/files/${Date.now()}_${file.name}`
        const fRef = storageRef(storage, path)
        await Promise.race([uploadBytes(fRef, file), attachTimeout(30000, t('addCard.upload.timeout'))])
        const url = await getDownloadURL(fRef)
        return { url, name: file.name, type: file.type || 'application/octet-stream', size: file.size }
      }))
      const totalBytes = rawFiles.reduce((s, f) => s + f.size, 0)
      await addStorageUsedBytes(tripId, totalBytes)
      set('attachments', [...form.attachments, ...newAttachments])
      setUploadError('')
    } catch (err) {
      setUploadError(t('addCard.upload.error', { message: err.message }))
    } finally {
      setUploadingAttachment(false)
      e.target.value = ''
    }
  }

  const removeAttachment = async (idx) => {
    const att = form.attachments[idx]
    if (att?.url) {
      try {
        const encoded = new URL(att.url).pathname.split('/o/')[1]
        if (encoded) await deleteObject(storageRef(storage, decodeURIComponent(encoded.split('?')[0])))
      } catch (_) {}
    }
    set('attachments', form.attachments.filter((_, i) => i !== idx))
  }

  const handleNoteContentChange = useCallback((val) => set('content', val), [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return

    if (category === 'expense') {
      const amt = Number(form.amount)
      if (!Number.isFinite(amt) || amt <= 0) {
        setAmountError(t('expense.error.invalidAmount'))
        return
      }
    }
    setAmountError('')

    const day = editCard?.day ?? defaultDay
    if (!form.startTime) return
    const newStart = tToMin(form.startTime)
    const newEnd = newStart + form.duration
    const overlap = (existingCards ?? []).find(c => {
      if (!c.startTime) return false
      if (c.day !== day) return false
      if (editCard && c.id === editCard.id) return false
      return tToMin(c.startTime) < newEnd && tToMin(c.startTime) + c.duration > newStart
    })
    if (overlap) {
      setOverlapError(t('addCard.overlap.error', { title: overlap.title, time: overlap.startTime }))
      return
    }

    setOverlapError('')
    onSubmit({ ...form, type: category, pendingNearby })
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* 標頭 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '5px 10px',
            color: 'var(--text-secondary)',
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <span style={{ fontSize: 21, display: 'flex', alignItems: 'center' }}>
          {cfg.IconComp ? <cfg.IconComp size={22} weight="regular" color={cfg.color} /> : cfg.icon}
        </span>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: cfg.color }}>
          {t(isEdit ? 'common.edit' : 'common.add')} {t('category.' + category)}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 名稱：非地點類別顯示文字輸入欄 */}
        {(!isPlaceCategory || isEdit) && (
          <Field label={t('addCard.field.nameTitle')}>
            <input
              className="game-input"
              type="text"
              placeholder={
                category === 'transport' ? t('addCard.placeholder.transport') :
                t('addCard.placeholder.note')
              }
              value={form.title}
              onChange={e => set('title', e.target.value)}
              required={!isPlaceCategory}
              autoFocus={!isPlaceCategory}
            />
          </Field>
        )}

        {/* 時間 + 時長 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field label={t('addCard.field.startTime')}>
              <input
                className="game-input"
                type="time"
                value={form.startTime}
                onChange={e => { set('startTime', e.target.value); setOverlapError('') }}
                style={{ width: '100%', minWidth: 0 }}
              />
            </Field>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field label={t('addCard.field.tripDuration')}>
              <select
                className="game-input"
                value={form.duration}
                onChange={e => { set('duration', Number(e.target.value)); setOverlapError('') }}
                style={{ width: '100%', minWidth: 0 }}
              >
                {DURATION_VALUES.map(v => (
                  <option key={v} value={v}>{getDurationLabel(v, t)}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        {overlapError && (
          <div style={{
            padding: '9px 13px', borderRadius: 10,
            background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.30)',
            fontSize: 12, fontWeight: 900, color: '#DC2626',
          }}>
            ⚠️ {overlapError}
          </div>
        )}

        {/* ── 交通專屬 ── */}
        {category === 'transport' && <>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label={t('addCard.field.from')}>
              <PlaceSearch
                value={form.from}
                onChange={v => set('from', v)}
                onSelect={p => set('from', p.name)}
                placeholder={t('addCard.placeholder.from')}
              />
            </Field>
            <Field label={t('addCard.field.to')}>
              <PlaceSearch
                value={form.to}
                onChange={v => set('to', v)}
                onSelect={p => set('to', p.name)}
                placeholder={t('addCard.placeholder.to')}
              />
            </Field>
          </div>
          <Field label={t('addCard.field.mode')}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TRANSPORT_MODES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => set('mode', m.id)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 10,
                    border: `1.5px solid ${form.mode === m.id ? '#0F766E' : 'rgba(165,125,65,0.25)'}`,
                    background: form.mode === m.id ? 'rgba(15,118,110,0.10)' : 'rgba(255,250,238,0.70)',
                    color: form.mode === m.id ? '#0F766E' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {m.IconComp
                    ? <m.IconComp size={14} weight="regular" />
                    : null} {t(m.labelKey)}
                </button>
              ))}
            </div>
          </Field>
        </>}

        {/* ── 景點 / 餐廳 / 住宿 專屬 ── */}
        {isPlaceCategory && (
          <Field label={t('addCard.place.search.' + category) ?? t('addCard.place.search.default')}>
            <PlaceSearch
              value={form.address}
              onChange={v => set('address', v)}
              onSelect={p => {
                set('title', p.name)
                set('address', p.address)
                set('lat', p.lat)
                set('lng', p.lng)
                set('placeId', p.placeId)
                set('weekdayText', p.weekdayText ?? null)
                set('rating', p.rating ?? null)
                set('photo', p.photo ?? null)
                setEditingTitle(false)
              }}
              placeholder={
                category === 'restaurant'    ? t('addCard.placeholder.restaurant') :
                category === 'accommodation' ? t('addCard.placeholder.accommodation') :
                t('addCard.placeholder.attraction')
              }
              autoFocus={isPlaceCategory && !isEdit}
            />
            {/* 名稱顯示 / 編輯（新增模式） */}
            {!isEdit && (
              <div style={{ marginTop: 7 }}>
                {form.title ? (
                  editingTitle ? (
                    <input
                      className="game-input"
                      value={form.title}
                      onChange={e => set('title', e.target.value)}
                      onBlur={() => setEditingTitle(false)}
                      autoFocus
                      style={{ padding: '9px 14px', fontSize: 14 }}
                    />
                  ) : (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 10,
                      background: 'rgba(165,125,65,0.08)', border: '1px solid rgba(165,125,65,0.22)',
                    }}>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 900, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {form.title}
                      </span>
                      <button type="button" onClick={() => setEditingTitle(true)} style={{
                        flexShrink: 0, padding: '3px 10px', borderRadius: 7,
                        fontSize: 11, fontWeight: 900, cursor: 'pointer',
                        background: 'rgba(165,125,65,0.12)', border: '1px solid rgba(165,125,65,0.30)',
                        color: 'var(--text-secondary)',
                      }}>
                        {t('addCard.editName')}
                      </button>
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
                    {t('addCard.autoFillHint')}
                  </div>
                )}
              </div>
            )}
          </Field>
        )}


        {/* ── 附近搜尋（景點 / 餐廳 / 住宿） ── */}
        {isPlaceCategory && !isEdit && form.lat && (
          <NearbySearchSection
            lat={form.lat}
            lng={form.lng}
            pendingNearby={pendingNearby}
            onAddNearby={(place, position) => setPendingNearby({ place, position })}
            onClearNearby={() => setPendingNearby(null)}
            defaultSearchType={
              category === 'restaurant' ? 'restaurant' :
              category === 'accommodation' ? 'lodging' : null
            }
            excludeType={CATEGORY_EXCLUDE_TYPE[category] ?? null}
          />
        )}

        {/* ── 開銷專屬欄位 ── */}
        {category === 'expense' && (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label={t('addCard.field.amount')}>
                <input
                  className="game-input"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  min="0"
                  step="any"
                  value={form.amount}
                  onChange={e => { set('amount', e.target.value); setAmountError('') }}
                  style={{ minWidth: 0 }}
                />
              </Field>
              <Field label={t('addCard.field.currency')}>
                <select
                  className="game-input"
                  value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                  style={{ minWidth: 0 }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            {amountError && (
              <div style={{ padding: '7px 11px', borderRadius: 9, background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.30)', fontSize: 12, fontWeight: 900, color: '#DC2626' }}>
                ⚠️ {amountError}
              </div>
            )}
            <Field label={t('addCard.field.expenseCategory')}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXPENSE_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => set('expenseCategory', cat.id)}
                    style={{
                      padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                      border: `1.5px solid ${form.expenseCategory === cat.id ? '#D97706' : 'rgba(165,125,65,0.25)'}`,
                      background: form.expenseCategory === cat.id ? 'rgba(217,119,6,0.10)' : 'rgba(255,250,238,0.70)',
                      color: form.expenseCategory === cat.id ? '#D97706' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: 800,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {cat.icon} {t(cat.labelKey)}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {/* ── 所有類別：附加圖片 ── */}
        <Field label={t('addCard.image.label')}>
          {form.images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 9 }}>
              {form.images.map((url, i) => (
                <div key={i} style={{ position: 'relative', width: 66, height: 66 }}>
                  <img src={url} alt="" style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    borderRadius: 10, border: '1.5px solid rgba(165,125,65,0.28)',
                    boxShadow: '0 2px 8px rgba(100,60,10,0.10)',
                  }} />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute', top: -5, right: -5,
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#DC2626', border: '2px solid #FAF6ED',
                      color: '#fff', fontSize: 9, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, lineHeight: 1,
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleImagePick}
          />
          <button
            type="button"
            onClick={() => !uploading && form.images.length < 6 && fileInputRef.current?.click()}
            disabled={uploading || form.images.length >= 6}
            style={{
              width: '100%', padding: '11px', borderRadius: 12,
              border: '1.5px dashed rgba(165,125,65,0.38)',
              background: 'rgba(255,250,238,0.60)',
              color: uploading || form.images.length >= 6 ? 'var(--text-muted)' : 'var(--accent)',
              fontSize: 12, fontWeight: 900,
              cursor: uploading || form.images.length >= 6 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {uploading
              ? t('addCard.image.compressing')
              : form.images.length >= 6
                ? t('addCard.image.limitReached')
                : t('addCard.image.select')}
          </button>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 5 }}>
            {t('addCard.image.limitNote', { imgLimit: IMAGE_LIMIT_MB, tripLimit: TRIP_LIMIT_MB })}
          </p>
        </Field>

        {/* ── 附件（PDF / 文字）── */}
        <Field label={t('addCard.attachment.label')}>
          {form.attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 9 }}>
              {form.attachments.map((att, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(165,125,65,0.08)', border: '1px solid rgba(165,125,65,0.22)',
                }}>
                  <span style={{ flexShrink: 0, color: 'var(--text-muted)', display: 'flex' }}>
                    {att.type === 'application/pdf' ? <FileText size={18} /> : <Pencil size={18} />}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 900, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}
                  </span>
                  <button type="button" onClick={() => window.open(att.url, '_blank')} style={{
                    flexShrink: 0, padding: '3px 9px', borderRadius: 7,
                    fontSize: 11, fontWeight: 900, cursor: 'pointer',
                    background: 'rgba(15,118,110,0.10)', border: '1px solid rgba(15,118,110,0.25)',
                    color: '#0F766E',
                  }}>{t('addCard.attachment.view')}</button>
                  <button type="button" onClick={() => removeAttachment(i)} style={{
                    flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                    background: '#DC2626', border: '2px solid #FAF6ED',
                    color: '#fff', fontSize: 9, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900,
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={attachmentInputRef}
            type="file"
            accept="application/pdf,text/plain,text/csv,text/markdown,.md"
            multiple
            style={{ display: 'none' }}
            onChange={handleAttachmentPick}
          />
          <button
            type="button"
            onClick={() => !uploadingAttachment && form.attachments.length < 5 && attachmentInputRef.current?.click()}
            disabled={uploadingAttachment || form.attachments.length >= 5}
            style={{
              width: '100%', padding: '11px', borderRadius: 12,
              border: '1.5px dashed rgba(165,125,65,0.38)',
              background: 'rgba(255,250,238,0.60)',
              color: uploadingAttachment || form.attachments.length >= 5 ? 'var(--text-muted)' : 'var(--accent)',
              fontSize: 12, fontWeight: 900,
              cursor: uploadingAttachment || form.attachments.length >= 5 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {uploadingAttachment
              ? t('addCard.image.uploading')
              : form.attachments.length >= 5
                ? t('addCard.attachment.limit')
                : t('addCard.attachment.select')}
          </button>
        </Field>

        {/* 上傳錯誤 */}
        {uploadError && (
          <div style={{ padding: '9px 13px', borderRadius: 10,
            background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.30)',
            fontSize: 12, fontWeight: 900, color: '#DC2626' }}>
            ⚠️ {uploadError}
          </div>
        )}

        {/* 提交 */}
        <button
          type="submit"
          className="btn-game btn-gold"
          style={{ width: '100%', fontSize: 15, padding: '15px', marginTop: 2 }}
        >
          <CircleCheck size={17} style={{ marginRight: 7 }} />
          {t(isEdit ? 'addCard.submit.edit' : 'addCard.submit.addTrip')}
        </button>
      </div>
    </form>
  )
}

// ── 主 Modal ────────────────────────────────
export default function AddCardModal({ defaultDay, defaultTime, onAdd, onEdit, onClose, editCard, tripId, existingCards = [] }) {
  const [category, setCategory] = useState(editCard?.type ?? null)
  const isEdit = !!editCard

  const handleSubmit = (formData) => {
    const { pendingNearby, ...mainData } = formData
    if (isEdit) {
      // Bug #12/H1：編輯時只回寫真正可編輯的欄位，避免覆蓋其他人並發修改的
      // attachedNotes/attachedTodos/attachedExpenses/images/attachments 以及地點快取欄位
      const {
        attachedNotes: _an, attachedTodos: _at, attachedExpenses: _ae,
        images: _img, storageUsedBytes: _sub,
        attachments: _att, weekdayText: _wt, photo: _ph, rating: _rt,
        id: _id, createdAt: _ct,
        ...editableFields
      } = mainData
      onEdit({ id: editCard.id, ...editableFields })
    } else {
      onAdd({ ...mainData, day: defaultDay, id: `card-${Date.now()}` }, pendingNearby ?? null)
    }
    onClose()
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 350,
        background: 'rgba(120,80,20,0.28)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="glass-card-glow modal-sheet"
        style={{ width: '100%', maxWidth: 480, padding: 'clamp(20px, 5vw, 32px) clamp(16px, 5vw, 28px)', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {!category
          ? <CategoryStep onSelect={setCategory} />
          : <DetailsStep
              category={category}
              defaultDay={defaultDay}
              defaultTime={defaultTime}
              editCard={isEdit ? editCard : null}
              tripId={tripId}
              existingCards={existingCards}
              onSubmit={handleSubmit}
              onBack={isEdit ? onClose : () => setCategory(null)}
            />
        }
      </div>
    </div>
  )
}
