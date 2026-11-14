// Generates hooks/scene.ts: a pixel-art home office, day (light mode) and night (dark mode).
// Run: node tools/gen-scene.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const P = 6 // pixel block size for rasterized organic shapes
const out = []
const r = n => Math.round(n)
const add = s => out.push(s)

const rect = (x, y, w, h, c, extra = '') => `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" class="${c}"${extra}/>`
const poly = (pts, c) => `<polygon points="${pts.map(p => p.map(r).join(',')).join(' ')}" class="${c}"/>`

// Rasterize an inside-test into horizontal runs on a P grid.
function raster(inside, x0, y0, x1, y1, c, p = P) {
  const s = []
  const gx0 = Math.floor(x0 / p) * p
  const gy0 = Math.floor(y0 / p) * p
  for (let y = gy0; y < y1; y += p) {
    let run = null
    for (let x = gx0; x <= x1 + p; x += p) {
      const hit = x < x1 + p && inside(x + p / 2, y + p / 2)
      if (hit && run === null) run = x
      if (!hit && run !== null) {
        s.push(`M${r(run)} ${r(y)}h${r(x - run)}v${p}h-${r(x - run)}z`)
        run = null
      }
    }
  }
  return s.length ? `<path class="${c}" d="${s.join('')}"/>` : ''
}

function ellipse(cx, cy, rx, ry, deg, c, p = P) {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a), sin = Math.sin(a)
  const R = Math.max(rx, ry)
  return raster((x, y) => {
    const dx = x - cx, dy = y - cy
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos
    return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1
  }, cx - R, cy - R, cx + R, cy + R, c, p)
}

function line(x0, y0, x1, y1, t, c, p = P) {
  const L = Math.hypot(x1 - x0, y1 - y0)
  return raster((x, y) => {
    const k = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (L * L)))
    return Math.hypot(x - (x0 + k * (x1 - x0)), y - (y0 + k * (y1 - y0))) <= t / 2
  }, Math.min(x0, x1) - t, Math.min(y0, y1) - t, Math.max(x0, x1) + t, Math.max(y0, y1) + t, c, p)
}

function inPoly(pts) {
  return (x, y) => {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
}
function pixelPoly(pts, c, p = P) {
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
  return raster(inPoly(pts), Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), c, p)
}

// A leaf: body, lit half, midrib.
function leaf(cx, cy, len, wid, deg, tone = '') {
  wid = Math.max(wid * 1.3, len * 0.5)
  const a = (deg * Math.PI) / 180
  const ox = -Math.sin(a) * wid * 0.18, oy = Math.cos(a) * wid * 0.18
  const ux = Math.cos(a) * len * 0.42, uy = Math.sin(a) * len * 0.42
  return (
    ellipse(cx, cy, len / 2, wid / 2, deg, 'lf' + tone) +
    ellipse(cx - ox, cy - oy, len / 2.6, wid / 4.2, deg, 'll' + tone) +
    line(cx - ux, cy - uy, cx + ux * 0.8, cy + uy * 0.8, 3, 'ld', 3)
  )
}

// Spark (8 rays) like the framed art.
function spark(cx, cy, R, t, c, p = 3) {
  let s = ''
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8 * 0
    s += line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, t, c, p)
  }
  return s
}


// SMIL animation helpers (the app's backdrop plays SMIL).
const INF = 'repeatCount="indefinite"'
const EASE = (n) => `calcMode="spline" keyTimes="${Array.from({ length: n }, (_, i) => +(i / (n - 1)).toFixed(3)).join(';')}" keySplines="${Array(n - 1).fill('.45 0 .55 1').join(';')}"`
const rot = (cx, cy, dur, a = 2.4, begin = 0) => `<animateTransform attributeName="transform" type="rotate" values="${-a} ${cx} ${cy};${a} ${cx} ${cy};${-a} ${cx} ${cy}" dur="${dur}s" begin="${begin}s" ${INF} ${EASE(3)}/>`
const move = (values, dur, { discrete = false, begin = 0, keyTimes = '' } = {}) => `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}s" begin="${begin}s" ${INF}${discrete ? ' calcMode="discrete"' : ''}${keyTimes ? ` keyTimes="${keyTimes}"` : ''}/>`
const fade = (values, dur, { discrete = false, begin = 0, keyTimes = '' } = {}) => `<animate attributeName="opacity" values="${values}" dur="${dur}s" begin="${begin}s" ${INF}${discrete ? ' calcMode="discrete"' : ''}${keyTimes ? ` keyTimes="${keyTimes}"` : ''}/>`
const arect = (x, y, w, h, c, anim) => `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" class="${c}">${anim}</rect>`

// ───────────────────────── wall, floor, light on the wall
add(`<g id="room">`)
add(rect(-400, -200, 2472, 1000, 'wall'))
// soft wall shading near corners
add(rect(1340, -200, 90, 1000, 'wsh'))
// wall light beams (day: sun; night: faint)
add(`<g class="beam">${fade(".7;1;.7", 10)}`)
add(poly([[1430, 120], [1430, 360], [950, 800], [700, 800]], 'bm'))
add(poly([[1430, 385], [1430, 548], [1110, 800], [975, 800]], 'bm'))
add(poly([[1250, 240], [1300, 240], [920, 600], [890, 600]], 'bm2'))
add(`</g>`)
// baseboard + floor
add(rect(-400, 794, 2472, 16, 'base'))
add(rect(-400, 808, 2472, 4, 'basel'))
add(rect(-400, 812, 2472, 300, 'floor'))
for (const [y, off] of [[846, 0], [880, 140], [914, 60], [948, 200]]) {
  add(rect(-400, y, 2472, 3, 'fl'))
  for (let x = -400 + off; x < 2072; x += 290) add(rect(x, y - 34, 3, 34, 'fl'))
}
// sun / lamp patch on floor with window grid
add(`<g class="patch">${fade(".7;1;.7", 10)}`)
add(poly([[600, 816], [770, 816], [690, 852], [500, 852]], 'pt'))
add(poly([[785, 816], [935, 816], [860, 852], [705, 852]], 'pt'))
add(poly([[495, 858], [685, 858], [600, 896], [410, 896]], 'pt'))
add(poly([[700, 858], [855, 858], [780, 896], [615, 896]], 'pt'))
add(`</g>`)
add(`</g>`)

// ───────────────────────── night lamp glows (behind furniture)
add(`<g class="n glow">${fade(".75;1;.75", 5)}`)
add(`<circle cx="1208" cy="540" r="420" fill="url(#gl1)"/>`)
add(`<circle cx="176" cy="500" r="230" fill="url(#gl2)"/>`)
add(`</g>`)

// ───────────────────────── top-left hanging foliage
add(`<g class="sway sw1">${rot(0, 0, 8, 3)}`)
for (const [x, y, l, w, d] of [
  [10, 20, 70, 34, 120], [55, 12, 80, 38, 70], [110, 30, 84, 40, 30], [160, 18, 80, 36, -10], [205, 26, 70, 32, 20],
  [40, 70, 78, 36, 100], [92, 82, 80, 38, 60], [140, 74, 76, 34, 35], [190, 62, 64, 30, 10], [128, 112, 60, 30, 80],
  [20, 108, 60, 28, 110], [222, 6, 50, 26, -20],
]) add(leaf(x, y, l, w, d))
add(`</g>`)

// ───────────────────────── framed landscape (left)
add(rect(36, 168, 132, 192, 'frame'))
add(rect(42, 174, 120, 180, 'mat'))
add(rect(54, 188, 96, 152, 'psky'))
add(ellipse(98, 228, 22, 9, 0, 'pcl'))
add(ellipse(118, 220, 14, 9, 0, 'pcl'))
add(pixelPoly([[54, 300], [80, 286], [110, 294], [150, 280], [150, 340], [54, 340]], 'phl'))
add(pixelPoly([[54, 316], [96, 302], [130, 314], [150, 308], [150, 340], [54, 340]], 'phd'))

// ───────────────────────── dresser + its things
add(rect(0, 570, 246, 14, 'wht'))
add(rect(0, 584, 238, 246, 'wht2'))
add(rect(232, 584, 6, 246, 'whs'))
for (const y of [650, 718, 786]) add(rect(0, y, 232, 4, 'whs'))
add(rect(0, 826, 238, 6, 'whs'))
// dresser plant
add(`<g class="sway sw2">${rot(30, 516, 6, 3)}`)
for (const [x, y, l, w, d] of [[14, 470, 60, 22, -110], [42, 458, 64, 22, -70], [70, 476, 56, 20, -35], [0, 500, 50, 20, -150], [62, 500, 50, 18, -15], [30, 440, 50, 18, -90]]) add(leaf(x, y, l, w, d))
add(`</g>`)
add(rect(4, 516, 54, 54, 'pot'))
add(rect(46, 516, 12, 54, 'pots'))
// books
add(rect(82, 506, 14, 64, 'bkb'))
add(rect(97, 512, 13, 58, 'bkt'))
add(rect(111, 504, 15, 66, 'bkb2'))
// mushroom lamp
add(raster((x, y) => y < 506 && ((x - 176) ** 2) / 1444 + ((y - 506) ** 2) / 2500 <= 1, 138, 456, 214, 506, 'shade', 4))
add(rect(138, 504, 76, 6, 'shade2'))
add(rect(170, 510, 12, 44, 'dark'))
add(rect(144, 554, 66, 16, 'wood'))
add(rect(144, 566, 66, 4, 'woodd'))

// ───────────────────────── floor monstera
add(`<g class="sway sw3">${rot(50, 820, 9, 2.2)}`)
add(line(46, 820, 30, 700, 6, 'stem'))
add(line(54, 820, 110, 700, 6, 'stem'))
add(line(50, 820, 70, 640, 6, 'stem'))
for (const [x, y, l, w, d] of [[30, 690, 130, 70, -150], [118, 690, 120, 66, -30], [70, 632, 110, 60, -80], [150, 760, 90, 50, 20], [6, 760, 90, 50, 160], [100, 600, 70, 36, -60]]) add(leaf(x, y, l, w, d, 'm'))
add(`</g>`)
add(rect(0, 818, 104, 12, 'pot'))
add(rect(6, 830, 92, 76, 'pot'))
add(rect(84, 830, 14, 76, 'pots'))

// ───────────────────────── window (right)
add(`<clipPath id="win"><rect x="1446" y="76" width="160" height="292"/><rect x="1622" y="76" width="60" height="292"/><rect x="1446" y="384" width="160" height="148"/><rect x="1622" y="384" width="60" height="148"/></clipPath>`)
add(`<g clip-path="url(#win)">`)
// day view
add(`<g class="d">`)
add(rect(1440, 70, 260, 470, 'sky1'))
add(rect(1440, 70, 260, 120, 'sky0'))
add(`<g class="drift">${move("30 0;-110 0;30 0", 90)}`)
add(ellipse(1670, 250, 50, 22, 0, 'cld') + ellipse(1640, 270, 46, 18, 0, 'cld') + ellipse(1700, 230, 34, 22, 0, 'cld'))
add(ellipse(1540, 320, 40, 14, 0, 'cld') + ellipse(1570, 310, 26, 14, 0, 'cld'))
add(ellipse(1490, 140, 28, 10, 0, 'cld'))
add(`</g>`)
for (const [x, y, rx, ry] of [[1470, 470, 40, 40], [1520, 450, 44, 46], [1580, 470, 40, 40], [1640, 440, 48, 52], [1690, 460, 40, 46], [1500, 510, 70, 30], [1630, 510, 80, 30]]) add(ellipse(x, y, rx, ry, 0, 'tr1'))
for (const [x, y, rx, ry] of [[1515, 440, 18, 14], [1645, 420, 22, 14], [1470, 460, 14, 10], [1585, 462, 16, 10]]) add(ellipse(x, y, rx, ry, 0, 'tr2'))
add(`</g>`)
// night view
add(`<g class="n">`)
add(rect(1440, 70, 260, 470, 'nsky1'))
add(rect(1440, 70, 260, 160, 'nsky0'))
add(`<circle cx="1562" cy="232" r="40" fill="url(#moon)"/>`)
add(ellipse(1562, 232, 15, 15, 0, 'moon', 3))
add(`<g class="stars">`)
for (const [x, y, k] of [[1470, 110, 1], [1530, 150, 2], [1600, 100, 3], [1650, 140, 1], [1490, 260, 2], [1640, 210, 3], [1520, 320, 1], [1660, 300, 2], [1585, 340, 3], [1460, 190, 3], [1630, 360, 1]]) add(arect(x, y, 4, 4, 'star', fade('1;.2;1', 3, { discrete: true, begin: -k })))
add(`</g>`)
add(ellipse(1650, 300, 46, 10, 0, 'ncld') + ellipse(1675, 290, 26, 10, 0, 'ncld'))
// city
for (const [x, y, w] of [[1452, 452, 46], [1504, 430, 40], [1552, 470, 30], [1588, 440, 50], [1644, 456, 40]]) {
  add(rect(x, y, w, 120, 'bld'))
  let i = 0
  for (let yy = y + 10; yy < 520; yy += 16) for (let xx = x + 6; xx < x + w - 6; xx += 12) {
    if ((xx * 7 + yy * 3) % 5 < 2) add(i++ % 4 === 0 ? arect(xx, yy, 5, 7, 'lit', fade('1;.1;1', 11, { discrete: true, keyTimes: '0;.6;.75', begin: -(i % 3) * 4 })) : rect(xx, yy, 5, 7, 'lit'))
  }
}
for (const [x, y, rx, ry] of [[1470, 505, 40, 26], [1540, 512, 44, 22], [1620, 505, 46, 28], [1690, 515, 40, 24]]) add(ellipse(x, y, rx, ry, 0, 'ntr'))
add(`</g>`)
add(`</g>`)
// frame + mullions
add(rect(1432, 62, 260, 14, 'wfr'))
add(rect(1432, 62, 14, 486, 'wfr'))
add(rect(1606, 62, 16, 486, 'wfr'))
add(rect(1432, 368, 260, 16, 'wfr'))
add(rect(1432, 532, 260, 16, 'wfr'))
add(rect(1424, 546, 270, 8, 'wfr2'))
// blind
add(rect(1404, 0, 290, 34, 'bl0'))
add(rect(1410, 34, 284, 80, 'bl1'))
for (let y = 42; y < 114; y += 12) add(rect(1410, y, 284, 3, 'bl2'))
add(rect(1410, 110, 284, 6, 'bl0'))

// ───────────────────────── shelves
add(`<g class="sway sw4">${rot(1066, 190, 7, 3)}`)
for (const [x, y, l, w, d] of [
  [1006, 168, 50, 24, -150], [1036, 150, 52, 24, -110], [1070, 150, 50, 22, -60], [1096, 168, 48, 22, -20], [1054, 136, 40, 20, -90],
  [990, 210, 44, 22, 150], [1112, 196, 40, 20, 10],
]) add(leaf(x, y, l, w, d))
add(`</g>`)
add(`<g class="sway sw5">${rot(1030, 222, 6.5, 4)}`)
add(line(1012, 222, 1004, 300, 4, 'stem', 3) + line(1004, 300, 1022, 390, 4, 'stem', 3))
add(line(1056, 222, 1052, 300, 4, 'stem', 3))
for (const [x, y, l, w, d] of [[992, 240, 36, 22, 140], [1024, 262, 34, 20, 40], [994, 292, 36, 22, 150], [1026, 316, 34, 20, 30], [1000, 346, 34, 20, 140], [1030, 376, 30, 18, 60], [1016, 396, 28, 18, 100], [1068, 250, 30, 18, 40], [1042, 282, 30, 18, 150]]) add(leaf(x, y, l, w, d))
add(`</g>`)
add(rect(1038, 190, 58, 36, 'pot'))
add(rect(1084, 190, 12, 36, 'pots'))
add(rect(1078, 226, 252, 14, 'wood'))
add(rect(1078, 238, 252, 5, 'woodd'))
// framed spark
add(rect(1156, 120, 118, 106, 'frame'))
add(rect(1163, 127, 104, 92, 'mat'))
add(`<g class="spin">`)
add(spark(1215, 173, 30, 9, 'org'))
add(`</g>`)
// lower shelf books
add(rect(1118, 298, 104, 14, 'wht') + rect(1118, 308, 104, 3, 'whs'))
add(rect(1112, 312, 112, 14, 'bkg'))
add(rect(1116, 326, 108, 14, 'wht') + rect(1116, 336, 108, 3, 'whs'))
add(rect(1226, 274, 15, 66, 'bkg2'))
add(rect(1242, 262, 14, 78, 'wht') + rect(1252, 262, 4, 78, 'whs'))
add(rect(1257, 272, 13, 68, 'bkg'))
add(rect(1271, 266, 12, 74, 'wht') + rect(1279, 266, 4, 74, 'whs'))
add(rect(1284, 262, 18, 78, 'org'))
add(rect(1094, 340, 236, 14, 'wood'))
add(rect(1094, 352, 236, 5, 'woodd'))

// ───────────────────────── rug
add(pixelPoly([[884, 814], [1600, 814], [1660, 904], [798, 904]], 'rug', 4))
add(pixelPoly([[890, 822], [1594, 822], [1646, 896], [812, 896]], 'rug2', 4))
for (let x = 802; x < 1656; x += 10) add(rect(x, 904, 5, 6, 'rug'))

// ───────────────────────── desk
add(rect(1014, 704, 22, 152, 'char'))
add(rect(1182, 704, 20, 126, 'char2'))
add(rect(1620, 704, 20, 130, 'char2'))
add(rect(1094, 712, 88, 118, 'box'))
add(rect(1094, 712, 88, 6, 'boxs'))

// chair
add(rect(1412, 572, 90, 130, 'char'))
add(rect(1418, 562, 78, 12, 'char'))
add(rect(1422, 584, 70, 4, 'mesh'))
add(rect(1422, 604, 70, 4, 'mesh'))
add(rect(1290, 714, 184, 28, 'char'))
add(rect(1296, 740, 172, 8, 'char2'))
add(rect(1374, 748, 16, 44, 'char2'))
add(rect(1316, 790, 132, 10, 'char'))
add(rect(1354, 798, 56, 8, 'char'))
for (const x of [1306, 1344, 1404, 1438]) add(rect(x, 812, 16, 14, 'char2'))
add(rect(1312, 798, 6, 14, 'char2') + rect(1442, 798, 6, 14, 'char2'))

// character (orange pixel buddy)
add(`<g class="bob">${move("0 0;0 4", 2.4, { discrete: true })}`)
add(rect(1312, 550, 136, 100, 'org'))
add(rect(1298, 596, 14, 32, 'org'))
add(rect(1448, 596, 16, 32, 'org'))
add(rect(1436, 550, 12, 100, 'orgd'))
add(`<g class="blink-eye">`)
const blinkH = `<animate attributeName="height" values="18;3;18;3;18" keyTimes="0;.9;.93;.95;.98" dur="5s" calcMode="discrete" ${INF}/>`
const blinkY = `<animate attributeName="y" values="572;580;572;580;572" keyTimes="0;.9;.93;.95;.98" dur="5s" calcMode="discrete" ${INF}/>`
add(arect(1338, 572, 16, 18, 'eye', blinkH + blinkY))
add(arect(1398, 572, 16, 18, 'eye', blinkH + blinkY))
add(`</g>`)
add(`</g>`)

// desk top
add(rect(994, 680, 668, 18, 'wood'))
add(rect(994, 696, 668, 8, 'woodd'))
add(rect(1500, 704, 22, 156, 'char'))
// paws (typing)
add(`<g class="type">${move("0 0;0 -5", .45, { discrete: true })}`)
add(rect(1352, 660, 22, 12, 'org'))
add(rect(1380, 664, 22, 10, 'org'))
add(`</g>`)
// laptop
add(rect(1240, 674, 172, 8, 'lap2'))
add(rect(1240, 680, 172, 3, 'lap3'))
add(poly([[1232, 602], [1338, 602], [1354, 676], [1248, 676]], 'lap'))
add(poly([[1232, 602], [1338, 602], [1340, 610], [1234, 610]], 'lap3'))
add(spark(1292, 640, 13, 5, 'wsp', 2))
// night screen glow on face

// desk books
add(rect(1018, 648, 98, 16, 'org'))
add(rect(1018, 660, 98, 4, 'orgd'))
add(rect(1012, 664, 106, 16, 'wht'))
add(rect(1014, 670, 100, 3, 'whs'))
// pen cup
for (const [x, y, h] of [[1172, 618, 28], [1181, 610, 34], [1191, 620, 26], [1198, 612, 34]]) add(rect(x, y, 6, h, 'pen'))
add(rect(1168, 640, 38, 40, 'cup'))
add(rect(1196, 640, 10, 40, 'cups'))

// desk lamp
add(`<g class="lampglow">${fade(".7;1;.7", 5)}`)
add(`<g class="n">`)
add(poly([[1188, 532], [1238, 518], [1360, 680], [1080, 680]], 'cone'))
add(`</g>`)
add(`</g>`)
add(rect(1112, 664, 52, 16, 'lampm'))
add(rect(1112, 676, 52, 4, 'lampd'))
add(line(1134, 666, 1102, 558, 7, 'lampm', 3))
add(line(1102, 558, 1186, 498, 7, 'lampm', 3))
add(ellipse(1102, 558, 9, 9, 0, 'dark', 3))
add(ellipse(1102, 558, 4, 4, 0, 'lampm', 2))
add(ellipse(1186, 498, 7, 7, 0, 'dark', 3))
add(pixelPoly([[1174, 488], [1206, 474], [1244, 516], [1196, 544]], 'lshade', 3))
add(`<g class="lampglow">${fade(".7;1;.7", 5)}`)
add(ellipse(1218, 528, 22, 10, 40, 'bulb', 3))
add(`</g>`)

// mug + steam
add(rect(1452, 644, 42, 40, 'mug'))
add(rect(1486, 644, 8, 40, 'mugs'))
add(rect(1494, 652, 12, 6, 'mug') + rect(1500, 652, 6, 24, 'mug') + rect(1494, 670, 12, 6, 'mug'))
add(spark(1470, 663, 9, 4, 'org', 2))
add(`<g class="steam s1" opacity="0">${fade("0;1;0", 3.2, { keyTimes: "0;.3;1" })}${move("0 6;0 -20", 3.2)}${line(1470, 638, 1464, 626, 4, 'stm', 2)}${line(1464, 626, 1472, 614, 4, 'stm', 2)}${line(1472, 614, 1466, 602, 4, 'stm', 2)}</g>`)
add(`<g class="steam s2" opacity="0">${fade("0;1;0", 3.2, { keyTimes: "0;.3;1", begin: 1.6 })}${move("0 6;0 -20", 3.2, { begin: 1.6 })}${line(1482, 636, 1488, 624, 4, 'stm', 2)}${line(1488, 624, 1480, 612, 4, 'stm', 2)}</g>`)

// desk plant
add(`<g class="sway sw6">${rot(1578, 642, 7, 3)}`)
for (const [x, y, l, w, d] of [[1536, 626, 56, 22, -160], [1556, 606, 56, 22, -120], [1590, 600, 56, 22, -70], [1616, 620, 54, 22, -25], [1574, 590, 46, 18, -90], [1530, 650, 40, 18, 170], [1620, 646, 40, 18, 10]]) add(leaf(x, y, l, w, d))
add(`</g>`)
add(rect(1548, 642, 60, 46, 'pot'))
add(rect(1596, 642, 12, 46, 'pots'))
add(`<g class="sway sw7">${rot(1556, 686, 5.5, 5)}`)
add(line(1556, 686, 1550, 740, 4, 'stem', 3) + line(1550, 740, 1560, 780, 4, 'stem', 3))
for (const [x, y, l, w, d] of [[1540, 704, 30, 18, 150], [1564, 726, 30, 18, 30], [1542, 752, 30, 18, 150], [1566, 776, 28, 16, 60], [1552, 792, 26, 16, 100]]) add(leaf(x, y, l, w, d))
add(`</g>`)

// day dust motes in the sunbeam
add(`<g class="d motes">`)
for (const [x, y, k] of [[1180, 420, 1], [1060, 520, 2], [990, 640, 3], [1260, 360, 2], [900, 720, 1], [1120, 600, 3]]) add(`<g opacity="0">${fade('0;.9;0', 12, { keyTimes: '0;.3;1', begin: k * 4 })}${move('0 0;-50 40', 12, { begin: k * 4 })}${rect(x, y, 5, 5, 'mote')}</g>`)
add(`</g>`)

const body = out.join('')

const css = `
:root{--wall:#ede7e7;--wsh:#e6dfdf;--base:#f4f0ef;--basel:#ddd5d3;--floor:#d7a78a;--fl:#c8937a;
--pt:rgba(255,226,170,.55);--bm:rgba(255,255,255,.42);--bm2:rgba(255,255,255,.22);
--frame:#c99f74;--mat:#f8f5f1;--psky:#8fcaf0;--pcl:#ffffff;--phl:#7cbf55;--phd:#5ea145;
--wht:#f2eeec;--wht2:#e8e3e1;--whs:#d6cfcc;--pot:#f6f3f0;--pots:#dcd5d1;
--lf:#7cc248;--ll:#a2d85e;--ld:#4e9431;--lfm:#5fae3e;--llm:#86cc55;--stem:#4e8a32;
--bkb:#b4704f;--bkt:#d2ad86;--bkb2:#8b5a43;--shade:#fbf4e6;--shade2:#efe3cb;--dark:#3b3c44;--wood:#e2bd8f;--woodd:#c49a6c;
--sky0:#74b6ec;--sky1:#9ad0f4;--cld:#ffffff;--tr1:#7ec456;--tr2:#a6dc72;
--wfr:#5d606b;--wfr2:#7a7d87;--bl0:#f1edec;--bl1:#e6e1e0;--bl2:#d6d0ce;
--org:#e47c50;--orgd:#cf6a40;--bkg:#8f929c;--bkg2:#676a75;--rug:#f4efec;--rug2:#ebe4e0;
--char:#585a63;--char2:#43454d;--mesh:#6c6e78;--box:#c8c6ca;--boxs:#b2b0b5;--eye:#1c1c20;
--lap:#bfc2ca;--lap2:#d9dbe0;--lap3:#a5a8b1;--wsp:#ffffff;--pen:#2a2b30;--cup:#e9c48e;--cups:#d2a970;
--lampm:#a9a49d;--lampd:#8a857e;--lshade:#9d978f;--bulb:#fff1c2;--mug:#fbfaf8;--mugs:#e2dedb;--stm:rgba(150,150,160,.75)}
.n{display:none}
@media (prefers-color-scheme:dark){:root{--wall:#4b4e6c;--wsh:#45486a;--base:#575a78;--basel:#3e4058;--floor:#4c3d41;--fl:#3c3034;
--pt:rgba(255,150,80,.32);--bm:rgba(255,190,130,.05);--bm2:rgba(20,20,40,.12);
--frame:#6f5641;--mat:#9a98a6;--psky:#55709e;--pcl:#8796b8;--phl:#3f6c46;--phd:#2f5538;
--wht:#a3a1b0;--wht2:#8f8d9e;--whs:#76748a;--pot:#a6a4b2;--pots:#86849a;
--lf:#4d8a3a;--ll:#64a246;--ld:#2f5d27;--lfm:#3f7a33;--llm:#559340;--stem:#2f5b28;
--bkb:#7d4b37;--bkt:#9b7f62;--bkb2:#5d3c2f;--shade:#ffe8b8;--shade2:#f5cf8a;--dark:#24252e;--wood:#9b7050;--woodd:#76543c;
--wfr:#2e3040;--wfr2:#3c3e50;--bl0:#8f8ea0;--bl1:#7e7d90;--bl2:#6a697c;
--org:#e2683c;--orgd:#c4552e;--bkg:#5f6274;--bkg2:#454858;--rug:#a7a2ae;--rug2:#9a95a2;
--char:#2f3039;--char2:#24252d;--mesh:#3d3e4a;--box:#6d6c7c;--boxs:#5c5b6a;--eye:#141418;
--lap:#8e919d;--lap2:#a6a9b4;--lap3:#737683;--wsp:#f4f4f8;--pen:#18191d;--cup:#c39a66;--cups:#a17c50;
--lampm:#77746f;--lampd:#5c5955;--lshade:#6c6965;--bulb:#fff4d0;--mug:#e7e5ec;--mugs:#c4c1cc;--stm:rgba(230,230,240,.7)}
.d{display:none}.n{display:inline}}
${['wall', 'wsh', 'base', 'basel', 'floor', 'fl', 'pt', 'bm', 'bm2', 'frame', 'mat', 'psky', 'pcl', 'phl', 'phd', 'wht', 'wht2', 'whs', 'pot', 'pots', 'lf', 'll', 'ld', 'lfm', 'llm', 'stem', 'bkb', 'bkt', 'bkb2', 'shade', 'shade2', 'dark', 'wood', 'woodd', 'sky0', 'sky1', 'cld', 'tr1', 'tr2', 'wfr', 'wfr2', 'bl0', 'bl1', 'bl2', 'org', 'orgd', 'bkg', 'bkg2', 'rug', 'rug2', 'char', 'char2', 'mesh', 'box', 'boxs', 'eye', 'lap', 'lap2', 'lap3', 'wsp', 'pen', 'cup', 'cups', 'lampm', 'lampd', 'lshade', 'bulb', 'mug', 'mugs', 'stm'].map(k => `.${k}{fill:var(--${k})}`).join('')}
.nsky0{fill:#162250}.nsky1{fill:#24356f}.moon{fill:#fbf6e0}.star{fill:#fff6d8}.ncld{fill:#33427a}.bld{fill:#1b2142}.lit{fill:#f3c867}.ntr{fill:#1d4232}
.scr{fill:rgba(190,215,255,.10)}.cone{fill:rgba(255,200,120,.10)}.mote{fill:rgba(255,255,255,.9)}
@media (max-aspect-ratio:4/5){#all{transform:translateX(-430px)}}
@media (min-aspect-ratio:4/5) and (max-aspect-ratio:6/5){#all{transform:translateX(-260px)}}
`.replace(/\n/g, '')

const defs = `<defs><radialGradient id="gl1"><stop offset="0" stop-color="#ffb46a" stop-opacity=".45"/><stop offset=".5" stop-color="#ff9a55" stop-opacity=".14"/><stop offset="1" stop-color="#ff9a55" stop-opacity="0"/></radialGradient><radialGradient id="gl2"><stop offset="0" stop-color="#ffc77a" stop-opacity=".5"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient><radialGradient id="moon"><stop offset="0" stop-color="#fff8dc" stop-opacity=".5"/><stop offset="1" stop-color="#fff8dc" stop-opacity="0"/></radialGradient></defs>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges"><style>${css}</style>${defs}<g id="all">${body}</g></svg>`

const here = dirname(fileURLToPath(import.meta.url))
writeFileSync(join(here, '..', 'hooks', 'scene.ts'), `// Generated by tools/gen-scene.mjs, do not edit by hand.\nexport const SCENE = ${JSON.stringify(svg)}\n`)
writeFileSync(join(here, '..', 'tools', 'preview.svg'), svg)
console.log('chars', svg.length)
