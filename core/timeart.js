/* ============================================================
   core/timeart.js
   Returns an SVG string for the current time of day.
   Abstract, minimal — horizon + celestial body + lime accents.
   ============================================================ */

export function getTimeBand(date = new Date()) {
  const h = date.getHours();
  if (h >= 5  && h < 8)  return 'sunrise';
  if (h >= 8  && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'sunset';
  return 'night';
}

export function getTimeArtSvg(band = getTimeBand()) {
  switch (band) {
    case 'sunrise': return SUNRISE;
    case 'day':     return DAY;
    case 'sunset':  return SUNSET;
    case 'night':
    default:        return NIGHT;
  }
}

export function getBandLabel(band = getTimeBand()) {
  return ({
    sunrise: 'SUNRISE',
    day:     'DAY',
    sunset:  'SUNSET',
    night:   'NIGHT',
  })[band] || 'NIGHT';
}

/* ===== SVGs ===== */

const SUNRISE = `
<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sr-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#1a0f08"/>
      <stop offset="55%" stop-color="#2a1810"/>
      <stop offset="100%" stop-color="#3a2515"/>
    </linearGradient>
    <radialGradient id="sr-sun" cx="50%" cy="100%" r="55%">
      <stop offset="0%"  stop-color="#d4ff3a" stop-opacity="0.8"/>
      <stop offset="40%" stop-color="#ff9d4a" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ff7a3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="140" fill="url(#sr-sky)"/>
  <ellipse cx="160" cy="120" rx="110" ry="55" fill="url(#sr-sun)"/>
  <!-- horizon line -->
  <line x1="0" y1="100" x2="320" y2="100" stroke="#d4ff3a" stroke-opacity="0.35" stroke-width="0.8"/>
  <!-- sun -->
  <circle cx="160" cy="100" r="14" fill="#d4ff3a"/>
  <circle cx="160" cy="100" r="14" fill="#0c0b09" mask="url(#sr-mask)"/>
  <mask id="sr-mask"><rect width="320" height="100" fill="white"/></mask>
  <!-- ruler ticks on horizon -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="20"  y1="100" x2="20"  y2="105"/>
    <line x1="60"  y1="100" x2="60"  y2="103"/>
    <line x1="100" y1="100" x2="100" y2="103"/>
    <line x1="140" y1="100" x2="140" y2="103"/>
    <line x1="180" y1="100" x2="180" y2="103"/>
    <line x1="220" y1="100" x2="220" y2="103"/>
    <line x1="260" y1="100" x2="260" y2="105"/>
    <line x1="300" y1="100" x2="300" y2="103"/>
  </g>
</svg>
`.trim();

const DAY = `
<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="d-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#0c0b09"/>
      <stop offset="100%" stop-color="#1a1812"/>
    </linearGradient>
    <radialGradient id="d-sunglow" cx="75%" cy="35%" r="22%">
      <stop offset="0%"  stop-color="#d4ff3a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#d4ff3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="140" fill="url(#d-sky)"/>
  <!-- soft sun glow -->
  <circle cx="240" cy="48" r="60" fill="url(#d-sunglow)"/>
  <!-- sun -->
  <circle cx="240" cy="48" r="16" fill="#d4ff3a"/>
  <!-- sun rays -->
  <g stroke="#d4ff3a" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.6">
    <line x1="240" y1="20" x2="240" y2="26"/>
    <line x1="268" y1="48" x2="262" y2="48"/>
    <line x1="240" y1="76" x2="240" y2="70"/>
    <line x1="212" y1="48" x2="218" y2="48"/>
    <line x1="220" y1="28" x2="223" y2="32"/>
    <line x1="260" y1="28" x2="257" y2="32"/>
    <line x1="220" y1="68" x2="223" y2="64"/>
    <line x1="260" y1="68" x2="257" y2="64"/>
  </g>
  <!-- horizon line -->
  <line x1="0" y1="105" x2="320" y2="105" stroke="#d4ff3a" stroke-opacity="0.35" stroke-width="0.8"/>
  <!-- ruler ticks -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="20"  y1="105" x2="20"  y2="110"/>
    <line x1="60"  y1="105" x2="60"  y2="108"/>
    <line x1="100" y1="105" x2="100" y2="108"/>
    <line x1="140" y1="105" x2="140" y2="108"/>
    <line x1="180" y1="105" x2="180" y2="108"/>
    <line x1="220" y1="105" x2="220" y2="108"/>
    <line x1="260" y1="105" x2="260" y2="110"/>
    <line x1="300" y1="105" x2="300" y2="108"/>
  </g>
  <!-- distant minimal silhouette -->
  <path d="M 0 105 L 40 102 L 80 104 L 120 100 L 170 103 L 210 99 L 260 104 L 320 101 L 320 140 L 0 140 Z"
        fill="#0c0b09" fill-opacity="0.6"/>
</svg>
`.trim();

const SUNSET = `
<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#1a0a08"/>
      <stop offset="55%" stop-color="#3a1810"/>
      <stop offset="100%" stop-color="#4a2a18"/>
    </linearGradient>
    <radialGradient id="ss-sun" cx="50%" cy="80%" r="60%">
      <stop offset="0%"  stop-color="#ff9d4a" stop-opacity="0.7"/>
      <stop offset="50%" stop-color="#ff5c2a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ff5c2a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="140" fill="url(#ss-sky)"/>
  <ellipse cx="160" cy="100" rx="120" ry="50" fill="url(#ss-sun)"/>
  <!-- horizon line -->
  <line x1="0" y1="92" x2="320" y2="92" stroke="#d4ff3a" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- low sun, half-clipped by horizon -->
  <circle cx="160" cy="92" r="20" fill="#ff9d4a"/>
  <rect x="0" y="92" width="320" height="48" fill="url(#ss-sky)"/>
  <line x1="0" y1="92" x2="320" y2="92" stroke="#d4ff3a" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- ticks -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="20"  y1="92" x2="20"  y2="97"/>
    <line x1="60"  y1="92" x2="60"  y2="95"/>
    <line x1="100" y1="92" x2="100" y2="95"/>
    <line x1="140" y1="92" x2="140" y2="95"/>
    <line x1="180" y1="92" x2="180" y2="95"/>
    <line x1="220" y1="92" x2="220" y2="95"/>
    <line x1="260" y1="92" x2="260" y2="97"/>
    <line x1="300" y1="92" x2="300" y2="95"/>
  </g>
</svg>
`.trim();

const NIGHT = `
<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="n-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#06050a"/>
      <stop offset="100%" stop-color="#0c0b1a"/>
    </linearGradient>
    <radialGradient id="n-moonglow" cx="22%" cy="35%" r="20%">
      <stop offset="0%"  stop-color="#d4ff3a" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#d4ff3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="140" fill="url(#n-sky)"/>
  <!-- moon glow -->
  <circle cx="70" cy="48" r="55" fill="url(#n-moonglow)"/>
  <!-- crescent moon: lime disc + offset bg-disc -->
  <circle cx="70" cy="48" r="16" fill="#d4ff3a"/>
  <circle cx="62" cy="44" r="14" fill="#06050a"/>
  <!-- stars -->
  <g fill="#d4ff3a">
    <circle cx="135" cy="22" r="0.9" fill-opacity="0.85"/>
    <circle cx="160" cy="38" r="0.7" fill-opacity="0.7"/>
    <circle cx="190" cy="18" r="1.1" fill-opacity="0.9"/>
    <circle cx="215" cy="52" r="0.7" fill-opacity="0.6"/>
    <circle cx="240" cy="28" r="0.9" fill-opacity="0.85"/>
    <circle cx="270" cy="62" r="0.6" fill-opacity="0.5"/>
    <circle cx="290" cy="32" r="0.8" fill-opacity="0.7"/>
    <circle cx="125" cy="60" r="0.6" fill-opacity="0.55"/>
    <circle cx="180" cy="68" r="0.7" fill-opacity="0.6"/>
    <circle cx="225" cy="14" r="0.7" fill-opacity="0.65"/>
  </g>
  <!-- horizon line -->
  <line x1="0" y1="105" x2="320" y2="105" stroke="#d4ff3a" stroke-opacity="0.35" stroke-width="0.8"/>
  <!-- ticks -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="20"  y1="105" x2="20"  y2="110"/>
    <line x1="60"  y1="105" x2="60"  y2="108"/>
    <line x1="100" y1="105" x2="100" y2="108"/>
    <line x1="140" y1="105" x2="140" y2="108"/>
    <line x1="180" y1="105" x2="180" y2="108"/>
    <line x1="220" y1="105" x2="220" y2="108"/>
    <line x1="260" y1="105" x2="260" y2="110"/>
    <line x1="300" y1="105" x2="300" y2="108"/>
  </g>
  <!-- distant low silhouette -->
  <path d="M 0 105 L 40 103 L 80 105 L 130 102 L 180 104 L 230 101 L 280 105 L 320 103 L 320 140 L 0 140 Z"
        fill="#06050a" fill-opacity="0.7"/>
</svg>
`.trim();
