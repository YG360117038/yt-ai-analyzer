const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FREE_LIMIT = 3;

async function usageCheck(req, res, next) {
    try {
        let { data: profile, error } = await supabase
            .from('profiles')
            .select('plan, analysis_count, subscription_status, subscription_end')
            .eq('id', req.user.id)
            .single();

        // Profil yoksa otomatik olustur
        if (error || !profile) {
            console.log('usageCheck: Profil bulunamadi, olusturuluyor:', req.user.id);
            const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .upsert({
                    id: req.user.id,
                    email: req.user.email,
                    display_name: req.user.user_metadata?.full_name || req.user.email?.split('@')[0] || 'Kullanici',
                    avatar_url: req.user.user_metadata?.avatar_url || null,
                    plan: 'free',
                    analysis_count: 0,
                    subscription_status: null,
                    subscription_end: null
                }, { onConflict: 'id' })
                .select()
                .single();

            if (insertError || !newProfile) {
                console.error('Profil olusturma hatasi:', insertError);
                return res.status(500).json({ error: 'Profil olusturulamadi.' });
            }
            profile = newProfile;
        }

        // Pro kullanici - aktif abonelik kontrolu
        if (profile.plan === 'pro' && profile.subscription_status === 'active') {
            if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
                // Abonelik suresi dolmus
                await supabase.from('profiles').update({
                    plan: 'free',
                    subscription_status: 'expired'
                }).eq('id', req.user.id);

                profile.plan = 'free';
            } else {
                req.profile = profile;
                return next();
            }
        }

        // Ucretsiz kullanici - limit kontrolu
        if (profile.analysis_count >= FREE_LIMIT) {
            return res.status(403).json({
                error: 'Ucretsiz analiz limitiniz doldu.',
                requiresUpgrade: true,
                analysisCount: profile.analysis_count,
                limit: FREE_LIMIT
            });
        }

        req.profile = profile;
        next();
    } catch (err) {
        console.error('Usage check error:', err);
        return res.status(500).json({ error: 'Kullanim kontrolu sirasinda hata olustu.' });
    }
}

module.exports = { usageCheck };
