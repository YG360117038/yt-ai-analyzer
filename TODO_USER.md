# 🛠️ Kullanıcı Yapılacaklar Listesi (TODO)

Bu dosya, YouTube AI Prompt Analyzer projesini çalıştırmak için senin (kullanıcının) manuel olarak yapman gereken adımları içerir.

### 1. API Anahtarlarını Hazırla
Aşağıdaki platformlardan hesap aç ve API anahtarlarını al:
- **Gemini:** [aistudio.google.com](https://aistudio.google.com/) adresinden  PORT=3000
  GEMINI_API_KEY=your_gemini_key
  SUPABASE_URL=https://sxlyfxqepyrjevfrjkwz.supabase.co
m/) üzerinden yeni bir proje oluştur. 
    - `Project URL` ve `anon public key` değerlerini al.
    - Auth ayarlarından Google Provider'ı aktif et (opsiyonel ama önerilir).
- **Stripe:** [stripe.com](https://stripe.com/) üzerinden bir test hesabı aç ve `Publishable Key` ile `Secret Key` değerlerini al.

### 2. Backend Geliştirme Ortamı (Tamamlandı ✅)
- Backend klasörüne `.env` dosyası tarafımdan oluşturuldu ve verdiğin anahtarlar eklendi.

### 3. Chrome Extension Kurulumu
- Chrome'da `chrome://extensions/` adresine git.
- "Developer mode" (Geliştirici modu) seçeneğini aç.
- "Load unpacked" (Paketlenmemiş öğe yükle) butonuna bas ve projedeki `extension` klasörünü seç.

### 4. Veritabanı Tablolarını Oluştur
Supabase SQL Editor kısmına gel ve aşağıdaki SQL kodunu yapıştırıp çalıştır:

```sql
-- Analizler Tablosu
CREATE TABLE analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    video_id TEXT,
    video_metadata JSONB,
    analysis_results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Kullanım Takibi (Opsiyonel)
CREATE TABLE usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    action TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
```

### 5. Bağımlılıkları Yükle
Terminal üzerinden şu komutları çalıştır:
```bash
# Backend için
cd backend
npm install

# Extension için (ileride build tool eklersek)
# cd extension
# npm install
```

---
**Not:** Ben şu an kodları yazmaya başlıyorum. Bu dosyayı tamamladıkça güncelleyeceğim.
