const BACKEND_URL = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) || "http://localhost:3000";

// Mermaid initialize (CSP uyumlu - inline script yerine)
if (typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
}

// Auth header'li fetch helper
async function authFetch(url, options = {}) {
    const token = await SupabaseAuth.getToken();
    if (!token) {
        throw new Error('AUTH_REQUIRED');
    }
    const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    return fetch(url, { ...options, headers });
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const analysisId = urlParams.get('id');
    const mode = urlParams.get('mode');

    const loadingScreen = document.getElementById('loading-screen');
    const statusText = document.getElementById('status-text');
    const progressBar = document.getElementById('main-progress');

    // ==================== TAB SWITCHING ====================
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            if (!tabName) return;

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `tab-${tabName}`) {
                    content.classList.add('active');
                }
            });

            // Gecmis tabina gecildiginde yukle
            if (tabName === 'history') loadHistory();
        });
    });

    // ==================== INIT ====================
    if (mode === 'new') {
        startNewAnalysis();
    } else if (mode === 'history') {
        loadingScreen.style.display = 'none';
        document.getElementById('main-header').style.display = 'none';
        // History tabina gecis
        navItems.forEach(n => n.classList.remove('active'));
        document.querySelector('[data-tab="history"]').classList.add('active');
        tabContents.forEach(t => t.classList.remove('active'));
        document.getElementById('tab-history').classList.add('active');
        loadHistory();
    } else if (analysisId) {
        loadingScreen.style.display = 'none';
        loadAnalysis(analysisId);
    } else {
        loadingScreen.style.display = 'none';
    }

    // ==================== NEW ANALYSIS ====================
    async function startNewAnalysis() {
        try {
            setStep(1);
            updateProgress("Video Verileri Hazirlaniyor...", 15);
            const result = await chrome.storage.local.get("pending_analysis");
            const videoData = result.pending_analysis;

            if (!videoData) {
                statusText.innerText = "Hata: Video verisi bulunamadi.";
                statusText.style.color = "#ff0000";
                return;
            }

            setStep(2);
            updateProgress("AI Analizi Yapiliyor...", 40);

            const response = await authFetch(`${BACKEND_URL}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(videoData)
            });

            if (response.status === 403) {
                const err = await response.json().catch(() => ({}));
                if (err.requiresUpgrade) {
                    showPaywall();
                    return;
                }
            }

            if (response.status === 401) {
                statusText.innerText = "Lutfen once giris yapin.";
                statusText.style.color = "#ff0000";
                return;
            }

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || "Backend analizi basarisiz oldu.");
            }

            setStep(3);
            updateProgress("Sonuclar Isleniyor...", 75);

            const data = await response.json();

            setStep(4);
            updateProgress("Rapor Hazirlaniyor...", 95);

            renderAnalysis(data);

            // Temizle
            await chrome.storage.local.remove("pending_analysis");

            setTimeout(() => {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.style.display = 'none', 400);
            }, 500);

        } catch (error) {
            console.error("Analiz Hatasi:", error);
            statusText.innerText = "Hata: " + error.message;
            statusText.style.color = "#ff0000";
            document.querySelector('.loading-subtext').innerText = "Lutfen backend'in calistigini kontrol edin.";
        }
    }

    function updateProgress(text, percent) {
        statusText.innerText = text;
        progressBar.style.width = `${percent}%`;
    }

    function setStep(num) {
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById(`step-${i}`);
            step.className = 'step';
            if (i < num) step.className = 'step done';
            if (i === num) step.className = 'step active';
        }
    }

    // ==================== LOAD EXISTING ====================
    async function loadAnalysis(id) {
        try {
            const response = await authFetch(`${BACKEND_URL}/api/analysis/${id}`);
            if (!response.ok) throw new Error("Analiz yuklenemedi.");
            const data = await response.json();
            renderAnalysis(data);
        } catch (error) {
            if (error.message === 'AUTH_REQUIRED') {
                showToast("Lutfen giris yapin.");
                return;
            }
            console.error("Yukleme hatasi:", error);
            showToast("Analiz yuklenirken hata olustu.");
        }
    }

    // ==================== RENDER ====================
    let currentAnalysisData = null;

    function renderAnalysis(data) {
        currentAnalysisData = data;
        const results = data.analysis_results;
        const metadata = data.video_metadata;

        // Header
        document.getElementById('video-title').innerText = metadata.title || "Video Analizi";
        document.getElementById('channel-name').innerText = metadata.channelName || "Bilinmeyen";
        document.getElementById('channel-img').src = metadata.channelAvatar || metadata.thumbnail || "";

        if (metadata.viewCount) {
            document.getElementById('meta-views').style.display = 'flex';
            document.getElementById('view-count').innerText = metadata.viewCount;
        }
        if (metadata.publishDate) {
            document.getElementById('meta-date').style.display = 'flex';
            document.getElementById('publish-date').innerText = metadata.publishDate;
        }

        // Score Banner
        if (results.video_score) {
            renderScoreBanner(results.video_score);
        }

        // Containers
        const containers = {
            analysis: document.getElementById('analysis-content'),
            prompts: document.getElementById('prompts-content'),
            notebook: document.getElementById('notebook-content'),
            scripts: document.getElementById('scripts-content'),
            characters: document.getElementById('characters-content'),
            video: document.getElementById('video-content')
        };

        Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });

        // Mermaid
        if (results.video_flow_mermaid) {
            const flowSection = document.getElementById('flow-section');
            flowSection.style.display = 'flex';
            const mermaidDiv = document.getElementById('mermaid-chart');
            const cleanCode = results.video_flow_mermaid.replace(/```mermaid|```/g, "").trim();
            mermaidDiv.textContent = cleanCode;
            mermaidDiv.removeAttribute('data-processed');
            try { mermaid.contentLoaded(); } catch (e) { console.warn("Mermaid render error:", e); }
        }

        // Categorize & Render
        const categoryMap = {
            // Analysis tab
            'video_score': 'skip',
            'content_style_breakdown': 'analysis',
            'psychological_triggers': 'analysis',
            'hook_structure': 'analysis',
            'retention_strategy': 'analysis',
            'thumbnail_psychology': 'analysis',
            'target_audience': 'analysis',
            'tone_analysis': 'analysis',
            'script_reverse_engineering': 'analysis',
            'cta_strategy': 'analysis',
            'competitor_analysis': 'analysis',
            'comment_sentiment': 'analysis',

            // Prompts tab
            'ai_prompts_toolkit': 'prompts',
            'content_repurpose_ideas': 'prompts',
            'monetization_ideas': 'prompts',

            // Notebook tab
            'video_flow_mermaid': 'skip',
            'deep_digest_summary': 'notebook',
            'notebook_podcast_script': 'notebook',
            'audience_retention_heatmap': 'notebook',

            // Scripts tab
            'similar_video_prompts': 'scripts',
            'viral_hook_prompts': 'scripts',
            'title_variations': 'scripts',
            'seo_descriptions': 'scripts',
            'high_ctr_titles': 'scripts',
            'thumbnail_text_ideas': 'scripts',
            'seo_tags': 'scripts',
            'full_script_template': 'scripts',
            'hook_variations': 'scripts',
            'storytelling_framework': 'scripts',

            // Characters tab
            'aggressive_sales': 'characters',
            'calm_educational': 'characters',
            'documentary': 'characters',
            'motivational': 'characters',
            'controversial': 'characters',

            // Video Production tab
            'video_production': 'video_custom',
            'ai_video_prompts': 'video',
            'b_roll_suggestions': 'video'
        };

        Object.entries(results).forEach(([key, value]) => {
            const category = categoryMap[key] || 'analysis';
            if (category === 'skip') return;

            // Video production ozel render
            if (category === 'video_custom') {
                renderVideoProduction(value, containers.video);
                return;
            }

            const container = containers[category];
            if (!container) return;

            const isPromptType = isPromptKey(key);
            const card = createCard(key, value, isPromptType);
            container.appendChild(card);
        });
    }

    function isPromptKey(key) {
        const promptKeys = [
            'similar_video_prompts', 'viral_hook_prompts', 'title_variations',
            'seo_descriptions', 'high_ctr_titles', 'thumbnail_text_ideas',
            'hook_variations', 'seo_tags', 'content_repurpose_ideas',
            'monetization_ideas', 'runway_prompts', 'luma_prompts',
            'kling_prompts', 'shorts_reels_prompts', 'thumbnail_dalle_prompts',
            'b_roll_suggestions'
        ];
        return promptKeys.includes(key);
    }

    // ==================== VIDEO PRODUCTION ====================
    function renderVideoProduction(data, container) {
        if (!container || !data) return;

        // Style info
        if (data.overall_style || data.color_palette || data.music_mood) {
            const styleCard = document.createElement('div');
            styleCard.className = 'card card-full';
            styleCard.innerHTML = `
                <div class="card-header">
                    <h3>Video Stil Rehberi</h3>
                </div>
                <div class="style-grid">
                    ${data.overall_style ? `<div class="style-item"><div class="style-label">Gorsel Stil</div><div class="style-value">${data.overall_style}</div></div>` : ''}
                    ${data.color_palette ? `<div class="style-item"><div class="style-label">Renk Paleti</div><div class="style-value">${data.color_palette}</div></div>` : ''}
                    ${data.music_mood ? `<div class="style-item"><div class="style-label">Muzik Tarzi</div><div class="style-value">${data.music_mood}</div></div>` : ''}
                    ${data.transition_style ? `<div class="style-item"><div class="style-label">Gecis Efekti</div><div class="style-value">${data.transition_style}</div></div>` : ''}
                    ${data.aspect_ratio_recommendation ? `<div class="style-item"><div class="style-label">En-Boy Orani</div><div class="style-value">${data.aspect_ratio_recommendation}</div></div>` : ''}
                </div>
            `;
            container.appendChild(styleCard);
        }

        // Storyboard
        if (data.storyboard && Array.isArray(data.storyboard)) {
            const storyCard = document.createElement('div');
            storyCard.className = 'card card-full';
            storyCard.innerHTML = `<div class="card-header"><h3>Storyboard - Sahne Sahne</h3><button class="copy-btn" id="copy-all-scenes">Tum Prompt'lari Kopyala</button></div>`;

            const storyContent = document.createElement('div');

            data.storyboard.forEach((scene, i) => {
                const item = document.createElement('div');
                item.className = 'storyboard-item';
                item.innerHTML = `
                    <div class="storyboard-header">
                        <div style="display:flex;align-items:center;gap:10px">
                            <div class="scene-number">${scene.sahne || (i + 1)}</div>
                            <strong style="font-size:14px;color:var(--text)">${scene.aciklama || ''}</strong>
                        </div>
                        <span class="scene-time">${scene.sure || ''}</span>
                    </div>
                    <div class="storyboard-details">
                        <div class="storyboard-detail"><span class="label">Kamera</span><span class="value">${scene.kamera || '-'}</span></div>
                        <div class="storyboard-detail"><span class="label">Ses/Muzik</span><span class="value">${scene.ses || '-'}</span></div>
                        ${scene.metin ? `<div class="storyboard-detail"><span class="label">Ekran Metni</span><span class="value">${scene.metin}</span></div>` : ''}
                    </div>
                    ${scene.ai_video_prompt ? `
                        <div class="ai-prompt-box" data-prompt="${encodeURIComponent(scene.ai_video_prompt)}">
                            <div class="prompt-label"><span>AI VIDEO PROMPT</span><span style="font-size:10px;opacity:0.6">tikla kopyala</span></div>
                            <div class="prompt-text">${scene.ai_video_prompt}</div>
                        </div>
                    ` : ''}
                `;
                storyContent.appendChild(item);
            });

            storyCard.appendChild(storyContent);
            container.appendChild(storyCard);

            // Prompt kopyalama eventleri
            storyCard.querySelectorAll('.ai-prompt-box').forEach(box => {
                box.addEventListener('click', () => {
                    const prompt = decodeURIComponent(box.dataset.prompt);
                    copyToClipboard(prompt);
                    showToast("AI Video prompt kopyalandi!");
                });
            });

            // Tum promptlari kopyala
            const copyAllBtn = storyCard.querySelector('#copy-all-scenes');
            if (copyAllBtn) {
                copyAllBtn.addEventListener('click', () => {
                    const allPrompts = data.storyboard
                        .filter(s => s.ai_video_prompt)
                        .map((s, i) => `Scene ${i + 1} (${s.sure || ''}):\n${s.ai_video_prompt}`)
                        .join('\n\n');
                    copyToClipboard(allPrompts);
                    showToast("Tum sahne prompt'lari kopyalandi!");
                    copyAllBtn.innerText = 'Kopyalandi!';
                    copyAllBtn.classList.add('copied');
                    setTimeout(() => {
                        copyAllBtn.innerText = 'Tum Prompt\'lari Kopyala';
                        copyAllBtn.classList.remove('copied');
                    }, 2000);
                });
            }
        }
    }

    // ==================== SCORE BANNER ====================
    function renderScoreBanner(score) {
        const banner = document.getElementById('score-banner');
        banner.style.display = 'grid';
        banner.innerHTML = '';

        const items = [
            { label: 'Genel Puan', value: score.overall_score },
            { label: 'SEO', value: score.seo_score },
            { label: 'Etkilesim', value: score.engagement_score },
            { label: 'Viral Potansiyel', value: score.viral_potential },
            { label: 'Icerik Kalitesi', value: score.content_quality }
        ];

        items.forEach(item => {
            const val = parseInt(item.value) || 0;
            const div = document.createElement('div');
            div.className = 'score-item';
            div.innerHTML = `
                <div class="score-value ${val >= 70 ? 'score-high' : val >= 40 ? 'score-mid' : 'score-low'}">${val}</div>
                <div class="score-label">${item.label}</div>
            `;
            banner.appendChild(div);
        });

        if (score.verdict) {
            const verdict = document.createElement('div');
            verdict.className = 'score-item';
            verdict.style.gridColumn = '1 / -1';
            verdict.innerHTML = `<div style="font-size:14px;color:var(--text-mid);line-height:1.6">${score.verdict}</div>`;
            banner.appendChild(verdict);
        }
    }

    // ==================== CARD CREATION ====================
    function createCard(key, value, isPromptType) {
        const card = document.createElement('div');
        card.className = 'card';

        // Header
        const header = document.createElement('div');
        header.className = 'card-header';

        const title = document.createElement('h3');
        title.innerText = formatLabel(key);
        header.appendChild(title);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerText = 'Kopyala';
        copyBtn.addEventListener('click', () => {
            const text = extractText(value);
            copyToClipboard(text);
            copyBtn.innerText = 'Kopyalandi!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.innerText = 'Kopyala';
                copyBtn.classList.remove('copied');
            }, 2000);
        });
        header.appendChild(copyBtn);
        card.appendChild(header);

        // Content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'card-body';

        if (isPromptType && Array.isArray(value)) {
            renderPromptList(value, contentDiv);
        } else {
            renderValue(value, contentDiv, key);
        }

        card.appendChild(contentDiv);
        return card;
    }

    // ==================== RENDER HELPERS ====================
    function renderPromptList(items, container) {
        const list = document.createElement('div');
        list.className = 'prompt-list';

        items.forEach(item => {
            const text = typeof item === 'object' ? JSON.stringify(item) : String(item);
            const div = document.createElement('div');
            div.className = 'prompt-item';
            div.innerText = text;
            div.addEventListener('click', () => {
                copyToClipboard(text);
                div.classList.add('copied-item');
                setTimeout(() => div.classList.remove('copied-item'), 1500);
                showToast("Panoya kopyalandi!");
            });
            list.appendChild(div);
        });

        container.appendChild(list);
    }

    function renderValue(value, container, key = "") {
        if (value === null || value === undefined) return;

        // Heatmap
        if (key.includes('heatmap') && Array.isArray(value)) {
            const heatmap = document.createElement('div');
            heatmap.className = 'heatmap-container';
            value.forEach(val => {
                const bar = document.createElement('div');
                bar.className = 'heatmap-bar';
                bar.style.height = `${Math.min(100, Math.max(5, val))}%`;
                bar.title = `Tahmini Ilgi: %${val}`;
                heatmap.appendChild(bar);
            });
            container.appendChild(heatmap);
            return;
        }

        // Podcast Script
        if (key.includes('podcast_script') && typeof value === 'string') {
            const scriptDiv = document.createElement('div');
            scriptDiv.className = 'podcast-script';
            const lines = value.split('\n');
            lines.forEach(line => {
                if (line.includes(':')) {
                    const [speaker, ...rest] = line.split(':');
                    const p = document.createElement('p');
                    p.innerHTML = `<span class="speaker">${speaker.trim()}:</span> ${rest.join(':').trim()}`;
                    scriptDiv.appendChild(p);
                } else if (line.trim()) {
                    const p = document.createElement('p');
                    p.innerText = line;
                    scriptDiv.appendChild(p);
                }
            });
            container.appendChild(scriptDiv);
            return;
        }

        // Try parse string JSON
        if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
            try { value = JSON.parse(value); } catch (e) { }
        }

        // Array
        if (Array.isArray(value)) {
            const ul = document.createElement('ul');
            ul.className = 'analysis-list';
            value.forEach(item => {
                const li = document.createElement('li');
                if (typeof item === 'object' && item !== null) {
                    renderValue(item, li);
                } else {
                    li.innerText = item;
                }
                ul.appendChild(li);
            });
            container.appendChild(ul);
            return;
        }

        // Object
        if (typeof value === 'object' && value !== null) {
            Object.entries(value).forEach(([k, v]) => {
                const subSection = document.createElement('div');
                subSection.className = 'sub-section';
                const label = document.createElement('strong');
                label.innerText = formatLabel(k) + ":";
                subSection.appendChild(label);
                const content = document.createElement('div');
                content.className = 'sub-content';
                renderValue(v, content);
                subSection.appendChild(content);
                container.appendChild(subSection);
            });
            return;
        }

        // String / Number
        const p = document.createElement('p');
        p.innerText = value;
        container.appendChild(p);
    }

    // ==================== HISTORY ====================
    async function loadHistory() {
        const container = document.getElementById('history-content');
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">Yukleniyor...</div>';

        try {
            const response = await authFetch(`${BACKEND_URL}/api/analyses`);
            if (!response.ok) throw new Error("Gecmis yuklenemedi.");
            const data = await response.json();

            if (!data.analyses || data.analyses.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">&#128270;</div>
                        <h3>Henuz analiz yok</h3>
                        <p>Bir YouTube videosuna gidin ve analiz baslatin.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            const grid = document.createElement('div');
            grid.className = 'history-grid';

            data.analyses.forEach(item => {
                const card = document.createElement('div');
                card.className = 'history-card';

                const date = new Date(item.createdAt).toLocaleDateString('tr-TR', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                card.innerHTML = `
                    <img src="${item.thumbnail}" alt="" onerror="this.style.display='none'">
                    <div class="info">
                        <h4>${item.title}</h4>
                        <span>${item.channelName} - ${date}</span>
                    </div>
                    <button class="delete-btn" title="Sil">x</button>
                `;

                card.addEventListener('click', (e) => {
                    if (e.target.classList.contains('delete-btn')) return;
                    window.location.href = `index.html?id=${item.id}`;
                });

                card.querySelector('.delete-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('Bu analizi silmek istediginize emin misiniz?')) return;
                    try {
                        await authFetch(`${BACKEND_URL}/api/analysis/${item.id}`, { method: 'DELETE' });
                        card.remove();
                        showToast("Analiz silindi.");
                    } catch (err) {
                        showToast("Silme hatasi.");
                    }
                });

                grid.appendChild(card);
            });

            container.appendChild(grid);
        } catch (error) {
            console.error("History error:", error);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">&#9888;</div>
                    <h3>Baglanti Hatasi</h3>
                    <p>Backend sunucusunun calistigini kontrol edin (localhost:3000)</p>
                </div>
            `;
        }
    }

    // ==================== EXPORT ====================
    document.getElementById('export-txt').addEventListener('click', () => {
        if (!currentAnalysisData) return;
        const text = generateTextReport(currentAnalysisData);
        downloadFile(text, `analiz-${currentAnalysisData.video_id || 'rapor'}.txt`, 'text/plain');
        showToast("TXT dosyasi indirildi!");
    });

    document.getElementById('export-json').addEventListener('click', () => {
        if (!currentAnalysisData) return;
        const json = JSON.stringify(currentAnalysisData, null, 2);
        downloadFile(json, `analiz-${currentAnalysisData.video_id || 'rapor'}.json`, 'application/json');
        showToast("JSON dosyasi indirildi!");
    });

    document.getElementById('copy-all').addEventListener('click', () => {
        if (!currentAnalysisData) return;
        const text = generateTextReport(currentAnalysisData);
        copyToClipboard(text);
        showToast("Tum rapor panoya kopyalandi!");
    });

    // ==================== UTILITIES ====================
    function formatLabel(key) {
        const labels = {
            'video_score': 'Video Puani',
            'content_style_breakdown': 'Icerik Stili Analizi',
            'psychological_triggers': 'Psikolojik Tetikleyiciler',
            'hook_structure': 'Giris (Hook) Yapisi',
            'retention_strategy': 'Izleyici Tutma Stratejisi',
            'thumbnail_psychology': 'Kucuk Resim Psikolojisi',
            'target_audience': 'Hedef Kitle',
            'tone_analysis': 'Ton Analizi',
            'script_reverse_engineering': 'Senaryo Yapisi',
            'cta_strategy': 'CTA Stratejisi',
            'competitor_analysis': 'Rakip Analizi',
            'comment_sentiment': 'Yorum Duygu Analizi',
            'video_flow_mermaid': 'Video Akis Semasi',
            'deep_digest_summary': 'Derin Ozet & Aksiyon Plani',
            'notebook_podcast_script': 'Podcast Senaryosu',
            'audience_retention_heatmap': 'Izleyici Ilgi Isi Haritasi',
            'similar_video_prompts': 'Benzer Video Promptlari',
            'viral_hook_prompts': 'Viral Giris Promptlari',
            'title_variations': 'Baslik Varyasyonlari',
            'seo_descriptions': 'SEO Aciklamalari',
            'high_ctr_titles': 'Yuksek CTR Basliklar',
            'thumbnail_text_ideas': 'Thumbnail Metin Fikirleri',
            'seo_tags': 'SEO Tag Onerileri',
            'full_script_template': 'Tam Senaryo Sablonu',
            'hook_variations': 'Giris Varyasyonlari',
            'storytelling_framework': 'Hikaye Anlatim Cercevesi',
            'aggressive_sales': 'Agresif Satis Tonu',
            'calm_educational': 'Egitici & Sakin Ton',
            'documentary': 'Belgesel Tarzi',
            'motivational': 'Motivasyonel Anlatim',
            'controversial': 'Tartismali Yaklasim',
            'ai_prompts_toolkit': 'AI Prompt Araclari',
            'chatgpt_prompts': 'ChatGPT Promptlari',
            'midjourney_prompts': 'Midjourney Promptlari',
            'blog_post_prompt': 'Blog Yazisi Promptu',
            'twitter_thread_prompt': 'Twitter Thread Promptu',
            'linkedin_post_prompt': 'LinkedIn Paylasim Promptu',
            'tiktok_script_prompt': 'TikTok/Reels Promptu',
            'email_newsletter_prompt': 'Email Bulten Promptu',
            'content_repurpose_ideas': 'Icerik Donusturme Fikirleri',
            'monetization_ideas': 'Para Kazanma Fikirleri',
            'overall_score': 'Genel Puan',
            'seo_score': 'SEO Puani',
            'engagement_score': 'Etkilesim Puani',
            'viral_potential': 'Viral Potansiyel',
            'content_quality': 'Icerik Kalitesi',
            'demographics': 'Demografik',
            'psychographics': 'Psikografik',
            'viewer_intent': 'Izleyici Niyeti',
            'niche_positioning': 'Nis Konumlandirma',
            'differentiation': 'Farklilasma',
            'market_gap': 'Pazar Boslugu',
            'overall_mood': 'Genel Duygu',
            'top_themes': 'One Cikan Temalar',
            'audience_questions': 'Izleyici Sorulari',
            'content_ideas_from_comments': 'Yorumlardan Fikirler',
            'key_takeaways': 'Onemli Dersler',
            'action_plan': 'Aksiyon Plani',
            'one_sentence_summary': 'Tek Cumle Ozet',
            'type': 'Tip',
            'analysis': 'Analiz',
            'first_5_seconds': 'Ilk 5 Saniye',
            'improvement_tips': 'Iyilestirme Onerileri',
            'structure': 'Yapi',
            'hero': 'Ana Karakter',
            'conflict': 'Problem/Catisma',
            'resolution': 'Cozum',
            'template': 'Sablon',
            'verdict': 'Degerlendirme',
            'video_production': 'Video Production',
            'ai_video_prompts': 'AI Video Prompt\'lari',
            'runway_prompts': 'Runway ML Prompt\'lari',
            'luma_prompts': 'Luma AI Prompt\'lari',
            'kling_prompts': 'Kling AI Prompt\'lari',
            'shorts_reels_prompts': 'Shorts/Reels/TikTok Prompt\'lari',
            'thumbnail_dalle_prompts': 'Thumbnail AI Prompt\'lari',
            'b_roll_suggestions': 'B-Roll Onerileri',
            'storyboard': 'Storyboard',
            'overall_style': 'Gorsel Stil',
            'color_palette': 'Renk Paleti',
            'music_mood': 'Muzik Tarzi',
            'transition_style': 'Gecis Efekti',
            'aspect_ratio_recommendation': 'En-Boy Orani'
        };
        const cleanKey = key.replace(/^[0-9]+\.\s*/, '').toLowerCase().trim().replace(/ /g, '_');
        return labels[cleanKey] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function extractText(value) {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(v => extractText(v)).join('\n');
        if (typeof value === 'object' && value !== null) {
            return Object.entries(value).map(([k, v]) => `${formatLabel(k)}: ${extractText(v)}`).join('\n');
        }
        return String(value);
    }

    function generateTextReport(data) {
        const metadata = data.video_metadata;
        const results = data.analysis_results;

        let report = `=== YT AI ANALYZER RAPORU ===\n\n`;
        report += `Video: ${metadata.title}\n`;
        report += `Kanal: ${metadata.channelName}\n`;
        report += `URL: ${metadata.url}\n`;
        report += `Tarih: ${new Date().toLocaleDateString('tr-TR')}\n`;
        report += `${'='.repeat(50)}\n\n`;

        Object.entries(results).forEach(([key, value]) => {
            report += `--- ${formatLabel(key)} ---\n`;
            report += extractText(value) + '\n\n';
        });

        return report;
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        });
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.innerText = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // ==================== PAYWALL ====================
    function showPaywall() {
        loadingScreen.style.display = 'none';
        const overlay = document.getElementById('paywall-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    // Upgrade butonu
    const upgradeBtn = document.getElementById('upgrade-btn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', async () => {
            upgradeBtn.disabled = true;
            upgradeBtn.innerText = 'Yukleniyor...';

            try {
                const response = await authFetch(`${BACKEND_URL}/api/payment/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.error || 'Odeme olusturulamadi.');
                }

                const { token } = await response.json();
                // PayTR odeme sayfasini yeni sekmede ac
                chrome.tabs.create({
                    url: `https://www.paytr.com/odeme/guvenli/${token}`
                });
            } catch (e) {
                console.error('Odeme hatasi:', e);
                showToast('Odeme olusturulurken hata olustu.');
                upgradeBtn.disabled = false;
                upgradeBtn.innerText = "Pro'ya Yukselt";
            }
        });
    }
});
