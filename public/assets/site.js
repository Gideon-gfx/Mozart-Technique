function buildAmbient() {
  const layer = document.createElement('div');
  layer.className = 'ambient-layer';
  layer.innerHTML = `
    <div class="orb" style="width:240px;height:240px;background:#ff3d4f;top:8%;left:4%;animation:floatA 12s ease-in-out infinite"></div>
    <div class="orb" style="width:320px;height:320px;background:#ff7f6a;bottom:8%;right:6%;animation:floatB 16s ease-in-out infinite"></div>
    <div class="orb" style="width:180px;height:180px;background:#ffffff;top:45%;right:20%;animation:floatC 10s ease-in-out infinite"></div>
  `;
  document.body.prepend(layer);
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatA { 0%,100%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(30px,-24px,0) scale(1.06)} }
    @keyframes floatB { 0%,100%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(-30px,24px,0) scale(1.08)} }
    @keyframes floatC { 0%,100%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(18px,16px,0) scale(1.04)} }
  `;
  document.head.appendChild(style);
}

function revealOnScroll() {
  const items = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  }, { threshold: 0.15 });
  items.forEach((item) => observer.observe(item));
}

function initSite() {
  buildAmbient();
  revealOnScroll();
}

document.addEventListener('DOMContentLoaded', initSite);
