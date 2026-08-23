import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../services/firebase'
import {
  getTrip, addCard, updateCard, deleteCard, subscribeToCards, updateTrip,
  attachNoteToCard, deleteTrip, leaveTrip, getMemberProfiles, clearAllCards, updateTripPassword,
  updateTripLastVisited,
} from '../services/firestore'
import { useAuth } from '../contexts/AuthContext'
import { X, Plus, Settings2, Trash2 } from 'lucide-react'
import { CopyLinkButton, FullscreenButton } from '../components/ui/TopBarActions'
import { getTripDuration, getDaysInRange } from '../utils/dateUtils'
import BoardLayout from '../components/board/BoardLayout'
import AddCardModal from '../components/modals/AddCardModal'
import CardDetailModal from '../components/modals/CardDetailModal'
import AttachNoteModal from '../components/modals/AttachNoteModal'
import { CardPreview, timeToMinutes, minutesToTime, CATEGORY } from '../components/cards/CardItem'
import { SLOT_HEIGHT, DAY_COL_W, START_HOUR, END_HOUR } from '../components/board/boardConstants'
import { useWindowSize } from '../hooks/useWindowSize'

// ── 範例種子卡片（首次進入時寫入 Firestore）────
function makeSeedCards(firstDay) {
  return [
    { type: 'transport', day: firstDay, startTime: '09:00', duration: 90,
      title: '機場 → 市區', from: '桃園國際機場', to: '台北車站', mode: 'transit' },
    { type: 'attraction', day: firstDay, startTime: '13:00', duration: 120,
      title: '故宮博物院', address: '台北市士林區至善路二段221號' },
    { type: 'expense', day: firstDay, startTime: '12:00', duration: 60,
      title: '午餐', amount: 350, currency: 'TWD' },
    { type: 'note', day: firstDay, startTime: '11:00', duration: 30,
      title: '行前備注', content: '記得帶護照和訂房確認信！' },
  ]
}

const EXPENSE_CAT_LABEL = {
  food: { icon: '🍜', label: '餐飲' },
  transport: { icon: '🚌', label: '交通' },
  accommodation: { icon: '🏨', label: '住宿' },
  shopping: { icon: '🛍️', label: '購物' },
  ticket: { icon: '🎟️', label: '門票' },
  other: { icon: '💼', label: '其他' },
}

const CURRENCY_FLAG_MAP = {
  TWD: '🇹🇼', JPY: '🇯🇵', USD: '🇺🇸', EUR: '🇪🇺',
  KRW: '🇰🇷', HKD: '🇭🇰', SGD: '🇸🇬', AUD: '🇦🇺',
}

// 聚合所有消費：獨立開銷卡 + 各卡片的附加消費
function gatherAllExpenses(cards) {
  const all = []
  cards.forEach(card => {
    if (card.type === 'expense' && card.amount != null) {
      all.push({
        key: card.id,
        name: card.title,
        amount: Number(card.amount ?? 0),
        currency: card.currency ?? 'TWD',
        notes: card.notes ?? '',
        day: card.day,
        startTime: card.startTime,
        parentCard: null,
        expenseCategory: card.expenseCategory ?? 'other',
      })
    }
    ;(card.attachedExpenses ?? []).forEach(exp => {
      all.push({
        key: exp.id,
        name: exp.name,
        amount: Number(exp.amount ?? 0),
        currency: exp.currency ?? 'TWD',
        notes: exp.notes ?? '',
        day: card.day,
        startTime: card.startTime,
        parentCard: { title: card.title, type: card.type },
        expenseCategory: 'other',
      })
    })
  })
  return all
}

// ── 開銷統計 Modal ───────────────────────────
function ExpenseModal({ cards, onClose }) {
  const [tab, setTab] = useState('day')   // 'day' | 'total'

  const allExpenses = gatherAllExpenses(cards)

  const byCurrency = allExpenses.reduce((acc, e) => {
    acc[e.currency] = (acc[e.currency] ?? 0) + e.amount
    return acc
  }, {})

  // 按天分組
  const sortedDays = [...new Set(allExpenses.map(e => e.day))].sort()
  const byDay = sortedDays.map(day => ({
    day,
    items: allExpenses.filter(e => e.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }))

  const WEEKDAYS = ['週日','週一','週二','週三','週四','週五','週六']

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        className="glass-card-glow"
        style={{ width: '100%', maxWidth: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 標頭 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 28px 0' }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>💰 開銷總覽</h2>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginTop: 4 }}>
              共 {allExpenses.length} 筆 · {Object.entries(byCurrency).map(([c, t]) => `${c} ${t.toLocaleString()}`).join(' | ')}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '8px 14px', color: 'var(--text-secondary)',
            fontSize: 18, cursor: 'pointer', fontWeight: 900,
            display: 'flex', alignItems: 'center',
          }}><X size={18} /></button>
        </div>

        {/* Tab */}
        <div style={{ display: 'flex', gap: 6, padding: '16px 28px 0' }}>
          {[['day','📅 按天明細'],['total','📊 幣別統計']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 900, border: 'none',
              cursor: 'pointer',
              background: tab === id ? 'rgba(180,83,9,0.16)' : 'rgba(165,125,65,0.08)',
              color: tab === id ? 'var(--accent)' : 'var(--text-muted)',
              border: tab === id ? '1.5px solid rgba(180,83,9,0.35)' : '1.5px solid transparent',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 28px' }}>
          {allExpenses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14, fontWeight: 800 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>💸</div>
              還沒有任何開銷記錄
            </div>
          ) : tab === 'day' ? (
            /* ── 按天明細 ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {byDay.map(({ day, items }) => {
                const date = new Date(day + 'T00:00:00')
                const label = `${date.getMonth()+1}/${date.getDate()} ${WEEKDAYS[date.getDay()]}`
                const dayTotals = items.reduce((acc, e) => {
                  acc[e.currency] = (acc[e.currency] ?? 0) + e.amount; return acc
                }, {})
                return (
                  <div key={day}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--accent)',
                        background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.22)',
                        padding: '3px 10px', borderRadius: 99 }}>{label}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {Object.entries(dayTotals).map(([cur, tot]) => (
                          <span key={cur} style={{ fontSize: 13, fontWeight: 900, color: '#92400E' }}>
                            {CURRENCY_FLAG_MAP[cur] ?? '💱'} {tot.toLocaleString()} {cur}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {items.map(e => (
                        <div key={e.key} style={{
                          padding: '11px 14px', borderRadius: 13,
                          background: 'rgba(180,83,9,0.04)', border: '1px solid rgba(180,83,9,0.12)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {e.name}
                              </div>
                              {e.parentCard && (
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>
                                  附屬於：{e.parentCard.title}
                                </div>
                              )}
                              {e.notes && (
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1 }}>
                                  {e.notes}
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 900, color: '#FBBF24', flexShrink: 0 }}>
                              {CURRENCY_FLAG_MAP[e.currency] ?? '💱'} {e.amount.toLocaleString()} {e.currency}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── 幣別統計 ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {/* 幣別總計 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>各幣別合計</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(byCurrency).map(([cur, total]) => (
                    <div key={cur} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 18px', borderRadius: 16,
                      background: 'rgba(251,191,36,0.08)', border: '2px solid rgba(251,191,36,0.3)',
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-secondary)' }}>
                        {CURRENCY_FLAG_MAP[cur] ?? '💱'} {cur}
                      </span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#FBBF24' }}>
                        {Number(total).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 比例圖 */}
              {Object.entries(byCurrency).map(([cur, total]) => {
                const items = allExpenses.filter(e => e.currency === cur)
                if (!items.length) return null
                return (
                  <div key={cur}>
                    <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
                      {CURRENCY_FLAG_MAP[cur] ?? '💱'} {cur} 明細
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {items.map(e => {
                        const pct = total > 0 ? (e.amount / total * 100) : 0
                        return (
                          <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)',
                              width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.name}
                            </div>
                            <div style={{ flex: 1, height: 18, borderRadius: 99, background: 'rgba(217,119,6,0.10)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%',
                                background: 'linear-gradient(90deg,#D97706,#FBBF24)', borderRadius: 99 }} />
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 900, color: '#D97706', width: 36, textAlign: 'right', flexShrink: 0 }}>
                              {pct.toFixed(0)}%
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 設定 Modal ───────────────────────────────
function SettingsModal({ trip, tripId, onClose, onBgChange, onTripUpdate }) {
  const navigate = useNavigate()
  const { currentUser, signOut, changePassword, isEmailUser } = useAuth()
  const isOwner = trip?.ownerId === currentUser?.uid

  const [tab, setTab]           = useState('trip')    // 'trip' | 'invite' | 'account'
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied]     = useState(false)
  const [showJoinPw, setShowJoinPw] = useState(false)

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

  // 重設計畫加入密碼
  const [resetPwSection, setResetPwSection] = useState(false)
  const [newJoinPw, setNewJoinPw] = useState('')
  const [resetPwLoading, setResetPwLoading] = useState(false)
  const [resetPwSuccess, setResetPwSuccess] = useState(false)
  const [resetPwError, setResetPwError] = useState('')

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

  const handleSaveTrip = async (e) => {
    e.preventDefault()
    setEditError('')
    if (editForm.startDate > editForm.endDate) { setEditError('返回日不能早於出發日'); return }
    setEditSaving(true)
    try {
      await updateTrip(tripId, { name: editForm.name, startDate: editForm.startDate, endDate: editForm.endDate })
      onTripUpdate({ ...trip, ...editForm })
      setEditSuccess(true)
      setTimeout(() => setEditSuccess(false), 2000)
    } catch { setEditError('儲存失敗') } finally { setEditSaving(false) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError(''); setPwSuccess('')
    if (pwForm.next !== pwForm.confirm) { setPwError('兩次密碼不一致'); return }
    if (pwForm.next.length < 6) { setPwError('新密碼至少 6 個字元'); return }
    setPwLoading(true)
    try {
      await changePassword(pwForm.current, pwForm.next)
      setPwSuccess('密碼已成功更新！')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPwError(err.code === 'auth/wrong-password' ? '舊密碼錯誤' : '更新失敗，請稍後再試')
    } finally { setPwLoading(false) }
  }

  const handleBgUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `trips/${tripId}/background`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      await updateTrip(tripId, { backgroundImage: url })
      onBgChange(url)
    } catch (err) { console.error(err) } finally { setUploading(false) }
  }

  const handleClearBg = async () => {
    await updateTrip(tripId, { backgroundImage: null })
    onBgChange(null)
  }

  const handleClearCards = async () => {
    await clearAllCards(tripId)
    setConfirmClear(false)
    onClose()
  }

  const handleDeleteTrip = async () => {
    await deleteTrip(tripId, currentUser?.uid)
    navigate('/', { replace: true })
  }

  const handleLeaveTrip = async () => {
    await leaveTrip(tripId, currentUser?.uid)
    navigate('/', { replace: true })
  }

  const TABS = [
    { id: 'trip',    label: '🗺️ 計畫' },
    { id: 'invite',  label: '🔗 邀請' },
    { id: 'account', label: '👤 帳號' },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        className="glass-card-glow"
        style={{ width: '100%', maxWidth: 460, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 標頭 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings2 size={20} color="var(--accent)" />
            <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>設定</h2>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '8px 14px', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', fontWeight: 900,
            display: 'flex', alignItems: 'center' }}><X size={18} /></button>
        </div>

        {/* Tab 列 */}
        <div style={{ display: 'flex', gap: 6, padding: '16px 28px 0' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 900, border: 'none',
              cursor: 'pointer',
              background: tab === t.id ? 'rgba(180,83,9,0.16)' : 'rgba(165,125,65,0.08)',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              border: tab === t.id ? '1.5px solid rgba(180,83,9,0.35)' : '1.5px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 內容區（可捲動） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── 計畫 Tab ── */}
            {tab === 'trip' && (<>
              {/* 計畫基本資料編輯 */}
              <form onSubmit={handleSaveTrip} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>計畫資訊</p>
                {editError && <div style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 10 }}>⚠️ {editError}</div>}
                {editSuccess && <div style={{ fontSize: 12, fontWeight: 800, color: '#0F766E', padding: '8px 12px', background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.22)', borderRadius: 10 }}>✅ 已儲存</div>}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>計畫名稱</label>
                  <input className="game-input" type="text" value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>出發日</label>
                    <input className="game-input" type="date" value={editForm.startDate}
                      onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} required />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>返回日</label>
                    <input className="game-input" type="date" value={editForm.endDate}
                      onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} required />
                  </div>
                </div>
                <button type="submit" className="btn-game btn-primary" style={{ padding: '11px', fontSize: 13 }} disabled={editSaving}>
                  {editSaving ? '儲存中…' : '💾 儲存計畫資訊'}
                </button>
              </form>

              {/* 背景圖片 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
                  旅遊背景圖片
                </p>
                {trip?.backgroundImage && (
                  <div style={{ position: 'relative', marginBottom: 12, borderRadius: 16, overflow: 'hidden', height: 110 }}>
                    <img src={trip.backgroundImage} alt="background" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button className="btn-game" onClick={handleClearBg}
                        style={{ padding: '8px 18px', fontSize: 13, background: 'rgba(248,113,113,0.3)', border: '2px solid rgba(248,113,113,0.6)', color: '#F87171', borderRadius: 12 }}>
                        🗑️ 移除背景
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
                  {uploading ? '⏳ 上傳中…' : '🖼️ 選擇圖片上傳'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} disabled={uploading} />
                </label>
              </div>

              {/* 危險操作 */}
              <div style={{ borderTop: '1.5px solid rgba(220,38,38,0.15)', paddingTop: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 900, color: '#DC2626', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>危險操作</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!confirmClear ? (
                    <button onClick={() => setConfirmClear(true)} style={{
                      padding: '10px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.25)',
                      background: 'rgba(220,38,38,0.06)', color: '#DC2626', fontSize: 13, fontWeight: 900, cursor: 'pointer', textAlign: 'left',
                    }}>🗑️ 清空所有行程卡片</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', flex: 1 }}>確定要清空所有卡片？</span>
                      <button onClick={() => setConfirmClear(false)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)' }}>取消</button>
                      <button onClick={handleClearCards} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>確認清空</button>
                    </div>
                  )}
                  {isOwner ? (
                    !confirmDelete ? (
                      <button onClick={() => setConfirmDelete(true)} style={{
                        padding: '10px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.35)',
                        background: 'rgba(220,38,38,0.10)', color: '#DC2626', fontSize: 13, fontWeight: 900, cursor: 'pointer', textAlign: 'left',
                      }}>⚠️ 刪除此旅遊計畫</button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                        background: 'rgba(220,38,38,0.10)', border: '1.5px solid rgba(220,38,38,0.35)' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', flex: 1 }}>刪除後無法復原！</span>
                        <button onClick={() => setConfirmDelete(false)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)' }}>取消</button>
                        <button onClick={handleDeleteTrip} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#B91C1C', color: '#fff', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>確認刪除</button>
                      </div>
                    )
                  ) : (
                    !confirmLeave ? (
                      <button onClick={() => setConfirmLeave(true)} style={{
                        padding: '10px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.25)',
                        background: 'rgba(220,38,38,0.06)', color: '#DC2626', fontSize: 13, fontWeight: 900, cursor: 'pointer', textAlign: 'left',
                      }}>🚪 離開此旅遊計畫</button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                        background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', flex: 1 }}>確定要離開計畫？</span>
                        <button onClick={() => setConfirmLeave(false)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)' }}>取消</button>
                        <button onClick={handleLeaveTrip} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>確認離開</button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </>)}

            {/* ── 邀請 Tab ── */}
            {tab === 'invite' && (<>
              {/* 計畫代碼 + 密碼 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>傳給朋友的加入資訊</p>
                <div style={{ padding: '18px 20px', borderRadius: 18, background: 'rgba(180,83,9,0.07)', border: '2px solid rgba(180,83,9,0.25)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '1px' }}>計畫代碼</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent-bright)', letterSpacing: '10px', fontFamily: 'monospace' }}>
                      {tripId}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '1px' }}>加入密碼</div>
                    {trip?.password ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace', letterSpacing: '3px' }}>
                          {showJoinPw ? trip.password : '••••••••'}
                        </span>
                        <button onClick={() => setShowJoinPw(v => !v)} style={{
                          padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(165,125,65,0.3)',
                          background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                        }}>
                          {showJoinPw ? '隱藏' : '顯示'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>（舊版計畫密碼不顯示，請聯絡建立者）</span>
                    )}
                  </div>
                  <button className="btn-game btn-primary" style={{ padding: '11px', fontSize: 13 }}
                    onClick={() => {
                      const text = trip?.password
                        ? `旅遊計畫代碼：${tripId}\n加入密碼：${trip.password}`
                        : `旅遊計畫代碼：${tripId}`
                      navigator.clipboard.writeText(text)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}>
                    {copied ? '✅ 已複製！' : '📋 複製代碼 + 密碼'}
                  </button>
                </div>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginTop: 9, lineHeight: 1.6 }}>
                  💡 把「計畫代碼」和「加入密碼」一起傳給朋友，讓他們在「加入計畫」頁面輸入即可加入。
                </p>
              </div>

              {/* 邀請好友 Email */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
                  ✉️ 寄邀請信給好友
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>好友 Email</label>
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
                      ✅ 已開啟郵件程式，記得按送出！
                    </div>
                  )}
                  <button
                    className="btn-game btn-primary"
                    style={{ padding: '11px', fontSize: 13 }}
                    disabled={!inviteEmail.trim()}
                    onClick={() => {
                      // Bug #3：URL 帶入 code+pw，收件人點連結直接開啟加入頁
                      const joinUrl = `${window.location.origin}/?join=${tripId}${trip?.password ? `&pw=${encodeURIComponent(trip.password)}` : ''}`
                      const subject = `邀請你加入旅遊計畫「${trip?.name ?? ''}」`
                      const dates = trip ? `📅 行程日期：${trip.startDate} ～ ${trip.endDate}` : ''
                      const body = [
                        `嗨！`,
                        ``,
                        `你的朋友邀請你一起規劃旅遊行程 🎉`,
                        ``,
                        `✈️ 旅遊計畫：${trip?.name ?? ''}`,
                        dates,
                        ``,
                        `👉 點這個連結直接加入（自動填入代碼和密碼）：`,
                        joinUrl,
                        ``,
                        `或手動輸入：`,
                        `📋 計畫代碼：${tripId}`,
                        trip?.password ? `🔑 加入密碼：${trip.password}` : '',
                        ``,
                        `期待和你一起旅行！`,
                      ].join('\n')
                      const mailto = `mailto:${encodeURIComponent(inviteEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
                      window.open(mailto, '_self')
                      setInviteSent(true)
                    }}
                  >
                    ✉️ 寄出邀請信
                  </button>
                </div>
              </div>

              {/* 重設加入密碼（僅建立者） */}
              {isOwner && (
                <div>
                  <button onClick={() => { setResetPwSection(v => !v); setResetPwError(''); setResetPwSuccess(false) }}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 14, textAlign: 'left',
                      background: 'rgba(165,125,65,0.07)', border: '1.5px solid rgba(165,125,65,0.18)',
                      fontSize: 13, fontWeight: 900, color: 'var(--text-secondary)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>🔑 重設加入密碼</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{resetPwSection ? '▲' : '▼'}</span>
                  </button>
                  {resetPwSection && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10,
                      padding: '16px', borderRadius: 14,
                      background: 'rgba(165,125,65,0.05)', border: '1px solid rgba(165,125,65,0.14)' }}>
                      {resetPwError && (
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', padding: '8px 12px',
                          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 10 }}>
                          ⚠️ {resetPwError}
                        </div>
                      )}
                      {resetPwSuccess && (
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#0F766E', padding: '8px 12px',
                          background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.22)', borderRadius: 10 }}>
                          ✅ 密碼已重設！記得把新密碼告訴成員。
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>新加入密碼</label>
                        <input className="game-input" type="text" style={{ padding: '10px 14px', fontSize: 13 }}
                          value={newJoinPw} onChange={e => setNewJoinPw(e.target.value)}
                          placeholder="輸入新密碼…" disabled={resetPwLoading} />
                      </div>
                      <button className="btn-game btn-primary" style={{ padding: '10px', fontSize: 13 }}
                        disabled={resetPwLoading || !newJoinPw.trim()}
                        onClick={async () => {
                          if (!newJoinPw.trim()) { setResetPwError('請輸入新密碼'); return }
                          setResetPwLoading(true); setResetPwError('')
                          try {
                            await updateTripPassword(tripId, newJoinPw.trim())
                            onTripUpdate({ ...trip, password: newJoinPw.trim() })
                            setResetPwSuccess(true)
                            setNewJoinPw('')
                            setTimeout(() => setResetPwSuccess(false), 4000)
                          } catch { setResetPwError('重設失敗，請稍後再試') }
                          finally { setResetPwLoading(false) }
                        }}>
                        {resetPwLoading ? '更新中…' : '確認重設密碼'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 成員列表 */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
                  目前成員（{trip?.members?.length ?? 0} 人）
                </p>
                {membersLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 800 }}>載入中…</div>
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
                            {m.displayName || m.email?.split('@')[0] || '未知用戶'}
                            {m.uid === trip?.ownerId && (
                              <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 900, color: 'var(--accent)',
                                background: 'rgba(180,83,9,0.12)', border: '1px solid rgba(180,83,9,0.25)',
                                borderRadius: 6, padding: '1px 7px' }}>建立者</span>
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
                    {currentUser?.displayName || '旅人'}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser?.email}
                  </div>
                </div>
                <button onClick={handleSignOut} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 10,
                  background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.25)',
                  color: '#DC2626', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                  登出
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
                    <span>🔑 更改帳號密碼</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pwSection ? '▲' : '▼'}</span>
                  </button>
                  {pwSection && (
                    <form onSubmit={handleChangePassword}
                      style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10,
                        padding: '16px', borderRadius: 14,
                        background: 'rgba(165,125,65,0.05)', border: '1px solid rgba(165,125,65,0.14)' }}>
                      {pwError && <div style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', padding: '8px 12px',
                        background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 10 }}>⚠️ {pwError}</div>}
                      {pwSuccess && <div style={{ fontSize: 12, fontWeight: 800, color: '#0F766E', padding: '8px 12px',
                        background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.22)', borderRadius: 10 }}>✅ {pwSuccess}</div>}
                      {[['current','舊密碼'],['next','新密碼'],['confirm','確認新密碼']].map(([field, label]) => (
                        <div key={field}>
                          <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{label}</label>
                          <input className="game-input" type="password" style={{ padding: '10px 14px', fontSize: 13 }}
                            value={pwForm[field]} onChange={e => setPwForm(p => ({ ...p, [field]: e.target.value }))}
                            disabled={pwLoading} required />
                        </div>
                      ))}
                      <button type="submit" className="btn-game btn-primary" style={{ padding: '10px', fontSize: 13, marginTop: 4 }} disabled={pwLoading}>
                        {pwLoading ? '更新中…' : '確認更改密碼'}
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
function TrashZone({ visible }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash-zone' })
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
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
      {isOver ? '🗑️ 放開以刪除！' : '🗑️ 拖到這裡刪除'}
    </div>
  )
}

// ── 左側 Sidebar ────────────────────────────
function LeftSidebar({ trip, tripId, cards, onShowExpense, onShowSettings, onExportPDF }) {
  const navigate = useNavigate()

  const counts = cards.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1
    return acc
  }, {})

  // 包含獨立開銷卡 + 各卡片附加消費
  const totalExpense = cards.reduce((acc, c) => {
    if (c.type === 'expense' && c.amount != null) {
      const cur = c.currency ?? 'TWD'
      acc[cur] = (acc[cur] ?? 0) + Number(c.amount ?? 0)
    }
    ;(c.attachedExpenses ?? []).forEach(exp => {
      const cur = exp.currency ?? 'TWD'
      acc[cur] = (acc[cur] ?? 0) + Number(exp.amount ?? 0)
    })
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
          旅遊計畫
        </p>
        <div className="glass-card" style={{ padding: '20px 18px' }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>🗺️</div>
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
            🏖️ 共 {trip ? getTripDuration(trip.startDate, trip.endDate) : 0} 天
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

      {/* 類別統計 */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14 }}>
          行程統計
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(CATEGORY).map(([key, cfg]) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 16,
              background: cfg.bg, border: `2px solid ${cfg.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: cfg.color }}>{cfg.label}</span>
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

      {/* 開銷快覽 */}
      {Object.keys(totalExpense).length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14 }}>
            開銷合計
          </p>
          <div className="glass-card" style={{ padding: '16px 18px' }}>
            {Object.entries(totalExpense).map(([cur, total]) => (
              <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>{cur}</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#FBBF24' }}>
                  {Number(total).toLocaleString()}
                </span>
              </div>
            ))}
            <button
              onClick={onShowExpense}
              style={{
                marginTop: 12, width: '100%', padding: '10px', borderRadius: 12,
                background: 'rgba(251,191,36,0.12)', border: '1.5px solid rgba(251,191,36,0.3)',
                color: '#FBBF24', fontSize: 13, fontWeight: 900, cursor: 'pointer',
              }}
            >
              查看明細 →
            </button>
          </div>
        </div>
      )}

      {/* 頁面導覽 */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          頁面導覽
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { icon: '📋', label: '待辦清單', path: `/trip/${tripId}/todos`, color: '#B45309', bg: 'rgba(180,83,9,0.08)', border: 'rgba(180,83,9,0.25)' },
            { icon: '🎒', label: '打包清單', path: `/trip/${tripId}/packing`, color: '#0F766E', bg: 'rgba(15,118,110,0.08)', border: 'rgba(15,118,110,0.25)' },
          ].map(nav => (
            <button key={nav.path} onClick={() => navigate(nav.path)} style={{
              width: '100%', padding: '11px 14px', borderRadius: 14, textAlign: 'left',
              background: nav.bg, border: `1.5px solid ${nav.border}`,
              color: nav.color, fontSize: 13, fontWeight: 900, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 9,
              boxShadow: `0 2px 0 ${nav.border}`,
            }}>
              <span style={{ fontSize: 16 }}>{nav.icon}</span>
              {nav.label}
              <span style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.5 }}>→</span>
            </button>
          ))}
        </div>
      </div>

      {/* 底部快捷按鈕 */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn-game btn-ghost" style={{ padding: '12px', fontSize: 13, width: '100%' }}
          onClick={onShowExpense}>
          💰 開銷統計
        </button>
        <button className="btn-game btn-ghost" style={{ padding: '12px', fontSize: 13, width: '100%' }}
          onClick={onShowSettings}>
          ⚙️ 設定 / 背景圖片
        </button>
        <button className="btn-game btn-ghost" style={{ padding: '12px', fontSize: 13, width: '100%' }}
          onClick={onExportPDF}>
          📄 匯出 PDF
        </button>
      </div>
    </div>
  )
}

// ── TopBar ──────────────────────────────────
function TopBar({ trip, tripId, onShowSettings, isMobile, onToggleSidebar, sidebarOpen }) {
  const navigate = useNavigate()
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied]       = useState(false)
  const [showJoinPw, setShowJoinPw] = useState(false)

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
          <img src="/favicon.svg" alt="TripCoworking" style={{ width: isMobile ? 30 : 34, height: isMobile ? 30 : 34 }} />
          {!isMobile && (
            <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1, whiteSpace: 'nowrap' }}>
              Trip<span style={{ color: '#7C3AED' }}>Coworking</span>
            </span>
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
          <h1 style={{ fontSize: isMobile ? 14 : 17, fontWeight: 900, color: 'var(--text-primary)',
            lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: isMobile ? 130 : 'none' }}>
            {trip?.name || '載入中…'}
          </h1>
          {trip && !isMobile && (
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginTop: 2 }}>
              {trip.startDate} – {trip.endDate}　·　共 {getTripDuration(trip.startDate, trip.endDate)} 天
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: isMobile ? 6 : 10, alignItems: 'center', position: 'relative' }}>
        {/* 同步指示 */}
        {!isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 20,
            background: 'rgba(15,118,110,0.08)', border: '1.5px solid rgba(15,118,110,0.25)',
            fontSize: 12, fontWeight: 900, color: '#0F766E',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0F766E',
              boxShadow: '0 0 6px #0F766E', display: 'inline-block' }} />
            即時同步中
          </div>
        )}
        {isMobile && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0F766E',
            boxShadow: '0 0 6px #0F766E', display: 'inline-block' }} />
        )}

        {!isMobile && (
          <div style={{ position: 'relative' }}>
            <button className="btn-game btn-ghost" style={{ padding: '10px 18px', fontSize: 14 }}
              onClick={() => setShowShare(v => !v)}>
              🔗 邀請朋友
            </button>
            {showShare && (
              <>
                <div style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, zIndex: 100, width: 290 }}>
                  <div style={{ position: 'absolute', top: -7, right: 26, width: 14, height: 14,
                    background: 'rgba(255,252,243,0.98)', border: '1px solid rgba(165,125,65,0.28)',
                    transform: 'rotate(45deg)', borderBottom: 'none', borderRight: 'none' }} />
                  <div className="glass-card-glow" style={{ padding: '20px 22px' }}>
                    <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>計畫代碼</p>
                    <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-bright)', letterSpacing: '8px', fontFamily: 'monospace', textAlign: 'center', marginBottom: 14 }}>
                      {tripId}
                    </div>
                    {trip?.password && (
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>加入密碼</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace', letterSpacing: '3px' }}>
                            {showJoinPw ? trip.password : '••••••'}
                          </span>
                          <button onClick={() => setShowJoinPw(v => !v)} style={{
                            padding: '3px 9px', borderRadius: 7, border: '1px solid rgba(165,125,65,0.3)',
                            background: 'transparent', fontSize: 11, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)',
                          }}>{showJoinPw ? '隱藏' : '顯示'}</button>
                        </div>
                      </div>
                    )}
                    <button className="btn-game btn-primary" style={{ padding: '11px 0', fontSize: 13, width: '100%' }}
                      onClick={() => {
                        const text = trip?.password
                          ? `旅遊計畫代碼：${tripId}\n加入密碼：${trip.password}`
                          : `旅遊計畫代碼：${tripId}`
                        navigator.clipboard.writeText(text)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}>
                      {copied ? '✅ 已複製！' : '📋 複製代碼 + 密碼'}
                    </button>
                    <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginTop: 9, lineHeight: 1.5 }}>
                      朋友需要同時輸入代碼和密碼才能加入
                    </p>
                  </div>
                </div>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowShare(false)} />
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CopyLinkButton />
          <FullscreenButton />
          <button className="btn-game btn-ghost"
            style={{ padding: isMobile ? '8px 10px' : '10px 14px', fontSize: 14,
              display: 'flex', alignItems: 'center' }}
            onClick={onShowSettings}><Settings2 size={18} /></button>
        </div>
      </div>
    </div>
  )
}

// ── 浮動新增按鈕 ────────────────────────────
function FloatingAddButton({ onClick }) {
  return (
    <button className="btn-game fab-safe" onClick={onClick} style={{
      position: 'fixed', bottom: 36, right: 'max(24px, env(safe-area-inset-right, 24px))',
      width: 68, height: 68, borderRadius: '50%',
      background: 'linear-gradient(135deg,#E8A020,#B45309)',
      boxShadow: '0 7px 0 #78350F, 0 12px 35px rgba(180,83,9,0.45)',
      border: 'none', color: '#fff', fontSize: 32, fontWeight: 900,
      cursor: 'pointer', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1,
    }}>
      <Plus size={28} />
    </button>
  )
}

// ── 清單視圖 ──────────────────────────────────
const CARD_TYPE_ICON = { attraction: '📍', transport: '🚌', expense: '💰', note: '📝' }
const EXPENSE_CAT_ICON = { food:'🍜', transport:'🚌', accommodation:'🏨', shopping:'🛍️', ticket:'🎟️', other:'💼' }

function ListView({ cards, trip, onCardClick, onDeleteCard }) {
  const days = getDaysInRange(trip.startDate, trip.endDate)
  const WEEKDAYS = ['週日','週一','週二','週三','週四','週五','週六']

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 40px' }}>
      {days.map((day, di) => {
        const dayCards = cards.filter(c => c.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
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
                這天還沒有行程
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayCards.map(card => {
                  const cfg = CATEGORY[card.type] ?? CATEGORY.note
                  return (
                    <div key={card.id} onClick={() => onCardClick(card)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 14, cursor: 'pointer',
                        background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                        borderLeft: `5px solid ${cfg.color}`,
                        boxShadow: '0 2px 8px rgba(100,60,10,0.07)',
                        transition: 'transform 0.1s, box-shadow 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(3px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${cfg.color}22` }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(100,60,10,0.07)' }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', width: 46, flexShrink: 0 }}>
                        {card.startTime}
                      </span>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>
                        {card.type === 'expense'
                          ? (EXPENSE_CAT_ICON[card.expenseCategory ?? 'other'] ?? '💰')
                          : cfg.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: cfg.color,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {card.title}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {card.type === 'transport' && card.from && card.to
                            ? `${card.from} → ${card.to}`
                            : card.type === 'expense'
                            ? `${card.currency ?? 'TWD'} ${Number(card.amount ?? 0).toLocaleString()}`
                            : card.type === 'attraction' && card.address
                            ? card.address
                            : card.content ?? ''}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteCard(card.id) }}
                        style={{ flexShrink: 0, background: 'rgba(220,38,38,0.10)',
                          border: '1.5px solid rgba(220,38,38,0.25)', borderRadius: 8,
                          padding: '4px 9px', fontSize: 13, cursor: 'pointer', color: '#DC2626' }}>
                        🗑️
                      </button>
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
  const { currentUser } = useAuth()
  const { isMobile } = useWindowSize()
  const [trip, setTrip]                   = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [cards, setCards]                 = useState([])
  const [modal, setModal]                 = useState(null)   // { day, time } | { editCard }
  const [draggingCard, setDraggingCard]   = useState(null)
  const [detailCard, setDetailCard]       = useState(null)
  const [attachConfirm, setAttachConfirm] = useState(null)   // { sourceNote, targetCard }
  const [showExpense, setShowExpense]     = useState(false)
  const [showSettings, setShowSettings]   = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [droppedCardId, setDroppedCardId]     = useState(null)
  const [shakingCardIds, setShakingCardIds]   = useState([])
  const [viewMode, setViewMode]           = useState('timeline') // 'timeline' | 'list'
  const [pdfToast, setPdfToast]           = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  useEffect(() => {
    let unsub = null

    getTrip(tripId)
      .then(async data => {
        // 若 trip 有 members 欄位，檢查目前用戶是否是成員
        if (data.members?.length && currentUser && !data.members.includes(currentUser.uid)) {
          setError('你不是此旅遊計畫的成員')
          setLoading(false)
          return
        }
        setTrip(data)
        updateTripLastVisited(tripId).catch(() => {})

        // 訂閱即時卡片更新（Bug #9：加 error handler，trip 被刪時導向首頁）
        unsub = subscribeToCards(tripId, (liveCards) => {
          setCards(liveCards)
        }, (err) => {
          if (err.code === 'permission-denied' || err.code === 'not-found') {
            setError('此旅遊計畫已被刪除或你已失去存取權限')
            setTimeout(() => navigate('/'), 3000)
          }
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    return () => unsub?.()
  }, [tripId, navigate])

  const handleDragStart = ({ active }) =>
    setDraggingCard(cards.find(c => c.id === active.id) ?? null)

  const triggerDropBounce = useCallback((id) => {
    setDroppedCardId(id)
    setTimeout(() => setDroppedCardId(null), 500)
  }, [])

  const triggerCollisionShake = useCallback((idA, idB) => {
    setShakingCardIds([idA, idB].filter(Boolean))
    setTimeout(() => setShakingCardIds([]), 600)
  }, [])

  const handleDragEnd = useCallback(async ({ active, delta, over }) => {
    setDraggingCard(null)
    if (!trip) return
    const card = cards.find(c => c.id === active.id)
    if (!card) return

    if (over?.id === 'trash-zone') {
      await deleteCard(tripId, card.id)
      return
    }

    // 筆記拖曳到另一張卡片 → 顯示確認 Modal
    if (card.type === 'note' && over?.id?.startsWith('card-drop-')) {
      const targetId = over.id.replace('card-drop-', '')
      const targetCard = cards.find(c => c.id === targetId)
      if (targetCard && targetCard.id !== card.id) {
        setAttachConfirm({ sourceNote: card, targetCard })
        return
      }
    }

    const deltaSlots = Math.round(delta.y / SLOT_HEIGHT)
    const deltaDays  = Math.round(delta.x / DAY_COL_W)
    if (!deltaSlots && !deltaDays) {
      triggerDropBounce(active.id)
      return
    }

    const days      = getDaysInRange(trip.startDate, trip.endDate)
    const newDayIdx = Math.max(0, Math.min(days.length - 1, days.indexOf(card.day) + deltaDays))
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
      return
    }

    triggerDropBounce(active.id)
    await updateCard(tripId, card.id, {
      day: newDay,
      startTime: minutesToTime(newMin),
    })
  }, [trip, cards, tripId])

  const handleAddCard = useCallback(async (data, pendingNearby) => {
    const newId = await addCard(tripId, data)

    if (data.type === 'note') {
      navigate(`/trip/${tripId}/note/${newId}`)
    }

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
      })
    }
  }, [tripId, navigate])

  const handleDeleteCard = useCallback(async (id) => {
    await deleteCard(tripId, id)
  }, [tripId])

  const handleEditCard = useCallback(async (updatedCard) => {
    const { id, createdAt, ...updates } = updatedCard
    await updateCard(tripId, id, updates)
    setDetailCard(null)
  }, [tripId])

  const handleAttachNote = useCallback(async () => {
    if (!attachConfirm) return
    const { sourceNote, targetCard } = attachConfirm
    const noteItem = {
      id: sourceNote.id,
      title: sourceNote.title,
      content: sourceNote.content ?? '',
      images: sourceNote.images ?? [],
      attachedAt: Date.now(),
    }
    await attachNoteToCard(tripId, targetCard.id, noteItem, sourceNote.id)
    setAttachConfirm(null)
  }, [attachConfirm, tripId])

  const handleUpdateCard = useCallback(async (cardId, updates) => {
    await updateCard(tripId, cardId, updates)
  }, [tripId])

  // 讓 detailCard 跟著 Firestore onSnapshot 即時更新；卡片被遠端刪除時自動關閉 Modal
  useEffect(() => {
    if (!detailCard) return
    const updated = cards.find(c => c.id === detailCard.id)
    if (updated) {
      setDetailCard(updated)
    } else {
      setDetailCard(null) // 卡片已被刪除（協作者刪除），關閉面板
    }
  }, [cards]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBgChange = useCallback((url) => {
    setTrip(prev => prev ? { ...prev, backgroundImage: url } : prev)
  }, [])

  const handleTripUpdate = useCallback((updated) => {
    setTrip(updated)
  }, [])

  const handleSeedCards = useCallback(async () => {
    if (!trip) return
    const seeds = makeSeedCards(trip.startDate)
    await Promise.all(seeds.map(c => addCard(tripId, c)))
  }, [trip, tripId])

  const handleCopyCard = useCallback(async (card, targetDays) => {
    const { id, createdAt, day, ...cardData } = card
    await Promise.all(targetDays.map(d => addCard(tripId, { ...cardData, day: d })))
  }, [tripId])

  const handleExportPDF = useCallback(() => {
    setPdfToast(true)
    setTimeout(() => setPdfToast(false), 4000)
    const days = getDaysInRange(trip.startDate, trip.endDate)
    const expenseCards = cards.filter(c => c.type === 'expense')
    const byCurrency = expenseCards.reduce((acc, c) => {
      const cur = c.currency ?? 'TWD'; acc[cur] = (acc[cur] ?? 0) + Number(c.amount ?? 0); return acc
    }, {})

    const cardsByDay = days.map(day => ({
      day,
      cards: cards.filter(c => c.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))

    const TYPE_ICON = { attraction: '📍', transport: '🚌', expense: '💰', note: '📝' }

    const html = `<!DOCTYPE html>
<html lang="zh-TW"><head>
<meta charset="utf-8"/>
<title>${trip.name} — 旅遊行程</title>
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
  .expense-section { margin-top: 36px; padding: 20px; background: rgba(217,119,6,0.07); border: 1.5px solid rgba(217,119,6,0.25); border-radius: 12px; break-inside: avoid; }
  .expense-title { font-size: 16px; font-weight: 900; margin-bottom: 12px; color: #92400E; }
  .expense-row { display: flex; justify-content: space-between; padding: 5px 0; font-weight: 800; font-size: 13px; }
  .footer { margin-top: 40px; text-align: center; color: #9E7040; font-size: 11px; font-weight: 700; }
  @media print { body { padding: 20px; } }
</style>
</head><body>
<h1>✈️ ${trip.name}</h1>
<p class="meta">${trip.startDate} – ${trip.endDate}　共 ${getTripDuration(trip.startDate, trip.endDate)} 天</p>

${cardsByDay.map(({ day, cards: dc }) => dc.length === 0 ? '' : `
<div class="day-block">
  <div class="day-header">🗓️ ${day}</div>
  ${dc.map(c => `
  <div class="card-row">
    <div class="card-time">${c.startTime}</div>
    <div class="card-icon">${TYPE_ICON[c.type] ?? '📌'}</div>
    <div>
      <div class="card-title">${c.title ?? ''}</div>
      <div class="card-sub">${
        c.type === 'transport' ? (c.from && c.to ? `${c.from} → ${c.to}` : '') :
        c.type === 'expense' ? `${c.currency ?? 'TWD'} ${Number(c.amount ?? 0).toLocaleString()}` :
        c.type === 'attraction' ? (c.address ?? '') :
        (c.content ? c.content.slice(0, 80) : '')
      }</div>
    </div>
  </div>`).join('')}
</div>`).join('')}

${Object.keys(byCurrency).length > 0 ? `
<div class="expense-section">
  <div class="expense-title">💰 開銷統計</div>
  ${Object.entries(byCurrency).map(([cur, total]) => `
  <div class="expense-row"><span>${cur}</span><span>${Number(total).toLocaleString()}</span></div>`).join('')}
  <div style="margin-top:12px; border-top:1px solid rgba(217,119,6,0.25); padding-top:10px;">
  ${expenseCards.map(c => `<div class="expense-row" style="font-weight:700;font-size:11px;color:#6A3E1F"><span>${c.title}</span><span>${c.currency ?? 'TWD'} ${Number(c.amount ?? 0).toLocaleString()}</span></div>`).join('')}
  </div>
</div>` : ''}

<div class="footer">由 TripCoworking 匯出 · ${new Date().toLocaleDateString('zh-TW')}</div>
</body></html>`

    const win = window.open('', '_blank')
    if (!win) {
      alert('⚠️ 請允許此頁面開啟彈出視窗以匯出 PDF（瀏覽器設定 → 允許彈出視窗）')
      setPdfToast(false)
      return
    }
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }, [trip, cards])

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
      <div style={{ fontSize: 60 }}>✈️</div>
      <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-secondary)' }}>載入旅遊計畫中…</p>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24, padding: 32 }}>
      <div style={{ fontSize: 60 }}>😢</div>
      <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>讀取失敗</p>
      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)' }}>{error}</p>
      <button className="btn-game btn-primary" style={{ padding: '14px 36px' }} onClick={() => navigate('/')}>返回首頁</button>
    </div>
  )

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
          onShowSettings={() => setShowSettings(true)}
          onToggleSidebar={() => setSidebarOpen(v => !v)}
          sidebarOpen={sidebarOpen}
        />

        {/* ── 主體 ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* 手機：側欄 overlay */}
          {isMobile && sidebarOpen && (
            <>
              <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.5)' }}
                onClick={() => setSidebarOpen(false)} />
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 31, width: 280 }}>
                <LeftSidebar
                  trip={trip} tripId={tripId} cards={cards}
                  onShowExpense={() => { setShowExpense(true); setSidebarOpen(false) }}
                  onShowSettings={() => { setShowSettings(true); setSidebarOpen(false) }}
                  onExportPDF={handleExportPDF}
                />
              </div>
            </>
          )}

          {/* 桌面：固定側欄 */}
          {!isMobile && (
            <LeftSidebar
              trip={trip} tripId={tripId} cards={cards}
              onShowExpense={() => setShowExpense(true)}
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
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
                <input
                  className="game-input"
                  type="text"
                  placeholder="搜尋行程卡片…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 36, paddingTop: 9, paddingBottom: 9, fontSize: 13 }}
                />
              </div>
              {searchQuery && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.22)', padding: '4px 10px', borderRadius: 99 }}>
                    {filteredCards.length} 筆
                  </span>
                  <button onClick={() => setSearchQuery('')} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                </div>
              )}
              {/* 視圖切換 */}
              <div style={{ marginLeft: 'auto', display: 'flex', borderRadius: 11, overflow: 'hidden', border: '1.5px solid rgba(165,125,65,0.25)', background: 'var(--bg-elevated)', flexShrink: 0 }}>
                {[['timeline','⏱️ 時間軸'],['list','📋 清單']].map(([mode, label]) => (
                  <button key={mode} onClick={() => setViewMode(mode)} style={{
                    padding: '7px 13px', fontSize: 12, fontWeight: 900, border: 'none', cursor: 'pointer',
                    background: viewMode === mode ? 'rgba(180,83,9,0.16)' : 'transparent',
                    color: viewMode === mode ? 'var(--accent)' : 'var(--text-muted)',
                  }}>{label}</button>
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
                    onCardClick={setDetailCard}
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
                    <div style={{ fontSize: 52 }}>🗺️</div>
                    <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-secondary)' }}>行程是空的</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>
                      點右下角「＋」新增行程，或載入範例
                    </p>
                    <button onClick={handleSeedCards} style={{
                      padding: '11px 26px', borderRadius: 14, fontSize: 13, fontWeight: 900,
                      background: 'linear-gradient(135deg,#D97706,#B45309)',
                      border: 'none', boxShadow: '0 5px 0 #78350F', color: '#fff', cursor: 'pointer',
                    }}>📋 新增範例行程</button>
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
                      <div style={{ fontSize: 52 }}>🗺️</div>
                      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-secondary)' }}>行程是空的</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>
                        點右下角「＋」新增行程，或載入範例
                      </p>
                      <button onClick={handleSeedCards} style={{
                        padding: '11px 26px', borderRadius: 14, fontSize: 13, fontWeight: 900,
                        background: 'linear-gradient(135deg,#D97706,#B45309)',
                        border: 'none', boxShadow: '0 5px 0 #78350F', color: '#fff', cursor: 'pointer',
                      }}>📋 新增範例行程</button>
                    </div>
                  ) : (
                    <ListView
                      cards={filteredCards}
                      trip={trip}
                      onCardClick={setDetailCard}
                      onDeleteCard={handleDeleteCard}
                    />
                  )}
                </>
              )
            )}
          </div>
        </div>

        <FloatingAddButton onClick={() => setModal({ day: trip?.startDate ?? '', time: '09:00' })} />

        <DragOverlay dropAnimation={null}>
          {draggingCard && (
            <div className="card-drag-overlay" style={{ width: DAY_COL_W - 16 }}>
              <CardPreview card={draggingCard} />
            </div>
          )}
        </DragOverlay>

        <TrashZone visible={!!draggingCard} />

        {/* PDF 匯出提示 */}
        {pdfToast && (
          <div style={{
            position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
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

        {/* 卡片詳細面板 */}
        {detailCard && (
          <CardDetailModal
            card={detailCard}
            isMobile={isMobile}
            tripId={tripId}
            trip={trip}
            onUpdate={handleUpdateCard}
            onClose={() => setDetailCard(null)}
            onDelete={async (id) => { await handleDeleteCard(id); setDetailCard(null) }}
            onEdit={(card) => { setDetailCard(null); setModal({ editCard: card }) }}
            onCopyCard={handleCopyCard}
          />
        )}

        {/* 新增 / 編輯 Modal */}
        {modal && !modal.editCard && (
          <AddCardModal
            defaultDay={modal.day}
            defaultTime={modal.time}
            tripId={tripId}
            onAdd={handleAddCard}
            onClose={() => setModal(null)}
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
          />
        )}

        {/* 筆記附加確認 */}
        {attachConfirm && (
          <AttachNoteModal
            sourceNote={attachConfirm.sourceNote}
            targetCard={attachConfirm.targetCard}
            onConfirm={handleAttachNote}
            onCancel={() => setAttachConfirm(null)}
          />
        )}

        {showExpense && <ExpenseModal cards={cards} onClose={() => setShowExpense(false)} />}

        {showSettings && (
          <SettingsModal
            trip={trip} tripId={tripId}
            onClose={() => setShowSettings(false)}
            onBgChange={handleBgChange}
            onTripUpdate={handleTripUpdate}
          />
        )}
      </div>
    </DndContext>
  )
}
