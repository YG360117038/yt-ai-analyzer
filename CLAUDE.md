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

## Son Yapılan İşler

- Webapp: Giriş yapmadan açılır, 1 demo hakkı (localStorage), login modal
- Landing: Kurumsal yeniden tasarım — eski video üretim özellikleri kaldırıldı
- Backend: Preview endpoint alan adları düzeltildi (`viral_score`, `title_thumbnail`)
- Root `index.html` → `landing/` redirect (GitHub Pages uyumluluğu)
