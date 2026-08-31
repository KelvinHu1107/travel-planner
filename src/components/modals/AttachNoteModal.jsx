import { CATEGORY } from '../cards/CardItem'

export default function AttachNoteModal({ sourceNote, targetCard, onConfirm, onCancel }) {
  const srcCfg = CATEGORY.note
  const tgtCfg = CATEGORY[targetCard.type] ?? CATEGORY.note

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card-glow"
        style={{ width: '100%', maxWidth: 420, padding: '36px 32px' }}
      >
        {/* 標頭 */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📎</div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>
            附加筆記
          </h2>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            確認要將這張筆記附加到以下卡片嗎？<br />
            附加後，筆記卡片將從行程表移除。
          </p>
        </div>

        {/* 來源筆記 */}
        <div style={{
          padding: '14px 16px', borderRadius: 16, marginBottom: 12,
          background: srcCfg.bg, border: `2px solid ${srcCfg.border}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: srcCfg.color,
            textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
            📝 筆記（將被附加）
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>
            {sourceNote.title}
          </div>
          {sourceNote.content && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sourceNote.content}
            </div>
          )}
          {sourceNote.images?.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 800, color: srcCfg.color, marginTop: 4 }}>
              🖼️ {sourceNote.images.length} 張圖片
            </div>
          )}
        </div>

        {/* 箭頭 */}
        <div style={{ textAlign: 'center', fontSize: 22, marginBottom: 12, color: 'var(--text-muted)' }}>
          ↓
        </div>

        {/* 目標卡片 */}
        <div style={{
          padding: '14px 16px', borderRadius: 16, marginBottom: 28,
          background: tgtCfg.bg, border: `2px solid ${tgtCfg.border}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: tgtCfg.color,
            textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
            {tgtCfg.icon} {tgtCfg.label}（附加目標）
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>
            {targetCard.title}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
            {targetCard.day} · {targetCard.startTime}
          </div>
        </div>

        {/* 按鈕 */}
        <div style={{ display: 'flex', gap: 12, maxWidth: 280, margin: '0 auto' }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '14px 20px', borderRadius: 16,
            background: 'var(--bg-elevated)', border: '1.5px solid var(--border)',
            color: 'var(--text-secondary)', fontSize: 14, fontWeight: 900, cursor: 'pointer',
          }}>
            取消
          </button>
          <button onClick={onConfirm} className="btn-game btn-primary" style={{
            flex: 1, padding: '14px 20px', fontSize: 14,
          }}>
            ✅ 確認附加
          </button>
        </div>
      </div>
    </div>
  )
}
