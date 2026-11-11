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

  /** sRGB → CIE Lab. 어두운 색끼리도 밝기·색조 차이를 고르게 잴 수 있는 색 공간 */
  function rgb2lab(r, g, b) {
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const labDist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

  /** 유니폼 색 견본: RGB + HSV + Lab + 대략적인 종류 */
  function makeSpec(r, g, b) {
    const [h, s, v] = rgb2hsv(r, g, b);
    let kind;
    if (s < 0.2) kind = v > 0.62 ? 'white' : v < 0.3 ? 'black' : 'gray';
    else kind = v < 0.16 ? 'black' : 'chroma';
    return { r, g, b, h, s, v, kind, lab: rgb2lab(r, g, b) };
  }

  const GRASS_TOL = 26;

  /**
   * 여러 프레임의 색상 히스토그램에서 잔디 색 범위를 추정한다. { hue: 중심 색상각, tol: 허용 폭 }
   * 잔디는 밝은 줄과 어두운 줄의 색상이 꽤 다르므로, 최빈 색상 주변으로 이어진 구간 전체를 잔디로 본다.
   */
  function estimateGrass(images) {
    const hist = new Float64Array(72);
    let total = 0, green = 0;
    for (const img of images) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 16) {
        const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
        if (s > 0.2 && v > 0.12) { const b = Math.min(71, (h / 5) | 0); hist[b]++; total++; if (h >= 55 && h < 175) green++; }
      }
    }
    // 초록 계열이 화면에 충분히 있으면 그 안에서만 찾는다 (노란 광고판 등에 끌려가지 않도록)
    const lo0 = green > total * 0.2 ? 11 : 0, hi0 = green > total * 0.2 ? 34 : 71;
    let bi = lo0;
    for (let i = lo0; i <= hi0; i++) if (hist[i] > hist[bi]) bi = i;
    const thr = hist[bi] * 0.06;
    let lo = bi, hi = bi;
    while (lo > bi - 9 && hist[(lo + 71) % 72] >= thr) lo--;
    while (hi < bi + 9 && hist[(hi + 1) % 72] >= thr) hi++;
    const hue = (((lo + hi + 1) / 2) * 5 + 360) % 360;
    const tol = Math.max(16, Math.min(45, ((hi - lo + 1) / 2) * 5 + 6));
    return { hue, tol, green: total ? green / total : 0 };
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

  /**
   * 한 프레임에서 선수(A/B/기타)와 공 후보를 찾는다.
   * cfg: { grassHue, grassTol, specA, specB|null, mask|null, collectOther }
   * 팀 구분은 픽셀 단위 색 규칙이 아니라, 선수 덩어리마다 상체(유니폼) 대표색을 뽑아 두 팀 견본색과의 거리로 한다.
   * 그래서 남색·검정처럼 어두운 유니폼끼리도 구분된다.
   */
  function detect(img, cfg) {
    const d = img.data, W = img.width, H = img.height, N = W * H;
    const kind = new Uint8Array(N); // 0 배경, 1 전경, 2 흰색(라인·공)
    const grass = new Uint8Array(N);
    const white = new Uint8Array(N);
    const sat = new Uint8Array(N), val = new Uint8Array(N);
    let gS = 0, gV = 0, gN = 0, gR = 0, gG = 0, gB = 0;
    const { specA, specB, grassHue } = cfg;
    const gTol = cfg.grassTol || GRASS_TOL;
    // 흰 유니폼 팀이 있으면 흰 픽셀도 선수 몸으로 본다 (없으면 흰색은 라인·공)
    const whiteBody = !!cfg.whiteAsBody || (specA && specA.kind === 'white') || (specB && specB.kind === 'white');

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
      sat[i] = s * 255; val[i] = v * 255;
      if (s >= 0.15 && v >= 0.1 && hueDiff(h, grassHue) <= gTol) { grass[i] = 1; gS += s; gV += v; gN++; gR += r; gG += g; gB += b; continue; }
      const wh = s < 0.25 && v > 0.6;
      if (wh) white[i] = 1;
      kind[i] = wh && !whiteBody ? 2 : 1;
    }

    // 경기장 영역 = 가장 큰 "연결된 잔디 덩어리". 관중석·광고판 속 초록색은 필드와 이어져 있지 않으므로 빠진다.
    const G = 8, gw = Math.ceil(W / G), gh = Math.ceil(H / G);
    const gcell = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let c = 0, n = 0;
        for (let y = gy * G; y < Math.min(H, gy * G + G); y++) {
          for (let x = gx * G; x < Math.min(W, gx * G + G); x++) { c += grass[y * W + x]; n++; }
        }
        if (c >= n * 0.5) gcell[gy * gw + gx] = 1;
      }
    }
    const glab = new Int32Array(gw * gh), gst = new Int32Array(gw * gh);
    let bestId = 0, bestN = 0, nid = 0;
    for (let i0 = 0; i0 < gw * gh; i0++) {
      if (!gcell[i0] || glab[i0]) continue;
      let sp = 0, n = 0;
      nid++; gst[sp++] = i0; glab[i0] = nid;
      while (sp) {
        const i = gst[--sp], x = i % gw, y = (i / gw) | 0;
        n++;
        if (x > 0 && gcell[i - 1] && !glab[i - 1]) { glab[i - 1] = nid; gst[sp++] = i - 1; }
        if (x < gw - 1 && gcell[i + 1] && !glab[i + 1]) { glab[i + 1] = nid; gst[sp++] = i + 1; }
        if (y > 0 && gcell[i - gw] && !glab[i - gw]) { glab[i - gw] = nid; gst[sp++] = i - gw; }
        if (y < gh - 1 && gcell[i + gw] && !glab[i + gw]) { glab[i + gw] = nid; gst[sp++] = i + gw; }
      }
      if (n > bestN) { bestN = n; bestId = nid; }
    }
    // 선수·라인 때문에 생긴 구멍 메우기: 같은 행과 같은 열에서 모두 필드 범위 안이면 필드
    const rowMin = new Int32Array(gh).fill(gw), rowMax = new Int32Array(gh).fill(-1);
    const colMin = new Int32Array(gw).fill(gh), colMax = new Int32Array(gw).fill(-1);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      if (glab[gy * gw + gx] !== bestId || !bestId) continue;
      if (gx < rowMin[gy]) rowMin[gy] = gx; if (gx > rowMax[gy]) rowMax[gy] = gx;
      if (gy < colMin[gx]) colMin[gx] = gy; if (gy > colMax[gx]) colMax[gx] = gy;
    }
    const pitch = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      if (gx >= rowMin[gy] && gx <= rowMax[gy] && gy >= colMin[gx] && gy <= colMax[gx]) pitch[gy * gw + gx] = 1;
    }
    const onPitch = (x, y) => pitch[((y / G) | 0) * gw + ((x / G) | 0)] === 1;
    // 화면 가운데 열들에서 본 필드의 위·아래 끝 (경기장 크기 환산에 사용)
    const tops = [], bots = [];
    for (let gx = Math.floor(gw * 0.2); gx < Math.ceil(gw * 0.8); gx++) if (colMax[gx] >= 0) { tops.push(colMin[gx]); bots.push(colMax[gx] + 1); }
    tops.sort((a, b) => a - b); bots.sort((a, b) => a - b);
    const pitchTop = tops.length ? Math.min(1, (tops[tops.length >> 1] * G) / H) : 0;
    const pitchBottom = bots.length ? Math.min(1, (bots[bots.length >> 1] * G) / H) : 1;
    // 필드 가운데 높이에서 본 좌·우 끝
    const gm = Math.min(gh - 1, Math.round(((pitchTop + pitchBottom) / 2) * H / G));
    const pitchLeft = rowMax[gm] >= 0 ? (rowMin[gm] * G) / W : 0;
    const pitchRight = rowMax[gm] >= 0 ? Math.min(1, ((rowMax[gm] + 1) * G) / W) : 1;

    // 중앙선 + 센터서클 찾기 (경기장 한가운데의 기준점)
    // 라인은 화질에 따라 잔디색이 섞여 옅은 초록으로 보이므로, "잔디 평균보다 뚜렷이 밝고 덜 진한 픽셀"을 라인으로 본다
    let lineW = white;
    if (cfg.findCenter && gN) {
      // 주변(작은 창) 평균보다 밝고 덜 진한 픽셀 = 가는 선. 화면 전체 기준이 아니라 주변 대비라서 흐린 라인도 잡힌다
      const IW = W + 1, iv = new Uint32Array(IW * (H + 1)), is = new Uint32Array(IW * (H + 1));
      for (let y = 0; y < H; y++) {
        let rv = 0, rs = 0;
        for (let x = 0; x < W; x++) {
          rv += val[y * W + x]; rs += sat[y * W + x];
          iv[(y + 1) * IW + x + 1] = iv[y * IW + x + 1] + rv;
          is[(y + 1) * IW + x + 1] = is[y * IW + x + 1] + rs;
        }
      }
      const R = Math.max(4, Math.round(W / 160));
      const vAbs = (gV / gN) * 255 + 38, sAbs = (gS / gN) * 255 - 28;
      lineW = new Uint8Array(N);
      for (let y = 0; y < H; y++) {
        const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (val[i] > vAbs && sat[i] < sAbs) { lineW[i] = 1; continue; }
          const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), n = (x1 - x0) * (y1 - y0);
          const mv = (iv[y1 * IW + x1] - iv[y0 * IW + x1] - iv[y1 * IW + x0] + iv[y0 * IW + x0]) / n;
          if (val[i] - mv < 16) continue;
          const ms = (is[y1 * IW + x1] - is[y0 * IW + x1] - is[y1 * IW + x0] + is[y0 * IW + x0]) / n;
          if (sat[i] - ms <= -10) lineW[i] = 1;
        }
      }
    }
    const mid = cfg.findCenter ? findCenter(lineW, pitch, G, gw, W, H, pitchTop * H, pitchBottom * H, cfg.debug) : null;

    const mask = cfg.mask;
    for (let y = 0; y < H; y++) {
      const gy = (y / G) | 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!kind[i]) continue;
        const gi = gy * gw + ((x / G) | 0);
        // 먼 쪽 터치라인 근처 선수의 상체는 필드 경계 위로 조금 나올 수 있어 두 칸까지 허용
        const ok = pitch[gi] || (gy + 1 < gh && pitch[gi + gw]) || (gy + 2 < gh && pitch[gi + 2 * gw]);
        if (!ok || (mask && !mask[i])) kind[i] = 0;
      }
    }

    // 흰색 유니폼을 선수로 볼 때: 가로로 길게 이어진 흰색(경기장 라인)은 선수 덩어리에서 뺀다
    if (whiteBody) {
      const maxRun = Math.max(10, Math.round(W * 0.045));
      for (let y = 0; y < H; y++) {
        let run = 0;
        for (let x = 0; x <= W; x++) {
          const i = y * W + x;
          if (x < W && white[i] && kind[i] === 1) { run++; continue; }
          if (run > maxRun) for (let k = 1; k <= run; k++) kind[i - k] = 2;
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
      let sp = 0, area = 0, minx = W, maxx = 0, miny = H, maxy = 0;
      stack[sp++] = i0; labels[i0] = id;
      while (sp) {
        const i = stack[--sp];
        const x = i % W, y = (i / W) | 0;
        area++;
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
      comps.push({ id, k, area, minx, maxx, miny, maxy, ids: [id] });
    }

    const maxH = H * 0.4, maxW = W * 0.25, minH = Math.max(5, H * 0.012);
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
          a.area += b.area;
          a.minx = Math.min(a.minx, b.minx); a.maxx = Math.max(a.maxx, b.maxx);
          a.miny = Math.min(a.miny, b.miny); a.maxy = Math.max(a.maxy, b.maxy);
          a.ids = a.ids.concat(b.ids);
          bodies.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }

    // 선수 덩어리의 유니폼 대표색: 상체(위에서 15~55% 높이) 픽셀의 채널별 중앙값
    const torso = c => {
      const ids = c.ids.length === 1 ? null : new Set(c.ids), id0 = c.ids[0];
      const hh = c.maxy - c.miny + 1, t0 = c.miny + Math.floor(hh * 0.15), t1 = c.miny + Math.ceil(hh * 0.55);
      const rs = [], gs = [], bs = [], ar = [], ag = [], ab = [], ir = [], ig = [], ib = [];
      let nw = 0;
      for (let y = c.miny; y <= c.maxy; y++) {
        for (let x = c.minx; x <= c.maxx; x++) {
          const i = y * W + x, l = labels[i];
          if (ids ? !ids.has(l) : l !== id0) continue;
          const p = i * 4;
          nw += white[i];
          ar.push(d[p]); ag.push(d[p + 1]); ab.push(d[p + 2]);
          if (y < t0 || y > t1) continue;
          rs.push(d[p]); gs.push(d[p + 1]); bs.push(d[p + 2]);
          // 가장자리 픽셀은 잔디색과 섞여 있으므로, 사방이 선수 몸인 안쪽 픽셀을 따로 모은다
          if (x > 0 && x < W - 1 && y > 0 && y < H - 1 && kind[i - 1] === 1 && kind[i + 1] === 1 && kind[i - W] === 1 && kind[i + W] === 1) {
            ir.push(d[p]); ig.push(d[p + 1]); ib.push(d[p + 2]);
          }
        }
      }
      const med = a => a.sort((x, y) => x - y)[a.length >> 1];
      const use = ir.length >= 3 ? [ir, ig, ib] : rs.length >= 3 ? [rs, gs, bs] : [ar, ag, ab];
      const rgb = [med(use[0]), med(use[1]), med(use[2])];
      return { rgb, lab: rgb2lab(rgb[0], rgb[1], rgb[2]), whiteFrac: nw / Math.max(1, ar.length) };
    };
    const sep = specA && specB ? labDist(specA.lab, specB.lab) : 45;
    const lim = Math.max(14, sep * 0.55);

    const out = { A: [], B: [], other: [], balls: [], W, H, pitchTop, pitchBottom, pitchLeft, pitchRight, mid };
    const players = [];
    const small = [];
    for (const c of bodies) {
      const w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1;
      const asp = h / w;
      // 선수의 발은 필드 안쪽에 있어야 한다 (필드 가장자리 밖의 관계자·관중 제외)
      const fgx = Math.min(gw - 1, (((c.minx + c.maxx) / 2) / G) | 0), fgy = Math.min(gh - 1, (c.maxy / G) | 0);
      // 발밑과 발 양옆이 잔디여야 한다 (필드 경계에 걸린 배경 조각 제외). 라인을 밟고 있을 수 있어 몇 픽셀 더 본다
      const probe = (x0, y0, dx, dy) => {
        for (let k = 2; k <= 5; k++) {
          const x = Math.round(x0 + dx * k), y = y0 + dy * k;
          if (x < 0 || x >= W || y >= H) return true;
          if (grass[y * W + x]) return true;
        }
        return false;
      };
      const fcx = (c.minx + c.maxx) / 2;
      const footOK = pitch[fgy * gw + fgx] && (fgy + 1 >= gh || pitch[(fgy + 1) * gw + fgx]) &&
        probe(fcx, c.maxy, 0, 1) && probe(c.minx, c.maxy, -1, 0) && probe(c.maxx, c.maxy, 1, 0);
      if (footOK && h >= minH && asp >= 0.7 && asp <= 6 && c.area >= w * h * 0.2 && c.area >= 8) {
        const o = { x: (c.minx + c.maxx + 1) / 2 / W, y: (c.maxy + 1) / H, w: w / W, h: h / H, c };
        o.f = torso(c);
        const dA = specA ? labDist(o.f.lab, specA.lab) : Infinity, dB = specB ? labDist(o.f.lab, specB.lab) : Infinity;
        if (dA <= lim && dA <= dB) out.A.push(o);
        else if (dB <= lim) out.B.push(o);
        else out.other.push(o);
        players.push(c);
      } else small.push(c);
    }

    // 공 후보: 작고 둥근 흰색(또는 미분류) 덩어리
    const cands = comps.filter(c => c.k === 2).concat(small);
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
      // 공은 잔디 위에 있다: 후보가 필드 안에 있고, 둘레가 대부분 잔디여야 한다
      if (!onPitch(Math.min(W - 1, cx | 0), Math.min(H - 1, c.maxy))) continue;
      let ring = 0, ringG = 0;
      for (let y = c.miny - 3; y <= c.maxy + 3; y++) {
        for (let x = c.minx - 3; x <= c.maxx + 3; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (x >= c.minx - 1 && x <= c.maxx + 1 && y >= c.miny - 1 && y <= c.maxy + 1) continue;
          ring++; ringG += grass[y * W + x];
        }
      }
      if (ringG < ring * 0.55) continue;
      out.balls.push({ x: cx / W, y: (c.maxy + 1) / H, r: Math.max(w, h) / 2 / W, white: c.k === 2 });
    }
    out.balls.sort((a, b) => (b.white - a.white) || (b.r - a.r));
    if (out.balls.length > 14) out.balls.length = 14;

    // 두 팀 색 자동 추정용: 선수로 보이는 덩어리들의 유니폼 대표색
    if (cfg.collectOther) {
      out.feats = [];
      out.grassRgb = gN ? [gR / gN, gG / gN, gB / gN] : [60, 120, 60];
      for (const o of out.A.concat(out.B, out.other)) {
        const c = o.c, cw = c.maxx - c.minx + 1, ch = c.maxy - c.miny + 1;
        if (ch < minH * 1.2 || ch < cw * 1.1) continue;
        // 거의 전부 흰색이면서 가늘거나 속이 빈 덩어리는 선수가 아니라 라인 조각이다
        if (o.f.whiteFrac > 0.88 && (cw < 4 || c.area < cw * ch * 0.45 || ch > cw * 4.5)) continue;
        out.feats.push({ lab: o.f.lab, rgb: o.f.rgb });
      }
    }
    for (const k of ['A', 'B', 'other']) for (const o of out[k]) { delete o.c; delete o.f; }
    return out;
  }

  /**
   * 잔디 위 흰 선에서 "중앙선 + 센터서클"을 찾는다 (옆에서 본 화면 기준: 중앙선이 세로에 가깝게 보임).
   * 1) 흰 픽셀로 허프 변환을 해 길고 가파른 직선 후보를 뽑고
   * 2) 그 직선 위에 중심이 있는 타원(센터서클)이 실제로 그려져 있는지 둘레를 따라 확인한다.
   *    페널티박스 앞 선 같은 다른 세로선은 양쪽으로 퍼진 타원이 없어서 걸러진다.
   * 반환: { x, y: 센터서클 중심, a: 가로 반지름, b: 세로 반지름 (정규화), m: 선의 기울기 dx/dy, score }
   */
  function findCenter(white, pitch, G, gw, W, H, yTop, yBot, dbg) {
    const step = W > 900 ? 2 : 1, Q = W > 900 ? 4 : 2, qw = Math.ceil(W / Q), qh = Math.ceil(H / Q);
    const wm = new Uint8Array(qw * qh), px = [], py = [];
    for (let y = 0; y < H; y += step) {
      const grow = ((y / G) | 0) * gw;
      for (let x = 0; x < W; x += step) {
        if (!white[y * W + x] || !pitch[grow + ((x / G) | 0)]) continue;
        px.push(x); py.push(y); wm[((y / Q) | 0) * qw + ((x / Q) | 0)] = 1;
      }
    }
    const n = px.length;
    if (n < 60 || yBot - yTop < H * 0.2) return null;
    const M = 41, BW = 3, off = H / 2, nb = Math.ceil((W + H) / BW) + 2;
    const acc = new Uint16Array(M * nb);
    for (let mi = 0; mi < M; mi++) {
      const m = -1 + mi * 0.05, base = mi * nb;
      for (let k = 0; k < n; k++) {
        const b = ((px[k] - m * (py[k] - off) + off) / BW) | 0;
        if (b >= 0 && b < nb) acc[base + b]++;
      }
    }
    const need = ((yBot - yTop) / step) * 0.3;
    const peaks = [];
    for (let t = 0; t < 3; t++) {
      let bv = 0, bi = -1;
      for (let i = 0; i < acc.length; i++) if (acc[i] > bv) { bv = acc[i]; bi = i; }
      if (bi < 0 || bv < need) break;
      const mi = (bi / nb) | 0, b = bi % nb;
      peaks.push({ m: -1 + mi * 0.05, x0: b * BW + BW / 2 - off });
      for (let dm = -4; dm <= 4; dm++) for (let db = -14; db <= 14; db++) {
        const mm = mi + dm, bb = b + db;
        if (mm >= 0 && mm < M && bb >= 0 && bb < nb) acc[mm * nb + bb] = 0;
      }
    }
    // 표본 대조용 마스크: 실제 원은 원근 때문에 정확한 타원이 아니므로 여유를 둔다 (1칸·2칸 팽창)
    const dilate = src => {
      const out = new Uint8Array(src.length);
      for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
        if (!src[y * qw + x]) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < qw && yy < qh) out[yy * qw + xx] = 1;
        }
      }
      return out;
    };
    const wm1 = dilate(wm), wm2 = dilate(wm1);
    // 타원 둘레 표본 각도 (선이 지나가는 위·아래 부근은 제외)
    const cs = [], sn = [];
    for (let j = 0; j < 48; j++) {
      const t = (j / 48) * Math.PI * 2;
      if (Math.abs(Math.cos(t)) < 0.26) continue;
      cs.push(Math.cos(t)); sn.push(Math.sin(t));
    }
    const fitScore = (mask, cx, cy, a, b) => {
      let inF = 0, hit = 0, lN = 0, lH = 0, rN = 0, rH = 0;
      for (let j = 0; j < cs.length; j++) {
        const x = cx + a * cs[j], y = cy + b * sn[j];
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const h = mask[((y / Q) | 0) * qw + ((x / Q) | 0)];
        inF++; hit += h;
        if (cs[j] < 0) { lN++; lH += h; } else { rN++; rH += h; }
      }
      // 납작한 타원은 가로선 하나에도 들어맞으므로 인정하지 않는다
      if (inF < 14 || b < Q * 6) return -1;
      if ((lN >= 6 && lH < lN * 0.45) || (rN >= 6 && rH < rN * 0.45)) return -1;
      return hit / inF + inF * 0.002; // 비슷하면 더 많이 보이는 쪽
    };
    // 1) 거칠게 훑기
    let coarse = null;
    const dy = Math.max(3, Math.round(H / 110));
    for (const pk of peaks) {
      for (let cy = yTop; cy <= yBot; cy += dy) {
        const cx = pk.x0 + pk.m * (cy - off);
        if (cx < -W * 0.1 || cx > W * 1.1) continue;
        for (let a = W * 0.045; a <= W * 0.32; a *= 1.1) {
          for (let ratio = 0.18; ratio <= 0.7; ratio += 0.04) {
            const v = fitScore(wm2, cx, cy, a, a * ratio);
            if (v >= 0.6 && (!coarse || v > coarse.v)) coarse = { v, cx, cy, a, ratio, m: pk.m };
          }
        }
      }
    }
    if (dbg) Object.assign(dbg, { wm, qw, qh, peaks, coarse, need, n });
    if (!coarse) return null;
    // 2) 그 주변을 촘촘히 다시 맞추기
    let best = null;
    for (let ox = -8; ox <= 8; ox += 2) {
      for (let oy = -dy; oy <= dy; oy += 2) {
        for (let fa = 0.9; fa <= 1.101; fa += 0.025) {
          for (let dr = -0.04; dr <= 0.041; dr += 0.01) {
            const a = coarse.a * fa, ratio = Math.max(0.16, coarse.ratio + dr);
            const v = fitScore(wm1, coarse.cx + ox, coarse.cy + oy, a, a * ratio);
            if (v >= 0.66 && (!best || v > best.val)) {
              best = { val: v, score: v, x: (coarse.cx + ox) / W, y: (coarse.cy + oy) / H, a: a / W, b: (a * ratio) / H, m: coarse.m };
            }
          }
        }
      }
    }
    return best;
  }

  /**
   * 선수 덩어리들의 유니폼 대표색(Lab)을 두 무리로 나눠 두 팀의 색을 찾는다.
   * 가장 빽빽한 색 무리가 한 팀, 거기서 충분히 떨어진 다른 빽빽한 무리가 다른 팀.
   * 골키퍼·심판처럼 수가 적은 색은 무리를 이루지 못해 빠진다.
   * 반환: [{ spec, votes }] (많이 보이는 순, 최대 2개)
   */
  function clusterTeams(feats, grassRgb) {
    const n = feats.length;
    if (n < 6) return [];
    const dens = feats.map(f => { let k = 0; for (const g of feats) if (labDist(f.lab, g.lab) < 15) k++; return k; });
    let i1 = 0;
    for (let i = 1; i < n; i++) if (dens[i] > dens[i1]) i1 = i;
    let i2 = -1, best = 0;
    for (let i = 0; i < n; i++) {
      const dd = labDist(feats[i].lab, feats[i1].lab);
      if (dd < 12 || dens[i] < Math.max(3, dens[i1] * 0.15)) continue;
      const sc = dens[i] * Math.min(1, dd / 30);
      if (sc > best) { best = sc; i2 = i; }
    }
    const med = a => a.sort((x, y) => x - y)[a.length >> 1];
    const center = idx => [0, 1, 2].map(k => med(idx.map(i => feats[i].lab[k])));
    let cs = i2 < 0 ? [feats[i1].lab] : [feats[i1].lab, feats[i2].lab];
    let groups = [];
    for (let it = 0; it < 8; it++) {
      groups = cs.map(() => []);
      const sepNow = cs.length > 1 ? labDist(cs[0], cs[1]) : 45, lim = Math.max(14, sepNow * 0.55);
      for (let i = 0; i < n; i++) {
        let bk = -1, bd = lim;
        cs.forEach((c, k) => { const dd = labDist(feats[i].lab, c); if (dd <= bd) { bd = dd; bk = k; } });
        if (bk >= 0) groups[bk].push(i);
      }
      cs = cs.map((c, k) => (groups[k].length ? center(groups[k]) : c));
    }
    const out = groups.map(g => {
      if (!g.length) return null;
      const rgb = [0, 1, 2].map(k => med(g.map(i => feats[i].rgb[k])));
      const spec = makeSpec(rgb[0], rgb[1], rgb[2]);
      // 화면에 보여 줄 색·이름: 작은 선수는 잔디색이 섞여 흐려지므로, 잔디색에서 가장 먼(덜 섞인) 선수들의 색을 쓴다
      if (grassRgb && g.length >= 4) {
        const gl = rgb2lab(grassRgb[0], grassRgb[1], grassRgb[2]);
        const far = g.slice().sort((p, q) => labDist(feats[q].lab, gl) - labDist(feats[p].lab, gl)).slice(0, Math.max(2, Math.ceil(g.length * 0.25)));
        spec.show = makeSpec(...[0, 1, 2].map(k => med(far.map(i => feats[i].rgb[k]))));
      }
      return { spec, votes: g.length };
    }).filter(Boolean).sort((a, b) => b.votes - a.votes);
    if (out.length > 1 && (out[1].votes < Math.max(3, out[0].votes * 0.2) || labDist(out[0].spec.lab, out[1].spec.lab) < 10)) out.length = 1;
    return out;
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

  FCY.vision = { rgb2hsv, rgb2lab, labDist, hueDiff, makeSpec, estimateGrass, quadMask, detect, clusterTeams, hueName, toGray, estimateShift, GRASS_TOL };
})();
