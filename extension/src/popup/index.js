document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n
    await I18N.init();
    I18N.applyToDOM();

    const analyzeBtn = document.getElementById('analyze-btn');
    const dashboardBtn = document.getElementById('dashboard-btn');
    const videoPreview = document.getElementById('video-preview');
    const warning = document.getElementById('not-youtube-warning');
    const loginWarning = document.getElementById('login-warning');

    // Auth elementleri
    const loggedOutView = document.getElementById('logged-out-view');
    const loggedInView = document.getElementById('logged-in-view');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const subStatus = document.getElementById('sub-status');

    // Ring elementleri
    const ringProgress = document.getElementById('ring-progress');
    const ringValue = document.getElementById('ring-value');
    const ringRemainingText = document.getElementById('ring-remaining-text');
    const ringUsedText = document.getElementById('ring-used-text');
    const usageSection = document.getElementById('usage-section');

    const proUpgradeBanner = document.getElementById('pro-upgrade-banner');

    let isLoggedIn = false;
    let isLoginInProgress = false;

    function updateRing(isPro) {
        if (isPro) {
            ringValue.textContent = '\u221E';
            ringValue.style.color = '#2ea043';
            ringRemainingText.textContent = I18N.t('unlimited', 'Sinirsiz');
            ringUsedText.textContent = I18N.t('pro_plan');
            setTimeout(() => { ringProgress.style.strokeDashoffset = 0; }, 300);
        } else {
            ringValue.textContent = 'Free';
            ringValue.style.fontSize = '18px';
            ringRemainingText.textContent = I18N.t('score_only', 'Sadece skor gorunur');
            ringUsedText.textContent = I18N.t('pro_full_access_short', 'Pro ile tam erisim');
            ringValue.style.color = '#d29922';
            const circumference = 2 * Math.PI * 34;
            setTimeout(() => { ringProgress.style.strokeDashoffset = circumference * 0.7; }, 300);
        }
    }

    // Auth durumunu kontrol et
    async function checkAuth() {
        const token = await SupabaseAuth.getToken();

        if (token) {
            isLoggedIn = true;
            loggedOutView.style.display = 'none';
            loggedInView.style.display = 'block';
            loginWarning.style.display = 'none';

            try {
                const profile = await SupabaseAuth.getProfile(token);
                document.getElementById('user-name').innerText = profile.displayName || profile.email;
                const avatarEl = document.getElementById('user-avatar');
                if (profile.avatarUrl) {
                    avatarEl.src = profile.avatarUrl;
                } else {
                    avatarEl.style.display = 'none';
                }

                if (profile.plan === 'pro') {
                    subStatus.innerText = 'Pro';
                    subStatus.style.color = '#2ea043';
                    updateRing(true);
                    proUpgradeBanner.classList.remove('active');
                } else {
                    subStatus.innerText = I18N.t('free');
                    subStatus.style.color = '#d29922';
                    updateRing(false);
                    proUpgradeBanner.classList.add('active');
                }
            } catch (e) {
                subStatus.innerText = I18N.t('logged_in', 'Giris yapildi');
                usageSection.style.display = 'none';
            }
        } else {
            isLoggedIn = false;
            loggedOutView.style.display = 'block';
            loggedInView.style.display = 'none';
            subStatus.innerText = '-';
            usageSection.style.display = 'none';
        }
    }

    await checkAuth();

    // Aktif tab'i kontrol et
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isYouTube = tab?.url?.includes("youtube.com/watch");

    if (isYouTube) {
        videoPreview.classList.add('active');

        const videoId = new URL(tab.url).searchParams.get('v');
        if (videoId) {
            document.getElementById('preview-thumb').src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        }
        document.getElementById('preview-title').innerText = tab.title?.replace(' - YouTube', '') || 'Video';
        document.getElementById('preview-channel').innerText = 'YouTube';

        if (isLoggedIn) {
            analyzeBtn.disabled = false;
        } else {
            analyzeBtn.disabled = true;
            loginWarning.style.display = 'block';
            loginWarning.classList.add('active');
        }
    } else {
        warning.classList.add('active');
        analyzeBtn.disabled = true;
    }

    // Google ile giris (debounce korumali)
    googleLoginBtn.addEventListener('click', async () => {
        if (isLoginInProgress) return;
        isLoginInProgress = true;
        googleLoginBtn.disabled = true;
        googleLoginBtn.innerText = I18N.t('logging_in', 'Giris yapiliyor...');

        try {
            await SupabaseAuth.signInWithGoogle();
            await checkAuth();

            if (isYouTube) {
                analyzeBtn.disabled = false;
                loginWarning.style.display = 'none';
                loginWarning.classList.remove('active');
            }
        } catch (e) {
            let errorMsg = I18N.t('login_failed', 'Giris yapilamadi');
            if (e.message.includes('iptal') || e.message.includes('cancel')) {
                errorMsg = I18N.t('login_cancelled', 'Giris iptal edildi');
            } else if (e.message.includes('network') || e.message.includes('fetch')) {
                errorMsg = I18N.t('error_connection');
            }
            googleLoginBtn.innerText = errorMsg;
            setTimeout(() => {
                googleLoginBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    ${I18N.t('login_with_google')}`;
                googleLoginBtn.disabled = false;
            }, 2000);
        } finally {
            isLoginInProgress = false;
        }
    });

    // Cikis yap
    logoutBtn.addEventListener('click', async () => {
        await SupabaseAuth.signOut();
        isLoggedIn = false;
        loggedOutView.style.display = 'block';
        loggedInView.style.display = 'none';
        analyzeBtn.disabled = true;
        subStatus.innerText = '-';
        usageSection.style.display = 'none';
        if (isYouTube) {
            loginWarning.style.display = 'block';
            loginWarning.classList.add('active');
        }
    });

    // Analiz Baslat (debounce korumali)
    let isAnalyzing = false;
    analyzeBtn.addEventListener('click', async () => {
        if (!isYouTube || !isLoggedIn || isAnalyzing) return;
        isAnalyzing = true;

        analyzeBtn.classList.add('loading');
        analyzeBtn.disabled = true;

        try {
            chrome.runtime.sendMessage({ action: "START_ANALYSIS", tabId: tab.id });
            setTimeout(() => window.close(), 300);
        } catch (e) {
            analyzeBtn.classList.remove('loading');
            analyzeBtn.disabled = false;
            isAnalyzing = false;
        }
    });

    // Pro'ya yukselt
    proUpgradeBanner.addEventListener('click', () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=upgrade')
        });
        window.close();
    });

    // Gecmis Analizler
    dashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=history')
        });
        window.close();
    });
});
