document.addEventListener('DOMContentLoaded', async () => {
    const analyzeBtn = document.getElementById('analyze-btn');
    const dashboardBtn = document.getElementById('dashboard-btn');
    const videoPreview = document.getElementById('video-preview');
    const warning = document.getElementById('not-youtube-warning');

    // Aktif tab'i kontrol et
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isYouTube = tab?.url?.includes("youtube.com/watch");

    if (isYouTube) {
        videoPreview.classList.add('active');
        analyzeBtn.disabled = false;

        const videoId = new URL(tab.url).searchParams.get('v');
        if (videoId) {
            document.getElementById('preview-thumb').src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        }
        document.getElementById('preview-title').innerText = tab.title?.replace(' - YouTube', '') || 'Video';
        document.getElementById('preview-channel').innerText = 'YouTube';
    } else {
        warning.classList.add('active');
        analyzeBtn.disabled = true;
    }

    // Analiz Baslat
    analyzeBtn.addEventListener('click', async () => {
        if (!isYouTube) return;

        analyzeBtn.classList.add('loading');
        analyzeBtn.disabled = true;

        try {
            chrome.runtime.sendMessage({ action: "START_ANALYSIS", tabId: tab.id });
            setTimeout(() => window.close(), 300);
        } catch (e) {
            analyzeBtn.classList.remove('loading');
            analyzeBtn.disabled = false;
            console.error("Analysis error:", e);
        }
    });

    // Gecmis Analizler
    dashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=history')
        });
        window.close();
    });
});
