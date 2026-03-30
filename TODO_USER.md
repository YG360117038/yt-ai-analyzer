# Kullanıcı Yapılacaklar

## GitHub Pages Deploy (webapp)

### 1. GitHub Repo'ya Push Et
```bash
git add -A
git commit -m "feat: webapp with guest demo mode"
git push origin master
```

### 2. GitHub Pages'i Etkinleştir
- Repo'ya git → **Settings** → **Pages**
- Source: **Deploy from a branch**
- Branch: `master` / `root`
- **Save** tıkla
- Birkaç dakika sonra site şu adreste canlı olur:
  `https://<github-kullanici-adin>.github.io/<repo-adi>/webapp/`

### 3. Supabase'e Redirect URL Ekle
- [supabase.com](https://supabase.com) → Projen → **Authentication** → **URL Configuration**
- **Redirect URLs** bölümüne şunu ekle:
  ```
  https://<github-kullanici-adin>.github.io/<repo-adi>/webapp/index.html
  ```
- **Save** tıkla

### 4. Landing Page URL'ini Güncelle (opsiyonel)
`landing/index.html` içindeki "Web Uygulamasını Aç" butonunun href'ini güncel GitHub Pages URL'iyle değiştir.

---

## Mevcut Servisler

| Servis | URL |
|--------|-----|
| Backend (Railway) | https://yt-ai-analyzer-production.up.railway.app |
| Supabase | https://sxlyfxqepyrjevfrjkwz.supabase.co |
| Webapp (GitHub Pages) | https://<github-adin>.github.io/<repo>/webapp/ |

---

## Webapp Özellikleri (tamamlandı)

- Giriş yapmadan direkt açılır (misafir modu)
- 1 demo analiz hakkı (localStorage ile takip)
- Demo bitti → login modal açılır
- Google OAuth ile giriş
- Free hesap → önizleme analizi (viral skor + öneriler)
- Pro hesap → tam analiz (30+ bölüm)
- Başlık CTR testi (ücretsiz)
- Thumbnail analizi (ücretsiz)
- Geçmiş (giriş gerektirir)
