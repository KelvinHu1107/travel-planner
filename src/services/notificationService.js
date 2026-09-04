import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp,
  writeBatch, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

// 通知有效期：7 天，預扣 5 分鐘讓客戶端時鐘偏快最多 5 分鐘仍能通過 Rules 驗證
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000

// 通知類型
export const NOTIFICATION_TYPES = {
  CARD_ADDED:              'card_added',
  CARD_UPDATED:            'card_updated',
  CARD_DELETED:            'card_deleted',
  MEMBER_JOINED:           'member_joined',
  MEMBER_LEFT:             'member_left',
  TRIP_DELETED:            'trip_deleted',
  TRIP_AUTO_DELETE_WARN:   'trip_auto_delete_warning',
}

// ── CRUD ─────────────────────────────────────

// 建立單筆通知
// Bug #21：不再儲存硬編中文 message，改在 UI 端用 t() 組出多語文字
export async function createNotification(data) {
  const expiresAt = Timestamp.fromMillis(Date.now() + EXPIRY_MS)
  await addDoc(collection(db, 'notifications'), {
    userId:     data.userId,
    tripId:     data.tripId ?? null,
    tripName:   data.tripName ?? '',
    type:       data.type,
    cardTitle:  data.cardTitle ?? '',
    actorName:  data.actorName ?? '',
    actorUid:   data.actorUid ?? '',
    read:       false,
    createdAt:  serverTimestamp(),
    expiresAt,
  })
}

// 為多個成員建立通知（排除觸發者本人）
export async function createNotificationsForMembers({
  members, actorUid, actorName, tripId, tripName, type, cardTitle,
}) {
  if (!Array.isArray(members) || members.length === 0) return
  const targets = members.filter(uid => uid && uid !== actorUid)
  if (targets.length === 0) return
  await Promise.all(
    targets.map(uid =>
      createNotification({
        userId: uid, tripId, tripName, type, cardTitle, actorName, actorUid,
      }).catch(() => {})
    )
  )
}

// 標記為已讀
export async function markAsRead(notificationId) {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true })
}

// 批次標記全部已讀
export async function markAllAsRead(notifications) {
  if (!notifications?.length) return
  const batch = writeBatch(db)
  notifications.forEach(n => {
    if (!n.read) batch.update(doc(db, 'notifications', n.id), { read: true })
  })
  await batch.commit()
}

// 刪除單筆通知
export async function deleteNotification(notificationId) {
  await deleteDoc(doc(db, 'notifications', notificationId))
}

// 刪除某 trip 的所有未到期通知（trip 被刪時呼叫）
// Bug #2/#26/#32：查詢須含 actorUid（== auth.uid）才能通過 Firestore rule 讀取權限；
// 只清理「本使用者作為 actor 送出」的通知，符合 rule delete 條件（actorUid == auth.uid）。
// actorUid 為必要參數，未帶入即不執行。
export async function deleteNotificationsByTrip(tripId, actorUid) {
  if (!tripId || !actorUid) return
  const q = query(
    collection(db, 'notifications'),
    where('tripId', '==', tripId),
    where('actorUid', '==', actorUid),
  )
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})))
}

// ── 即時訂閱 ──────────────────────────────────
// 訂閱使用者的通知；自動過濾 expiresAt < now 的舊通知
export function subscribeToNotifications(userId, callback, onError) {
  if (!userId) return () => {}
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => {
    const now = Date.now()
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(n => {
        const expMs = n.expiresAt?.toMillis?.()
          ?? (n.expiresAt?.seconds ? n.expiresAt.seconds * 1000 : Infinity)
        return expMs > now
      })
    callback(items)
  }, onError ?? (() => {}))
}

// ── 觸發函式 ──────────────────────────────────
// Bug #21：只儲存原始欄位（type/cardTitle/tripName/actorName），render 時再用 t() 組成文字
export async function notifyCardAdded({ members, actorUid, actorName, tripId, tripName, cardTitle }) {
  await createNotificationsForMembers({
    members, actorUid, actorName, tripId, tripName, cardTitle,
    type: NOTIFICATION_TYPES.CARD_ADDED,
  })
}

export async function notifyCardUpdated({ members, actorUid, actorName, tripId, tripName, cardTitle }) {
  await createNotificationsForMembers({
    members, actorUid, actorName, tripId, tripName, cardTitle,
    type: NOTIFICATION_TYPES.CARD_UPDATED,
  })
}

export async function notifyCardDeleted({ members, actorUid, actorName, tripId, tripName, cardTitle }) {
  await createNotificationsForMembers({
    members, actorUid, actorName, tripId, tripName, cardTitle,
    type: NOTIFICATION_TYPES.CARD_DELETED,
  })
}

export async function notifyMemberJoined({ members, actorUid, actorName, tripId, tripName }) {
  await createNotificationsForMembers({
    members, actorUid, actorName, tripId, tripName,
    type: NOTIFICATION_TYPES.MEMBER_JOINED,
  })
}

export async function notifyMemberLeft({ members, actorUid, actorName, tripId, tripName }) {
  await createNotificationsForMembers({
    members, actorUid, actorName, tripId, tripName,
    type: NOTIFICATION_TYPES.MEMBER_LEFT,
  })
}

export async function notifyTripDeleted({ members, actorUid, actorName, tripId, tripName }) {
  await createNotificationsForMembers({
    members, actorUid, actorName, tripId, tripName,
    type: NOTIFICATION_TYPES.TRIP_DELETED,
  })
}
