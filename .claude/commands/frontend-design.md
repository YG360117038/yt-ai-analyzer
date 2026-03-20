# Frontend Design — Dion Youtube Analyzer

Sen bu projenin senior UI/UX mühendisisin. Aşağıdaki kurallar bu projeye özeldir.

## Design System

```css
--bg: #0f0f0f
--card: #1a1a1a
--card-border: #2a2a2a
--sidebar: #111111
--accent: #ff4444        /* kırmızı — ana CTA */
--purple: #7b68ee        /* mor — AI özellikler */
--green: #00c851         /* yeşil — başarı/skor */
--orange: #f59e0b        /* turuncu — uyarı */
--text: #f1f1f1
--text-dim: #aaaaaa
--text-muted: #666666
--radius: 12px           /* kartlar */
--radius-sm: 8px         /* butonlar, input */
```

## Font
Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif

## Animasyon
- Transition: `all 0.15s ease` (hover)
- Loading: `opacity 0.4s ease`
- Score counter: `0.6s ease-out` (sayı animasyonu)

## Kart Yapısı
```html
<div class="card">
  <div class="card-header">
    <span class="card-title">Başlık</span>
    <button class="copy-btn">Kopyala</button>
  </div>
  <div class="card-body">içerik</div>
</div>
```
- Uzun içerik (>400px): otomatik collapsible + "Devamını gör" butonu
- Gradient fade efekti ile kısalt

## Sidebar
- Genişlik: 240px
- Navbar item: 9px 12px padding, 8px radius
- Aktif: `background: rgba(255,68,68,0.1); color: #fff; border: 1px solid rgba(255,68,68,0.2)`
- Hover: `background: rgba(255,255,255,0.04)`
- Sekme emoji + metin formatı: "🔥 Viral Skor"

## Mevcut Sekmeler (sırasıyla)
1. 🔥 Viral Skor      → tab-viral
2. 🎬 Clone This Video → tab-clone   ← HERO sekme
3. 🏭 Content Factory  → tab-factory
4. 🎣 Yapı & Script    → tab-structure
5. 🎯 SEO & Başlık     → tab-seo
6. 📺 Kanal Analizi    → tab-channel  (display:none, sadece kanal analizinde göster)
7. 💰 Monetizasyon     → tab-monetize
8. 📁 Geçmiş           → tab-history

## Score Gauge (Viral Skor sekmesi)
- 4 büyük daire gauge: Viral / CTR / Retention / Growth
- Sayı animasyonu: 0'dan hedefe 0.6s
- Renk: >80 yeşil, 60-80 turuncu, <60 kırmızı

## Clone This Video Sekmesi (Hero)
- Büyük banner: "🎬 Bir sonraki videonuz hazır"
- new_video_idea: büyük, accent renkli kart
- full_hook: büyük font, tek tık kopyala butonu
- scene_plan: her sahne kartı — voiceover + AI prompt kopyala
- SEO tags: tıklanabilir chip'ler

## Kural: Chrome Extension CSP
- Inline script YOK (`<script>` tagı içinde JS yazma)
- `eval()` YOK
- Tüm JS ayrı `.js` dosyasında
- `onclick=""` attribute YOK — addEventListener kullan

## Kural: Vanilla JS
- Framework yok (React/Vue/etc)
- Build tool yok
- ES6+ syntax OK (arrow functions, template literals, async/await)
- `sanitizeHTML()` fonksiyonu XSS için her zaman kullan

## Dosya Yapısı
```
extension/src/
├── dashboard/
│   ├── index.html     ← CSS + HTML yapısı
│   └── dashboard.js   ← tüm JS mantığı
├── popup/
│   ├── index.html
│   └── index.js
├── background/index.js
├── content/scraper.js
├── lib/
│   ├── i18n.js        ← TR/EN çeviri sistemi
│   └── supabase.js    ← auth
└── config.js          ← BACKEND_URL, SUPABASE_URL
```

## Değişiklik Yaptıktan Sonra
chrome-store-upload/ klasörünü de güncelle:
```bash
cp extension/src/dashboard/dashboard.js chrome-store-upload/src/dashboard/dashboard.js
cp extension/src/dashboard/index.html chrome-store-upload/src/dashboard/index.html
```
