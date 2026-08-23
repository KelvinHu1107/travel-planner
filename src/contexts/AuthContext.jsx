import { createContext, useContext, useState, useEffect, useRef } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword as firebaseUpdatePassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth'
import { auth } from '../services/firebase'
import { createUserProfile } from '../services/firestore'

const AuthContext = createContext(null)

const INACTIVITY_MS = 24 * 60 * 60 * 1000 // 24 小時

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const lastSaveRef = useRef(0)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setCurrentUser(user)
      setAuthLoading(false)
      if (user) {
        if (!localStorage.getItem('last_activity')) {
          localStorage.setItem('last_activity', Date.now().toString())
        }
      } else {
        localStorage.removeItem('last_activity')
      }
    })
    return unsub
  }, [])

  // 節流記錄使用者活動（每分鐘最多寫一次）
  useEffect(() => {
    const track = () => {
      const now = Date.now()
      if (now - lastSaveRef.current > 60_000) {
        lastSaveRef.current = now
        localStorage.setItem('last_activity', now.toString())
      }
    }
    window.addEventListener('mousemove', track, { passive: true })
    window.addEventListener('keydown', track, { passive: true })
    window.addEventListener('click', track, { passive: true })
    return () => {
      window.removeEventListener('mousemove', track)
      window.removeEventListener('keydown', track)
      window.removeEventListener('click', track)
    }
  }, [])

  // 視窗重新獲得焦點時檢查閒置時間，超過 24 小時自動登出
  useEffect(() => {
    const check = async () => {
      if (!auth.currentUser) return
      const last = parseInt(localStorage.getItem('last_activity') ?? '0', 10)
      if (last && Date.now() - last > INACTIVITY_MS) {
        localStorage.removeItem('last_activity')
        await firebaseSignOut(auth)
      }
    }
    window.addEventListener('focus', check)
    check()
    return () => window.removeEventListener('focus', check)
  }, [])

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)
    await createUserProfile(result.user)
    return result.user
  }

  const signUpWithEmail = async (email, password, displayName) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) await updateProfile(user, { displayName })
    await createUserProfile({ ...user, displayName: displayName || user.displayName })
    return user
  }

  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const signOut = () => firebaseSignOut(auth)

  const sendReset = (email) => sendPasswordResetEmail(auth, email)

  const changePassword = async (currentPassword, newPassword) => {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword)
    await reauthenticateWithCredential(currentUser, credential)
    await firebaseUpdatePassword(currentUser, newPassword)
  }

  const isEmailUser = currentUser?.providerData?.[0]?.providerId === 'password'

  return (
    <AuthContext.Provider value={{
      currentUser, authLoading,
      signInWithGoogle, signUpWithEmail, signInWithEmail,
      signOut, sendReset, changePassword, isEmailUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
