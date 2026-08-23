import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCard, updateCard } from '../services/firestore'
import FormatToolbar from '../components/ui/FormatToolbar'
import { ArrowLeft, CircleCheck } from 'lucide-react'
import { NotePencil } from '@phosphor-icons/react'

// ── Markdown 解析器 ──────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function renderInline(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
}

// ── Markdown 預覽（互動式 checkbox）─────────
function MarkdownView({ content, onToggleCheckbox }) {
  if (!content?.trim()) return (
    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 15, padding: '40px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
      切換到「編輯」模式開始寫筆記
    </div>
  )

  const lines = content.split('\n')
  const elements = []
  let i = 0, key = 0

  while (i < lines.length) {
    const line = lines[i]
    const k = key++

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={k} style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', margin: '20px 0 10px', lineHeight: 1.3 }}>
          <span dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />
        </h1>
      )
      i++
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={k} style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px', lineHeight: 1.3 }}>
          <span dangerouslySetInnerHTML={{ __html: renderInline(line.slice(3)) }} />
        </h2>
      )
      i++
    } else if (/^-{3,}$/.test(line.trim())) {
      elements.push(
        <hr key={k} style={{ border: 'none', borderTop: '2px solid rgba(165,125,65,0.25)', margin: '22px 0' }} />
      )
      i++
    } else if (line.match(/^- \[[ xX]\] /)) {
      const items = []
      while (i < lines.length && lines[i].match(/^- \[[ xX]\] /)) {
        items.push({ checked: lines[i][3].toLowerCase() === 'x', text: lines[i].slice(6), lineIdx: i })
        i++
      }
      elements.push(
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
          {items.map(item => (
            <div
              key={item.lineIdx}
              onClick={() => onToggleCheckbox(item.lineIdx)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                padding: '6px 10px', borderRadius: 10, transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(165,125,65,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 20, lineHeight: '1.6', color: item.checked ? '#0F766E' : 'rgba(165,125,65,0.5)', flexShrink: 0 }}>
                {item.checked ? '☑' : '☐'}
              </span>
              <span style={{
                fontSize: 16, fontWeight: 700, lineHeight: 1.7,
                color: item.checked ? 'var(--text-muted)' : 'var(--text-secondary)',
                textDecoration: item.checked ? 'line-through' : 'none',
              }}>
                <span dangerouslySetInnerHTML={{ __html: renderInline(item.text) }} />
              </span>
            </div>
          ))}
        </div>
      )
    } else if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ') && !lines[i].match(/^- \[[ xX]\] /)) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={k} style={{ margin: '8px 0', paddingLeft: 24 }}>
          {items.map((item, bi) => (
            <li key={bi} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
              <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
            </li>
          ))}
        </ul>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={k} style={{ height: 10 }} />)
      i++
    } else {
      elements.push(
        <p key={k} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.9, margin: '4px 0' }}>
          <span dangerouslySetInnerHTML={{ __html: renderInline(line) }} />
        </p>
      )
      i++
    }
  }

  return <div>{elements}</div>
}

// ── 主頁面 ───────────────────────────────────
export default function NoteDetail() {
  const { tripId, noteId } = useParams()
  const navigate = useNavigate()
  const [card, setCard]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [title, setTitle]     = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [viewMode, setViewMode] = useState('edit') // 'edit' | 'preview'
  const saveTimer = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    getCard(tripId, noteId)
      .then(c => {
        setCard(c)
        setTitle(c.title ?? '')
        setContent(c.content ?? '')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [tripId, noteId])

  const triggerAutoSave = useCallback((newTitle, newContent) => {
    clearTimeout(saveTimer.current)
    setSaved(false)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateCard(tripId, noteId, { title: newTitle, content: newContent })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch { /* silent */ } finally {
        setSaving(false)
      }
    }, 800)
  }, [tripId, noteId])

  const handleTitleChange = (e) => {
    setTitle(e.target.value)
    triggerAutoSave(e.target.value, content)
  }

  const handleContentChange = useCallback((val) => {
    setContent(val)
    triggerAutoSave(title, val)
  }, [title, triggerAutoSave])

  const handleToggleCheckbox = useCallback((lineIdx) => {
    const lines = content.split('\n')
    const line  = lines[lineIdx]
    if (!line) return
    lines[lineIdx] = line.replace(/^- \[[ xX]\] /, (m) => m[3].toLowerCase() === 'x' ? '- [ ] ' : '- [x] ')
    handleContentChange(lines.join('\n'))
  }, [content, handleContentChange])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 48 }}>📝</div>
      <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-secondary)' }}>載入筆記中…</p>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 32 }}>
      <div style={{ fontSize: 48 }}>😢</div>
      <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>無法讀取筆記</p>
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{error}</p>
      <button className="btn-game btn-primary" style={{ padding: '12px 28px' }} onClick={() => navigate(`/trip/${tripId}`)}>返回行程</button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(12px, 3vw, 24px)', height: 62, flexShrink: 0,
        background: 'rgba(250,246,234,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '2px solid rgba(165,125,65,0.22)',
        boxShadow: '0 4px 24px rgba(120,80,20,0.08)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate(`/trip/${tripId}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 12,
              background: 'var(--bg-elevated)', border: '1.5px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 900, cursor: 'pointer',
            }}>
            <ArrowLeft size={16} style={{ marginRight: 5 }} /> 返回行程
          </button>
          <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <span style={{ fontSize: 18, display: 'flex' }}><NotePencil size={20} weight="fill" color="#5B21B6" /></span>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-muted)' }}>筆記編輯</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 編輯 / 預覽 切換 */}
          <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden',
            border: '1.5px solid rgba(165,125,65,0.25)', background: 'var(--bg-elevated)' }}>
            {['edit', 'preview'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 900, border: 'none',
                  cursor: 'pointer',
                  background: viewMode === mode ? 'rgba(180,83,9,0.18)' : 'transparent',
                  color: viewMode === mode ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}>
                {mode === 'edit' ? '✏️ 編輯' : '👁️ 預覽'}
              </button>
            ))}
          </div>

          {/* 儲存狀態 */}
          <div style={{ fontSize: 12, fontWeight: 900, color: saving ? 'var(--text-muted)' : saved ? '#0F766E' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? (
              <>⏳ 儲存中…</>
            ) : saved ? (
              <><CircleCheck size={14} color="#0F766E" style={{ marginRight: 3 }} /> 已自動儲存</>
            ) : (
              <span style={{ opacity: 0.5 }}>自動儲存</span>
            )}
          </div>
        </div>
      </div>

      {/* 編輯區 */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: 'clamp(16px, 4vw, 40px) clamp(12px, 3vw, 24px) 80px' }}>
        <div style={{ width: '100%', maxWidth: 720 }}>
          {/* 標題 */}
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="筆記標題…"
            style={{
              width: '100%', fontSize: 32, fontWeight: 900,
              color: 'var(--text-primary)', background: 'transparent',
              border: 'none', outline: 'none', marginBottom: 20,
              borderBottom: '2px solid rgba(165,125,65,0.20)',
              paddingBottom: 16, lineHeight: 1.3,
            }}
          />

          {/* 日期 + 時間 meta */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
            {card?.day && (
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                🗓️ {card.day}
              </span>
            )}
            {card?.startTime && (
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                🕐 {card.startTime}
              </span>
            )}
          </div>

          {/* 工具列 + 內文 */}
          {viewMode === 'edit' ? (
            <div style={{ borderRadius: 14, border: '1.5px solid rgba(165,125,65,0.22)', overflow: 'hidden' }}>
              <FormatToolbar textareaRef={textareaRef} content={content} onChange={handleContentChange} />
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                placeholder="在這裡寫下你的旅遊筆記…&#10;&#10;支援 Markdown 格式：&#10;# 大標題  ## 小標題&#10;**粗體**  *斜體*&#10;- 清單項目&#10;- [ ] 待辦事項  - [x] 已完成&#10;--- 分隔線"
                style={{
                  width: '100%', minHeight: 420,
                  fontSize: 16, fontWeight: 700, lineHeight: 1.9,
                  color: 'var(--text-secondary)', background: 'rgba(255,252,243,0.6)',
                  border: 'none', outline: 'none', resize: 'vertical',
                  fontFamily: 'inherit', padding: '16px 18px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <div style={{ minHeight: 420, padding: '8px 0' }}>
              <MarkdownView content={content} onToggleCheckbox={handleToggleCheckbox} />
            </div>
          )}

          {/* 附加圖片 */}
          {card?.images && card.images.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14 }}>
                附加圖片
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {card.images.map((url, i) => (
                  <div key={i} style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: '4/3' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onClick={() => window.open(url, '_blank')} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 附加筆記 */}
          {card?.notes && card.notes.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14 }}>
                附加筆記（{card.notes.length} 則）
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {card.notes.map((note, i) => (
                  <div key={note.id ?? i} style={{
                    padding: '16px 20px', borderRadius: 16,
                    background: 'rgba(91,33,182,0.06)', border: '1.5px solid rgba(91,33,182,0.18)',
                  }}>
                    <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>
                      {note.title}
                    </p>
                    {note.content && (
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {note.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
