import { useState, useEffect } from 'react'
import { Link, Maximize, Minimize } from 'lucide-react'

// 複製當前網頁連結按鈕
export function CopyLinkButton({ style = {} }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = window.location.href
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="複製頁面連結"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 12,
        border: `1.5px solid ${copied ? 'rgba(5,150,105,0.40)' : 'rgba(165,125,65,0.28)'}`,
        background: copied ? 'rgba(5,150,105,0.10)' : 'var(--bg-elevated)',
        color: copied ? '#059669' : 'var(--text-secondary)',
        fontSize: 13, fontWeight: 900, cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: '0 2px 0 rgba(140,100,40,0.14)',
        ...style,
      }}
    >
      <Link size={15} />
      <span style={{ display: 'var(--link-text-display, inline)' }}>
        {copied ? '已複製！' : '複製連結'}
      </span>
    </button>
  )
}

// 全螢幕按鈕（iOS 顯示提示，Android/Desktop 使用 Fullscreen API）
export function FullscreenButton({ style = {} }) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggle = async () => {
    if (isIOS) {
      alert('iOS 上請點「分享」→「加入主畫面」，從主畫面開啟即可全螢幕瀏覽 📱')
      return
    }
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      alert('此瀏覽器不支援全螢幕，請嘗試其他瀏覽器')
    }
  }

  return (
    <button
      onClick={toggle}
      title={isFullscreen ? '退出全螢幕' : '全螢幕'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 38, height: 38, borderRadius: 12,
        border: '1.5px solid rgba(165,125,65,0.28)',
        background: 'var(--bg-elevated)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: '0 2px 0 rgba(140,100,40,0.14)',
        ...style,
      }}
    >
      {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
    </button>
  )
}
