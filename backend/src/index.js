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

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const FREE_ANALYSIS_LIMIT = 3;

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
        subscription_status: 'none',
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
            freeLimit: FREE_ANALYSIS_LIMIT,
            remainingAnalyses: profile.plan === 'pro' ? null : Math.max(0, FREE_ANALYSIS_LIMIT - (profile.analysis_count || 0)),
            isAdmin: ADMIN_EMAILS.includes(req.user.email)
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
                'viral_score', 'hook_analysis', 'viral_patterns'
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
                upgrade_message: 'Tam analiz için Skool topluluğumuza katılın ve Pro üye olun.'
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
                'viral_score', 'hook_analysis', 'viral_patterns'
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

// ==================== CHANNEL ANALYSIS ====================
app.post('/api/channel-analyze', authMiddleware, usageCheck, analyzeRateLimit, async (req, res) => {
    try {
        const { videos, channelName } = req.body;

        if (!channelName || typeof channelName !== 'string') {
            return res.status(400).json({ error: "Kanal adı gerekli." });
        }

        if (!videos || !Array.isArray(videos) || videos.length === 0) {
            return res.status(400).json({ error: "Video listesi gerekli." });
        }

        if (videos.length > 50) {
            return res.status(400).json({ error: "Maksimum 50 video analiz edilebilir." });
        }

        // Sanitize video array
        const sanitizedVideos = videos.slice(0, 50).map(v => ({
            videoId: typeof v.videoId === 'string' ? v.videoId.substring(0, 20) : '',
            title: typeof v.title === 'string' ? v.title.substring(0, 200) : '',
            viewCount: typeof v.viewCount === 'string' ? v.viewCount.substring(0, 30) : '',
            thumbnail: typeof v.thumbnail === 'string' ? v.thumbnail.substring(0, 300) : '',
            publishDate: typeof v.publishDate === 'string' ? v.publishDate.substring(0, 50) : '',
            duration: typeof v.duration === 'string' ? v.duration.substring(0, 20) : ''
        }));

        const language = (req.body.language === 'en') ? 'en' : 'tr';

        const { analyzeChannel } = require('./services/aiService');
        const analysis = await analyzeChannel({ channelName, videos: sanitizedVideos }, { language });

        // Save to DB
        const { data, error } = await supabase
            .from('analyses')
            .insert([{
                video_id: `channel_${channelName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_${Date.now()}`,
                video_metadata: { channelName, videoCount: sanitizedVideos.length, type: 'channel' },
                analysis_results: analysis,
                user_id: req.user.id
            }])
            .select();

        if (error) {
            console.error("Supabase kayıt hatası:", error.message);
            // Non-fatal: return result even if save fails
        }

        // Increment usage counter
        await supabase.from('profiles').update({
            analysis_count: req.profile.analysis_count + 1,
            updated_at: new Date().toISOString()
        }).eq('id', req.user.id);

        // Gate channel analysis for Free users
        if (req.profile.plan !== 'pro') {
            const freeChannelKeys = ['channel_health_score'];
            const freeResults = {};
            for (const key of freeChannelKeys) {
                if (analysis[key] !== undefined) freeResults[key] = analysis[key];
            }
            return res.json({
                id: data?.[0]?.id,
                channelName,
                videoCount: sanitizedVideos.length,
                analysis_results: freeResults,
                is_limited: true,
                upgrade_message: 'Tam kanal analizi için Skool topluluğumuza katılın ve Pro üye olun.',
                created_at: new Date().toISOString()
            });
        }

        res.json({
            id: data?.[0]?.id,
            channelName,
            videoCount: sanitizedVideos.length,
            analysis_results: analysis,
            created_at: new Date().toISOString()
        });

    } catch (error) {
        console.error("Kanal analiz hatası:", error.message);
        res.status(500).json({ error: error.message || 'Kanal analizi sırasında bir hata oluştu.' });
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


// Admin: Kullanıcıyı Pro/Free yap (email ile)
app.post('/api/admin/set-plan', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { email, plan } = req.body;

        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Email gerekli.' });
        }
        if (!['pro', 'free'].includes(plan)) {
            return res.status(400).json({ error: "plan 'pro' veya 'free' olmalı." });
        }

        const { data: profile, error: findError } = await supabase
            .from('profiles')
            .select('id, email, plan')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (findError || !profile) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        const updateData = plan === 'pro'
            ? {
                plan: 'pro',
                subscription_status: 'active',
                subscription_start: new Date().toISOString(),
                subscription_end: null, // Manuel Pro → süresiz
                updated_at: new Date().toISOString()
            }
            : {
                plan: 'free',
                subscription_status: 'none',
                subscription_end: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', profile.id);

        if (updateError) {
            return res.status(500).json({ error: 'Güncelleme başarısız: ' + updateError.message });
        }

        console.log(`Admin ${req.user.email} → ${email} kullanıcısını ${plan} yaptı`);
        res.json({ success: true, email: profile.email, plan });
    } catch (error) {
        console.error('set-plan error:', error.message);
        res.status(500).json({ error: 'İşlem sırasında hata oluştu.' });
    }
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
