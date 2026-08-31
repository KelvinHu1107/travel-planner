import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { subscribeToExpenses, getTrip, getMemberProfiles } from '../services/firestore'
import { useLanguage } from '../i18n/LanguageContext'

const CURRENCY_FLAG_MAP = {
  TWD: '🇹🇼', JPY: '🇯🇵', USD: '🇺🇸', EUR: '🇪🇺',
  KRW: '🇰🇷', HKD: '🇭🇰', SGD: '🇸🇬', AUD: '🇦🇺',
}

const EXPENSE_CATEGORY_MAP = {
  food:          { icon: '🍜' },
  transport:     { icon: '🚗' },
  accommodation: { icon: '🏨' },
  activity:      { icon: '🎡' },
  shopping:      { icon: '🛍️' },
  other:         { icon: '💼' },
}

const EXCHANGE_TO_TWD = {
  TWD: 1, JPY: 0.21, USD: 32, EUR: 35,
  KRW: 0.024, HKD: 4.1, SGD: 24, AUD: 21,
}

function convertAmount(amount, fromCur, toCur) {
  const twdAmount = Number(amount) * (EXCHANGE_TO_TWD[fromCur] ?? 1)
  return twdAmount / (EXCHANGE_TO_TWD[toCur] ?? 1)
}

function fmt(amount, decimals = 0) {
  return Number(amount).toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function calculateSettlement(expenses, targetCurrency, memberProfiles = [], unknownLabel = 'Unknown') {
  const userMap = {}
  memberProfiles.forEach(m => {
    const name = m.displayName || m.email?.split('@')[0] || unknownLabel
    userMap[m.uid] = { uid: m.uid, name, spent: 0 }
  })

  expenses.forEach(e => {
    const uid = e.createdBy?.uid || 'unknown'
    const name = e.createdBy?.displayName || unknownLabel
    if (!userMap[uid]) userMap[uid] = { uid, name, spent: 0 }
    userMap[uid].spent += convertAmount(e.amount, e.currency, targetCurrency)
  })

  const users = Object.values(userMap)
  if (users.length === 0) return { users: [], total: 0, avg: 0, transactions: [] }

  const total = users.reduce((s, u) => s + u.spent, 0)
  const avg = total / users.length

  const balances = users.map(u => ({ ...u, balance: u.spent - avg }))

  const creditors = balances.filter(b => b.balance > 0.005).map(b => ({ ...b })).sort((a, b) => b.balance - a.balance)
  const debtors   = balances.filter(b => b.balance < -0.005).map(b => ({ ...b })).sort((a, b) => a.balance - b.balance)
  const transactions = []

  let ci = 0, di = 0
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor   = debtors[di]
    const amount   = Math.min(creditor.balance, -debtor.balance)

    transactions.push({
      from: debtor.uid,
      fromName: debtor.name,
      to: creditor.uid,
      toName: creditor.name,
      amount,
    })

    creditor.balance -= amount
    debtor.balance   += amount

    if (creditor.balance < 0.005) ci++
    if (-debtor.balance < 0.005) di++
  }

  return { users, total, avg, transactions }
}

export default function SettlementPage() {
  const { tripId } = useParams()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { t } = useLanguage()

  const [expenses,       setExpenses]       = useState([])
  const [checked,        setChecked]        = useState({})
  const [currency,       setCurrency]       = useState('TWD')
  const [memberProfiles, setMemberProfiles] = useState([])

  useEffect(() => {
    const unsub = subscribeToExpenses(tripId, data => {
      setExpenses(data)
      setChecked(prev => {
        const next = { ...prev }
        data.forEach(e => { if (!(e.id in next)) next[e.id] = true })
        return next
      })
    })
    return () => unsub()
  }, [tripId])

  useEffect(() => {
    getTrip(tripId)
      .then(trip => {
        if (trip.members?.length) {
          getMemberProfiles(trip.members).then(setMemberProfiles)
        }
      })
      .catch(() => {})
  }, [tripId])

  const selectedExpenses = expenses.filter(e => checked[e.id])
  const { users, total, avg, transactions } = calculateSettlement(selectedExpenses, currency, memberProfiles, t('settlement.unknown'))

  const toggleAll = (val) => {
    const next = {}
    expenses.forEach(e => { next[e.id] = val })
    setChecked(next)
  }

  const selectedCount = Object.values(checked).filter(Boolean).length

  const cardStyle = {
    padding: '16px 20px', borderRadius: 16,
    background: 'rgba(255,252,244,0.97)', border: '1.5px solid rgba(165,125,65,0.22)',
    boxShadow: '0 3px 0 rgba(140,100,40,0.12)',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* TopBar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', height: 64,
        background: 'rgba(250,246,234,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '2px solid rgba(165,125,65,0.22)',
        boxShadow: '0 4px 24px rgba(120,80,20,0.10)',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <button
          onClick={() => navigate(`/trip/${tripId}/expenses`, { state: location.state })}
          style={{
            width: 40, height: 40, borderRadius: 12, border: '1.5px solid rgba(165,125,65,0.28)',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 0 rgba(140,100,40,0.18)',
          }}
        ><ArrowLeft size={18} /></button>
        <span style={{ fontSize: 22 }}>🧾</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2 }}>{t('settlement.title')}</h1>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>
            {t('settlement.selectedCount', { selected: selectedCount, total: expenses.length })}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(14px,4vw,20px) 40px' }}>

        {/* 統一幣別 + 全選 */}
        <div style={{
          ...cardStyle, marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {t('settlement.currency')}
          </span>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            style={{
              padding: '7px 11px', borderRadius: 9, border: '1.5px solid rgba(165,125,65,0.35)',
              background: 'rgba(255,252,244,1)', fontSize: 13, fontWeight: 700,
              color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
            }}
          >
            {Object.entries(CURRENCY_FLAG_MAP).map(([c, flag]) => (
              <option key={c} value={c}>{flag} {c}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{t('expense.member.rateNote')}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => toggleAll(true)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 900,
              border: '1.5px solid rgba(180,83,9,0.28)', background: 'rgba(180,83,9,0.08)',
              color: '#B45309', cursor: 'pointer',
            }}>{t('settlement.selectAll')}</button>
            <button onClick={() => toggleAll(false)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 900,
              border: '1.5px solid rgba(165,125,65,0.28)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}>{t('settlement.selectNone')}</button>
          </div>
        </div>

        {/* 開銷清單（含 checkbox） */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px',
            textTransform: 'uppercase', marginBottom: 12 }}>
            {t('settlement.selectItems')}
          </div>
          {expenses.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontWeight: 800 }}>
              {t('settlement.noRecord')}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.map(e => {
              const isChecked = !!checked[e.id]
              const convertedAmt = convertAmount(e.amount, e.currency, currency)
              return (
                <label key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                  padding: '12px 16px', borderRadius: 14,
                  background: isChecked ? 'rgba(255,252,244,0.97)' : 'rgba(240,235,220,0.50)',
                  border: `1.5px solid ${isChecked ? 'rgba(165,125,65,0.22)' : 'rgba(165,125,65,0.10)'}`,
                  boxShadow: isChecked ? '0 2px 8px rgba(100,60,10,0.06)' : 'none',
                  opacity: isChecked ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => setChecked(prev => ({ ...prev, [e.id]: !prev[e.id] }))}
                    style={{ width: 18, height: 18, accentColor: '#B45309', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(EXPENSE_CATEGORY_MAP[e.category ?? 'other']?.icon ?? '💼') + ' ' + e.title}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                      {e.day && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>📅 {e.day}</span>
                      )}
                      {e.createdBy?.displayName && (
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: '#0F766E',
                          background: 'rgba(15,118,110,0.08)', borderRadius: 99, padding: '1px 7px',
                        }}>
                          👤 {e.createdBy.displayName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#D97706' }}>
                      {CURRENCY_FLAG_MAP[e.currency] ?? '💱'} {Number(e.amount).toLocaleString()} {e.currency}
                    </div>
                    {e.currency !== currency && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                        ≈ {CURRENCY_FLAG_MAP[currency] ?? '💱'} {fmt(convertedAmt)} {currency}
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* 結算結果 */}
        {selectedCount > 0 && (
          <>
            {/* 總覽 */}
            <div style={{
              ...cardStyle, marginBottom: 20,
              background: 'rgba(251,191,36,0.08)', border: '2px solid rgba(251,191,36,0.28)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)',
                letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
                {t('settlement.overview')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)' }}>{t('expense.totalSpending')}</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#D97706' }}>
                  {CURRENCY_FLAG_MAP[currency]} {fmt(total)} {currency}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)' }}>
                  {t('settlement.perPerson', { count: users.length })}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#92400E' }}>
                  {CURRENCY_FLAG_MAP[currency]} {fmt(avg)} {currency}
                </span>
              </div>
            </div>

            {/* 各人花費明細 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)',
                letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
                {t('settlement.memberSpend')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {users.map(u => {
                  const diff = u.spent - avg
                  const isOver = diff >= 0
                  return (
                    <div key={u.uid} style={{
                      ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      border: `1.5px solid ${isOver ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.20)'}`,
                      background: isOver ? 'rgba(5,150,105,0.05)' : 'rgba(254,242,242,0.80)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: isOver ? 'rgba(5,150,105,0.12)' : 'rgba(220,38,38,0.10)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                        }}>👤</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{u.name}</div>
                          <div style={{ fontSize: 11, fontWeight: 700,
                            color: isOver ? '#059669' : '#DC2626' }}>
                            {isOver
                              ? t('settlement.overpaid',  { amount: `${fmt(diff, 1)} ${currency}` })
                              : t('settlement.underpaid', { amount: `${fmt(diff, 1)} ${currency}` })}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#D97706' }}>
                          {fmt(u.spent, 1)} {currency}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{t('settlement.actualSpent')}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 轉帳清單 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)',
                letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
                {transactions.length === 0
                  ? t('settlement.noTransactions')
                  : t('settlement.transfersTitle', { count: transactions.length })}
              </div>
              {transactions.length === 0 ? (
                <div style={{
                  ...cardStyle, textAlign: 'center',
                  background: 'rgba(5,150,105,0.07)', border: '2px solid rgba(5,150,105,0.25)',
                }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                  <p style={{ fontSize: 15, fontWeight: 900, color: '#059669' }}>{t('settlement.equalSpending')}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{t('settlement.noTransferNeeded')}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {transactions.map((tx, i) => (
                    <div key={i} style={{
                      ...cardStyle,
                      background: 'rgba(239,246,255,0.80)', border: '2px solid rgba(59,130,246,0.22)',
                      display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                      <div style={{ textAlign: 'center', minWidth: 56 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#DC2626' }}>{tx.fromName}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{t('settlement.payer')}</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 18, color: '#3B82F6' }}>→</div>
                        <div style={{
                          fontSize: 16, fontWeight: 900, color: '#3B82F6',
                          background: 'rgba(59,130,246,0.10)', borderRadius: 99,
                          padding: '3px 12px', display: 'inline-block', marginTop: 2,
                        }}>
                          {CURRENCY_FLAG_MAP[currency]} {fmt(tx.amount, 1)} {currency}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 56 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#059669' }}>{tx.toName}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{t('settlement.payee')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {selectedCount === 0 && expenses.length > 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>☑️</div>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-muted)' }}>
              {t('settlement.noSelection')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
