// Sprite kucing pixel-art 32x22 (cell 10px), gambar lewat kode supaya bisa dianimasikan.
const CAT_COLOR = '#8fe3a2';
const GW = 32, GH = 22;
function newG() { return Array.from({ length: GH }, () => Array(GW).fill(0)); }
function S(g, x, y) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < GW && y >= 0 && y < GH) g[y][x] = 1; }
function C(g, x, y) { if (x >= 0 && x < GW && y >= 0 && y < GH) g[y][x] = 0; }
function ell(g, cx, cy, rx, ry) {
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) g[y][x] = 1;
  }
}
function line(g, x0, y0, x1, y1, thick = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    S(g, x, y); if (thick > 1) S(g, x + 1, y);
  }
}

const RUN = [
  { cy: 12, legs: [[9,15,3,18],[11,15,6,18],[20,15,27,17],[18,15,24,18]], tail: [[7,11,1,9]] },   // melayang, kaki terentang
  { cy: 12, legs: [[9,15,4,18],[11,15,7,19],[20,15,23,19],[18,15,20,19]], tail: [[7,11,2,8]] },   // kaki depan mendarat
  { cy: 11, legs: [[8,15,11,19],[10,15,13,19],[20,15,19,19],[18,15,16,19]], tail: [[7,10,2,8]] }, // kaki terkumpul
  { cy: 12, legs: [[9,15,8,19],[11,15,11,19],[20,15,26,17],[18,15,23,18]], tail: [[7,11,1,9]] },   // dorongan kaki belakang
];

function poseGrid(pose, o = {}) {
  const g = newG();
  if (pose === 'run') {
    const f = RUN[o.frame % 4], cy = f.cy;
    ell(g, 14, cy, 8, 4.2);
    ell(g, 24, cy - 2.5, 3.7, 3.2);
    [[21, cy - 6], [22, cy - 6], [22, cy - 7], [26, cy - 6], [27, cy - 6], [26, cy - 7]].forEach(p => S(g, p[0], p[1]));
    S(g, 28, cy - 1);
    C(g, 26, cy - 3);
    f.tail.forEach(t => line(g, t[0], t[1] + (cy - 12), t[2], t[3] + (cy - 12)));
    f.legs.forEach(l => line(g, l[0], l[1], l[2], l[3]));
  } else if (pose === 'sit') {
    ell(g, 16, 14.5, 5.2, 5.2);
    ell(g, 20, 6.5, 3.9, 3.3);
    [[17, 3], [18, 3], [17, 2], [23, 3], [22, 3], [23, 2]].forEach(p => S(g, p[0], p[1]));
    S(g, 24, 8);
    // wajah
    if (o.eyes === 'open') { C(g, 21, 6); C(g, 21, 5); C(g, 23, 6); C(g, 23, 5); }
    else { C(g, 20, 6); C(g, 21, 6); C(g, 22, 6); }
    if (o.yawn) { C(g, 22, 8); C(g, 23, 8); C(g, 22, 9); }
    // ekor melingkar dan kibasan
    line(g, 11, 18, 6, 19);
    const w = o.wag ? 1 : 0;
    line(g, 6, 19, 5 + w, 15);
    S(g, 5 + w, 14);
    // kaki depan
    line(g, 18, 17, 19, 19);
    line(g, 21, 17, 22, 19);
  } else if (pose === 'eat') {            // kepala turun makan
    ell(g, 16, 14.5, 5.2, 5.2);
    ell(g, 22, 12.5, 3.9, 3.3);
    [[19, 9], [20, 9], [19, 8], [24, 9], [25, 9], [25, 8]].forEach(p => S(g, p[0], p[1]));
    S(g, 26, 14);
    C(g, 21, 12); C(g, 22, 12); C(g, 23, 12);
    if (o.frame) { C(g, 24, 14); C(g, 25, 14); }
    line(g, 11, 18, 6, 19);
    line(g, 6, 19, 5 + (o.frame ? 1 : 0), 15);
    S(g, 5 + (o.frame ? 1 : 0), 14);
    line(g, 18, 17, 19, 19);
    line(g, 21, 17, 22, 19);
  } else if (pose === 'stretch') {    ell(g, 12, 10, 7, 3.2);
    ell(g, 18, 12.5, 3.2, 3);
    ell(g, 25, 15, 3.4, 2.8);
    line(g, 19, 13, 23, 15); line(g, 19, 14, 23, 16);
    [[22, 11], [23, 11], [23, 10], [27, 11], [28, 11], [27, 10]].forEach(p => S(g, p[0], p[1]));
    S(g, 29, 16);
    C(g, 25, 15); C(g, 26, 15);
    line(g, 6, 12, 6, 19);
    line(g, 9, 12, 9, 19);
    line(g, 17, 15, 21, 19);
    line(g, 5, 9, 3, 4);
  } else if (pose === 'sleepy') { // duduk menunduk, mata tertutup
    return poseGrid('sit', { eyes: 'closed' });
  }
  return g;
}

function paintGrid(ctx, g) {
  ctx.clearRect(0, 0, GW * 10, GH * 10);
  ctx.fillStyle = CAT_COLOR;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (g[y][x]) ctx.fillRect(x * 10, y * 10, 10, 10);
}

// ikan & hati pixel untuk animasi kasih makan
const FISH_ROWS = [
  '..........##....',
  '....######.###..',
  '..##########.###',
  '.###.#########..',
  '..##########.###',
  '....######.###..',
  '..........##....'];
const HEART_ROWS = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
function pixelCanvas(rows, cell, color) {
  const c = document.createElement('canvas'); c.width = rows[0].length * cell; c.height = rows.length * cell;
  const x = c.getContext('2d'); x.fillStyle = color;
  rows.forEach((r, y) => [...r].forEach((ch, i) => { if (ch === '#') x.fillRect(i * cell, y * cell, cell, cell); }));
  c.style.imageRendering = 'pixelated'; return c;
}