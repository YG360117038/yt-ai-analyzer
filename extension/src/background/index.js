/**
 * Background Service Worker
 */

importScripts('../config.js');

// Sag tik menusu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "analyze-video",
        title: "Analyze Video with AI",
        contexts: ["page"],
        documentUrlPatterns: ["https://*.youtube.com/watch*"]
    });
});

// Menu tiklandiginda
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "analyze-video") {
        analyzeVideo(tab);
    }
});

// Popup'tan gelen mesajlar
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
});

async function analyzeVideo(tab) {
    try {
        // Content script inject et (retry ile)
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
                // Ikinci denemede devam et (zaten yuklenmis olabilir)
            }
        }

        // Kisa bekle (script'in yuklenmesi icin)
        if (injected) {
            await new Promise(r => setTimeout(r, 200));
        }

        // Verileri iste
        let videoData;
        try {
            videoData = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_DATA" });
        } catch (e) {
            throw new Error("Video verisi alınamadı. Sayfayı yenileyip tekrar deneyin.");
        }

        // Error response kontrolu
        if (videoData?.error) {
            throw new Error("Video verisi çıkarılırken hata: " + videoData.error);
        }

        if (!videoData || !videoData.videoId) {
            throw new Error("Video verisi alınamadı. Lütfen bir YouTube video sayfasında olduğunuzdan emin olun.");
        }

        // Gecici kaydet
        await chrome.storage.local.set({ "pending_analysis": videoData });

        // Dashboard ac
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=new')
        });

    } catch (error) {
        console.error("Analysis Error:", error.message);

        // Kullaniciya bildir
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (msg) => {
                    const existing = document.getElementById('yt-ai-notification');
                    if (existing) existing.remove();
                    const div = document.createElement('div');
                    div.id = 'yt-ai-notification';
                    div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#1a1a1a;color:#ff4444;padding:16px 24px;border-radius:12px;font-family:sans-serif;font-size:14px;border:1px solid #333;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:360px;';
                    div.innerHTML = `<strong style="color:#fff;display:block;margin-bottom:4px">Dion Youtube Analyzer</strong>${msg}`;
                    document.body.appendChild(div);
                    setTimeout(() => div.remove(), 5000);
                },
                args: [error.message || 'Bir sorun oluştu.']
            });
        } catch (e) {
            // Bildirim gosterilemedi
        }
    }
}
