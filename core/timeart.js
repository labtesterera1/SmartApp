/* ============================================================
   core/timeart.js
   Returns an SVG string for the current time of day.
   Subjects are CENTERED so cropping by container width is symmetric.
   Aspect ~ 5:2 (wider than tall) to match a banner.
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

/* All scenes share these:
   - viewBox 500x180 (5:1.8 — fits both phone banner and desktop side panel)
   - subject (sun/moon) centered horizontally at x=250
   - horizon line at y=120
   - thin lime ticks across full width
*/

const SUNRISE = `
<svg viewBox="0 0 500 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sr-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#1a0f08"/>
      <stop offset="60%" stop-color="#2a1810"/>
      <stop offset="100%" stop-color="#3a2515"/>
    </linearGradient>
    <radialGradient id="sr-glow" cx="50%" cy="100%" r="65%">
      <stop offset="0%"  stop-color="#d4ff3a" stop-opacity="0.55"/>
      <stop offset="35%" stop-color="#ff9d4a" stop-opacity="0.40"/>
      <stop offset="100%" stop-color="#ff7a3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="500" height="180" fill="url(#sr-sky)"/>
  <ellipse cx="250" cy="135" rx="200" ry="65" fill="url(#sr-glow)"/>
  <!-- horizon -->
  <line x1="0" y1="120" x2="500" y2="120" stroke="#d4ff3a" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- sun half-clipped by horizon -->
  <circle cx="250" cy="120" r="18" fill="#d4ff3a"/>
  <rect x="0" y="120" width="500" height="60" fill="url(#sr-sky)"/>
  <line x1="0" y1="120" x2="500" y2="120" stroke="#d4ff3a" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- ticks -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="50"  y1="120" x2="50"  y2="125"/>
    <line x1="100" y1="120" x2="100" y2="123"/>
    <line x1="150" y1="120" x2="150" y2="123"/>
    <line x1="200" y1="120" x2="200" y2="123"/>
    <line x1="300" y1="120" x2="300" y2="123"/>
    <line x1="350" y1="120" x2="350" y2="123"/>
    <line x1="400" y1="120" x2="400" y2="123"/>
    <line x1="450" y1="120" x2="450" y2="125"/>
  </g>
</svg>
`.trim();

const DAY = `
<svg viewBox="0 0 500 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="d-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#0c0b09"/>
      <stop offset="100%" stop-color="#1a1812"/>
    </linearGradient>
    <radialGradient id="d-glow" cx="50%" cy="40%" r="22%">
      <stop offset="0%"  stop-color="#d4ff3a" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#d4ff3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="500" height="180" fill="url(#d-sky)"/>
  <!-- soft sun glow -->
  <circle cx="250" cy="65" r="80" fill="url(#d-glow)"/>
  <!-- sun -->
  <circle cx="250" cy="65" r="20" fill="#d4ff3a"/>
  <!-- sun rays -->
  <g stroke="#d4ff3a" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.65">
    <line x1="250" y1="30" x2="250" y2="38"/>
    <line x1="285" y1="65" x2="277" y2="65"/>
    <line x1="250" y1="100" x2="250" y2="92"/>
    <line x1="215" y1="65" x2="223" y2="65"/>
    <line x1="225" y1="40" x2="230" y2="45"/>
    <line x1="275" y1="40" x2="270" y2="45"/>
    <line x1="225" y1="90" x2="230" y2="85"/>
    <line x1="275" y1="90" x2="270" y2="85"/>
  </g>
  <!-- horizon -->
  <line x1="0" y1="135" x2="500" y2="135" stroke="#d4ff3a" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- ticks -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="50"  y1="135" x2="50"  y2="140"/>
    <line x1="100" y1="135" x2="100" y2="138"/>
    <line x1="150" y1="135" x2="150" y2="138"/>
    <line x1="200" y1="135" x2="200" y2="138"/>
    <line x1="250" y1="135" x2="250" y2="140"/>
    <line x1="300" y1="135" x2="300" y2="138"/>
    <line x1="350" y1="135" x2="350" y2="138"/>
    <line x1="400" y1="135" x2="400" y2="138"/>
    <line x1="450" y1="135" x2="450" y2="140"/>
  </g>
  <!-- low minimal silhouette -->
  <path d="M 0 135 L 80 132 L 160 134 L 250 130 L 340 133 L 420 131 L 500 134 L 500 180 L 0 180 Z"
        fill="#0c0b09" fill-opacity="0.55"/>
</svg>
`.trim();

const SUNSET = `
<svg viewBox="0 0 500 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#1a0a08"/>
      <stop offset="55%" stop-color="#3a1810"/>
      <stop offset="100%" stop-color="#4a2a18"/>
    </linearGradient>
    <radialGradient id="ss-glow" cx="50%" cy="100%" r="70%">
      <stop offset="0%"  stop-color="#ff9d4a" stop-opacity="0.65"/>
      <stop offset="50%" stop-color="#ff5c2a" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#ff5c2a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="500" height="180" fill="url(#ss-sky)"/>
  <ellipse cx="250" cy="135" rx="220" ry="60" fill="url(#ss-glow)"/>
  <!-- horizon -->
  <line x1="0" y1="125" x2="500" y2="125" stroke="#d4ff3a" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- sun half-clipped by horizon -->
  <circle cx="250" cy="125" r="24" fill="#ff9d4a"/>
  <rect x="0" y="125" width="500" height="55" fill="url(#ss-sky)"/>
  <line x1="0" y1="125" x2="500" y2="125" stroke="#d4ff3a" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- ticks -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="50"  y1="125" x2="50"  y2="130"/>
    <line x1="100" y1="125" x2="100" y2="128"/>
    <line x1="150" y1="125" x2="150" y2="128"/>
    <line x1="200" y1="125" x2="200" y2="128"/>
    <line x1="300" y1="125" x2="300" y2="128"/>
    <line x1="350" y1="125" x2="350" y2="128"/>
    <line x1="400" y1="125" x2="400" y2="128"/>
    <line x1="450" y1="125" x2="450" y2="130"/>
  </g>
</svg>
`.trim();

const NIGHT = `
<svg viewBox="0 0 500 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="n-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#06050a"/>
      <stop offset="100%" stop-color="#0c0b1a"/>
    </linearGradient>
    <radialGradient id="n-glow" cx="50%" cy="35%" r="22%">
      <stop offset="0%"  stop-color="#d4ff3a" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#d4ff3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="500" height="180" fill="url(#n-sky)"/>
  <!-- moon glow -->
  <circle cx="250" cy="65" r="65" fill="url(#n-glow)"/>
  <!-- crescent moon -->
  <circle cx="250" cy="65" r="20" fill="#d4ff3a"/>
  <circle cx="240" cy="60" r="18" fill="#06050a"/>
  <!-- stars symmetric -->
  <g fill="#d4ff3a">
    <circle cx="55"  cy="35"  r="0.9" fill-opacity="0.85"/>
    <circle cx="100" cy="55"  r="0.7" fill-opacity="0.7"/>
    <circle cx="135" cy="25"  r="1.0" fill-opacity="0.9"/>
    <circle cx="170" cy="80"  r="0.7" fill-opacity="0.6"/>
    <circle cx="195" cy="42"  r="0.6" fill-opacity="0.55"/>
    <circle cx="305" cy="42"  r="0.6" fill-opacity="0.55"/>
    <circle cx="330" cy="80"  r="0.7" fill-opacity="0.6"/>
    <circle cx="365" cy="25"  r="1.0" fill-opacity="0.9"/>
    <circle cx="400" cy="55"  r="0.7" fill-opacity="0.7"/>
    <circle cx="445" cy="35"  r="0.9" fill-opacity="0.85"/>
    <circle cx="220" cy="100" r="0.6" fill-opacity="0.5"/>
    <circle cx="280" cy="100" r="0.6" fill-opacity="0.5"/>
  </g>
  <!-- horizon -->
  <line x1="0" y1="135" x2="500" y2="135" stroke="#d4ff3a" stroke-opacity="0.35" stroke-width="0.8"/>
  <!-- ticks -->
  <g stroke="#d4ff3a" stroke-opacity="0.45" stroke-width="0.6">
    <line x1="50"  y1="135" x2="50"  y2="140"/>
    <line x1="100" y1="135" x2="100" y2="138"/>
    <line x1="150" y1="135" x2="150" y2="138"/>
    <line x1="200" y1="135" x2="200" y2="138"/>
    <line x1="250" y1="135" x2="250" y2="140"/>
    <line x1="300" y1="135" x2="300" y2="138"/>
    <line x1="350" y1="135" x2="350" y2="138"/>
    <line x1="400" y1="135" x2="400" y2="138"/>
    <line x1="450" y1="135" x2="450" y2="140"/>
  </g>
  <!-- low silhouette -->
  <path d="M 0 135 L 80 133 L 170 135 L 250 132 L 330 134 L 420 131 L 500 135 L 500 180 L 0 180 Z"
        fill="#06050a" fill-opacity="0.7"/>
</svg>
`.trim();
