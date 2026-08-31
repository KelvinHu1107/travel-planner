import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'

Sentry.init({
  dsn: 'https://f8bb677ad670f920e05723f5606cc678@o4511971826204672.ingest.us.sentry.io/4511971851370497',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ['localhost', /^https:\/\/travalproject-45649\.web\.app/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})

// 全域 btn-game 按壓抖動回饋
document.body.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.btn-game:not([disabled])')
  if (!btn) return
  btn.classList.remove('btn-jiggle')
  void btn.offsetHeight
  btn.classList.add('btn-jiggle')
}, { passive: true })

document.body.addEventListener('animationend', e => {
  if (e.animationName === 'btn-jiggle') e.target.classList.remove('btn-jiggle')
}, { passive: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
