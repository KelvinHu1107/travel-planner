import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, onSnapshot, serverTimestamp, query, orderBy,
  arrayUnion, arrayRemove, increment, getDocs, where, runTransaction,
} from 'firebase/firestore'
import { db } from './firebase'
import { hashPassword, verifyPassword } from '../utils/crypto'

// 產生 6 碼易讀邀請碼（去掉 0/O/1/I 避免混淆）
function generateTripCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

// ── 使用者 Profile ───────────────────────────
export async function createUserProfile(user) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
      tripCodes: [],
      createdAt: serverTimestamp(),
    })
  }
}

export async function getUserTrips(uid) {
  const q = query(collection(db, 'trips'), where('members', 'array-contains', uid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ code: d.id, ...d.data() }))
}

// 建立新旅遊計畫
export async function createTrip({ name, startDate, endDate, password, uid }) {
  let code
  let exists = true

  while (exists) {
    code = generateTripCode()
    const snap = await getDoc(doc(db, 'trips', code))
    exists = snap.exists()
  }

  const passwordHash = await hashPassword(password)

  await setDoc(doc(db, 'trips', code), {
    name,
    startDate,
    endDate,
    passwordHash,
    password,        // 儲存明文以便在邀請流程中顯示給計畫擁有者
    backgroundImage: null,
    createdAt: serverTimestamp(),
    ownerId: uid ?? null,
    members: uid ? [uid] : [],
  })

  if (uid) {
    await updateDoc(doc(db, 'users', uid), { tripCodes: arrayUnion(code) })
  }

  return code
}

// 加入旅遊計畫（驗證密碼）
export async function joinTrip(code, password, uid) {
  const snap = await getDoc(doc(db, 'trips', code.toUpperCase()))

  if (!snap.exists()) {
    throw new Error('找不到這個旅遊計畫，請確認代碼是否正確')
  }

  const data = snap.data()
  const ok = await verifyPassword(password, data.passwordHash)

  if (!ok) {
    throw new Error('密碼錯誤，請再試一次')
  }

  if (uid) {
    await updateDoc(doc(db, 'trips', code.toUpperCase()), { members: arrayUnion(uid) })
    await updateDoc(doc(db, 'users', uid), { tripCodes: arrayUnion(code.toUpperCase()) })
  }

  return { code: code.toUpperCase(), ...data }
}

// 讀取旅遊計畫資料（已驗證後使用）
export async function getTrip(code) {
  const snap = await getDoc(doc(db, 'trips', code))
  if (!snap.exists()) throw new Error('找不到旅遊計畫')
  return { code, ...snap.data() }
}

// ── 卡片 CRUD ────────────────────────────────

function cardsCol(tripId) {
  return collection(db, 'trips', tripId, 'cards')
}

export async function addCard(tripId, cardData) {
  const { id: _ignore, ...data } = cardData
  const ref = await addDoc(cardsCol(tripId), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateCard(tripId, cardId, updates) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', cardId), updates)
}

export async function deleteCard(tripId, cardId) {
  await deleteDoc(doc(db, 'trips', tripId, 'cards', cardId))
}

export async function getCard(tripId, cardId) {
  const snap = await getDoc(doc(db, 'trips', tripId, 'cards', cardId))
  if (!snap.exists()) throw new Error('卡片不存在')
  return { id: snap.id, ...snap.data() }
}

// 即時監聽：cards 子集合變動 → callback([...cards])
// 回傳 unsubscribe 函式
export function subscribeToCards(tripId, callback, onError) {
  const q = query(cardsCol(tripId), orderBy('createdAt', 'asc'))
  return onSnapshot(q, snap => {
    // pending 的 serverTimestamp 先排最後，避免排序閃爍（Bug #6）
    const cards = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? Infinity
        const tb = b.createdAt?.toMillis?.() ?? Infinity
        return ta - tb
      })
    callback(cards)
  }, onError ?? (() => {}))
}

// 更新旅遊計畫基本資料（背景圖等）
export async function updateTrip(tripId, updates) {
  await updateDoc(doc(db, 'trips', tripId), updates)
}

// ── 儲存容量追蹤 ─────────────────────────────
export async function getStorageUsedMB(tripId) {
  const snap = await getDoc(doc(db, 'trips', tripId))
  return (snap.data()?.storageUsedBytes ?? 0) / (1024 * 1024)
}

export async function addStorageUsedBytes(tripId, bytes) {
  await updateDoc(doc(db, 'trips', tripId), {
    storageUsedBytes: increment(bytes),
  })
}

// 刪除整個旅遊計畫（含所有子集合，並清理所有成員的 tripCodes）（Bug #10）
export async function deleteTrip(tripId, uid) {
  const tripSnap = await getDoc(doc(db, 'trips', tripId))
  const members = tripSnap.exists() ? (tripSnap.data().members ?? []) : []

  const [cardsSnap, todosSnap, packingSnap] = await Promise.all([
    getDocs(cardsCol(tripId)),
    getDocs(todosCol(tripId)),
    getDocs(packingCol(tripId)),
  ])
  await Promise.all([
    ...cardsSnap.docs.map(d => deleteDoc(d.ref)),
    ...todosSnap.docs.map(d => deleteDoc(d.ref)),
    ...packingSnap.docs.map(d => deleteDoc(d.ref)),
  ])
  await deleteDoc(doc(db, 'trips', tripId))

  // 清理所有成員的 tripCodes（Bug #10）
  await Promise.all(
    members.map(memberId =>
      updateDoc(doc(db, 'users', memberId), { tripCodes: arrayRemove(tripId) }).catch(() => {})
    )
  )
}

// 更新旅遊計畫最後瀏覽時間
export async function updateTripLastVisited(tripId) {
  await updateDoc(doc(db, 'trips', tripId), { lastVisitedAt: serverTimestamp() })
}

// 離開旅遊計畫（非擁有者）
export async function leaveTrip(tripId, uid) {
  await updateDoc(doc(db, 'trips', tripId), { members: arrayRemove(uid) })
  if (uid) {
    await updateDoc(doc(db, 'users', uid), { tripCodes: arrayRemove(tripId) })
  }
}

// 取得多位成員的 Profile
export async function getMemberProfiles(uids) {
  if (!uids?.length) return []
  return Promise.all(
    uids.map(async uid => {
      try {
        const snap = await getDoc(doc(db, 'users', uid))
        return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: '未知用戶', email: '' }
      } catch {
        return { uid, displayName: '未知用戶', email: '' }
      }
    })
  )
}

// 清空計畫的所有行程卡片
export async function clearAllCards(tripId) {
  const snap = await getDocs(cardsCol(tripId))
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
}

// 重設計畫加入密碼（同時更新明文與雜湊）
export async function updateTripPassword(tripId, newPassword) {
  const passwordHash = await hashPassword(newPassword)
  await updateDoc(doc(db, 'trips', tripId), { password: newPassword, passwordHash })
}

// 將筆記附加到某張卡片（並刪除原來的筆記卡）
export async function attachNoteToCard(tripId, targetCardId, noteItem, sourceNoteCardId) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', targetCardId), {
    attachedNotes: arrayUnion(noteItem),
  })
  if (sourceNoteCardId) {
    await deleteDoc(doc(db, 'trips', tripId, 'cards', sourceNoteCardId))
  }
}

// ── 卡片附屬待辦（原子操作，避免並發覆蓋）（Bug #4）───────
export async function addAttachedTodo(tripId, cardId, todo) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', cardId), {
    attachedTodos: arrayUnion(todo),
  })
}

export async function removeAttachedTodo(tripId, cardId, todo) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', cardId), {
    attachedTodos: arrayRemove(todo),
  })
}

export async function toggleAttachedTodo(tripId, cardId, todoId) {
  const ref = doc(db, 'trips', tripId, 'cards', cardId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const todos = snap.data().attachedTodos ?? []
    tx.update(ref, {
      attachedTodos: todos.map(t => t.id === todoId ? { ...t, checked: !t.checked } : t),
    })
  })
}

// ── 卡片附屬消費（原子操作）（Bug #4）──────────────────
export async function addAttachedExpense(tripId, cardId, expense) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', cardId), {
    attachedExpenses: arrayUnion(expense),
  })
}

export async function removeAttachedExpense(tripId, cardId, expense) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', cardId), {
    attachedExpenses: arrayRemove(expense),
  })
}

// ── 待辦事項 & 打包清單 CRUD ──────────────────
function todosCol(tripId) { return collection(db, 'trips', tripId, 'todos') }
function packingCol(tripId) { return collection(db, 'trips', tripId, 'packing') }

export function subscribeToList(tripId, type, callback) {
  const col = type === 'packing' ? packingCol(tripId) : todosCol(tripId)
  const q = query(col, orderBy('createdAt', 'asc'))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}

export async function addListItem(tripId, type, data) {
  const col = type === 'packing' ? packingCol(tripId) : todosCol(tripId)
  const ref = await addDoc(col, { ...data, createdAt: serverTimestamp() })
  return ref.id
}

export async function updateListItem(tripId, type, itemId, updates) {
  const colName = type === 'packing' ? 'packing' : 'todos'
  await updateDoc(doc(db, 'trips', tripId, colName, itemId), updates)
}

export async function deleteListItem(tripId, type, itemId) {
  const colName = type === 'packing' ? 'packing' : 'todos'
  await deleteDoc(doc(db, 'trips', tripId, colName, itemId))
}
