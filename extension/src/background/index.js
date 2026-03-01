/**
 * Background Service Worker - Enhanced
 */

importScripts('../config.js');
const BACKEND_URL = CONFIG.BACKEND_URL;

// Sag tik menusu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "analyze-video",
        title: "AI ile Videoyu Analiz Et",
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
            analyzeVideo(tab);
        });
    }
});

async function analyzeVideo(tab) {
    console.log("Analysis started for tab:", tab.id);
    try {
        // Content script'in yuklenmis oldugundan emin ol
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/content/scraper.js']
            });
        } catch (e) {
            // Zaten yuklenmis olabilir, devam et
            console.log("Script may already be injected:", e.message);
        }

        // Verileri iste
        let videoData;
        try {
            videoData = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_DATA" });
        } catch (e) {
            throw new Error("Video verisi alinamadi. Sayfayi yenileyip tekrar deneyin.");
        }

        console.log("Data extracted:", videoData?.videoId);

        if (!videoData || !videoData.videoId) {
            throw new Error("Video verisi alinamadi. Lutfen bir YouTube video sayfasinda oldugunuzdan emin olun.");
        }

        // Gecici kaydet
        await chrome.storage.local.set({ "pending_analysis": videoData });

        // Dashboard ac
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html?mode=new')
        });

    } catch (error) {
        console.error("Analysis Error:", error);

        // Kullaniciya bildir - tab uzerinde mesaj goster
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (msg) => {
                    const div = document.createElement('div');
                    div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#1a1a1a;color:#ff4444;padding:16px 24px;border-radius:12px;font-family:sans-serif;font-size:14px;border:1px solid #333;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:360px;';
                    div.innerHTML = `<strong style="color:#fff;display:block;margin-bottom:4px">YT AI Analyzer</strong>${msg}`;
                    document.body.appendChild(div);
                    setTimeout(() => div.remove(), 5000);
                },
                args: [error.message || 'Bir sorun olustu.']
            });
        } catch (e) {
            // Fallback
            console.error("Could not show notification:", e);
        }
    }
}
