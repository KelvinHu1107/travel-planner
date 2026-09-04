import { useEffect, useState, useCallback, useRef, useMemo, Component } from 'react'
import { useTutorial } from '../tutorial/TutorialContext'
import { useLanguage } from '../i18n/LanguageContext'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  DndContext, DragOverlay, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, storage } from '../services/firebase'
import {
  getTrip, addCard, updateCard, deleteCard, subscribeToCards, updateTrip,
  deleteTrip, leaveTrip, getMemberProfiles, clearAllCards,
  updateTripLastVisited, addStorageUsedBytes,
} from '../services/firestore'
import { useAuth } from '../contexts/AuthContext'
import {
  X, Settings2, Trash2,
  Map, FileText, Search, ClipboardList, Package,
  CheckSquare, CalendarDays, Clock, List,
  Monitor, Smartphone, Pencil,
  Key, Users, User, Info, AlertTriangle,
} from 'lucide-react'
import { HdMapPin, HdWallet, HdPlus } from '../components/ui/HanddrawnIcons'
import { CopyLinkButton, FullscreenButton } from '../components/ui/TopBarActions'
import ThemeSwitcher from '../components/ui/ThemeSwitcher'
import { useTheme } from '../contexts/ThemeContext'
import CalendarPicker from '../components/ui/CalendarPicker'
import NotificationBell from '../components/ui/NotificationBell'

// Bug #31：PDF/HTML escape helper
const escHtml = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
import { getTripDuration, getDaysInRange, getLocalDateStr, WEEKDAYS_ZH, WEEKDAYS_EN } from '../utils/dateUtils'
import { loadGoogleMaps } from '../services/maps'
import BoardLayout from '../components/board/BoardLayout'
import AddCardModal from '../components/modals/AddCardModal'
import CardDetailModal from '../components/modals/CardDetailModal'
import { CardPreview, timeToMinutes, minutesToTime, CATEGORY } from '../components/cards/CardItem'
import { SLOT_HEIGHT, DAY_COL_W, START_HOUR, END_HOUR } from '../components/board/boardConstants'
import { useWindowSize } from '../hooks/useWindowSize'
import { useViewMode } from '../contexts/ViewModeContext'
import { CURRENT_VERSION, CHANGELOG } from '../constants/version'

// ── 範例種子卡片（首次進入時寫入 Firestore）────
function makeSeedCards(firstDay, t) {
  return [
    { type: 'attraction', day: firstDay, startTime: '09:00', duration: 30,
      title: t('sample.attraction.title'), address: t('sample.attraction.address'), lat: null, lng: null },
    { type: 'transport', day: firstDay, startTime: '10:30', duration: 60,
      title: t('sample.transport.title'), from: t('sample.transport.from'), to: t('sample.transport.to'), mode: 'transit' },
    { type: 'restaurant', day: firstDay, startTime: '12:30', duration: 75,
      title: t('sample.restaurant.title'), address: t('sample.restaurant.address'), lat: null, lng: null },
    { type: 'attraction', day: firstDay, startTime: '14:30', duration: 120,
      title: t('sample.accommodation.title'), address: t('sample.accommodation.address'), lat: null, lng: null },
  ]
}

// ── 外觀風格選擇器（設定 Modal 內用）────────────
function ThemeSwitcherSection({ t }) {
  const { theme, setTheme } = useTheme()
  const themes = [
    { id: 'handdrawn', label: t('settings.about.theme.handdrawn'), icon: '✏️', desc: t('settings.about.theme.handdrawn.desc') },
    { id: 'cute',      label: t('settings.about.theme.cute'),      icon: '✨', desc: t('settings.about.theme.cute.desc') },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        {t('settings.about.theme')}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        {themes.map(th => (
          <button
            key={th.id}
            onClick={() => setTheme(th.id)}
            style={{
              flex: 1, padding: '14px 12px', borderRadius: 16, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              border: theme === th.id ? '2px solid var(--accent)' : '1.5px solid var(--border)',
              background: theme === th.id ? 'var(--accent-glow)' : 'var(--bg-surface)',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 24 }}>{th.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: theme === th.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {th.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              {th.desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 設定 Modal ───────────────────────────────
function SettingsModal({ trip, tripId, onClose, onBgChange, onTripUpdate, isMobile, cards = [] }) {
  const navigate = useNavigate()
  const { currentUser, signOut, changePassword, isEmailUser } = useAuth()
  const { restartTutorial } = useTutorial()
  const { t, lang, setLang } = useLanguage()
  const isOwner = trip?.ownerId === currentUser?.uid

  const [tab, setTab]           = useState('trip')    // 'trip' | 'invite' | 'account'
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied]     = useState(false)

  // 計畫資訊編輯
  const [editForm, setEditForm] = useState({ name: trip?.name ?? '', startDate: trip?.startDate ?? '', endDate: trip?.endDate ?? '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editSuccess, setEditSuccess] = useState(false)
  const [editError, setEditError] = useState('')

  // 成員列表
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  // 清空卡片
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // 更改帳號密碼
  const [pwSection, setPwSection] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  // Email 邀請
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSent, setInviteSent]   = useState(false)

  // 版本更新紀錄
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => {
    if (tab === 'invite' && trip?.members?.length) {
      setMembersLoading(true)
      getMemberProfiles(trip.members)
        .then(setMembers)
        .finally(() => setMembersLoading(false))
    }
  }, [tab, trip?.members])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  // 名稱：失焦時儲存
  const handleNameBlur = async () => {
    const newName = editForm.name.trim()
    if (!newName || newName === trip?.name) return
    setEditError(''); setEditSaving(true)
    try {
      await updateTrip(tripId, { name: newName })
      onTripUpdate({ name: newName })
      setEditSuccess(true); setTimeout(() => setEditSuccess(false), 2000)
    } catch { setEditError(t('settings.trip.error.name')) } finally { setEditSaving(false) }
  }

  // 日期：選定即驗證並儲存
  // Bug #11：若日期縮短造成部分卡片超出新範圍，需先確認並將其移至第一天
  const [pendingDates, setPendingDates] = useState(null) // { startDate, endDate, orphaned }
  const handleDateChange = async (field, value) => {
    const newForm = { ...editForm, [field]: value }
    setEditForm(newForm)
    setEditError('')
    const { startDate, endDate } = newForm
    if (!startDate || !endDate) return
    if (startDate > endDate) { setEditError(t('create.error.dateOrder')); return }
    // Bug #24：日期範圍最多 60 天（Bug #15：使用 Math.round 避免 DST 導致 off-by-one）
    const days = Math.round((new Date(endDate) - new Date(startDate)) / (24 * 60 * 60 * 1000)) + 1
    if (days > 60) { setEditError(t('settings.dateRangeMax')); return }
    if (startDate === trip?.startDate && endDate === trip?.endDate) return

    // Bug #11：檢查是否有卡片超出新的日期範圍
    const newDays = getDaysInRange(startDate, endDate)
    const orphaned = cards.filter(c => c.day && !newDays.includes(c.day))
    if (orphaned.length > 0) {
      setPendingDates({ startDate, endDate, orphaned })
      return
    }

    await saveDateChange(startDate, endDate, [])
  }

  const saveDateChange = async (startDate, endDate, orphaned) => {
    setEditSaving(true)
    try {
      // 先將 orphaned 卡片移至新的第一天，再更新 trip 日期
      if (orphaned.length > 0) {
        await Promise.all(orphaned.map(c =>
          updateCard(tripId, c.id, { day: startDate })
        ))
      }
      await updateTrip(tripId, { startDate, endDate })
      onTripUpdate({ startDate, endDate })
      setEditSuccess(true); setTimeout(() => setEditSuccess(false), 2000)
    } catch { setEditError(t('settings.trip.error.date')) } finally { setEditSaving(false) }
  }

  const confirmDateChange = async () => {
    if (!pendingDates) return
    const { startDate, endDate, orphaned } = pendingDates
    setPendingDates(null)
    await saveDateChange(startDate, endDate, orphaned)
  }

  const cancelDateChange = () => {
    // 還原表單至 trip 的原值
    setEditForm({ name: trip?.name ?? '', startDate: trip?.startDate ?? '', endDate: trip?.endDate ?? '' })
    setPendingDates(null)
  }

  // Bug #18/#20/#21：加 loading state
  const [busyAction, setBusyAction] = useState(null) // 'clear' | 'delete' | 'leave' | null
  const [bgError, setBgError] = useState('')

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError(''); setPwSuccess('')
    if (pwForm.next !== pwForm.confirm) { setPwError(t('settings.account.pw.error.mismatch')); return }
    if (pwForm.next.length < 6) { setPwError(t('settings.account.pw.error.short')); return }
    setPwLoading(true)
    try {
      await changePassword(pwForm.current, pwForm.next)
      setPwSuccess(t('settings.account.pw.success'))
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      // Bug #37：更多 Firebase Auth 錯誤碼
      let msg
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = t('settings.account.pw.error.wrong')
      } else if (err.code === 'auth/too-many-requests') {
        msg = t('settings.account.pw.error.tooMany')
      } else if (err.code === 'auth/requires-recent-login') {
        msg = t('settings.account.pw.error.recentLogin')
      } else if (err.code === 'auth/weak-password') {
        msg = t('settings.account.pw.error.weak')
      } else {
        msg = t('settings.account.pw.error.failed')
      }
      setPwError(msg)
    } finally { setPwLoading(false) }
  }

  const handleBgUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setBgError('')
    try {
      const path = `trips/${tripId}/background`
      const fileRef = storageRef(storage, path)
      const snapshot = await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      await updateTrip(tripId, { backgroundImage: url })
      await addStorageUsedBytes(tripId, snapshot.metadata.size)
      onBgChange(url)
    } catch (err) {
      console.error(err)
      // Bug #21：失敗顯示錯誤
      setBgError(t('settings.bgUploadError', { message: err?.message || t('common.error') }))
    } finally { setUploading(false) }
  }

  const handleClearBg = async () => {
    try {
      await updateTrip(tripId, { backgroundImage: null })
      onBgChange(null)
    } catch (err) {
      setBgError(t('settings.bgClearError', { message: err?.message || t('common.error') }))
    }
  }

  const handleClearCards = async () => {
    setBusyAction('clear')
    try {
      await clearAllCards(tripId, {
        uid: currentUser?.uid,
        displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
      })
      setConfirmClear(false)
      onClose()
    } catch (err) {
      console.error(err)
      setEditError(t('settings.clearCardsError', { message: err?.message || t('common.error') }))
    } finally { setBusyAction(null) }
  }

  const handleDeleteTrip = async () => {
    setBusyAction('delete')
    try {
      const actor = {
        uid: currentUser?.uid,
        displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
      }
      await deleteTrip(tripId, currentUser?.uid, actor)
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
      setEditError(t('settings.deleteTripError', { message: err?.message || t('common.error') }))
    } finally { setBusyAction(null) }
  }

  const handleLeaveTrip = async () => {
    setBusyAction('leave')
    try {
      await leaveTrip(tripId, currentUser?.uid, {
        uid: currentUser?.uid,
        displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
      })
      navigate('/', { replace: true, state: { toast: 'leftTrip' } })
    } catch (err) {
      console.error(err)
      setEditError(t('settings.leaveTripError', { message: err?.message || t('common.error') }))
    } finally { setBusyAction(null) }
  }

  const TABS = [
    { id: 'trip',    IconComp: Map,      label: t('settings.tab.trip') },
    { id: 'invite',  IconComp: Users,    label: t('settings.tab.invite') },
    { id: 'account', IconComp: User,     label: t('settings.tab.account') },
    { id: 'about',   IconComp: Info,     label: t('settings.tab.about') },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center', padding: isMobile ? 0 : 20 }}
      onClick={onClose}
    >
      <div
        className="glass-card-glow"
        style={{ width: '100%', maxWidth: isMobile ? '100%' : 460, maxHeight: isMobile ? '92vh' : '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: isMobile ? '24px 24px 0 0' : undefined }}
        onClick={e => e.stopPropagation()}
      >
        {/* 標頭 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings2 size={20} />
            <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>{t('settings.title')}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', padding: '3px', borderRadius: 99,
              background: 'rgba(165,125,65,0.08)', border: '1.5px solid rgba(165,125,65,0.20)' }}>
              {['zh', 'en'].map(l => (
                <button key={l} onClick={() => setLang(l)} style={{
                  padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                  border: 'none',
                  background: lang === l ? 'var(--bg-elevated)' : 'transparent',
                  color: lang === l ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: lang === l ? '0 1px 4px rgba(140,100,40,0.15)' : 'none',
                }}>
                  {t(`common.lang.${l}`)}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '8px 14px', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', fontWeight: 900,
              display: 'flex', alignItems: 'center' }}><X size={18} /></button>
          </div>
        </div>

        {/* Tab 列 */}
        <div style={{ display: 'flex', gap: 6, padding: '16px 28px 0' }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
              padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 900,
              cursor: 'pointer',
              background: tab === tb.id ? 'rgba(180,83,9,0.16)' : 'rgba(165,125,65,0.08)',
              color: tab === tb.id ? 'var(--accent)' : 'var(--text-muted)',
              border: tab === tb.id ? '1.5px solid rgba(180,83,9,0.35)' : '1.5px solid transparent',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <tb.IconComp size={13} /> {tb.label}
            </button>
          ))}
        </div>

        {/* 內容區（可捲動） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── 計畫 Tab ── */}
            {tab === 'trip' && (<>
              {/* 計畫基本資料編輯 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{t('settings.trip.info')}</p>
                  {editSaving && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{t('common.saving')}</span>}
                  {editSuccess && !editSaving && <span style={{ fontSize: 11, color: '#0F766E', fontWeight: 800 }}>{t('common.saved')}</span>}
                </div>
                {editError && <div style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 10 }}>⚠️ {editError}</div>}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('settings.trip.name')}</label>
                  <input className="game-input" type="text" value={editForm.name}
                    maxLength={50}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    onBlur={handleNameBlur} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('settings.trip.start')}</label>
                    <CalendarPicker
                      value={editForm.startDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={v => handleDateChange('startDate', v)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('settings.trip.end')}</label>
                    <CalendarPicker
                      value={editForm.endDate}
                      min={editForm.startDate || new Date().toISOString().split('T')[0]}
                      onChange={v => handleDateChange('endDate', v)}
                    />
                  </div>
                </div>
                {/* Bug #11：卡片會被移動的確認 */}
                {pendingDates && (
                  <div style={{
                    padding: '12px 14px', borderRadius: 12,
                    background: 'rgba(217,119,6,0.08)', border: '1.5px solid rgba(217,119,6,0.35)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#92400E' }}>
                      ⚠️ {t('settings.orphanedCards', { count: pendingDates.orphaned.length })}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={cancelDateChange} style={{
                        flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 900,
                        border: '1.5px solid rgba(165,125,65,0.28)', background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}>{t('common.cancel')}</button>
                      <button onClick={confirmDateChange} style={{
                        flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 900,
                        border: 'none', background: 'linear-gradient(135deg,#D97706,#B45309)',
                        color: '#fff', cursor: 'pointer', boxShadow: '0 3px 0 #78350F',
                      }}>{t('common.confirm')}</button>
                    </div>
                  </div>
                )}
              </div>

              {/* 背景圖片 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
                  {t('settings.trip.bg')}
                </p>
                {trip?.backgroundImage && (
                  <div style={{ position: 'relative', marginBottom: 12, borderRadius: 16, overflow: 'hidden', height: 110 }}>
                    <img src={trip.backgroundImage} alt="background" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button className="btn-game" onClick={handleClearBg}
                        style={{ padding: '8px 18px', fontSize: 13, background: 'rgba(248,113,113,0.3)', border: '2px solid rgba(248,113,113,0.6)', color: '#F87171', borderRadius: 12 }}>
                        {t('settings.trip.removeBg')}
                      </button>
                    </div>
                  </div>
                )}
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  padding: '14px', borderRadius: 14,
                  border: '2px dashed rgba(139,92,246,0.4)', background: 'rgba(124,58,237,0.06)',
                  cursor: uploading ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 800,
                }}>
                  {uploading ? t('settings.trip.uploading') : t('settings.trip.uploadBg')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} disabled={uploading} />
                </label>
                {bgError && (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: '#DC2626',
                    padding: '8px 12px', background: 'rgba(220,38,38,0.08)',
                    border: '1px solid rgba(220,38,38,0.22)', borderRadius: 10 }}>
                    ⚠️ {bgError}
                  </div>
                )}
              </div>

              {/* 危險操作 */}
              <div style={{ borderTop: '1.5px solid rgba(220,38,38,0.15)', paddingTop: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 900, color: '#DC2626', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>{t('settings.danger.title')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!confirmClear ? (
                    <button onClick={() => setConfirmClear(true)} style={{
                      padding: '10px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.25)',
                      background: 'rgba(220,38,38,0.06)', color: '#DC2626', fontSize: 13, fontWeight: 900, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}><Trash2 size={14} />{t('settings.danger.clearCards')}</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', flex: 1 }}>{t('settings.danger.confirmClear')}</span>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setConfirmClear(false)} style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('common.cancel')}</button>
                        <button onClick={handleClearCards} disabled={busyAction === 'clear'} style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 900, cursor: busyAction === 'clear' ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: busyAction === 'clear' ? 0.7 : 1 }}>{busyAction === 'clear' ? t('common.processing') : t('common.confirm.clear')}</button>
                      </div>
                    </div>
                  )}
                  {isOwner ? (
                    !confirmDelete ? (
                      <button onClick={() => setConfirmDelete(true)} style={{
                        padding: '10px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.35)',
                        background: 'rgba(220,38,38,0.10)', color: '#DC2626', fontSize: 13, fontWeight: 900, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}><Trash2 size={14} />{t('settings.danger.deleteTrip')}</button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                        background: 'rgba(220,38,38,0.10)', border: '1.5px solid rgba(220,38,38,0.35)' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', flex: 1 }}>{t('settings.danger.confirmDelete')}</span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('common.cancel')}</button>
                          <button onClick={handleDeleteTrip} disabled={busyAction === 'delete'} style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#B91C1C', color: '#fff', fontSize: 11, fontWeight: 900, cursor: busyAction === 'delete' ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: busyAction === 'delete' ? 0.7 : 1 }}>{busyAction === 'delete' ? t('common.deleting') : t('common.confirm.delete')}</button>
                        </div>
                      </div>
                    )
                  ) : (
                    !confirmLeave ? (
                      <button onClick={() => setConfirmLeave(true)} style={{
                        padding: '10px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.25)',
                        background: 'rgba(220,38,38,0.06)', color: '#DC2626', fontSize: 13, fontWeight: 900, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}><X size={14} />{t('settings.danger.leaveTrip')}</button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                        background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', flex: 1 }}>{t('settings.danger.confirmLeave')}</span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => setConfirmLeave(false)} style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('common.cancel')}</button>
                          <button onClick={handleLeaveTrip} disabled={busyAction === 'leave'} style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 900, cursor: busyAction === 'leave' ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: busyAction === 'leave' ? 0.7 : 1 }}>{busyAction === 'leave' ? t('common.leaving') : t('common.confirm.leave')}</button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </>)}

            {/* ── 邀請 Tab ── */}
            {tab === 'invite' && (<>
              {/* 一鍵邀請連結 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>{t('settings.invite.title')}</p>
                <div style={{ padding: '16px 18px', borderRadius: 18, background: 'rgba(180,83,9,0.07)', border: '2px solid rgba(180,83,9,0.25)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    {t('settings.invite.desc')}
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(255,250,238,0.80)',
                    border: '1.5px solid rgba(165,125,65,0.25)', fontFamily: 'monospace',
                    fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
                    wordBreak: 'break-all', lineHeight: 1.6 }}>
                    {`${window.location.origin}/?join=${tripId}`}
                  </div>
                  <button className="btn-game btn-primary" style={{ padding: '11px', fontSize: 13 }}
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/?join=${tripId}`)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2500)
                    }}>
                    {copied ? t('settings.invite.copied') : t('settings.invite.copyLink')}
                  </button>
                </div>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginTop: 9, lineHeight: 1.6 }}>
                  {t('settings.invite.tip')}
                </p>
              </div>

              {/* Email 邀請 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
                  {t('settings.invite.email.title')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('settings.invite.email.label')}</label>
                    <input
                      className="game-input"
                      type="email"
                      placeholder="friend@example.com"
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteSent(false) }}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  {inviteSent && (
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0F766E', padding: '9px 12px',
                      background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.22)', borderRadius: 10 }}>
                      {t('settings.invite.email.sent')}
                    </div>
                  )}
                  <button
                    className="btn-game btn-primary"
                    style={{ padding: '11px', fontSize: 13 }}
                    disabled={!inviteEmail.trim()}
                    onClick={() => {
                      const joinUrl = `${window.location.origin}/?join=${tripId}`
                      const dates = trip ? `${trip.startDate} ～ ${trip.endDate}` : ''
                      const subject = t('settings.invite.emailSubject', { name: trip?.name ?? '' })
                      const body = t('settings.invite.emailBody', { name: trip?.name ?? '', dates, url: joinUrl })
                      const mailto = `mailto:${encodeURIComponent(inviteEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
                      window.open(mailto, '_self')
                      setInviteSent(true)
                    }}
                  >
                    {t('settings.invite.email.send')}
                  </button>
                </div>
              </div>


              {/* 成員列表 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
                  {t('settings.invite.members', { count: trip?.members?.length ?? 0 })}
                </p>
                {membersLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 800 }}>{t('common.loading')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {members.map(m => (
                      <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', borderRadius: 14,
                        background: 'rgba(165,125,65,0.06)', border: '1.5px solid rgba(165,125,65,0.15)' }}>
                        {m.photoURL ? (
                          <img src={m.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg,#D97706,#B45309)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 15, color: '#fff', fontWeight: 900 }}>
                            {(m.displayName || m.email || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.displayName || m.email?.split('@')[0] || t('settings.invite.unknown')}
                            {m.uid === trip?.ownerId && (
                              <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 900, color: 'var(--accent)',
                                background: 'rgba(180,83,9,0.12)', border: '1px solid rgba(180,83,9,0.25)',
                                borderRadius: 6, padding: '1px 7px' }}>{t('common.owner')}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                            {m.email}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>)}

            {/* ── 關於 Tab ── */}
            {tab === 'about' && (<>

              {/* 外觀風格切換 */}
              <ThemeSwitcherSection t={t} />

              {/* App 身份識別 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src="/favicon.svg" alt="TripTogether" style={{ width: 44, height: 44, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Trip<span style={{ color: '#7C3AED' }}>Together</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#7C3AED',
                        background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.28)',
                        borderRadius: 99, padding: '2px 7px', letterSpacing: '0.4px' }}>Beta</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 3 }}>
                      {t('settings.about.subtitle')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-bright)', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-secondary)' }}>
                    {t('settings.about.version')} <span style={{ color: 'var(--accent)' }}>v{CURRENT_VERSION}</span>
                  </span>
                </div>
              </div>

              {/* 重播教學 */}
              {restartTutorial && (
                <button
                  onClick={() => { restartTutorial(); onClose() }}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 14, textAlign: 'left',
                    background: 'rgba(180,83,9,0.07)', border: '1.5px solid rgba(180,83,9,0.18)',
                    fontSize: 13, fontWeight: 900, color: 'var(--accent)', cursor: 'pointer' }}>
                  {t('settings.about.restart.tutorial')}
                </button>
              )}

              {/* 更新紀錄 */}
              <div>
                <button
                  onClick={() => setShowChangelog(v => !v)}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 14, textAlign: 'left',
                    background: 'rgba(165,125,65,0.07)', border: '1.5px solid rgba(165,125,65,0.18)',
                    fontSize: 13, fontWeight: 900, color: 'var(--text-secondary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span>{t('settings.about.changelog')}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{showChangelog ? t('settings.about.changelog.collapse') : t('settings.about.changelog.expand')}</span>
                </button>
                {showChangelog && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14, padding: '16px', borderRadius: 14,
                    background: 'rgba(165,125,65,0.04)', border: '1px solid rgba(165,125,65,0.12)' }}>
                    {CHANGELOG.map((entry, idx) => (
                      <div key={entry.version}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                          <span style={{ fontSize: 16 }}>{entry.emoji}</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 900,
                                background: 'rgba(180,83,9,0.10)', color: 'var(--accent)',
                                border: '1px solid rgba(180,83,9,0.22)' }}>v{entry.version}</span>
                              <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)' }}>{entry.title}</span>
                            </div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>{entry.date}</p>
                          </div>
                        </div>
                        <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {entry.changes.map((change, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                              <span style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                                background: 'var(--accent-bright)', marginTop: 5 }} />
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{change}</p>
                            </div>
                          ))}
                        </div>
                        {idx < CHANGELOG.length - 1 && (
                          <div style={{ marginTop: 12, height: 1, background: 'rgba(165,125,65,0.12)' }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 著作權與智慧財產權 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
                  {t('settings.about.copyright.title')}
                </p>
                <div style={{ padding: '14px 16px', borderRadius: 14,
                  background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.14)',
                  display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#7C3AED', lineHeight: 1.7 }}>
                    © {new Date().getFullYear()} TripTogether. All Rights Reserved.
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.copyright.body1')}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.copyright.body2')}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.copyright.body3')}
                  </p>
                </div>
              </div>

              {/* 隱私與資料使用 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
                  {t('settings.about.privacy.title')}
                </p>
                <div style={{ padding: '14px 16px', borderRadius: 14,
                  background: 'rgba(180,83,9,0.04)', border: '1px solid rgba(180,83,9,0.14)',
                  display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.privacy.body1')}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.privacy.body2')}
                  </p>
                </div>
              </div>

              {/* 免責聲明 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
                  {t('settings.about.disclaimer.title')}
                </p>
                <div style={{ padding: '14px 16px', borderRadius: 14,
                  background: 'rgba(165,125,65,0.04)', border: '1px solid rgba(165,125,65,0.14)',
                  display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.disclaimer.body1')}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.disclaimer.body3')}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.disclaimer.body4')}
                  </p>
                </div>
              </div>

              {/* 適用法律 */}
              <div style={{ paddingBottom: 4 }}>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
                  {t('settings.about.law.title')}
                </p>
                <div style={{ padding: '12px 16px', borderRadius: 14,
                  background: 'rgba(165,125,65,0.04)', border: '1px solid rgba(165,125,65,0.12)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {t('settings.about.law.body')}
                  </p>
                </div>
              </div>

            </>)}

            {/* ── 帳號 Tab ── */}
            {tab === 'account' && (<>
              {/* 帳號資訊 */}
              <div style={{ padding: '16px 18px', borderRadius: 16,
                background: 'rgba(165,125,65,0.08)', border: '1.5px solid rgba(165,125,65,0.20)',
                display: 'flex', alignItems: 'center', gap: 14 }}>
                {currentUser?.photoURL ? (
                  <img src={currentUser.photoURL} alt="" style={{ width: 44, height: 44, borderRadius: '50%',
                    border: '2px solid rgba(165,125,65,0.35)', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#D97706,#B45309)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: '#fff', fontWeight: 900, flexShrink: 0 }}>
                    {(currentUser?.displayName || currentUser?.email || '?')[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser?.displayName || t('common.traveler')}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser?.email}
                  </div>
                </div>
                <button onClick={handleSignOut} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 10,
                  background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.25)',
                  color: '#DC2626', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                  {t('settings.account.signOut')}
                </button>
              </div>

              {/* 更改密碼（Email 用戶） */}
              {isEmailUser && (
                <div>
                  <button onClick={() => { setPwSection(v => !v); setPwError(''); setPwSuccess('') }}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 14, textAlign: 'left',
                      background: 'rgba(165,125,65,0.07)', border: '1.5px solid rgba(165,125,65,0.18)',
                      fontSize: 13, fontWeight: 900, color: 'var(--text-secondary)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Key size={14} /> {t('settings.account.changePw')}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pwSection ? '▲' : '▼'}</span>
                  </button>
                  {pwSection && (
                    <form onSubmit={handleChangePassword}
                      style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10,
                        padding: '16px', borderRadius: 14,
                        background: 'rgba(165,125,65,0.05)', border: '1px solid rgba(165,125,65,0.14)' }}>
                      {pwError && <div style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', padding: '8px 12px',
                        background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} /> {pwError}</div>}
                      {pwSuccess && <div style={{ fontSize: 12, fontWeight: 800, color: '#0F766E', padding: '8px 12px',
                        background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.22)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckSquare size={13} /> {pwSuccess}</div>}
                      {[['current', t('settings.account.pw.current')],['next', t('settings.account.pw.new')],['confirm', t('settings.account.pw.confirm')]].map(([field, label]) => (
                        <div key={field}>
                          <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{label}</label>
                          <input className="game-input" type="password" style={{ padding: '10px 14px', fontSize: 13 }}
                            value={pwForm[field]} onChange={e => setPwForm(p => ({ ...p, [field]: e.target.value }))}
                            disabled={pwLoading} required />
                        </div>
                      ))}
                      <button type="submit" className="btn-game btn-primary" style={{ padding: '10px', fontSize: 13, marginTop: 4 }} disabled={pwLoading}>
                        {pwLoading ? t('common.saving') : t('settings.account.pw.submit')}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>)}

          </div>


        </div>
      </div>
    </div>
  )
}

// ── 拖曳垃圾桶區 ────────────────────────────
function TrashZone({ visible, isMobile }) {
  const { t } = useLanguage()
  const { setNodeRef, isOver } = useDroppable({ id: 'trash-zone' })
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'fixed', bottom: isMobile ? 80 : 40, left: '50%', transform: 'translateX(-50%)',
        zIndex: 200, padding: '14px 36px', borderRadius: 20,
        background: isOver ? 'rgba(248,113,113,0.30)' : 'rgba(248,113,113,0.12)',
        border: `2.5px ${isOver ? 'solid' : 'dashed'} rgba(248,113,113,${isOver ? '0.85' : '0.55'})`,
        color: '#F87171', fontSize: 15, fontWeight: 900,
        display: 'flex', alignItems: 'center', gap: 10,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        transition: 'background 0.15s, border 0.15s, box-shadow 0.15s',
        boxShadow: isOver ? '0 0 24px rgba(248,113,113,0.45)' : 'none',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        scale: isOver ? '1.06' : '1',
      }}
    >
      <Trash2 size={18} style={{ flexShrink: 0 }} />
      {isOver ? ` ${t('board.trashDrop')}` : ` ${t('board.trashHint')}`}
    </div>
  )
}

// ── 左側 Sidebar ────────────────────────────
function LeftSidebar({ trip, tripId, cards, onShowExpense, onShowSettings, onExportPDF }) {
  const navigate = useNavigate()
  const { t, lang } = useLanguage()

  const counts = cards.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1
    return acc
  }, {})


  return (
    <div style={{
      width: 260, flexShrink: 0, padding: '28px 20px',
      display: 'flex', flexDirection: 'column', gap: 24,
      borderRight: '2px solid rgba(165,125,65,0.18)', overflowY: 'auto',
      background: 'rgba(250,246,234,0.92)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    }}>
      {/* 旅遊計畫資訊 */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14 }}>
          {t('board.sidebar.tripInfo')}
        </p>
        <div className="glass-card" style={{ padding: '20px 18px' }}>
          <div style={{ marginBottom: 10, color: 'var(--text-primary)' }}><Map size={22} /></div>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>
            {trip?.name}
          </h2>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            {trip?.startDate}<br />{trip?.endDate}
          </p>
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 14,
            background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.28)',
            fontSize: 14, fontWeight: 900, color: 'var(--accent)', textAlign: 'center',
          }}>
            <CalendarDays size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {t('board.sidebar.totalDays', { n: trip ? getTripDuration(trip.startDate, trip.endDate) : 0 })}
          </div>
          {/* 背景圖縮圖 */}
          {trip?.backgroundImage && (
            <img src={trip.backgroundImage} alt="" style={{
              marginTop: 12, width: '100%', height: 80,
              objectFit: 'cover', borderRadius: 12,
            }} />
          )}
        </div>
      </div>

      {/* 地圖 / 天氣 */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          {t('board.sidebar.mapWeather')}
        </p>
        <MapErrorBoundary lang={lang}>
          <DayMapView trip={trip} cards={cards} mapHeight={180} />
        </MapErrorBoundary>
      </div>

      {/* 類別統計 */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14 }}>
          {t('board.sidebar.stats')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(CATEGORY).map(([key, cfg]) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 16,
              background: cfg.bg, border: `2px solid ${cfg.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <cfg.IconComp size={18} weight="regular" color={cfg.color} />
                <span style={{ fontSize: 14, fontWeight: 900, color: cfg.color }}>{t('category.' + key)}</span>
              </div>
              <span style={{
                fontSize: 16, fontWeight: 900, color: cfg.color,
                background: `${cfg.color}22`, borderRadius: 10, padding: '3px 10px',
                border: `1.5px solid ${cfg.border}`,
              }}>
                {counts[key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>


      {/* 頁面導覽 */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          {t('board.sidebar.nav')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { IconComp: ClipboardList, label: t('board.sidebar.todos'), path: `/trip/${tripId}/todos`, color: '#B45309', bg: 'rgba(180,83,9,0.08)', border: 'rgba(180,83,9,0.25)' },
            { IconComp: Package, label: t('board.sidebar.packing'), path: `/trip/${tripId}/packing`, color: '#0F766E', bg: 'rgba(15,118,110,0.08)', border: 'rgba(15,118,110,0.25)' },
          ].map(nav => (
            <button key={nav.path} onClick={() => navigate(nav.path)} style={{
              width: '100%', padding: '11px 14px', borderRadius: 14, textAlign: 'left',
              background: nav.bg, border: `1.5px solid ${nav.border}`,
              color: 'var(--text-primary)', fontSize: 13, fontWeight: 900, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 9,
              boxShadow: `0 2px 0 ${nav.border}`,
            }}>
              <nav.IconComp size={16} />
              {nav.label}
              <span style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.5 }}>→</span>
            </button>
          ))}
        </div>
      </div>

      {/* 底部快捷按鈕 */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn-game btn-ghost" style={{ padding: '12px', fontSize: 13, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={onShowExpense}>
          <HdWallet size={15} style={{ marginRight: 6 }} /> {t('board.sidebar.expenses')}
        </button>
        <button className="btn-game btn-ghost" style={{ padding: '12px', fontSize: 13, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={onShowSettings}>
          <Settings2 size={15} style={{ marginRight: 6 }} /> {t('board.sidebar.settings')}
        </button>
        <button className="btn-game btn-ghost" style={{ padding: '12px', fontSize: 13, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          data-tutorial-id="export-pdf-btn"
          onClick={onExportPDF}>
          <FileText size={15} style={{ marginRight: 6 }} /> {t('board.sidebar.exportPDF')}
        </button>
      </div>
    </div>
  )
}

// ── TopBar ──────────────────────────────────
function TopBar({ trip, tripId, onShowSettings, isMobile, onToggleSidebar, sidebarOpen, toggleMode, isMobileMode }) {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied]       = useState(false)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: isMobile ? '0 16px' : '0 28px',
      height: isMobile ? 58 : 66, flexShrink: 0,
      background: 'rgba(250, 246, 234, 0.97)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '2px solid rgba(165,125,65,0.22)',
      boxShadow: '0 4px 24px rgba(120,80,20,0.10)',
      position: 'relative', zIndex: 40,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
        {/* Logo — 點擊返回首頁 */}
        <div
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}
        >
          <img src="/favicon.svg" alt="TripTogether" style={{ width: isMobile ? 30 : 34, height: isMobile ? 30 : 34 }} />
          {!isMobile && (
            <>
              <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1, whiteSpace: 'nowrap' }}>
                Trip<span style={{ color: '#7C3AED' }}>Together</span>
              </span>
              <span style={{
                fontSize: 10, fontWeight: 800,
                color: '#7C3AED',
                background: 'rgba(124,58,237,0.12)',
                border: '1px solid rgba(124,58,237,0.28)',
                borderRadius: 99,
                padding: '2px 7px',
                letterSpacing: '0.3px',
                alignSelf: 'center',
              }}>Beta</span>
            </>
          )}
        </div>
        {/* 手機：側欄切換 */}
        {isMobile && (
          <button onClick={onToggleSidebar} style={{
            width: 38, height: 38, borderRadius: 12, border: '1.5px solid rgba(139,92,246,0.3)',
            background: sidebarOpen ? 'rgba(180,100,20,0.12)' : 'var(--bg-surface)',
            color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {sidebarOpen ? '✕' : '☰'}
          </button>
        )}
        {/* 分隔線 */}
        <div style={{ width: 1, height: 24, background: 'rgba(165,125,65,0.25)', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <h1 title={trip?.name} style={{ fontSize: isMobile ? 14 : 17, fontWeight: 900, color: 'var(--text-primary)',
            lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: isMobile ? 130 : 'none' }}>
            {trip?.name || t('board.title.loading')}
          </h1>
          {trip && !isMobile && (
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginTop: 2 }}>
              {trip.startDate} – {trip.endDate}　·　{t('board.sidebar.totalDays', { n: getTripDuration(trip.startDate, trip.endDate) })}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: isMobile ? 6 : 10, alignItems: 'center', position: 'relative' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {toggleMode && (
            <button onClick={toggleMode} style={{
              padding: isMobile ? '8px 10px' : '10px 14px', borderRadius: 10,
              border: '1.5px solid rgba(165,125,65,0.28)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)', fontSize: 11, fontWeight: 900,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            }}>{isMobileMode ? <Monitor size={13} /> : <Smartphone size={13} />} {isMobileMode ? t('board.pcMode') : t('board.mobileMode')}</button>
          )}
          <CopyLinkButton />
          <FullscreenButton />
          <NotificationBell isMobile={isMobile} />
          <button className="btn-game btn-ghost"
            style={{ padding: isMobile ? '8px 10px' : '10px 14px', fontSize: 14,
              display: 'flex', alignItems: 'center' }}
            onClick={onShowSettings}><Settings2 size={18} /></button>
        </div>
      </div>
    </div>
  )
}

// ── 浮動新增按鈕（Speed Dial） ──────────────────
function FloatingAddButton({ onAddCard, onAddExpense, bottom = 36, size = 68, iconSize = 28, tutorialId }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  const menuItems = [
    { IconComp: HdWallet, label: t('board.fab.expense'), color: '#059669', shadow: '#065F46', action: onAddExpense },
    { IconComp: HdMapPin, label: t('board.addCard'),     color: '#B45309', shadow: '#7C2D12', action: onAddCard },
  ]

  const fabBottom = typeof bottom === 'string' ? bottom : bottom
  const menuBottom = typeof bottom === 'string'
    ? `calc(${bottom} + ${size + 16}px)`
    : bottom + size + 16

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 48 }} />
      )}

      {open && (
        <div style={{
          position: 'fixed', bottom: menuBottom,
          right: 'max(24px, env(safe-area-inset-right, 24px))',
          zIndex: 49, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end',
        }}>
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.action() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px 9px 13px', borderRadius: 99,
                background: 'rgba(255,252,244,0.98)',
                border: `2px solid ${item.color}55`,
                boxShadow: `0 3px 0 ${item.color}25, 0 6px 18px ${item.color}22`,
                color: item.color, fontSize: 13, fontWeight: 900, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <item.IconComp size={17} color={item.shadow} />
              {item.label}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn-game fab-safe"
        data-tutorial-id={tutorialId}
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', bottom: fabBottom, right: 'max(24px, env(safe-area-inset-right, 24px))',
          width: size, height: size, borderRadius: '50%', padding: 0,
          background: open
            ? 'linear-gradient(135deg,#6B7280,#4B5563)'
            : 'linear-gradient(135deg,#E8A020,#B45309)',
          boxShadow: open
            ? '0 5px 0 #374151, 0 10px 28px rgba(75,85,99,0.40)'
            : '0 7px 0 #78350F, 0 12px 35px rgba(180,83,9,0.45)',
          border: 'none', color: '#fff', cursor: 'pointer', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s, box-shadow 0.2s',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', lineHeight: 0 }}>
          <HdPlus size={iconSize} />
        </span>
      </button>
    </>
  )
}

// ── 清單視圖 ──────────────────────────────────
const CARD_TYPE_ICON = { attraction: '📍', transport: '🚌' }

function ListView({ cards, trip, onCardClick, onDeleteCard }) {
  const { t, lang } = useLanguage()
  const days = getDaysInRange(trip.startDate, trip.endDate)
  const WEEKDAYS = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 40px' }}>
      {days.map((day, di) => {
        const dayCards = cards.filter(c => c.day === day).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
        const date = new Date(day + 'T00:00:00')
        const label = `${date.getMonth()+1}/${date.getDate()} ${WEEKDAYS[date.getDay()]}`
        return (
          <div key={day} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)',
                background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.22)',
                padding: '3px 9px', borderRadius: 99 }}>DAY {di+1}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{label}</span>
            </div>
            {dayCards.length === 0 ? (
              <div style={{ padding: '14px 16px', borderRadius: 14, border: '1.5px dashed rgba(165,125,65,0.20)',
                fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('board.noCards')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayCards.map(card => {
                  const cfg = CATEGORY[card.type] ?? CATEGORY.attraction
                  const isPending = pendingDeleteId === card.id
                  return (
                    <div key={card.id} onClick={() => { if (!isPending) onCardClick(card) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 14, cursor: isPending ? 'default' : 'pointer',
                        background: isPending ? 'rgba(254,242,242,0.97)' : cfg.bg,
                        border: isPending ? '1.5px solid rgba(220,38,38,0.30)' : `1.5px solid ${cfg.border}`,
                        borderLeft: `5px solid ${isPending ? '#EF4444' : cfg.color}`,
                        boxShadow: '0 2px 8px rgba(100,60,10,0.07)',
                        transition: 'transform 0.1s, box-shadow 0.1s',
                      }}
                      onMouseEnter={e => { if (!isPending) { e.currentTarget.style.transform = 'translateX(3px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${cfg.color}22` } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(100,60,10,0.07)' }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', width: 46, flexShrink: 0 }}>
                        {card.startTime}
                      </span>
                      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><cfg.IconComp size={18} weight="regular" color={cfg.color} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: isPending ? '#DC2626' : cfg.color,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isPending ? t('board.deleteCard', { title: card.title }) : card.title}
                        </div>
                        {!isPending && (
                          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {card.type === 'transport' && card.from && card.to
                              ? `${card.from} → ${card.to}`
                              : card.type === 'attraction' && card.address
                              ? card.address
                              : card.content ?? ''}
                          </div>
                        )}
                      </div>
                      {isPending ? (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setPendingDeleteId(null)}
                            style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 900,
                              border: '1.5px solid rgba(165,125,65,0.25)', background: 'var(--bg-elevated)',
                              color: 'var(--text-muted)', cursor: 'pointer' }}>{t('common.cancel')}</button>
                          <button onClick={() => { onDeleteCard(card.id); setPendingDeleteId(null) }}
                            style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 900,
                              border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer' }}>{t('common.delete')}</button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setPendingDeleteId(card.id) }}
                          style={{ flexShrink: 0, background: 'rgba(220,38,38,0.10)',
                            border: '1.5px solid rgba(220,38,38,0.25)', borderRadius: 8,
                            padding: '4px 9px', cursor: 'pointer', color: '#DC2626',
                            display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 手機版：頂部欄 ──────────────────────────
function MobileTopBar({ trip, tripId, navigate, onSettings, toggleMode, isMobileMode }) {
  const { t } = useLanguage()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 14px', height: 52, flexShrink: 0,
      background: 'rgba(250,246,234,0.97)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '2px solid rgba(165,125,65,0.22)',
      boxShadow: '0 4px 16px rgba(120,80,20,0.10)',
      position: 'relative', zIndex: 40,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <button onClick={() => navigate('/')} style={{
          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
          border: '1.5px solid rgba(165,125,65,0.28)',
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{ minWidth: 0 }}>
          <div title={trip?.name} style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {trip?.name || t('common.loading')}
          </div>
          {trip && (
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)' }}>
              {trip.startDate} – {trip.endDate}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <NotificationBell isMobile={true} />
        <button onClick={toggleMode} style={{
          padding: '5px 9px', borderRadius: 9,
          border: '1.5px solid rgba(165,125,65,0.28)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-muted)', fontSize: 10, fontWeight: 900, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>{isMobileMode ? <Monitor size={12} /> : <Smartphone size={12} />} {isMobileMode ? t('board.pcMode') : t('board.mobileMode')}</button>
      </div>
    </div>
  )
}

// ── 手機版：日期 Tab 欄 ─────────────────────
const WEEKDAYS_SHORT_ZH = ['日','一','二','三','四','五','六']
const WEEKDAYS_SHORT_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function DayTabBar({ trip, mobileDay, onSelect, searchVisible, onSearchToggle }) {
  const { t, lang } = useLanguage()
  const WEEKDAYS_SHORT = lang === 'zh' ? WEEKDAYS_SHORT_ZH : WEEKDAYS_SHORT_EN
  const days    = trip ? getDaysInRange(trip.startDate, trip.endDate) : []
  const todayStr = getLocalDateStr()
  const tabsRef  = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    if (activeRef.current && tabsRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
  }, [mobileDay])

  return (
    <div style={{
      borderBottom: '2px solid rgba(165,125,65,0.18)',
      background: 'rgba(250,246,234,0.95)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      flexShrink: 0, position: 'relative', zIndex: 35,
    }}>
      <div ref={tabsRef} style={{
        display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
        padding: '0 4px',
      }}>
        {/* 總覽 tab */}
        {[{ key: null, label: t('board.overview.tab'), isToday: false },
          ...days.map((day, i) => {
            const d = new Date(day + 'T00:00:00')
            return { key: day, label: `D${i+1}\n${d.getMonth()+1}/${d.getDate()} ${WEEKDAYS_SHORT[d.getDay()]}`, isToday: day === todayStr }
          })
        ].map(({ key, label, isToday }, tabIdx) => {
          const isActive = mobileDay === key
          const lines = label.split('\n')
          return (
            <button
              key={key ?? 'overview'}
              ref={isActive ? activeRef : null}
              data-tutorial-id={key === null ? 'overview-tab' : tabIdx === 1 ? 'day-1-tab' : undefined}
              onClick={() => onSelect(key)}
              style={{
                flexShrink: 0, padding: '8px 14px', border: 'none', cursor: 'pointer',
                background: 'transparent',
                borderBottom: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                position: 'relative',
              }}
            >
              {lines.length === 1 ? (
                <span style={{ fontSize: 13, fontWeight: isActive ? 900 : 700,
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {lines[0]}
                </span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 900,
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>{lines[0]}</span>
                  <span style={{ fontSize: 10, fontWeight: 700,
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{lines[1]}</span>
                </div>
              )}
              {isToday && (
                <span style={{ position: 'absolute', top: 5, right: 5, width: 5, height: 5,
                  borderRadius: '50%', background: '#D97706', display: 'block' }} />
              )}
            </button>
          )
        })}
        {/* 搜尋 tab */}
        <button onClick={onSearchToggle} style={{
          flexShrink: 0, padding: '8px 12px', border: 'none', cursor: 'pointer',
          background: 'transparent', marginLeft: 'auto',
          borderBottom: searchVisible ? '1px solid var(--accent)' : '1px solid transparent',
          color: searchVisible ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Search size={16} /></button>
      </div>
    </div>
  )
}

// ── 手機版：底部導覽欄 ──────────────────────
function MobileBottomBar({ tripId, navigate, onExpense, onSettings, mobileDay }) {
  const { t } = useLanguage()
  const items = [
    { IconComp: CheckSquare, label: t('board.fab.todo'),     tutorialId: 'todo-btn',      action: () => navigate(`/trip/${tripId}/todos`, { state: { returnDay: mobileDay } }) },
    { IconComp: Package,     label: t('board.fab.packing'),  tutorialId: 'packing-btn',   action: () => navigate(`/trip/${tripId}/packing`, { state: { returnDay: mobileDay } }) },
    { IconComp: HdWallet,    label: t('board.fab.expense'),  tutorialId: 'expense-btn',   action: onExpense },
    { IconComp: Settings2,   label: t('board.settings'),     tutorialId: 'settings-btn',  action: onSettings },
  ]
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'rgba(250,246,234,0.97)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: '2px solid rgba(165,125,65,0.22)',
      display: 'flex',
      paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))',
    }}>
      {items.map(({ IconComp, label, tutorialId, action }) => (
        <button key={label} data-tutorial-id={tutorialId} onClick={action} style={{
          flex: 1, padding: '10px 0 8px', border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 3, color: 'var(--text-muted)',
        }}>
          <IconComp size={20} />
          <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)' }}>{label}</span>
        </button>
      ))}
    </div>
  )
}

// ── 手機版：總覽內容 ───────────────────────
// ── 當天行程地圖 ─────────────────────────────
class MapErrorBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('[MapErrorBoundary]', error, info) }
  render() {
    if (this.state.hasError) {
      const prefix = this.props.lang === 'en' ? '⚠️ Map component error: ' : '⚠️ 地圖元件錯誤：'
      return (
        <div style={{
          margin: '4px 0 8px', padding: '10px 12px', borderRadius: 12,
          background: 'rgba(254,242,242,0.95)', border: '1.5px solid rgba(239,68,68,0.28)',
          fontSize: 11, color: '#B91C1C', lineHeight: 1.5,
        }}>
          {prefix}{this.state.error?.message ?? 'render error'}
        </div>
      )
    }
    return this.props.children
  }
}

function wxEmoji(code) {
  if (code == null) return '🌡️'
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  return '⛈️'
}
function wxDesc(code, t) {
  if (code == null) return ''
  if (code === 0) return t('weather.sunny')
  if (code <= 3) return t('weather.cloudy')
  if (code <= 48) return t('weather.foggy')
  if (code <= 67) return t('weather.rainy')
  if (code <= 77) return t('weather.snowy')
  if (code <= 82) return t('weather.drizzle')
  return t('weather.thunderstorm')
}

function DayMapView({ trip, cards, mapHeight = 230, day }) {
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState(null)
  const [weather, setWeather] = useState(null)
  const [weatherError, setWeatherError] = useState(null)
  const { tutorialActive } = useTutorial()
  const { t, lang } = useLanguage()

  const todayStr  = getLocalDateStr()
  const nowHHMM   = new Date().toTimeString().slice(0, 5)
  const WEEKDAYS  = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN

  const days = (trip?.startDate && trip?.endDate) ? getDaysInRange(trip.startDate, trip.endDate) : []

  // Smart active day: walk through trip days, find the first one with non-completed cards
  const computedDay = (() => {
    if (!trip?.startDate) return todayStr
    if (todayStr < trip.startDate) return trip.startDate
    if (todayStr > (trip.endDate ?? '')) return trip.endDate ?? todayStr
    let fallback = trip.startDate
    for (const d of days) {
      const dc = Array.isArray(cards) ? cards.filter(c => c.day === d) : []
      if (!dc.length) continue
      fallback = d
      if (d > todayStr) return d
      if (d === todayStr) {
        const hasActive = dc.some(c => {
          if (!c.startTime) return true
          const [h, mo] = c.startTime.split(':').map(Number)
          const endMin = h * 60 + mo + (c.duration ?? 60)
          const eStr = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
          return nowHHMM < eStr
        })
        if (hasActive) return d
      }
      // past day, or today fully ended → keep as fallback, keep looking forward
    }
    return fallback
  })()
  const activeDay = day ?? computedDay

  const activeDayIdx  = days.indexOf(activeDay)
  const activeDayDate = new Date(activeDay + 'T00:00:00')
  const activeDayLabel = `${activeDayDate.getMonth()+1}/${activeDayDate.getDate()} ${WEEKDAYS[activeDayDate.getDay()]}`
  const isTripFuture  = trip?.startDate ? todayStr < trip.startDate : false
  const isTripPast    = trip?.endDate ? todayStr > trip.endDate : false
  const statusText    = isTripFuture ? t('board.status.upcoming') : isTripPast ? t('board.status.ended') : t('board.status.ongoing')
  const statusColor   = isTripFuture ? '#0EA5E9'  : isTripPast ? '#94A3B8' : '#10B981'

  const TUTORIAL_FALLBACK = useMemo(() => tutorialActive ? (
    lang === 'en' ? [
      { id: 'tf1', type: 'attraction', title: 'Senso-ji Temple', startTime: '10:00', lat: 35.7148, lng: 139.7967, isFuture: false },
      { id: 'tf2', type: 'restaurant', title: 'Ichiran Ramen', startTime: '12:00', lat: 35.6951, lng: 139.7037, isFuture: false },
      { id: 'tf3', type: 'attraction', title: 'Tokyo Skytree', startTime: '14:00', lat: 35.7101, lng: 139.8107, isFuture: false },
      { id: 'tf4', type: 'attraction', title: 'Shibuya Crossing', startTime: '16:30', lat: 35.6595, lng: 139.7004, isFuture: false },
    ] : [
      { id: 'tf1', type: 'attraction', title: '龍山寺', startTime: '10:00', lat: 25.0373, lng: 121.4999, isFuture: false },
      { id: 'tf2', type: 'restaurant', title: '鼎泰豐', startTime: '12:00', lat: 25.0420, lng: 121.5635, isFuture: false },
      { id: 'tf3', type: 'attraction', title: '台北101', startTime: '14:00', lat: 25.0339, lng: 121.5645, isFuture: false },
      { id: 'tf4', type: 'attraction', title: '象山步道', startTime: '16:30', lat: 25.0253, lng: 121.5746, isFuture: false },
    ]
  ) : [], [tutorialActive, lang])

  const dayCards = useMemo(() => {
    if (!Array.isArray(cards)) return TUTORIAL_FALLBACK
    const filtered = cards
      .filter(c => c.day === activeDay && c.lat != null && c.lng != null)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
      .map(c => {
        const isFuture = isTripFuture ? true : isTripPast ? false : (c.startTime ?? '') > nowHHMM
        return { ...c, isFuture }
      })
    return filtered.length > 0 ? filtered : TUTORIAL_FALLBACK
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, activeDay, isTripFuture, isTripPast, TUTORIAL_FALLBACK])

  // 天氣優先使用當天有座標的卡片，找不到才 fallback 到任意天（教學模式備用台北座標）
  const wxLat = useMemo(() => {
    if (!Array.isArray(cards)) return tutorialActive ? 25.0373 : null
    const dayCard = cards.find(c => c.day === activeDay && c.lat != null)
    const anyCard = cards.find(c => c.lat != null)
    return (dayCard ?? anyCard)?.lat ?? (tutorialActive ? 25.0373 : null)
  }, [cards, activeDay, tutorialActive])
  const wxLng = useMemo(() => {
    if (!Array.isArray(cards)) return tutorialActive ? 121.4999 : null
    const dayCard = cards.find(c => c.day === activeDay && c.lng != null)
    const anyCard = cards.find(c => c.lng != null)
    return (dayCard ?? anyCard)?.lng ?? (tutorialActive ? 121.4999 : null)
  }, [cards, activeDay, tutorialActive])

  useEffect(() => {
    if (wxLat == null || wxLng == null) return
    setWeatherError(null)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${wxLat}&longitude=${wxLng}&current=temperature_2m,weather_code,wind_speed_10m&wind_speed_unit=kmh&timezone=auto`)
      .then(r => r.json())
      .then(d => {
        if (d?.current) {
          setWeather(d.current)
        } else {
          setWeatherError(t('board.weather.error'))
        }
      })
      .catch(() => setWeatherError(t('board.weather.error')))
  }, [wxLat, wxLng])

  const cacheKey = dayCards.map(c => `${c.id}${c.lat}${c.lng}`).join(',')

  useEffect(() => {
    if (!mapRef.current || dayCards.length === 0) return
    setReady(false)
    setMapError(null)

    loadGoogleMaps().then(google => {
      if (!mapRef.current) return

      mapObj.current = new google.maps.Map(mapRef.current, {
        zoom: 13,
        center: { lat: dayCards[0].lat, lng: dayCards[0].lng },
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        zoomControl: false,
        gestureHandling: 'cooperative',
      })

      const bounds = new google.maps.LatLngBounds()

      dayCards.forEach((card, i) => {
        const pos      = { lat: card.lat, lng: card.lng }
        const catColor = CATEGORY[card.type]?.color ?? '#6366F1'
        const pinColor = card.isFuture ? '#94A3B8' : catColor

        bounds.extend(pos)

        const marker = new google.maps.Marker({
          position: pos,
          map: mapObj.current,
          label: { text: String(i + 1), color: card.isFuture ? '#475569' : '#fff',
            fontWeight: '900', fontSize: '13px' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: pinColor,
            fillOpacity: card.isFuture ? 0.55 : 1,
            strokeColor: card.isFuture ? '#64748B' : '#fff',
            strokeWeight: 2.5,
          },
          title: card.title,
          zIndex: card.isFuture ? 1 : 10,
        })

        const iw = new google.maps.InfoWindow({
          content: `<div style="font-size:13px;font-weight:700;color:#1E293B">${card.title}</div>` +
            `<div style="font-size:11px;color:#64748B">${card.startTime ?? ''}` +
            (card.isFuture ? ' · <span style="color:#0EA5E9">' + t('board.map.futureTrip') + '</span>' : '') + '</div>',
        })
        marker.addListener('click', () => iw.open(mapObj.current, marker))
      })

      if (dayCards.length > 1) {
        new google.maps.Polyline({
          path: dayCards.map(c => ({ lat: c.lat, lng: c.lng })),
          geodesic: true,
          strokeColor: '#D97706',
          strokeOpacity: 0.80,
          strokeWeight: 2.5,
          icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 }, offset: '50%' }],
          map: mapObj.current,
        })
        mapObj.current.fitBounds(bounds, { top: 36, right: 24, bottom: 24, left: 24 })
      }
      setReady(true)
    }).catch(e => {
      setMapError(e?.message ?? 'LOAD_FAIL')
      console.error('[DayMapView] Google Maps failed:', e)
    })

    return () => {
      mapObj.current = null
      // 清空 map 容器，避免重新掛載時殘留舊地圖 DOM
      if (mapRef.current) {
        while (mapRef.current.firstChild) {
          mapRef.current.removeChild(mapRef.current.firstChild)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  // 沒有任何位置資料也沒有天氣，整個 section 不顯示（教學模式保留 DOM 供 spotlight 使用）
  // 診斷面板：當地圖或天氣無法顯示時，顯示原因
  const showDebug = wxLat == null || dayCards.length === 0 || mapError || weatherError || (!ready && !mapError && dayCards.length > 0)

  if (wxLat == null && dayCards.length === 0 && !tutorialActive) return (
    <div style={{
      margin: '8px 0 16px', padding: '10px 14px', borderRadius: 12,
      background: 'rgba(250,246,234,0.70)', border: '1px solid rgba(165,125,65,0.18)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        🗺️ {t('board.map.debug.hint')}
      </div>
    </div>
  )

  return (
    <div data-tutorial-id="day-map-section" style={{ marginBottom: 16 }}>
      {/* 標題列 + 天氣 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        {activeDayIdx >= 0 && (
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)',
            background: 'rgba(180,83,9,0.12)', border: '1.5px solid rgba(180,83,9,0.22)',
            padding: '2px 9px', borderRadius: 99, flexShrink: 0 }}>
            D{activeDayIdx + 1}
          </span>
        )}
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>
          {activeDayLabel}
        </span>
        <span style={{ fontSize: 10, fontWeight: 900, color: '#fff',
          background: statusColor, borderRadius: 6, padding: '1px 7px', flexShrink: 0 }}>
          {statusText}
        </span>
        {/* 天氣資訊 — 始終在 DOM 中（wxLat 非 null 時），確保教學步驟能找到元素 */}
        {wxLat != null && (
          <div data-tutorial-id="weather-pill" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 800,
            background: 'rgba(14,165,233,0.10)', border: '1.5px solid rgba(14,165,233,0.18)',
            color: '#38BDF8', flexShrink: 0 }}>
            {weather ? (
              <>
                <span>{wxEmoji(weather.weather_code)}</span>
                <span>{Math.round(weather.temperature_2m)}°C</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 11 }}>
                  {wxDesc(weather.weather_code, t)}
                </span>
                {weather.wind_speed_10m != null && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 10 }}>
                    💨{Math.round(weather.wind_speed_10m)}km/h
                  </span>
                )}
              </>
            ) : weatherError ? (
              <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 700 }}>⚠️ {weatherError}</span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>⏳ {t('board.map.loading')}</span>
            )}
          </div>
        )}
      </div>

      {/* 地圖區 */}
      {dayCards.length > 0 ? (
        <>
          {/* 外層 wrapper — React 的 overlay 放這裡，與 mapRef 分開，避免 removeChild 衝突 */}
          <div style={{
            width: '100%', height: mapHeight, borderRadius: 16, overflow: 'hidden',
            border: '1.5px solid rgba(165,125,65,0.25)',
            background: 'rgba(165,125,65,0.05)',
            position: 'relative',
          }}>
            {/* mapRef div 不放任何 React children — Google Maps 獨占管理此節點 */}
            <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

            {/* Loading overlay — React 管理，與 mapRef 平行 */}
            {!ready && !mapError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 800,
                pointerEvents: 'none' }}>
                <Map size={18} style={{ marginRight: 6 }} /> {t('board.map.loading')}
              </div>
            )}
            {/* Error overlay */}
            {mapError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16,
                background: 'rgba(254,242,242,0.97)' }}>
                <AlertTriangle size={22} color="#EF4444" />
                <span style={{ fontSize: 13, fontWeight: 900, color: '#EF4444', textAlign: 'center' }}>{t('board.map.loadError')}</span>
                <span style={{ fontSize: 11, color: '#B91C1C', textAlign: 'center', wordBreak: 'break-all', maxWidth: '90%',
                  background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '6px 10px',
                  border: '1px solid rgba(239,68,68,0.20)', fontFamily: 'monospace' }}>{mapError}</span>
                <span style={{ fontSize: 10, color: '#92400E', textAlign: 'center', marginTop: 2 }}>
                  wxLat: {wxLat?.toFixed(4)} · {t('board.map.errorApiHint')}
                </span>
              </div>
            )}
          </div>
          {/* 圖例 */}
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {dayCards.map((card, i) => {
              const catColor = CATEGORY[card.type]?.color ?? '#6366F1'
              return (
                <div key={card.id} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                  background: card.isFuture ? 'rgba(148,163,184,0.12)' : `${catColor}18`,
                  border: `1.5px solid ${card.isFuture ? 'rgba(148,163,184,0.28)' : `${catColor}35`}`,
                  color: card.isFuture ? '#64748B' : catColor,
                }}>
                  <span style={{
                    width: 17, height: 17, borderRadius: '50%', fontSize: 10, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: card.isFuture ? '#CBD5E1' : catColor,
                    color: card.isFuture ? '#64748B' : '#fff',
                  }}>{i + 1}</span>
                  {card.startTime ?? ''} · {card.title}
                  {card.isFuture && (
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#0EA5E9',
                      background: 'rgba(14,165,233,0.12)', borderRadius: 4, padding: '1px 4px' }}>{t('board.status.upcoming')}</span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        /* 無地點資料時的提示 */
        <div style={{
          height: 130, borderRadius: 16, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 5,
          border: '1.5px dashed rgba(165,125,65,0.25)',
          background: 'rgba(165,125,65,0.03)',
          padding: '0 16px',
        }}>
          <Map size={28} color="var(--text-muted)" />
          <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-secondary)', textAlign: 'center' }}>
            {t('board.map.noRoute')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: t('board.map.noRouteHint') }} />
        </div>
      )}
    </div>
  )
}

function MobileOverview({ trip, cards, onCardClick, onDeleteCard, onDaySelect, searchQuery }) {
  const { t, lang } = useLanguage()
  const days = getDaysInRange(trip.startDate, trip.endDate)
  const WEEKDAYS = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN
  const todayStr = getLocalDateStr()
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const filteredCards = searchQuery.trim()
    ? cards.filter(c => {
        const TYPE_ZH = { attraction: '景點', restaurant: '餐廳', accommodation: '住宿', transport: '交通', note: '筆記', expense: '消費' }
        const TYPE_EN = { attraction: 'attraction', restaurant: 'restaurant', accommodation: 'accommodation', transport: 'transport', note: 'note', expense: 'expense' }
        const q = searchQuery.toLowerCase()
        return (c.title ?? '').toLowerCase().includes(q)
          || (c.content ?? '').toLowerCase().includes(q)
          || (c.address ?? '').toLowerCase().includes(q)
          || (TYPE_ZH[c.type] ?? '').includes(searchQuery)
          || (TYPE_EN[c.type] ?? '').includes(q)
          || (c.from ?? '').toLowerCase().includes(q)
          || (c.to ?? '').toLowerCase().includes(q)
      })
    : cards

  const totalCards = cards.filter(c => c.type !== 'expense').length
  const [selectedMapDay, setSelectedMapDay] = useState(null)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 12px 16px' }}>
      {/* 當天行程地圖 */}
      {!searchQuery && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {selectedMapDay && (
              <button
                onClick={() => setSelectedMapDay(null)}
                style={{
                  fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 99,
                  border: '1.5px solid rgba(180,83,9,0.35)', background: 'rgba(180,83,9,0.10)',
                  color: '#B45309', cursor: 'pointer',
                }}
              >{t('board.map.auto')}</button>
            )}
          </div>
          <MapErrorBoundary lang={lang}><DayMapView trip={trip} cards={cards} day={selectedMapDay} /></MapErrorBoundary>
        </div>
      )}

      {/* 旅程統計摘要 */}
      {!searchQuery && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 0', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 80, padding: '10px 12px', borderRadius: 14,
            background: 'rgba(180,83,9,0.08)', border: '1.5px solid rgba(180,83,9,0.20)',
            textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{days.length}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)' }}>{t('board.overview.stats.days')}</div>
          </div>
          <div style={{ flex: 1, minWidth: 80, padding: '10px 12px', borderRadius: 14,
            background: 'rgba(15,118,110,0.08)', border: '1.5px solid rgba(15,118,110,0.20)',
            textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0F766E' }}>{totalCards}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)' }}>{t('board.overview.stats.trips')}</div>
          </div>
        </div>
      )}

      {/* 每天的行程列表 */}
      {days.map((day, di) => {
        const dayCards = filteredCards.filter(c => c.day === day)
          .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
        if (searchQuery && dayCards.length === 0) return null
        const date   = new Date(day + 'T00:00:00')
        const label  = `${date.getMonth()+1}/${date.getDate()} ${WEEKDAYS[date.getDay()]}`
        const isToday = day === todayStr

        return (
          <div key={day} style={{ marginBottom: 14 }}>
            {/* 日期標頭 - 可點擊跳到 timeline */}
            <div
              onClick={() => onDaySelect(day)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                background: isToday ? 'rgba(180,83,9,0.10)' : 'rgba(165,125,65,0.06)',
                border: isToday ? '1.5px solid rgba(180,83,9,0.28)' : '1.5px solid rgba(165,125,65,0.15)',
                transition: 'background 0.12s',
              }}
              onTouchStart={e => e.currentTarget.style.background = 'rgba(180,83,9,0.15)'}
              onTouchEnd={e => e.currentTarget.style.background = isToday ? 'rgba(180,83,9,0.10)' : 'rgba(165,125,65,0.06)'}
            >
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)',
                background: 'rgba(180,83,9,0.12)', border: '1.5px solid rgba(180,83,9,0.22)',
                padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>D{di+1}</span>
              <span style={{ fontSize: 14, fontWeight: 900,
                color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}>{label}</span>
              {isToday && <span style={{ fontSize: 10, fontWeight: 900, color: '#fff',
                background: 'var(--accent)', borderRadius: 6, padding: '1px 6px' }}>{t('board.today')}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>
                {dayCards.length > 0 ? t('board.overview.items', { count: dayCards.length }) : t('board.overview.view')}
              </span>
              <button
                onClick={e => { e.stopPropagation(); setSelectedMapDay(day) }}
                title={t('board.map.viewDay')}
                style={{
                  fontSize: 14, background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '0 4px', lineHeight: 1, flexShrink: 0,
                }}
              >🗺️</button>
            </div>

            {/* 卡片列表 */}
            {dayCards.length === 0 ? (
              !searchQuery && (
                <div style={{ padding: '10px 14px', borderRadius: 10,
                  border: '1.5px dashed rgba(165,125,65,0.20)',
                  fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {t('board.noCards')}
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {dayCards.map(card => {
                  const cfg = CATEGORY[card.type] ?? CATEGORY.attraction
                  const isPending = pendingDeleteId === card.id
                  return (
                    <div key={card.id}
                      onClick={() => { if (!isPending) onCardClick(card) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 14px', borderRadius: 13, cursor: isPending ? 'default' : 'pointer',
                        background: isPending ? 'rgba(254,242,242,0.97)' : cfg.bg,
                        border: isPending ? '1.5px solid rgba(220,38,38,0.30)' : `1.5px solid ${cfg.border}`,
                        borderLeft: `5px solid ${isPending ? '#EF4444' : cfg.color}`,
                        boxShadow: '0 2px 8px rgba(100,60,10,0.06)',
                        transition: 'transform 0.1s',
                      }}
                      onTouchStart={e => { if (!isPending) e.currentTarget.style.transform = 'scale(0.98)' }}
                      onTouchEnd={e => e.currentTarget.style.transform = ''}
                    >
                      <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', width: 40, flexShrink: 0 }}>
                        {card.startTime}
                      </span>
                      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><cfg.IconComp size={17} weight="regular" color={cfg.color} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: isPending ? '#DC2626' : cfg.color,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isPending ? t('board.deleteCard', { title: card.title }) : card.title}
                        </div>
                        {!isPending && card.type === 'transport' && card.from && card.to && (
                          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {card.from} → {card.to}
                          </div>
                        )}
                      </div>
                      {isPending ? (
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setPendingDeleteId(null)}
                            style={{ padding: '5px 9px', borderRadius: 8, fontSize: 12, fontWeight: 900,
                              border: '1.5px solid rgba(165,125,65,0.25)', background: 'var(--bg-elevated)',
                              color: 'var(--text-muted)', cursor: 'pointer', minHeight: 34 }}>{t('common.cancel')}</button>
                          <button onClick={() => { onDeleteCard(card.id); setPendingDeleteId(null) }}
                            style={{ padding: '5px 9px', borderRadius: 8, fontSize: 12, fontWeight: 900,
                              border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', minHeight: 34 }}>{t('common.delete')}</button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setPendingDeleteId(card.id) }}
                          style={{ flexShrink: 0, background: 'rgba(220,38,38,0.10)',
                            border: '1.5px solid rgba(220,38,38,0.25)', borderRadius: 8,
                            padding: '5px 10px', cursor: 'pointer', color: '#DC2626',
                            minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────
export default function TripBoard() {
  const { tripId } = useParams()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { currentUser } = useAuth()
  const { isMobile } = useWindowSize()
  const { isMobileMode, toggleMode } = useViewMode()
  const { tutorialActive, currentStepData, nextStep } = useTutorial()
  const { t, lang } = useLanguage()
  const [trip, setTrip]                   = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [cards, setCards]                 = useState([])
  const [modal, setModal]                 = useState(null)   // { day, time } | { editCard }
  const [draggingCard, setDraggingCard]   = useState(null)
  const [detailCard, setDetailCard]       = useState(null)
  const [showSettings, setShowSettings]   = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [droppedCardId, setDroppedCardId]     = useState(null)
  const [shakingCardIds, setShakingCardIds]   = useState([])
  const [viewMode, setViewMode]           = useState('timeline') // 'timeline' | 'list'
  const [pdfToast, setPdfToast]           = useState(false)
  // Bug #10/#12：全域 toast 系統
  const [toast, setToast]                 = useState(null) // { message, kind }
  const showToast = useCallback((message, kind = 'info') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3500)
  }, [])
  // Mobile-only state — persisted so navigating to checklist/packing and back restores the selected day
  const mobileDayKey = `board-mobile-day-${tripId}`
  // LINE WebView on iOS may throw SecurityError on sessionStorage access — guard all calls
  const ssGet = (key) => { try { return sessionStorage.getItem(key) } catch { return null } }
  const ssSet = (key, val) => { try { sessionStorage.setItem(key, val) } catch { /* ignore */ } }
  const ssRemove = (key) => { try { sessionStorage.removeItem(key) } catch { /* ignore */ } }
  const [mobileDay, setMobileDayRaw] = useState(() => {
    // Prefer navigation state (passed from ChecklistPage on back) for reliability
    const stateDay = location.state?.returnDay
    if (stateDay) {
      ssSet(`board-mobile-day-${tripId}`, stateDay)
      return stateDay
    }
    return ssGet(`board-mobile-day-${tripId}`)
  })
  const setMobileDay = useCallback((day) => {
    if (day === null) ssRemove(mobileDayKey)
    else ssSet(mobileDayKey, day)
    setMobileDayRaw(day)
  }, [mobileDayKey])
  const [mobileSearchVisible, setMobileSearchVisible] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  useEffect(() => {
    // Bug #13：加 cancelled 旗標，避免 async getTrip 完成後 useEffect 已 unmount 卻仍建立訂閱洩漏
    let cancelled = false
    let unsubCards = null
    let unsubTrip = null

    if (!currentUser?.uid) return
    getTrip(tripId)
      .then(async data => {
        if (cancelled) return
        // 若 trip 有 members 欄位，檢查目前用戶是否是成員
        if (data.members?.length && currentUser && !data.members.includes(currentUser.uid)) {
          setError(t('board.error.notMember'))
          setLoading(false)
          return
        }
        setTrip(data)
        updateTripLastVisited(tripId).catch(() => {})
        // Initialize mobile day: restore saved day if valid, else today or overview
        const todayStr = getLocalDateStr()
        const tripDays = getDaysInRange(data.startDate, data.endDate)
        const savedDay = ssGet(mobileDayKey)
        if (savedDay && tripDays.includes(savedDay)) {
          // Restore the day the user was on before navigating away
        } else {
          setMobileDay(tripDays.includes(todayStr) ? todayStr : null)
        }

        // 訂閱即時卡片更新（Bug #9：加 error handler，trip 被刪時導向首頁）
        unsubCards = subscribeToCards(tripId, (liveCards) => {
          setCards(liveCards)
        }, (err) => {
          if (err.code === 'permission-denied' || err.code === 'not-found') {
            setError(t('board.error.deleted'))
            setTimeout(() => navigate('/'), 3000)
          }
        })

        // Bug #10/#12：訂閱 trip doc 本身
        // - 若 trip doc 不存在：其他人刪了 trip → toast + 導向首頁
        // - 若目前使用者不在 members 內：被踢出 → toast + 導向首頁
        unsubTrip = onSnapshot(doc(db, 'trips', tripId), (snap) => {
          if (!snap.exists()) {
            // Bug #10
            showToast(t('board.toast.tripDeleted'), 'warning')
            setTimeout(() => navigate('/', { replace: true }), 1500)
            return
          }
          const latest = snap.data()
          setTrip(prev => prev ? { ...prev, ...latest } : { code: tripId, ...latest })
          // Bug #26：currentUser.uid 尚未就緒時（例如 auth 還在載入），不要誤判為被踢出
          if (!currentUser?.uid) return
          if (Array.isArray(latest.members) && !latest.members.includes(currentUser.uid)) {
            // Bug #12
            showToast(t('board.toast.kicked'), 'warning')
            setTimeout(() => navigate('/', { replace: true }), 1500)
          }
        }, (err) => {
          if (err.code === 'permission-denied' || err.code === 'not-found') {
            showToast(t('board.toast.accessLost'), 'warning')
            setTimeout(() => navigate('/', { replace: true }), 1500)
          }
        })

        // 若在建立訂閱過程中已 cancel，立即清掉
        if (cancelled) {
          unsubCards?.()
          unsubTrip?.()
          unsubCards = null
          unsubTrip = null
        }
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      unsubCards?.()
      unsubTrip?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, navigate, currentUser?.uid])

  useEffect(() => {
    if (trip?.isDemoTrip && !tutorialActive) {
      navigate('/', { replace: true })
    }
  }, [trip, tutorialActive, navigate])

  // 教學拖曳步驟：自動切換到第一天的單日視圖
  useEffect(() => {
    if (!tutorialActive || currentStepData?.id !== 'drag-drop' || !trip) return
    const firstDay = getDaysInRange(trip.startDate, trip.endDate)[0]
    if (firstDay && mobileDay !== firstDay) setMobileDay(firstDay)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialActive, currentStepData?.id, trip])

  // 教學 export-pdf 步驟：自動打開設定選單
  useEffect(() => {
    if (tutorialActive && currentStepData?.id === 'export-pdf') {
      setShowSettings(true)
    }
  }, [tutorialActive, currentStepData?.id])

  const handleDragStart = ({ active }) => {
    setDraggingCard(cards.find(c => c.id === active.id) ?? null)
  }

  const triggerDropBounce = useCallback((id) => {
    setDroppedCardId(id)
    setTimeout(() => setDroppedCardId(null), 500)
  }, [])

  const triggerCollisionShake = useCallback((idA, idB) => {
    setShakingCardIds([idA, idB].filter(Boolean))
    setTimeout(() => setShakingCardIds([]), 600)
  }, [])

  // 觸發通知用的 actor 資料
  const actor = useMemo(() => ({
    uid: currentUser?.uid,
    displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
  }), [currentUser?.uid, currentUser?.displayName, currentUser?.email])

  const handleDragEnd = useCallback(async ({ active, delta, over }) => {
    setDraggingCard(null)
    if (!trip) return
    const card = cards.find(c => c.id === active.id)
    if (!card) return

    if (over?.id === 'trash-zone') {
      await deleteCard(tripId, card.id, actor)
      return
    }

    const deltaSlots = Math.round(delta.y / SLOT_HEIGHT)
    const deltaDays  = Math.round(delta.x / DAY_COL_W)
    if (!deltaSlots && !deltaDays) {
      triggerDropBounce(active.id)
      return
    }

    const days = getDaysInRange(trip.startDate, trip.endDate)
    const currentDayIdx = days.indexOf(card.day)
    if (currentDayIdx === -1) { triggerDropBounce(active.id); return }
    const newDayIdx = Math.max(0, Math.min(days.length - 1, currentDayIdx + deltaDays))
    const newDay    = days[newDayIdx]
    const newMin    = Math.max(START_HOUR * 60, Math.min((END_HOUR - 0.5) * 60,
      timeToMinutes(card.startTime) + deltaSlots * 30))
    const newEnd    = newMin + card.duration

    // 碰撞檢測：確認目標時間段沒有其他卡片
    const colliding = cards.find(c =>
      c.id !== card.id &&
      c.day === newDay &&
      timeToMinutes(c.startTime) < newEnd &&
      timeToMinutes(c.startTime) + c.duration > newMin
    )

    if (colliding) {
      triggerCollisionShake(card.id, colliding.id)
      showToast(t('board.toast.dragCollision'), 'warning')
      return
    }

    triggerDropBounce(active.id)
    // 拖曳只是位置調整，通知會過度干擾其他成員 → 不觸發通知
    await updateCard(tripId, card.id, {
      day: newDay,
      startTime: minutesToTime(newMin),
    })
    if (tutorialActive && currentStepData?.id === 'drag-drop') nextStep()
  }, [trip, cards, tripId, tutorialActive, currentStepData, nextStep, actor])

  const handleAddCard = useCallback(async (data, pendingNearby) => {
    const newId = await addCard(tripId, data, actor)

    if (pendingNearby) {
      const mainStart = timeToMinutes(data.startTime)
      const nearbyDuration = 30
      const nearbyStart = pendingNearby.position === 'before'
        ? Math.max(0, mainStart - nearbyDuration)
        : mainStart + (data.duration ?? 60)
      await addCard(tripId, {
        type: 'attraction',
        day: data.day,
        startTime: minutesToTime(nearbyStart),
        duration: nearbyDuration,
        title: pendingNearby.place.name,
        address: pendingNearby.place.address ?? '',
        lat: pendingNearby.place.lat,
        lng: pendingNearby.place.lng,
        placeId: pendingNearby.place.placeId,
        photo: pendingNearby.place.photo ?? null,
        rating: pendingNearby.place.rating ?? null,
      }, actor)
    }
  }, [tripId, actor])

  // 拖曳教學步驟期間禁止打開卡片詳情，避免誤觸導致教學流程中斷
  const handleCardClick = useCallback((card) => {
    if (tutorialActive && currentStepData?.id === 'drag-drop') return
    setDetailCard(card)
  }, [tutorialActive, currentStepData?.id])

  const handleDeleteCard = useCallback(async (id) => {
    await deleteCard(tripId, id, actor)
  }, [tripId, actor])

  const handleEditCard = useCallback(async (updatedCard) => {
    const { id, createdAt, ...updates } = updatedCard
    await updateCard(tripId, id, updates, actor)
    setDetailCard(null)
  }, [tripId, actor])


  const handleUpdateCard = useCallback(async (cardId, updates) => {
    // 小型更新（如附加圖片/待辦/勾選）不觸發通知，避免過度打擾
    await updateCard(tripId, cardId, updates)
  }, [tripId])

  // 讓 detailCard 跟著 Firestore onSnapshot 即時更新；卡片被遠端刪除時自動關閉 Modal
  useEffect(() => {
    if (!detailCard) return
    const updated = cards.find(c => c.id === detailCard.id)
    if (updated) {
      if (
        detailCard.title !== updated.title ||
        detailCard.content !== updated.content ||
        detailCard.startTime !== updated.startTime ||
        detailCard.address !== updated.address ||
        detailCard.duration !== updated.duration
      ) {
        showToast(t('board.toast.cardEditedExternally'), 'warning')
      }
      setDetailCard(updated)
    } else {
      setDetailCard(null) // 卡片已被刪除（協作者刪除），關閉面板
    }
  }, [cards]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBgChange = useCallback((url) => {
    setTrip(prev => prev ? { ...prev, backgroundImage: url } : prev)
  }, [])

  // Bug #28: 用 functional update 避免覆蓋 onSnapshot 帶來的並發欄位變更
  const handleTripUpdate = useCallback((updated) => {
    setTrip(prev => prev ? { ...prev, ...updated } : updated)
  }, [])

  const handleSeedCards = useCallback(async () => {
    if (!trip) return
    const seeds = makeSeedCards(trip.startDate, t)
    // 種子卡片是本地初始化，不觸發通知
    await Promise.all(seeds.map(c => addCard(tripId, c)))
  }, [trip, tripId])

  const handleCopyCard = useCallback(async (card, targetDays) => {
    const { id, createdAt, day, ...cardData } = card
    await Promise.all(targetDays.map(d => addCard(tripId, { ...cardData, day: d }, actor)))
  }, [tripId, actor])

  const handleExportPDF = useCallback(() => {
    setPdfToast(true)
    setTimeout(() => setPdfToast(false), 4000)
    const days = getDaysInRange(trip.startDate, trip.endDate)

    const cardsByDay = days.map(day => ({
      day,
      cards: cards.filter(c => c.day === day).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    }))

    const TYPE_ICON = { attraction: '📍', transport: '🚌' }

    // Bug #31：所有嵌入 HTML 的字串都要 escape，防止 XSS
    const htmlLang = lang === 'en' ? 'en' : 'zh-TW'
    const dateLocale = lang === 'en' ? 'en-US' : 'zh-TW'
    const html = `<!DOCTYPE html>
<html lang="${htmlLang}"><head>
<meta charset="utf-8"/>
<title>${escHtml(trip.name)} — ${t('board.pdf.title')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #2B1709; background: #FAF6ED; padding: 40px; font-size: 13px; }
  h1 { font-size: 28px; font-weight: 900; margin-bottom: 6px; }
  .meta { color: #9E7040; font-size: 13px; font-weight: 700; margin-bottom: 32px; }
  .day-block { margin-bottom: 28px; break-inside: avoid; }
  .day-header { font-size: 16px; font-weight: 900; color: #B45309; border-bottom: 2px solid #D97706; padding-bottom: 8px; margin-bottom: 12px; }
  .card-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid rgba(165,125,65,0.15); }
  .card-time { width: 70px; font-size: 11px; font-weight: 800; color: #9E7040; flex-shrink: 0; padding-top: 2px; }
  .card-icon { font-size: 15px; flex-shrink: 0; }
  .card-title { font-weight: 900; font-size: 13px; margin-bottom: 2px; }
  .card-sub { color: #9E7040; font-size: 11px; font-weight: 700; }
  .footer { margin-top: 40px; text-align: center; color: #9E7040; font-size: 11px; font-weight: 700; }
  @media print { body { padding: 20px; } }
</style>
</head><body>
<h1>✈️ ${escHtml(trip.name)}</h1>
<p class="meta">${escHtml(trip.startDate)} – ${escHtml(trip.endDate)}　${t('board.pdf.totalDays', { n: getTripDuration(trip.startDate, trip.endDate) })}</p>

${cardsByDay.map(({ day, cards: dc }) => dc.length === 0 ? '' : `
<div class="day-block">
  <div class="day-header">🗓️ ${escHtml(day)}</div>
  ${dc.map(c => `
  <div class="card-row">
    <div class="card-time">${escHtml(c.startTime)}</div>
    <div class="card-icon">${escHtml(TYPE_ICON[c.type] ?? '📌')}</div>
    <div>
      <div class="card-title">${escHtml(c.title ?? '')}</div>
      <div class="card-sub">${
        c.type === 'transport' ? (c.from && c.to ? `${escHtml(c.from)} → ${escHtml(c.to)}` : '') :
        c.type === 'attraction' ? escHtml(c.address ?? '') :
        (c.content ? escHtml(c.content.slice(0, 80)) : '')
      }</div>
    </div>
  </div>`).join('')}
</div>`).join('')}


<div class="footer">${t('board.pdf.exportedBy')} · ${escHtml(new Date().toLocaleDateString(dateLocale))}</div>
</body></html>`

    const win = window.open('', '_blank')
    if (!win) {
      showToast(t('settings.pdfPopupBlocked'), 'warning')
      setPdfToast(false)
      return
    }
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }, [trip, cards, t, lang])

  const boardCards = cards.filter(c => c.type !== 'expense')

  const filteredCards = searchQuery.trim()
    ? boardCards.filter(c => {
        const q = searchQuery.toLowerCase()
        return (c.title ?? '').toLowerCase().includes(q)
          || (c.content ?? '').toLowerCase().includes(q)
          || (c.address ?? '').toLowerCase().includes(q)
          || (c.from ?? '').toLowerCase().includes(q)
          || (c.to ?? '').toLowerCase().includes(q)
      })
    : boardCards

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><img src="https://loosedrawing.com/assets/media/illustrations/png/933.png" alt="" style={{ width: 110, objectFit: 'contain' }} /></div>
      <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-secondary)' }}>{t('board.loading')}</p>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24, padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><img src="https://loosedrawing.com/assets/media/illustrations/png/1959.png" alt="" style={{ width: 110, objectFit: 'contain' }} /></div>
      <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>{t('board.error.loadFailed')}</p>
      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)' }}>{error}</p>
      <button className="btn-game btn-primary" style={{ padding: '14px 36px' }} onClick={() => navigate('/')}>{t('board.error.homeReturn')}</button>
    </div>
  )

  // ── 共用 Modal 渲染 (mobile + desktop 都用) ──
  const sharedModals = (
    <>
      {detailCard && (
        <CardDetailModal
          card={detailCard}
          isMobile={isMobileMode}
          tripId={tripId}
          trip={trip}
          onUpdate={handleUpdateCard}
          onClose={() => setDetailCard(null)}
          onDelete={async (id) => { await handleDeleteCard(id); setDetailCard(null) }}
          onEdit={(card) => { setDetailCard(null); setModal({ editCard: card }) }}
          onCopyCard={handleCopyCard}
        />
      )}
      {modal && !modal.editCard && (
        <AddCardModal
          defaultDay={modal.day}
          defaultTime={modal.time}
          tripId={tripId}
          onAdd={handleAddCard}
          onClose={() => setModal(null)}
          existingCards={cards}
        />
      )}
      {modal?.editCard && (
        <AddCardModal
          editCard={modal.editCard}
          defaultDay={modal.editCard.day}
          defaultTime={modal.editCard.startTime}
          tripId={tripId}
          onEdit={handleEditCard}
          onClose={() => setModal(null)}
          existingCards={cards}
        />
      )}
      {showSettings && (
        <SettingsModal
          trip={trip} tripId={tripId}
          onClose={() => setShowSettings(false)}
          onBgChange={handleBgChange}
          onTripUpdate={handleTripUpdate}
          isMobile={isMobileMode}
          cards={cards}
        />
      )}
      {pdfToast && (
        <div style={{
          position: 'fixed', bottom: isMobileMode ? 80 : 90, left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, padding: '12px 22px', borderRadius: 14,
          background: 'rgba(250,246,234,0.97)',
          border: '1.5px solid rgba(165,125,65,0.35)',
          boxShadow: '0 4px 24px rgba(120,80,20,0.20)',
          fontSize: 13, fontWeight: 900, color: 'var(--text-secondary)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          whiteSpace: 'nowrap',
        }}>
          📄 PDF 預覽即將開啟，請在列印對話框選「另存為 PDF」
        </div>
      )}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 400, padding: '12px 22px', borderRadius: 14,
          maxWidth: 'calc(100vw - 32px)',
          background: toast.kind === 'warning' ? 'rgba(254,242,242,0.98)' : 'rgba(250,246,234,0.98)',
          border: toast.kind === 'warning' ? '1.5px solid rgba(220,38,38,0.35)' : '1.5px solid rgba(165,125,65,0.35)',
          boxShadow: '0 8px 32px rgba(80,40,5,0.25)',
          fontSize: 13, fontWeight: 900,
          color: toast.kind === 'warning' ? '#B91C1C' : 'var(--text-secondary)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={16} />
          {toast.message}
        </div>
      )}
    </>
  )

  // ── 手機版佈局 ──────────────────────────────
  if (isMobileMode) {
    const mobileDayCards = mobileDay ? cards.filter(c => c.day === mobileDay) : []
    return (
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        autoScroll={{ threshold: { x: 0.12, y: 0.12 }, speed: { x: 6, y: 6 } }}
      >
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(trip?.backgroundImage ? {
            backgroundImage: `url(${trip.backgroundImage})`,
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
          } : {}),
        }}>
          {/* 手機頂部欄 */}
          <MobileTopBar
            trip={trip} tripId={tripId} navigate={navigate}
            onSettings={() => setShowSettings(true)}
            toggleMode={toggleMode}
            isMobileMode={isMobileMode}
          />

          {/* 日期 Tab 欄 */}
          <DayTabBar
            trip={trip}
            mobileDay={mobileDay}
            onSelect={setMobileDay}
            searchVisible={mobileSearchVisible}
            onSearchToggle={() => setMobileSearchVisible(v => !v)}
          />

          {/* 搜尋欄（可收合） */}
          {mobileSearchVisible && (
            <div style={{ padding: '8px 12px', background: 'rgba(250,246,234,0.95)',
              borderBottom: '1px solid rgba(165,125,65,0.15)', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}><Search size={14} /></span>
                <input
                  className="game-input"
                  type="text"
                  autoFocus
                  placeholder={t('board.searchCards')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 34, paddingTop: 8, paddingBottom: 8, fontSize: 14, width: '100%' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)',
                  }}>✕</button>
                )}
              </div>
            </div>
          )}

          {/* 主內容區 */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {mobileDay === null ? (
              /* 總覽 */
              <MobileOverview
                trip={trip}
                cards={filteredCards}
                onCardClick={handleCardClick}
                onDeleteCard={handleDeleteCard}
                onDaySelect={setMobileDay}
                searchQuery={searchQuery}
              />
            ) : (
              /* 單天 Timeline */
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div data-tutorial-id="drag-zone" style={{
                flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
                margin: '0 8px 0',
                borderRadius: '18px 18px 0 0',
                overflow: 'clip',
                border: '2px solid rgba(165,125,65,0.35)',
                borderBottom: 'none',
                background: 'rgba(242,231,208,0.80)',
                position: 'relative',
              }}>
                <BoardLayout
                  trip={trip}
                  days={[mobileDay]}
                  mobileMode={true}
                  cards={filteredCards}
                  onSlotClick={(day, time) => setModal({ day, time })}
                  onDeleteCard={handleDeleteCard}
                  onCardClick={handleCardClick}
                  droppedCardId={droppedCardId}
                  shakingCardIds={shakingCardIds}
                  firstCardTutorialId={tutorialActive && currentStepData?.id === 'drag-drop' ? 'drag-card' : undefined}
                />
                {mobileDayCards.length === 0 && !searchQuery && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(250,246,234,0.80)',
                    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                    gap: 14, pointerEvents: 'none',
                  }}>
                    <img src="https://loosedrawing.com/assets/media/illustrations/png/1156.png" alt="" style={{ width: 80, objectFit: 'contain' }} />
                    <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-secondary)' }}>{t('board.noCards')}</p>
                    <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>{t('board.longPressHint')}</p>
                  </div>
                )}
              </div>
              </div>
            )}
          </div>

          {/* 底部導覽欄 */}
          <MobileBottomBar
            tripId={tripId}
            navigate={navigate}
            onExpense={() => navigate(`/trip/${tripId}/expenses`, { state: { returnDay: mobileDay } })}
            onSettings={() => setShowSettings(true)}
            mobileDay={mobileDay}
          />

          {/* FAB：單天視圖時才顯示，在底部欄上方 */}
          {mobileDay !== null && (
            <FloatingAddButton
              tutorialId="add-card-fab"
              bottom="calc(126px + env(safe-area-inset-bottom, 0px))"
              size={56}
              iconSize={22}
              onAddCard={() => setModal({ day: mobileDay, time: '09:00' })}
              onAddExpense={() => navigate(`/trip/${tripId}/expenses`, { state: { autoOpen: true } })}
            />
          )}

          <DragOverlay dropAnimation={null}>
            {draggingCard && (
              <div className="card-drag-overlay" style={{ width: 260 }}>
                <CardPreview card={draggingCard} />
              </div>
            )}
          </DragOverlay>
          <TrashZone visible={!!draggingCard} isMobile={true} />
          {sharedModals}
        </div>
      </DndContext>
    )
  }

  // ── 電腦版佈局（原版，加上模式切換按鈕）──────
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      autoScroll={{ threshold: { x: 0.12, y: 0.12 }, speed: { x: 6, y: 6 } }}
    >
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        ...(trip?.backgroundImage ? {
          backgroundImage: `url(${trip.backgroundImage})`,
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        } : {}),
      }}>

        <TopBar
          trip={trip} tripId={tripId}
          isMobile={isMobile}
          isMobileMode={isMobileMode}
          onShowSettings={() => setShowSettings(true)}
          onToggleSidebar={() => setSidebarOpen(v => !v)}
          sidebarOpen={sidebarOpen}
          toggleMode={toggleMode}
        />

        {/* ── 主體 ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* 側欄 overlay（窄螢幕電腦版） */}
          {isMobile && sidebarOpen && (
            <>
              <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.5)' }}
                onClick={() => setSidebarOpen(false)} />
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 31, width: 280 }}>
                <LeftSidebar
                  trip={trip} tripId={tripId} cards={cards}
                  onShowExpense={() => { navigate(`/trip/${tripId}/expenses`); setSidebarOpen(false) }}
                  onShowSettings={() => { setShowSettings(true); setSidebarOpen(false) }}
                  onExportPDF={handleExportPDF}
                />
              </div>
            </>
          )}
          {!isMobile && (
            <LeftSidebar
              trip={trip} tripId={tripId} cards={cards}
              onShowExpense={() => navigate(`/trip/${tripId}/expenses`)}
              onShowSettings={() => setShowSettings(true)}
              onExportPDF={handleExportPDF}
            />
          )}

          {/* 行程表 */}
          <div style={{
            flex: 1,
            padding: isMobile ? '12px 12px 80px' : '24px 28px 24px 20px',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* 搜尋欄 + 視圖切換 */}
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}><Search size={14} /></span>
                <input
                  className="game-input"
                  type="text"
                  placeholder={t('board.searchCards')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 36, paddingTop: 9, paddingBottom: 9, fontSize: 13 }}
                />
              </div>
              {searchQuery && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.22)', padding: '4px 10px', borderRadius: 99 }}>
                    {t('board.searchResults', { count: filteredCards.length })}
                  </span>
                  <button onClick={() => setSearchQuery('')} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                </div>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', borderRadius: 11, overflow: 'hidden', border: '1.5px solid rgba(165,125,65,0.25)', background: 'var(--bg-elevated)', flexShrink: 0 }}>
                {[
                  { mode: 'timeline', IconComp: Clock, label: t('board.viewTimeline') },
                  { mode: 'list',     IconComp: List,  label: t('board.viewList') },
                ].map(({ mode, IconComp, label }) => (
                  <button key={mode} onClick={() => setViewMode(mode)} style={{
                    padding: '7px 13px', fontSize: 12, fontWeight: 900, border: 'none', cursor: 'pointer',
                    background: viewMode === mode ? 'rgba(180,83,9,0.16)' : 'transparent',
                    color: viewMode === mode ? 'var(--accent)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}><IconComp size={13} /> {label}</button>
                ))}
              </div>
            </div>

            {viewMode === 'timeline' ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                borderRadius: isMobile ? 18 : 28,
                border: `${isMobile ? '2px' : '3px'} solid rgba(165,125,65,0.35)`,
                boxShadow:
                  '0 0 0 1px rgba(165,125,65,0.12),' +
                  '0 8px 48px rgba(120,80,20,0.12),' +
                  '0 32px 80px rgba(80,40,5,0.10),' +
                  'inset 0 1px 0 rgba(255,255,255,0.50)',
                background: 'rgba(242, 231, 208, 0.70)',
                position: 'relative',
              }}>
                {trip && (
                  <BoardLayout
                    trip={trip}
                    cards={filteredCards}
                    onSlotClick={(day, time) => setModal({ day, time })}
                    onDeleteCard={handleDeleteCard}
                    onCardClick={handleCardClick}
                    droppedCardId={droppedCardId}
                    shakingCardIds={shakingCardIds}
                  />
                )}
                {cards.length === 0 && !searchQuery && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(250,246,234,0.80)',
                    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                    gap: 14,
                  }}>
                    <img src="https://loosedrawing.com/assets/media/illustrations/png/1156.png" alt="" style={{ width: 86, objectFit: 'contain' }} />
                    <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-secondary)' }}>{t('board.emptyTitle')}</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>
                      {t('board.emptyHint')}
                    </p>
                    <button onClick={handleSeedCards} style={{
                      padding: '11px 26px', borderRadius: 14, fontSize: 13, fontWeight: 900,
                      background: 'linear-gradient(135deg,#D97706,#B45309)',
                      border: 'none', boxShadow: '0 5px 0 #78350F', color: '#fff', cursor: 'pointer',
                    }}><ClipboardList size={14} style={{ marginRight: 6 }} /> {t('board.addSample')}</button>
                  </div>
                )}
              </div>
            ) : (
              trip && (
                <>
                  {cards.length === 0 && !searchQuery ? (
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
                    }}>
                      <img src="https://loosedrawing.com/assets/media/illustrations/png/1156.png" alt="" style={{ width: 86, objectFit: 'contain' }} />
                      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-secondary)' }}>{t('board.emptyTitle')}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>
                        {t('board.emptyHint')}
                      </p>
                      <button onClick={handleSeedCards} style={{
                        padding: '11px 26px', borderRadius: 14, fontSize: 13, fontWeight: 900,
                        background: 'linear-gradient(135deg,#D97706,#B45309)',
                        border: 'none', boxShadow: '0 5px 0 #78350F', color: '#fff', cursor: 'pointer',
                      }}><ClipboardList size={14} style={{ marginRight: 6 }} /> {t('board.addSample')}</button>
                    </div>
                  ) : (
                    <ListView
                      cards={filteredCards}
                      trip={trip}
                      onCardClick={handleCardClick}
                      onDeleteCard={handleDeleteCard}
                    />
                  )}
                </>
              )
            )}
          </div>
        </div>

        <FloatingAddButton
          onAddCard={() => setModal({ day: trip?.startDate ?? '', time: '09:00' })}
          onAddExpense={() => navigate(`/trip/${tripId}/expenses`, { state: { autoOpen: true } })}
        />

        <DragOverlay dropAnimation={null}>
          {draggingCard && (
            <div className="card-drag-overlay" style={{ width: DAY_COL_W - 16 }}>
              <CardPreview card={draggingCard} />
            </div>
          )}
        </DragOverlay>
        <TrashZone visible={!!draggingCard} />
        {sharedModals}
      </div>
    </DndContext>
  )
}
