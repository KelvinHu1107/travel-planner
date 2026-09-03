import { useState, useEffect, useCallback } from 'react'
import { Map, Link, AlertTriangle, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useViewMode } from '../contexts/ViewModeContext'
import { createTrip, joinTrip, getUserTrips, deleteTrip, leaveTrip, addCard, cleanupDemoTrips } from '../services/firestore'
import { getTripDuration, getLocalDateStr } from '../utils/dateUtils'
import { useTutorial } from '../tutorial/TutorialContext'
import { useLanguage } from '../i18n/LanguageContext'

// 判斷 trip 是否超過 30 天未瀏覽（Bug #13）
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
function isStaleTrip(t, currentUid) {
  if (!t.lastVisitedAt || t.ownerId !== currentUid) return false
  const ms = t.lastVisitedAt?.toDate?.()?.getTime()
    ?? (t.lastVisitedAt?.seconds ? t.lastVisitedAt.seconds * 1000 : 0)
  return ms > 0 && Date.now() - ms > THIRTY_DAYS_MS
}

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
function TripCard({ trip, currentUser, onClick, onDelete, onLeave, isMobileMode = false, tutorialId }) {
  const { t } = useLanguage()
  const [hovered, setHovered]     = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const days    = getTripDuration(trip.startDate, trip.endDate)
  const isOwner = trip.ownerId === currentUser?.uid

  const stopAndMenu = (e) => { e.stopPropagation(); setMenuOpen(v => !v) }

  return (
    <div
      data-tutorial-id={tutorialId}
      onClick={() => { if (menuOpen) { setMenuOpen(false); return } if (!confirmDel && !confirmLeave) onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        // Bug #38：延遲關閉選單，避免游標移出後選單瞬間消失無法點擊
        setTimeout(() => setMenuOpen(false), 150)
      }}
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
        <div style={{ position: 'absolute', top: 12, left: 14, display: 'flex', alignItems: 'center' }}><Map size={28} color="rgba(255,255,255,0.85)" /></div>

        {/* 擁有者或成員標籤 */}
        <div style={{ position: 'absolute', top: 10, right: 44, fontSize: 10, fontWeight: 900,
          background: isOwner ? 'rgba(180,83,9,0.80)' : 'rgba(91,33,182,0.75)',
          color: '#fff', borderRadius: 8, padding: '2px 8px', letterSpacing: '0.5px' }}>
          {isOwner ? t('common.owner') : t('common.member')}
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
                {t('home.card.delete')}
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setConfirmLeave(true); setMenuOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', width: '100%',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, fontWeight: 900, color: '#DC2626', textAlign: 'left' }}>
                {t('home.card.leave')}
              </button>
            )}
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 10, left: 14, right: 14 }}>
          <div title={trip.name} style={{ fontSize: 16, fontWeight: 900, color: '#fff',
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
            {t('home.card.confirmDelete', { name: trip.name })}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmDel(false)}
              style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid rgba(165,125,65,0.25)',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(trip.code) }}
              style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#EF4444,#B91C1C)', boxShadow: '0 3px 0 #7F1D1D',
                color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              {t('common.confirm.delete')}
            </button>
          </div>
        </div>
      )}

      {/* 離開確認 */}
      {confirmLeave && (
        <div onClick={e => e.stopPropagation()}
          style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', margin: 0 }}>
            {t('home.card.confirmLeave', { name: trip.name })}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmLeave(false)}
              style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid rgba(165,125,65,0.25)',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onLeave(trip.code) }}
              style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#EF4444,#B91C1C)', boxShadow: '0 3px 0 #7F1D1D',
                color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              {t('common.confirm.leave')}
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
              {t('home.tripDays', { days })}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>
              {t('home.tripMembers', { count: trip.members?.length ?? 0 })}
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
  const { t } = useLanguage()
  const [form, setForm] = useState({ tripName: '', startDate: '', endDate: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.startDate > form.endDate) { setError(t('create.error.dateOrder')); return }
    // Bug #24：日期範圍最多 60 天（Bug #15：使用 Math.round 避免 DST 導致 off-by-one）
    const days = Math.round((new Date(form.endDate) - new Date(form.startDate)) / (24 * 60 * 60 * 1000)) + 1
    if (days > 60) { setError(t('settings.dateRangeMax')); return }
    // Bug #29：trip name 長度限制
    if (form.tripName.trim().length > 50) { setError(t('create.error.nameTooLong')); return }
    setLoading(true)
    try {
      const code = await createTrip({
        name: form.tripName.trim(), startDate: form.startDate, endDate: form.endDate, uid,
      })
      // 自動新增範例卡片，幫助新使用者了解各類型功能
      try {
        const d = form.startDate
        await Promise.all([
          addCard(code, { type: 'attraction', title: '[範例] 地標廣場', day: d, startTime: '09:00', duration: 90, address: '台北 101，信義路五段 7 號', lat: 25.0339, lng: 121.5645 }),
          addCard(code, { type: 'restaurant', title: '[範例] 當地特色餐廳', day: d, startTime: '12:00', duration: 60, address: '饒河街夜市，松山區', lat: 25.0507, lng: 121.5776 }),
          addCard(code, { type: 'accommodation', title: '[範例] 旅館/民宿', day: d, startTime: '15:00', duration: 60, address: '住宿類型可以記錄入住地點和 Check-in 時間。', lat: null, lng: null }),
          addCard(code, { type: 'transport', title: '[範例] 機場快線', day: d, startTime: '07:00', duration: 60, from: '出發地', to: '目的地' }),
          addCard(code, { type: 'note', title: '[範例] 旅行筆記', day: d, startTime: '20:00', duration: 30, content: '筆記類型可以記錄任何想法、提醒事項或旅行心得！點擊卡片可進入完整筆記頁面編輯。' }),
        ])
      } catch (err) { console.warn('[seed cards]', err) }
      onCreated?.()
      navigate(`/trip/${code}`)
    } catch (err) {
      setError(err.message || t('create.error.failed'))
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(120,80,20,0.28)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <form className="glass-card-glow" style={{ width: '100%', maxWidth: 420, padding: '32px 28px', boxSizing: 'border-box', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <Map size={26} color="var(--text-muted)" />
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>{t('create.title')}</h2>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', width: 32, height: 32,
            borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ErrorBanner message={error} />
          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>{t('create.label.name')}</label>
            <input className="game-input" type="text" placeholder={t('create.placeholder.name')}
              maxLength={50}
              value={form.tripName} onChange={e => setForm({...form, tripName: e.target.value})} disabled={loading} required />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>{t('create.label.start')}</label>
              <input className="game-input" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} disabled={loading} required style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0, fontSize: 13, padding: '10px 12px' }} />
            </div>
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>{t('create.label.end')}</label>
              <input className="game-input" type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} disabled={loading} required style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0, fontSize: 13, padding: '10px 12px' }} />
            </div>
          </div>
          <div style={{ padding: '9px 12px', borderRadius: 11,
            background: 'rgba(180,83,9,0.07)', border: '1px solid rgba(180,83,9,0.18)',
            fontSize: 11, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.6 }}>
            {t('create.tip')}
          </div>
          <div style={{ display: 'flex', gap: 12, maxWidth: 340, margin: '0 auto', marginTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-game btn-ghost" style={{ flex: 1, padding: '13px 20px', fontSize: 14 }} disabled={loading}>{t('common.cancel')}</button>
            <button type="submit" className="btn-game btn-primary" style={{ flex: 1, padding: '13px 20px', fontSize: 14, whiteSpace: 'nowrap' }} disabled={loading}>
              {loading ? t('create.submitting') : t('create.submit')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── 加入計畫 Modal ────────────────────────────
function JoinModal({ uid, actor, onClose, onJoined, initialCode = '' }) {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const hasAutoCode = !!initialCode
  const [code, setCode]   = useState(initialCode.toUpperCase())
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const trip = await joinTrip(code, uid, actor)
      onJoined?.()
      navigate(`/trip/${trip.code}`)
    } catch (err) {
      const msg = err.message === 'TRIP_NOT_FOUND'
        ? t('error.tripNotFound')
        : t('error.joinFailed')
      setError(msg)
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
          <Link size={26} color="var(--text-muted)" />
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>{t('join.title')}</h2>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', width: 32, height: 32,
            borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {hasAutoCode ? (
            <div style={{ padding: '12px 14px', borderRadius: 14,
              background: 'rgba(15,118,110,0.07)', border: '1px solid rgba(15,118,110,0.22)',
              display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#0F766E', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('join.autoCode.label')}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-bright)', letterSpacing: '8px', fontFamily: 'monospace' }}>
                {code}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0F766E' }}>{t('join.autoCode.hint')}</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 13px', borderRadius: 12,
                background: 'rgba(15,118,110,0.07)', border: '1px solid rgba(15,118,110,0.22)',
                fontSize: 12, fontWeight: 800, color: '#0F766E', lineHeight: 1.6 }}>
                {t('join.tip')}
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>{t('join.label.code')}</label>
                <input className="game-input" type="text" placeholder={t('join.placeholder.code')}
                  value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6}
                  style={{ letterSpacing: '5px', fontSize: 22, textAlign: 'center' }}
                  disabled={loading} required autoFocus />
              </div>
            </>
          )}

          <ErrorBanner message={error} />

          <div style={{ display: 'flex', gap: 12, maxWidth: 280, margin: '0 auto', marginTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-game btn-ghost" style={{ flex: 1, padding: '12px 20px', fontSize: 14 }} disabled={loading}>{t('common.cancel')}</button>
            <button type="submit" className="btn-game btn-primary" style={{ flex: 1, padding: '12px 20px', fontSize: 14 }} disabled={loading}>
              {loading ? t('join.submitting') : t('join.submit')}
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
  const { currentUser, signOut, redirectError } = useAuth()
  const [trips, setTrips]           = useState([])
  const [tripsLoading, setTripsLoading] = useState(true)
  const [modal, setModal]           = useState(null) // 'create' | 'join'
  const [joinParams, setJoinParams] = useState({ code: '' })

  const loadTrips = async () => {
    if (!currentUser) return
    setTripsLoading(true)
    try {
      const allTrips = await getUserTrips(currentUser.uid)
      // Bug #13：不再自動刪除，只列出並讓使用者手動選擇是否刪除
      setTrips(allTrips)
    } catch (err) {
      console.error(err)
    } finally {
      setTripsLoading(false)
    }
  }

  // Bug #40：改用 onSnapshot 即時訂閱使用者所在的 trips
  // 讓其他分頁 / 其他成員動作可以即時反映（例如朋友加入你創的 trip、你在另一個分頁刪除 trip 等）
  useEffect(() => {
    if (!currentUser?.uid) {
      setTrips([])
      setTripsLoading(false)
      return
    }
    setTripsLoading(true)
    const q = query(collection(db, 'trips'), where('members', 'array-contains', currentUser.uid))
    const unsub = onSnapshot(q, (snap) => {
      setTrips(snap.docs.map(d => ({ code: d.id, ...d.data() })))
      setTripsLoading(false)
    }, (err) => {
      console.error(err)
      setTripsLoading(false)
    })
    return () => unsub()
  }, [currentUser?.uid])

  // Bug #3：讀取 URL 參數，自動打開加入計畫 Modal
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const joinCode = params.get('join')
    if (joinCode && currentUser) {
      setJoinParams({ code: joinCode })
      setModal('join')
      // 清除 URL 參數避免重複觸發
      window.history.replaceState({}, '', '/')
    }
  }, [location.search, currentUser])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  const { t } = useLanguage()
  const [actionError, setActionError] = useState('')

  const handleDelete = async (tripCode) => {
    setActionError('')
    try {
      const actor = {
        uid: currentUser?.uid,
        displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
      }
      await deleteTrip(tripCode, currentUser?.uid, actor)
      setTrips(ts => ts.filter(t => t.code !== tripCode))
    } catch (err) {
      console.error(err)
      // Bug #37：把 trip 名稱帶進錯誤訊息
      const tripName = trips.find(x => x.code === tripCode)?.name || tripCode
      setActionError(`${t('home.error.delete')}（${tripName}）`)
      setTimeout(() => setActionError(''), 4000)
    }
  }

  const handleLeave = async (tripCode) => {
    setActionError('')
    try {
      await leaveTrip(tripCode, currentUser?.uid, {
        uid: currentUser?.uid,
        displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
      })
      setTrips(ts => ts.filter(t => t.code !== tripCode))
    } catch (err) {
      console.error(err)
      setActionError(t('home.error.leave'))
      setTimeout(() => setActionError(''), 4000)
    }
  }

  const { isMobileMode, toggleMode } = useViewMode()
  const avatar      = currentUser?.photoURL
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || t('common.traveler')
  const { tutorialCompleted, tutorialActive, startTutorial, demoTripData } = useTutorial()

  // 登入後清除本帳號遺留的教學計畫（非教學進行中時）
  useEffect(() => {
    if (currentUser && !tutorialActive) {
      cleanupDemoTrips(currentUser.uid).catch(() => {})
    }
  }, [currentUser?.uid, tutorialActive])

  const BANNER_KEY = currentUser ? `tutorial_banner_hidden_${currentUser.uid}` : null
  const [bannerHidden, setBannerHidden] = useState(() =>
    BANNER_KEY ? localStorage.getItem(BANNER_KEY) === 'true' : false
  )

  // Compute the trip list to display:
  // - Filter out any isDemoTrip trips from the fetched list
  // - When tutorial is active and demo trip is ready, prepend it first
  const regularTrips = trips.filter(t => !t.isDemoTrip)
  const displayTrips = (tutorialActive && demoTripData)
    ? [demoTripData, ...regularTrips]
    : regularTrips

  const showTutorialBanner = !tutorialCompleted && !tutorialActive && !tripsLoading && regularTrips.length === 0 && !bannerHidden

  // Bug #13：超過 30 天未瀏覽的自有計畫，改為警告清單讓使用者決定是否刪除
  const staleTrips = regularTrips.filter(t => isStaleTrip(t, currentUser?.uid))
  // Bug #14 + #24 + M9：dismiss key 需等 currentUser.uid 就緒才決定；改用 localStorage（跨分頁共享）加當地日期做每日重置
  const STALE_DISMISS_KEY = currentUser?.uid
    ? `stale_warning_dismissed_${currentUser.uid}_${getLocalDateStr()}`
    : null
  const [staleWarningDismissed, setStaleWarningDismissed] = useState(false)
  useEffect(() => {
    if (!STALE_DISMISS_KEY) { setStaleWarningDismissed(false); return }
    setStaleWarningDismissed(localStorage.getItem(STALE_DISMISS_KEY) === 'true')
  }, [STALE_DISMISS_KEY])
  const showStaleWarning = !tripsLoading && staleTrips.length > 0 && !staleWarningDismissed

  const ModeToggleBtn = () => (
    <button onClick={toggleMode} style={{
      padding: '6px 10px', borderRadius: 10,
      border: '1.5px solid rgba(165,125,65,0.28)',
      background: 'var(--bg-elevated)',
      color: 'var(--text-muted)', fontSize: 11, fontWeight: 900,
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
    }}>
      {isMobileMode ? t('home.mobileToggle.toPC') : t('home.mobileToggle.toMobile')}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', paddingBottom: isMobileMode ? 80 : 0 }}>
      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobileMode ? '0 16px' : '0 28px',
        height: isMobileMode ? 56 : 66, flexShrink: 0,
        background: 'rgba(250,246,234,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '2px solid rgba(165,125,65,0.22)',
        boxShadow: '0 4px 24px rgba(120,80,20,0.08)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobileMode ? 7 : 10 }}>
          <img src="/favicon.svg" alt="TripTogether" style={{ width: isMobileMode ? 28 : 36, height: isMobileMode ? 28 : 36, flexShrink: 0 }} />
          <h1 style={{ fontSize: isMobileMode ? 15 : 20, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1 }}>
            Trip<span style={{ color: '#7C3AED' }}>Together</span>
          </h1>
          <span style={{
            fontSize: isMobileMode ? 9 : 10, fontWeight: 800,
            color: '#7C3AED',
            background: 'rgba(124,58,237,0.12)',
            border: '1px solid rgba(124,58,237,0.28)',
            borderRadius: 99,
            padding: isMobileMode ? '2px 5px' : '2px 7px',
            letterSpacing: '0.3px',
            alignSelf: 'center',
          }}>Beta</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobileMode ? 8 : 12 }}>
          <ModeToggleBtn />
          {isMobileMode ? (
            <>
              {avatar ? (
                <img src={avatar} alt="" style={{ width: 34, height: 34, borderRadius: '50%',
                  border: '2px solid rgba(165,125,65,0.35)', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 34, height: 34, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#D97706,#B45309)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, color: '#fff', fontWeight: 900 }}>
                  {displayName[0].toUpperCase()}
                </div>
              )}
              <button onClick={handleSignOut} style={{
                width: 34, height: 34, borderRadius: 10, border: '1.5px solid rgba(165,125,65,0.28)',
                background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900,
              }}>↩</button>
            </>
          ) : (
            <>
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
                {t('home.signOut')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Google 重新導向登入錯誤 */}
      {redirectError && (
        <div style={{
          margin: isMobileMode ? '12px 12px 0' : '16px 28px 0',
          padding: '10px 16px', borderRadius: 12,
          background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.25)',
          fontSize: 13, fontWeight: 800, color: '#DC2626',
        }}>
          ⚠️ {t('home.error.google')}{redirectError.message || ''}
        </div>
      )}

      {/* 操作錯誤提示 */}
      {actionError && (
        <div style={{
          margin: isMobileMode ? '12px 12px 0' : '16px 28px 0',
          padding: '10px 16px', borderRadius: 12,
          background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.25)',
          fontSize: 13, fontWeight: 800, color: '#DC2626',
        }}>
          ⚠️ {actionError}
        </div>
      )}

      {/* Bug #13：超過 30 天未瀏覽的自有計畫警告清單 */}
      {showStaleWarning && (
        <div style={{
          margin: isMobileMode ? '12px 12px 0' : '16px 28px 0',
          padding: '14px 18px', borderRadius: 16,
          background: 'rgba(217,119,6,0.08)',
          border: '2px solid rgba(217,119,6,0.30)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={20} color="#B45309" />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 900, color: '#7C2D12' }}>
              {t('home.staleWarning', { count: staleTrips.length })}
            </div>
            <button
              aria-label={t('common.close.warning')}
              onClick={() => {
                setStaleWarningDismissed(true)
                if (STALE_DISMISS_KEY) localStorage.setItem(STALE_DISMISS_KEY, 'true')
              }}
              style={{
                width: 26, height: 26, borderRadius: 8,
                border: '1px solid rgba(120,60,10,0.20)',
                background: 'transparent', color: '#7C2D12',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><X size={13} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {staleTrips.map(trip => (
              <div key={trip.code} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                background: 'rgba(255,252,244,0.85)',
                border: '1px solid rgba(165,125,65,0.20)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }} title={trip.name}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trip.name}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {trip.startDate} – {trip.endDate}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/trip/${trip.code}`)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 900,
                    background: 'var(--bg-elevated)', border: '1.5px solid rgba(165,125,65,0.25)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >{t('common.keep')}</button>
                <button
                  onClick={() => handleDelete(trip.code)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 900,
                    background: 'linear-gradient(135deg,#EF4444,#B91C1C)',
                    boxShadow: '0 2px 0 #7F1D1D',
                    color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >{t('common.delete')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 教學 Banner */}
      {showTutorialBanner && (
        <div style={{
          margin: isMobileMode ? '12px 12px 0' : '16px 28px 0',
          padding: '14px 18px', borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(180,83,9,0.10), rgba(217,119,6,0.08))',
          border: '2px solid rgba(180,83,9,0.28)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          animation: 'tutorial-banner-slide 0.4s ease',
        }}>
          <Map size={24} color="var(--text-primary)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#92400E' }}>{t('home.tutorial.title')}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309', marginTop: 2 }}>{t('home.tutorial.desc')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => { setBannerHidden(true); if (BANNER_KEY) localStorage.setItem(BANNER_KEY, 'true') }} style={{
              padding: '8px 12px', borderRadius: 10, border: '1.5px solid rgba(180,83,9,0.25)',
              background: 'transparent', color: '#92400E', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>{t('home.tutorial.skip')}</button>
            <button onClick={startTutorial} style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #E8A020, #B45309)',
              boxShadow: '0 3px 0 #7C2D12',
              color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer',
            }}>{t('home.tutorial.start')}</button>
          </div>
        </div>
      )}

      {/* 內容 */}
      <div style={{ maxWidth: isMobileMode ? '100%' : 960, margin: '0 auto', padding: isMobileMode ? '16px 12px 16px' : 'clamp(20px, 5vw, 40px) clamp(16px, 4vw, 28px) 100px' }}>

        {/* 我的旅遊計畫 標題列 */}
        {!isMobileMode && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 900, color: 'var(--text-primary)' }}>{t('home.myTrips')}</h2>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
                {tripsLoading ? t('common.loading') : t('home.tripCount', { count: regularTrips.length })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
              {!tutorialCompleted && regularTrips.length > 0 && (
                <button onClick={startTutorial} style={{
                  padding: '8px 14px', borderRadius: 10, border: '1.5px solid rgba(180,83,9,0.30)',
                  background: 'rgba(180,83,9,0.08)', color: '#B45309', fontSize: 12, fontWeight: 900,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}>{t('home.tutorial.mode')}</button>
              )}
              <button data-tutorial-id="join-trip-btn" onClick={() => setModal('join')} className="btn-game btn-ghost"
                style={{ padding: '10px 18px', fontSize: 13, minHeight: 44 }}>
                {t('home.join')}
              </button>
              <button data-tutorial-id="create-trip-btn" onClick={() => setModal('create')} className="btn-game btn-primary"
                style={{ padding: '10px 20px', fontSize: 13, minHeight: 44 }}>
                {t('home.create')}
              </button>
            </div>
          </div>
        )}

        {isMobileMode && (
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{t('home.myTrips')}</h2>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 3 }}>
              {tripsLoading ? t('common.loading') : t('home.tripCount', { count: regularTrips.length })}
            </p>
          </div>
        )}

        {/* 計畫 Grid */}
        {tripsLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobileMode ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: isMobileMode ? 12 : 18 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: isMobileMode ? 120 : 200, borderRadius: 22,
                background: 'rgba(165,125,65,0.08)', border: '2px solid rgba(165,125,65,0.14)',
                animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : displayTrips.length === 0 ? (
          <div className="glass-card" style={{ padding: isMobileMode ? '40px 24px' : '60px 40px', textAlign: 'center', borderRadius: 28 }}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Map size={isMobileMode ? 52 : 64} color="var(--text-muted)" /></div>
            <h3 style={{ fontSize: isMobileMode ? 17 : 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 10 }}>
              {t('home.empty.title')}
            </h3>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 24 }}>
              {t('home.empty.desc')}
            </p>
            {!isMobileMode && (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setModal('create')} className="btn-game btn-primary"
                  style={{ padding: '14px 28px', fontSize: 15 }}>
                  {t('home.createLong')}
                </button>
                <button onClick={() => setModal('join')} className="btn-game btn-ghost"
                  style={{ padding: '14px 28px', fontSize: 15 }}>
                  {t('home.joinExisting')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobileMode ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: isMobileMode ? 12 : 18 }}>
            {displayTrips.map((trip, idx) => (
              <TripCard
                key={trip.code}
                trip={trip}
                currentUser={currentUser}
                isMobileMode={isMobileMode}
                onClick={() => navigate(`/trip/${trip.code}`)}
                onDelete={handleDelete}
                onLeave={handleLeave}
                tutorialId={trip.isDemoTrip ? 'first-trip-card' : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* 手機版底部固定操作欄 */}
      {isMobileMode && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'rgba(250,246,234,0.97)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderTop: '2px solid rgba(165,125,65,0.22)',
          padding: '10px 16px',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))',
        }}>
          <div style={{ display: 'flex', gap: 12, maxWidth: 300, margin: '0 auto' }}>
            <button data-tutorial-id="join-trip-btn" onClick={() => setModal('join')} className="btn-game btn-ghost"
              style={{ flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 900 }}>
              {t('home.join')}
            </button>
            <button data-tutorial-id="create-trip-btn" onClick={() => setModal('create')} className="btn-game btn-primary"
              style={{ flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 900 }}>
              {t('home.create')}
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal === 'create' && (
        <CreateModal uid={currentUser?.uid} onClose={() => setModal(null)} onCreated={() => {}} />
      )}
      {modal === 'join' && (
        <JoinModal
          uid={currentUser?.uid}
          actor={{ uid: currentUser?.uid, displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '' }}
          onClose={() => { setModal(null); setJoinParams({ code: '' }) }}
          onJoined={() => {}}
          initialCode={joinParams.code}
        />
      )}
    </div>
  )
}
