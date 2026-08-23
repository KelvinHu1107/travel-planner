import { useState, useEffect } from 'react'

export function useWindowSize() {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  }
}
