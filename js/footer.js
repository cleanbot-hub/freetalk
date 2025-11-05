// /public/js/footer.js
// Freetalk Global Footer (dark/light auto via CSS vars)
// by 상준(stream_in)

(() => {
  if (document.getElementById('ft-global-footer')) return; // 중복 방지

  // 옵션 오버라이드: 페이지 어디서든 window.FT_FOOTER = {...}로 바꿀 수 있음
  const opt = Object.assign({
    brand: 'Freetalk',
    developer: '네이버:stream_in|인스타:sj.exe',
    right: () => `© ${new Date().getFullYear()} Freetalk`,
    stack: ['Firebase', 'HTML5', 'Vanilla JS', 'CSS3', 'PWA'],
    hosting: 'Firebase Hosting',
    realtime: ['Firestore', 'Realtime DB'],
    links: [
      // { label: 'Blog', href: 'https://...' },
      // { label: 'GitHub', href: 'https://...' },
      // { label: 'Contact', href: 'mailto:...' }
    ]
  }, (window.FT_FOOTER||{}));

  const el = document.createElement('footer');
  el.id = 'ft-global-footer';
  el.setAttribute('role','contentinfo');
  el.innerHTML = `
    <div class="ft-wrap">
      <div class="ft-line">
        <span class="ft-right">${opt.right()}</span>
        <span class="ft-sep">·</span>
        <span class="ft-dev">Developed by <b>${opt.developer}</b></span>
      </div>
      <div class="ft-line">
        <span class="ft-built">Built with <b>${opt.stack.join(' · ')}</b></span>
      </div>
      <div class="ft-line ft-dim">
        <span>Hosted on <b>${opt.hosting}</b></span>
        <span class="ft-sep">·</span>
        <span>Realtime by <b>${opt.realtime.join(' &amp; ')}</b></span>
      </div>
      ${Array.isArray(opt.links) && opt.links.length ? `
      <nav class="ft-links" aria-label="푸터 링크">
        ${opt.links.map(l=>`<a class="ft-link" href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`).join('')}
      </nav>` : ''}
    </div>
  `.trim();

  // 스타일 1회 삽입
  if (!document.getElementById('ft-style')) {
    const css = document.createElement('style');
    css.id = 'ft-style';
    css.textContent = `
:root {
  /* 폴백 팔레트 (페이지 변수 우선 사용) */
  --ft-border: var(--bd, var(--border, #e5e7eb));
  --ft-ink:    var(--ink, #e5e7eb);
  --ft-muted:  var(--muted, #6b7280);
}
#ft-global-footer {
  margin-top: 40px;
  border-top: 1px solid var(--ft-border);
  color: var(--ft-muted);
  font: 13px/1.7 system-ui, -apple-system, Segoe UI, Inter, Roboto, Helvetica, Arial, "Malgun Gothic", sans-serif;
}
#ft-global-footer .ft-wrap {
  max-width: var(--max, 1280px);
  margin: 0 auto;
  padding: 16px;
}
#ft-global-footer .ft-line { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
#ft-global-footer .ft-sep { opacity: .6 }
#ft-global-footer b { color: var(--ft-ink); font-weight: 600 }
#ft-global-footer .ft-dim { opacity: .9 }
#ft-global-footer .ft-links { margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap; }
#ft-global-footer .ft-link {
  text-decoration: none; border: 1px solid var(--ft-border); padding: 6px 10px; border-radius: 10px;
  color: var(--ft-ink); background: transparent;
}
#ft-global-footer .ft-link:hover { filter: brightness(1.05) }
@media (max-width: 640px){
  #ft-global-footer .ft-wrap { padding: 14px }
}
    `.trim();
    document.head.appendChild(css);
  }

  // 본문에 부착
  document.body.appendChild(el);
})();
