/* 화면 흐름: 업로드 → 팀 지정 → 프레임 추출·검출 → 분석 결과 표시 */
(function () {
  'use strict';
  const { vision, analysis, board } = window.FCY;
  const $ = id => document.getElementById(id);
  const PROC_MAX = 1280, FPS = 5, MAX_SEC = 60;

  const PRESETS = [
    ['빨간색', 224, 37, 37], ['주황색', 245, 124, 31], ['노란색', 245, 212, 0], ['초록색', 31, 168, 74],
    ['하늘색', 85, 184, 240], ['파란색', 31, 85, 214], ['보라색', 122, 47, 208], ['분홍색', 240, 98, 168],
    ['흰색', 242, 242, 242], ['검은색', 21, 21, 21],
  ];

  const video = $('video');
  const proc = document.createElement('canvas');
  const pctx = proc.getContext('2d', { willReadFrequently: true });
  const preview = $('preview'), vctx = preview.getContext('2d');

  const S = {
    url: null, duration: 0, want: null, wantName: '', specA: null, specB: null, clusters: null,
    attack: 'right', mode: 'partial', quad: null, grassHue: 120, grassTol: 26, samples: [],
    previewImg: null, det: null, detKey: '', busy: false, anims: {},
  };

  // ---------- 색 이름 ----------
  function colorName(sp) {
    if (sp.kind === 'white') return '흰색';
    if (sp.kind === 'black') return '검은색';
    if (sp.kind === 'gray') return '회색';
    return vision.hueName(sp.h);
  }
  const css = sp => `rgb(${sp.r},${sp.g},${sp.b})`;

  // ---------- 영상 로드 ----------
  const once = (el, ev, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => { el.removeEventListener(ev, h); rej(new Error('timeout')); }, ms || 8000);
    const h = () => { clearTimeout(t); res(); };
    el.addEventListener(ev, h, { once: true });
  });

  async function seek(t) {
    t = Math.max(0, Math.min(S.duration - 0.05, t));
    if (Math.abs(video.currentTime - t) < 1e-3 && video.readyState >= 2) return;
    const p = once(video, 'seeked', 6000).catch(() => {});
    video.currentTime = t;
    await p;
  }

  function grab() {
    pctx.drawImage(video, 0, 0, proc.width, proc.height);
    return pctx.getImageData(0, 0, proc.width, proc.height);
  }

  function showError(id, msg) { const el = $(id); el.textContent = msg || ''; el.hidden = !msg; }

  async function loadVideo(src, name) {
    showError('upload-error'); showError('run-error');
    for (const id of ['sec-setup', 'sec-run', 'sec-formation', 'sec-movement']) $(id).hidden = true;
    stopAnims();
    if (S.url) URL.revokeObjectURL(S.url);
    S.url = URL.createObjectURL(src);
    video.src = S.url;
    $('file-info').textContent = '영상을 불러오는 중…';
    try {
      await once(video, 'loadedmetadata', 15000);
      if (!isFinite(video.duration)) { // 길이 정보가 없는 녹화 파일
        const p = once(video, 'durationchange', 5000).catch(() => {});
        video.currentTime = 1e7;
        await p;
      }
    } catch (e) {
      $('file-info').textContent = '';
      return showError('upload-error', '영상을 열 수 없습니다. 브라우저가 재생할 수 있는 MP4 · WebM 파일인지 확인해 주세요.');
    }
    const dur = video.duration;
    if (!isFinite(dur) || !video.videoWidth) {
      $('file-info').textContent = '';
      return showError('upload-error', '영상 정보를 읽지 못했습니다. 다른 파일로 시도해 주세요.');
    }
    if (dur > MAX_SEC + 0.5) {
      $('file-info').textContent = '';
      return showError('upload-error', `영상 길이가 ${dur.toFixed(1)}초입니다. 1분(60초) 이내 영상만 올릴 수 있습니다.`);
    }
    if (dur < 2) {
      $('file-info').textContent = '';
      return showError('upload-error', '영상이 너무 짧습니다. 2초 이상인 영상을 올려 주세요.');
    }
    S.duration = dur; S.det = null;
    await seek(dur * 0.5);
    if (Math.abs(video.currentTime - dur * 0.5) > 1) {
      $('file-info').textContent = '';
      return showError('upload-error', '이 영상은 원하는 시점으로 이동할 수 없어 분석할 수 없습니다. MP4 로 다시 저장해 올려 주세요.');
    }
    // 멀리서 찍은 화면은 선수가 몇 픽셀뿐이라 가능한 한 원본 해상도로 본다
    const PROC_W = Math.max(640, Math.min(PROC_MAX, video.videoWidth));
    proc.width = PROC_W; proc.height = Math.round((PROC_W * video.videoHeight) / video.videoWidth);
    preview.width = 960; preview.height = Math.round((960 * video.videoHeight) / video.videoWidth);
    $('file-info').textContent = `${name} · ${dur.toFixed(1)}초 · ${video.videoWidth}×${video.videoHeight}`;

    S.samples = [];
    for (let i = 0; i < 8; i++) { await seek(((i + 0.5) / 8) * dur); S.samples.push(grab()); }
    const g = vision.estimateGrass(S.samples);
    S.grassHue = g.hue; S.grassTol = g.tol;
    $('sec-setup').hidden = false; $('sec-run').hidden = false;
    resetQuad();
    S.clusters = null;
    autoTeams();
    await setPreviewTime(dur * 0.1);
    $('sec-setup').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- 경기장 영역 ----------
  function resetQuad() {
    if (S.mode === 'partial') {
      S.quad = [{ x: 0.03, y: 0.04 }, { x: 0.97, y: 0.04 }, { x: 0.97, y: 0.96 }, { x: 0.03, y: 0.96 }];
      return;
    }
    // 잔디 영역의 위·아래 가장자리에서 사다리꼴 추정
    const img = S.samples[0], W = img.width, H = img.height, d = img.data;
    const rows = [];
    for (let y = 0; y < H; y++) {
      const xs = [];
      for (let x = 0; x < W; x += 2) {
        const p = (y * W + x) * 4;
        const [h, s, v] = vision.rgb2hsv(d[p], d[p + 1], d[p + 2]);
        if (s >= 0.15 && v >= 0.1 && vision.hueDiff(h, S.grassHue) <= S.grassTol) xs.push(x);
      }
      rows.push(xs.length > W * 0.1 ? [xs[Math.floor(xs.length * 0.02)], xs[Math.floor(xs.length * 0.98)]] : null);
    }
    const ok = rows.map((r, y) => (r ? y : -1)).filter(y => y >= 0);
    if (ok.length < H * 0.2) { S.quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.95, y: 0.9 }, { x: 0.05, y: 0.9 }]; return; }
    const yT = ok[0], yB = ok[ok.length - 1];
    const band = (y0, y1) => {
      let l = W, r = 0;
      for (let y = y0; y <= y1; y++) if (rows[y]) { l = Math.min(l, rows[y][0]); r = Math.max(r, rows[y][1]); }
      return [l, r];
    };
    const k = Math.max(2, Math.round((yB - yT) * 0.05));
    const [tl, tr] = band(yT, yT + k), [bl, br] = band(yB - k, yB);
    S.quad = [{ x: tl / W, y: yT / H }, { x: tr / W, y: yT / H }, { x: br / W, y: yB / H }, { x: bl / W, y: yB / H }];
  }

  // ---------- 검출 설정 ----------
  function detectCfg(collect) {
    const W = proc.width, H = proc.height;
    return {
      grassHue: S.grassHue, grassTol: S.grassTol, specA: collect ? null : S.specA, specB: collect ? null : S.specB,
      mask: S.mode === 'full' ? vision.quadMask(S.quad, W, H, 0.04) : null,
      collectOther: !!collect, whiteAsBody: !!collect,
      findCenter: !collect && S.mode === 'partial' && (S.attack === 'right' || S.attack === 'left'),
    };
  }

  /**
   * 영상에서 선수들의 유니폼 색을 자동으로 묶은 뒤, 이용자가 고른 색과 가장 가까운 쪽을 분석 팀,
   * 나머지 중 가장 많이 보이는 쪽을 상대 팀으로 정한다.
   */
  function autoTeams() {
    S.specA = S.specB = null; invalidate();
    if (!S.want || !S.samples.length) return;
    if (!S.clusters) {
      const cfg = detectCfg(true), bins = [];
      for (const img of S.samples) bins.push(...vision.detect(img, cfg).otherBins);
      S.clusters = vision.clusterKits(bins, S.grassHue, S.grassTol);
    }
    const { a, b } = vision.assignTeams(S.want, S.clusters);
    const sw = sp => `<i style="background:${css(sp)}"></i>`;
    const el = $('team-name');
    if (!a) {
      const found = [...new Set(S.clusters.map(c => colorName(c.spec)))].slice(0, 3).join(', ');
      el.innerHTML = `<span>영상에서 ${S.wantName} 유니폼 팀을 찾지 못했습니다.</span>`;
      showError('color-warn', found
        ? `영상에서 찾은 유니폼 색: ${found}. 1단계에서 색을 다시 선택해 주세요.`
        : '영상에서 선수를 찾지 못했습니다. 선수가 화면에서 너무 작게 보이면(키가 화면 높이의 약 2% 미만) 유니폼 색을 읽기 어렵습니다.');
      return;
    }
    S.specA = a.spec; S.specB = b ? b.spec : null;
    el.innerHTML = `<span>분석 팀</span>${sw(a.spec)}<b>${colorName(a.spec)} 유니폼</b>` +
      (b ? `<span class="vs">상대 팀</span>${sw(b.spec)}<b>${colorName(b.spec)} 유니폼</b>` : '<span class="vs">상대 팀을 찾지 못했습니다</span>');
    const clash = a.spec.kind === 'chroma' && vision.hueDiff(a.spec.h, S.grassHue) <= S.grassTol + 8;
    showError('color-warn', clash ? '유니폼 색이 잔디 색과 비슷해 선수를 구분하기 어려울 수 있습니다.' : '');
  }

  function invalidate() { S.det = null; }

  // ---------- 미리보기 ----------
  async function setPreviewTime(t) {
    await seek(t);
    S.previewImg = grab();
    $('scrub-t').textContent = video.currentTime.toFixed(1) + 's';
    drawPreview();
  }

  function drawPreview() {
    if (!S.previewImg) return;
    const W = preview.width, H = preview.height;
    vctx.drawImage(video, 0, 0, W, H);
    let info = '분석 대상 팀을 찾지 못했습니다.';
    if (S.specA) {
      const r = vision.detect(S.previewImg, detectCfg(false));
      const box = (o, col) => {
        vctx.strokeStyle = col; vctx.lineWidth = 2.5;
        vctx.strokeRect((o.x - o.w / 2) * W - 2, (o.y - o.h) * H - 2, o.w * W + 4, o.h * H + 4);
      };
      r.A.forEach(o => box(o, '#22e1ff'));
      r.B.forEach(o => box(o, '#ff5d8f'));
      vctx.strokeStyle = '#fff'; vctx.lineWidth = 2;
      r.balls.slice(0, 4).forEach(b => { vctx.beginPath(); vctx.arc(b.x * W, b.y * H - b.r * W, 9, 0, 7); vctx.stroke(); });
      info = `현재 화면 검출 — 분석 대상 팀 ${r.A.length}명 · 상대 팀 ${r.B.length}명 · 공 후보 ${r.balls.length}개`;
      if (r.mid) {
        // 인식한 중앙선과 센터서클
        const m = r.mid, k = (m.m * H) / W;
        vctx.strokeStyle = '#ffe45c'; vctx.lineWidth = 2.5; vctx.setLineDash([8, 6]);
        vctx.beginPath(); vctx.ellipse(m.x * W, m.y * H, m.a * W, m.b * H, 0, 0, 7); vctx.stroke();
        vctx.beginPath();
        vctx.moveTo((m.x + k * (r.pitchTop - m.y)) * W, r.pitchTop * H); vctx.lineTo((m.x + k * (r.pitchBottom - m.y)) * W, r.pitchBottom * H);
        vctx.stroke(); vctx.setLineDash([]);
        info += ' · 중앙선·센터서클 인식됨';
      }
    }
    $('detect-info').textContent = info;
    // 경기장 영역 (고정 전체 화면 모드에서만 사용)
    if (S.mode !== 'full') return;
    const q = S.quad;
    vctx.strokeStyle = '#62d6a8'; vctx.lineWidth = 2.5; vctx.setLineDash([10, 7]);
    vctx.beginPath();
    q.forEach((p, i) => (i ? vctx.lineTo(p.x * W, p.y * H) : vctx.moveTo(p.x * W, p.y * H)));
    vctx.closePath(); vctx.stroke(); vctx.setLineDash([]);
    for (const p of q) {
      vctx.fillStyle = '#62d6a8'; vctx.strokeStyle = '#04060d'; vctx.lineWidth = 3;
      vctx.beginPath(); vctx.arc(p.x * W, p.y * H, 11, 0, 7); vctx.fill(); vctx.stroke();
    }
  }

  function pointerPos(e) {
    const r = preview.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  let drag = -1;
  preview.addEventListener('pointerdown', e => {
    const p = pointerPos(e);
    if (S.mode !== 'full') return;
    const r = preview.getBoundingClientRect();
    let best = 30 / r.width;
    S.quad.forEach((q, i) => { const d = Math.hypot(q.x - p.x, (q.y - p.y) * (r.height / r.width)); if (d < best) { best = d; drag = i; } });
    if (drag >= 0) preview.setPointerCapture(e.pointerId);
  });
  preview.addEventListener('pointermove', e => {
    if (drag < 0) return;
    const p = pointerPos(e);
    S.quad[drag] = { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
    invalidate(); drawPreview();
  });
  const endDrag = () => {
    if (drag >= 0 && S.mode === 'full') { S.clusters = null; autoTeams(); drawPreview(); }
    drag = -1;
  };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);

  // ---------- 컨트롤 ----------
  function chooseColor(name, sp) {
    S.want = sp; S.wantName = name;
    document.querySelectorAll('#chips-a .chip').forEach(c => c.classList.toggle('on', c.dataset.name === name));
    $('drop').classList.remove('locked');
    $('drop-title').textContent = `${name} 유니폼 팀을 분석합니다 — 영상 파일을 끌어다 놓거나 눌러서 선택`;
    showError('upload-error');
    if (S.samples.length) { autoTeams(); drawPreview(); }
  }
  function buildChips() {
    for (const [name, r, g, bl] of PRESETS) {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'chip'; c.dataset.name = name;
      c.innerHTML = `<i style="background:rgb(${r},${g},${bl})"></i>${name}`;
      c.onclick = () => chooseColor(name, vision.makeSpec(r, g, bl));
      $('chips-a').appendChild(c);
    }
  }
  function seg(id, key, after) {
    const box = $(id);
    const mark = () => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === S[key]));
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      S[key] = b.dataset.v; mark(); if (after) after();
    });
    mark();
    return mark;
  }
  const HINT = {
    partial: '화면에 경기장이 일부만 보여도, 선수 키(약 1.8m)와 경기장 규격(105×68m)의 비율로 실제 거리를 환산해 전체 경기장 위에 배치합니다. 카메라 이동은 자동으로 보정합니다.',
    full: '초록 사각형의 네 모서리를 경기장의 네 코너에 맞춰 주세요. 실제 경기장 좌표(105×68m)로 변환해 위치를 계산합니다.',
  };
  const markMode = seg('seg-mode', 'mode', () => { $('mode-hint').textContent = HINT[S.mode]; resetQuad(); S.clusters = null; autoTeams(); drawPreview(); });
  seg('seg-attack', 'attack', () => { invalidate(); drawPreview(); });
  $('mode-hint').textContent = HINT[S.mode];
  buildChips();
  let scrubBusy = false, scrubNext = null;
  $('scrub').addEventListener('input', async e => {
    scrubNext = (e.target.value / 1000) * S.duration;
    if (scrubBusy || S.busy) return;
    scrubBusy = true;
    while (scrubNext != null) { const t = scrubNext; scrubNext = null; await setPreviewTime(t); }
    scrubBusy = false;
  });

  // 업로드
  const drop = $('drop');
  const needColor = () => showError('upload-error', '먼저 1단계에서 분석할 팀의 유니폼 색을 선택해 주세요.');
  $('file').addEventListener('click', e => { if (!S.want) { e.preventDefault(); needColor(); } });
  const accept = f => {
    if (!f) return;
    if (!S.want) return needColor();
    if (!f.type.startsWith('video/')) return showError('upload-error', '영상 파일만 올릴 수 있습니다.');
    loadVideo(f, f.name);
  };
  $('file').addEventListener('change', e => { accept(e.target.files[0]); e.target.value = ''; }); // 같은 파일을 다시 골라도 반응하도록 비운다
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => accept(e.dataTransfer.files[0]));
  $('btn-sample').onclick = async () => {
    S.mode = 'full'; S.attack = 'right'; markMode(); $('mode-hint').textContent = HINT.full;
    document.querySelectorAll('#seg-attack button').forEach(b => b.classList.toggle('on', b.dataset.v === 'right'));
    const mp4 = video.canPlayType('video/mp4; codecs="avc1.42E01E"');
    $('file-info').textContent = '샘플 영상을 내려받는 중…';
    let blob;
    try {
      const r = await fetch(mp4 ? 'sample/demo.mp4' : 'sample/demo.webm');
      if (!r.ok) throw new Error(r.status);
      blob = await r.blob(); // blob 으로 열어야 서버 종류와 무관하게 프레임 탐색이 된다
    } catch (e) {
      $('file-info').textContent = '';
      return showError('upload-error', '샘플 영상을 불러오지 못했습니다. 웹 서버(http)로 접속했는지 확인해 주세요.');
    }
    chooseColor('빨간색', vision.makeSpec(224, 37, 37));
    await loadVideo(blob, '샘플 영상(합성 시뮬레이션)');
  };

  // ---------- 검출 실행 ----------
  function progress(frac, text) {
    $('progress').hidden = false;
    $('bar').style.width = Math.round(frac * 100) + '%';
    $('progress-text').textContent = text;
  }

  async function ensureDetection() {
    const key = JSON.stringify([S.specA, S.specB, S.mode, S.mode === 'full' ? S.quad : 0, S.attack === 'up' || S.attack === 'down']);
    if (S.det && S.detKey === key) return S.det;
    const N = Math.max(2, Math.floor(S.duration * FPS));
    const cfg = detectCfg(false);
    const frames = [], pan = [];
    let prevG = null, cx = 0, cy = 0;
    for (let i = 0; i < N; i++) {
      await seek((i + 0.5) / FPS);
      const img = grab();
      // 중앙선·센터서클 찾기는 계산이 무거워 두 프레임에 한 번만 한다 (사이 프레임은 분석 단계에서 이어 붙임)
      const r = vision.detect(img, i % 2 ? { ...cfg, findCenter: false } : cfg);
      frames.push({ A: r.A, B: r.B, balls: r.balls, top: r.pitchTop, bottom: r.pitchBottom, left: r.pitchLeft, right: r.pitchRight, mid: r.mid });
      const g = vision.toGray(img, 160, 90);
      if (prevG) { const s = vision.estimateShift(prevG, g, 160, 90); cx += s.x; cy += s.y; }
      pan.push({ x: cx, y: cy });
      prevG = g;
      if (i % 3 === 0) progress((i + 1) / N, `영상 프레임 분석 중 ${i + 1} / ${N}`);
    }
    S.det = { fps: FPS, frames, pan, W: proc.width, H: proc.height }; S.detKey = key; window.__lastDet = S.det;
    return S.det;
  }

  async function run(kind) {
    if (S.busy) return;
    showError('run-error');
    if (!S.specA) return showError('run-error', '영상에서 분석 대상 팀을 찾지 못했습니다. 1단계에서 유니폼 색을 다시 선택해 주세요.');
    S.busy = true;
    $('btn-formation').disabled = $('btn-movement').disabled = true;
    try {
      const det = await ensureDetection();
      progress(1, '패턴 계산 중…');
      const res = analysis.analyze(det, { quad: S.quad, attack: S.attack, mode: S.mode });
      window.__lastAnalysis = res;
      try { await document.fonts.load('700 62px "Space Grotesk"'); } catch (e) { /* 기본 글꼴로 진행 */ }
      if (kind === 'formation') showFormation(res); else showMovement(res);
      $('progress').hidden = true;
    } catch (e) {
      console.error(e);
      $('progress').hidden = true;
      showError('run-error', e.message || '분석 중 오류가 발생했습니다.');
    } finally {
      S.busy = false;
      $('btn-formation').disabled = $('btn-movement').disabled = false;
      await seek((($('scrub').value / 1000) * S.duration) || 0);
    }
  }
  $('btn-formation').onclick = () => run('formation');
  $('btn-movement').onclick = () => run('movement');

  // ---------- 결과 표시 ----------
  const teamLabel = () => `${colorName(S.specA)} 유니폼 팀`;
  window.__state = S;
  function quality(res) {
    const s = res.stats, notes = [];
    if (s.K < 10) notes.push(`화면에 꾸준히 잡힌 필드 플레이어 ${s.K}명 기준으로 계산했습니다.`);
    if (!res.full && res.scale) notes.push(res.scale.note);
    if (res.form.gkEstimated) notes.push('골키퍼는 유니폼 색이 달라 검출되지 않으므로 기본 위치에 점선 테두리로 표시했습니다.');
    return notes.join(' ');
  }

  function showFormation(res) {
    const c = document.createElement('canvas');
    board.renderFormation(c, res.form, 1);
    const url = c.toDataURL('image/png');
    $('formation-img').src = url; $('formation-dl').href = url;
    const s = res.stats;
    const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
    $('formation-stats').innerHTML =
      stat(res.form.label, `${teamLabel()} 평균 포메이션`) +
      stat(`${s.avgWidth.toFixed(1)}m`, '평균 좌우 폭') +
      stat(`${s.avgDepth.toFixed(1)}m`, '평균 앞뒤 길이') +
      stat(`${s.validFrames} / ${s.frames}`, '분석에 쓰인 프레임') +
      stat(s.avgA.toFixed(1), '프레임당 검출 선수(분석 팀)') +
      stat(`${Math.round(s.ballRate * 100)}%`, '공 추적 성공 프레임');
    $('formation-note').textContent = quality(res);
    $('sec-formation').hidden = false;
    $('sec-formation').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function stopAnims() {
    for (const k of Object.keys(S.anims)) { S.anims[k].destroy(); delete S.anims[k]; }
  }

  function patternList(box, items, sceneIds, anim, extra) {
    box.innerHTML = '';
    const cards = [];
    for (const it of items) {
      const scene = sceneIds.indexOf(it.id);
      const el = document.createElement(scene >= 0 ? 'button' : 'div');
      el.className = 'pat' + (scene >= 0 ? '' : ' static');
      el.innerHTML = `<h4>${it.label}<em>${it.meta}</em></h4><ul>${it.lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
      if (scene >= 0) { el.type = 'button'; el.onclick = () => anim.goto(scene); }
      box.appendChild(el);
      cards.push({ el, id: it.id });
    }
    for (const t of extra) {
      const el = document.createElement('div');
      el.className = 'pat static';
      el.innerHTML = `<h4>${t.title}</h4><ul>${t.lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
      box.appendChild(el);
    }
    return idx => cards.forEach(c => c.el.classList.toggle('on', c.id === sceneIds[idx]));
  }

  function showMovement(res) {
    stopAnims();
    const f = res.form, C = board.colors;
    const nums = f.nums, gk = f.gk;
    const empty = (box, canvas, msg) => {
      board.renderFormation(canvas, f, 1);
      box.innerHTML = `<div class="pat static"><h4>패턴을 계산하지 못했습니다</h4><ul><li>${msg}</li></ul></div>`;
    };
    $('movement-note').textContent = `${teamLabel()} 기준 · 영상 전체에서 같은 상황이 반복될 때마다의 위치를 평균해 패턴으로 묶었습니다. 카드를 누르면 해당 장면으로 이동합니다. ${quality(res)}`;

    // 공 기준
    const bp = res.ballP;
    if (bp.ok) {
      let mark = () => {};
      const anim = new board.Animator($('anim-ball'), bp.scenes, {
        title: 'BALL-DRIVEN SHIFT', big: f.label, nums, gk,
        legend: [{ color: C.home, text: `HOME · ${f.label}` }, { color: '#fff', text: 'BALL · 공 위치' }, { color: C.home, ring: true, dim: true, text: '점선 = 이전 위치' }],
      }, i => mark(i));
      S.anims.ball = anim;
      const extra = [];
      if (bp.transitions.length) extra.push({ title: '반복된 공 전개 경로', lines: bp.transitions.map(t => `${t.text} — ${t.count}회`) });
      if (bp.lag.length) extra.push({ title: '공 이동에 대한 반응 속도', lines: bp.lag });
      mark = patternList($('pat-ball'), bp.zones.map(z => ({
        id: z.id, label: `공이 ${z.label}에 있을 때`, lines: z.lines,
        meta: `${z.episodes}회 반복 · 전체의 ${Math.round(z.share * 100)}%`,
      })), bp.sceneZone, anim, extra);
      mark(0);
    } else empty($('pat-ball'), $('anim-ball'), bp.reason);

    // 상대 기준
    const op = res.oppP;
    if (op.ok) {
      let mark = () => {};
      const anim = new board.Animator($('anim-opp'), op.scenes, {
        title: 'OPPONENT-DRIVEN SHIFT', big: f.label, nums, gk,
        legend: [{ color: C.home, text: `HOME · ${f.label}` }, { color: C.away, text: 'AWAY · 상대 팀' }, { color: C.home, ring: true, dim: true, text: '점선 = 이전 위치' }],
      }, i => mark(i));
      S.anims.opp = anim;
      mark = patternList($('pat-opp'), op.states.map(z => ({
        id: z.id, label: z.label, lines: z.lines, meta: `${z.episodes}회 반복 · 평균 ${z.dur.toFixed(1)}초`,
      })), op.sceneState, anim, op.sync ? [{ title: '상대와의 간격 유지 성향', lines: [op.sync] }] : []);
      mark(0);
    } else empty($('pat-opp'), $('anim-opp'), op.reason);

    document.querySelectorAll('[data-toggle]').forEach(b => {
      const a = S.anims[b.dataset.toggle];
      b.hidden = !a; b.textContent = '일시정지';
      b.onclick = () => { b.textContent = a.toggle() ? '일시정지' : '재생'; };
    });
    $('sec-movement').hidden = false;
    $('sec-movement').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
