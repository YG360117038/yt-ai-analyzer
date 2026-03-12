/**
 * YouTube Video Data Scraper
 * Videodan maksimum veri cikarir
 */

function extractVideoData() {
    const title = document.querySelector('h1.style-scope.ytd-watch-metadata yt-formatted-string')?.innerText
        || document.querySelector('h1.style-scope.ytd-watch-metadata')?.innerText
        || document.title.replace(' - YouTube', '')
        || "";

    const description = document.querySelector('#description-inline-expander yt-attributed-string')?.innerText
        || document.querySelector('#description-inline-expander .ytd-text-inline-expander span')?.innerText
        || document.querySelector('#description yt-attributed-string')?.innerText
        || "";

    const channelName = document.querySelector('#owner #channel-name a')?.innerText
        || document.querySelector('ytd-channel-name a')?.innerText
        || "";

    const subscriberCount = document.querySelector('#owner-sub-count')?.innerText
        || document.querySelector('yt-formatted-string#owner-sub-count')?.innerText
        || "";

    const viewCount = document.querySelector('ytd-video-view-count-renderer span')?.innerText
        || document.querySelector('#info-container span:first-child')?.innerText
        || "";

    const publishDate = document.querySelector('#info-strings yt-formatted-string')?.innerText
        || document.querySelector('#info-container span:last-child')?.innerText
        || "";

    const likeCount = document.querySelector('#segmented-like-button button')?.getAttribute('aria-label')
        || document.querySelector('ytd-menu-renderer yt-formatted-string')?.innerText
        || "";

    const duration = document.querySelector('.ytp-time-duration')?.innerText || "";

    const tags = Array.from(document.querySelectorAll('meta[property="og:video:tag"]')).map(m => m.content);

    const hashtagElements = document.querySelectorAll('a[href*="/hashtag/"]');
    const hashtags = Array.from(hashtagElements).map(el => el.innerText).filter(Boolean);

    const comments = Array.from(document.querySelectorAll('#content-text'))
        .slice(0, 30)
        .map(c => c.innerText)
        .filter(c => c.trim().length > 0);

    const videoId = new URLSearchParams(window.location.search).get('v');
    const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    const channelAvatar = document.querySelector('#owner img')?.src
        || document.querySelector('ytd-video-owner-renderer img')?.src
        || "";

    return {
        videoId,
        title,
        description,
        channelName,
        subscriberCount,
        viewCount,
        publishDate,
        likeCount,
        duration,
        tags,
        hashtags,
        comments,
        thumbnail,
        channelAvatar,
        url: window.location.href,
        scrapedAt: new Date().toISOString()
    };
}

// Yorumlari yuklemek icin sayfayi kaydir
async function scrollForComments(maxScrolls = 5) {
    const commentsSection = document.querySelector('#comments');
    if (!commentsSection) return;
    commentsSection.scrollIntoView({ behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 1500));
    for (let i = 0; i < maxScrolls; i++) {
        window.scrollBy(0, 800);
        await new Promise(r => setTimeout(r, 1000));
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTRACT_DATA") {
        try {
            const data = extractVideoData();
            sendResponse(data);
        } catch (e) {
            sendResponse({ error: e.message || 'Video verisi çıkarılırken hata oluştu.' });
        }
    }

    if (request.action === "SCROLL_FOR_COMMENTS") {
        scrollForComments(request.scrollCount || 5)
            .then(() => {
                try {
                    const data = extractVideoData();
                    sendResponse(data);
                } catch (e) {
                    sendResponse({ error: e.message || 'Yorum yükleme hatası.' });
                }
            })
            .catch(e => {
                sendResponse({ error: e.message || 'Scroll hatası.' });
            });
        return true; // async response
    }

    return true;
});
