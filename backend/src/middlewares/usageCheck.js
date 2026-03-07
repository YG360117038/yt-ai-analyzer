function createUsageCheck(supabase, getOrCreateProfile) {
    return async function usageCheck(req, res, next) {
        try {
            const profile = await getOrCreateProfile(req.user);

            if (!profile || profile._error) {
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
                    profile.subscription_status = 'expired';
                } else {
                    req.profile = profile;
                    return next();
                }
            }

            // Free kullanici - analiz yapabilir ama sonuclar kisitli gelecek
            // Kisitlama backend response'unda yapilir (index.js'de is_limited flag)
            req.profile = profile;
            next();
        } catch (err) {
            console.error('Usage check error:', err.message);
            return res.status(500).json({ error: 'Kullanim kontrolu sirasinda hata olustu.' });
        }
    };
}

module.exports = { createUsageCheck };
