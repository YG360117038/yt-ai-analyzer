require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { authMiddleware } = require('./middlewares/auth');
const { createUsageCheck } = require('./middlewares/usageCheck');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ==================== ENV VALIDATION ====================
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`KRİTİK: ${envVar} env değişkeni eksik!`);
        process.exit(1);
    }
}

// Supabase Init
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== MIDDLEWARE ====================

// CORS - sadece izinli originler
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        // Chrome extension origin'leri (chrome-extension://...) ve server-to-server (no origin)
        if (!origin || origin.startsWith('chrome-extension://') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS policy: Origin not allowed'));
        }
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting
const analyzeRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 dakika
    max: 10,
    message: { error: 'Çok fazla istek gönderdiniz. Lütfen 1 dakika bekleyin.' },
    standardHeaders: true,
    legacyHeaders: false
});

const generalRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', generalRateLimit);

// ==================== PUBLIC ROUTES ====================

// Health Check (hassas bilgiler kaldirildi)
app.get('/api/health', async (req, res) => {
    let dbTest = 'not tested';
    try {
        const { error } = await supabase.from('profiles').select('count').limit(1);
        dbTest = error ? 'ERROR' : 'OK';
    } catch (e) {
        dbTest = 'EXCEPTION';
    }

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        dbTest
    });
});

// PayTR Callback (public - hash ile dogrulama)
app.post('/api/payment/callback', async (req, res) => {
    try {
        const { merchant_oid, status, total_amount, hash } = req.body;

        const merchantKey = process.env.PAYTR_MERCHANT_KEY;
        const merchantSalt = process.env.PAYTR_MERCHANT_SALT;

        if (!merchantKey || !merchantSalt) {
            console.error('PayTR credentials eksik');
            return res.send('OK');
        }

        // PayTR hash dogrulama (timing-safe)
        const hashStr = `${merchant_oid}${merchantSalt}${status}${total_amount}`;
        const expectedHash = crypto.createHmac('sha256', merchantKey)
            .update(hashStr)
            .digest('base64');

        try {
            const hashBuffer = Buffer.from(hash || '', 'utf8');
            const expectedBuffer = Buffer.from(expectedHash, 'utf8');
            if (hashBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(hashBuffer, expectedBuffer)) {
                console.error('PayTR hash doğrulama başarısız');
                return res.send('FAIL');
            }
        } catch (e) {
            console.error('PayTR hash karşılaştırma hatası:', e.message);
            return res.send('FAIL');
        }

        if (status === 'success') {
            const { data: payment, error: paymentError } = await supabase
                .from('payments')
                .select('user_id')
                .eq('merchant_oid', merchant_oid)
                .single();

            if (paymentError || !payment) {
                console.error('Ödeme kaydı bulunamadı:', merchant_oid, paymentError?.message);
                return res.send('OK');
            }

            // Profili Pro'ya yükselt
            const subscriptionEnd = new Date();
            subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

            const { error: updateError } = await supabase.from('profiles').update({
                plan: 'pro',
                subscription_status: 'active',
                subscription_start: new Date().toISOString(),
                subscription_end: subscriptionEnd.toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', payment.user_id);

            if (updateError) {
                console.error('Profil Pro güncelleme hatası:', updateError.message);
            }

            // Ödeme kaydını güncelle
            const { error: payUpdateError } = await supabase.from('payments').update({
                status: 'success',
                callback_data: req.body
            }).eq('merchant_oid', merchant_oid);

            if (payUpdateError) {
                console.error('Ödeme kaydı güncelleme hatası:', payUpdateError.message);
            }
        } else {
            await supabase.from('payments').update({
                status: 'failed',
                callback_data: req.body
            }).eq('merchant_oid', merchant_oid);
        }

        res.send('OK');
    } catch (error) {
        console.error('PayTR callback error:', error.message);
        res.send('OK');
    }
});

// ==================== AUTHENTICATED ROUTES ====================

// Profil yoksa otomatik oluştur
async function getOrCreateProfile(user) {
    let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profile) return profile;

    const upsertData = {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Kullanıcı',
        avatar_url: user.user_metadata?.avatar_url || null,
        plan: 'free',
        analysis_count: 0,
        subscription_status: null,
        subscription_end: null
    };

    const { error: insertError } = await supabase
        .from('profiles')
        .upsert(upsertData, { onConflict: 'id' });

    if (insertError) {
        console.error('Profil upsert hatası:', insertError.message);
    }

    const { data: freshProfile, error: readError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (readError || !freshProfile) {
        console.error('Profil okunamadı:', readError?.message);
        return { _error: readError?.message || 'Profil oluşturuldu ama okunamadı' };
    }

    return freshProfile;
}

// Kullanıcı Profili
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const profile = await getOrCreateProfile(req.user);

        if (!profile) {
            return res.status(500).json({ error: 'Profil oluşturulamadı.' });
        }
        if (profile._error) {
            return res.status(500).json({ error: 'Profil oluşturulamadı.' });
        }

        res.json({
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url,
            plan: profile.plan,
            analysisCount: profile.analysis_count,
            subscriptionStatus: profile.subscription_status,
            subscriptionEnd: profile.subscription_end,
            freeLimit: 0 // Artık limit yok, free user skor görüyor
        });
    } catch (error) {
        console.error('Profile endpoint error:', error.message);
        res.status(500).json({ error: 'Profil yüklenirken hata oluştu.' });
    }
});

// Yeni Analiz Yap (auth + usage check)
const usageCheck = createUsageCheck(supabase, getOrCreateProfile);

app.post('/api/analyze', authMiddleware, usageCheck, analyzeRateLimit, async (req, res) => {
    try {
        const videoData = req.body;

        if (!videoData.videoId || typeof videoData.videoId !== 'string') {
            return res.status(400).json({ error: "Video ID gerekli." });
        }

        // Input validation
        const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
        if (!videoIdRegex.test(videoData.videoId)) {
            return res.status(400).json({ error: "Geçersiz video ID formatı." });
        }

        if (videoData.title && typeof videoData.title === 'string' && videoData.title.length > 500) {
            return res.status(400).json({ error: "Başlık çok uzun (maks 500 karakter)." });
        }

        if (videoData.description && typeof videoData.description === 'string' && videoData.description.length > 10000) {
            return res.status(400).json({ error: "Açıklama çok uzun (maks 10000 karakter)." });
        }

        if (videoData.language && !['tr', 'en'].includes(videoData.language)) {
            videoData.language = 'tr';
        }

        const { analyzeVideo } = require('./services/aiService');
        const isPro = req.profile.plan === 'pro';
        const language = videoData.language === 'en' ? 'en' : 'tr';
        const analysis = await analyzeVideo(videoData, {
            isPro,
            enableVideoAnalysis: isPro && videoData.enableVideoAnalysis !== false,
            language
        });

        // Save to DB
        const { data, error } = await supabase
            .from('analyses')
            .insert([{
                video_id: videoData.videoId,
                video_metadata: videoData,
                analysis_results: analysis,
                user_id: req.user.id
            }])
            .select();

        if (error) {
            console.error("Supabase kayıt hatası:", error.message);
            throw new Error('Analiz kaydedilemedi.');
        }

        // Kullanım sayacını artır
        await supabase.from('profiles').update({
            analysis_count: req.profile.analysis_count + 1,
            updated_at: new Date().toISOString()
        }).eq('id', req.user.id);

        // Free user ise kısıtlı sonuç gönder
        if (req.profile.plan !== 'pro') {
            const freeKeys = [
                'video_score', 'content_style_breakdown', 'tone_analysis',
                'target_audience', 'hook_structure', 'deep_digest_summary',
                'comment_sentiment'
            ];
            const freeResults = {};
            for (const key of freeKeys) {
                if (analysis[key] !== undefined) freeResults[key] = analysis[key];
            }
            if (analysis._analysisType) freeResults._analysisType = analysis._analysisType;
            const limitedData = {
                ...data[0],
                analysis_results: freeResults,
                is_limited: true,
                upgrade_message: 'Tam analiz için Pro plana geçin.'
            };
            return res.json(limitedData);
        }

        res.json(data[0]);
    } catch (error) {
        console.error("Analiz hatası:", error.message);
        res.status(500).json({ error: error.message || 'Analiz sırasında bir hata oluştu.' });
    }
});

// Tek Analiz Getir
app.get('/api/analysis/:id', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('analyses')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: "Analiz bulunamadı." });

        // Free user ise sonuçları kısıtla
        const profile = await getOrCreateProfile(req.user);
        if (profile && !profile._error && profile.plan !== 'pro') {
            const freeKeys = [
                'video_score', 'content_style_breakdown', 'tone_analysis',
                'target_audience', 'hook_structure', 'deep_digest_summary',
                'comment_sentiment'
            ];
            const freeResults = {};
            for (const key of freeKeys) {
                if (data.analysis_results?.[key] !== undefined) freeResults[key] = data.analysis_results[key];
            }
            data.analysis_results = freeResults;
            data.is_limited = true;
            data.upgrade_message = 'Tam analiz için Pro plana geçin.';
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Analiz yüklenirken hata oluştu.' });
    }
});

// Geçmiş Analizler Listesi
app.get('/api/analyses', authMiddleware, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;

        const { data, error, count } = await supabase
            .from('analyses')
            .select('id, video_id, video_metadata, created_at', { count: 'exact' })
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        res.json({
            analyses: (data || []).map(item => ({
                id: item.id,
                videoId: item.video_id,
                title: item.video_metadata?.title || "Başlıksız",
                channelName: item.video_metadata?.channelName || "",
                thumbnail: item.video_metadata?.thumbnail || "",
                createdAt: item.created_at
            })),
            total: count || 0,
            hasMore: (offset + limit) < (count || 0)
        });
    } catch (error) {
        res.status(500).json({ error: 'Geçmiş analizler yüklenirken hata oluştu.' });
    }
});

// Analiz Sil
app.delete('/api/analysis/:id', authMiddleware, async (req, res) => {
    try {
        const { error } = await supabase
            .from('analyses')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.user.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Analiz silinirken hata oluştu.' });
    }
});

// ==================== ADMIN ROUTES ====================

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function adminMiddleware(req, res, next) {
    if (!req.user || !ADMIN_EMAILS.includes(req.user.email)) {
        return res.status(403).json({ error: 'Admin yetkisi gerekli.' });
    }
    next();
}

// Admin: İstatistikler
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        const { count: totalAnalyses } = await supabase.from('analyses').select('*', { count: 'exact', head: true });
        const { count: proUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('plan', 'pro');
        const { data: recentAnalyses } = await supabase.from('analyses')
            .select('id, video_id, video_metadata, created_at, user_id')
            .order('created_at', { ascending: false }).limit(10);

        res.json({ totalUsers, totalAnalyses, proUsers, recentAnalyses });
    } catch (error) {
        console.error('Admin stats error:', error.message);
        res.status(500).json({ error: 'İstatistikler yüklenirken hata oluştu.' });
    }
});

// Admin: Kullanıcı listesi
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase.from('profiles')
            .select('id, email, display_name, plan, analysis_count, subscription_status')
            .order('analysis_count', { ascending: false });

        if (error) throw error;
        res.json({ users: data });
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcı listesi yüklenirken hata oluştu.' });
    }
});

// Admin: Tüm analizler
app.get('/api/admin/analyses', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        const { data: analyses, count } = await supabase.from('analyses')
            .select('id, video_id, video_metadata, user_id, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const userIds = [...new Set((analyses || []).map(a => a.user_id))];
        let emailMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabase.from('profiles')
                .select('id, email').in('id', userIds);
            emailMap = Object.fromEntries((profiles || []).map(p => [p.id, p.email]));
        }

        res.json({
            analyses: (analyses || []).map(a => ({
                id: a.id,
                videoId: a.video_id,
                videoTitle: a.video_metadata?.title || 'Basliksiz',
                channelName: a.video_metadata?.channelName || '',
                thumbnail: a.video_metadata?.thumbnail || '',
                userEmail: emailMap[a.user_id] || 'Bilinmiyor',
                createdAt: a.created_at
            })),
            total: count || 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Analizler yüklenirken hata oluştu.' });
    }
});

// ==================== PAYMENT ROUTES ====================

// PayTR Ödeme Tokeni Oluştur
app.post('/api/payment/create', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const merchantId = process.env.PAYTR_MERCHANT_ID;
        const merchantKey = process.env.PAYTR_MERCHANT_KEY;
        const merchantSalt = process.env.PAYTR_MERCHANT_SALT;

        if (!merchantId || !merchantKey || !merchantSalt) {
            return res.status(500).json({ error: 'Ödeme sistemi yapılandırılmamış.' });
        }

        const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
        const merchantOid = `${user.id.replace(/-/g, '').slice(0, 16)}_${Date.now()}`;
        const paymentAmount = 999; // $9.99 (cent cinsinden) - PayTR TL karsiligi otomatik
        const currency = 'USD';
        const userIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
        const email = user.email;
        const userName = user.user_metadata?.full_name || 'Kullanıcı';
        const merchantOkUrl = `${backendUrl}/api/payment/success`;
        const merchantFailUrl = `${backendUrl}/api/payment/fail`;
        const noInstallment = 1;
        const maxInstallment = 0;
        const userBasket = Buffer.from(JSON.stringify([['Pro Aylik Abonelik', '9.99', 1]])).toString('base64');
        const testMode = process.env.PAYTR_TEST_MODE === '1' ? '1' : '0';

        // PayTR hash olustur
        const hashStr = `${merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
        const paytrToken = crypto.createHmac('sha256', merchantKey)
            .update(hashStr + merchantSalt)
            .digest('base64');

        // Odeme kaydini olustur
        const { error: insertError } = await supabase.from('payments').insert({
            user_id: user.id,
            merchant_oid: merchantOid,
            amount: 9.99,
            status: 'pending'
        });

        if (insertError) {
            console.error('Ödeme kaydı oluşturma hatası:', insertError.message);
            return res.status(500).json({ error: 'Ödeme kaydedilemedi.' });
        }

        // PayTR'den token al
        const params = new URLSearchParams({
            merchant_id: merchantId,
            user_ip: userIp,
            merchant_oid: merchantOid,
            email: email,
            payment_amount: paymentAmount.toString(),
            paytr_token: paytrToken,
            user_basket: userBasket,
            no_installment: noInstallment.toString(),
            max_installment: maxInstallment.toString(),
            currency: currency,
            user_name: userName,
            user_address: 'Türkiye',
            user_phone: '05000000000',
            merchant_ok_url: merchantOkUrl,
            merchant_fail_url: merchantFailUrl,
            debug_on: '0',
            test_mode: testMode,
            lang: 'tr'
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
                method: 'POST',
                body: params,
                signal: controller.signal
            });
            clearTimeout(timeout);

            const result = await response.json();

            if (result.status === 'success') {
                res.json({ token: result.token });
            } else {
                console.error('PayTR token error:', result.reason);
                res.status(400).json({ error: 'Ödeme başlatılamadı. Lütfen tekrar deneyin.' });
            }
        } catch (fetchErr) {
            clearTimeout(timeout);
            if (fetchErr.name === 'AbortError') {
                res.status(504).json({ error: 'Ödeme sistemi yanıtlamıyor. Lütfen tekrar deneyin.' });
            } else {
                throw fetchErr;
            }
        }
    } catch (error) {
        console.error('Payment create error:', error.message);
        res.status(500).json({ error: 'Ödeme oluşturulurken hata oluştu.' });
    }
});

// Odeme Basarili Sayfasi
app.get('/api/payment/success', (req, res) => {
    res.send(`
        <html>
        <head><title>Ödeme Başarılı</title></head>
        <body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
                <h1 style="color:#2ea043;font-size:48px">&#10003;</h1>
                <h2>Ödeme Başarılı!</h2>
                <p style="color:#888">Pro aboneliğiniz aktif edildi. Bu sekmeyi kapatabilirsiniz.</p>
            </div>
        </body>
        </html>
    `);
});

// Odeme Basarisiz Sayfasi
app.get('/api/payment/fail', (req, res) => {
    res.send(`
        <html>
        <head><title>Ödeme Başarısız</title></head>
        <body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
                <h1 style="color:#ff0000;font-size:48px">&#10007;</h1>
                <h2>Ödeme Başarısız</h2>
                <p style="color:#888">Ödeme işlenemedi. Lütfen tekrar deneyin.</p>
            </div>
        </body>
        </html>
    `);
});

// ==================== GLOBAL ERROR HANDLERS ====================
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
});

// ==================== SERVER START + GRACEFUL SHUTDOWN ====================
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

function gracefulShutdown(signal) {
    console.log(`${signal} alindi, server kapatiliyor...`);
    server.close(() => {
        console.log('Server duzgun kapatildi.');
        process.exit(0);
    });
    // 10 saniye icinde kapanmazsa zorla kapat
    setTimeout(() => {
        console.error('Graceful shutdown suresi doldu, zorla kapatiliyor.');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
