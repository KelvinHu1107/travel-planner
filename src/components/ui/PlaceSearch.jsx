import { useState, useEffect, useRef, useCallback } from 'react'
import { loadGoogleMaps, getPlaceDetails } from '../../services/maps'

function Highlight({ text, matched = [] }) {
  if (!matched.length) return <>{text}</>
  let last = 0
  const parts = []
  ;[...matched].sort((a, b) => a.offset - b.offset).forEach(({ offset, length }, i) => {
    if (offset > last) parts.push(<span key={`n${i}`}>{text.slice(last, offset)}</span>)
    parts.push(<strong key={`m${i}`} style={{ color: 'var(--accent)' }}>{text.slice(offset, offset + length)}</strong>)
    last = offset + length
  })
  if (last < text.length) parts.push(<span key="tail">{text.slice(last)}</span>)
  return <>{parts}</>
}

function Stars({ rating }) {
  if (!rating) return null
  const full = Math.floor(rating), half = rating - full >= 0.5
  return (
    <span style={{ fontSize: 13, letterSpacing: 1, color: '#D97706' }}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
    </span>
  )
}

// ── 地點詳細確認面板 ─────────────────────────
function PlacePreview({ detail, onConfirm, onReset }) {
  const isClosedPermanently = detail?.businessStatus === 'CLOSED_PERMANENTLY'

  return (
    <div style={{
      marginTop: 10, borderRadius: 18, overflow: 'hidden',
      border: '1.5px solid rgba(165,125,65,0.30)',
      background: 'rgba(255, 252, 243, 0.98)',
      boxShadow: '0 8px 36px rgba(120,80,20,0.14)',
    }}>
      {/* 照片 */}
      {detail.photo ? (
        <div style={{ position: 'relative', height: 155, overflow: 'hidden' }}>
          <img src={detail.photo} alt={detail.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 40%, rgba(255,252,243,0.95) 100%)',
          }} />
          <div style={{ position: 'absolute', bottom: 10, left: 14, right: 14 }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)',
              lineHeight: 1.3, textShadow: '0 1px 6px rgba(255,252,243,0.9)' }}>
              {detail.name}
            </h3>
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px 16px 0' }}>
          <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)' }}>
            {detail.name}
          </h3>
        </div>
      )}

      <div style={{ padding: '12px 16px 16px' }}>
        {detail.rating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
            <Stars rating={detail.rating} />
            <span style={{ fontSize: 13, fontWeight: 900, color: '#D97706' }}>
              {detail.rating.toFixed(1)}
            </span>
            {detail.ratingsTotal && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                ({detail.ratingsTotal.toLocaleString()} 則評論)
              </span>
            )}
          </div>
        )}

        {detail.summary && (
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
            lineHeight: 1.6, marginBottom: 10 }}>
            {detail.summary}
          </p>
        )}

        <div style={{ display: 'flex', gap: 7, marginBottom: 9, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>📍</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {detail.address}
          </span>
        </div>

        {detail.todayHours && !isClosedPermanently && (
          <div style={{
            display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 9,
            padding: '9px 12px', borderRadius: 11,
            background: detail.isOpen === false ? 'rgba(220,38,38,0.07)' : 'rgba(15,118,110,0.07)',
            border: `1.5px solid ${detail.isOpen === false ? 'rgba(220,38,38,0.22)' : 'rgba(15,118,110,0.22)'}`,
          }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>🕐</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{
                  fontSize: 10, fontWeight: 900, padding: '1px 7px', borderRadius: 18,
                  background: detail.isOpen === false ? 'rgba(220,38,38,0.15)' : 'rgba(15,118,110,0.15)',
                  color: detail.isOpen === false ? '#DC2626' : '#0F766E',
                }}>
                  {detail.isOpen === null ? '時間未知' : detail.isOpen ? '營業中' : '已打烊'}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)' }}>
                {detail.todayHours.replace(/^[^:]+: ?/, '')}
              </span>
            </div>
          </div>
        )}

        {isClosedPermanently && (
          <div style={{
            padding: '7px 12px', borderRadius: 11, marginBottom: 9,
            background: 'rgba(220,38,38,0.07)', border: '1.5px solid rgba(220,38,38,0.22)',
            fontSize: 11, fontWeight: 900, color: '#DC2626',
          }}>
            ⚠️ 此地點已永久停業
          </div>
        )}

        {detail.phone && (
          <div style={{ display: 'flex', gap: 7, marginBottom: 9, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>📞</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)' }}>
              {detail.phone}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          <button type="button" onClick={onReset} style={{
            flex: 1, padding: '11px', borderRadius: 12,
            background: 'var(--bg-elevated)', border: '1.5px solid var(--border)',
            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 900, cursor: 'pointer',
          }}>
            🔍 重新搜尋
          </button>
          <button type="button" onClick={() => onConfirm(detail)} style={{
            flex: 2, padding: '11px', borderRadius: 12,
            background: 'linear-gradient(135deg,#D97706,#B45309)',
            border: 'none', boxShadow: '0 5px 0 #78350F',
            color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer',
          }}>
            ✅ 確認選擇這個地點
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主元件 ───────────────────────────────────
export default function PlaceSearch({
  value = '',
  onChange,
  onSelect,
  placeholder = '搜尋景點或地址…',
  disabled = false,
}) {
  const [query, setQuery]           = useState(value)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading]       = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [open, setOpen]             = useState(false)
  const [status, setStatus]         = useState('idle')
  const [activeIdx, setActiveIdx]   = useState(-1)
  const [preview, setPreview]       = useState(null)
  const autocompleteRef = useRef(null)
  const debounceRef     = useRef(null)

  useEffect(() => {
    loadGoogleMaps()
      .then(() => {
        autocompleteRef.current = new window.google.maps.places.AutocompleteService()
        setStatus('ready')
      })
      .catch(err => setStatus(err.message === 'NO_KEY' ? 'no_key' : 'error'))
  }, [])

  const search = useCallback((q) => {
    if (status !== 'ready' || q.trim().length < 2) { setSuggestions([]); return }
    setLoading(true)
    autocompleteRef.current.getPlacePredictions(
      { input: q, language: 'zh-TW' },
      (results, st) => {
        setLoading(false)
        setSuggestions(
          st === window.google.maps.places.PlacesServiceStatus.OK ? (results ?? []) : []
        )
      }
    )
  }, [status])

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q); onChange?.(q); setActiveIdx(-1); setPreview(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 320)
  }

  const handlePickSuggestion = async (pred) => {
    setSuggestions([]); setOpen(false)
    setQuery(pred.structured_formatting?.main_text ?? pred.description)
    setDetailLoading(true)
    try {
      const detail = await getPlaceDetails(pred.place_id)
      setPreview(detail)
    } catch {
      onSelect?.({ name: pred.description, address: pred.description })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleConfirm = (detail) => {
    onSelect?.(detail); setQuery(detail.name); onChange?.(detail.name); setPreview(null)
  }

  const handleReset = () => { setPreview(null); setQuery(''); onChange?.('') }

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handlePickSuggestion(suggestions[activeIdx]) }
    else if (e.key === 'Escape') { setSuggestions([]); setOpen(false) }
  }

  if (status === 'no_key') {
    return (
      <div>
        <input className="game-input" type="text" placeholder={placeholder}
          value={query} onChange={e => { setQuery(e.target.value); onChange?.(e.target.value) }} disabled={disabled} />
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 5 }}>
          💡 設定 VITE_GOOGLE_MAPS_API_KEY 可啟用智慧搜尋
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div>
        <input className="game-input" type="text" placeholder={placeholder}
          value={query} onChange={e => { setQuery(e.target.value); onChange?.(e.target.value) }} disabled={disabled} />
        <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', marginTop: 5 }}>
          ⚠️ Google 地圖載入失敗，請手動輸入地址
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          className="game-input"
          type="text"
          placeholder={status === 'ready' ? placeholder : '地圖載入中…'}
          value={query}
          onChange={handleChange}
          onFocus={() => !preview && setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setActiveIdx(-1) }, 160)}
          onKeyDown={handleKeyDown}
          disabled={disabled || status === 'error' || !!preview}
          autoComplete="off"
          style={{ paddingRight: 40 }}
        />
        <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
          fontSize: 15, pointerEvents: 'none', opacity: 0.5 }}>
          {loading || detailLoading ? '⏳' : preview ? '✅' : '🔍'}
        </span>
      </div>

      {/* 搜尋下拉 */}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 9999,
          borderRadius: 16, overflow: 'hidden',
          background: 'rgba(255, 252, 243, 0.98)',
          border: '1.5px solid rgba(165,125,65,0.28)',
          boxShadow: '0 12px 40px rgba(120,80,20,0.18)',
          backdropFilter: 'blur(20px)',
        }}>
          {suggestions.map((pred, i) => {
            const main = pred.structured_formatting?.main_text ?? pred.description
            const sub  = pred.structured_formatting?.secondary_text ?? ''
            const mainMatches = pred.structured_formatting?.main_text_matched_substrings ?? []
            const isActive = i === activeIdx
            return (
              <div key={pred.place_id}
                onMouseDown={() => handlePickSuggestion(pred)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  padding: '11px 16px', cursor: 'pointer',
                  borderBottom: i < suggestions.length - 1 ? '1px solid rgba(165,125,65,0.08)' : 'none',
                  background: isActive ? 'rgba(180,83,9,0.07)' : 'transparent',
                  transition: 'background 0.1s',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📍</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Highlight text={main} matched={mainMatches} />
                  </div>
                  {sub && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div style={{ padding: '6px 12px', textAlign: 'right' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(100,60,10,0.35)' }}>
              Powered by Google
            </span>
          </div>
        </div>
      )}

      {detailLoading && (
        <div style={{ marginTop: 9, padding: '14px', borderRadius: 14, textAlign: 'center',
          background: 'rgba(180,83,9,0.05)', border: '1.5px solid rgba(180,83,9,0.18)',
          color: 'var(--text-muted)', fontSize: 12, fontWeight: 800 }}>
          ⏳ 載入地點詳細資料中…
        </div>
      )}

      {preview && !detailLoading && (
        <PlacePreview detail={preview} onConfirm={handleConfirm} onReset={handleReset} />
      )}
    </div>
  )
}
