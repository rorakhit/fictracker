// LandingPage — shown to unauthenticated visitors before the login form.
// Uses inline styles so it's self-contained and doesn't fight the app's
// CSS. Fraunces/Inter come in from the global font link in index.html.

const S = {
  page: {
    minHeight: '100vh',
    background: '#171520',
    color: '#e8e4df',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    WebkitFontSmoothing: 'antialiased',
  },
  container: { maxWidth: 900, margin: '0 auto', padding: '0 24px' },

  // Nav
  nav: { padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  navInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navLogo: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 },
  navLinks: { display: 'flex', gap: 20, alignItems: 'center' },
  navLink: { color: '#9590a0', fontSize: 14, fontWeight: 500, textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none' },
  btnNav: { background: '#e0a872', color: '#171520', padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer' },

  // Hero
  hero: { textAlign: 'center', padding: '80px 0 60px' },
  heroH1: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.15, marginBottom: 16 },
  accent: { color: '#e0a872' },
  subtitle: { fontSize: 18, color: '#9590a0', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.6 },
  heroCtas: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  btnPrimary: { background: '#e0a872', color: '#171520', padding: '14px 32px', borderRadius: 10, fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' },
  btnSecondary: { background: 'transparent', color: '#8b9dc4', padding: '14px 32px', borderRadius: 10, fontWeight: 600, fontSize: 16, border: '1px solid #8b9dc4', cursor: 'pointer' },

  // Sections
  section: { padding: '60px 0', borderTop: '1px solid rgba(255,255,255,0.08)' },
  sectionH2: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 28, textAlign: 'center', marginBottom: 40 },
  sectionSub: { textAlign: 'center', color: '#9590a0', fontSize: 16, maxWidth: 520, margin: '0 auto 36px' },

  // Feature grid
  featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 },
  featureCard: { background: '#1e1b2a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 },
  featureIcon: { fontSize: 28, marginBottom: 12, display: 'block' },
  featureH3: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, fontWeight: 600, marginBottom: 8, color: '#e0a872' },
  featureP: { fontSize: 14, color: '#9590a0', lineHeight: 1.6, margin: 0 },

  // Extension
  extGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 },
  extItem: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  extDot: { width: 8, height: 8, borderRadius: '50%', background: '#d4a0b0', marginTop: 8, flexShrink: 0 },
  extP: { fontSize: 14, color: '#9590a0', margin: 0 },
  extCtas: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  btnChromeExt: { background: '#e0a872', color: '#171520', padding: '12px 24px', borderRadius: 10, fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  btnFirefoxExt: { background: 'transparent', color: '#8b9dc4', padding: '12px 24px', borderRadius: 10, fontWeight: 600, fontSize: 15, border: '1px solid #8b9dc4', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },

  // Pricing
  pricingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, maxWidth: 640, margin: '0 auto' },
  priceCard: { background: '#1e1b2a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 28, textAlign: 'center', position: 'relative' },
  priceCardFeatured: { borderColor: '#e0a872' },
  priceBadge: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#e0a872', color: '#171520', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  priceTier: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 700, marginBottom: 4 },
  priceAmount: { fontSize: 32, fontWeight: 700, color: '#e0a872', marginBottom: 4 },
  priceNote: { fontSize: 13, color: '#9590a0', marginBottom: 20 },
  priceList: { listStyle: 'none', textAlign: 'left', fontSize: 14, padding: 0 },
  priceItem: { padding: '6px 0', color: '#9590a0', display: 'flex', gap: 8, alignItems: 'flex-start' },
  checkmark: { color: '#c4b470', fontWeight: 700, flexShrink: 0 },

  // Footer
  footer: { padding: '40px 0', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' },
  footerLinks: { display: 'flex', gap: 24, justifyContent: 'center', marginBottom: 12 },
  footerLink: { fontSize: 13, color: '#8b9dc4', textDecoration: 'none' },
  footerP: { fontSize: 13, color: '#9590a0', margin: 0 },
};

const features = [
  { icon: '📥', title: 'Import your library', desc: 'Sync your public AO3 bookmarks with one click, or use a bookmarklet to import reading history. EPUB import too. All your fics, all your metadata.' },
  { icon: '📖', title: 'Track everything', desc: 'Status, chapter progress, personal ratings, notes. Your library shuffles on every visit so buried bookmarks surface naturally.' },
  { icon: '📚', title: 'Bookshelves', desc: 'Curate named shelves by hand ("Comfort reads", "For the long flight") or save a filter as a smart shelf that restores your exact view with one click.' },
  { icon: '🔔', title: 'WIP alerts', desc: 'FicTracker checks your incomplete works for new chapters and shows per-fic banners right in your library. No email noise.' },
  { icon: '✨', title: 'Smart Picks', desc: 'Rate a few fics and Smart Picks generates targeted AO3 searches based on your taste — including fandoms you\'ve never explored. Every result is a real fic from a real author.' },
  { icon: '🎁', title: 'Reading Wrapped', desc: 'Monthly and yearly summaries — words, chapters, top fandom, longest fic. Rendered as shareable image cards you can export and post.' },
];

const extFeatures = [
  'Add any fic to your library with one click',
  'Auto-detects which chapter you\'re reading',
  'Chapter +/– controls with auto-complete',
  'Three panel modes: full, mini, or hidden',
  'Silently syncs progress as you read',
  'Deep-links back to your current chapter',
];

const freeFeatures = [
  'Import bookmarks & reading history',
  'Quick Add & Chapter Sync bookmarklets',
  'Chrome & Firefox extension',
  'Search, filter, sort',
  'Status & chapter tracking',
  'WIP update alerts',
  '3 bookshelves (manual + smart)',
];

const plusFeatures = [
  'Unlimited fics',
  'Unlimited bookshelves',
  'Stats & analytics dashboard',
  'Reading Wrapped',
  'Smart Picks (taste-based rec searches)',
  'EPUB import',
  'Everything in Free',
];

export default function LandingPage({ onGetStarted }) {
  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <div style={{ ...S.container, ...S.navInner }}>
          <div style={S.navLogo}>
            <img src="/logo.svg" alt="" style={{ height: 80, width: 80 }} />
            <span style={{ color: '#d4a0b0' }}>Fic</span><span>Tracker</span>
          </div>
          <div style={S.navLinks}>
            <a href="#features" style={S.navLink}>Features</a>
            <a href="#extension" style={S.navLink}>Extension</a>
            <a href="#pricing" style={S.navLink}>Pricing</a>
            <button style={S.btnNav} onClick={onGetStarted}>Sign in</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={S.hero}>
        <div style={S.container}>
          <h1 style={S.heroH1}>
            Your reading nook,{' '}
            <span style={S.accent}>organized.</span>
          </h1>
          <p style={S.subtitle}>
            A personal reading tracker for AO3 fans. Import your bookmarks, track your progress, and discover your next favorite fic.
          </p>
          <div style={S.heroCtas}>
            <button style={S.btnPrimary} onClick={onGetStarted}>
              Start tracking — it's free
            </button>
            <a href="#extension" style={S.btnSecondary}>Get the extension</a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={S.section} id="features">
        <div style={S.container}>
          <h2 style={S.sectionH2}>Everything your AO3 bookmarks can't do</h2>
          <div style={S.featureGrid}>
            {features.map(f => (
              <div key={f.title} style={S.featureCard}>
                <span style={S.featureIcon}>{f.icon}</span>
                <h3 style={S.featureH3}>{f.title}</h3>
                <p style={S.featureP}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Extension */}
      <section style={S.section} id="extension">
        <div style={S.container}>
          <h2 style={S.sectionH2}>Browser extension</h2>
          <p style={S.sectionSub}>
            Track your reading without ever leaving AO3. The FicTracker panel lives on every work page — Chrome, Firefox, and Firefox for Android.
          </p>
          <div style={S.extGrid}>
            {extFeatures.map(f => (
              <div key={f} style={S.extItem}>
                <div style={S.extDot} />
                <p style={S.extP}>{f}</p>
              </div>
            ))}
          </div>
          <div style={S.extCtas}>
            <a
              href="https://chromewebstore.google.com/detail/fictracker/phfdhkgaagelchgejhhpelhcmebomdim"
              target="_blank"
              rel="noopener noreferrer"
              style={S.btnChromeExt}
            >
              🧩 Add to Chrome
            </a>
            <a
              href="https://addons.mozilla.org/en-US/firefox/addon/fictracker/"
              target="_blank"
              rel="noopener noreferrer"
              style={S.btnFirefoxExt}
            >
              🦊 Add to Firefox
            </a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={S.section} id="pricing">
        <div style={S.container}>
          <h2 style={S.sectionH2}>Simple pricing</h2>
          <div style={S.pricingGrid}>
            <div style={S.priceCard}>
              <div style={S.priceTier}>Free</div>
              <div style={S.priceAmount}>$0</div>
              <div style={S.priceNote}>Up to 50 fics</div>
              <ul style={S.priceList}>
                {freeFeatures.map(f => (
                  <li key={f} style={S.priceItem}>
                    <span style={S.checkmark}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ ...S.priceCard, ...S.priceCardFeatured }}>
              <div style={S.priceBadge}>Best value</div>
              <div style={S.priceTier}>Plus</div>
              <div style={S.priceAmount}>$4<span style={{ fontSize: 16, fontWeight: 400, color: '#9590a0' }}>/month</span></div>
              <div style={S.priceNote}>or $36/year (save 25%)</div>
              <ul style={S.priceList}>
                {plusFeatures.map(f => (
                  <li key={f} style={S.priceItem}>
                    <span style={S.checkmark}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={S.footer}>
        <div style={S.container}>
          <div style={S.footerLinks}>
            <button style={{ ...S.footerLink, background: 'none', border: 'none', cursor: 'pointer' }} onClick={onGetStarted}>Open App</button>
            <a href="/privacy.html" style={S.footerLink}>Privacy Policy</a>
            <a href="mailto:hello@fictracker.app" style={S.footerLink}>Contact</a>
          </div>
          <p style={S.footerP}>Built by a fanfic reader, for fanfic readers.</p>
        </div>
      </footer>
    </div>
  );
}
