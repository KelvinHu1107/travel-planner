import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { TUTORIAL_STEPS } from './steps'
import { createDemoTrip, deleteDemoTrip } from '../services/firestore'
import { useAuth } from '../contexts/AuthContext'

const TutorialContext = createContext(null)

const DEFAULT_STATE = { seen: false, active: false, step: 0, completed: false, demoTripId: null }

function getKey(uid) {
  return uid ? `tripcoworking_tutorial_v2_${uid}` : null
}

function loadStateForUser(uid) {
  const key = getKey(uid)
  if (!key) return DEFAULT_STATE
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATE
  }
}

function saveStateForUser(s, uid) {
  const key = getKey(uid)
  if (!key) return
  try { localStorage.setItem(key, JSON.stringify(s)) } catch {}
}

export function TutorialProvider({ children }) {
  const { currentUser } = useAuth()
  const [state, setState] = useState(DEFAULT_STATE)
  const [demoTripData, setDemoTripData] = useState(null)
  const uidRef = useRef(null)

  // Re-load tutorial state whenever the logged-in user changes
  useEffect(() => {
    const uid = currentUser?.uid ?? null
    if (uid === uidRef.current) return
    uidRef.current = uid
    const loaded = loadStateForUser(uid)
    setState(loaded)
    setDemoTripData(null)

    // Restore active demo trip metadata for this user
    if (uid && loaded.demoTripId && loaded.active) {
      setDemoTripData({
        code: loaded.demoTripId,
        name: '✈️ 台北一日遊（教學範例）',
        startDate: new Date().toISOString().split('T')[0],
        endDate:   new Date().toISOString().split('T')[0],
        isDemoTrip: true,
        members: [uid],
        ownerId: uid,
      })
    }
  }, [currentUser])

  const persist = useCallback((updates) => {
    setState(prev => {
      const next = { ...prev, ...updates }
      saveStateForUser(next, uidRef.current)
      return next
    })
  }, [])

  // When demoTripId clears, also clear local demoTripData
  useEffect(() => {
    if (!state.demoTripId) setDemoTripData(null)
  }, [state.demoTripId])

  const _deleteCurrent = useCallback(() => {
    // Read directly from state ref to avoid stale closure issues
    setState(prev => {
      if (prev.demoTripId) deleteDemoTrip(prev.demoTripId).catch(() => {})
      return prev
    })
  }, [])

  const startTutorial = useCallback(async () => {
    if (!currentUser) return
    // Delete any leftover demo trip from previous session
    const loaded = loadStateForUser(currentUser.uid)
    if (loaded.demoTripId) deleteDemoTrip(loaded.demoTripId).catch(() => {})

    persist({ active: true, step: 0, seen: true, demoTripId: null })

    try {
      const { code, meta } = await createDemoTrip(currentUser.uid)
      const tripData = { code, ...meta }
      setDemoTripData(tripData)
      persist({ demoTripId: code })
    } catch (e) {
      console.warn('Demo trip creation failed:', e)
    }
  }, [currentUser, persist])

  const nextStep = useCallback(() => {
    setState(prev => {
      const next = prev.step + 1
      if (next >= TUTORIAL_STEPS.length) {
        if (prev.demoTripId) deleteDemoTrip(prev.demoTripId).catch(() => {})
        const updated = { ...prev, active: false, completed: true, seen: true, demoTripId: null }
        saveStateForUser(updated, uidRef.current)
        return updated
      }
      const updated = { ...prev, step: next }
      saveStateForUser(updated, uidRef.current)
      return updated
    })
  }, [])

  const skipTutorial = useCallback(() => {
    _deleteCurrent()
    persist({ active: false, seen: true, demoTripId: null })
  }, [_deleteCurrent, persist])

  const restartTutorial = useCallback(async () => {
    if (!currentUser) return
    _deleteCurrent()
    persist({ active: true, step: 0, completed: false, seen: true, demoTripId: null })
    setDemoTripData(null)
    try {
      const { code, meta } = await createDemoTrip(currentUser.uid)
      setDemoTripData({ code, ...meta })
      persist({ demoTripId: code })
    } catch {}
  }, [currentUser, _deleteCurrent, persist])

  const dismissPrompt = useCallback(() => {
    persist({ seen: true })
  }, [persist])

  return (
    <TutorialContext.Provider value={{
      tutorialActive:    state.active,
      tutorialStep:      state.step,
      tutorialCompleted: state.completed,
      tutorialSeen:      state.seen,
      currentStepData:   TUTORIAL_STEPS[state.step] ?? null,
      totalSteps:        TUTORIAL_STEPS.length,
      demoTripId:        state.demoTripId,
      demoTripData,
      startTutorial,
      nextStep,
      skipTutorial,
      restartTutorial,
      dismissPrompt,
    }}>
      {children}
    </TutorialContext.Provider>
  )
}

export function useTutorial() {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error('useTutorial must be inside TutorialProvider')
  return ctx
}
