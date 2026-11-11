/* 검출 결과 → 경기장 좌표, 역할(포지션) 배정, 평균 포메이션, 반복 패턴 분석 */
(function () {
  'use strict';
  const FCY = (window.FCY = window.FCY || {});
  const PW = 68, PL = 105;

  // ---------- 기하 ----------
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = src[i], { x: u, y: v } = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) {
      let piv = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      const d = A[c][c] || 1e-12;
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / d;
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / (A[i][i] || 1e-12));
    return (x, y) => {
      const w = h[6] * x + h[7] * y + 1;
      return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
    };
  }

  function orient(u, v, attack) {
    switch (attack) {
      case 'left': return { x: 1 - v, y: 1 - u };
      case 'up': return { x: u, y: 1 - v };
      case 'down': return { x: 1 - u, y: v };
      default: return { x: v, y: u }; // right
    }
  }

  // ---------- 유틸 ----------
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const meanPt = pts => {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  };
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  const norm = a => Math.hypot(a.x, a.y);
  const f1 = v => Math.abs(v).toFixed(1);
  const signed = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);

  function hungarian(cost) {
    const n = cost.length;
    const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
    const p = new Int32Array(n + 1), way = new Int32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(n + 1).fill(Infinity), used = new Uint8Array(n + 1);
      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const ans = new Int32Array(n);
    for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
    return ans;
  }

  /** 선형 보간으로 null 채우기 (maxGap 초과 구간은 fallback 사용) */
  function fillSeries(arr, maxGap, fallback) {
    const N = arr.length, out = arr.slice();
    let last = -1;
    for (let i = 0; i <= N; i++) {
      if (i < N && !arr[i]) continue;
      const gap = i - last - 1;
      if (gap > 0) {
        const a = last >= 0 ? arr[last] : null, b = i < N ? arr[i] : null;
        for (let j = last + 1; j < i; j++) {
          if (a && b && gap <= maxGap) {
            const t = (j - last) / (i - last);
            out[j] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          } else if (fallback) out[j] = fallback(j);
          else if ((a || b) && gap <= maxGap) out[j] = { ...(a || b) };
          else out[j] = null;
        }
      }
      last = i;
    }
    return out;
  }

  function smooth(arr, r) {
    return arr.map((p, i) => {
      if (!p) return p;
      let x = 0, y = 0, n = 0;
      for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) {
        if (arr[j]) { x += arr[j].x; y += arr[j].y; n++; }
      }
      return { x: x / n, y: y / n };
    });
  }

  // ---------- 역할 배정 ----------
  function assignRoles(pts, maxK, maxGap) {
    const N = pts.length;
    const counts = pts.map(p => p.length), nz = counts.filter(c => c > 0);
    if (!nz.length) return null;
    const K = Math.max(1, Math.min(maxK, Math.round(quantile(nz, 0.8))));
    const exact = [];
    for (let i = 0; i < N; i++) if (counts[i] === K) exact.push(i);
    let init = exact.length ? exact[exact.length >> 1] : -1;
    if (init < 0) {
      let best = Infinity;
      for (let i = 0; i < N; i++) if (counts[i] > K && counts[i] < best) { best = counts[i]; init = i; }
    }
    if (init < 0) return null;
    const c0 = meanPt(pts[init].slice(0, K));
    let means = pts[init].slice(0, K).map(p => sub(p, c0));
    const offsets = pts.map(p => (p.length ? meanPt(p) : null));
    const assign = pts.map(p => new Int32Array(p.length).fill(-1));
    const GATE = 28 * 28;

    for (let it = 0; it < 10; it++) {
      const sx = new Float64Array(K), sy = new Float64Array(K), cn = new Float64Array(K);
      for (let i = 0; i < N; i++) {
        const P = pts[i], n = P.length;
        if (!n) continue;
        const o = offsets[i], size = Math.max(n, K), cost = [];
        for (let r = 0; r < size; r++) {
          const row = new Float64Array(size);
          for (let c = 0; c < size; c++) {
            if (r < n && c < K) {
              const dx = P[r].x - o.x - means[c].x, dy = P[r].y - o.y - means[c].y;
              row[c] = Math.min(GATE, dx * dx + dy * dy);
            } else row[c] = GATE;
          }
          cost.push(row);
        }
        const as = hungarian(cost);
        let ox = 0, oy = 0, m = 0;
        for (let r = 0; r < n; r++) {
          const c = as[r];
          assign[i][r] = c < K && cost[r][c] < GATE ? c : -1;
          if (assign[i][r] >= 0) { ox += P[r].x - means[c].x; oy += P[r].y - means[c].y; m++; }
        }
        if (m >= 2) offsets[i] = { x: ox / m, y: oy / m };
        for (let r = 0; r < n; r++) {
          const c = assign[i][r];
          if (c >= 0) { sx[c] += P[r].x - offsets[i].x; sy[c] += P[r].y - offsets[i].y; cn[c]++; }
        }
      }
      means = means.map((m, k) => (cn[k] ? { x: sx[k] / cn[k], y: sy[k] / cn[k] } : m));
      const mc = meanPt(means);
      means = means.map(m => sub(m, mc));
    }

    const valid = new Uint8Array(N);
    const rawTracks = Array.from({ length: K }, () => new Array(N).fill(null));
    const rate = new Float64Array(K);
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let r = 0; r < pts[i].length; r++) {
        const c = assign[i][r];
        if (c >= 0) { rawTracks[c][i] = pts[i][r]; rate[c]++; m++; }
      }
      valid[i] = m >= Math.min(3, K) ? 1 : 0;
    }
    const nValid = valid.reduce((a, b) => a + b, 0);
    for (let k = 0; k < K; k++) rate[k] /= Math.max(1, nValid);
    let offs = offsets.map((o, i) => (valid[i] ? o : null));
    offs = smooth(fillSeries(offs, Infinity, null), 2);
    // 끝부분 등 채워지지 않은 구간은 가장 가까운 값으로
    let lastO = offs.find(o => o) || { x: 34, y: 45 };
    offs = offs.map(o => (o ? (lastO = o) : { ...lastO }));
    const tracks = rawTracks.map((tr, k) =>
      smooth(fillSeries(tr, maxGap, j => add(offs[j], means[k])), 2));
    return { K, means, offsets: offs, valid, tracks, rate, nValid };
  }

  // ---------- 포메이션 ----------
  function splitLines(ys, L) {
    // ys 오름차순. 연속 구간 L개로 나누는 최소 제곱오차 분할
    const n = ys.length;
    const sse = (a, b) => { let s = 0, q = 0; for (let i = a; i < b; i++) { s += ys[i]; q += ys[i] * ys[i]; } return q - (s * s) / (b - a); };
    const dp = Array.from({ length: L + 1 }, () => new Float64Array(n + 1).fill(Infinity));
    const cut = Array.from({ length: L + 1 }, () => new Int32Array(n + 1));
    dp[0][0] = 0;
    for (let l = 1; l <= L; l++) {
      for (let j = l; j <= n; j++) {
        for (let i = l - 1; i < j; i++) {
          const c = dp[l - 1][i] + sse(i, j);
          if (c < dp[l][j]) { dp[l][j] = c; cut[l][j] = i; }
        }
      }
    }
    const sizes = [];
    let j = n;
    for (let l = L; l >= 1; l--) { sizes.unshift(j - cut[l][j]); j = cut[l][j]; }
    return { sizes, cost: dp[L][n] };
  }

  function buildFormation(roles, avgCentroid) {
    const K = roles.K;
    const pos = roles.means.map(m => add(m, avgCentroid));
    const order = pos.map((p, k) => k).sort((a, b) => pos[a].y - pos[b].y);
    let gk = -1;
    if (K === 11) gk = order.shift();
    const n = order.length;
    let lines;
    if (n <= 3) lines = order.map(() => 1);
    else {
      const ys = order.map(k => pos[k].y);
      const s3 = splitLines(ys, 3);
      lines = s3.sizes;
      if (n >= 8) {
        const s4 = splitLines(ys, 4);
        // 3줄로 설명되지 않는 뚜렷한 층이 있을 때만 4줄로 본다
        if (s3.cost / n > 6 && s4.cost < s3.cost * 0.4) lines = s4.sizes;
      }
    }
    // 등번호: 첨부 디자인의 전통적 번호 배치를 따른다
    const nums = new Array(K).fill(null);
    if (gk >= 0) nums[gk] = 1;
    const groups = [];
    let at = 0;
    for (const sz of lines) { groups.push(order.slice(at, at + sz).sort((a, b) => pos[a].x - pos[b].x)); at += sz; }
    const used = new Set([1]);
    const take = list => { for (const v of list) if (!used.has(v)) { used.add(v); return v; } for (let v = 2; ; v++) if (!used.has(v)) { used.add(v); return v; } };
    const setLine = (g, wide, central) => {
      const L = g.length;
      g.forEach((k, i) => {
        if (L >= 3 && i === 0) nums[k] = take([wide[0]]);
        else if (L >= 3 && i === L - 1) nums[k] = take([wide[1]]);
      });
      g.forEach(k => { if (nums[k] == null) nums[k] = take(central); });
    };
    if (groups.length) {
      const last = groups.length - 1;
      if (groups.length >= 2) setLine(groups[0], [3, 2], [4, 5, 6]);
      if (groups.length >= 3) {
        const fw = groups[last];
        if (fw.length === 1) nums[fw[0]] = take([9]);
        else if (fw.length === 2) { nums[fw[0]] = take([9]); nums[fw[1]] = take([10]); }
        else setLine(fw, [11, 7], [9, 10]);
      }
      for (let g = last - (groups.length >= 3 ? 1 : 0); g >= (groups.length >= 2 ? 1 : 0); g--) {
        setLine(groups[g], [11, 7], [10, 8, 6, 4, 5]);
      }
    }
    const players = pos.map((p, k) => ({ x: p.x, y: p.y, num: nums[k], gk: k === gk, role: k }));
    const gkEstimated = gk < 0;
    if (gkEstimated) players.push({ x: 34, y: 5.5, num: 1, gk: true, estimated: true, role: -1 });
    const out = order.map(k => pos[k]);
    const xs = out.map(p => p.x), ys2 = out.map(p => p.y);
    return {
      label: lines.join('-'), lines, players, nums, gk, gkEstimated,
      width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...ys2) - Math.min(...ys2),
      outfield: order,
    };
  }

  // ---------- 공 추적 ----------
  function trackBall(cands, dt) {
    const N = cands.length;
    // 고정된 잡음(페널티 마크, 광고 글자 등) 제거
    const cell = p => `${Math.round(p.x * 160)},${Math.round(p.y * 160)}`;
    const freq = new Map();
    cands.forEach(cs => { const seen = new Set(cs.map(cell)); for (const k of seen) freq.set(k, (freq.get(k) || 0) + 1); });
    const lim = Math.max(5, N * 0.22);
    const C = cands.map(cs => cs.filter(p => (freq.get(cell(p)) || 0) < lim));

    const G = Math.max(2, Math.round(1.6 / dt)), maxJump = 0.6 * dt;
    const cost = C.map(cs => new Float64Array(cs.length)), prev = C.map(cs => new Array(cs.length).fill(null));
    let bestPrefix = 0, bestPrefixAt = null; // 그 이전 구간의 최적 사슬 끝
    let gBest = 0, gAt = null;
    const pending = [];
    for (let i = 0; i < N; i++) {
      for (let c = 0; c < C[i].length; c++) {
        const p = C[i][c], un = p.white ? -1 : -0.55;
        let b = 0, bp = null;
        if (bestPrefixAt && bestPrefix + 1.5 < b) { b = bestPrefix + 1.5; bp = bestPrefixAt; }
        for (let j = Math.max(0, i - G); j < i; j++) {
          const g = i - j;
          for (let k = 0; k < C[j].length; k++) {
            const q = C[j][k], d = Math.hypot(p.x - q.x, p.y - q.y), l = maxJump * g;
            if (d > l) continue;
            const v = cost[j][k] + 0.35 * (g - 1) + 1.2 * (d / l) * (d / l);
            if (v < b) { b = v; bp = [j, k]; }
          }
        }
        cost[i][c] = b + un; prev[i][c] = bp;
        if (cost[i][c] < gBest) { gBest = cost[i][c]; gAt = [i, c]; }
      }
      pending.push(i);
      // G 프레임보다 오래된 사슬만 "재시작" 대상으로 삼는다
      while (pending.length && pending[0] < i - G + 1) {
        const j = pending.shift();
        for (let k = 0; k < C[j].length; k++) if (cost[j][k] < bestPrefix) { bestPrefix = cost[j][k]; bestPrefixAt = [j, k]; }
      }
    }
    const track = new Array(N).fill(null);
    let cur = gAt, found = 0;
    while (cur) { track[cur[0]] = C[cur[0]][cur[1]]; found++; cur = prev[cur[0]][cur[1]]; }
    return { track, found };
  }

  // ---------- 문장 ----------
  function vecText(v, unit, thr, opp) {
    const parts = [];
    if (Math.abs(v.x) >= thr) parts.push(`${v.x < 0 ? '왼쪽' : '오른쪽'}으로 ${f1(v.x)}${unit}`);
    if (Math.abs(v.y) >= thr) {
      if (opp) parts.push(`${v.y < 0 ? '우리 골문 쪽으로' : '자기 진영 쪽으로'} ${f1(v.y)}${unit}`);
      else parts.push(`${v.y > 0 ? '전진' : '후퇴'} ${f1(v.y)}${unit}`);
    }
    return parts.join(' · ');
  }
  const shapeText = (dw, dd) => {
    const parts = [];
    if (Math.abs(dw) >= 1) parts.push(`좌우 폭 ${signed(dw)}m (${dw < 0 ? '좁힘' : '넓힘'})`);
    if (Math.abs(dd) >= 1) parts.push(`앞뒤 간격 ${signed(dd)}m (${dd < 0 ? '촘촘하게' : '벌어짐'})`);
    return parts.join(' · ');
  };

  function runs(labels, minLen) {
    const out = [];
    let s = 0;
    for (let i = 1; i <= labels.length; i++) {
      if (i === labels.length || labels[i] !== labels[s]) {
        if (labels[s] >= 0 && i - s >= minLen) out.push({ z: labels[s], s, e: i - 1 });
        s = i;
      }
    }
    return out;
  }

  // ---------- 공 위치에 따른 패턴 ----------
  function ballPatterns(S) {
    const { N, dt, full, A, ball, form, width, depth } = S;
    const o = A.offsets, K = A.K;
    const use = [];
    for (let i = 0; i < N; i++) if (ball[i] && A.valid[i]) use.push(i);
    const res = { ok: false, zones: [], scenes: [], sceneZone: [], transitions: [], lag: [] };
    if (use.length < Math.max(6, N * 0.1)) {
      res.reason = '공을 안정적으로 추적한 구간이 부족해 공 기준 패턴을 계산하지 못했습니다. 공이 화면에 또렷하게 보이는 영상일수록 정확합니다.';
      return res;
    }
    const allIdx = [];
    for (let i = 0; i < N; i++) if (A.valid[i]) allIdx.push(i);
    const oMean = meanPt(allIdx.map(i => o[i]));
    const wMean = allIdx.reduce((a, i) => a + width[i], 0) / allIdx.length;
    const dMean = allIdx.reduce((a, i) => a + depth[i], 0) / allIdx.length;
    const vel = o.map((p, i) => {
      const a = o[Math.max(0, i - 1)], b = o[Math.min(N - 1, i + 1)];
      return mul(sub(b, a), 1 / (dt * (Math.min(N - 1, i + 1) - Math.max(0, i - 1)) || dt));
    });

    const LANE = full ? ['왼쪽 측면', '중앙', '오른쪽 측면'] : ['블록 왼쪽', '블록 중앙', '블록 오른쪽'];
    const THIRD = full ? ['수비 지역', '중원', '공격 지역'] : ['블록 뒤쪽', '블록 안', '블록 앞쪽'];
    const zoneOf = i => {
      const b = ball[i];
      let lx, ty;
      if (full) {
        lx = b.x < PW / 3 ? 0 : b.x < (2 * PW) / 3 ? 1 : 2;
        ty = b.y < PL / 3 ? 0 : b.y < (2 * PL) / 3 ? 1 : 2;
      } else {
        const dx = b.x - o[i].x, dy = b.y - o[i].y;
        lx = dx < -0.22 * wMean ? 0 : dx > 0.22 * wMean ? 2 : 1;
        ty = dy < -0.3 * dMean ? 0 : dy > 0.3 * dMean ? 2 : 1;
      }
      return ty * 3 + lx;
    };
    const zl = new Int32Array(N).fill(-1);
    for (const i of use) zl[i] = zoneOf(i);
    const minCount = Math.max(4, Math.ceil(use.length * 0.07));
    const eps = runs(Array.from(zl), 2);
    const relMeanAll = A.tracks.map((tr, k) => meanPt(allIdx.map(i => sub(tr[i], o[i]))));
    const absMeanAll = A.tracks.map(tr => meanPt(allIdx.map(i => tr[i])));

    const zones = new Map();
    for (let z = 0; z < 9; z++) {
      const idx = use.filter(i => zl[i] === z);
      if (idx.length < minCount) continue;
      const cen = meanPt(idx.map(i => o[i]));
      const v = meanPt(idx.map(i => vel[i]));
      const w = idx.reduce((a, i) => a + width[i], 0) / idx.length;
      const d = idx.reduce((a, i) => a + depth[i], 0) / idx.length;
      const metric = full ? sub(cen, oMean) : v;
      const thr = full ? 1 : 0.35;
      const myEps = eps.filter(e => e.z === z);
      let agree = null;
      const ax = Math.abs(metric.x) >= Math.abs(metric.y) ? 'x' : 'y';
      if (Math.abs(metric[ax]) >= thr && myEps.length >= 2) {
        agree = 0;
        for (const e of myEps) {
          let m = 0, n = 0;
          for (let i = e.s; i <= e.e; i++) { m += full ? o[i][ax] - oMean[ax] : vel[i][ax]; n++; }
          if (Math.sign(m / n) === Math.sign(metric[ax])) agree++;
        }
      }
      let home, ballPos;
      if (full) {
        home = A.tracks.map(tr => meanPt(idx.map(i => tr[i])));
        ballPos = meanPt(idx.map(i => ball[i]));
      } else {
        const shift = mul(v, 1.5);
        home = A.tracks.map(tr => add(add(oMean, meanPt(idx.map(i => sub(tr[i], o[i])))), shift));
        ballPos = add(oMean, meanPt(idx.map(i => sub(ball[i], o[i]))));
      }
      // 가장 크게 반응한 선수
      let topK = -1, topV = null, topN = 0;
      for (let k = 0; k < K; k++) {
        if (k === form.gk) continue;
        const dv = full ? sub(home[k], absMeanAll[k]) : sub(meanPt(idx.map(i => sub(A.tracks[k][i], o[i]))), relMeanAll[k]);
        if (norm(dv) > topN) { topN = norm(dv); topK = k; topV = dv; }
      }
      const label = `${LANE[z % 3]} · ${THIRD[(z / 3) | 0]}`;
      const move = full ? vecText(metric, 'm', 1) : vecText(metric, 'm/s', 0.35);
      const shape = shapeText(w - wMean, d - dMean);
      const lines = [];
      lines.push(move ? `팀 블록: ${move}${full ? ' (평균 위치 대비)' : ' 이동'}` : '팀 블록: 위치 변화 거의 없음');
      if (shape) lines.push(shape);
      if (topK >= 0 && topN >= 1.5) lines.push(`가장 크게 움직인 선수: ${form.nums[topK]}번 (${vecText(topV, 'm', 0.8) || f1(topN) + 'm'})`);
      if (agree != null) lines.push(`${myEps.length}회 중 ${agree}회 같은 방향으로 반응`);
      zones.set(z, {
        id: z, label, share: idx.length / use.length, episodes: myEps.length, agree,
        lines, home, ball: ballPos, sub: [move ? '블록 ' + move : '', shape].filter(Boolean).join(' / '),
      });
    }
    if (!zones.size) { res.reason = '공 위치별로 묶을 만큼 충분한 장면이 없습니다.'; return res; }

    // 실제 전개 순서대로 장면 구성
    let seq = [];
    for (const e of eps) if (zones.has(e.z) && seq[seq.length - 1] !== e.z) seq.push(e.z);
    const trans = new Map();
    for (let i = 1; i < seq.length; i++) {
      const k = seq[i - 1] + '>' + seq[i];
      trans.set(k, (trans.get(k) || 0) + 1);
    }
    res.transitions = [...trans.entries()].filter(e => e[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => {
      const [a, b] = k.split('>').map(Number);
      return { text: `${zones.get(a).label} → ${zones.get(b).label}`, count: c };
    });
    if (seq.length > 12) seq = seq.slice(0, 12);
    while (seq.length > 1 && seq[0] === seq[seq.length - 1]) seq.pop();
    if (!seq.length) seq = [...zones.keys()];
    const base = { home: full ? absMeanAll : relMeanAll.map(m => add(m, oMean)), ball: zones.get(seq[0]).ball };
    for (let j = 0; j < seq.length; j++) {
      const from = seq.length === 1 ? base : zones.get(seq[(j + seq.length - 1) % seq.length]);
      const to = zones.get(seq[j]);
      res.scenes.push({
        from: { home: from.home, ball: from.ball }, to: { home: to.home, ball: to.ball },
        tag: `공 위치: ${to.label}`, sub: to.sub || '블록 변화 거의 없음', move: 1500, hold: 1300,
      });
      res.sceneZone.push(seq[j]);
    }
    res.zones = [...zones.values()].sort((a, b) => b.share - a.share);

    // 공 이동 → 블록 이동 지연 (고정 카메라에서만 의미가 있음)
    if (full) {
      const maxLag = Math.round(2 / dt);
      for (const ax of ['x', 'y']) {
        let best = 0, bl = 0;
        for (let lag = 0; lag <= maxLag; lag++) {
          const a = [], b = [];
          for (const i of use) if (i + lag < N && A.valid[i + lag]) { a.push(ball[i][ax]); b.push(o[i + lag][ax]); }
          if (a.length < 8) continue;
          const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
          let sab = 0, saa = 0, sbb = 0;
          for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
          const r = sab / Math.sqrt(saa * sbb || 1);
          if (r > best) { best = r; bl = lag; }
        }
        if (best >= 0.4) {
          res.lag.push(`공이 ${ax === 'x' ? '좌우' : '앞뒤'}로 움직이면 팀 블록이 ${bl ? `약 ${(bl * dt).toFixed(1)}초 뒤` : '거의 동시에'} 같은 방향으로 따라 움직임 (상관계수 ${best.toFixed(2)})`);
        }
      }
    }
    res.ok = true;
    return res;
  }

  // ---------- 상대 움직임에 따른 패턴 ----------
  function oppPatterns(S) {
    const { N, dt, A, B, form, width, depth } = S;
    const res = { ok: false, states: [], scenes: [], sceneState: [] };
    if (!B || B.K < 3 || B.nValid < Math.max(6, N * 0.15)) {
      res.reason = '상대 팀 선수를 충분히 찾지 못해 상대 기준 패턴을 계산하지 못했습니다. 상대 팀 유니폼 색을 직접 지정해 보세요.';
      return res;
    }
    const c = B.offsets, o = A.offsets;
    const w = Math.max(1, Math.round(0.6 / dt));
    const NAMES = ['전진(우리 골문 쪽으로)', '후퇴', '왼쪽으로 이동', '오른쪽으로 이동'];
    const SHORT = ['상대 전진', '상대 후퇴', '상대 왼쪽 이동', '상대 오른쪽 이동'];
    const st = new Int32Array(N).fill(-1);
    for (let i = w; i < N - w; i++) {
      if (!A.valid[i] || !B.valid[i]) continue;
      const vx = (c[i + w].x - c[i - w].x) / (2 * w * dt), vy = (c[i + w].y - c[i - w].y) / (2 * w * dt);
      if (Math.hypot(vx, vy) < 0.9) continue;
      st[i] = Math.abs(vy) >= Math.abs(vx) ? (vy < 0 ? 0 : 1) : vx < 0 ? 2 : 3;
    }
    const eps = runs(Array.from(st), Math.max(2, Math.round(0.6 / dt)));
    for (let z = 0; z < 4; z++) {
      const my = eps.filter(e => e.z === z);
      if (!my.length) continue;
      const dA = meanPt(my.map(e => sub(o[e.e], o[e.s])));
      const dB = meanPt(my.map(e => sub(c[e.e], c[e.s])));
      const dW = my.reduce((a, e) => a + width[e.e] - width[e.s], 0) / my.length;
      const dD = my.reduce((a, e) => a + depth[e.e] - depth[e.s], 0) / my.length;
      const dur = my.reduce((a, e) => a + (e.e - e.s) * dt, 0) / my.length;
      const ax = z < 2 ? 'y' : 'x';
      let agree = null;
      if (Math.abs(dA[ax]) >= 0.8 && my.length >= 2) {
        agree = my.filter(e => Math.sign(o[e.e][ax] - o[e.s][ax]) === Math.sign(dA[ax])).length;
      }
      const from = { home: A.tracks.map(tr => meanPt(my.map(e => tr[e.s]))), away: B.tracks.map(tr => meanPt(my.map(e => tr[e.s]))) };
      const to = { home: A.tracks.map(tr => meanPt(my.map(e => tr[e.e]))), away: B.tracks.map(tr => meanPt(my.map(e => tr[e.e]))) };
      let topK = -1, topN = 0, topV = null;
      for (let k = 0; k < A.K; k++) {
        if (k === form.gk) continue;
        const dv = sub(to.home[k], from.home[k]);
        if (norm(dv) > topN) { topN = norm(dv); topK = k; topV = dv; }
      }
      const react = vecText(dA, 'm', 0.8);
      const shape = shapeText(dW, dD);
      const lines = [`상대 블록 이동: ${vecText(dB, 'm', 0.5, true) || '미미함'}`];
      lines.push(react ? `우리 블록 반응: ${react}` : '우리 블록 반응: 위치를 거의 유지');
      if (shape) lines.push(shape);
      if (topK >= 0 && topN >= 1.5) lines.push(`가장 크게 움직인 선수: ${form.nums[topK]}번 (${vecText(topV, 'm', 0.8) || f1(topN) + 'm'})`);
      if (agree != null) lines.push(`${my.length}회 중 ${agree}회 같은 방향으로 반응`);
      res.states.push({ id: z, label: `상대가 ${NAMES[z]}할 때`, episodes: my.length, dur, agree, lines });
      res.scenes.push({
        from, to, tag: SHORT[z], sub: [react ? '우리 블록 ' + react : '우리 블록 위치 유지', shape].filter(Boolean).join(' / '),
        move: 1900, hold: 1400,
      });
      res.sceneState.push(z);
    }
    if (!res.states.length) {
      res.reason = '상대 팀 블록이 뚜렷하게 이동한 구간이 없어 반응 패턴을 계산하지 못했습니다.';
      return res;
    }
    // 상대 블록 ↔ 우리 블록 동조 정도
    let sab = 0, saa = 0, sbb = 0, n = 0;
    for (let i = w; i < N - w; i++) {
      if (!A.valid[i] || !B.valid[i]) continue;
      const a = c[i + w].y - c[i - w].y, b = o[i + w].y - o[i - w].y;
      sab += a * b; saa += a * a; sbb += b * b; n++;
    }
    if (n >= 8) {
      const r = sab / Math.sqrt(saa * sbb || 1);
      res.sync = `상대 블록의 앞뒤 이동과 우리 블록의 앞뒤 이동 상관계수 ${r.toFixed(2)} — ${r > 0.5 ? '상대가 올라오면 내려서고, 물러나면 따라 올라가는 간격 유지형' : r < -0.3 ? '상대 움직임과 반대로 맞서는 압박형' : '상대 움직임과 뚜렷한 동조 없음'}`;
    }
    res.ok = true;
    return res;
  }

  // ---------- 화면이 잘린 영상의 실제 거리 환산 ----------
  // 기준 규격: 경기장 105 x 68 m, 센터서클 반지름 9.15 m, 선수 키 약 1.8 m.
  // 참고 중계 화면 3장에서 센터서클의 세로/가로 픽셀 비(= 깊이 방향 압축률)를 재면 0.27, 0.40, 0.47 이고,
  // 같은 위치에서 선수의 화면 높이는 가로 1m 픽셀 수의 약 1.85배였다.
  const PLAYER_M = 1.85;       // 선수 화면 높이 ÷ 그 위치의 가로 1m 픽셀 수
  const DEPTH_RATIO = 0.32;    // 깊이 방향 압축률 기본값 (잘려서 직접 잴 수 없을 때)
  const MARGIN = 2.5;          // 라인 밖 잔디 여유 폭(m)

  const END_MARGIN = 4;        // 골라인 뒤 잔디 여유(m)

  /** 선수의 화면 높이 h(y) = a + b·y (픽셀). 화면 아래쪽(가까운 쪽)일수록 커진다 */
  function heightFit(det, pan) {
    const W = det.W, Hh = det.H;
    let pts = [];
    det.frames.forEach((f, i) => {
      for (const p of f.A.concat(f.B)) {
        const hp = p.h * Hh, wp = p.w * W;
        if (hp >= wp * 1.2 && hp <= wp * 4.5) pts.push([(p.y - pan[i].y) * Hh, hp]);
      }
    });
    if (pts.length < 12) return null;
    const fit = P => {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [x, y] of P) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const n = P.length, d = n * sxx - sx * sx;
      const b = Math.abs(d) < 1e-6 ? 0 : (n * sxy - sx * sy) / d;
      return [(sy - b * sx) / n, b];
    };
    // 상의만 잡힌 검출처럼 작게 나온 값이 많으므로, 화면 높이 구간별 상위(70%) 값으로 먼저 맞춘다
    const ys = pts.map(p => p[0]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const env = [];
    for (let k = 0; k < 8; k++) {
      const lo = y0 + ((y1 - y0) * k) / 8, hi = y0 + ((y1 - y0) * (k + 1)) / 8;
      const hs = pts.filter(p => p[0] >= lo && (p[0] < hi || k === 7)).map(p => p[1]);
      if (hs.length >= 3) env.push([(lo + hi) / 2, quantile(hs, 0.7)]);
    }
    let [a, b] = fit(env.length >= 3 ? env : pts);
    for (let k = 0; k < 2; k++) {
      const keep = pts.filter(([y, h]) => { const e = Math.max(4, a + b * y); return h >= e * 0.78 && h <= e * 1.3; });
      if (keep.length < 12) break;
      pts = keep; [a, b] = fit(pts);
    }
    const hMed = median(pts.map(p => p[1]));
    if (!(b > 1e-4) || pts.length < 30) { a = hMed; b = 0; }
    return { a, b, hMed, at: y => Math.max(hMed * 0.4, a + b * y) };
  }

  /** 선수 크기와 맞지 않는 검출(골대 그물, 겹친 덩어리, 잡티)을 뺀다 */
  function dropOddSizes(det, pan, hf) {
    if (!hf) return;
    det.frames.forEach((f, i) => {
      for (const k of ['A', 'B']) {
        f[k] = f[k].filter(p => {
          const ratio = (p.h * det.H) / hf.at((p.y - pan[i].y) * det.H);
          return ratio >= 0.3 && ratio <= 1.7;
        });
      }
    });
  }

  function metricScale(det, pan, attack, hf) {
    const W = det.W, Hh = det.H;
    if (!hf) throw new Error('영상에서 선수를 충분히 찾지 못했습니다. 경기장과 선수가 잘 보이는 영상인지 확인해 주세요.');
    const med = k => median(det.frames.map(f => f[k]));
    const side = attack === 'right' || attack === 'left'; // 옆에서 본 화면: 깊이 방향 = 경기장 폭
    const yTop = median(det.frames.map((f, i) => (f.top - pan[i].y) * Hh)), yBot = median(det.frames.map((f, i) => (f.bottom - pan[i].y) * Hh));
    const topSeen = med('top') > 0.03, botSeen = med('bottom') < 0.975;
    const xl = med('left'), xr = med('right');
    const sidesSeen = xl > 0.015 && xr < 0.985 && xr - xl > 0.4;

    // 1) 좌우 끝이 다 보이면 그 폭이 곧 경기장 길이(또는 폭)이므로, 선수 크기 기준 축척을 여기에 맞춘다
    let k = 1;
    const yMid = (yTop + yBot) / 2;
    if (sidesSeen) {
      const wide = (side ? PL + 2 * END_MARGIN : PW + 2 * MARGIN);
      const pxPerM = ((xr - xl) * W) / wide;
      k = Math.max(0.5, Math.min(2, (pxPerM * PLAYER_M) / hf.at(yMid)));
    }
    const hAt = y => hf.at(y) * k;
    // 깊이(m, 압축률 1 기준): ∫ PLAYER_M / h(y) dy
    const depth1 = y => (hf.b ? (PLAYER_M / (hf.b * k)) * Math.log(hf.at(y) / hf.hMed) : (PLAYER_M / (hf.hMed * k)) * y);

    // 2) 위아래 끝이 다 보이면 "선수 키 대 경기장 폭" 비율로 깊이 압축률을 직접 구한다
    const span = (side ? PW : PL) + 2 * (side ? MARGIN : END_MARGIN);
    const near = side ? MARGIN : END_MARGIN;
    let r = DEPTH_RATIO, measured = false;
    if (topSeen && botSeen && yBot > yTop + Hh * 0.2) {
      const rr = (depth1(yBot) - depth1(yTop)) / span;
      if (rr > 0.12 && rr < 0.9) { r = rr; measured = true; }
    }
    // 3) 보이는 끝을 실제 라인 위치에 맞춘다
    const anchored = topSeen || botSeen;
    const d0 = topSeen ? depth1(yTop) / r + near : botSeen ? depth1(yBot) / r - (span - near) : 0;
    const xc = sidesSeen ? (xl + xr) / 2 : 0.5;
    const map = (x, y) => {
      const py = y * Hh, X = ((x - xc) * W * PLAYER_M) / hAt(py), D = depth1(py) / r - d0;
      switch (attack) {
        case 'left': return { x: (anchored ? PW : 0) - D, y: (sidesSeen ? PL / 2 : 0) - X };
        case 'up': return { x: (sidesSeen ? PW / 2 : 0) + X, y: (anchored ? PL : 0) - D };
        case 'down': return { x: (sidesSeen ? PW / 2 : 0) - X, y: D };
        default: return { x: D, y: (sidesSeen ? PL / 2 : 0) + X };
      }
    };
    const fixedX = side ? anchored : sidesSeen, fixedY = side ? sidesSeen : anchored;
    let note = '선수 키(약 1.8m)와 경기장 규격(105×68m)의 비율로 화면 속 거리를 실제 거리로 환산해 전체 경기장 위에 배치했습니다';
    note += measured ? ' (화면에 보이는 필드 끝으로 원근 보정).' : ' (원근은 참고 중계 화면에서 잰 기본값 사용).';
    if (!fixedX || !fixedY) {
      const ax = !fixedX && !fixedY ? '경기장 위 절대 위치' : `경기장 ${!fixedY ? '길이' : '폭'} 방향의 절대 위치`;
      note += ` 필드가 잘려 보여 ${ax}는 화면만으로 알 수 없으므로 팀 중심을 기본 위치에 두었습니다.`;
    }
    return { map, r, measured, note, fixedX, fixedY };
  }

  // ---------- 전체 분석 ----------
  function analyze(det, cfg) {
    const N = det.frames.length, dt = 1 / det.fps, full = cfg.mode === 'full';
    const H = homography(cfg.quad, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
    const pan = det.frames.map((f, i) => (full ? { x: 0, y: 0 } : det.pan[i]));
    const { track: btImg, found } = trackBall(det.frames.map((f, i) => f.balls.map(b => ({ ...b, x: b.x - pan[i].x, y: b.y - pan[i].y }))), dt);
    const hf = heightFit(det, pan);
    det = { ...det, frames: det.frames.map(f => ({ ...f })) }; // 원본 검출 결과는 건드리지 않는다
    dropOddSizes(det, pan, hf);
    let map, scale = null;
    if (full) {
      map = p => { const [u, v] = H(p.x, p.y); const q = orient(u, v, cfg.attack); return { x: q.x * PW, y: q.y * PL }; };
    } else {
      scale = metricScale(det, pan, cfg.attack, hf);
      map = (p, i) => scale.map(p.x - pan[i].x, p.y - pan[i].y);
    }
    let A = det.frames.map((f, i) => f.A.map(p => map(p, i)));
    let Bp = det.frames.map((f, i) => f.B.map(p => map(p, i)));
    let ball = btImg.map((b, i) => (b ? map({ x: b.x + pan[i].x, y: b.y + pan[i].y }, i) : null));

    if (!full) {
      // 화면만으로는 알 수 없는 축(경기장 길이 방향 등)은 팀 중심을 기본 위치에 둔다
      const cs = A.filter(P => P.length >= 3).map(meanPt);
      if (cs.length < 3) throw new Error('영상에서 분석 대상 팀 선수를 충분히 찾지 못했습니다. 1단계에서 유니폼 색을 다시 선택해 주세요.');
      const c0 = meanPt(cs);
      const off = { x: scale.fixedX ? 0 : 34 - c0.x, y: scale.fixedY ? 0 : 44 - c0.y };
      const sh = p => ({ x: p.x + off.x, y: p.y + off.y });
      A = A.map(P => P.map(sh)); Bp = Bp.map(P => P.map(sh)); ball = ball.map(b => (b ? sh(b) : null));
    }
    const gapN = Math.round(1.6 / dt);
    ball = fillSeries(ball, Math.round(2 / dt), null);
    ball = smooth(ball, 1);

    const rolesA = assignRoles(A, 11, gapN);
    if (!rolesA || rolesA.K < 3 || rolesA.nValid < 5) {
      throw new Error('지정한 유니폼 색의 선수를 충분히 찾지 못했습니다. 팀 색을 영상에서 직접 찍어 다시 지정하거나, 경기장 영역을 조정해 보세요.');
    }
    const rolesB = assignRoles(Bp, 11, gapN);
    const validIdx = [];
    for (let i = 0; i < N; i++) if (rolesA.valid[i]) validIdx.push(i);
    const avgC = meanPt(validIdx.map(i => rolesA.offsets[i]));
    const form = buildFormation(rolesA, avgC);

    const width = new Float64Array(N), depth = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const k of form.outfield) {
        const p = rolesA.tracks[k][i];
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
      width[i] = x1 - x0; depth[i] = y1 - y0;
    }
    const S = { N, dt, full, A: rolesA, B: rolesB, ball, form, width, depth };
    const cnt = k => det.frames.reduce((a, f) => a + f[k].length, 0) / N;
    return {
      full, form, scale: scale && { r: scale.r, measured: scale.measured, note: scale.note },
      ballP: ballPatterns(S), oppP: oppPatterns(S),
      stats: {
        frames: N, validFrames: rolesA.nValid, avgA: cnt('A'), avgB: cnt('B'),
        ballRate: found / N, K: rolesA.K, KB: rolesB ? rolesB.K : 0,
        avgWidth: validIdx.reduce((a, i) => a + width[i], 0) / validIdx.length,
        avgDepth: validIdx.reduce((a, i) => a + depth[i], 0) / validIdx.length,
      },
      debug: { rolesA, rolesB, ball },
    };
  }

  FCY.analysis = { analyze, homography };
})();
