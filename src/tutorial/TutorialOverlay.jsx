import { useEffect, useRef, useState } from 'react'
import { useTutorial } from './TutorialContext'
import { useLanguage } from '../i18n/LanguageContext'

const PAD        = 10   // spotlight padding around element
const GAP        = 10   // gap between spotlight edge and bubble
const BOT_PAD    = 16   // extra bottom clearance (Android nav bar)

function queryEl(targetId) {
  if (!targetId) return null
  return document.querySelector(`[data-tutorial-id="${targetId}"]`)
}

function getRect(targetId) {
  const el = queryEl(targetId)
  return el ? el.getBoundingClientRect() : null
}

const BUBBLE_H_EST = 290  // generous estimate for bubble height

// Returns { style, side, arrowLeft } for the bubble
function bubbleInfo(rect, screenW, screenH) {
  const BW = Math.min(screenW - 40, 260)

  if (!rect) {
    return {
      style: { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: BW },
      side: null,
      arrowLeft: null,
    }
  }

  // Bottom bar elements: center bubble
  if (rect.top > screenH * 0.75) {
    return {
      style: { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: BW },
      side: null,
      arrowLeft: null,
    }
  }

  const sTop    = rect.top    - PAD
  const sBottom = rect.bottom + PAD
  const cx      = rect.left + rect.width / 2
  const leftPx  = Math.min(Math.max(12, cx - BW / 2), screenW - BW - 12)

  const usableH    = screenH - BOT_PAD
  const spaceBelow = usableH - sBottom - GAP
  const spaceAbove = sTop - GAP

  const side = (spaceBelow >= 175 || spaceBelow >= spaceAbove) ? 'below' : 'above'

  let style
  if (side === 'below') {
    const topVal = Math.min(sBottom + GAP, usableH - BUBBLE_H_EST)
    style = { top: Math.max(GAP, topVal), left: leftPx, width: BW }
  } else {
    const topVal = sTop - GAP - BUBBLE_H_EST
    style = { top: Math.max(GAP, topVal), left: leftPx, width: BW }
  }

  const arrowLeft = Math.min(Math.max(8, Math.round(cx - leftPx - 9)), BW - 26)

  return { style, side, arrowLeft }
}

// Red bouncing arrow — reused by both drag and interactive steps
function RedArrow({ left, top, transform, direction = 'down' }) {
  return (
    <div style={{
      position: 'fixed',
      left,
      top,
      transform,
      zIndex: 10006,
      pointerEvents: 'none',
    }}>
      <div style={{
        animation: direction === 'right'
          ? 'tutorial-bounce-right 1.1s ease-in-out infinite'
          : direction === 'left'
            ? 'tutorial-bounce-left 1.1s ease-in-out infinite'
            : 'tutorial-drag-bounce 1.1s ease-in-out infinite',
        fontSize: 28,
        color: '#DC2626',
        filter: 'drop-shadow(0 0 6px rgba(220,38,38,0.75))',
        lineHeight: 1,
      }}>
        {direction === 'right' ? '→' : direction === 'left' ? '←' : '↓'}
      </div>
    </div>
  )
}

export default function TutorialOverlay() {
  const { tutorialActive, tutorialStep, currentStepData, totalSteps, steps, nextStep, skipTutorial } = useTutorial()
  const { t } = useLanguage()

  const [rect, setRect]       = useState(null)
  const [visible, setVisible] = useState(false)
  const measureTimerRef       = useRef(null)
  const clickCleanRef         = useRef(null)

  // Measure target element with retry
  useEffect(() => {
    if (!tutorialActive || !currentStepData) { setVisible(false); setRect(null); return }

    setVisible(false)
    setRect(null)
    if (measureTimerRef.current) { clearTimeout(measureTimerRef.current); measureTimerRef.current = null }

    let cancelled  = false
    let attempts   = 0
    const MAX      = 30

    function tryFind() {
      if (cancelled) return
      if (!currentStepData.targetId) {
        setRect(null)
        setVisible(true)
        return
      }
      const r = getRect(currentStepData.targetId)
      if (r) {
        measureTimerRef.current = setTimeout(() => {
          if (cancelled) return
          const r2 = getRect(currentStepData.targetId) ?? r
          setRect(r2)
          setVisible(true)
        }, 250)
      } else {
        attempts++
        if (attempts >= MAX) {
          setRect(null)
          setVisible(true)
        } else {
          measureTimerRef.current = setTimeout(tryFind, 50)
        }
      }
    }

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(tryFind)
      return () => cancelAnimationFrame(raf2)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      if (measureTimerRef.current) { clearTimeout(measureTimerRef.current); measureTimerRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialActive, currentStepData?.id])

  // Re-measure on resize or scroll
  useEffect(() => {
    if (!tutorialActive || !currentStepData?.targetId) return
    const remeasure = () => {
      const r = getRect(currentStepData.targetId)
      if (r) setRect(r)
    }
    window.addEventListener('resize', remeasure)
    window.visualViewport?.addEventListener('resize', remeasure)
    document.addEventListener('scroll', remeasure, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', remeasure)
      window.visualViewport?.removeEventListener('resize', remeasure)
      document.removeEventListener('scroll', remeasure, { capture: true })
    }
  }, [tutorialActive, currentStepData])

  // Attach click listener on interactive steps
  useEffect(() => {
    if (clickCleanRef.current) { clickCleanRef.current(); clickCleanRef.current = null }
    if (!tutorialActive || !currentStepData?.interactive || !currentStepData?.targetId) return

    let cancelled  = false
    let retryCount = 0

    function attach() {
      if (cancelled) return
      const el = queryEl(currentStepData.targetId)
      if (!el) {
        retryCount++
        if (retryCount < 25) setTimeout(attach, 100)
        return
      }
      const handler = () => { if (!cancelled) nextStep() }
      el.addEventListener('click', handler, { once: true })
      clickCleanRef.current = () => el.removeEventListener('click', handler)
    }

    const raf = requestAnimationFrame(attach)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (clickCleanRef.current) { clickCleanRef.current(); clickCleanRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialActive, currentStepData?.id, nextStep])

  // Apply shake animation to drag-card during requireDrag step; stop on first drag
  useEffect(() => {
    if (!tutorialActive || !currentStepData?.requireDrag || !currentStepData?.targetId) return
    let tries = 0
    let timer = null
    let stopHandler = null

    function tryApply() {
      const el = queryEl(currentStepData.targetId)
      if (el) {
        el.style.animation = 'tutorial-card-shake 0.65s ease-in-out infinite'
        stopHandler = () => { el.style.animation = '' }
        el.addEventListener('pointerdown', stopHandler, { once: true })
      } else if (tries++ < 20) {
        timer = setTimeout(tryApply, 100)
      }
    }
    tryApply()

    return () => {
      clearTimeout(timer)
      const el = queryEl(currentStepData?.targetId)
      if (el) {
        el.style.animation = ''
        if (stopHandler) el.removeEventListener('pointerdown', stopHandler)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialActive, currentStepData?.id])

  if (!tutorialActive || !currentStepData || !visible) return null

  const screenW   = window.innerWidth
  const screenH   = window.visualViewport?.height ?? window.innerHeight
  const hasTarget = !!rect
  const requireDrag = !!currentStepData.requireDrag

  // ── requireDrag steps: extended spotlight + left-offset red arrow + shake ──
  if (requireDrag) {
    const BW = Math.min(screenW - 40, 260)

    let spotTop = 0, spotHeight = 0, spotLeft = 0, spotWidth = 0
    if (hasTarget) {
      const extUp   = rect.height
      const extDown = rect.height * 4
      spotTop    = Math.max(0, rect.top - extUp - PAD)
      const spotBottom = Math.min(screenH, rect.bottom + extDown + PAD)
      spotHeight = spotBottom - spotTop
      spotLeft   = rect.left - PAD
      spotWidth  = rect.width + PAD * 2
    }

    const bStyle = hasTarget
      ? { left: '50%', bottom: screenH - spotTop + 8, transform: 'translateX(-50%)', width: BW }
      : { left: '50%', bottom: BOT_PAD + 16, transform: 'translateX(-50%)', width: BW }

    // Arrow: near left edge of card (~8% from left)
    const arrowLeft = hasTarget ? rect.left + rect.width * 0.08 : null
    const arrowTop  = hasTarget ? rect.top - 48 : null

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>

        {hasTarget ? (
          <>
            <div style={{
              position: 'fixed',
              top: spotTop, left: spotLeft,
              width: spotWidth, height: spotHeight,
              borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.82)',
              zIndex: 10001, pointerEvents: 'none',
            }} />
            <div style={{
              position: 'fixed',
              top: spotTop, left: spotLeft,
              width: spotWidth, height: spotHeight,
              borderRadius: 12,
              border: '2px solid rgba(255,210,60,0.95)',
              animation: 'tutorial-ring-pulse 1.6s ease-in-out infinite',
              zIndex: 10003, pointerEvents: 'none',
            }} />
          </>
        ) : (
          <div onClick={e => e.stopPropagation()} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
            zIndex: 10001, pointerEvents: 'all',
          }} />
        )}

        {/* Red arrow: left side of card */}
        {hasTarget && (
          <RedArrow left={arrowLeft} top={arrowTop} transform="translateX(-50%)" />
        )}

        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            ...bStyle,
            zIndex: 10004,
            pointerEvents: 'all',
            background: '#FFFCEE',
            borderRadius: 16,
            padding: '14px 16px 12px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.28), 0 2px 0 rgba(140,100,30,0.18)',
            border: '1.5px solid rgba(180,130,40,0.22)',
            animation: 'tutorial-bubble-in 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, color: '#92400E',
              background: 'rgba(180,83,9,0.10)', borderRadius: 20, padding: '1px 7px',
              whiteSpace: 'nowrap',
            }}>
              {tutorialStep + 1} / {totalSteps}
            </span>
            <div style={{ flex: 1, height: 3, borderRadius: 3, background: 'rgba(180,130,40,0.15)' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${((tutorialStep + 1) / totalSteps) * 100}%`,
                background: 'linear-gradient(90deg, #D97706, #B45309)',
                transition: 'width 0.4s',
              }} />
            </div>
          </div>

          <div style={{ fontSize: 15, fontWeight: 900, color: '#78350F', marginBottom: 7, lineHeight: 1.3 }}>
            {currentStepData.title}
          </div>

          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
            {!hasTarget && currentStepData.navHint
              ? `📍 ${currentStepData.navHint}\n\n${currentStepData.body}`
              : currentStepData.body}
          </div>

          <div style={{
            marginTop: 10, fontSize: 13, fontWeight: 900, color: '#DC2626',
            background: 'rgba(220,38,38,0.08)', borderRadius: 8,
            padding: '8px 10px', textAlign: 'center', lineHeight: 1.4,
          }}>
            {currentStepData.actionHint ?? t('tutorial.dragHint')}
          </div>

          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', margin: '10px 0 8px' }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                height: 4, borderRadius: 2,
                width: i === tutorialStep ? 16 : 4,
                background: i === tutorialStep ? '#B45309' : i < tutorialStep ? '#D97706' : 'rgba(180,130,40,0.2)',
                transition: 'all 0.25s',
              }} />
            ))}
          </div>

          <button onClick={skipTutorial} style={{
            width: '100%', padding: '9px 8px', borderRadius: 10,
            border: '1.5px solid rgba(180,130,40,0.25)',
            background: 'transparent', color: '#92400E',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {t('tutorial.skip')}
          </button>
        </div>
      </div>
    )
  }

  // ── Normal spotlight steps ──
  const { style: bStyle, side, arrowLeft } = bubbleInfo(rect, screenW, screenH)
  const isInteractive = !!(currentStepData.interactive && hasTarget)
  const isFinish      = !!currentStepData.finish

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>

      {/* ── Overlay + spotlight ── */}
      {hasTarget ? (
        <>
          <div style={{
            position: 'fixed',
            top: rect.top - PAD, left: rect.left - PAD,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.82)',
            zIndex: 10001, pointerEvents: 'none',
          }} />
          <div style={{
            position: 'fixed',
            top: rect.top - PAD, left: rect.left - PAD,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            borderRadius: 12,
            border: '2px solid rgba(255,210,60,0.95)',
            animation: 'tutorial-ring-pulse 1.6s ease-in-out infinite',
            zIndex: 10003, pointerEvents: 'none',
          }} />

          {/* Click blockers outside spotlight */}
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD), zIndex: 10002, pointerEvents: 'all' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: rect.bottom + PAD, left: 0, right: 0, bottom: 0, zIndex: 10002, pointerEvents: 'all' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2, zIndex: 10002, pointerEvents: 'all' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: rect.top - PAD, left: rect.right + PAD, right: 0, height: rect.height + PAD * 2, zIndex: 10002, pointerEvents: 'all' }} />

          {/* Blocker over spotlight for non-interactive steps */}
          {!isInteractive && (
            <div onClick={e => e.stopPropagation()} style={{
              position: 'fixed',
              top: rect.top - PAD, left: rect.left - PAD,
              width: rect.width + PAD * 2, height: rect.height + PAD * 2,
              zIndex: 10002, pointerEvents: 'all',
            }} />
          )}

          {/* Red bouncing arrow for interactive steps */}
          {isInteractive && (
            rect.top < 120 ? (
              <RedArrow
                left={rect.right + 10}
                top={rect.top + rect.height / 2}
                transform="translateY(-50%)"
                direction="left"
              />
            ) : (
              <RedArrow
                left={rect.left + rect.width / 2}
                top={rect.top - 48}
                transform="translateX(-50%)"
              />
            )
          )}
        </>
      ) : (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
          zIndex: 10001, pointerEvents: 'all',
        }} />
      )}

      {/* ── Instruction Bubble ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          ...bStyle,
          zIndex: 10004,
          pointerEvents: 'all',
          background: '#FFFCEE',
          borderRadius: 16,
          padding: '14px 16px 12px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.28), 0 2px 0 rgba(140,100,30,0.18)',
          border: '1.5px solid rgba(180,130,40,0.22)',
          animation: 'tutorial-bubble-in 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {hasTarget && side === 'below' && (
          <div style={{
            position: 'absolute', top: -9, left: arrowLeft,
            width: 0, height: 0,
            borderLeft: '9px solid transparent',
            borderRight: '9px solid transparent',
            borderBottom: '10px solid #FFFCEE',
            filter: 'drop-shadow(0 -1px 1px rgba(180,130,40,0.20))',
          }} />
        )}
        {hasTarget && side === 'above' && (
          <div style={{
            position: 'absolute', bottom: -9, left: arrowLeft,
            width: 0, height: 0,
            borderLeft: '9px solid transparent',
            borderRight: '9px solid transparent',
            borderTop: '10px solid #FFFCEE',
            filter: 'drop-shadow(0 1px 1px rgba(180,130,40,0.20))',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, color: '#92400E',
            background: 'rgba(180,83,9,0.10)', borderRadius: 20, padding: '1px 7px',
            whiteSpace: 'nowrap',
          }}>
            {tutorialStep + 1} / {totalSteps}
          </span>
          <div style={{ flex: 1, height: 3, borderRadius: 3, background: 'rgba(180,130,40,0.15)' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${((tutorialStep + 1) / totalSteps) * 100}%`,
              background: 'linear-gradient(90deg, #D97706, #B45309)',
              transition: 'width 0.4s',
            }} />
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 900, color: '#78350F', marginBottom: 7, lineHeight: 1.3 }}>
          {currentStepData.title}
        </div>

        <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
          {!hasTarget && currentStepData.navHint
            ? `📍 ${currentStepData.navHint}\n\n${currentStepData.body}`
            : currentStepData.body}
        </div>

        {isInteractive && (
          <div style={{
            marginTop: 10, fontSize: 14, fontWeight: 900, color: '#DC2626',
            background: 'rgba(220,38,38,0.08)', borderRadius: 8,
            padding: '8px 10px', textAlign: 'center', lineHeight: 1.4,
          }}>
            {currentStepData.actionHint ?? t('tutorial.clickHint')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', margin: '10px 0 8px' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              height: 4, borderRadius: 2,
              width: i === tutorialStep ? 16 : 4,
              background: i === tutorialStep ? '#B45309' : i < tutorialStep ? '#D97706' : 'rgba(180,130,40,0.2)',
              transition: 'all 0.25s',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {isFinish ? (
            <button onClick={nextStep} style={{
              flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #E8A020, #B45309)',
              boxShadow: '0 3px 0 #7C2D12',
              color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer',
            }}>
              {t('tutorial.startPlanning')}
            </button>
          ) : isInteractive ? (
            <button onClick={skipTutorial} style={{
              flex: 1, padding: '9px 8px', borderRadius: 10,
              border: '1.5px solid rgba(180,130,40,0.25)',
              background: 'transparent', color: '#92400E',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {t('tutorial.skip')}
            </button>
          ) : (
            <>
              <button onClick={skipTutorial} style={{
                flex: 1, padding: '9px 8px', borderRadius: 10,
                border: '1.5px solid rgba(180,130,40,0.25)',
                background: 'transparent', color: '#92400E',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                {t('tutorial.skip')}
              </button>
              <button onClick={nextStep} style={{
                flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #E8A020, #B45309)',
                boxShadow: '0 3px 0 #7C2D12',
                color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer',
              }}>
                {t('tutorial.next')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
