import { useCallback } from 'react'

function Btn({ children, title, onClick, style }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        padding: '5px 9px', borderRadius: 8, fontSize: 13, fontWeight: 900,
        background: 'rgba(165,125,65,0.10)', border: '1.5px solid rgba(165,125,65,0.22)',
        color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1,
        transition: 'background 0.1s, border 0.1s',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(165,125,65,0.20)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(165,125,65,0.10)' }}
    >
      {children}
    </button>
  )
}

const Sep = () => (
  <div style={{ width: 1, height: 20, background: 'rgba(165,125,65,0.25)', alignSelf: 'center', margin: '0 2px' }} />
)

export default function FormatToolbar({ textareaRef, content, onChange }) {
  const wrapSelection = useCallback((before, after = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const sel   = content.slice(start, end)
    const next  = content.slice(0, start) + before + sel + after + content.slice(end)
    onChange(next)
    const cur = start + before.length
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cur, cur + sel.length) }, 0)
  }, [textareaRef, content, onChange])

  const prependLine = useCallback((prefix) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const lineStart = content.lastIndexOf('\n', pos - 1) + 1
    const lineEnd   = content.indexOf('\n', pos)
    const line      = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
    if (line.startsWith(prefix)) {
      const next = content.slice(0, lineStart) + line.slice(prefix.length) + content.slice(lineEnd === -1 ? content.length : lineEnd)
      onChange(next)
      setTimeout(() => { ta.focus(); ta.setSelectionRange(pos - prefix.length, pos - prefix.length) }, 0)
    } else {
      const next = content.slice(0, lineStart) + prefix + content.slice(lineStart)
      onChange(next)
      setTimeout(() => { ta.focus(); ta.setSelectionRange(pos + prefix.length, pos + prefix.length) }, 0)
    }
  }, [textareaRef, content, onChange])

  const insertBlock = useCallback((text) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos  = ta.selectionStart
    const next = content.slice(0, pos) + text + content.slice(pos)
    onChange(next)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(pos + text.length, pos + text.length) }, 0)
  }, [textareaRef, content, onChange])

  return (
    <div style={{
      display: 'flex', gap: 5, flexWrap: 'wrap', padding: '8px 12px',
      background: 'rgba(165,125,65,0.06)', borderRadius: '12px 12px 0 0',
      borderBottom: '1.5px solid rgba(165,125,65,0.18)', alignItems: 'center',
    }}>
      <Btn title="大標題 (# )" onClick={() => prependLine('# ')}>H1</Btn>
      <Btn title="小標題 (## )" onClick={() => prependLine('## ')}>H2</Btn>
      <Sep />
      <Btn title="粗體 (**text**)" onClick={() => wrapSelection('**', '**')} style={{ fontWeight: 900 }}>B</Btn>
      <Btn title="斜體 (*text*)" onClick={() => wrapSelection('*', '*')} style={{ fontStyle: 'italic' }}>I</Btn>
      <Btn title="刪除線 (~~text~~)" onClick={() => wrapSelection('~~', '~~')} style={{ textDecoration: 'line-through' }}>S</Btn>
      <Sep />
      <Btn title="項目清單 (- )" onClick={() => prependLine('- ')}>• 清單</Btn>
      <Btn title="待辦項目 (- [ ] )" onClick={() => insertBlock('\n- [ ] ')}>☐ 待辦</Btn>
      <Sep />
      <Btn title="分隔線 (---)" onClick={() => insertBlock('\n---\n')}>—</Btn>
    </div>
  )
}
