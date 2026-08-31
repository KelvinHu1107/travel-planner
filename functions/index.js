const { onRequest } = require('firebase-functions/v2/https')
const CORS_ORIGINS = ['https://travalproject-45649.web.app', 'http://localhost:5173']
const admin = require('firebase-admin')
const serviceAccount = require('./service-account.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

exports.lineAuth = onRequest(
  { cors: CORS_ORIGINS, region: 'asia-east1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const { code, redirectUri } = req.body
    if (!code || !redirectUri) {
      res.status(400).json({ error: 'Missing code or redirectUri' })
      return
    }

    try {
      // ① 用 code 換 LINE access token
      const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: process.env.LINE_CHANNEL_ID,
          client_secret: process.env.LINE_CHANNEL_SECRET,
        }),
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.access_token) {
        throw new Error(`LINE token error: ${JSON.stringify(tokenData)}`)
      }

      // ② 取得 LINE 使用者資料
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      const { userId, displayName, pictureUrl } = await profileRes.json()

      // ③ 建立或更新 Firebase Auth 使用者
      const uid = `line:${userId}`
      try {
        await admin.auth().updateUser(uid, {
          displayName: displayName || '',
          photoURL: pictureUrl || '',
        })
      } catch (e) {
        if (e.code === 'auth/user-not-found') {
          await admin.auth().createUser({
            uid,
            displayName: displayName || '',
            photoURL: pictureUrl || '',
          })
        } else {
          throw e
        }
      }

      // ④ 產生 Firebase Custom Token
      const customToken = await admin.auth().createCustomToken(uid)
      res.json({ customToken, displayName, pictureUrl })
    } catch (err) {
      console.error('[LINE auth error]', err)
      res.status(500).json({ error: err.message })
    }
  }
)

// LIFF flow: accepts access token directly (for LINE in-app browser)
exports.lineAuthToken = onRequest(
  { cors: CORS_ORIGINS, region: 'asia-east1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const { accessToken } = req.body
    if (!accessToken) {
      res.status(400).json({ error: 'Missing accessToken' })
      return
    }

    try {
      // ① 驗證 access token
      const verifyRes = await fetch(
        `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
      )
      const verifyData = await verifyRes.json()
      if (verifyData.client_id !== process.env.LINE_CHANNEL_ID) {
        res.status(400).json({ error: 'Invalid access token' })
        return
      }

      // ② 取得 LINE 使用者資料
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const { userId, displayName, pictureUrl } = await profileRes.json()

      // ③ 建立或更新 Firebase Auth 使用者
      const uid = `line:${userId}`
      try {
        await admin.auth().updateUser(uid, {
          displayName: displayName || '',
          photoURL: pictureUrl || '',
        })
      } catch (e) {
        if (e.code === 'auth/user-not-found') {
          await admin.auth().createUser({
            uid,
            displayName: displayName || '',
            photoURL: pictureUrl || '',
          })
        } else {
          throw e
        }
      }

      // ④ 產生 Firebase Custom Token
      const customToken = await admin.auth().createCustomToken(uid)
      res.json({ customToken, displayName, pictureUrl })
    } catch (err) {
      console.error('[LIFF auth error]', err)
      res.status(500).json({ error: err.message })
    }
  }
)
