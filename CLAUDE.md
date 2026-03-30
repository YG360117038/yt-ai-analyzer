# Dion YouTube AI Analyzer — Proje Rehberi

## Proje Özeti
YouTube video analizi yapan AI aracı. Chrome uzantısı + web uygulaması + Railway backend.

## Servisler

| Servis | URL | Notlar |
|--------|-----|--------|
| Backend | https://yt-ai-analyzer-production.up.railway.app | Node.js/Express, Railway |
| Webapp | https://yg360117038.github.io/yt-ai-analyzer/webapp/ | GitHub Pages |
| Landing | https://yg360117038.github.io/yt-ai-analyzer/ | GitHub Pages, landing/ klasöründen serve |
| Supabase | https://sxlyfxqepyrjevfrjkwz.supabase.co | Auth + DB |

## Klasör Yapısı

```
├── backend/          Node.js/Express API (Railway'de)
│   └── src/
│       ├── index.js           Ana server, tüm route'lar
│       └── services/
│           ├── aiService.js   Gemini + Claude AI analiz
│           └── transcriptService.js
├── extension/        Chrome MV3 uzantısı
│   └── src/
│       ├── dashboard/         Ana panel (index.html + dashboard.js)
│       ├── popup/             Uzantı popup
│       └── background/
├── webapp/           Web uygulaması (GitHub Pages)
│   └── index.html             Tek sayfa SPA
├── landing/          Landing page (GitHub Pages root olarak serve ediliyor)
│   └── index.html
└── index.html        Root redirect → landing/
```

## Kullanıcı Planları & Özellikler

| Plan | Özellik |
|------|---------|
| **Misafir** | 1 demo analiz (preview), Başlık CTR (sınırsız), Thumbnail (sınırsız) |
| **Ücretsiz Hesap** | Sınırsız preview analiz, geçmiş, ücretsiz araçlar |
| **Pro (OmniCore)** | Tam analiz (30+ bölüm), Clone This Video, Senaryo, Content Factory |

## Backend Endpoint'leri

| Endpoint | Auth | Rate Limit | Açıklama |
|----------|------|-----------|----------|
| `POST /api/analyze-url` | JWT (Pro) | 10/dk | Tam video analizi |
| `POST /api/analyze-url-preview` | Yok | 3/saat/IP | Önizleme analizi |
| `POST /api/predict-title` | Yok | 8/dk | Başlık CTR tahmini |
| `POST /api/analyze-thumbnail` | Yok | 8/dk | Thumbnail analizi |
| `GET /api/check-plan` | Yok | 10/dk | Email → plan sorgula |
| `GET /api/user/profile` | JWT | - | Kullanıcı profil + plan |
| `GET /api/history` | JWT | - | Analiz geçmişi |

## Webapp Auth Akışı

- Sayfa açılır → `getSession()` kontrol
- Session varsa → `loadUser()` → plan badge güncellenir
- Session yoksa → `enterGuestMode()` (direkt app açık)
- Demo hakkı: `localStorage.dion_demo_used` (1 = kullanıldı)
- Giriş butonu → `#login-modal` açılır (full-page değil)
- OAuth callback → `onAuthStateChange SIGNED_IN` → modal kapanır

## AI Analiz Veri Yapısı (Gemini Çıktısı)

Preview endpoint bu alanları kullanır:
```js
analysis.viral_score.score        // 0-100
analysis.viral_score.why          // Açıklama
analysis.viral_patterns[]         // Güçlü yönler listesi
analysis.title_thumbnail.improved_titles[]  // Başlık önerileri
```

## GitHub Pages Yapılandırması

- **Source:** Branch `master`, folder `/ (root)`
- Landing page `landing/` altında → root `index.html` landing/'e redirect eder
- **ÖNEMLİ:** Supabase'e şu Redirect URL eklenmiş olmalı:
  `https://yg360117038.github.io/yt-ai-analyzer/webapp/index.html`

## Önemli Notlar

- `webapp/index.html` içinde `const API = 'https://...'` — backend URL hardcoded
- `const SUPABASE_URL` ve `SUPABASE_ANON_KEY` da hardcoded (public, güvenli)
- Extension'da `CONFIG.BACKEND_URL` kullanılıyor (`extension/src/dashboard/config.js`)
- Gemini response alanları: `viral_score` (NOT `viral_score_analysis`), `title_thumbnail` (NOT `seo_analysis`)

## Son Session Özeti (2026-03-31)

### Yapılanlar
1. **Webapp auth akışı** — Login full-page → modal'a dönüştürüldü
   - Sayfa direkt açılır, giriş zorunlu değil
   - `localStorage.dion_demo_used` ile 1 demo hakkı takibi
   - `openLoginModal()` / `closeLoginModal()` fonksiyonları
   - `onAuthStateChange SIGNED_IN` → modal otomatik kapanır

2. **Backend fix** — Preview endpoint yanlış alan adları kullanıyordu
   - YANLIŞ: `viral_score_analysis`, `seo_analysis`
   - DOĞRU: `viral_score`, `title_thumbnail`, `viral_patterns`

3. **Landing page** — Tam yeniden tasarım
   - Sora/Runway/Pika/video üretim özellikleri kaldırıldı
   - Gerçek özellikler: Viral Skor, Clone This Video, Başlık & Senaryo, SEO, Content Factory, Monetizasyon, Başlık Savaşı, İçerik Planı
   - 3 tier pricing: Misafir / Ücretsiz Hesap / Pro
   - Kurumsal tasarım, URL analiz widget

4. **GitHub Pages** — Root `index.html` → `landing/` redirect
   - Source: master / root (ZORUNLU — landing/ yaparsa webapp 404 verir)
   - Landing: `https://yg360117038.github.io/yt-ai-analyzer/`
   - Webapp: `https://yg360117038.github.io/yt-ai-analyzer/webapp/`

5. **Webapp Pro analiz render** — Extension dashboard ile aynı bölümler
   - 4 skor (Viral/CTR/Retention/Büyüme) + progress bar
   - Hook Analizi, Viral Kalıplar, Başlık Önerileri (kopyala butonu)
   - SEO Etiketleri (tümünü kopyala), Clone This Video (hook kopyala)
   - Video Yapısı, Content Factory, Senaryo Şablonu, Monetizasyon

### Bekleyen Görevler
- [ ] Supabase Redirect URL ekle: `https://yg360117038.github.io/yt-ai-analyzer/webapp/index.html`
- [ ] GitHub Pages source: master / root (eğer değiştirilmediyse)
- [ ] Pro analiz render'ı gerçek veriyle test et

### Son Commit'ler
```
27413a0 feat: webapp full analysis render — all sections like extension dashboard
e7e012d docs: add CLAUDE.md
ae26204 feat: landing page full redesign
25b82c4 chore: root redirect for GitHub Pages
bf0f5ea fix: preview endpoint field names
c0e175f feat: webapp guest mode + demo tracking + login modal
```
