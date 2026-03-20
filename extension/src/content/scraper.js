/**
 * YouTube Video & Channel Data Scraper
 */

// ==================== VIDEO PAGE SCRAPER ====================
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

// Scroll for comments
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

// ==================== CHANNEL PAGE SCRAPER ====================
function extractChannelData() {
    // Channel name - multiple selector strategies
    const channelName =
        document.querySelector('ytd-channel-name yt-formatted-string#text')?.innerText
        || document.querySelector('#channel-header-container #channel-name')?.innerText
        || document.querySelector('ytd-c4-tabbed-header-renderer #channel-name yt-formatted-string')?.innerText
        || document.querySelector('meta[property="og:title"]')?.content
        || document.title.replace(' - YouTube', '')
        || '';

    // Subscriber count
    const subscriberCount =
        document.querySelector('#subscriber-count')?.innerText
        || document.querySelector('yt-formatted-string#subscriber-count')?.innerText
        || document.querySelector('[id="subscriber-count"]')?.innerText
        || '';

    // Channel avatar
    const channelAvatar =
        document.querySelector('#avatar img')?.src
        || document.querySelector('ytd-c4-tabbed-header-renderer img')?.src
        || '';

    // Channel URL / handle
    const channelUrl = window.location.href;
    const channelHandle = channelUrl.match(/youtube\.com\/@([^/?]+)/)?.[1]
        || channelUrl.match(/youtube\.com\/channel\/([^/?]+)/)?.[1]
        || '';

    // Extract video list from the page
    const videos = extractChannelVideos();

    return {
        channelName: channelName.trim(),
        channelHandle,
        subscriberCount: subscriberCount.trim(),
        channelAvatar,
        channelUrl,
        videos,
        scrapedAt: new Date().toISOString()
    };
}

function extractChannelVideos() {
    const videos = [];

    // Primary: ytd-rich-item-renderer (main channel page / Videos tab)
    const richItems = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer');
    richItems.forEach(item => {
        try {
            const titleEl = item.querySelector('#video-title, #video-title-link');
            const title = titleEl?.innerText?.trim() || titleEl?.getAttribute('title') || '';
            if (!title) return;

            const href = titleEl?.href || item.querySelector('a#thumbnail')?.href || '';
            const videoId = href.match(/[?&]v=([^&]+)/)?.[1] || '';
            if (!videoId) return;

            const thumbnail = item.querySelector('img')?.src || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

            const viewCountEl = item.querySelector('#metadata-line span:first-child, .ytd-video-meta-block span:first-child');
            const viewCount = viewCountEl?.innerText?.trim() || '';

            const publishDateEl = item.querySelector('#metadata-line span:last-child, .ytd-video-meta-block span:last-child');
            const publishDate = publishDateEl?.innerText?.trim() || '';

            const durationEl = item.querySelector('ytd-thumbnail-overlay-time-status-renderer .badge-shape-wiz__text, span.ytd-thumbnail-overlay-time-status-renderer');
            const duration = durationEl?.innerText?.trim() || '';

            if (videoId && title) {
                videos.push({ videoId, title, thumbnail, viewCount, publishDate, duration });
            }
        } catch (e) { /* skip bad items */ }
    });

    // Secondary: ytd-video-renderer (search results, shelf items)
    if (videos.length === 0) {
        const videoRenderers = document.querySelectorAll('ytd-video-renderer');
        videoRenderers.forEach(item => {
            try {
                const titleEl = item.querySelector('#video-title');
                const title = titleEl?.innerText?.trim() || '';
                if (!title) return;

                const href = titleEl?.href || '';
                const videoId = href.match(/[?&]v=([^&]+)/)?.[1] || '';
                if (!videoId) return;

                const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                const viewCount = item.querySelector('#metadata-line span:first-child')?.innerText?.trim() || '';
                const publishDate = item.querySelector('#metadata-line span:last-child')?.innerText?.trim() || '';
                const duration = item.querySelector('.ytd-thumbnail-overlay-time-status-renderer')?.innerText?.trim() || '';

                videos.push({ videoId, title, thumbnail, viewCount, publishDate, duration });
            } catch (e) { /* skip */ }
        });
    }

    return videos.slice(0, 30); // max 30 videos
}

// Scroll channel page to load more videos
async function scrollChannelForVideos(maxScrolls = 8) {
    for (let i = 0; i < maxScrolls; i++) {
        window.scrollBy(0, 1200);
        await new Promise(r => setTimeout(r, 1500));
    }
    // Scroll back to top
    window.scrollTo(0, 0);
}

// ==================== MESSAGE LISTENER ====================
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
        return true;
    }

    if (request.action === "EXTRACT_CHANNEL_DATA") {
        // First extract what's visible, then optionally scroll for more
        const quickData = extractChannelData();
        if (quickData.videos.length >= 5) {
            sendResponse(quickData);
        } else {
            // Scroll to load videos then extract
            scrollChannelForVideos(request.scrollCount || 5)
                .then(() => {
                    try {
                        const data = extractChannelData();
                        sendResponse(data);
                    } catch (e) {
                        sendResponse({ error: e.message || 'Kanal verisi çıkarılırken hata oluştu.' });
                    }
                })
                .catch(e => {
                    sendResponse({ error: e.message || 'Kanal scroll hatası.' });
                });
            return true;
        }
    }

    return true;
});
