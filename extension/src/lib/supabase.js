/**
 * Supabase Auth Helper for Chrome Extension
 * chrome.identity.launchWebAuthFlow ile Google OAuth
 */
let _refreshPromise = null; // Token refresh race condition onleme

const SupabaseAuth = {

    // Google ile giris yap
    async signInWithGoogle() {
        const redirectUrl = chrome.identity.getRedirectURL();
        const authUrl = `${CONFIG.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow(
                { url: authUrl, interactive: true },
                async (responseUrl) => {
                    if (chrome.runtime.lastError) {
                        const msg = chrome.runtime.lastError.message || 'Google giris penceresi acilamadi.';
                        // Kullanici iptal etti mi?
                        if (msg.includes('canceled') || msg.includes('closed') || msg.includes('user')) {
                            reject(new Error('Giris iptal edildi.'));
                        } else {
                            reject(new Error('Google giris hatasi: ' + msg));
                        }
                        return;
                    }

                    if (!responseUrl) {
                        reject(new Error('Giris iptal edildi.'));
                        return;
                    }

                    try {
                        const url = new URL(responseUrl);
                        const hashParams = new URLSearchParams(url.hash.substring(1));
                        const accessToken = hashParams.get('access_token');
                        const refreshToken = hashParams.get('refresh_token');
                        const rawExpiresIn = parseInt(hashParams.get('expires_in'));
                        const expiresIn = (isNaN(rawExpiresIn) || rawExpiresIn <= 0) ? 3600 : rawExpiresIn;

                        if (!accessToken) {
                            reject(new Error('Giris basarili oldu ama token alinamadi. Lutfen tekrar deneyin.'));
                            return;
                        }

                        if (!refreshToken) {
                            console.warn('Refresh token alinamadi - oturum suresi sinirli olabilir.');
                        }

                        const expiresAt = Date.now() + (expiresIn * 1000);

                        await chrome.storage.local.set({
                            auth_token: accessToken,
                            refresh_token: refreshToken || null,
                            token_expires_at: expiresAt
                        });

                        resolve({ accessToken, refreshToken });
                    } catch (err) {
                        reject(new Error('Giris islemi sirasinda beklenmeyen bir hata olustu.'));
                    }
                }
            );
        });
    },

    // Gecerli token'i al (gerekirse yenile)
    async getToken() {
        const result = await chrome.storage.local.get(['auth_token', 'refresh_token', 'token_expires_at']);

        if (!result.auth_token) return null;

        // Token suresi dolmus mu kontrol et (5 dk oncesinden yenile)
        if (result.token_expires_at && Date.now() > result.token_expires_at - 300000) {
            if (result.refresh_token) {
                try {
                    // Race condition onleme: ayni anda birden fazla refresh yapma
                    if (!_refreshPromise) {
                        _refreshPromise = this.refreshToken(result.refresh_token)
                            .finally(() => { _refreshPromise = null; });
                    }
                    return await _refreshPromise;
                } catch (e) {
                    console.error('Token yenileme hatasi:', e.message);
                    _refreshPromise = null;
                    await this.signOut();
                    return null;
                }
            }
            await this.signOut();
            return null;
        }

        return result.auth_token;
    },

    // Token'i yenile
    async refreshToken(refreshToken) {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': CONFIG.SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error('Token yenilenemedi: ' + (response.status === 400 ? 'Oturum suresi dolmus.' : errText));
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('Yenileme sonrasi token alinamadi.');
        }

        const rawExpiresIn = data.expires_in;
        const expiresIn = (typeof rawExpiresIn === 'number' && rawExpiresIn > 0) ? rawExpiresIn : 3600;
        const expiresAt = Date.now() + (expiresIn * 1000);

        await chrome.storage.local.set({
            auth_token: data.access_token,
            refresh_token: data.refresh_token || refreshToken, // Yeni refresh token yoksa eskisini koru
            token_expires_at: expiresAt
        });

        return data.access_token;
    },

    // Kullanici profilini backend'den al (retry ile)
    async getProfile(token, retries = 2) {
        const backendUrl = CONFIG.BACKEND_URL;

        for (let i = 0; i <= retries; i++) {
            try {
                const response = await fetch(`${backendUrl}/api/user/profile`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) return response.json();

                if (i === retries) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.error || 'Profil alinamadi.');
                }
            } catch (e) {
                if (i === retries) throw e;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    },

    // Cikis yap
    async signOut() {
        await chrome.storage.local.remove(['auth_token', 'refresh_token', 'token_expires_at', 'user_profile']);
    }
};
