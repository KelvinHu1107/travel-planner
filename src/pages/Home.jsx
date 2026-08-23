import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { createTrip, joinTrip, getUserTrips, deleteTrip, leaveTrip } from '../services/firestore'
import { getTripDuration } from '../utils/dateUtils'

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 14,
      background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.25)', color: '#DC2626',
      fontSize: 13, fontWeight: 800 }}>
      ⚠️ {message}
    </div>
  )
}

// ── 旅遊計畫卡片 ─────────────────────────────
function TripCard({ trip, currentUser, onClick, onDelete, onLeave }) {
  const [hovered, setHovered]     = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const days    = getTripDuration(trip.startDate, trip.endDate)
  const isOwner = trip.ownerId === currentUser?.uid

  const stopAndMenu = (e) => { e.stopPropagation(); setMenuOpen(v => !v) }

  return (
    <div
      onClick={() => { if (!menuOpen && !confirmDel && !confirmLeave) onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false) }}
      style={{
        borderRadius: 22, overflow: 'hidden', cursor: 'pointer',
        border: '2px solid rgba(165,125,65,0.25)',
        boxShadow: hovered
          ? '0 10px 0 rgba(140,100,40,0.18), 0 16px 40px rgba(120,80,20,0.18), inset 0 1.5px 0 rgba(255,255,255,0.80)'
          : '0 4px 0 rgba(140,100,40,0.14), 0 6px 24px rgba(120,80,20,0.10), inset 0 1.5px 0 rgba(255,255,255,0.72)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.15s ease',
        background: 'rgba(255,252,243,0.96)',
        position: 'relative',
      }}
    >
      {/* 上方背景區 */}
      <div style={{ height: 110, position: 'relative', overflow: 'hidden',
        background: trip.backgroundImage
          ? undefined
          : 'linear-gradient(135deg, #E8A020 0%, #B45309 50%, #92400E 100%)' }}>
        {trip.backgroundImage && (
          <img src={trip.backgroundImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.40) 100%)' }} />
        <div style={{ position: 'absolute', top: 12, left: 14, fontSize: 28 }}>🗺️</div>

        {/* 擁有者或成員標籤 */}
        <div style={{ position: 'absolute', top: 10, right: 44, fontSize: 10, fontWeight: 900,
          background: isOwner ? 'rgba(180,83,9,0.80)' : 'rgba(91,33,182,0.75)',
          color: '#fff', borderRadius: 8, padding: '2px 8px', letterSpacing: '0.5px' }}>
          {isOwner ? '建立者' : '成員'}
        </div>

        {/* 更多選單按鈕 */}
        <button
          onClick={stopAndMenu}
          style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28,
            borderRadius: 9, background: 'rgba(0,0,0,0.35)', border: 'none',
            color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
          ⋯
        </button>

        {/* 下拉選單 */}
        {menuOpen && !confirmDel && !confirmLeave && (
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: 40, right: 8, zIndex: 50,
            background: 'rgba(255,252,243,0.98)',
            border: '1.5px solid rgba(165,125,65,0.30)',
            borderRadius: 14, boxShadow: '0 8px 24px rgba(80,40,5,0.22)',
            overflow: 'hidden', minWidth: 130,
          }}>
            {isOwner ? (
              <button onClick={(e) => { e.stopPropagation(); setConfirmDel(true); setMenuOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', width: '100%',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, fontWeight: 900, color: '#DC2626', textAlign: 'left' }}>
                🗑️ 刪除計畫
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setConfirmLeave(true); setMenuOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', width: '100%',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, fontWeight: 900, color: '#DC2626', textAlign: 'left' }}>
                🚪 離開計畫
              </button>
            )}
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 10, left: 14, right: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff',
            textShadow: '0 1px 6px rgba(0,0,0,0.5)', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {trip.name}
          </div>
        </div>
      </div>

      {/* 刪除確認 */}
      {confirmDel && (
        <div onClick={e => e.stopPropagation()}
          style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', margin: 0 }}>
            ⚠️ 確定要刪除「{trip.name}」？所有行程卡片將一併清除，無法復原。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmDel(false)}
              style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid rgba(165,125,65,0.25)',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              取消
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(trip.code) }}
              style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#EF4444,#B91C1C)', boxShadow: '0 3px 0 #7F1D1D',
                color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              確認刪除
            </button>
          </div>
        </div>
      )}

      {/* 離開確認 */}
      {confirmLeave && (
        <div onClick={e => e.stopPropagation()}
          style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', margin: 0 }}>
            確定要離開「{trip.name}」？若要重新加入需要邀請代碼和密碼。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmLeave(false)}
              style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid rgba(165,125,65,0.25)',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              取消
            </button>
            <button onClick={(e) => { e.stopPropagation(); onLeave(trip.code) }}
              style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#EF4444,#B91C1C)', boxShadow: '0 3px 0 #7F1D1D',
                color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              確認離開
            </button>
          </div>
        </div>
      )}

      {/* 下方資訊（刪除/離開確認時不顯示） */}
      {!confirmDel && !confirmLeave && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8 }}>
            {trip.startDate} – {trip.endDate}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)',
              background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.22)',
              padding: '3px 10px', borderRadius: 99 }}>
              🏖️ 共 {days} 天
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>
              👥 {(trip.members?.length ?? 0)} 人
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 建立計畫 Modal ────────────────────────────
function CreateModal({ uid, onClose, onCreated }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ tripName: '', startDate: '', endDate: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.startDate > form.endDate) { setError('返回日不能早於出發日'); return }
    if (form.password.length < 4) { setError('共用密碼至少需要 4 個字元'); return }
    setLoading(true)
    try {
      const code = await createTrip({
        name: form.tripName, startDate: form.startDate, endDate: form.endDate,
        password: form.password, uid,
      })
      onCreated?.()
      navigate(`/trip/${code}`)
    } catch (err) {
      setError(err.message || '建立失敗，請稍後再試')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(120,80,20,0.28)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <form className="glass-card-glow" style={{ width: '100%', maxWidth: 420, padding: '32px 28px' }}
        onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span style={{ fontSize: 26 }}>🗺️</span>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>建立新旅遊計畫</h2>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', width: 32, height: 32,
            borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ErrorBanner message={error} />
          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>計畫名稱</label>
            <input className="game-input" type="text" placeholder="例：日本關西 2026 ✈️"
              value={form.tripName} onChange={e => setForm({...form, tripName: e.target.value})} disabled={loading} required />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>出發日</label>
              <input className="game-input" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} disabled={loading} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>返回日</label>
              <input className="game-input" type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} disabled={loading} required />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>加入密碼</label>
            <div style={{ position: 'relative' }}>
              <input className="game-input" type={showPw ? 'text' : 'password'}
                placeholder="設定一組密碼（朋友加入時需要）"
                value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                disabled={loading} required style={{ paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
            <div style={{ marginTop: 7, padding: '9px 12px', borderRadius: 11,
              background: 'rgba(180,83,9,0.07)', border: '1px solid rgba(180,83,9,0.18)',
              fontSize: 11, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.6 }}>
              💡 朋友加入時需要同時輸入「計畫代碼」＋「這組密碼」。建立後請把兩者一起傳給對方。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-game btn-ghost" style={{ flex: 1, padding: '12px', fontSize: 14 }} disabled={loading}>取消</button>
            <button type="submit" className="btn-game btn-primary" style={{ flex: 2, padding: '12px', fontSize: 14 }} disabled={loading}>
              {loading ? '建立中…' : '🚀 出發！'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── 加入計畫 Modal ────────────────────────────
function JoinModal({ uid, onClose, onJoined, initialCode = '', initialPw = '' }) {
  const navigate = useNavigate()
  const [code, setCode]         = useState(initialCode.toUpperCase())
  const [password, setPassword] = useState(initialPw)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const trip = await joinTrip(code, password, uid)
      onJoined?.()
      navigate(`/trip/${trip.code}`)
    } catch (err) {
      setError(err.message || '加入失敗，請稍後再試')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(120,80,20,0.28)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <form className="glass-card-glow" style={{ width: '100%', maxWidth: 380, padding: '32px 28px' }}
        onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span style={{ fontSize: 26 }}>🔗</span>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>加入旅遊計畫</h2>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', width: 32, height: 32,
            borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ padding: '10px 13px', borderRadius: 12,
            background: 'rgba(15,118,110,0.07)', border: '1px solid rgba(15,118,110,0.22)',
            fontSize: 12, fontWeight: 800, color: '#0F766E', lineHeight: 1.6 }}>
            ℹ️ 請向計畫建立者索取「6 碼計畫代碼」和「加入密碼」，兩者都需要填入才能加入。
          </div>
          <ErrorBanner message={error} />
          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>計畫代碼（6 碼）</label>
            <input className="game-input" type="text" placeholder="例：KJ8F2A"
              value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6}
              style={{ letterSpacing: '5px', fontSize: 22, textAlign: 'center' }}
              disabled={loading} required />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>加入密碼</label>
            <input className="game-input" type="password" placeholder="向計畫建立者索取"
              value={password} onChange={e => setPassword(e.target.value)} disabled={loading} required />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-game btn-ghost" style={{ flex: 1, padding: '12px', fontSize: 14 }} disabled={loading}>取消</button>
            <button type="submit" className="btn-game btn-primary" style={{ flex: 2, padding: '12px', fontSize: 14 }} disabled={loading}>
              {loading ? '驗證中…' : '✨ 加入計畫'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────
export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, signOut } = useAuth()
  const [trips, setTrips]           = useState([])
  const [tripsLoading, setTripsLoading] = useState(true)
  const [modal, setModal]           = useState(null) // 'create' | 'join'
  const [joinParams, setJoinParams] = useState({ code: '', pw: '' })

  const loadTrips = async () => {
    if (!currentUser) return
    setTripsLoading(true)
    try {
      const allTrips = await getUserTrips(currentUser.uid)

      // 自動刪除「本人為擁有者且 30 天無人瀏覽」的旅遊計畫
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
      const now = Date.now()
      const stale = allTrips.filter(t => {
        if (!t.lastVisitedAt || t.ownerId !== currentUser.uid) return false
        const ms = t.lastVisitedAt?.toDate?.()?.getTime()
          ?? (t.lastVisitedAt?.seconds ? t.lastVisitedAt.seconds * 1000 : 0)
        return ms > 0 && now - ms > THIRTY_DAYS_MS
      })
      if (stale.length > 0) {
        await Promise.all(stale.map(t => deleteTrip(t.code, currentUser.uid).catch(() => {})))
        const staleCodes = new Set(stale.map(t => t.code))
        setTrips(allTrips.filter(t => !staleCodes.has(t.code)))
      } else {
        setTrips(allTrips)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setTripsLoading(false)
    }
  }

  useEffect(() => { loadTrips() }, [currentUser])

  // Bug #3：讀取 URL 參數，自動打開加入計畫 Modal
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const joinCode = params.get('join')
    const joinPw   = params.get('pw') ?? ''
    if (joinCode && currentUser) {
      setJoinParams({ code: joinCode, pw: joinPw })
      setModal('join')
      // 清除 URL 參數避免重複觸發
      window.history.replaceState({}, '', '/')
    }
  }, [location.search, currentUser])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  const handleDelete = async (tripCode) => {
    try {
      await deleteTrip(tripCode, currentUser?.uid)
      setTrips(ts => ts.filter(t => t.code !== tripCode))
    } catch (err) {
      console.error(err)
    }
  }

  const handleLeave = async (tripCode) => {
    try {
      await leaveTrip(tripCode, currentUser?.uid)
      setTrips(ts => ts.filter(t => t.code !== tripCode))
    } catch (err) {
      console.error(err)
    }
  }

  const avatar      = currentUser?.photoURL
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || '旅人'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', height: 66, flexShrink: 0,
        background: 'rgba(250,246,234,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '2px solid rgba(165,125,65,0.22)',
        boxShadow: '0 4px 24px rgba(120,80,20,0.08)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/favicon.svg" alt="TripCoworking" style={{ width: 36, height: 36, flexShrink: 0 }} />
          <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1 }}>
            Trip<span style={{ color: '#7C3AED' }}>Coworking</span>
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {avatar ? (
              <img src={avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%',
                border: '2px solid rgba(165,125,65,0.35)', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg,#D97706,#B45309)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: '#fff', fontWeight: 900 }}>
                {displayName[0].toUpperCase()}
              </div>
            )}
            <span className="home-topbar-name" style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-secondary)' }}>{displayName}</span>
          </div>
          <button onClick={handleSignOut} className="btn-game btn-ghost"
            style={{ padding: '8px 16px', fontSize: 13, minHeight: 44 }}>
            登出
          </button>
        </div>
      </div>

      {/* 內容 */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(20px, 5vw, 40px) clamp(16px, 4vw, 28px) 100px' }}>

        {/* 我的旅遊計畫 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 900, color: 'var(--text-primary)' }}>我的旅遊計畫</h2>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
              {tripsLoading ? '載入中…' : `共 ${trips.length} 個計畫`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setModal('join')} className="btn-game btn-ghost"
              style={{ padding: '10px 18px', fontSize: 13, minHeight: 44 }}>
              🔗 加入計畫
            </button>
            <button onClick={() => setModal('create')} className="btn-game btn-primary"
              style={{ padding: '10px 20px', fontSize: 13, minHeight: 44 }}>
              ＋ 建立新計畫
            </button>
          </div>
        </div>

        {/* 計畫 Grid */}
        {tripsLoading ? (
          <div className="trips-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 200, borderRadius: 22,
                background: 'rgba(165,125,65,0.08)', border: '2px solid rgba(165,125,65,0.14)',
                animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="glass-card" style={{ padding: '60px 40px', textAlign: 'center', borderRadius: 28 }}>
            <div style={{ fontSize: 64, marginBottom: 20 }}>🗺️</div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 10 }}>
              還沒有旅遊計畫
            </h3>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 28 }}>
              建立你的第一個計畫，或輸入代碼加入朋友的旅程
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setModal('create')} className="btn-game btn-primary"
                style={{ padding: '14px 28px', fontSize: 15 }}>
                ＋ 建立新旅遊計畫
              </button>
              <button onClick={() => setModal('join')} className="btn-game btn-ghost"
                style={{ padding: '14px 28px', fontSize: 15 }}>
                🔗 加入現有計畫
              </button>
            </div>
          </div>
        ) : (
          <div className="trips-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
            {trips.map(trip => (
              <TripCard
                key={trip.code}
                trip={trip}
                currentUser={currentUser}
                onClick={() => navigate(`/trip/${trip.code}`)}
                onDelete={handleDelete}
                onLeave={handleLeave}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'create' && (
        <CreateModal uid={currentUser?.uid} onClose={() => setModal(null)} onCreated={loadTrips} />
      )}
      {modal === 'join' && (
        <JoinModal
          uid={currentUser?.uid}
          onClose={() => { setModal(null); setJoinParams({ code: '', pw: '' }) }}
          onJoined={loadTrips}
          initialCode={joinParams.code}
          initialPw={joinParams.pw}
        />
      )}
    </div>
  )
}
