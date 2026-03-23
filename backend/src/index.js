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

// ==================== PUBLIC SHARE ====================
// Analizi UUID token ile herkese aç (UUID 128-bit entropy = unguessable)
app.get('/api/share/:id', async (req, res) => {
    const { id } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Geçersiz ID.' });
    }

    try {
        const { data, error } = await supabase
            .from('analyses')
            .select('id, video_id, video_metadata, analysis_results, created_at')
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Analiz bulunamadı veya herkese açık değil.' });
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Analiz yüklenirken hata oluştu.' });
    }
});

// ==================== SCRIPT GENERATOR ====================
app.post('/api/generate-script', authMiddleware, analyzeRateLimit, async (req, res) => {
    try {
        const { analysisId, language } = req.body;

        if (!analysisId || typeof analysisId !== 'string') {
            return res.status(400).json({ error: 'analysisId gerekli.' });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(analysisId)) {
            return res.status(400).json({ error: 'Geçersiz analiz ID.' });
        }

        // Kullanıcının kendi analizi mi kontrol et
        const { data: analysis, error: fetchError } = await supabase
            .from('analyses')
            .select('id, video_metadata, analysis_results')
            .eq('id', analysisId)
            .eq('user_id', req.user.id)
            .single();

        if (fetchError || !analysis) {
            return res.status(404).json({ error: 'Analiz bulunamadı.' });
        }

        const { generateScript } = require('./services/aiService');
        const script = await generateScript(analysis, language || 'tr');

        res.json({ script });
    } catch (error) {
        console.error('Script generator error:', error.message);
        res.status(500).json({ error: error.message || 'Senaryo oluşturulurken hata oluştu.' });
    }
});

// ==================== DEMO ANALIZ ====================
const DEMO_ANALYSIS = {
    id: 'demo',
    video_id: 'dQw4w9WgXcQ',
    video_metadata: {
        title: 'How I Made $100K on YouTube WITHOUT Millions of Subscribers',
        channelName: 'DemoChannel',
        viewCount: '2.4M görüntülenme',
        publishDate: '15 Mart 2024',
        duration: '14:22',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    },
    analysis_results: {
        _analysisType: 'transcript',
        viral_score: {
            score: 92, ctr_potential: 88, retention_potential: 85, growth_potential: 90,
            why: 'Güçlü merak boşluğu + parasal başarı hikayesi = viral formül'
        },
        hook_analysis: {
            type: 'curiosity',
            why_it_works: 'Zıtlık prensibi: Para kazandım + az abonem var. İzleyici nasıl olduğunu merak ediyor.',
            first_10_seconds: '"Bu videoyu izlediğinizde neden abone sayısının hiç önemi olmadığını anlayacaksınız..."'
        },
        video_structure: {
            hook: 'İlk 30 saniyede büyük iddia: Abone sayısı olmadan gelir nasıl elde edildi',
            setup: 'Klasik başarısızlık hikayesi — 2 yıl boyunca sıfır gelir',
            buildup: '3 kritik strateji açıklaması: Niche seçimi, SEO odağı, monetizasyon çeşitliliği',
            payoff: 'Gerçek gelir ekran görüntüleri + adım adım sistem',
            cta: 'Sistemi öğrenmek için kanalı takip et + ücretsiz checklist indir'
        },
        viral_patterns: [
            'Para kazanma vaadi + düşük engel ("herkes yapabilir")',
            'İspat + şeffaflık: Gerçek rakamlar gösteriliyor',
            'Zıtlık: "Beklediğiniz yol değil" → merak boşluğu'
        ],
        title_thumbnail: {
            why_title_works: 'Rakam ($100K) + zıtlık (without millions) = güçlü CTR formülü',
            ctr_angle: 'Okuyucu anında "nasıl?" diye soruyor — bu içeri çeken kanca',
            thumbnail_psychology: 'Şaşkın yüz + büyük rakam + kırmızı ok = dikkat çekici kombinasyon',
            improved_titles: [
                { title: 'Sıfırdan $100K: Abone Sayısı Olmadan YouTube\'da Para Kazanmak', ctr_score: 94, angle: 'Sıfırdan başlama' },
                { title: 'Neden Az Abonem Var Ama Çok Kazanıyorum? (Gerçek Rakamlar)', ctr_score: 91, angle: 'Şeffaflık + merak' },
                { title: 'Bu 3 Strateji Olmadan YouTube\'da Para Kazanamazsınız', ctr_score: 88, angle: 'Negatif framing' }
            ]
        },
        clone_this_video: {
            new_video_idea: 'Kendi nişinizde: "X olmadan Y\'yi nasıl başardım" formatı',
            full_hook: '"Bugün size bir itirafım var. [Nişinizde yaygın yanlış inanç] sanılıyor. Ama ben bunu yapmadan [hedefe] ulaştım..."',
            script_outline: '1. Hook (0:00-0:45): Büyük iddia\n2. Problem (0:45-2:00): Klasik yaklaşımın neden işe yaramadığı\n3. Çözüm (2:00-3:30): Farklı stratejik yaklaşım\n4. Strateji 1 (3:30-6:00): Niche optimizasyonu\n5. Strateji 2 (6:00-9:00): SEO odaklı içerik\n6. Strateji 3 (9:00-12:00): Çoklu gelir\n7. Kanıt (12:00-13:30): Gerçek rakamlar\n8. CTA (13:30-14:22)',
            scene_plan: [
                { scene: 1, time: '0:00-0:10', description: 'Şaşırtıcı istatistik gösterilir', voiceover: '"Bu videoyu izleyenlerin %90\'ı bunu yanlış yapıyor..."', ai_video_prompt: 'Close-up of person looking surprised at laptop screen, studio lighting', clip_prompt_10s: 'A creator looking shocked at their laptop, modern home office, warm lighting, cinematic' },
                { scene: 2, time: '0:10-0:20', description: 'Para rakamları animasyon', voiceover: '"$100,000 dolar. Hiç düşünmediğiniz bir yoldan."', ai_video_prompt: 'Animated dollar signs and growth charts, dark background, motion graphics', clip_prompt_10s: 'Money counter animation, green numbers rising, dark background, professional' }
            ],
            seo_tags: ['youtube para kazanma', 'youtube monetizasyon', 'az abone ile para', 'youtube büyüme', 'içerik üreticisi']
        },
        content_factory: {
            video_ideas: [
                { title: 'İlk 1000 Aboneyi 30 Günde Nasıl Aldım', hook: 'Kimse bu stratejiyi söylemiyor...', why: 'Milestone içeriği viral olur' },
                { title: 'YouTube Algoritması Hakkında Bildiğiniz 5 Yalan', hook: 'Gurular bunu size söylemez...', why: 'Myth-busting yüksek paylaşım alır' },
                { title: 'Tek Bir Video İle Nasıl $5000 Kazandım', hook: 'Tek bir video, değişen her şey...', why: 'Spesifik rakam + kısa süre = güçlü hook' }
            ],
            high_ctr_titles: [
                { title: 'YouTube\'da GERÇEKTEN Para Kazanmanın 7 Yolu (2024)', ctr_score: 89 },
                { title: 'Bu Hatayı Yapıyorsanız YouTube\'da Asla Büyüyemezsiniz', ctr_score: 86 }
            ]
        },
        shorts_opportunities: [
            { title: 'En Büyük YouTube Hatası', timestamp: '3:45', duration: '45 sn', hook: 'Herkesin yaptığı bu hata...', why: 'Kısa ve güçlü - viral short potansiyeli' },
            { title: 'İlk $1000 Nasıl Geldi', timestamp: '8:20', duration: '60 sn', hook: 'İlk büyük rakamı gördüğümde...', why: 'Duygusal an - özgün ve ilişkilendirilebilir' }
        ],
        monetization: {
            how_it_makes_money: 'AdSense + kurs satışı + affiliate link + üyelik sistemi',
            strategies: ['Yüksek CPM nişe odaklanmak (finans, eğitim)', 'Email listesi oluşturup kurs satmak', 'Affiliate marketing entegrasyonu'],
            best_cta: '"Ücretsiz YouTube Büyüme Checklist\'im için açıklamadaki linke tıkla"'
        }
    },
    created_at: new Date().toISOString(),
    is_demo: true
};

app.get('/api/demo', (req, res) => {
    res.json(DEMO_ANALYSIS);
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
