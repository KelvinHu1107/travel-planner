import { useState, useRef, useCallback } from 'react'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../services/firebase'
import { addStorageUsedBytes, getStorageUsedMB } from '../../services/firestore'
import { compressImage, IMAGE_LIMIT_MB, TRIP_LIMIT_MB } from '../../utils/imageUtils'
import { CATEGORY } from '../cards/CardItem'
import PlaceSearch from '../ui/PlaceSearch'
import FormatToolbar from '../ui/FormatToolbar'
import { loadGoogleMaps, nearbySearch } from '../../services/maps'
import { ArrowLeft, X, CircleCheck, Plus } from 'lucide-react'

const TRANSPORT_MODES = [
  { id: 'flight',  icon: '✈️', label: '飛機' },
  { id: 'transit', icon: '🚇', label: '大眾運輸' },
  { id: 'car',     icon: '🚗', label: '自駕/計程車' },
  { id: 'walk',    icon: '🚶', label: '步行' },
  { id: 'boat',    icon: '⛴️', label: '船' },
]

const CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'KRW', 'HKD', 'SGD', 'AUD']

const EXPENSE_CATEGORIES = [
  { id: 'food',          icon: '🍜', label: '餐飲' },
  { id: 'transport',     icon: '🚌', label: '交通' },
  { id: 'accommodation', icon: '🏨', label: '住宿' },
  { id: 'shopping',      icon: '🛍️', label: '購物' },
  { id: 'ticket',        icon: '🎟️', label: '門票' },
  { id: 'other',         icon: '💼', label: '其他' },
]

const DURATIONS = [
  { value: 30,   label: '30 分鐘' },
  { value: 60,   label: '1 小時' },
  { value: 90,   label: '1.5 小時' },
  { value: 120,  label: '2 小時' },
  { value: 180,  label: '3 小時' },
  { value: 240,  label: '4 小時' },
  { value: 360,  label: '6 小時' },
  { value: 480,  label: '8 小時' },
  { value: 600,  label: '10 小時' },
  { value: 720,  label: '12 小時' },
  { value: 960,  label: '16 小時' },
  { value: 1440, label: '24 小時' },
]

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

const CATEGORY_QUICK_LABEL = {
  note: '新增筆記',
  expense: '新增消費紀錄',
}

// ── 步驟一：選類別 ──────────────────────────
function CategoryStep({ onSelect }) {
  return (
    <div>
      <h2 style={{ fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>
        新增什麼？
      </h2>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 24 }}>
        選擇一個類別開始
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
            <span style={{ fontSize: 30 }}>{cfg.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: cfg.color }}>
              {CATEGORY_QUICK_LABEL[key] ?? cfg.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 附近搜尋區段 ─────────────────────────────
const NEARBY_TYPES = [
  { id: 'restaurant',         label: '餐廳',   icon: '🍜' },
  { id: 'tourist_attraction', label: '景點',   icon: '🏛️' },
  { id: 'parking',            label: '停車場', icon: '🅿️' },
]

function NearbySearchSection({ lat, lng, pendingNearby, onAddNearby, onClearNearby }) {
  const [activeType, setActiveType] = useState(null)
  const [results, setResults]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [searchErr, setSearchErr]   = useState('')

  const handleSearch = async (typeId) => {
    if (activeType === typeId) { setActiveType(null); setResults([]); return }
    setActiveType(typeId); setResults([]); setLoading(true); setSearchErr('')
    try {
      await loadGoogleMaps()
      const places = await nearbySearch(lat, lng, typeId)
      setResults(places)
    } catch (e) {
      setSearchErr('搜尋失敗：' + e.message)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ borderRadius: 14, border: '1.5px solid rgba(15,118,110,0.28)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'rgba(15,118,110,0.06)', borderBottom: '1px solid rgba(15,118,110,0.15)' }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: '#0F766E', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 9 }}>
          🔍 搜尋附近
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {NEARBY_TYPES.map(t => (
            <button key={t.id} type="button" onClick={() => handleSearch(t.id)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 11, fontWeight: 900,
              border: `1.5px solid ${activeType === t.id ? '#0F766E' : 'rgba(15,118,110,0.22)'}`,
              background: activeType === t.id ? 'rgba(15,118,110,0.14)' : 'rgba(255,252,244,0.70)',
              color: activeType === t.id ? '#0F766E' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ padding: '14px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
          搜尋中…
        </div>
      )}
      {searchErr && (
        <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#DC2626' }}>
          ⚠️ {searchErr}
        </div>
      )}
      {results.length > 0 && !loading && (
        <div style={{ maxHeight: 210, overflowY: 'auto' }}>
          {results.map(place => (
            <div key={place.placeId} style={{
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid rgba(165,125,65,0.10)',
              background: pendingNearby?.place.placeId === place.placeId ? 'rgba(15,118,110,0.06)' : 'transparent',
            }}>
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
              </div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                {['before', 'after'].map(pos => {
                  const isActive = pendingNearby?.place.placeId === place.placeId && pendingNearby?.position === pos
                  return (
                    <button key={pos} type="button"
                      onClick={() => isActive ? onClearNearby() : onAddNearby(place, pos)}
                      style={{
                        padding: '4px 8px', borderRadius: 7, fontSize: 10, fontWeight: 900, cursor: 'pointer',
                        background: isActive ? 'rgba(15,118,110,0.18)' : 'rgba(165,125,65,0.10)',
                        border: `1.5px solid ${isActive ? '#0F766E' : 'rgba(165,125,65,0.25)'}`,
                        color: isActive ? '#0F766E' : 'var(--text-secondary)',
                      }}>
                      {pos === 'before' ? '↑ 前' : '↓ 後'}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {results.length === 0 && !loading && activeType && !searchErr && (
        <div style={{ padding: '12px 14px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
          附近沒有找到相關地點
        </div>
      )}
      {pendingNearby && (
        <div style={{
          padding: '9px 14px', background: 'rgba(15,118,110,0.08)',
          borderTop: '1px solid rgba(15,118,110,0.18)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#0F766E', flex: 1 }}>
            ✅ 將在{pendingNearby.position === 'before' ? '之前' : '之後'}新增「{pendingNearby.place.name}」
          </span>
          <button type="button" onClick={onClearNearby} style={{
            padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 900,
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)',
            color: '#DC2626', cursor: 'pointer',
          }}>取消</button>
        </div>
      )}
    </div>
  )
}

// ── 步驟二：填詳細資料 ──────────────────────
function DetailsStep({ category, defaultDay, defaultTime, editCard, tripId, onSubmit, onBack }) {
  const cfg = CATEGORY[category]
  const isEdit = !!editCard
  const [uploading, setUploading]           = useState(false)
  const [pendingNearby, setPendingNearby]   = useState(null)
  const fileInputRef  = useRef(null)
  const noteTextareaRef = useRef(null)

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
        alert(`已超過旅遊計畫儲存上限 ${TRIP_LIMIT_MB}MB（目前使用 ${usedMB.toFixed(1)}MB）`)
        return
      }

      const urls = await Promise.all(compressed.map(async file => {
        const path = `trips/${tripId}/images/${Date.now()}_${file.name}`
        const fRef = storageRef(storage, path)
        await uploadBytes(fRef, file)
        return getDownloadURL(fRef)
      }))

      const totalBytes = compressed.reduce((s, f) => s + f.size, 0)
      await addStorageUsedBytes(tripId, totalBytes)
      set('images', [...form.images, ...urls])
    } catch (err) {
      alert('上傳失敗：' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeImage = (idx) => set('images', form.images.filter((_, i) => i !== idx))

  const handleNoteContentChange = useCallback((val) => set('content', val), [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
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
          {cfg.IconComp ? <cfg.IconComp size={22} weight="fill" color={cfg.color} /> : cfg.icon}
        </span>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: cfg.color }}>
          {isEdit ? '編輯' : '新增'}{cfg.label}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 名稱 */}
        <Field label="名稱 / 標題">
          <input
            className="game-input"
            type="text"
            placeholder={
              category === 'attraction' ? '例：嵐山竹林' :
              category === 'transport'  ? '例：機場快線' :
              category === 'expense'    ? '例：午餐' : '例：行前備忘'
            }
            value={form.title}
            onChange={e => set('title', e.target.value)}
            required
            autoFocus
          />
        </Field>

        {/* 時間 + 時長 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="開始時間">
            <input
              className="game-input"
              type="time"
              value={form.startTime}
              onChange={e => set('startTime', e.target.value)}
              style={{ minWidth: 0 }}
            />
          </Field>
          <Field label="時長">
            <select
              className="game-input"
              value={form.duration}
              onChange={e => set('duration', Number(e.target.value))}
              style={{ minWidth: 0 }}
            >
              {DURATIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* ── 交通專屬 ── */}
        {category === 'transport' && <>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="出發地">
              <PlaceSearch
                value={form.from}
                onChange={v => set('from', v)}
                onSelect={p => set('from', p.name)}
                placeholder="出發地點…"
              />
            </Field>
            <Field label="目的地">
              <PlaceSearch
                value={form.to}
                onChange={v => set('to', v)}
                onSelect={p => set('to', p.name)}
                placeholder="目的地點…"
              />
            </Field>
          </div>
          <Field label="交通方式">
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
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </Field>
        </>}

        {/* ── 景點專屬 ── */}
        {category === 'attraction' && (
          <Field label="搜尋景點 / 地址">
            <div style={{ position: 'relative' }}>
              <PlaceSearch
                value={form.address}
                onChange={v => set('address', v)}
                onSelect={p => {
                  if (!form.title.trim()) set('title', p.name)
                  set('address', p.address)
                  set('lat', p.lat)
                  set('lng', p.lng)
                  set('placeId', p.placeId)
                  set('weekdayText', p.weekdayText ?? null)
                  set('rating', p.rating ?? null)
                  set('photo', p.photo ?? null)
                }}
                placeholder="例：嵐山竹林、故宮博物院…"
              />
            </div>
            {form.lat && (
              <div style={{
                marginTop: 7, display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 11px', borderRadius: 9,
                background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.25)',
              }}>
                <span style={{ fontSize: 13 }}>✅</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#0F766E' }}>
                  已取得精確座標，導航功能可用
                </span>
              </div>
            )}
          </Field>
        )}

        {/* ── 開銷專屬 ── */}
        {category === 'expense' && (<>
          <Field label="類別">
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {EXPENSE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => set('expenseCategory', cat.id)}
                  style={{
                    padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 800,
                    border: `1.5px solid ${form.expenseCategory === cat.id ? '#92400E' : 'rgba(165,125,65,0.25)'}`,
                    background: form.expenseCategory === cat.id ? 'rgba(146,64,14,0.12)' : 'rgba(255,250,238,0.70)',
                    color: form.expenseCategory === cat.id ? '#92400E' : 'var(--text-secondary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="金額">
              <input
                className="game-input"
                type="number"
                placeholder="0"
                min="0"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
              />
            </Field>
            <Field label="幣別">
              <select
                className="game-input"
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="備注（選填）">
            <input
              className="game-input"
              type="text"
              placeholder="例：已含服務費、刷卡優惠…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </Field>
        </>)}

        {/* ── 筆記專屬：內容 ── */}
        {category === 'note' && (
          <Field label="筆記內容">
            <div style={{ borderRadius: 14, border: '1.5px solid rgba(165,125,65,0.28)', overflow: 'hidden' }}>
              <FormatToolbar
                textareaRef={noteTextareaRef}
                content={form.content}
                onChange={handleNoteContentChange}
              />
              <textarea
                ref={noteTextareaRef}
                className="game-input"
                placeholder="記下任何想法、提醒或備注…"
                value={form.content}
                onChange={e => set('content', e.target.value)}
                rows={5}
                style={{ resize: 'vertical', lineHeight: 1.6, borderRadius: '0 0 12px 12px', border: 'none' }}
              />
            </div>
          </Field>
        )}

        {/* ── 景點附近搜尋 ── */}
        {category === 'attraction' && !isEdit && form.lat && (
          <NearbySearchSection
            lat={form.lat}
            lng={form.lng}
            pendingNearby={pendingNearby}
            onAddNearby={(place, position) => setPendingNearby({ place, position })}
            onClearNearby={() => setPendingNearby(null)}
          />
        )}

        {/* ── 所有類別：附加圖片 ── */}
        <Field label={`附加圖片（選填，最多 6 張）`}>
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
            {uploading ? '⏳ 壓縮上傳中…' : form.images.length >= 6 ? '已達上限 6 張' : '🖼️ 選擇圖片'}
          </button>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 5 }}>
            自動壓縮，單張限 {IMAGE_LIMIT_MB}MB，旅遊計畫總上限 {TRIP_LIMIT_MB}MB
          </p>
        </Field>

        {/* 提交 */}
        <button
          type="submit"
          className="btn-game btn-gold"
          style={{ width: '100%', fontSize: 15, padding: '15px', marginTop: 2 }}
        >
          <CircleCheck size={17} style={{ marginRight: 7 }} />
          {isEdit
            ? '儲存修改'
            : category === 'note'
            ? '新增筆記'
            : category === 'expense'
            ? '新增消費紀錄'
            : '加入行程'}
        </button>
      </div>
    </form>
  )
}

// ── 主 Modal ────────────────────────────────
export default function AddCardModal({ defaultDay, defaultTime, onAdd, onEdit, onClose, editCard, tripId }) {
  const [category, setCategory] = useState(editCard?.type ?? null)
  const isEdit = !!editCard

  const handleSubmit = (formData) => {
    const { pendingNearby, ...mainData } = formData
    if (isEdit) {
      onEdit({ ...editCard, ...mainData })
    } else {
      onAdd({ ...mainData, day: defaultDay, id: `card-${Date.now()}` }, pendingNearby ?? null)
    }
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 350,
        background: 'rgba(120,80,20,0.28)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="glass-card-glow"
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
              onSubmit={handleSubmit}
              onBack={isEdit ? onClose : () => setCategory(null)}
            />
        }
      </div>
    </div>
  )
}
