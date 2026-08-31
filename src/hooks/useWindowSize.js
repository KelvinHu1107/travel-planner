import { useState, useEffect } from 'react'

function getSize() {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function useWindowSize() {
  const [size, setSize] = useState(getSize)

  useEffect(() => {
    const handler = () => setSize(getSize())
    window.addEventListener('resize', handler)
    // orientationchange fires before innerWidth updates; delay to get final value
    const onOrient = () => setTimeout(() => setSize(getSize()), 50)
    window.addEventListener('orientationchange', onOrient)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', onOrient)
    }
  }, [])

  const { width, height } = size
  // Touch device in landscape → treat as desktop (show full layout, not cramped mobile)
  const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  const isLandscapeMobile = isTouch && width > height

  return {
    width,
    height,
    isLandscape: width > height,
    isMobile: width < 768 && !isLandscapeMobile,
    isTablet: width >= 768 && width < 1100,
  }
}
