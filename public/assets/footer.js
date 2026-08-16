// Shared site footer, injected on every page. Self-contained (its own
// scoped styles) so it renders identically whether the page loads
// Tailwind, site.css, both, or neither.
document.addEventListener('DOMContentLoaded', function () {
  const STYLE_ID = 'mt-footer-style';

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mt-footer {
        background: linear-gradient(135deg, #ffffff 0%, #fff6f6 100%);
        color: #333333;
        padding: 3rem 1.25rem 1.5rem;
        border-top: 2px solid #cc0000;
        font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      .mt-footer-shell {
        max-width: 1180px;
        margin: 0 auto;
        display: grid;
        gap: 1.5rem;
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }
      .mt-footer h4 {
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
        margin: 0 0 .85rem;
        color: #cc0000;
      }
      .mt-footer p, .mt-footer li { font-size: .95rem; color: #555555; margin: 0; }
      .mt-footer ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .55rem; }
      .mt-footer a { color: #555555; text-decoration: none; transition: color .2s ease; }
      .mt-footer a:hover { color: #cc0000; }
      .mt-footer-social { display: flex; gap: .75rem; flex-wrap: wrap; }
      .mt-footer-social a {
        width: 2.5rem; height: 2.5rem; border-radius: 999px;
        display: grid; place-items: center;
        background: rgba(204, 0, 0, .08); color: #cc0000;
        transition: transform .2s ease, background .2s ease;
      }
      .mt-footer-social a:hover { transform: translateY(-2px); background: #cc0000; color: white; }
      .mt-footer-newsletter { display: flex; }
      .mt-footer-newsletter input {
        background: #fff; color: #333; border: 1px solid rgba(204,0,0,.25);
        padding: .5rem .75rem; border-radius: .375rem 0 0 .375rem; flex: 1; min-width: 0;
      }
      .mt-footer-newsletter input::placeholder { color: #888888; }
      .mt-footer-newsletter button {
        background: #cc0000; color: #fff; border: none; padding: .5rem 1rem;
        border-radius: 0 .375rem .375rem 0; font-weight: 600; cursor: pointer;
      }
      .mt-footer-newsletter button:hover { background: #990000; }
      .mt-footer-bottom {
        max-width: 1180px; margin: 1.6rem auto 0; padding-top: 1rem;
        border-top: 1px solid rgba(204,0,0,.2); text-align: center;
        font-size: .95rem; color: #555555;
      }
      @media (max-width: 1024px) { .mt-footer-shell { grid-template-columns: repeat(3, minmax(0,1fr)); } }
      @media (max-width: 700px) { .mt-footer-shell { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      @media (max-width: 460px) { .mt-footer-shell { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  const footer = document.createElement('footer');
  footer.className = 'mt-footer';
  footer.innerHTML = `
    <div class="mt-footer-shell">
      <div>
        <h4>Mozart Techniques</h4>
        <p>Unlock your creative potential and master your chosen craft.</p>
      </div>
      <div>
        <h4>Quick Links</h4>
        <ul>
          <li><a href="/home">Home</a></li>
          <li><a href="/library">Video Library</a></li>
          <li><a href="/about">About</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
      <div>
        <h4>Legal</h4>
        <ul>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
          <li><a href="/terms-of-service">Terms of Service</a></li>
        </ul>
      </div>
      <div>
        <h4>Teach &amp; Learn</h4>
        <ul>
          <li><a href="/become-tutor">Become a Tutor</a></li>
          <li><a href="/find-tutor">Find a Tutor</a></li>
          <li><a href="/become-sponsor">Sponsor Students</a></li>
        </ul>
      </div>
      <div>
        <h4>Follow Us</h4>
        <div class="mt-footer-social">
          <a href="#" aria-label="Facebook"><i class="fab fa-facebook-f"></i></a>
          <a href="#" aria-label="Twitter"><i class="fab fa-twitter"></i></a>
          <a href="#" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
          <a href="#" aria-label="LinkedIn"><i class="fab fa-linkedin-in"></i></a>
        </div>
      </div>
      <div>
        <h4>Newsletter</h4>
        <form class="mt-footer-newsletter" onsubmit="return false;">
          <input type="email" placeholder="Your Email">
          <button type="submit">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="mt-footer-bottom">&copy; 2026 Mozart Techniques. All Rights Reserved.</div>
  `;

  document.body.appendChild(footer);
});
