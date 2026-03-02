require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { authMiddleware } = require('./middlewares/auth');
const { createUsageCheck } = require('./middlewares/usageCheck');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Init
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

// ==================== PUBLIC ROUTES ====================

// Health Check + Debug
app.get('/api/health', async (req, res) => {
    const envCheck = {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_SERVICE_ROLE_KEY_LENGTH: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
        SUPABASE_SERVICE_ROLE_KEY_START: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').substring(0, 10),
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        PAYTR_MERCHANT_ID: !!process.env.PAYTR_MERCHANT_ID
    };

    // JWT role kontrolu - anon mu service_role mu?
    let keyRole = 'unknown';
    try {
        const payload = JSON.parse(Buffer.from((process.env.SUPABASE_SERVICE_ROLE_KEY || '').split('.')[1], 'base64').toString());
        keyRole = payload.role || 'no role claim';
    } catch (e) {
        keyRole = 'parse error';
    }

    // Test supabase connection
    let dbTest = 'not tested';
    try {
        const { data, error } = await supabase.from('profiles').select('count').limit(1);
        dbTest = error ? `ERROR: ${error.message} (code: ${error.code})` : 'OK';
    } catch (e) {
        dbTest = `EXCEPTION: ${e.message}`;
    }

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: envCheck,
        keyRole,
        dbTest
    });
});

// PayTR Callback (public - hash ile dogrulama)
app.post('/api/payment/callback', async (req, res) => {
    try {
        const { merchant_oid, status, total_amount, hash } = req.body;

        // PayTR hash dogrulama
        const merchantKey = process.env.PAYTR_MERCHANT_KEY;
        const merchantSalt = process.env.PAYTR_MERCHANT_SALT;
        const hashStr = `${merchant_oid}${merchantSalt}${status}${total_amount}`;
        const expectedHash = crypto.createHmac('sha256', merchantKey)
            .update(hashStr)
            .digest('base64');

        if (hash !== expectedHash) {
            console.error('PayTR hash dogrulama basarisiz');
            return res.send('FAIL');
        }

        if (status === 'success') {
            // Odeme basarili - merchant_oid'den user_id bul
            const { data: payment } = await supabase
                .from('payments')
                .select('user_id')
                .eq('merchant_oid', merchant_oid)
                .single();

            if (payment) {
                // Profili Pro'ya yukselt
                const subscriptionEnd = new Date();
                subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

                await supabase.from('profiles').update({
                    plan: 'pro',
                    subscription_status: 'active',
                    subscription_start: new Date().toISOString(),
                    subscription_end: subscriptionEnd.toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', payment.user_id);

                // Odeme kaydini guncelle
                await supabase.from('payments').update({
                    status: 'success',
                    callback_data: req.body
                }).eq('merchant_oid', merchant_oid);

                console.log(`Odeme basarili: ${merchant_oid} -> Pro aktif`);
            }
        } else {
            // Odeme basarisiz
            await supabase.from('payments').update({
                status: 'failed',
                callback_data: req.body
            }).eq('merchant_oid', merchant_oid);

            console.log(`Odeme basarisiz: ${merchant_oid}`);
        }

        // PayTR "OK" yaniti bekler
        res.send('OK');
    } catch (error) {
        console.error('PayTR callback error:', error);
        res.send('OK');
    }
});

// ==================== AUTHENTICATED ROUTES ====================

// Profil yoksa otomatik olustur
async function getOrCreateProfile(user) {
    // 1. Once profili bul
    let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profile) return profile;

    // 2. Profil yok - olustur
    console.log('Profil bulunamadi, olusturuluyor:', user.id);
    const upsertData = {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Kullanici',
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
        console.error('Profil upsert hatasi:', JSON.stringify(insertError));
    }

    // 3. Upsert sonrasi tekrar oku (select chain bazen bos donuyor)
    const { data: freshProfile, error: readError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (readError || !freshProfile) {
        console.error('Profil upsert sonrasi okunamadi:', readError?.message);
        return { _error: readError || { message: 'Profil olusturuldu ama okunamadi' } };
    }

    return freshProfile;
}

// Debug: Profil olusturma adimlarini test et
app.get('/api/debug/profile', authMiddleware, async (req, res) => {
    const steps = {};
    try {
        // Adim 1: Select
        const { data: existing, error: selectErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();
        steps.step1_select = { data: existing ? 'FOUND' : null, error: selectErr?.message, code: selectErr?.code };

        // Adim 2: Upsert
        const { data: upsertData, error: upsertErr } = await supabase
            .from('profiles')
            .upsert({
                id: req.user.id,
                email: req.user.email,
                display_name: req.user.user_metadata?.full_name || 'Test',
                avatar_url: null,
                plan: 'free',
                analysis_count: 0,
                subscription_status: null,
                subscription_end: null
            }, { onConflict: 'id' });
        steps.step2_upsert = { data: upsertData, error: upsertErr?.message, code: upsertErr?.code, details: upsertErr?.details, hint: upsertErr?.hint };

        // Adim 3: Tekrar oku
        const { data: reread, error: rereadErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();
        steps.step3_reread = { data: reread ? 'FOUND' : null, error: rereadErr?.message, code: rereadErr?.code };

        steps.user_id = req.user.id;
        steps.user_email = req.user.email;

        res.json(steps);
    } catch (e) {
        res.status(500).json({ ...steps, exception: e.message });
    }
});

// Kullanici Profili
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const profile = await getOrCreateProfile(req.user);

        if (!profile) {
            return res.status(500).json({ error: 'Profil olusturulamadi.', detail: 'null profile' });
        }
        if (profile._error) {
            return res.status(500).json({ error: 'Profil olusturulamadi.', detail: profile._error });
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
            freeLimit: 3
        });
    } catch (error) {
        console.error('Profile endpoint error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Yeni Analiz Yap (auth + usage check)
const usageCheck = createUsageCheck(supabase, getOrCreateProfile);

app.post('/api/analyze', authMiddleware, usageCheck, async (req, res) => {
    console.log("Received analysis request for video:", req.body.videoId);
    try {
        const videoData = req.body;

        if (!videoData.videoId) {
            return res.status(400).json({ error: "videoId gerekli." });
        }

        // Gemini AI Analysis
        console.log("Starting Gemini Analysis...");
        const { analyzeVideo } = require('./services/aiService');
        const analysis = await analyzeVideo(videoData);
        console.log("Analysis complete!");

        // Save to DB
        console.log("Saving to Supabase...");
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
            console.error("Supabase Error:", error);
            throw error;
        }

        // Kullanim sayacini artir
        await supabase.from('profiles').update({
            analysis_count: req.profile.analysis_count + 1,
            updated_at: new Date().toISOString()
        }).eq('id', req.user.id);

        console.log("Success! Analysis ID:", data[0].id);
        res.json(data[0]);
    } catch (error) {
        console.error("Error in /api/analyze:", error.message);
        res.status(500).json({ error: error.message });
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
        if (!data) return res.status(404).json({ error: "Analiz bulunamadi." });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Gecmis Analizler Listesi
app.get('/api/analyses', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const { data, error, count } = await supabase
            .from('analyses')
            .select('id, video_id, video_metadata, created_at', { count: 'exact' })
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        res.json({
            analyses: data.map(item => ({
                id: item.id,
                videoId: item.video_id,
                title: item.video_metadata?.title || "Basliksiz",
                channelName: item.video_metadata?.channelName || "",
                thumbnail: item.video_metadata?.thumbnail || "",
                createdAt: item.created_at
            })),
            total: count,
            hasMore: (offset + limit) < count
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});

// ==================== ADMIN ROUTES ====================

const ADMIN_EMAILS = ['onurtncs@gmail.com'];

function adminMiddleware(req, res, next) {
    if (!req.user || !ADMIN_EMAILS.includes(req.user.email)) {
        return res.status(403).json({ error: 'Admin yetkisi gerekli.' });
    }
    next();
}

// Admin: Istatistikler
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
        console.error('Admin stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: Kullanici listesi
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase.from('profiles')
            .select('id, email, display_name, plan, analysis_count, subscription_status')
            .order('analysis_count', { ascending: false });

        if (error) throw error;
        res.json({ users: data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Tum analizler
app.get('/api/admin/analyses', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const { data: analyses, count } = await supabase.from('analyses')
            .select('id, video_id, video_metadata, user_id, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Kullanici emaillerini al
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
            total: count
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== PAYMENT ROUTES ====================

// PayTR Odeme Tokeni Olustur
app.post('/api/payment/create', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const merchantId = process.env.PAYTR_MERCHANT_ID;
        const merchantKey = process.env.PAYTR_MERCHANT_KEY;
        const merchantSalt = process.env.PAYTR_MERCHANT_SALT;
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;

        const merchantOid = `${user.id.replace(/-/g, '').slice(0, 16)}_${Date.now()}`;
        const paymentAmount = 9900; // 99.00 TL (kurus cinsinden)
        const currency = 'TL';
        const userIp = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '127.0.0.1';
        const email = user.email;
        const userName = user.user_metadata?.full_name || 'Kullanici';
        const merchantOkUrl = `${backendUrl}/api/payment/success`;
        const merchantFailUrl = `${backendUrl}/api/payment/fail`;
        const noInstallment = 1;
        const maxInstallment = 0;
        const userBasket = Buffer.from(JSON.stringify([['Pro Aylik Abonelik', '99.00', 1]])).toString('base64');
        const testMode = process.env.PAYTR_TEST_MODE === '1' ? '1' : '0';

        // PayTR hash olustur
        const hashStr = `${merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
        const paytrToken = crypto.createHmac('sha256', merchantKey)
            .update(hashStr + merchantSalt)
            .digest('base64');

        // Odeme kaydini olustur
        await supabase.from('payments').insert({
            user_id: user.id,
            merchant_oid: merchantOid,
            amount: 99.00,
            status: 'pending'
        });

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
            user_address: 'Turkiye',
            user_phone: '05000000000',
            merchant_ok_url: merchantOkUrl,
            merchant_fail_url: merchantFailUrl,
            debug_on: '1',
            test_mode: testMode,
            lang: 'tr'
        });

        const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
            method: 'POST',
            body: params
        });

        const result = await response.json();

        if (result.status === 'success') {
            res.json({ token: result.token });
        } else {
            console.error('PayTR token error:', result);
            res.status(400).json({ error: result.reason || 'Odeme tokeni alinamadi.' });
        }
    } catch (error) {
        console.error('Payment create error:', error);
        res.status(500).json({ error: 'Odeme olusturulurken hata olustu.' });
    }
});

// Odeme Basarili Sayfasi
app.get('/api/payment/success', (req, res) => {
    res.send(`
        <html>
        <head><title>Odeme Basarili</title></head>
        <body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
                <h1 style="color:#2ea043;font-size:48px">&#10003;</h1>
                <h2>Odeme Basarili!</h2>
                <p style="color:#888">Pro aboneliginiz aktif edildi. Bu sekmeyi kapatabilirsiniz.</p>
            </div>
        </body>
        </html>
    `);
});

// Odeme Basarisiz Sayfasi
app.get('/api/payment/fail', (req, res) => {
    res.send(`
        <html>
        <head><title>Odeme Basarisiz</title></head>
        <body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
                <h1 style="color:#ff0000;font-size:48px">&#10007;</h1>
                <h2>Odeme Basarisiz</h2>
                <p style="color:#888">Odeme islenemedi. Lutfen tekrar deneyin.</p>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
