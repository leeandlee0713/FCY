/* 영상 프레임 인식: 잔디/유니폼 색 분리, 선수·공 후보 검출, 카메라 이동 추정 */
(function () {
  'use strict';
  const FCY = (window.FCY = window.FCY || {});

  function rgb2hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, mx === 0 ? 0 : d / mx, mx / 255];
  }

  function hueDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  /** 유니폼 색 → 매칭 규칙 */
  function makeSpec(r, g, b) {
    const [h, s, v] = rgb2hsv(r, g, b);
    let kind;
    if (s < 0.2) kind = v > 0.62 ? 'white' : v < 0.3 ? 'black' : 'gray';
    else kind = v < 0.16 ? 'black' : 'chroma';
    return { r, g, b, h, s, v, kind };
  }

  function matchSpec(h, s, v, sp) {
    switch (sp.kind) {
      case 'chroma': return s >= 0.22 && v >= 0.12 && hueDiff(h, sp.h) <= 20;
      case 'white': return s < 0.25 && v > 0.6;
      case 'black': return v < 0.26;
      default: return s < 0.25 && v >= 0.3 && v <= 0.62;
    }
  }

  const GRASS_TOL = 26;

  /** 여러 프레임의 색상 히스토그램에서 잔디 색상(최빈 hue) 추정 */
  function estimateGrassHue(images) {
    const hist = new Float64Array(72);
    for (const img of images) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 16) {
        const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
        if (s > 0.25 && v > 0.15) hist[Math.min(71, (h / 5) | 0)]++;
      }
    }
    let best = 0, bi = 24;
    for (let i = 0; i < 72; i++) {
      const sum = hist[(i + 71) % 72] + hist[i] + hist[(i + 1) % 72];
      if (sum > best) { best = sum; bi = i; }
    }
    return bi * 5 + 2.5;
  }

  /** 사각형(정규화 좌표 4점) 내부 마스크 */
  function quadMask(quad, W, H, margin) {
    const m = new Uint8Array(W * H);
    const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
    const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
    const P = quad.map(p => ({
      x: (cx + (p.x - cx) * (1 + margin)) * W,
      y: (cy + (p.y - cy) * (1 + margin)) * H,
    }));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let inside = false;
        for (let i = 0, j = 3; i < 4; j = i++) {
          const a = P[i], b = P[j];
          if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        }
        if (inside) m[y * W + x] = 1;
      }
    }
    return m;
  }

  const BIN_COUNT = 15; // 12 hue + white, black, gray
  function colorBin(h, s, v) {
    if (v < 0.26) return 13;
    if (s < 0.25) return v > 0.6 ? 12 : 14;
    return (((h + 15) % 360) / 30) | 0; // 빨강(345~15도)이 한 칸에 들어오도록 15도 밀어서 나눈다
  }

  /**
   * 한 프레임에서 선수(A/B/기타)와 공 후보를 찾는다.
   * cfg: { grassHue, specA, specB|null, mask|null, collectOther }
   */
  function detect(img, cfg) {
    const d = img.data, W = img.width, H = img.height, N = W * H;
    const kind = new Uint8Array(N); // 0 배경, 1 전경, 2 흰색(라인·공)
    const cls = new Uint8Array(N); // 1 A, 2 B
    const grass = new Uint8Array(N);
    const white = new Uint8Array(N);
    const { specA, specB, grassHue } = cfg;

    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
      const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
      const df = mx - mn;
      let h = 0;
      if (df > 0) {
        if (mx === r) h = ((g - b) / df) % 6;
        else if (mx === g) h = (b - r) / df + 2;
        else h = (r - g) / df + 4;
        h *= 60;
        if (h < 0) h += 360;
      }
      const s = mx === 0 ? 0 : df / mx, v = mx / 255;
      if (s >= 0.15 && v >= 0.1 && hueDiff(h, grassHue) <= GRASS_TOL) { grass[i] = 1; continue; }
      const a = specA && matchSpec(h, s, v, specA);
      const bb = !a && specB && matchSpec(h, s, v, specB);
      if (a) cls[i] = 1; else if (bb) cls[i] = 2;
      const wh = s < 0.25 && v > 0.6;
      if (wh) white[i] = 1;
      kind[i] = !a && !bb && wh && !cfg.whiteAsBody ? 2 : 1;
    }

    // 경기장 영역: 열마다 위/아래에서 잔디가 시작되는 지점
    const win = Math.max(6, Math.round(H * 0.04));
    const top = new Int32Array(W), bot = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      let cnt = 0, t = H, bt = -1;
      for (let y = 0; y < H; y++) {
        cnt += grass[y * W + x];
        if (y >= win) cnt -= grass[(y - win) * W + x];
        if (y >= win - 1 && cnt >= win * 0.75) { t = y - win + 1; break; }
      }
      cnt = 0;
      for (let y = H - 1; y >= 0; y--) {
        cnt += grass[y * W + x];
        if (y + win < H) cnt -= grass[(y + win) * W + x];
        if (y <= H - win && cnt >= win * 0.75) { bt = y + win - 1; break; }
      }
      top[x] = t; bot[x] = bt;
    }
    const rad = Math.max(2, Math.round(W * 0.03));
    const top2 = new Int32Array(W), bot2 = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      let t = H, b = -1;
      for (let k = Math.max(0, x - rad); k <= Math.min(W - 1, x + rad); k++) {
        if (top[k] < t) t = top[k];
        if (bot[k] > b) b = bot[k];
      }
      top2[x] = t; bot2[x] = b;
    }
    const mask = cfg.mask;
    for (let x = 0; x < W; x++) {
      const t = top2[x], b = bot2[x];
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (y < t || y > b || (mask && !mask[i])) kind[i] = 0;
      }
    }

    // 흰색 유니폼을 선수로 볼 때: 가로로 길게 이어진 흰색(경기장 라인)은 선수 덩어리에서 뺀다
    const whiteBody = cfg.whiteAsBody || (specA && specA.kind === 'white') || (specB && specB.kind === 'white');
    if (whiteBody) {
      const maxRun = Math.max(10, Math.round(W * 0.045));
      for (let y = 0; y < H; y++) {
        let run = 0;
        for (let x = 0; x <= W; x++) {
          const i = y * W + x;
          if (x < W && white[i] && kind[i] === 1) { run++; continue; }
          if (run > maxRun) for (let k = 1; k <= run; k++) { kind[i - k] = 2; cls[i - k] = 0; }
          run = 0;
        }
      }
    }

    // 연결 요소 라벨링
    const labels = new Int32Array(N);
    const stack = new Int32Array(N);
    const comps = [];
    for (let i0 = 0; i0 < N; i0++) {
      if (!kind[i0] || labels[i0]) continue;
      const k = kind[i0], id = comps.length + 1;
      let sp = 0, area = 0, nA = 0, nB = 0, minx = W, maxx = 0, miny = H, maxy = 0;
      stack[sp++] = i0; labels[i0] = id;
      while (sp) {
        const i = stack[--sp];
        const x = i % W, y = (i / W) | 0;
        area++;
        if (cls[i] === 1) nA++; else if (cls[i] === 2) nB++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const j = yy * W + xx;
            if (kind[j] === k && !labels[j]) { labels[j] = id; stack[sp++] = j; }
          }
        }
      }
      comps.push({ id, k, area, nA, nB, minx, maxx, miny, maxy, ids: [id] });
    }

    const maxH = H * 0.4, maxW = W * 0.25, minH = Math.max(5, H * 0.018);
    const maxBall = Math.max(4, H * 0.035);
    let bodies = comps.filter(c => c.k === 1 && c.area >= 4 &&
      c.maxy - c.miny + 1 <= maxH && c.maxx - c.minx + 1 <= maxW);

    // 상의·하의처럼 세로로 나뉜 조각 합치기
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          const ov = Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx) + 1;
          const nw = Math.min(a.maxx - a.minx, b.maxx - b.minx) + 1;
          if (ov < nw * 0.5) continue;
          const gap = Math.max(a.miny, b.miny) - Math.min(a.maxy, b.maxy) - 1;
          const mh = Math.max(a.maxy - a.miny, b.maxy - b.miny) + 1;
          const th = Math.max(a.maxy, b.maxy) - Math.min(a.miny, b.miny) + 1;
          if (gap > Math.max(3, mh * 0.35) || th > maxH) continue;
          a.area += b.area; a.nA += b.nA; a.nB += b.nB;
          a.minx = Math.min(a.minx, b.minx); a.maxx = Math.max(a.maxx, b.maxx);
          a.miny = Math.min(a.miny, b.miny); a.maxy = Math.max(a.maxy, b.maxy);
          a.ids = a.ids.concat(b.ids);
          bodies.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }

    const out = { A: [], B: [], other: [], balls: [], W, H };
    const players = [];
    const small = [];
    for (const c of bodies) {
      const w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1;
      const asp = h / w;
      if (h >= minH && asp >= 0.7 && asp <= 6 && c.area >= w * h * 0.2 && c.area >= 8) {
        const o = { x: (c.minx + c.maxx + 1) / 2 / W, y: (c.maxy + 1) / H, w: w / W, h: h / H, c };
        if (c.nA >= c.area * 0.12 && c.nA >= c.nB * 1.3) out.A.push(o);
        else if (c.nB >= c.area * 0.12 && c.nB > c.nA) out.B.push(o);
        else out.other.push(o);
        players.push(c);
      } else small.push(c);
    }

    // 공 후보: 작고 둥근 흰색(또는 미분류) 덩어리
    const cands = comps.filter(c => c.k === 2).concat(small.filter(c => !c.nA && !c.nB));
    for (const c of cands) {
      const w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1;
      if (w > maxBall || h > maxBall || c.area < 2) continue;
      if (Math.max(w / h, h / w) > 2.2 || c.area < w * h * 0.45) continue;
      const cx = (c.minx + c.maxx + 1) / 2, cy = (c.miny + c.maxy + 1) / 2;
      let inPlayer = false;
      for (const p of players) {
        if (cx >= p.minx - 1 && cx <= p.maxx + 1 && cy >= p.miny - 1 && cy <= p.maxy + 1) { inPlayer = true; break; }
      }
      if (inPlayer) continue;
      out.balls.push({ x: cx / W, y: (c.maxy + 1) / H, r: Math.max(w, h) / 2 / W, white: c.k === 2 });
    }
    out.balls.sort((a, b) => (b.white - a.white) || (b.r - a.r));
    if (out.balls.length > 14) out.balls.length = 14;

    // 상대 팀 색 자동 추정용: 미분류 선수의 주된 색
    if (cfg.collectOther) {
      out.otherBins = [];
      for (const o of out.other) {
        const c = o.c;
        if (o.h * H < minH * 1.2 || o.h * H < o.w * W * 1.1) continue;
        const ids = new Set(c.ids);
        const bins = new Float64Array(BIN_COUNT * 4);
        for (let y = c.miny; y <= c.maxy; y++) {
          for (let x = c.minx; x <= c.maxx; x++) {
            const i = y * W + x;
            if (!ids.has(labels[i])) continue;
            const p = i * 4;
            const [h, s, v] = rgb2hsv(d[p], d[p + 1], d[p + 2]);
            const bn = colorBin(h, s, v) * 4;
            bins[bn]++; bins[bn + 1] += d[p]; bins[bn + 2] += d[p + 1]; bins[bn + 3] += d[p + 2];
          }
        }
        // 거의 전부 흰색이면서 가늘거나 속이 빈 덩어리는 선수가 아니라 라인 조각이다
        const cw = c.maxx - c.minx + 1, ch = c.maxy - c.miny + 1;
        if (bins[12 * 4] > c.area * 0.88 && (cw < 4 || c.area < cw * ch * 0.45 || ch > cw * 4.5)) continue;
        out.otherBins.push(bins);
      }
    }
    for (const k of ['A', 'B', 'other']) for (const o of out[k]) delete o.c;
    return out;
  }

  /** 선수 덩어리들의 주된 색을 모아 유니폼 색 후보(득표순)를 만든다 */
  function clusterKits(binsList, grassHue) {
    const votes = new Float64Array(BIN_COUNT), sums = new Float64Array(BIN_COUNT * 4);
    for (const bins of binsList) {
      let total = 0;
      for (let b = 0; b < BIN_COUNT; b++) total += bins[b * 4];
      // 피부색(주황 계열)·검정(머리, 축구화)은 유니폼일 가능성이 낮아 가중치를 낮춘다
      const wv = b => bins[b * 4] * (b === 1 || b === 13 ? 0.45 : 1);
      // 유채색: 저해상도에서는 유니폼 가장자리가 잔디색과 섞여 색상이 잔디 쪽으로 밀린다.
      // 그래서 충분히 많은 색 중 잔디에서 가장 먼 색상을 유니폼 색으로 본다.
      let cmax = 0;
      for (let b = 0; b < 12; b++) if (hueDiff(b * 30, grassHue) >= 32 && wv(b) > cmax) cmax = wv(b);
      let best = -1, far = -1;
      for (let b = 0; b < 12; b++) {
        const hd = hueDiff(b * 30, grassHue);
        if (hd < 32 || !wv(b) || wv(b) < cmax * 0.5) continue;
        if (hd > far) { far = hd; best = b; }
      }
      let bc = best >= 0 ? cmax : 0;
      for (let b = 12; b < BIN_COUNT; b++) if (wv(b) > bc) { bc = wv(b); best = b; }
      if (best < 0 || bins[best * 4] < total * 0.15) continue;
      votes[best]++;
      for (let k = 0; k < 4; k++) sums[best * 4 + k] += bins[best * 4 + k];
    }
    const out = [];
    for (let b = 0; b < BIN_COUNT; b++) {
      if (votes[b] < 3) continue;
      const n = sums[b * 4];
      out.push({ bin: b, votes: votes[b], spec: makeSpec(Math.round(sums[b * 4 + 1] / n), Math.round(sums[b * 4 + 2] / n), Math.round(sums[b * 4 + 3] / n)) });
    }
    return out.sort((x, y) => y.votes - x.votes);
  }

  /** 색상각 → 색 이름 구간 */
  function hueName(h) {
    if (h < 15 || h >= 345) return '빨간색';
    if (h < 40) return '주황색';
    if (h < 70) return '노란색';
    if (h < 165) return '초록색';
    if (h < 200) return '하늘색';
    if (h < 255) return '파란색';
    if (h < 290) return '보라색';
    return '분홍색';
  }

  /** 두 유니폼 색이 같은 팀으로 볼 만큼 비슷한지 (작을수록 비슷, Infinity = 다름) */
  function kitDistance(want, sp) {
    if (want.kind === 'chroma') {
      if (sp.kind !== 'chroma') return Infinity;
      const d = hueDiff(want.h, sp.h);
      return d <= 15 || hueName(want.h) === hueName(sp.h) ? d : Infinity;
    }
    if (want.kind === sp.kind) return 0;
    if (want.kind === 'white' && sp.kind === 'gray' && sp.v > 0.5) return 20;
    if (want.kind === 'gray' && sp.kind !== 'chroma') return 25;
    if (want.kind === 'black' && (sp.kind === 'gray' ? sp.v < 0.4 : sp.kind === 'chroma' && sp.v < 0.4)) return 20;
    return Infinity;
  }

  /**
   * 이용자가 고른 색 이름과 가장 가까운 후보를 분석 팀으로, 나머지 중 가장 많이 보이는 색을 상대 팀으로 정한다.
   */
  function assignTeams(want, clusters) {
    if (!clusters.length) return { a: null, b: null };
    // 골키퍼·심판처럼 한두 명만 입은 색은 팀으로 보지 않는다
    const floor = Math.max(3, clusters[0].votes * 0.2);
    let a = null, best = Infinity;
    for (const c of clusters) {
      if (c.votes < floor) continue;
      const d = kitDistance(want, c.spec) - Math.min(10, c.votes / clusters[0].votes * 10);
      if (d < best) { best = d; a = c; }
    }
    // 상대 팀: 남은 후보 중 가장 많이 보이는 색. 피부색 계열은 선수 몸이 잡힌 것일 수 있어 뒤로 미룬다
    let b = null, bv = 0;
    for (const c of clusters) {
      if (c === a || c.votes < floor) continue;
      if (a && kitDistance(a.spec, c.spec) < 30) continue;
      const v = c.votes * (c.bin === 1 ? 0.5 : 1);
      if (v > bv) { bv = v; b = c; }
    }
    return { a, b };
  }

  /** 카메라 이동 추정용 축소 흑백 이미지 */
  function toGray(img, gw, gh) {
    const out = new Float32Array(gw * gh);
    const d = img.data, W = img.width, H = img.height;
    for (let y = 0; y < gh; y++) {
      const sy = Math.min(H - 1, ((y + 0.5) * H / gh) | 0);
      for (let x = 0; x < gw; x++) {
        const sx = Math.min(W - 1, ((x + 0.5) * W / gw) | 0);
        const p = (sy * W + sx) * 4;
        out[y * gw + x] = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11;
      }
    }
    return out;
  }

  /** 이전 프레임 대비 화면 이동량(정규화 좌표). 장면이 dx만큼 움직였으면 {x: dx} */
  function estimateShift(prev, cur, gw, gh) {
    const RX = Math.round(gw * 0.15), RY = Math.round(gh * 0.08);
    let best = Infinity, bx = 0, by = 0, zero = Infinity;
    for (let dy = -RY; dy <= RY; dy++) {
      for (let dx = -RX; dx <= RX; dx++) {
        let sad = 0, n = 0;
        const y0 = Math.max(0, dy), y1 = Math.min(gh, gh + dy);
        const x0 = Math.max(0, dx), x1 = Math.min(gw, gw + dx);
        for (let y = y0; y < y1; y += 2) {
          for (let x = x0; x < x1; x += 2) {
            sad += Math.abs(cur[y * gw + x] - prev[(y - dy) * gw + (x - dx)]);
            n++;
          }
        }
        sad /= n;
        if (dx === 0 && dy === 0) zero = sad;
        if (sad < best) { best = sad; bx = dx; by = dy; }
      }
    }
    if (best > zero * 0.85) return { x: 0, y: 0 }; // 뚜렷한 이동이 아닐 때는 0
    return { x: bx / gw, y: by / gh };
  }

  FCY.vision = { rgb2hsv, hueDiff, makeSpec, matchSpec, estimateGrassHue, quadMask, detect, clusterKits, assignTeams, hueName, toGray, estimateShift, GRASS_TOL };
})();
