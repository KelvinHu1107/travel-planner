import { useState, useRef, useEffect } from 'react'
import { Bell, X, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../hooks/useNotifications'
import { useLanguage } from '../../i18n/LanguageContext'
import {
  markAsRead, markAllAsRead, deleteNotification,
  NOTIFICATION_TYPES,
} from '../../services/notificationService'

// Bug #21：改在 render 時用 t() 組通知文字
function useNotificationRenderer() {
  const { t } = useLanguage()
  const formatTime = (ts) => {
    if (!ts) return ''
    const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : null)
    if (!ms) return ''
    const diff = Date.now() - ms
    const min = Math.floor(diff / 60000)
    if (min < 1) return t('notification.time.justNow')
    if (min < 60) return t('notification.time.minutes', { count: min })
    const hr = Math.floor(min / 60)
    if (hr < 24) return t('notification.time.hours', { count: hr })
    const d = Math.floor(hr / 24)
    if (d < 7) return t('notification.time.days', { count: d })
    const date = new Date(ms)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
  const renderMessage = (n) => {
    const actor       = n.actorName || t('notification.actor.default')
    const actorJoin   = n.actorName || t('notification.actor.newMember')
    const title       = n.cardTitle || t('notification.card.default')
    const tripLabel   = n.tripName  || t('notification.trip.default')
    switch (n.type) {
      case NOTIFICATION_TYPES.CARD_ADDED:    return t('notification.cardAdded',    { actor, title })
      case NOTIFICATION_TYPES.CARD_UPDATED:  return t('notification.cardUpdated',  { actor, title })
      case NOTIFICATION_TYPES.CARD_DELETED:
        // Bug #5：cardTitle 為空 → 表示清空全部卡片
        if (!n.cardTitle) return t('notification.allCardsCleared', { actor })
        return t('notification.cardDeleted', { actor, title })
      case NOTIFICATION_TYPES.MEMBER_JOINED: return t('notification.memberJoined', { actor: actorJoin })
      case NOTIFICATION_TYPES.MEMBER_LEFT:   return t('notification.memberLeft',   { actor })
      case NOTIFICATION_TYPES.TRIP_DELETED:  return t('notification.tripDeleted',  { trip: tripLabel })
      // 舊資料相容（Bug #21 前的通知仍有 message 欄位）
      default: return n.message || ''
    }
  }
  return { formatTime, renderMessage }
}

export default function NotificationBell({ isMobile = false }) {
  const { currentUser } = useAuth()
  const { notifications, unreadCount, loading, error } = useNotifications(currentUser?.uid)
  const { t } = useLanguage()
  const { formatTime, renderMessage } = useNotificationRenderer()
  const [open, setOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => {
      if (panelRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Bug #33：改用 pointerdown 統一 mouse/touch，避免手機雙觸發
    document.addEventListener('pointerdown', onDocDown)
    return () => document.removeEventListener('pointerdown', onDocDown)
  }, [open])

  const handleClickItem = async (n) => {
    if (!n.read) {
      try { await markAsRead(n.id) } catch {}
    }
  }

  const handleMarkAllRead = async () => {
    try { await markAllAsRead(notifications) } catch {}
  }

  // Bug #22：改為 inline 兩段式（點紅色 X → 顯示「確定刪除？」再按確認才真正刪除）
  const handleRequestDelete = (e, id) => {
    e.stopPropagation()
    setConfirmDeleteId(id)
  }
  const handleConfirmDelete = async (e, id) => {
    e.stopPropagation()
    try { await deleteNotification(id) } catch {}
    setConfirmDeleteId(prev => prev === id ? null : prev)
  }
  const handleCancelDelete = (e) => {
    e.stopPropagation()
    setConfirmDeleteId(null)
  }

  if (!currentUser) return null

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        aria-label={t('notification.title')}
        style={{
          width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: 10,
          border: '1.5px solid rgba(165,125,65,0.28)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-muted)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
        }}
      >
        <Bell size={isMobile ? 15 : 17} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 18, height: 18, borderRadius: 99,
            background: '#DC2626', color: '#fff',
            fontSize: 10, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 5px', border: '2px solid var(--bg-elevated)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            ...(isMobile
              ? { position: 'fixed', top: 60, right: 12, left: 12, maxHeight: 'calc(100dvh - 80px)' }
              : { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 460 }
            ),
            overflow: 'hidden',
            background: 'rgba(255,252,244,0.99)',
            border: '1.5px solid rgba(165,125,65,0.28)',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(80,40,5,0.22)',
            zIndex: 300,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1.5px solid rgba(165,125,65,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={15} color="var(--accent)" />
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{t('notification.title')}</span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 900, color: '#fff',
                  background: '#DC2626', borderRadius: 99, padding: '2px 7px',
                }}>{unreadCount}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                    border: '1px solid rgba(165,125,65,0.25)',
                    background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Check size={11} /> {t('notification.markAllRead')}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 26, height: 26, borderRadius: 8,
                  border: '1px solid rgba(165,125,65,0.25)',
                  background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><X size={12} /></button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Bug #23：載入 / 錯誤 / 空狀態 */}
            {loading ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 24, height: 24, margin: '0 auto 10px',
                  border: '2.5px solid rgba(165,125,65,0.22)',
                  borderTopColor: 'var(--accent)', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>{t('notification.loading')}</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : error ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, fontWeight: 900, color: '#DC2626' }}>⚠️ {t('notification.error')}</p>
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.4 }}>
                  <Bell size={32} color="var(--text-muted)" />
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>{t('notification.empty')}</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {notifications.map(n => (
                  <li
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid rgba(165,125,65,0.10)',
                      cursor: 'pointer',
                      background: n.read ? 'transparent' : 'rgba(180,83,9,0.06)',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(165,125,65,0.10)'}
                    onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(180,83,9,0.06)'}
                  >
                    {!n.read && (
                      <span style={{
                        marginTop: 6, width: 8, height: 8, borderRadius: '50%',
                        background: '#DC2626', flexShrink: 0,
                      }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: n.read ? 700 : 900,
                        color: n.read ? 'var(--text-muted)' : 'var(--text-primary)',
                        lineHeight: 1.5, wordBreak: 'break-word',
                      }}>
                        {renderMessage(n)}
                      </div>
                      {n.tripName && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
                          {n.tripName}
                        </div>
                      )}
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>
                        {formatTime(n.createdAt)}
                      </div>
                    </div>
                    {/* Bug #22：inline 兩段式刪除確認 */}
                    {confirmDeleteId === n.id ? (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => handleConfirmDelete(e, n.id)}
                          style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 900,
                            background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer',
                          }}
                          aria-label={t('notification.deleteYes')}
                        >{t('notification.deleteYes')}</button>
                        <button
                          onClick={handleCancelDelete}
                          style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 900,
                            background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                            border: '1px solid rgba(165,125,65,0.25)', cursor: 'pointer',
                          }}
                          aria-label={t('notification.deleteNo')}
                        >{t('notification.deleteNo')}</button>
                      </div>
                    ) : (
                      <button
                        onClick={e => handleRequestDelete(e, n.id)}
                        aria-label={t('notification.deleteConfirm')}
                        style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: '1px solid rgba(220,38,38,0.22)',
                          background: 'rgba(220,38,38,0.06)',
                          color: '#DC2626', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      ><X size={11} /></button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
