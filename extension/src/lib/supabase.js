/**
 * Supabase Auth Helper for Chrome Extension
 * chrome.identity.launchWebAuthFlow ile Google OAuth
 */
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
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (!responseUrl) {
                        reject(new Error('Giris iptal edildi.'));
                        return;
                    }

                    try {
                        // URL hash'inden token'lari al
                        const url = new URL(responseUrl);
                        const hashParams = new URLSearchParams(url.hash.substring(1));
                        const accessToken = hashParams.get('access_token');
                        const refreshToken = hashParams.get('refresh_token');
                        const expiresIn = parseInt(hashParams.get('expires_in') || '3600');

                        if (!accessToken) {
                            reject(new Error('Token alinamadi.'));
                            return;
                        }

                        const expiresAt = Date.now() + (expiresIn * 1000);

                        await chrome.storage.local.set({
                            auth_token: accessToken,
                            refresh_token: refreshToken,
                            token_expires_at: expiresAt
                        });

                        resolve({ accessToken, refreshToken });
                    } catch (err) {
                        reject(err);
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
                    return await this.refreshToken(result.refresh_token);
                } catch (e) {
                    console.error('Token yenileme hatasi:', e);
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
            throw new Error('Token yenilenemedi.');
        }

        const data = await response.json();
        const expiresAt = Date.now() + (data.expires_in * 1000);

        await chrome.storage.local.set({
            auth_token: data.access_token,
            refresh_token: data.refresh_token,
            token_expires_at: expiresAt
        });

        return data.access_token;
    },

    // Kullanici profilini backend'den al
    async getProfile(token) {
        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/api/user/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Profil alinamadi.');
        return response.json();
    },

    // Cikis yap
    async signOut() {
        await chrome.storage.local.remove(['auth_token', 'refresh_token', 'token_expires_at', 'user_profile']);
    }
};
