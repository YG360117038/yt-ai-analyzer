/**
 * Background Service Worker
 */

importScripts('../config.js');

// Context menus on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "analyze-video",
        title: "Analyze Video with AI",
        contexts: ["page"],
        documentUrlPatterns: ["https://*.youtube.com/watch*"]
    });

    chrome.contextMenus.create({
        id: "analyze-channel",
        title: "Analyze Channel with AI",
        contexts: ["page"],
        documentUrlPatterns: [
            "https://*.youtube.com/@*",
            "https://*.youtube.com/channel/*",
            "https://*.youtube.com/c/*",
            "https://*.youtube.com/user/*"
        ]
    });
});

// Context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "analyze-video") {
        analyzeVideo(tab);
    }
    if (info.menuItemId === "analyze-channel") {
        analyzeChannel(tab);
    }
});

// Messages from popup / dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_ANALYSIS") {
        chrome.tabs.get(request.tabId, (tab) => {
            if (chrome.runtime.lastError) {
                console.error("Tab bulunamadi:", chrome.runtime.lastError.message);
                return;
            }
            analyzeVideo(tab);
        });
    }

    if (request.action === "START_CHANNEL_ANALYSIS") {
        chrome.tabs.get(request.tabId, (tab) => {
            if (chrome.runtime.lastError) {
                console.error("Tab bulunamadi:", chrome.runtime.lastError.message);
                return;
            }
            analyzeChannel(tab);
        });
    }
});

// ==================== VIDEO ANALYSIS ====================
async function analyzeVideo(tab) {
    try {
        let injected = false;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['src/content/scraper.js']
                });
                injected = true;
                break;
            } catch (e) {
                if (attempt === 0 && e.message?.includes('Cannot access')) {
                    throw new Error("Bu sayfada analiz yapılamıyor. Lütfen bir YouTube video sayfasında olduğunuzdan emin olun.");
                }
            }
        }

        if (injected) await new Promise(r => setTimeout(r, 200));

        let videoData;
        try {
            videoData = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_DATA" });
        } catch (e) {
            throw new Error("Video verisi alınamadı. Sayfayı yenileyip tekrar deneyin.");
        }

        if (videoData?.error) throw new Error("Video verisi çıkarılırken hata: " + videoData.error);
        if (!videoData || !videoData.videoId) {
            throw new Error("Video verisi alınamadı. Lütfen bir YouTube video sayfasında olduğunuzdan emin olun.");
        }

        await chrome.storage.local.set({ "pending_analysis": videoData });

        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=new')
        });

    } catch (error) {
        console.error("Video Analysis Error:", error.message);
        showPageNotification(tab.id, error.message || 'Bir sorun oluştu.');
    }
}

// ==================== CHANNEL ANALYSIS ====================
async function analyzeChannel(tab) {
    try {
        // Inject scraper
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/content/scraper.js']
            });
        } catch (e) {
            if (e.message?.includes('Cannot access')) {
                throw new Error("Bu sayfada analiz yapılamıyor.");
            }
        }

        await new Promise(r => setTimeout(r, 300));

        // Show loading notification on the page
        showPageNotification(tab.id, 'Kanal verileri toplanıyor... (15-30 saniye sürebilir)', 'info');

        let channelData;
        try {
            channelData = await chrome.tabs.sendMessage(tab.id, {
                action: "EXTRACT_CHANNEL_DATA",
                scrollCount: 6
            });
        } catch (e) {
            throw new Error("Kanal verisi alınamadı. Sayfayı yenileyip tekrar deneyin.");
        }

        if (channelData?.error) throw new Error("Kanal verisi çıkarılırken hata: " + channelData.error);
        if (!channelData || !channelData.channelName) {
            throw new Error("Kanal verisi alınamadı. Lütfen bir YouTube kanal sayfasında olduğunuzdan emin olun.");
        }

        if (!channelData.videos || channelData.videos.length === 0) {
            throw new Error("Bu kanalda video bulunamadı. Videos sekmesine geçip tekrar deneyin.");
        }

        await chrome.storage.local.set({ "pending_channel_analysis": channelData });

        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=channel')
        });

    } catch (error) {
        console.error("Channel Analysis Error:", error.message);
        showPageNotification(tab.id, error.message || 'Kanal analizi başlatılamadı.', 'error');
    }
}

// ==================== PAGE NOTIFICATION ====================
async function showPageNotification(tabId, message, type = 'error') {
    const color = type === 'info' ? '#3b82f6' : type === 'success' ? '#22c55e' : '#ff4444';
    const bgColor = type === 'info' ? '#1e3a5f' : type === 'success' ? '#14532d' : '#1a1a1a';

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (msg, color, bgColor) => {
                const existing = document.getElementById('yt-ai-notification');
                if (existing) existing.remove();
                const div = document.createElement('div');
                div.id = 'yt-ai-notification';
                div.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;background:${bgColor};color:${color};padding:16px 24px;border-radius:12px;font-family:Inter,sans-serif;font-size:14px;border:1px solid ${color}44;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:360px;line-height:1.5;`;
                const strong = document.createElement('strong');
                strong.style.cssText = `color:#fff;display:block;margin-bottom:4px;font-size:13px`;
                strong.textContent = 'Dion Youtube Analyzer';
                div.appendChild(strong);
                div.appendChild(document.createTextNode(msg));
                document.body.appendChild(div);
                setTimeout(() => div.remove(), 6000);
            },
            args: [message, color, bgColor]
        });
    } catch (e) {
        // Notification failed silently
    }
}
