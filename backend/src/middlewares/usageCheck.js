const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FREE_LIMIT = 3;

async function usageCheck(req, res, next) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('plan, analysis_count, subscription_status, subscription_end')
            .eq('id', req.user.id)
            .single();

        if (error || !profile) {
            return res.status(404).json({ error: 'Kullanici profili bulunamadi.' });
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
