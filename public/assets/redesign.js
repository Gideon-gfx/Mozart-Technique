// Simple interactive parallax for hero orbs and small hover micro-interactions
// Parallax orbs + reveal on scroll
(() => {
  // reveal on scroll
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); });
  }, { threshold: 0.12 });
  revealEls.forEach((el) => io.observe(el));

  // hero parallax if present
  const hero = document.querySelector('.rt-hero');
  if (!hero) return;
  const orbs = Array.from(hero.querySelectorAll('.orb'));
  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width - 0.5;
    const my = (e.clientY - rect.top) / rect.height - 0.5;
    orbs.forEach((orb, i) => {
      const depth = (i + 1) * 6;
      orb.style.transform = `translate3d(${mx * depth}px, ${my * depth}px, 0) rotate(${mx * depth * 0.8}deg)`;
    });
  });
  hero.addEventListener('mouseleave', () => orbs.forEach(o => o.style.transform = 'translate3d(0,0,0)'));

  // subtle floating for orbs
  orbs.forEach((o, i) => { o.style.animation = `float${(i%3)+1} ${6 + i}s ease-in-out infinite`; });
})();

/* extra keyframes injected for older browsers fallback */
try { const s = document.createElement('style'); s.textContent = `@keyframes float1{0%{transform:translateY(0)}50%{transform:translateY(-12px)}100%{transform:translateY(0)}}@keyframes float2{0%{transform:translateY(0)}50%{transform:translateY(-20px)}100%{transform:translateY(0)}}@keyframes float3{0%{transform:translateY(0)}50%{transform:translateY(-8px)}100%{transform:translateY(0)}}`; document.head.appendChild(s);} catch(e) {}
