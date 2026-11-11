// 샘플(합성) 경기 영상 생성: node tools/make-demo.mjs <프레임 출력 폴더>
// 이후 ffmpeg 로 sample/demo.mp4, sample/demo.webm 인코딩
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const out = process.argv[2];
const SEC = Number(process.argv[3] || 24), FPS = 25;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent('<canvas id=c width=1280 height=720></canvas>');
await page.evaluate(() => {
  const c = document.getElementById('c'), g = c.getContext('2d');
  const Q = [[190, 130], [1090, 130], [1250, 650], [30, 650]]; // 원경 좌, 원경 우, 근경 우, 근경 좌
  // 월드(x: 0..105 길이, y: 0..68 폭, y=0 이 원경) → 화면
  const proj = (x, y) => {
    const u = x / 105, v = y / 68;
    // 사다리꼴 원근: v 를 비선형으로
    const k = 0.62, t = (v * k) / (1 - v + v * k) ;
    const xl = Q[0][0] + (Q[3][0] - Q[0][0]) * t, xr = Q[1][0] + (Q[2][0] - Q[1][0]) * t;
    return [xl + (xr - xl) * u, Q[0][1] + (Q[3][1] - Q[0][1]) * t];
  };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const speck = Array.from({ length: 2500 }, () => [rnd() * 1280, rnd() * 720, 40 + rnd() * 90]);
  const ph = Array.from({ length: 22 }, () => [rnd() * 6.28, rnd() * 6.28, 0.5 + rnd() * 0.6]);
  const WP = [[50, 34], [45, 10], [62, 8], [52, 34], [48, 58], [66, 60], [55, 34], [40, 12], [58, 10], [52, 36], [46, 56], [63, 58]];
  const ballAt = t => {
    const seg = 2.4, i = Math.floor(t / seg) % WP.length, f = (t % seg) / seg;
    const a = WP[i], b = WP[(i + 1) % WP.length];
    const k = Math.min(1, Math.max(0, (f - 0.45) / 0.5)), e = k * k * (3 - 2 * k);
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  };
  const st = { rc: [38, 34], bc: [67, 34] };
  const RED = [[-14, -21], [-14, -7], [-14, 7], [-14, 21], [0, -21], [0, -7], [0, 7], [0, 21], [13, -6], [13, 6]];
  const BLUE = [[14, -21], [14, -7], [14, 7], [14, 21], [2, -13], [2, 0], [2, 13], [-12, -18], [-14, 0], [-12, 18]];
  function figure(x, y, shirt, shorts) {
    const [px, py] = proj(x, y), [qx] = proj(x + 1, y);
    const h = (qx - px) * 1.85 * 1.15, w = h * 0.42;
    g.fillStyle = '#d9a37a'; g.fillRect(px - w * 0.3, py - h * 0.25, w * 0.6, h * 0.25);
    g.fillStyle = shorts; g.fillRect(px - w / 2, py - h * 0.42, w, h * 0.18);
    g.fillStyle = shirt; g.fillRect(px - w / 2, py - h * 0.82, w, h * 0.41);
    g.fillStyle = '#d9a37a'; g.beginPath(); g.arc(px, py - h * 0.9, h * 0.1, 0, 7); g.fill();
  }
  window.draw = t => {
    const b = ballAt(t);
    const wave = Math.sin((t / 8) * 6.283) * 8; // 상대 블록의 전진/후퇴
    const bt = [67 + 0.45 * (b[0] - 52) - wave, 34 + 0.4 * (b[1] - 34)];
    const rt = [38 + 0.45 * (b[0] - 52) - 0.6 * wave, 34 + 0.5 * (b[1] - 34)];
    for (const [c, tg, a] of [[st.bc, bt, 0.12], [st.rc, rt, 0.08]]) { c[0] += (tg[0] - c[0]) * a; c[1] += (tg[1] - c[1]) * a; }
    const ws = 1 - 0.25 * Math.abs(b[1] - 34) / 34;
    g.fillStyle = '#1c2230'; g.fillRect(0, 0, 1280, 720);
    for (const s of speck) { g.fillStyle = `rgb(${s[2]},${s[2] * 0.9},${s[2] * 1.1})`; g.fillRect(s[0], s[1], 3, 3); }
    // 잔디(경기장 밖 여유 포함) + 줄무늬
    const poly = pts => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
    poly([proj(-4, -3), proj(109, -3), proj(109, 71), proj(-4, 71)]); g.fillStyle = '#2f8a3c'; g.fill();
    for (let i = 0; i < 14; i += 2) { poly([proj(i * 7.5, 0), proj(i * 7.5 + 7.5, 0), proj(i * 7.5 + 7.5, 68), proj(i * 7.5, 68)]); g.fillStyle = '#34963f'; g.fill(); }
    g.strokeStyle = '#f4f4f4'; g.lineWidth = 2.5;
    const line = pts => { poly(pts.map(p => proj(p[0], p[1]))); g.stroke(); };
    line([[0, 0], [105, 0], [105, 68], [0, 68]]);
    line([[52.5, 0], [52.5, 68]]);
    line([[0, 13.84], [16.5, 13.84], [16.5, 54.16], [0, 54.16]]);
    line([[105, 13.84], [88.5, 13.84], [88.5, 54.16], [105, 54.16]]);
    line([[0, 24.84], [5.5, 24.84], [5.5, 43.16], [0, 43.16]]);
    line([[105, 24.84], [99.5, 24.84], [99.5, 43.16], [105, 43.16]]);
    line(Array.from({ length: 40 }, (_, i) => [52.5 + 9.15 * Math.cos(i / 40 * 6.283), 34 + 9.15 * Math.sin(i / 40 * 6.283)]));
    const ps = [];
    RED.forEach((r, i) => ps.push([st.rc[0] + r[0] + Math.sin(t * ph[i][2] + ph[i][0]) * 1.3, st.rc[1] + r[1] * ws + Math.cos(t * ph[i][2] + ph[i][1]) * 1.3, '#e02525', '#f1f1f1']));
    BLUE.forEach((r, i) => ps.push([st.bc[0] + r[0] + Math.sin(t * ph[i + 10][2] + ph[i + 10][0]) * 1.3, st.bc[1] + r[1] * ws + Math.cos(t * ph[i + 10][2] + ph[i + 10][1]) * 1.3, '#1f55d6', '#101a40']));
    ps.push([5 + (b[0] - 52) * 0.05, 34 + (b[1] - 34) * 0.15, '#f5d400', '#222']);
    ps.push([100 + (b[0] - 52) * 0.05, 34 + (b[1] - 34) * 0.15, '#7a2fd0', '#222']);
    ps.sort((a, c) => a[1] - c[1]);
    for (const p of ps) figure(p[0], p[1], p[2], p[3]);
    const [bx, by] = proj(b[0], b[1]), [bx2] = proj(b[0] + 1, b[1]);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by - 3, Math.max(3.2, (bx2 - bx) * 0.38), 0, 7); g.fill();
  };
});
for (let i = 0; i < SEC * FPS; i++) {
  await page.evaluate(t => window.draw(t), i / FPS);
  const buf = await page.locator('#c').screenshot({ type: 'jpeg', quality: 95 });
  fs.writeFileSync(`${out}/f${String(i).padStart(4, '0')}.jpg`, buf);
}
await browser.close();
