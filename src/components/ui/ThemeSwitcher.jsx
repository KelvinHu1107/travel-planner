import { Pencil, Sparkles } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

export default function ThemeSwitcher({ style = {}, showLabel = false }) {
  const { theme, toggleTheme } = useTheme()
  const isHanddrawn = theme === 'handdrawn'

  return (
    <button
      onClick={toggleTheme}
      title={isHanddrawn ? '切換可愛風' : '切換手繪風'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: showLabel ? 5 : 0,
        width: showLabel ? 'auto' : 38,
        height: 38,
        padding: showLabel ? '0 12px' : 0,
        borderRadius: 12,
        border: '1.5px solid var(--border)',
        background: 'var(--bg-elevated)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: '0 2px 0 rgba(140,100,40,0.14)',
        fontSize: 13,
        fontWeight: 900,
        flexShrink: 0,
        ...style,
      }}
    >
      {isHanddrawn
        ? <Sparkles size={16} />
        : <Pencil size={16} />
      }
      {showLabel && (
        <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {isHanddrawn ? '可愛風' : '手繪風'}
        </span>
      )}
    </button>
  )
}
