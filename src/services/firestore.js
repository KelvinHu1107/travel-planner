import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, onSnapshot, serverTimestamp, query, orderBy,
  arrayUnion, arrayRemove, increment, getDocs, where, runTransaction,
} from 'firebase/firestore'
import { db } from './firebase'
import {
  notifyCardAdded, notifyCardUpdated, notifyCardDeleted,
  notifyMemberJoined, notifyMemberLeft, notifyTripDeleted, deleteNotificationsByTrip,
} from './notificationService'

// 提供給呼叫端傳入的觸發者資訊（optional actor）
// 用來讓通知系統知道是誰做的操作
async function getTripMeta(tripId) {
  try {
    const snap = await getDoc(doc(db, 'trips', tripId))
    if (!snap.exists()) return null
    const d = snap.data()
    return { members: d.members ?? [], name: d.name ?? '' }
  } catch { return null }
}

// 產生 6 碼易讀邀請碼（去掉 0/O/1/I 避免混淆）
function generateTripCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
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
    return { isNew: true }
  }
  return { isNew: false }
}

export async function deleteUserProfile(uid) {
  try { await deleteDoc(doc(db, 'users', uid)) } catch {}
}

// 清除使用者遺留的教學用計畫（登入時自動執行）
export async function cleanupDemoTrips(uid) {
  try {
    const q = query(
      collection(db, 'trips'),
      where('ownerId', '==', uid),
      where('isDemoTrip', '==', true)
    )
    const snap = await getDocs(q)
    await Promise.all(snap.docs.map(d => deleteDemoTrip(d.id)))
  } catch {}
}

export async function getUserTrips(uid) {
  const q = query(collection(db, 'trips'), where('members', 'array-contains', uid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ code: d.id, ...d.data() }))
}

// 建立新旅遊計畫
export async function createTrip({ name, startDate, endDate, uid, lang = 'zh' }) {
  const code = generateTripCode()

  await setDoc(doc(db, 'trips', code), {
    name,
    startDate,
    endDate,
    backgroundImage: null,
    createdAt: serverTimestamp(),
    ownerId: uid ?? null,
    members: uid ? [uid] : [],
  })

  if (uid) {
    await updateDoc(doc(db, 'users', uid), { tripCodes: arrayUnion(code) })
  }

  // 預設打包清單項目
  const defaultPacking = lang === 'en' ? [
    { text: 'Passport',      category: 'Documents' },
    { text: 'Flight tickets', category: 'Documents' },
    { text: 'SIM / eSIM',   category: 'Electronics' },
    { text: 'Power bank',   category: 'Electronics' },
    { text: 'Toiletries',   category: 'Toiletries' },
    { text: 'Hair dryer',   category: 'Toiletries' },
    { text: 'Skincare',     category: 'Toiletries' },
    { text: 'Clothes',      category: 'Clothing' },
  ] : [
    { text: '護照',     category: '證件' },
    { text: '機票',     category: '證件' },
    { text: 'SIM卡/eSIM', category: '電子' },
    { text: '行動電源', category: '電子' },
    { text: '盥洗用具', category: '盥洗' },
    { text: '吹風機',   category: '盥洗' },
    { text: '保養品',   category: '盥洗' },
    { text: '換洗衣物', category: '服裝' },
  ]
  await Promise.all(
    defaultPacking.map(item =>
      addDoc(collection(db, 'trips', code, 'packing'), {
        ...item, checked: false, createdAt: serverTimestamp(),
      })
    )
  )

  return code
}

// 加入旅遊計畫（僅需邀請代碼）
// actor: { uid, displayName } — 觸發通知用
export async function joinTrip(code, uid, actor = null) {
  const upperCode = code.toUpperCase()
  const snap = await getDoc(doc(db, 'trips', upperCode))

  if (!snap.exists()) {
    throw new Error('TRIP_NOT_FOUND')
  }

  const data = snap.data()
  const wasAlreadyMember = uid && Array.isArray(data.members) && data.members.includes(uid)

  if (uid) {
    await updateDoc(doc(db, 'trips', upperCode), { members: arrayUnion(uid) })
    await updateDoc(doc(db, 'users', uid), { tripCodes: arrayUnion(upperCode) })
  }

  // Bug #6/#7：通知走 fire-and-forget，不 block 加入流程
  if (uid && !wasAlreadyMember) {
    notifyMemberJoined({
      members: data.members ?? [],
      actorUid: uid,
      actorName: actor?.displayName || '',
      tripId: upperCode,
      tripName: data.name ?? '',
    }).catch(() => {})
  }

  return { code: upperCode, ...data }
}

// 讀取旅遊計畫資料（已驗證後使用）
export async function getTrip(code) {
  const snap = await getDoc(doc(db, 'trips', code))
  if (!snap.exists()) throw new Error('TRIP_NOT_FOUND')
  return { code, ...snap.data() }
}

// ── 卡片 CRUD ────────────────────────────────

function cardsCol(tripId) {
  return collection(db, 'trips', tripId, 'cards')
}

export async function addCard(tripId, cardData, actor = null) {
  const { id: _ignore, ...data } = cardData
  const ref = await addDoc(cardsCol(tripId), {
    ...data,
    createdAt: serverTimestamp(),
  })
  // Bug #6/#7：通知走 fire-and-forget，不 block 使用者寫入流程
  if (actor?.uid) {
    getTripMeta(tripId).then(meta => {
      if (!meta) return
      notifyCardAdded({
        members: meta.members,
        actorUid: actor.uid,
        actorName: actor.displayName || '',
        tripId,
        tripName: meta.name,
        cardTitle: data.title || '',
      }).catch(() => {})
    }).catch(() => {})
  }
  return ref.id
}

export async function updateCard(tripId, cardId, updates, actor = null) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', cardId), updates)
  // Bug #6/#7：通知走 fire-and-forget
  if (actor?.uid) {
    (async () => {
      const meta = await getTripMeta(tripId)
      let cardTitle = updates.title || ''
      if (!cardTitle) {
        try {
          const cs = await getDoc(doc(db, 'trips', tripId, 'cards', cardId))
          cardTitle = cs.exists() ? (cs.data().title || '') : ''
        } catch {}
      }
      if (meta) {
        notifyCardUpdated({
          members: meta.members,
          actorUid: actor.uid,
          actorName: actor.displayName || '',
          tripId,
          tripName: meta.name,
          cardTitle: cardTitle || '',
        }).catch(() => {})
      }
    })().catch(() => {})
  }
}

export async function deleteCard(tripId, cardId, actor = null) {
  // 先讀取卡片標題（在刪除前，避免拿不到）
  let cardTitle = ''
  if (actor?.uid) {
    try {
      const cs = await getDoc(doc(db, 'trips', tripId, 'cards', cardId))
      if (cs.exists()) cardTitle = cs.data().title || ''
    } catch {}
  }
  await deleteDoc(doc(db, 'trips', tripId, 'cards', cardId))
  // Bug #6/#7：通知走 fire-and-forget
  if (actor?.uid) {
    getTripMeta(tripId).then(meta => {
      if (!meta) return
      notifyCardDeleted({
        members: meta.members,
        actorUid: actor.uid,
        actorName: actor.displayName || '',
        tripId,
        tripName: meta.name,
        cardTitle: cardTitle || '',
      }).catch(() => {})
    }).catch(() => {})
  }
}

export async function getCard(tripId, cardId) {
  const snap = await getDoc(doc(db, 'trips', tripId, 'cards', cardId))
  if (!snap.exists()) throw new Error('CARD_NOT_FOUND')
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
// actor: { uid, displayName } — 用於發送「trip 已被刪除」通知給其他成員
export async function deleteTrip(tripId, uid, actor = null) {
  const tripSnap = await getDoc(doc(db, 'trips', tripId))
  if (tripSnap.exists() && tripSnap.data().ownerId !== uid) {
    throw new Error('PERMISSION_DENIED')
  }
  const members = tripSnap.exists() ? (tripSnap.data().members ?? []) : []
  const tripName = tripSnap.exists() ? (tripSnap.data().name ?? '') : ''

  // Bug #4：必須 await 通知建立完成後才能刪除 trip doc
  // notification create rule 會 get(trips/tripId).data.members，trip 被刪後會失敗
  if (actor?.uid && members.length > 0) {
    await notifyTripDeleted({
      members,
      actorUid: actor.uid,
      actorName: actor.displayName || '',
      tripId,
      tripName,
    }).catch(() => {})
  }

  // trip doc 先刪：立即阻斷並發的子集合寫入（rules 需要 trip.members 驗證）
  // 如此即使有成員在刪除過程中新增卡片，那些卡片也無法通過 rules 而被阻擋
  await deleteDoc(doc(db, 'trips', tripId))

  // 子集合清理：fire-and-forget，孤立文件因 rules 無法被任何人存取，不影響安全性
  Promise.all([
    getDocs(cardsCol(tripId)),
    getDocs(todosCol(tripId)),
    getDocs(packingCol(tripId)),
    getDocs(collection(db, 'trips', tripId, 'expenses')),
  ]).then(([cardsSnap, todosSnap, packingSnap, expensesSnap]) =>
    Promise.all([
      ...cardsSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
      ...todosSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
      ...packingSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
      ...expensesSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
    ])
  ).catch(() => {})

  // Bug #4：只能清理自己的 tripCodes（Firestore rules 不允許寫其他人的 users doc）
  // 其他成員的 tripCodes 會有殘留，但當他們開啟已刪除的 trip 時會顯示「找不到」，可自行離開
  if (uid) {
    await updateDoc(doc(db, 'users', uid), { tripCodes: arrayRemove(tripId) }).catch(() => {})
  }

  // Bug #2/#9/#26/#32: 只清理 actor 自己送出的通知（Firestore rule 允許 actorUid == auth.uid 刪除）
  // 複合 where('type','in',...) 查詢需要額外索引且違反 read rule，改用 actorUid 過濾
  if (uid) {
    deleteNotificationsByTrip(tripId, uid).catch(() => {})
  }
}

// 更新旅遊計畫最後瀏覽時間
export async function updateTripLastVisited(tripId) {
  await updateDoc(doc(db, 'trips', tripId), { lastVisitedAt: serverTimestamp() })
}

// 離開旅遊計畫（非擁有者）
export async function leaveTrip(tripId, uid, actor = null) {
  const tripSnap = await getDoc(doc(db, 'trips', tripId))
  const tripData = tripSnap.exists() ? tripSnap.data() : {}
  const members  = tripData.members ?? []
  const tripName = tripData.name ?? ''

  // Bug #2/#3：先發送通知（此時 actor 仍為 members），再 arrayRemove
  // 通知的 create rule 需 auth.uid in trip.members，一定要在移除前建立
  const remaining = members.filter(m => m !== uid)
  if (actor?.uid && remaining.length > 0) {
    await notifyMemberLeft({
      members: remaining,
      actorUid: actor.uid,
      actorName: actor.displayName || '',
      tripId,
      tripName,
    }).catch(() => {})
  }

  await updateDoc(doc(db, 'trips', tripId), { members: arrayRemove(uid) })
  if (uid) {
    await updateDoc(doc(db, 'users', uid), { tripCodes: arrayRemove(tripId) }).catch(() => {})
  }

  // 清理離開者自己的 trip 相關通知（leaver 是 userId，符合 rule 允許自刪）
  if (uid) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('tripId', '==', tripId),
        where('userId', '==', uid),
      )
      const snap = await getDocs(q)
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})))
    } catch {}
  }
}

// ── 教學用模擬計畫 ───────────────────────────
export async function createDemoTrip(uid, lang = 'zh') {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]

  let code
  let exists = true
  while (exists) {
    code = generateTripCode()
    const snap = await getDoc(doc(db, 'trips', code))
    exists = snap.exists()
  }

  const isEn = lang === 'en'

  const meta = {
    name: isEn ? '✈️ Tokyo 1-Day Tour (Tutorial)' : '✈️ 台北一日遊（教學範例）',
    startDate: dateStr,
    endDate: dateStr,
    passwordHash: 'demo',
    backgroundImage: null,
    ownerId: uid,
    members: [uid],
    isDemoTrip: true,
  }

  await setDoc(doc(db, 'trips', code), { ...meta, createdAt: serverTimestamp() })

  const cardsData = isEn ? [
    // Senso-ji at 08:00–08:30 → drag tutorial highlight card; 08:30–10:30 left empty as drag target
    { type: 'attraction', title: 'Senso-ji Temple', startTime: '08:00', duration: 30,
      address: '2 Chome-3-1 Asakusa, Taito City, Tokyo', lat: 35.7148, lng: 139.7967 },
    { type: 'transport', title: 'Airport Express → Shinjuku Station', startTime: '10:30', duration: 60,
      from: 'Narita International Airport', to: 'Shinjuku Station', mode: 'transit',
      address: 'Shinjuku, Tokyo', lat: 35.6896, lng: 139.7006 },
    { type: 'restaurant', title: 'Ichiran Ramen (Shinjuku)', startTime: '12:30', duration: 75,
      address: 'Kabukicho, Shinjuku City, Tokyo', lat: 35.6951, lng: 139.7037 },
    { type: 'attraction', title: 'Tokyo Skytree Observatory', startTime: '14:30', duration: 120,
      address: '1 Chome-1-2 Oshiage, Sumida City, Tokyo', lat: 35.7101, lng: 139.8107 },
    { type: 'attraction', title: 'Shibuya Crossing (Golden Hour)', startTime: '17:00', duration: 90,
      address: 'Dogenzaka, Shibuya City, Tokyo', lat: 35.6595, lng: 139.7004 },
    { type: 'accommodation', title: 'Hotel Gracery Shinjuku Check-in', startTime: '19:30', duration: 30,
      address: 'Kabukicho, Shinjuku City, Tokyo', lat: 35.6951, lng: 139.7040 },
    { type: 'expense', title: 'Transport + Entrance Fees', startTime: '20:00', duration: 0,
      amount: 3500, currency: 'JPY', expenseCategory: 'transport' },
  ] : [
    // 龍山寺在 08:00–08:30 → 拖曳教學的高亮卡片；08:30–10:30 留空作為拖曳目標
    { type: 'attraction', title: '龍山寺', startTime: '08:00', duration: 30,
      address: '台北市萬華區廣州街211號', lat: 25.0373, lng: 121.4999,
      placeId: 'ChIJkUQFGj2rQjQRfqpbMd3jFwk' },
    { type: 'transport', title: '機場快線 → 台北車站', startTime: '10:30', duration: 60,
      from: '桃園國際機場', to: '台北車站', mode: 'transit',
      address: '台北市中正區北平西路3號', lat: 25.0478, lng: 121.5170 },
    { type: 'restaurant', title: '鼎泰豐（信義店）', startTime: '12:30', duration: 75,
      address: '台北市信義區市府路45號B1', lat: 25.0406, lng: 121.5660,
      placeId: 'ChIJQWW8kL-rQjQRivAyCQeQGOg' },
    { type: 'attraction', title: '台北101 觀景台', startTime: '14:30', duration: 120,
      address: '台北市信義區信義路五段7號', lat: 25.0339, lng: 121.5645,
      placeId: 'ChIJSTECk_6rQjQRFSPeBIoAJmY' },
    { type: 'attraction', title: '象山步道（夕陽打卡）', startTime: '17:00', duration: 90,
      address: '台北市信義區信義路五段150巷', lat: 25.0253, lng: 121.5746 },
    { type: 'accommodation', title: '台北晶華酒店 Check-in', startTime: '19:30', duration: 30,
      address: '台北市中山區中山北路二段39之3號', lat: 25.0507, lng: 121.5314,
      placeId: 'ChIJ2WcgMgqrQjQRl5iChFN-6OA' },
    { type: 'expense', title: '今日交通 + 門票', startTime: '20:00', duration: 0,
      amount: 850, currency: 'TWD', expenseCategory: 'transport' },
  ]

  const todosData = isEn ? [
    { title: 'Apply for travel insurance', checked: false },
    { title: 'Reserve restaurant (book in advance)', checked: true },
    { title: 'Check Skytree ticket prices', checked: false },
  ] : [
    { title: '申請旅行保險', checked: false },
    { title: '預約鼎泰豐（建議提前）', checked: true },
    { title: '查詢台北101門票優惠', checked: false },
  ]

  const packingData = isEn ? [
    { title: 'Passport', category: 'Documents', checked: true },
    { title: 'IC Card / Credit Card', category: 'Wallet', checked: false },
    { title: 'Charger + Power bank', category: 'Electronics', checked: false },
    { title: 'Sunscreen', category: 'Toiletries', checked: false },
    { title: 'Comfortable walking shoes', category: 'Clothing', checked: true },
  ] : [
    { title: '護照', category: '證件', checked: true },
    { title: '悠遊卡 / 信用卡', category: '錢包', checked: false },
    { title: '充電器 + 行動電源', category: '電子', checked: false },
    { title: '防曬乳', category: '盥洗', checked: false },
    { title: '舒適的步行鞋', category: '服裝', checked: true },
  ]

  await Promise.all([
    ...cardsData.map(c => addDoc(collection(db, 'trips', code, 'cards'), { ...c, day: dateStr, createdAt: serverTimestamp() })),
    ...todosData.map(t => addDoc(collection(db, 'trips', code, 'todos'), { ...t, createdAt: serverTimestamp() })),
    ...packingData.map(p => addDoc(collection(db, 'trips', code, 'packing'), { ...p, createdAt: serverTimestamp() })),
  ])

  return { code, meta }
}

export async function deleteDemoTrip(tripId) {
  try {
    await deleteDoc(doc(db, 'trips', tripId))
    Promise.all([
      getDocs(collection(db, 'trips', tripId, 'cards')),
      getDocs(collection(db, 'trips', tripId, 'todos')),
      getDocs(collection(db, 'trips', tripId, 'packing')),
      getDocs(collection(db, 'trips', tripId, 'expenses')),
    ]).then(([cardsSnap, todosSnap, packingSnap, expensesSnap]) =>
      Promise.all([
        ...cardsSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
        ...todosSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
        ...packingSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
        ...expensesSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})),
      ])
    ).catch(() => {})
  } catch { /* already deleted or doesn't exist */ }
}

// 取得多位成員的 Profile
export async function getMemberProfiles(uids, unknownLabel = '?') {
  if (!uids?.length) return []
  return Promise.all(
    uids.map(async uid => {
      try {
        const snap = await getDoc(doc(db, 'users', uid))
        return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: unknownLabel, email: '' }
      } catch {
        return { uid, displayName: unknownLabel, email: '' }
      }
    })
  )
}

// 清空計畫的所有行程卡片
// Bug #5：加 actor 並發送單一「清空」通知，避免對每張卡片各發一則
export async function clearAllCards(tripId, actor = null) {
  const snap = await getDocs(cardsCol(tripId))
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))

  if (actor?.uid && snap.docs.length > 0) {
    const meta = await getTripMeta(tripId).catch(() => null)
    if (meta) {
      // 沿用 card_deleted 型別，用 cardTitle: '' 表示「清空全部」
      notifyCardDeleted({
        members: meta.members,
        actorUid: actor.uid,
        actorName: actor.displayName || '',
        tripId,
        tripName: meta.name,
        cardTitle: '',
      }).catch(() => {})
    }
  }
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

// Bug #11：用 transaction 依 note.id 執行 add/edit/delete，避免用整個陣列覆寫造成並發資料遺失
// op: { kind: 'add', note }
//   | { kind: 'edit', id, patch }
//   | { kind: 'delete', id }
export async function saveAttachedNotes(tripId, cardId, op) {
  const ref = doc(db, 'trips', tripId, 'cards', cardId)
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const current = Array.isArray(snap.data().attachedNotes) ? snap.data().attachedNotes : []
    let next = current
    if (op?.kind === 'add' && op.note) {
      next = [...current, op.note]
    } else if (op?.kind === 'edit' && op.id) {
      next = current.map(n => n?.id === op.id ? { ...n, ...op.patch } : n)
    } else if (op?.kind === 'delete' && op.id) {
      next = current.filter(n => n?.id !== op.id)
    } else {
      return
    }
    tx.update(ref, { attachedNotes: next })
  })
}

// ── 卡片附屬待辦（原子操作，避免並發覆蓋）（Bug #4）───────
export async function addAttachedTodo(tripId, cardId, todo) {
  await updateDoc(doc(db, 'trips', tripId, 'cards', cardId), {
    attachedTodos: arrayUnion(todo),
  })
}

export async function removeAttachedTodo(tripId, cardId, todoId) {
  const ref = doc(db, 'trips', tripId, 'cards', cardId)
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const todos = (snap.data().attachedTodos ?? []).filter(t => t.id !== todoId)
    tx.update(ref, { attachedTodos: todos })
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

// ── 獨立開銷 CRUD ─────────────────────────────
function expensesCol(tripId) { return collection(db, 'trips', tripId, 'expenses') }

export async function addExpense(tripId, data) {
  const ref = await addDoc(expensesCol(tripId), { ...data, createdAt: serverTimestamp() })
  return ref.id
}

export function subscribeToExpenses(tripId, callback, onError) {
  const q = query(expensesCol(tripId), orderBy('createdAt', 'asc'))
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError ?? (() => {}))
}

export async function deleteExpense(tripId, expenseId) {
  await deleteDoc(doc(db, 'trips', tripId, 'expenses', expenseId))
}

export async function updateExpense(tripId, expenseId, updates) {
  await updateDoc(doc(db, 'trips', tripId, 'expenses', expenseId), updates)
}

// 更新開銷是否列入結算（勾選狀態）
export async function updateExpenseIncluded(tripId, expenseId, included) {
  await updateDoc(doc(db, 'trips', tripId, 'expenses', expenseId), { included })
}

export async function submitFeedback({ tripId, tripName, userId, userEmail, message }) {
  await addDoc(collection(db, 'feedback'), {
    tripId: tripId || null,
    tripName: tripName || '',
    userId: userId || null,
    userEmail: userEmail || '',
    message,
    status: 'new',
    createdAt: serverTimestamp(),
  })
}
