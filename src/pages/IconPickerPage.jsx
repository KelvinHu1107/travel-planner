import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const PHOSPHOR_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']

const FONTS = [
  {
    id: 'm-plus',
    label: 'M PLUS Rounded 1c',
    style: { fontFamily: '"M PLUS Rounded 1c", sans-serif' },
    tag: '目前使用',
    tagColor: '#B45309',
  },
  {
    id: 'cubic11',
    label: 'Cubic 11',
    style: { fontFamily: '"Cubic 11", sans-serif' },
    tag: '像素圓體',
    tagColor: '#0F766E',
  },
  {
    id: 'huninn',
    label: 'jf open 粉圓',
    style: { fontFamily: '"jf-openhuninn", sans-serif' },
    tag: '台灣圓體',
    tagColor: '#7C3AED',
  },
]

const LIBS = [
  { id: 'lucide',   label: 'Lucide',   color: '#F97316', pkg: 'lucide-react' },
  { id: 'tabler',   label: 'Tabler',   color: '#3B82F6', pkg: '@tabler/icons-react' },
  { id: 'phosphor', label: 'Phosphor', color: '#8B5CF6', pkg: '@phosphor-icons/react' },
]

const SAMPLE_TEXT = '旅途共筆 行程計畫'
const SAMPLE_ALPHA = 'ABCDEFGabcdefg 0123456789'
const SAMPLE_LARGE = '旅 行 美 食 景 點 飯 店 交 通'

export default function IconPickerPage() {
  const navigate = useNavigate()

  const [search, setSearch]             = useState('')
  const [library, setLibrary]           = useState('lucide')
  const [phosphorWeight, setWeight]     = useState('regular')
  const [copiedName, setCopied]         = useState(null)
  const [allIcons, setAllIcons]         = useState({ lucide: [], tabler: [], phosphor: [] })
  const [loading, setLoading]           = useState(true)
  const [showCount, setShowCount]       = useState(200)
  const [fontPreviewText, setPreviewText] = useState('旅途共筆 行程計畫 景點 美食 交通 住宿')
  const [activeFont, setActiveFont]     = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      import('lucide-react'),
      import('@tabler/icons-react'),
      import('@phosphor-icons/react'),
    ]).then(([lucide, tabler, phosphor]) => {
      setAllIcons({
        lucide: Object.entries(lucide)
          .filter(([k, v]) => typeof v === 'function' && /^[A-Z][a-zA-Z0-9]+$/.test(k) && k !== 'createLucideIcon')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, Icon]) => ({ name, Icon, importStr: `import { ${name} } from 'lucide-react'` })),

        tabler: Object.entries(tabler)
          .filter(([k, v]) => typeof v === 'function' && /^Icon[A-Z]/.test(k))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([rawName, Icon]) => ({
            name: rawName.slice(4),
            rawName,
            Icon,
            importStr: `import { ${rawName} } from '@tabler/icons-react'`,
          })),

        phosphor: Object.entries(phosphor)
          .filter(([k, v]) => typeof v === 'function' && /^[A-Z][a-zA-Z]+$/.test(k) && k !== 'IconContext')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, Icon]) => ({ name, Icon, importStr: `import { ${name} } from '@phosphor-icons/react'` })),
      })
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    const icons = allIcons[library] ?? []
    const q = search.trim().toLowerCase()
    if (!q) return icons
    return icons.filter(i => i.name.toLowerCase().includes(q))
  }, [allIcons, library, search])

  const visible = useMemo(() => filtered.slice(0, showCount), [filtered, showCount])

  useEffect(() => setShowCount(200), [library, search])

  const copyIcon = (icon) => {
    navigator.clipboard?.writeText(icon.importStr).catch(() => {})
    setCopied(icon.name)
    setTimeout(() => setCopied(null), 2000)
  }

  const libInfo = LIBS.find(l => l.id === library)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 24px', height: 64,
        background: 'rgba(250,246,234,0.97)',
        backdropFilter: 'blur(24px)',
        borderBottom: '2px solid rgba(165,125,65,0.22)',
        boxShadow: '0 4px 24px rgba(120,80,20,0.10)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <button onClick={() => navigate(-1)} style={{
          width: 40, height: 40, borderRadius: 12,
          border: '1.5px solid rgba(165,125,65,0.28)',
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 0 rgba(140,100,40,0.18)',
        }}>←</button>
        <span style={{ fontSize: 22 }}>🎨</span>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)' }}>Icon & 字體 選擇器</h1>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>點擊 icon 複製 import 語法</p>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px 80px' }}>

        {/* ── 字體預覽 ── */}
        <section style={{
          marginBottom: 40, padding: '24px 28px', borderRadius: 24,
          background: 'rgba(255,252,243,0.97)',
          border: '1.5px solid rgba(165,125,65,0.22)',
          boxShadow: '0 4px 0 rgba(140,100,40,0.12), 0 8px 28px rgba(120,80,20,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              字體預覽
            </h2>
            <input
              value={fontPreviewText}
              onChange={e => setPreviewText(e.target.value)}
              style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)',
                background: 'rgba(165,125,65,0.07)', border: '1.5px solid rgba(165,125,65,0.22)',
                borderRadius: 10, padding: '7px 14px', width: 300, outline: 'none',
              }}
              placeholder="輸入自訂預覽文字…"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FONTS.map(f => (
              <div key={f.id} onClick={() => setActiveFont(f.id === activeFont ? null : f.id)}
                style={{
                  padding: '18px 22px', borderRadius: 18, cursor: 'pointer',
                  border: `2px solid ${activeFont === f.id ? f.tagColor + '66' : 'rgba(165,125,65,0.16)'}`,
                  background: activeFont === f.id ? f.tagColor + '0D' : 'rgba(255,252,243,0.50)',
                  transition: 'all 0.15s ease',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, letterSpacing: '0.5px',
                    color: f.tagColor, background: f.tagColor + '18',
                    border: `1px solid ${f.tagColor}33`,
                    borderRadius: 6, padding: '3px 9px',
                  }}>{f.tag}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>{f.label}</span>
                  {activeFont === f.id && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 900, color: f.tagColor }}>✓ 選取中</span>
                  )}
                </div>

                {/* Large chars */}
                <div style={{ ...f.style, fontSize: 28, fontWeight: 'normal', color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.4 }}>
                  {fontPreviewText || SAMPLE_TEXT}
                </div>

                {/* Sample sentence */}
                <div style={{ ...f.style, fontSize: 14, fontWeight: 'normal', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {SAMPLE_LARGE}
                </div>

                {/* Alphabet */}
                <div style={{ ...f.style, fontSize: 13, fontWeight: 'normal', color: 'var(--text-muted)' }}>
                  {SAMPLE_ALPHA}
                </div>
              </div>
            ))}
          </div>

          {activeFont && (
            <div style={{
              marginTop: 16, padding: '12px 18px', borderRadius: 14,
              background: 'rgba(180,83,9,0.07)', border: '1.5px solid rgba(180,83,9,0.22)',
              fontSize: 12, fontWeight: 800, color: 'var(--accent)',
            }}>
              {activeFont === 'm-plus' && '目前已使用 M PLUS Rounded 1c。'}
              {activeFont === 'cubic11' && '已下載到 public/fonts/Cubic_11.woff2。要換上這個字體告訴我，我幫你改 CSS。'}
              {activeFont === 'huninn' && '已下載到 public/fonts/jf-openhuninn.ttf。要換上這個字體告訴我，我幫你改 CSS。'}
            </div>
          )}
        </section>

        {/* ── Icon 選擇器 ── */}
        <section>
          {/* Library tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {LIBS.map(lib => (
              <button key={lib.id} onClick={() => setLibrary(lib.id)} style={{
                padding: '9px 20px', borderRadius: 12, fontSize: 13, fontWeight: 900,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: library === lib.id
                  ? `linear-gradient(135deg, ${lib.color}, ${lib.color}cc)`
                  : 'rgba(165,125,65,0.10)',
                color: library === lib.id ? '#fff' : 'var(--text-muted)',
                boxShadow: library === lib.id ? `0 4px 0 ${lib.color}55, 0 6px 16px ${lib.color}28` : 'none',
              }}>
                {lib.label}
                {!loading && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 900,
                    background: library === lib.id ? 'rgba(255,255,255,0.25)' : 'rgba(165,125,65,0.15)',
                    borderRadius: 99, padding: '2px 7px',
                    color: library === lib.id ? '#fff' : 'var(--text-muted)',
                  }}>
                    {(allIcons[lib.id]?.length ?? 0).toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + Phosphor weight */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="game-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`搜尋 ${libInfo?.label} icons 名稱…`}
              style={{ flex: 1, minWidth: 220, fontSize: 14 }}
            />
            {library === 'phosphor' && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {PHOSPHOR_WEIGHTS.map(w => (
                  <button key={w} onClick={() => setWeight(w)} style={{
                    padding: '7px 12px', borderRadius: 9, fontSize: 11, fontWeight: 900,
                    border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                    background: phosphorWeight === w ? '#8B5CF6' : 'rgba(139,92,246,0.12)',
                    color: phosphorWeight === w ? '#fff' : '#8B5CF6',
                    boxShadow: phosphorWeight === w ? '0 3px 0 #6D28D955' : 'none',
                  }}>{w}</button>
                ))}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
            fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
          }}>
            <span>
              {loading ? '⏳ 載入套件中…' : `顯示 ${visible.length.toLocaleString()} / ${filtered.length.toLocaleString()} 個 icons`}
            </span>
            {copiedName && (
              <span style={{
                color: '#059669', background: 'rgba(5,150,105,0.10)',
                border: '1.5px solid rgba(5,150,105,0.28)',
                borderRadius: 8, padding: '3px 12px', fontSize: 12,
              }}>
                ✓ 複製：{copiedName}
              </span>
            )}
          </div>

          {/* Icon Grid */}
          {loading ? (
            <div style={{
              textAlign: 'center', padding: '80px 0',
              color: 'var(--text-muted)', fontSize: 15, fontWeight: 900,
            }}>
              ⏳ 載入 {LIBS.map(l => l.label).join(' + ')} 中，請稍候…
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                gap: 6,
              }}>
                {visible.map(icon => {
                  const { Icon, name, importStr } = icon
                  const isCopied = copiedName === name
                  const iconProps = { size: 26 }
                  if (library === 'phosphor') iconProps.weight = phosphorWeight
                  else iconProps.strokeWidth = 1.5

                  return (
                    <button
                      key={name}
                      onClick={() => copyIcon(icon)}
                      title={importStr}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                        padding: '14px 6px 10px', borderRadius: 14, cursor: 'pointer',
                        border: `1.5px solid ${isCopied ? 'rgba(5,150,105,0.55)' : 'rgba(165,125,65,0.18)'}`,
                        background: isCopied ? 'rgba(5,150,105,0.08)' : 'rgba(255,252,243,0.85)',
                        color: 'var(--text-primary)', transition: 'all 0.12s ease',
                        outline: 'none',
                      }}
                      onMouseEnter={e => {
                        if (!isCopied) {
                          e.currentTarget.style.background = `${libInfo.color}12`
                          e.currentTarget.style.borderColor = `${libInfo.color}55`
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isCopied ? 'rgba(5,150,105,0.08)' : 'rgba(255,252,243,0.85)'
                        e.currentTarget.style.borderColor = isCopied ? 'rgba(5,150,105,0.55)' : 'rgba(165,125,65,0.18)'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <Icon {...iconProps} />
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: isCopied ? '#059669' : 'var(--text-muted)',
                        textAlign: 'center', lineHeight: 1.3,
                        wordBreak: 'break-all', maxWidth: '100%',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {name}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Load more */}
              {filtered.length > showCount && (
                <div style={{ textAlign: 'center', marginTop: 28 }}>
                  <button
                    onClick={() => setShowCount(c => c + 300)}
                    style={{
                      padding: '13px 36px', borderRadius: 14,
                      border: '1.5px solid rgba(165,125,65,0.28)',
                      background: 'rgba(180,83,9,0.08)', color: 'var(--accent)',
                      fontSize: 13, fontWeight: 900, cursor: 'pointer',
                      boxShadow: '0 3px 0 rgba(140,100,40,0.14)',
                    }}
                  >
                    載入更多 ↓　（還有 {(filtered.length - showCount).toLocaleString()} 個）
                  </button>
                </div>
              )}

              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                  <p style={{ fontSize: 15, fontWeight: 900 }}>找不到「{search}」</p>
                  <p style={{ fontSize: 13, fontWeight: 800, marginTop: 6 }}>試試英文關鍵字，例如：map / home / star</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
