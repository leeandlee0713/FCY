/* 전술 보드 렌더러 — 첨부 디자인(네이비 배경, 민트 라인, 시안 선수 마커) 기준 */
(function () {
  'use strict';
  const FCY = (window.FCY = window.FCY || {});

  const BW = 1080, BH = 1580;
  const PITCH = { x: 133, y: 222, w: 814, h: 1257 }; // 68 x 105 m
  const C = {
    bg0: '#070b16', bg1: '#03050c', pitch: '#0b1320', stripe: '#0e1826',
    line: '#62d6a8', home: '#22e1ff', homeText: '#062230', away: '#ff5d8f',
    ball: '#ffffff', text: '#f3f6fb', dim: '#8f9bb3',
  };
  const FONT = '"Space Grotesk", "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

  const sx = X => PITCH.x + (X / 68) * PITCH.w;
  const sy = Y => PITCH.y + (1 - Y / 105) * PITCH.h; // Y=0 이 자기 골대(아래)
  const M = PITCH.w / 68;
  const clampP = p => ({ x: Math.max(1.2, Math.min(66.8, p.x)), y: Math.max(1.5, Math.min(103.5, p.y)) });

  function setup(canvas, scale) {
    const s = scale || 1;
    canvas.width = BW * s; canvas.height = BH * s;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(s, 0, 0, s, 0, 0);
    return ctx;
  }

  function drawPitch(ctx) {
    const g = ctx.createRadialGradient(BW / 2, BH * 0.45, 100, BW / 2, BH * 0.45, BH * 0.75);
    g.addColorStop(0, C.bg0); g.addColorStop(1, C.bg1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, BW, BH);

    const { x, y, w, h } = PITCH;
    ctx.fillStyle = C.pitch; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.stripe;
    for (let i = 0; i < 12; i += 2) ctx.fillRect(x, y + (h / 12) * i, w, h / 12);

    ctx.save();
    ctx.strokeStyle = C.line; ctx.lineWidth = 2.2; ctx.lineJoin = 'miter';
    ctx.shadowColor = 'rgba(98,214,168,.55)'; ctx.shadowBlur = 9;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(x, sy(52.5)); ctx.lineTo(x + w, sy(52.5)); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx(34), sy(52.5), 9.15 * M, 0, Math.PI * 2); ctx.stroke();
    for (const end of [0, 1]) {
      const Y = v => sy(end ? 105 - v : v);
      ctx.strokeRect(sx(34 - 20.16), Math.min(Y(0), Y(16.5)), 40.32 * M, 16.5 * M);
      ctx.strokeRect(sx(34 - 9.16), Math.min(Y(0), Y(5.5)), 18.32 * M, 5.5 * M);
      ctx.strokeRect(sx(34 - 3.66), end ? Y(0) - 2.2 * M : Y(0), 7.32 * M, 2.2 * M);
      // 페널티 아크
      const a = Math.acos(5.5 / 9.15);
      ctx.beginPath();
      if (end) ctx.arc(sx(34), Y(11), 9.15 * M, Math.PI / 2 - a, Math.PI / 2 + a);
      else ctx.arc(sx(34), Y(11), 9.15 * M, -Math.PI / 2 - a, -Math.PI / 2 + a);
      ctx.stroke();
      // 코너 아크
      for (const cx of [0, 68]) {
        ctx.beginPath();
        const st = end ? (cx ? Math.PI / 2 : 0) : (cx ? Math.PI : -Math.PI / 2);
        ctx.arc(sx(cx), Y(0), 1.2 * M, st, st + Math.PI / 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = C.line;
    for (const p of [[34, 52.5, 4.5], [34, 11, 3.5], [34, 94, 3.5]]) {
      ctx.beginPath(); ctx.arc(sx(p[0]), sy(p[1]), p[2], 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawHeader(ctx, o) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.dim; ctx.font = `500 19px ${FONT}`;
    spaced(ctx, o.title || 'TACTICAL BOARD', PITCH.x, 82, 4.5);
    ctx.fillStyle = C.text; ctx.font = `700 ${o.bigSize || 62}px ${FONT}`;
    ctx.fillText(o.big || '', PITCH.x - 2, 150);

    const leg = o.legend || [];
    let ly = 118;
    ctx.font = `600 19px ${FONT}`;
    let maxW = 0;
    for (const l of leg) maxW = Math.max(maxW, spacedWidth(ctx, l.text, 1.6));
    const lx = PITCH.x + PITCH.w - maxW;
    for (const l of leg) {
      ctx.save();
      if (l.ring) {
        ctx.strokeStyle = l.color; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(lx - 22, ly - 7, 7.5, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = l.color; ctx.shadowColor = l.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(lx - 22, ly - 7, 8.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = l.dim ? C.dim : C.text;
      spaced(ctx, l.text, lx, ly, 1.6);
      ly += 36;
    }
    ctx.fillStyle = C.dim; ctx.font = `500 17px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(o.footer || '↑ 공격 방향', BW / 2, PITCH.y + PITCH.h + 52);
    ctx.textAlign = 'left';
  }

  function spacedWidth(ctx, text, sp) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + sp;
    return w - sp;
  }
  function spaced(ctx, text, x, y, sp) {
    for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + sp; }
  }

  function drawPlayer(ctx, p, o) {
    const q = clampP(p), x = sx(q.x), y = sy(q.y);
    const away = o.team === 'away';
    const r = o.r || (away ? 16 : 22);
    const col = away ? C.away : C.home;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.ghost) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.shadowColor = col; ctx.shadowBlur = 18;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (o.gk) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      if (o.estimated) ctx.setLineDash([6, 4]);
      ctx.stroke();
    }
    if (o.num != null) {
      ctx.fillStyle = C.homeText; ctx.font = `700 ${r * 0.86}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(o.num), x, y + 1.5);
    }
    ctx.restore();
  }

  function drawArrow(ctx, a, b, color, alpha, head) {
    const p = clampP(a), q = clampP(b);
    const x0 = sx(p.x), y0 = sy(p.y), x1 = sx(q.x), y1 = sy(q.y);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 10) return;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * 8, y1 - uy * 8); ctx.stroke();
    if (head) {
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ux * 13 - uy * 6, y1 - uy * 13 + ux * 6);
      ctx.lineTo(x1 - ux * 13 + uy * 6, y1 - uy * 13 - ux * 6);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(ctx, b, trail) {
    ctx.save();
    if (trail && trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = clampP(trail[i - 1]), c = clampP(trail[i]);
        ctx.globalAlpha = (i / trail.length) * 0.5;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(c.x), sy(c.y)); ctx.stroke();
      }
    }
    const q = clampP(b);
    ctx.globalAlpha = 1; ctx.fillStyle = C.ball; ctx.shadowColor = '#fff'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(sx(q.x), sy(q.y), 9, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(6,34,48,.9)'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawTag(ctx, text, sub) {
    if (!text) return;
    ctx.save();
    const fit = (t, size, weight) => {
      // 경기장 폭을 넘지 않도록 글자 크기를 줄인다
      for (; size > 16; size -= 1) { ctx.font = `${weight} ${size}px ${FONT}`; if (ctx.measureText(t).width <= PITCH.w - 72) break; }
      return [ctx.font, ctx.measureText(t).width];
    };
    const [f1, w1] = fit(text, 32, 700);
    const [f2, w2] = sub ? fit(sub, 25, 500) : ['', 0];
    const w = Math.max(w1, w2) + 40, h = sub ? 96 : 58;
    const x = PITCH.x + 16, y = PITCH.y + 16;
    ctx.fillStyle = 'rgba(5,9,18,.86)'; ctx.strokeStyle = 'rgba(34,225,255,.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = f1; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x + 20, y + 40);
    if (sub) { ctx.fillStyle = '#c5cee0'; ctx.font = f2; ctx.fillText(sub, x + 20, y + 76); }
    ctx.restore();
  }

  /** 평균 포메이션 한 장 그리기 */
  function renderFormation(canvas, f, scale, title) {
    const ctx = setup(canvas, scale);
    drawPitch(ctx);
    drawHeader(ctx, {
      title, big: f.label,
      legend: [
        { color: C.home, text: `HOME · ${f.label}` },
        { color: '#fff', ring: true, dim: true, text: f.gkEstimated ? '흰 테두리 = GK (추정 위치)' : '흰 테두리 = GK' },
      ],
    });
    for (const p of f.players) drawPlayer(ctx, p, { num: p.num, gk: p.gk, estimated: p.estimated });
  }

  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  /**
   * 장면 애니메이터. scenes: [{from:{home,away,ball}, to:{...}, tag, sub, move, hold}]
   * meta: {title, big, legend, nums, gk}
   */
  function Animator(canvas, scenes, meta, onScene) {
    let idx = 0, t0 = performance.now(), playing = true, raf = 0, paused = 0;
    const ctx = setup(canvas, 1);

    function frame(now) {
      raf = 0;
      if (!scenes.length) return;
      let sc = scenes[idx];
      let el = (playing ? now : paused) - t0;
      const total = sc.move + sc.hold;
      if (el >= total) {
        idx = (idx + 1) % scenes.length; t0 = now; el = 0; sc = scenes[idx];
        if (onScene) onScene(idx);
      }
      const k = ease(Math.min(1, el / sc.move));
      drawPitch(ctx);
      drawHeader(ctx, meta);
      const F = sc.from, T = sc.to;
      // 이동 화살표 + 출발 위치 고스트
      for (let i = 0; i < T.home.length; i++) {
        drawArrow(ctx, F.home[i], lerp(F.home[i], T.home[i], k), C.home, 0.55);
        drawPlayer(ctx, F.home[i], { ghost: true, alpha: 0.5 });
      }
      if (T.away) for (let i = 0; i < T.away.length; i++) {
        drawArrow(ctx, F.away[i], lerp(F.away[i], T.away[i], k), C.away, 0.5);
        drawPlayer(ctx, F.away[i], { ghost: true, team: 'away', alpha: 0.45 });
      }
      if (T.away) for (let i = 0; i < T.away.length; i++) drawPlayer(ctx, lerp(F.away[i], T.away[i], k), { team: 'away' });
      for (let i = 0; i < T.home.length; i++) {
        drawPlayer(ctx, lerp(F.home[i], T.home[i], k), { num: meta.nums[i], gk: meta.gk === i });
      }
      if (T.ball && F.ball) {
        const trail = [];
        for (let j = 0; j <= 10; j++) trail.push(lerp(F.ball, T.ball, k * (j / 10)));
        drawBall(ctx, lerp(F.ball, T.ball, k), trail);
      }
      drawTag(ctx, sc.tag, sc.sub);
      if (playing) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    this.play = () => { if (!playing) { t0 += performance.now() - paused; playing = true; } kick(); };
    this.pause = () => { if (playing) { paused = performance.now(); playing = false; } };
    this.toggle = () => { playing ? this.pause() : this.play(); return playing; };
    this.goto = i => { idx = i % scenes.length; t0 = performance.now(); paused = t0; if (onScene) onScene(idx); kick(); };
    this.destroy = () => { playing = false; if (raf) cancelAnimationFrame(raf); };
    this.index = () => idx;
    if (onScene) onScene(0);
    kick();
  }

  FCY.board = { renderFormation, Animator, colors: C, BW, BH };
})();
