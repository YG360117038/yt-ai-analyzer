const FREE_LIMIT = 3;

function createUsageCheck(supabase, getOrCreateProfile) {
    return async function usageCheck(req, res, next) {
        try {
            const profile = await getOrCreateProfile(req.user);

            if (!profile || profile._error) {
                console.error('usageCheck: Profil alinamadi:', profile?._error);
                return res.status(500).json({ error: 'Profil olusturulamadi.' });
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
    };
}

module.exports = { createUsageCheck };
