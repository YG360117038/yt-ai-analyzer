-- =============================================
-- YT AI Analyzer - Freemium Sistemi SQL
-- Supabase SQL Editor'da calistirin
-- =============================================

-- 1. Profiller Tablosu
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    analysis_count INTEGER DEFAULT 0,
    subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'cancelled', 'expired')),
    subscription_start TIMESTAMPTZ,
    subscription_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Odemeler Tablosu
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    merchant_oid TEXT UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'TL',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    callback_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Yeni kullanici kayit olunca otomatik profil olustur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS (Row Level Security) Politikalari

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
    ON payments FOR SELECT
    USING (auth.uid() = user_id);

-- Analyses (mevcut tablo - RLS ekle)
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses"
    ON analyses FOR SELECT
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own analyses"
    ON analyses FOR DELETE
    USING (auth.uid()::text = user_id::text);

-- Service role icin bypass (backend kullanimi)
CREATE POLICY "Service role full access profiles"
    ON profiles FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access payments"
    ON payments FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access analyses"
    ON analyses FOR ALL
    USING (auth.role() = 'service_role');

-- 5. Audit Logs (Admin Aksiyonlari)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_email TEXT,
    new_plan TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Sadece service role yazabilir/okuyabilir
CREATE POLICY "Service role full access audit_logs"
    ON audit_logs FOR ALL
    USING (auth.role() = 'service_role');
