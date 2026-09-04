// Hand-drawn style SVG icons – stroke-only, round caps/joins, 24×24 viewBox
// Drop-in compatible with Phosphor Icons: accepts size, color, weight props

function Hd({ size = 24, color = 'currentColor', sw = 2.1, weight, className, style, children }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}
      aria-hidden="true"
    >{children}</svg>
  )
}

// Compass – 景點 / Attraction
export function HdCompass({ size, color, sw, ...p }) {
  const c = color ?? 'currentColor'
  return (
    <Hd size={size} color={c} sw={sw} {...p}>
      <circle cx="12" cy="12" r="9" />
      {/* Cardinal direction ticks */}
      <path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5" />
      {/* Diamond needle – north half filled */}
      <path d="M12 7 L15 12 L12 17 L9 12 Z" />
      <path d="M12 7 L15 12 L12 12 Z" fill={c} stroke="none" />
    </Hd>
  )
}

// Fork & Knife – 餐廳 / Restaurant
export function HdForkKnife({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      {/* Fork: center tine + handle */}
      <path d="M8 3v18" />
      {/* Left outer tine, curves to join center at y=8.5 */}
      <path d="M6 3v5Q6 8.5 8 8.5" />
      {/* Right outer tine */}
      <path d="M10 3v5Q10 8.5 8 8.5" />
      {/* Knife: spine + curved blade */}
      <path d="M16 3v18" />
      <path d="M16 3Q19.5 5 17.5 9L16 9" />
    </Hd>
  )
}

// Bed – 住宿 / Accommodation
export function HdBed({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      {/* Headboard (left) */}
      <path d="M3 9V4h5v5" />
      {/* Mattress body */}
      <path d="M3 9h18v8H3Z" />
      {/* Pillow humps on top of mattress */}
      <path d="M7 9Q8.5 6 10 9" />
      <path d="M12 9Q13.5 6 15 9" />
      {/* Legs */}
      <path d="M5 17v3M19 17v3" />
    </Hd>
  )
}

// Airplane – 交通 / Transport  (paper-plane / send shape)
export function HdAirplane({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9Z" />
    </Hd>
  )
}

// Map Pin – location / add card
export function HdMapPin({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </Hd>
  )
}

// Wallet – expense
export function HdWallet({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      {/* Body */}
      <path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" />
      {/* Fold line (top flap crease) */}
      <path d="M2 11h20" />
      {/* Coin pocket on right */}
      <path d="M16 14h4v3h-4a1.5 1.5 0 0 1 0-3Z" />
      {/* Card sticking out of top */}
      <path d="M7 6V4h6v2" />
    </Hd>
  )
}

// Chain Link – copy-link button
export function HdLink({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Hd>
  )
}

// Plus / Add
export function HdPlus({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      <path d="M12 5v14M5 12h14" />
    </Hd>
  )
}

// Map (folded) – for map/location section headers
export function HdMap({ size, color, sw, ...p }) {
  return (
    <Hd size={size} color={color} sw={sw} {...p}>
      <path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3z" />
      <path d="M9 3v15M15 6v15" />
    </Hd>
  )
}

// Wallet (small inline variant – identical to HdWallet, kept as alias)
export { HdWallet as HdWalletSm }
