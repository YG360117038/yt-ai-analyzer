const FREE_ANALYSIS_LIMIT = 3;

function createUsageCheck(supabase, getOrCreateProfile) {
    return async function usageCheck(req, res, next) {
        try {
            const profile = await getOrCreateProfile(req.user);

            if (!profile || profile._error) {
                return res.status(500).json({ error: 'Profil olusturulamadi.' });
            }

            // Pro kullanici - sadece subscription_end kontrolü (null ise Skool üyesi, süresiz)
            if (profile.plan === 'pro' && profile.subscription_status === 'active') {
                if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
                    // Abonelik süresi dolmuş (Skool dışı eski kullanıcılar için)
                    const { error: updateError } = await supabase.from('profiles').update({
                        plan: 'free',
                        subscription_status: 'expired'
                    }).eq('id', req.user.id);

                    if (!updateError) {
                        profile.plan = 'free';
                        profile.subscription_status = 'expired';
                    }
                } else {
                    // Pro ve geçerli - geç
                    req.profile = profile;
                    return next();
                }
            }

            // Free kullanici - 3 analiz hakkı kontrolü
            const usedCount = profile.analysis_count || 0;
            if (usedCount >= FREE_ANALYSIS_LIMIT) {
                return res.status(403).json({
                    error: 'Ücretsiz analiz hakkınız doldu.',
                    upgrade_required: true,
                    upgrade_message: `${FREE_ANALYSIS_LIMIT} ücretsiz analiz hakkınızı kullandınız. Sınırsız analiz için Skool topluluğumuza katılın.`,
                    skool_url: process.env.SKOOL_COMMUNITY_URL || 'https://www.skool.com',
                    used: usedCount,
                    limit: FREE_ANALYSIS_LIMIT
                });
            }

            req.profile = profile;
            next();
        } catch (err) {
            console.error('Usage check error:', err.message);
            return res.status(500).json({ error: 'Kullanim kontrolu sirasinda hata olustu.' });
        }
    };
}

module.exports = { createUsageCheck };
