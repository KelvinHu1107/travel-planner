import { useState } from 'react'
import { CURRENT_VERSION, CHANGELOG } from '../../constants/version'

export default function VersionBadge() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 99,
          fontSize: 11, fontWeight: 900,
          background: 'rgba(255, 250, 238, 0.88)',
          border: '1.5px solid rgba(165, 125, 65, 0.30)',
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 16px rgba(120, 80, 20, 0.12)',
          cursor: 'pointer',
          transition: 'transform 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = '' }}
        onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)' }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-bright)', display: 'inline-block' }} />
        v{CURRENT_VERSION}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 16px 24px',
            background: 'rgba(120, 80, 20, 0.25)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: 440,
              borderRadius: 28, padding: '28px 28px',
              background: 'rgba(255, 252, 243, 0.98)',
              border: '1.5px solid rgba(165, 125, 65, 0.28)',
              boxShadow: '0 -8px 50px rgba(120, 80, 20, 0.12), 0 20px 60px rgba(80,40,5,0.10)',
              maxHeight: '75vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>
                  📋 Release Notes
                </h2>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 3 }}>
                  TripCoworking 更新紀錄
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  fontSize: 16, fontWeight: 900, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {CHANGELOG.map((entry, idx) => (
                <div key={entry.version}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{entry.emoji}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 900,
                          background: 'rgba(180, 83, 9, 0.10)',
                          color: 'var(--accent)',
                          border: '1px solid rgba(180, 83, 9, 0.22)',
                        }}>
                          v{entry.version}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>
                          {entry.title}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>
                        {entry.date}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 28 }}>
                    {entry.changes.map((change, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--accent-bright)', marginTop: 6 }} />
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {change}
                        </p>
                      </div>
                    ))}
                  </div>

                  {idx < CHANGELOG.length - 1 && (
                    <div style={{ marginTop: 18, height: 1, background: 'rgba(165,125,65,0.14)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
