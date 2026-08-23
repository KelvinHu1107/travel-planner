import { useState, useEffect } from 'react'

export function useDeviceInfo() {
  const getInfo = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 768,
    isTablet: window.innerWidth >= 768 && window.innerWidth < 1100,
    isLandscape: window.innerWidth > window.innerHeight,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
    isAndroid: /Android/.test(navigator.userAgent),
  })

  const [info, setInfo] = useState(getInfo)

  useEffect(() => {
    const handler = () => setInfo(getInfo())
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', handler)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }, [])

  return info
}
