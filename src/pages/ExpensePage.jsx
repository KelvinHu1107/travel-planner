import { useState, useEffect } from 'react'
import { ArrowLeft, Wallet, Monitor, Smartphone } from 'lucide-react'
import { useViewMode } from '../contexts/ViewModeContext'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getTrip, subscribeToExpenses, addExpense, deleteExpense, updateExpense } from '../services/firestore'
import { getDaysInRange } from '../utils/dateUtils'
import { useLanguage } from '../i18n/LanguageContext'

const CURRENCY_FLAG_MAP = {
  TWD: '🇹🇼', JPY: '🇯🇵', USD: '🇺🇸', EUR: '🇪🇺',
  KRW: '🇰🇷', HKD: '🇭🇰', SGD: '🇸🇬', AUD: '🇦🇺',
}

// 換算基準：1 單位各幣別 = 多少 TWD（粗略參考匯率）
const EXCHANGE_TO_TWD = {
  TWD: 1,
  JPY: 0.21,
  USD: 32,
  EUR: 35,
  KRW: 0.024,
  HKD: 4.1,
  SGD: 24,
  AUD: 21,
}

function convertAmount(amount, fromCur, toCur) {
  const twdAmount = Number(amount) * (EXCHANGE_TO_TWD[fromCur] ?? 1)
  return twdAmount / (EXCHANGE_TO_TWD[toCur] ?? 1)
}

const EXPENSE_CATEGORY_MAP = {
  food:          { labelKey: 'expense.category.food',          icon: '🍜' },
  transport:     { labelKey: 'expense.category.transport',     icon: '🚗' },
  accommodation: { labelKey: 'expense.category.accommodation', icon: '🏨' },
  activity:      { labelKey: 'expense.category.activity',      icon: '🎡' },
  shopping:      { labelKey: 'expense.category.shopping',      icon: '🛍️' },
  other:         { labelKey: 'expense.category.other',         icon: '💼' },
}

function truncateName(name, fallback = '') {
  if (!name) return fallback
  return name.length > 8 ? name.slice(0, 6) + '...' : name
}

export default function ExpensePage() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobileMode, toggleMode } = useViewMode()
  const { currentUser } = useAuth()
  const { t, lang } = useLanguage()

  const [trip,     setTrip]     = useState(null)
  const [expenses, setExpenses] = useState([])
  const [tab,      setTab]      = useState('day')

  const [showAddForm,  setShowAddForm]  = useState(false)
  const [formTitle,    setFormTitle]    = useState('')
  const [formAmount,   setFormAmount]   = useState('')
  const [formCurrency, setFormCurrency] = useState('TWD')
  const [formDay,      setFormDay]      = useState('')
  const [formCategory, setFormCategory] = useState('other')
  const [formNotes,    setFormNotes]    = useState('')
  const [formSaving,   setFormSaving]   = useState(false)
  const [formError,    setFormError]    = useState('')

  const [userViewCurrency, setUserViewCurrency] = useState('TWD')

  const WEEKDAYS = lang === 'zh'
    ? ['週日','週一','週二','週三','週四','週五','週六']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  useEffect(() => {
    getTrip(tripId).then(setTrip).catch(() => {})
  }, [tripId])

  useEffect(() => {
    if (location.state?.autoOpen) {
      setShowAddForm(true)
    }
  }, [location.state?.autoOpen])

  useEffect(() => {
    // Bug #30: 加 onError handler — 失去 trip 存取權時導回首頁
    const unsub = subscribeToExpenses(tripId, setExpenses, () => navigate('/'))
    return () => unsub()
  }, [tripId, navigate])

  useEffect(() => {
    if (trip && !formDay) {
      const days = getDaysInRange(trip.startDate, trip.endDate)
      if (days.length > 0) setFormDay(days[0])
    }
  }, [trip, formDay])

  const days = trip ? getDaysInRange(trip.startDate, trip.endDate) : []

  const byCurrency = expenses.reduce((acc, e) => {
    acc[e.currency] = (acc[e.currency] ?? 0) + Number(e.amount ?? 0); return acc
  }, {})

  const sortedDays = [...new Set(expenses.map(e => e.day))].sort()
  const byDay = sortedDays.map(day => ({
    day,
    items: expenses.filter(e => e.day === day),
  }))

  const byCategory = Object.entries(EXPENSE_CATEGORY_MAP).map(([catId, catInfo]) => ({
    catId, catInfo,
    items: expenses.filter(e => (e.category ?? 'other') === catId),
  })).filter(g => g.items.length > 0)

  const userMap = {}
  expenses.forEach(e => {
    const uid = e.createdBy?.uid || 'unknown'
    const name = e.createdBy?.displayName || t('common.unknown')
    if (!userMap[uid]) userMap[uid] = { uid, name, items: [] }
    userMap[uid].items.push(e)
  })
  const byUser = Object.values(userMap)

  const totalItems = expenses.length

  async function handleAddExpense() {
    if (!formTitle.trim() || !formAmount) return
    // Bug #25 / Bug #16：金額必須為有限、大於 0 且小於 10 億的數字（避免 NaN / 溢位）
    const amt = Number(formAmount)
    if (!Number.isFinite(amt) || amt <= 0 || amt >= 1e9) {
      setFormError(t('expense.error.invalidAmount'))
      return
    }
    const day = formDay || days[0]
    if (!day) { setFormError(t('expense.error.loading')); return }
    setFormSaving(true)
    setFormError('')
    try {
      await addExpense(tripId, {
        title: formTitle.trim(),
        amount: Number(formAmount),
        currency: formCurrency,
        day,
        category: formCategory,
        notes: formNotes.trim(),
        included: true,
        createdBy: {
          uid: currentUser?.uid ?? '',
          displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || t('common.unknown'),
        },
      })
      setFormTitle('')
      setFormAmount('')
      setFormNotes('')
      setShowAddForm(false)
    } catch (err) {
      setFormError(t('expense.error.add'))
    } finally {
      setFormSaving(false)
    }
  }

  const inputStyle = {
    padding: '9px 12px', borderRadius: 10, boxSizing: 'border-box',
    border: '1.5px solid rgba(165,125,65,0.35)',
    background: 'rgba(255,252,244,1)', fontSize: 14, fontWeight: 700,
    color: 'var(--text-primary)', outline: 'none',
  }

  const dayLabel = (d) => {
    const date = new Date(d + 'T00:00:00')
    return `${date.getMonth()+1}/${date.getDate()} ${WEEKDAYS[date.getDay()]}`
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-base)',
      ...(trip?.backgroundImage ? {
        backgroundImage: `url(${trip.backgroundImage})`,
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
      } : {}),
    }}>
      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', height: 64,
        background: 'rgba(250,246,234,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '2px solid rgba(165,125,65,0.22)',
        boxShadow: '0 4px 24px rgba(120,80,20,0.10)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <button
          onClick={() => navigate(`/trip/${tripId}`, { state: location.state })}
          style={{
            width: 40, height: 40, borderRadius: 12, border: '1.5px solid rgba(165,125,65,0.28)',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 0 rgba(140,100,40,0.18)',
          }}
        ><ArrowLeft size={18} /></button>
        {!isMobileMode && <Wallet size={24} color="var(--text-muted)" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2 }}>{t('expense.title')}</h1>
          {trip && (
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.name}
            </p>
          )}
        </div>
        {totalItems > 0 && (
          <div style={{
            padding: '5px 14px', borderRadius: 99,
            background: 'rgba(251,191,36,0.10)', border: '1.5px solid rgba(251,191,36,0.35)',
            fontSize: 12, fontWeight: 900, color: '#D97706', flexShrink: 0,
          }}>{t('expense.totalCount', { count: totalItems })}</div>
        )}
        <button onClick={toggleMode} style={{
          padding: '5px 9px', borderRadius: 9, border: '1.5px solid rgba(165,125,65,0.28)',
          background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 900, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>{isMobileMode ? <Monitor size={12} /> : <Smartphone size={12} />} {isMobileMode ? t('board.pcMode') : t('board.mobileMode')}</button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(14px,4vw,20px) 100px' }}>

        {/* 總計橫幅 */}
        {totalItems > 0 && (
          <div style={{
            padding: '16px 20px', borderRadius: 18, marginBottom: 22,
            background: 'rgba(251,191,36,0.08)', border: '2px solid rgba(251,191,36,0.25)',
            boxShadow: '0 4px 16px rgba(180,83,9,0.08)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>{t('expense.totalSpending')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
              {Object.entries(byCurrency).map(([cur, total]) => (
                <div key={cur} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>{CURRENCY_FLAG_MAP[cur] ?? '💱'}</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#D97706' }}>{Number(total).toLocaleString()}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-muted)' }}>{cur}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 新增開銷 */}
        {!showAddForm ? (
          <button
            onClick={() => { setShowAddForm(true) }}
            style={{
              width: '100%', marginBottom: 20, padding: '11px 16px', borderRadius: 14,
              border: '2px dashed rgba(180,83,9,0.30)', background: 'rgba(251,191,36,0.05)',
              color: '#B45309', fontSize: 14, fontWeight: 900, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 18 }}>+</span> {t('expense.add')}
          </button>
        ) : (
          <div style={{
            marginBottom: 20, padding: '16px', borderRadius: 16,
            background: 'rgba(255,252,244,0.97)', border: '2px solid rgba(180,83,9,0.22)',
            boxShadow: '0 4px 16px rgba(120,80,20,0.10)', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--accent)', marginBottom: 2 }}>{t('expense.add')}</div>
            <input
              value={formTitle} onChange={e => setFormTitle(e.target.value)}
              placeholder={t('expense.form.namePlaceholder')}
              style={{ ...inputStyle, width: '100%' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)}
                placeholder={t('expense.field.amount')} min="0.01" step="0.01"
                style={{ ...inputStyle, flex: 1 }}
              />
              <select
                value={formCurrency} onChange={e => setFormCurrency(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {Object.entries(CURRENCY_FLAG_MAP).map(([c, flag]) => (
                  <option key={c} value={c}>{flag} {c}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={formDay} onChange={e => setFormDay(e.target.value)}
                style={{ ...inputStyle, flex: 1, fontSize: 13, cursor: 'pointer' }}
              >
                {days.length === 0 && <option value="">{t('common.loading')}</option>}
                {days.map(d => (
                  <option key={d} value={d}>{dayLabel(d)}</option>
                ))}
              </select>
              <select
                value={formCategory} onChange={e => setFormCategory(e.target.value)}
                style={{ ...inputStyle, flex: 1, fontSize: 13, cursor: 'pointer' }}
              >
                {Object.entries(EXPENSE_CATEGORY_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {t(v.labelKey)}</option>
                ))}
              </select>
            </div>
            <input
              value={formNotes} onChange={e => setFormNotes(e.target.value)}
              placeholder={t('expense.field.notes')}
              style={{ ...inputStyle, width: '100%', fontSize: 13 }}
            />
            {formError && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626',
                background: 'rgba(220,38,38,0.08)', borderRadius: 8, padding: '6px 10px' }}>
                ⚠️ {formError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAddForm(false); setFormError('') }} style={{
                flex: 1, padding: '9px 8px', borderRadius: 10,
                border: '1.5px solid rgba(165,125,65,0.28)',
                background: 'transparent', color: '#92400E', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>{t('common.cancel')}</button>
              <button
                onClick={handleAddExpense}
                disabled={formSaving || !formTitle.trim() || !formAmount}
                style={{
                  flex: 2, padding: '10px 8px', borderRadius: 10, border: 'none',
                  background: (!formTitle.trim() || !formAmount) ? 'rgba(180,83,9,0.20)' : 'linear-gradient(135deg,#E8A020,#B45309)',
                  boxShadow: (!formTitle.trim() || !formAmount) ? 'none' : '0 3px 0 #7C2D12',
                  color: '#fff', fontSize: 13, fontWeight: 900,
                  cursor: (!formTitle.trim() || !formAmount) ? 'default' : 'pointer',
                  opacity: formSaving ? 0.7 : 1,
                }}
              >{formSaving ? t('expense.submitting') : t('expense.form.addBtn')}</button>
            </div>
          </div>
        )}

        {/* Tab 切換 */}
        {totalItems > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              ['day',      t('expense.tab.byDay')],
              ['total',    t('expense.tab.byCurrency')],
              ['category', t('expense.tab.byCategory')],
              ['user',     t('expense.tab.byMember')],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 900,
                cursor: 'pointer',
                background: tab === id ? 'rgba(180,83,9,0.16)' : 'rgba(165,125,65,0.08)',
                color: tab === id ? 'var(--accent)' : 'var(--text-muted)',
                border: tab === id ? '1.5px solid rgba(180,83,9,0.35)' : '1.5px solid transparent',
                transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>
        )}

        {/* 空狀態 */}
        {totalItems === 0 && (
          <div style={{ textAlign: 'center', padding: '70px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 56 }}>💸</div>
            <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-secondary)' }}>{t('expense.empty')}</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>{t('expense.empty.hint')}</p>
          </div>
        )}

        {/* 按天明細 */}
        {tab === 'day' && totalItems > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {byDay.map(({ day, items }) => {
              const dayTotals = items.reduce((acc, e) => {
                acc[e.currency] = (acc[e.currency] ?? 0) + Number(e.amount ?? 0); return acc
              }, {})
              return (
                <div key={day}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--accent)',
                      background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.22)',
                      padding: '3px 12px', borderRadius: 99 }}>{dayLabel(day)}</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {Object.entries(dayTotals).map(([cur, tot]) => (
                        <span key={cur} style={{ fontSize: 13, fontWeight: 900, color: '#92400E' }}>
                          {CURRENCY_FLAG_MAP[cur] ?? '💱'} {tot.toLocaleString()} {cur}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ExpenseList items={items} tripId={tripId} days={days} />
                </div>
              )
            })}
          </div>
        )}

        {/* 幣別統計 */}
        {tab === 'total' && totalItems > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Object.entries(byCurrency).map(([cur, total]) => {
              const items = expenses.filter(e => e.currency === cur)
              return (
                <div key={cur}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', borderRadius: 16, marginBottom: 12,
                    background: 'rgba(251,191,36,0.08)', border: '2px solid rgba(251,191,36,0.28)',
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-secondary)' }}>
                      {CURRENCY_FLAG_MAP[cur] ?? '💱'} {cur}
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: '#D97706' }}>
                      {Number(total).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(e => {
                      const pct = total > 0 ? (e.amount / total * 100) : 0
                      return (
                        <div key={e.id} style={{ padding: '12px 16px', borderRadius: 14,
                          background: 'rgba(255,252,244,0.90)', border: '1px solid rgba(165,125,65,0.18)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)',
                              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {(EXPENSE_CATEGORY_MAP[e.category]?.icon ?? '💼') + ' ' + e.title}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 900, color: '#D97706', flexShrink: 0, marginLeft: 10 }}>
                              {Number(e.amount ?? 0).toLocaleString()} · {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ height: 8, borderRadius: 99, background: 'rgba(217,119,6,0.10)', overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, height: '100%',
                              background: 'linear-gradient(90deg,#D97706,#FBBF24)',
                              borderRadius: 99, transition: 'width 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 按類別 */}
        {tab === 'category' && totalItems > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {byCategory.map(({ catId, catInfo, items }) => {
              const catTotal = items.reduce((acc, e) => {
                acc[e.currency] = (acc[e.currency] ?? 0) + Number(e.amount ?? 0); return acc
              }, {})
              return (
                <div key={catId}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--accent)',
                      background: 'rgba(180,83,9,0.10)', border: '1.5px solid rgba(180,83,9,0.22)',
                      padding: '3px 14px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {catInfo.icon} {t(catInfo.labelKey)}
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {Object.entries(catTotal).map(([cur, tot]) => (
                        <span key={cur} style={{ fontSize: 13, fontWeight: 900, color: '#92400E' }}>
                          {CURRENCY_FLAG_MAP[cur] ?? '💱'} {tot.toLocaleString()} {cur}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ExpenseList items={items} tripId={tripId} days={days} />
                </div>
              )
            })}
          </div>
        )}

        {/* 按成員 */}
        {tab === 'user' && totalItems > 0 && (
          <div>
            {/* 幣別選擇器 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
              padding: '12px 16px', borderRadius: 14,
              background: 'rgba(255,252,244,0.97)', border: '1.5px solid rgba(165,125,65,0.22)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-secondary)', flexShrink: 0 }}>
                {t('expense.view.currency')}
              </span>
              <select
                value={userViewCurrency}
                onChange={e => setUserViewCurrency(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 9, border: '1.5px solid rgba(165,125,65,0.35)',
                  background: 'rgba(255,252,244,1)', fontSize: 13, fontWeight: 700,
                  color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
                }}
              >
                {Object.entries(CURRENCY_FLAG_MAP).map(([c, flag]) => (
                  <option key={c} value={c}>{flag} {c}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{t('expense.member.rateNote')}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {byUser.map(({ uid, name, items }) => {
                const totalInTarget = items.reduce((sum, e) =>
                  sum + convertAmount(e.amount, e.currency, userViewCurrency), 0)

                return (
                  <div key={uid}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 20px', borderRadius: 16, marginBottom: 12,
                      background: 'rgba(15,118,110,0.07)', border: '2px solid rgba(15,118,110,0.22)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 36, height: 36, borderRadius: '50%', background: 'rgba(15,118,110,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 18, flexShrink: 0,
                        }}>👤</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: '#0F766E' }}>{name}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{t('expense.member.recordCount', { count: items.length })}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: '#D97706' }}>
                          {CURRENCY_FLAG_MAP[userViewCurrency] ?? '💱'} {Math.round(totalInTarget).toLocaleString()}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{userViewCurrency}</div>
                      </div>
                    </div>
                    <ExpenseList items={items} tripId={tripId} days={days} />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部結算按鈕 */}
      {totalItems > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
          padding: '12px 20px max(12px, env(safe-area-inset-bottom, 12px))',
          background: 'rgba(250,246,234,0.97)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderTop: '2px solid rgba(165,125,65,0.22)',
          boxShadow: '0 -4px 24px rgba(120,80,20,0.10)',
        }}>
          <button
            onClick={() => navigate(`/trip/${tripId}/expenses/settle`)}
            style={{
              width: '100%', maxWidth: 600, margin: '0 auto',
              padding: '14px', borderRadius: 16, border: 'none',
              background: 'linear-gradient(135deg,#059669,#047857)',
              boxShadow: '0 4px 0 #065F46, 0 8px 24px rgba(5,150,105,0.30)',
              color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 20 }}>🧾</span>
            {t('expense.settleBtn')}
          </button>
        </div>
      )}
    </div>
  )
}

function ExpenseList({ items, tripId, days = [] }) {
  const { t, lang } = useLanguage()
  const [deleting, setDeleting] = useState(null)
  const [editing,  setEditing]  = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving,   setSaving]   = useState(false)

  // Bug #31：與 add-form 一致的日期顯示
  const WD = lang === 'zh'
    ? ['週日','週一','週二','週三','週四','週五','週六']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const formatEditDay = (d) => {
    const date = new Date(d + 'T00:00:00')
    return `${date.getMonth() + 1}/${date.getDate()} ${WD[date.getDay()]}`
  }

  const startEdit = (e) => {
    setEditing(e.id)
    setEditForm({ title: e.title, amount: String(e.amount ?? ''), currency: e.currency ?? 'TWD', category: e.category ?? 'other', notes: e.notes ?? '', day: e.day ?? '' })
  }

  const [editError, setEditError] = useState('')
  const handleSave = async () => {
    if (!editForm.title?.trim() || !editForm.amount) return
    // Bug #25 / Bug #16：金額必須為有限、大於 0 且小於 10 億的數字（避免 NaN / 溢位）
    const amt = Number(editForm.amount)
    if (!Number.isFinite(amt) || amt <= 0 || amt >= 1e9) {
      setEditError(t('expense.error.invalidAmount'))
      return
    }
    setSaving(true)
    setEditError('')
    try {
      await updateExpense(tripId, editing, {
        title: editForm.title.trim(),
        amount: Number(editForm.amount),
        currency: editForm.currency,
        category: editForm.category,
        notes: editForm.notes.trim(),
        day: editForm.day,
      })
      setEditing(null)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const inputS = {
    padding: '7px 10px', borderRadius: 9, boxSizing: 'border-box',
    border: '1.5px solid rgba(165,125,65,0.35)',
    background: 'rgba(255,252,244,1)', fontSize: 13, fontWeight: 700,
    color: 'var(--text-primary)', outline: 'none', width: '100%',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(e => (
        <div key={e.id} style={{
          padding: '14px 18px', borderRadius: 16,
          background: editing === e.id ? 'rgba(255,252,244,1)' : 'rgba(255,252,244,0.97)',
          border: editing === e.id ? '2px solid rgba(180,83,9,0.35)' : '1.5px solid rgba(165,125,65,0.22)',
          boxShadow: '0 3px 0 rgba(140,100,40,0.12), 0 6px 18px rgba(100,60,10,0.07)',
        }}>
          {editing === e.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={editForm.title} onChange={ev => setEditForm(f => ({ ...f, title: ev.target.value }))}
                placeholder={t('expense.field.title')} style={inputS} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={editForm.amount} onChange={ev => setEditForm(f => ({ ...f, amount: ev.target.value }))}
                  placeholder={t('expense.field.amount')} style={{ ...inputS, flex: 1 }} />
                <select value={editForm.currency} onChange={ev => setEditForm(f => ({ ...f, currency: ev.target.value }))}
                  style={{ ...inputS, flex: 0, width: 80, cursor: 'pointer' }}>
                  {Object.keys(CURRENCY_FLAG_MAP).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={editForm.category} onChange={ev => setEditForm(f => ({ ...f, category: ev.target.value }))}
                  style={{ ...inputS, flex: 1, cursor: 'pointer' }}>
                  {Object.entries(EXPENSE_CATEGORY_MAP).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {t(v.labelKey)}</option>
                  ))}
                </select>
                {days.length > 0 && (
                  <select value={editForm.day} onChange={ev => setEditForm(f => ({ ...f, day: ev.target.value }))}
                    style={{ ...inputS, flex: 1, cursor: 'pointer' }}>
                    {/* Bug #31：顯示與新增表單一致的日期格式 */}
                    {days.map(d => <option key={d} value={d}>{formatEditDay(d)}</option>)}
                  </select>
                )}
              </div>
              <input value={editForm.notes} onChange={ev => setEditForm(f => ({ ...f, notes: ev.target.value }))}
                placeholder={t('expense.field.notes')} style={inputS} />
              {editError && (
                <div style={{ fontSize: 12, fontWeight: 800, color: '#DC2626',
                  padding: '6px 10px', background: 'rgba(220,38,38,0.08)',
                  border: '1px solid rgba(220,38,38,0.22)', borderRadius: 8 }}>
                  ⚠️ {editError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(null)} style={{
                  flex: 1, padding: '8px', borderRadius: 9, border: '1.5px solid rgba(165,125,65,0.28)',
                  background: 'transparent', color: '#92400E', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>{t('common.cancel')}</button>
                <button onClick={handleSave} disabled={saving || !editForm.title?.trim() || !editForm.amount} style={{
                  flex: 2, padding: '8px', borderRadius: 9, border: 'none',
                  background: 'linear-gradient(135deg,#E8A020,#B45309)',
                  color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}>{saving ? t('common.saving') : t('expense.edit.saveBtn')}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(EXPENSE_CATEGORY_MAP[e.category ?? 'other']?.icon ?? '💼') + ' ' + e.title}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {e.day && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                      📅 {e.day}
                    </span>
                  )}
                  {e.notes && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{e.notes}</span>
                  )}
                  {e.createdBy?.displayName && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: '#0F766E',
                      background: 'rgba(15,118,110,0.08)', borderRadius: 99, padding: '1px 7px',
                    }}>
                      👤 {truncateName(e.createdBy.displayName, t('common.unknown'))}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: '#D97706', whiteSpace: 'nowrap' }}>
                  {CURRENCY_FLAG_MAP[e.currency] ?? '💱'} {Number(e.amount ?? 0).toLocaleString()} {e.currency}
                </span>
                <button onClick={() => startEdit(e)}
                  style={{ padding: '3px 7px', borderRadius: 7, background: 'rgba(180,83,9,0.10)', border: '1px solid rgba(180,83,9,0.25)', color: '#B45309', fontSize: 12, cursor: 'pointer' }}>
                  ✏️
                </button>
                {deleting === e.id ? (
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => setDeleting(null)}
                      style={{ padding: '3px 8px', borderRadius: 7, border: '1px solid rgba(165,125,65,0.28)',
                        background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={async () => { await deleteExpense(tripId, e.id); setDeleting(null) }}
                      style={{ padding: '3px 8px', borderRadius: 7, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}
                    >{t('common.delete')}</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleting(e.id)}
                    style={{ padding: '3px 8px', borderRadius: 7, background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.25)', color: '#DC2626', fontSize: 12, cursor: 'pointer' }}
                  >🗑️</button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
