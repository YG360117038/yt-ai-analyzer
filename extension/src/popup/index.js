document.addEventListener('DOMContentLoaded', async () => {
    await I18N.init();
    I18N.applyToDOM();

    const analyzeBtn = document.getElementById('analyze-btn');
    const channelBtn = document.getElementById('channel-btn');
    const dashboardBtn = document.getElementById('dashboard-btn');
    const previewCard = document.getElementById('preview-card');
    const notYoutubeWarning = document.getElementById('not-youtube-warning');
    const loginWarning = document.getElementById('login-warning');
    const pageIndicator = document.getElementById('page-indicator');
    const pageIndicatorText = document.getElementById('page-indicator-text');

    const loggedOutView = document.getElementById('logged-out-view');
    const loggedInView = document.getElementById('logged-in-view');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const subStatus = document.getElementById('sub-status');

    const ringProgress = document.getElementById('ring-progress');
    const ringValue = document.getElementById('ring-value');
    const ringRemainingText = document.getElementById('ring-remaining-text');
    const ringUsedText = document.getElementById('ring-used-text');
    const usageSection = document.getElementById('usage-section');
    const proUpgradeBanner = document.getElementById('pro-upgrade-banner');

    let isLoggedIn = false;
    let isLoginInProgress = false;
    let currentPageType = 'other'; // 'video' | 'channel' | 'other'

    function updateRing(isPro) {
        if (isPro) {
            ringValue.textContent = '\u221E';
            ringValue.style.color = '#22c55e';
            ringRemainingText.textContent = I18N.t('unlimited', 'Sınırsız');
            ringUsedText.textContent = I18N.t('pro_plan');
            setTimeout(() => { ringProgress.style.strokeDashoffset = 0; }, 300);
        } else {
            ringValue.textContent = 'Free';
            ringValue.style.fontSize = '14px';
            ringRemainingText.textContent = I18N.t('score_only', 'Sadece skor görünür');
            ringUsedText.textContent = I18N.t('pro_full_access_short', 'Pro ile tam erişim');
            ringValue.style.color = '#d29922';
            setTimeout(() => { ringProgress.style.strokeDashoffset = 201.1 * 0.7; }, 300);
        }
    }

    async function checkAuth() {
        const token = await SupabaseAuth.getToken();

        if (token) {
            isLoggedIn = true;
            loggedOutView.style.display = 'none';
            loggedInView.style.display = 'block';
            loginWarning.classList.remove('active');

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
                    subStatus.style.color = '#22c55e';
                    updateRing(true);
                    proUpgradeBanner.classList.remove('active');
                } else {
                    subStatus.innerText = I18N.t('free');
                    subStatus.style.color = '#d29922';
                    updateRing(false);
                    proUpgradeBanner.classList.add('active');
                }
            } catch (e) {
                subStatus.innerText = I18N.t('logged_in', 'Giriş yapıldı');
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

    // Detect active tab type
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    const isVideoPage = url.includes("youtube.com/watch");
    const isChannelPage = /youtube\.com\/@[^/]+/.test(url)
        || /youtube\.com\/channel\/[^/]+/.test(url)
        || /youtube\.com\/c\/[^/]+/.test(url)
        || /youtube\.com\/user\/[^/]+/.test(url);

    if (isVideoPage) {
        currentPageType = 'video';

        // Page indicator
        pageIndicator.style.display = 'flex';
        pageIndicator.className = 'page-indicator video-page';
        pageIndicatorText.textContent = I18N.t('on_video_page', 'Video sayfasındasınız');

        // Preview
        previewCard.classList.add('active');
        const videoId = new URL(url).searchParams.get('v');
        if (videoId) {
            document.getElementById('preview-thumb').src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        }
        document.getElementById('preview-title').innerText = tab.title?.replace(' - YouTube', '') || 'Video';
        document.getElementById('preview-subtitle').innerText = I18N.t('youtube_video', 'YouTube Video');

        // Show video button, hide channel button
        analyzeBtn.style.display = '';
        channelBtn.style.display = 'none';

        if (isLoggedIn) {
            analyzeBtn.disabled = false;
        } else {
            analyzeBtn.disabled = true;
            loginWarning.classList.add('active');
        }

    } else if (isChannelPage) {
        currentPageType = 'channel';

        // Page indicator
        pageIndicator.style.display = 'flex';
        pageIndicator.className = 'page-indicator channel-page';
        pageIndicatorText.textContent = I18N.t('on_channel_page', 'Kanal sayfasındasınız');

        // Preview
        previewCard.classList.add('active');
        document.getElementById('preview-thumb').style.display = 'none';

        // Extract channel name from URL
        const channelMatch = url.match(/youtube\.com\/@([^/?]+)/)
            || url.match(/youtube\.com\/channel\/([^/?]+)/)
            || url.match(/youtube\.com\/c\/([^/?]+)/);
        const channelName = channelMatch?.[1] || tab.title?.replace(' - YouTube', '') || 'Kanal';
        document.getElementById('preview-title').innerText = channelName;
        document.getElementById('preview-subtitle').innerText = I18N.t('youtube_channel', 'YouTube Kanalı');

        // Show channel button, hide video button
        analyzeBtn.style.display = 'none';
        channelBtn.style.display = '';

        if (isLoggedIn) {
            channelBtn.disabled = false;
        } else {
            channelBtn.disabled = true;
            loginWarning.classList.add('active');
        }

    } else {
        currentPageType = 'other';
        notYoutubeWarning.classList.add('active');
        analyzeBtn.disabled = true;
        channelBtn.style.display = 'none';
    }

    // Google login
    googleLoginBtn.addEventListener('click', async () => {
        if (isLoginInProgress) return;
        isLoginInProgress = true;
        googleLoginBtn.disabled = true;
        googleLoginBtn.innerText = I18N.t('logging_in', 'Giriş yapılıyor...');

        try {
            await SupabaseAuth.signInWithGoogle();
            await checkAuth();

            if (currentPageType === 'video') {
                analyzeBtn.disabled = false;
                loginWarning.classList.remove('active');
            } else if (currentPageType === 'channel') {
                channelBtn.disabled = false;
                loginWarning.classList.remove('active');
            }
        } catch (e) {
            let errorMsg = I18N.t('login_failed', 'Giriş yapılamadı');
            if (e.message.includes('iptal') || e.message.includes('cancel')) {
                errorMsg = I18N.t('login_cancelled', 'Giriş iptal edildi');
            } else if (e.message.includes('network') || e.message.includes('fetch')) {
                errorMsg = I18N.t('error_connection');
            }
            googleLoginBtn.innerText = errorMsg;
            setTimeout(() => {
                googleLoginBtn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    ${I18N.t('login_with_google')}`;
                googleLoginBtn.disabled = false;
            }, 2000);
        } finally {
            isLoginInProgress = false;
        }
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
        await SupabaseAuth.signOut();
        isLoggedIn = false;
        loggedOutView.style.display = 'block';
        loggedInView.style.display = 'none';
        analyzeBtn.disabled = true;
        channelBtn.disabled = true;
        subStatus.innerText = '-';
        usageSection.style.display = 'none';
        if (currentPageType !== 'other') {
            loginWarning.classList.add('active');
        }
    });

    // Analyze video
    let isAnalyzing = false;
    analyzeBtn.addEventListener('click', async () => {
        if (currentPageType !== 'video' || !isLoggedIn || isAnalyzing) return;
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

    // Analyze channel
    let isChannelAnalyzing = false;
    channelBtn.addEventListener('click', async () => {
        if (currentPageType !== 'channel' || !isLoggedIn || isChannelAnalyzing) return;
        isChannelAnalyzing = true;
        channelBtn.classList.add('loading');
        channelBtn.disabled = true;
        try {
            chrome.runtime.sendMessage({ action: "START_CHANNEL_ANALYSIS", tabId: tab.id });
            setTimeout(() => window.close(), 300);
        } catch (e) {
            channelBtn.classList.remove('loading');
            channelBtn.disabled = false;
            isChannelAnalyzing = false;
        }
    });

    // Pro upgrade
    proUpgradeBanner.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.skool.com/omnicore-8861' });
        window.close();
    });

    // History
    dashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=history')
        });
        window.close();
    });
});
