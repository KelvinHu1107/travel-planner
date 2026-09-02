import { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToNotifications } from '../services/notificationService'

// Bug #8：使用 Context 讓桌面/手機版共用同一份訂閱，避免重複訂閱
// Bug #23：多加 error 狀態
const NotificationContext = createContext(null)

export function NotificationProvider({ uid, children }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!uid) {
      setNotifications([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const unsub = subscribeToNotifications(
      uid,
      (items) => {
        setNotifications(items)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )
    return () => unsub?.()
  }, [uid])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, error }}>
      {children}
    </NotificationContext.Provider>
  )
}

// 訂閱目前使用者的通知（自動過濾過期通知）
// 回傳 { notifications, unreadCount, loading, error }
// 若上層有 NotificationProvider（傳入相同 uid），共用單一訂閱；否則 fallback 自己訂閱
export function useNotifications(uid) {
  const ctx = useContext(NotificationContext)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const hasCtx = ctx !== null

  useEffect(() => {
    if (hasCtx) return
    if (!uid) {
      setNotifications([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const unsub = subscribeToNotifications(
      uid,
      (items) => {
        setNotifications(items)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )
    return () => unsub?.()
  }, [uid, hasCtx])

  if (hasCtx) return ctx

  const unreadCount = notifications.filter(n => !n.read).length
  return { notifications, unreadCount, loading, error }
}
