const BACKEND_URL = CONFIG.BACKEND_URL;

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

// Timeout'lu fetch wrapper
function fetchWithTimeout(fetchPromise, timeoutMs = 120000) {
    let timer;
    return Promise.race([
        fetchPromise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
        })
    ]).finally(() => clearTimeout(timer));
}

// XSS sanitization helper
function sanitizeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// History icin AbortController
let historyAbortController = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n
    await I18N.init();
    I18N.applyToDOM();

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

            if (tabName === 'history') loadHistory();
        });
    });

    // Admin check
    try {
        const token = await SupabaseAuth.getToken();
        if (token) {
            const profile = await SupabaseAuth.getProfile(token);
            if (profile && profile.isAdmin) {
                const adminLink = document.getElementById('admin-link');
                if (adminLink) adminLink.style.display = 'flex';
            }
        }
    } catch (e) { /* admin check failed */ }

    // Route
    if (mode === 'new') {
        startNewAnalysis();
    } else if (mode === 'upgrade') {
        loadingScreen.style.display = 'none';
        document.getElementById('paywall-overlay').style.display = 'flex';
    } else if (mode === 'history') {
        loadingScreen.style.display = 'none';
        document.getElementById('main-header').style.display = 'none';
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
            updateProgress(I18N.t('preparing_data'), 15);
            const result = await chrome.storage.local.get("pending_analysis");
            const videoData = result.pending_analysis;

            if (!videoData) {
                showError(I18N.t('error_no_video_data'), I18N.t('error_no_video_data_desc'));
                return;
            }

            setStep(2);
            updateProgress(I18N.t('ai_analyzing'), 40);

            // Uzun surerse mesaji guncelle
            const progressTimer = setTimeout(() => {
                updateProgress(I18N.t('video_content_analyzing'), 60);
            }, 30000);
            const progressTimer2 = setTimeout(() => {
                updateProgress(I18N.t('detailed_analysis_completing'), 75);
            }, 90000);

            // Add language preference to request
            videoData.language = I18N.getLang();

            const response = await fetchWithTimeout(
                authFetch(`${BACKEND_URL}/api/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(videoData)
                }),
                240000 // 4 dakika timeout (video analizi icin)
            );

            clearTimeout(progressTimer);
            clearTimeout(progressTimer2);

            if (response.status === 403) {
                const err = await response.json().catch(() => ({}));
                if (err.requiresUpgrade) {
                    showPaywall();
                    return;
                }
            }

            if (response.status === 401) {
                showError(I18N.t('error_auth'), I18N.t('error_auth_desc'));
                return;
            }

            if (response.status === 429) {
                showError(I18N.t('error_rate_limit'), I18N.t('error_rate_limit_desc'));
                return;
            }

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || I18N.t('error_analysis'));
            }

            setStep(3);
            updateProgress(I18N.t('processing_results'), 75);

            const data = await response.json();

            setStep(4);
            updateProgress(I18N.t('preparing_report'), 95);

            renderAnalysis(data);

            // Temizle
            await chrome.storage.local.remove("pending_analysis");

            setTimeout(() => {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.style.display = 'none', 400);
            }, 500);

        } catch (error) {
            if (error.message === 'TIMEOUT') {
                showError(I18N.t('error_timeout'), I18N.t('error_timeout_desc'));
            } else if (error.message === 'AUTH_REQUIRED') {
                showError(I18N.t('error_login_required'), I18N.t('error_login_required_desc'));
            } else if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                showError(I18N.t('error_connection'), I18N.t('error_connection_desc'));
            } else {
                showError(I18N.t('error_analysis'), error.message);
            }
        }
    }

    function showError(title, subtitle) {
        statusText.innerText = title;
        statusText.style.color = "#ff4444";
        const subtext = document.querySelector('.loading-subtext');
        if (subtext) subtext.innerText = subtitle;
        // Retry butonu ekle
        const stepsEl = document.querySelector('.loading-steps');
        if (stepsEl) {
            stepsEl.innerHTML = `
                <button onclick="window.location.reload()" style="margin-top:16px;padding:10px 24px;background:var(--primary);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">${I18N.t('retry', 'Tekrar Dene')}</button>
            `;
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
            const response = await fetchWithTimeout(authFetch(`${BACKEND_URL}/api/analysis/${id}`), 30000);
            if (!response.ok) throw new Error(I18N.t('error_analysis'));
            const data = await response.json();
            renderAnalysis(data);
        } catch (error) {
            if (error.message === 'AUTH_REQUIRED') {
                showToast(I18N.t('error_login_required'));
                return;
            }
            showToast(I18N.t('error_analysis'));
        }
    }

    // ==================== RENDER ====================
    let currentAnalysisData = null;

    function renderAnalysis(data) {
        currentAnalysisData = data;
        const results = data.analysis_results;
        const metadata = data.video_metadata;
        const isLimited = data.is_limited === true;

        // Header
        document.getElementById('video-title').innerText = metadata.title || I18N.t('video_analysis_title');
        document.getElementById('channel-name').innerText = metadata.channelName || I18N.t('unknown');
        document.getElementById('channel-img').src = metadata.channelAvatar || metadata.thumbnail || "";

        // Analiz tipi badge
        const analysisType = results._analysisType || 'metadata';
        const badgeMap = {
            'video': { text: I18N.t('analysis_type_video'), color: '#10b981' },
            'transcript': { text: I18N.t('analysis_type_transcript'), color: '#3b82f6' },
            'metadata': { text: I18N.t('analysis_type_metadata'), color: '#6b7280' }
        };
        const badge = badgeMap[analysisType] || badgeMap.metadata;
        const existingBadge = document.getElementById('analysis-type-badge');
        if (existingBadge) existingBadge.remove();
        const badgeEl = document.createElement('span');
        badgeEl.id = 'analysis-type-badge';
        badgeEl.style.cssText = `display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:white;background:${badge.color};margin-left:8px;`;
        badgeEl.textContent = badge.text;
        document.getElementById('channel-name').parentElement.appendChild(badgeEl);

        if (metadata.viewCount) {
            document.getElementById('meta-views').style.display = 'flex';
            document.getElementById('view-count').innerText = metadata.viewCount;
        }
        if (metadata.publishDate) {
            document.getElementById('meta-date').style.display = 'flex';
            document.getElementById('publish-date').innerText = metadata.publishDate;
        }

        // Score Banner - her zaman goster
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
            try { mermaid.contentLoaded(); } catch (e) { }
        }

        // Categorize & Render
        const categoryMap = {
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
            'ai_prompts_toolkit': 'prompts',
            'content_repurpose_ideas': 'prompts',
            'monetization_ideas': 'prompts',
            'video_flow_mermaid': 'skip',
            'deep_digest_summary': 'notebook',
            'notebook_podcast_script': 'notebook',
            'audience_retention_heatmap': 'notebook',
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
            'aggressive_sales': 'characters',
            'calm_educational': 'characters',
            'documentary': 'characters',
            'motivational': 'characters',
            'controversial': 'characters',
            'video_production': 'video_custom',
            'ai_video_prompts': 'video',
            'b_roll_suggestions': 'video',
            'sora_prompts': 'video',
            'pika_prompts': 'video',
            'content_briefing': 'notebook_custom',
            'faq': 'notebook_custom',
            'key_concepts': 'notebook_custom',
            'content_dna': 'notebook_custom',
            'recreation_mega_prompt': 'notebook_custom'
        };

        Object.entries(results).forEach(([key, value]) => {
            const category = categoryMap[key] || 'analysis';
            if (category === 'skip') return;

            if (category === 'video_custom') {
                renderVideoProduction(value, containers.video);
                return;
            }

            if (category === 'notebook_custom') {
                renderNotebookContent(key, value, containers.notebook);
                return;
            }

            const container = containers[category];
            if (!container) return;

            const isPromptType = isPromptKey(key);
            const card = createCard(key, value, isPromptType);
            container.appendChild(card);
        });

        // AI Studio - tum promptlari topla ve render et
        renderAIStudio(results);

        // Free user ise pro-only tab'lara kilitli overlay ekle
        if (isLimited) {
            renderLockedState();
        }
    }

    // ==================== FREE USER LOCKED STATE ====================
    function renderLockedState() {
        // Pro-only tab'lara kilitli overlay ekle (analysis ve notebook haric - free icerikleri var)
        const tabIds = ['tab-prompts', 'tab-scripts', 'tab-characters', 'tab-video', 'tab-aistudio'];

        tabIds.forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (!tab) return;

            const contentEl = tab.querySelector('.grid') || tab.querySelector('.mermaid-container');

            // Placeholder icerik ekle (blur arkasinda)
            const gridEl = tab.querySelector('.grid');
            if (gridEl) {
                gridEl.innerHTML = '';
                for (let i = 0; i < 4; i++) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'card';
                    placeholder.innerHTML = `
                        <div class="card-header"><h3>${I18N.t('pro_content')}</h3></div>
                        <div style="padding:16px">
                            <div style="background:var(--border);height:12px;border-radius:6px;margin-bottom:10px;width:90%"></div>
                            <div style="background:var(--border);height:12px;border-radius:6px;margin-bottom:10px;width:75%"></div>
                            <div style="background:var(--border);height:12px;border-radius:6px;margin-bottom:10px;width:85%"></div>
                            <div style="background:var(--border);height:12px;border-radius:6px;width:60%"></div>
                        </div>
                    `;
                    gridEl.appendChild(placeholder);
                }
            }

            tab.classList.add('pro-locked-overlay');
            tab.style.position = 'relative';
            tab.style.minHeight = '400px';

            const banner = document.createElement('div');
            banner.className = 'pro-locked-banner';
            banner.innerHTML = `
                <div style="font-size:32px;margin-bottom:12px">&#128274;</div>
                <h3>${I18N.t('pro_required')}</h3>
                <p>${I18N.t('pro_locked_desc')}</p>
                <button class="upgrade-cta" onclick="chrome.tabs.create({url:'https://www.skool.com/omnicore-8861'})">${I18N.t('upgrade_to_pro')}</button>
                <div class="price-tag">${I18N.t('unlimited', 'Sinirsiz')} + ${I18N.t('pro_full_access')}</div>
            `;
            tab.appendChild(banner);
        });

        // Export butonlarini devre disi birak
        const exportBtns = document.querySelectorAll('#export-txt, #export-json, #copy-all');
        exportBtns.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
            btn.title = I18N.t('pro_plan_required');
        });
    }

    function isPromptKey(key) {
        const promptKeys = [
            'similar_video_prompts', 'viral_hook_prompts', 'title_variations',
            'seo_descriptions', 'high_ctr_titles', 'thumbnail_text_ideas',
            'hook_variations', 'seo_tags', 'content_repurpose_ideas',
            'monetization_ideas', 'runway_prompts', 'luma_prompts',
            'kling_prompts', 'sora_prompts', 'pika_prompts',
            'shorts_reels_prompts', 'thumbnail_dalle_prompts',
            'b_roll_suggestions'
        ];
        return promptKeys.includes(key);
    }

    // ==================== NOTEBOOK / DEEP ANALYSIS ====================
    function renderNotebookContent(key, value, container) {
        if (!container || !value) return;

        // Content Briefing
        if (key === 'content_briefing') {
            // Quick Recap
            if (value.quick_recap) {
                const recapCard = document.createElement('div');
                recapCard.className = 'card card-full';
                recapCard.innerHTML = `
                    <div class="card-header">
                        <h3>&#9889; ${I18N.t('quick_recap')}</h3>
                        <button class="copy-btn">${I18N.t('copy')}</button>
                    </div>
                    <div class="card-body">
                        <p style="font-size:15px;line-height:1.8;color:var(--text)">${sanitizeHTML(value.quick_recap)}</p>
                    </div>
                `;
                recapCard.querySelector('.copy-btn').addEventListener('click', () => {
                    copyToClipboard(value.quick_recap);
                    showToast(I18N.t('copied'));
                });
                container.appendChild(recapCard);
                makeCollapsible(recapCard, recapCard.querySelector('.card-body'));
            }

            // Timeline
            if (value.timeline && Array.isArray(value.timeline)) {
                const timelineCard = document.createElement('div');
                timelineCard.className = 'card card-full';
                timelineCard.innerHTML = `
                    <div class="card-header"><h3>&#128340; ${I18N.t('timeline')}</h3></div>
                    <div class="timeline-container">
                        ${value.timeline.map((item, i) => `
                            <div class="timeline-item" style="animation-delay:${i * 0.1}s">
                                <div class="timeline-marker"></div>
                                <div class="timeline-content">
                                    <div class="timeline-time">${sanitizeHTML(item.timestamp || '')}</div>
                                    <div class="timeline-topic">${sanitizeHTML(item.topic || '')}</div>
                                    <div class="timeline-summary">${sanitizeHTML(item.summary || '')}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
                container.appendChild(timelineCard);
                makeCollapsible(timelineCard, timelineCard.querySelector('.timeline-container'));
            }

            // Study Notes
            if (value.study_notes) {
                const notesCard = document.createElement('div');
                notesCard.className = 'card card-full';
                notesCard.innerHTML = `
                    <div class="card-header">
                        <h3>&#128214; ${I18N.t('study_notes')}</h3>
                        <button class="copy-btn">${I18N.t('copy')}</button>
                    </div>
                    <div class="card-body">
                        <div class="study-notes">${sanitizeHTML(value.study_notes).replace(/\n/g, '<br>')}</div>
                    </div>
                `;
                notesCard.querySelector('.copy-btn').addEventListener('click', () => {
                    copyToClipboard(value.study_notes);
                    showToast(I18N.t('copied'));
                });
                container.appendChild(notesCard);
                makeCollapsible(notesCard, notesCard.querySelector('.card-body'));
            }
            return;
        }

        // FAQ
        if (key === 'faq' && Array.isArray(value)) {
            const faqCard = document.createElement('div');
            faqCard.className = 'card card-full';
            faqCard.innerHTML = `
                <div class="card-header"><h3>&#10067; ${I18N.label('faq')}</h3></div>
                <div class="faq-container">
                    ${value.map((item, i) => `
                        <div class="faq-item" data-index="${i}">
                            <div class="faq-question">
                                <span>${sanitizeHTML(item.question || '')}</span>
                                <svg class="faq-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </div>
                            <div class="faq-answer">${sanitizeHTML(item.answer || '')}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            // Accordion
            faqCard.querySelectorAll('.faq-item').forEach(item => {
                item.querySelector('.faq-question').addEventListener('click', () => {
                    item.classList.toggle('open');
                });
            });
            container.appendChild(faqCard);
            makeCollapsible(faqCard, faqCard.querySelector('.faq-container'));
            return;
        }

        // Key Concepts
        if (key === 'key_concepts' && Array.isArray(value)) {
            const conceptCard = document.createElement('div');
            conceptCard.className = 'card card-full';
            conceptCard.innerHTML = `
                <div class="card-header"><h3>&#128218; ${I18N.label('key_concepts')}</h3></div>
                <div class="concepts-grid">
                    ${value.map(item => `
                        <div class="concept-item">
                            <div class="concept-term">${sanitizeHTML(item.term || '')}</div>
                            <div class="concept-definition">${sanitizeHTML(item.definition || '')}</div>
                            ${item.importance ? `<div class="concept-importance">${sanitizeHTML(item.importance)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(conceptCard);
            makeCollapsible(conceptCard, conceptCard.querySelector('.concepts-grid'));
            return;
        }

        // Content DNA
        if (key === 'content_dna' && typeof value === 'object') {
            const dnaCard = document.createElement('div');
            dnaCard.className = 'card card-full';
            dnaCard.innerHTML = `
                <div class="card-header"><h3>&#129516; ${I18N.label('content_dna')}</h3></div>
                <div class="card-body">
                    ${value.format_formula ? `
                        <div class="dna-section">
                            <div class="dna-label">${I18N.label('format_formula')}</div>
                            <div class="dna-value dna-formula">${sanitizeHTML(value.format_formula)}</div>
                        </div>
                    ` : ''}
                    ${value.emotional_arc ? `
                        <div class="dna-section">
                            <div class="dna-label">${I18N.label('emotional_arc')}</div>
                            <div class="dna-value">${sanitizeHTML(value.emotional_arc)}</div>
                        </div>
                    ` : ''}
                    ${value.unique_elements && value.unique_elements.length ? `
                        <div class="dna-section">
                            <div class="dna-label">${I18N.label('unique_elements')}</div>
                            <div class="dna-tags">${value.unique_elements.map(e => `<span class="dna-tag">${e}</span>`).join('')}</div>
                        </div>
                    ` : ''}
                    ${value.replicable_patterns && value.replicable_patterns.length ? `
                        <div class="dna-section">
                            <div class="dna-label">${I18N.label('replicable_patterns')}</div>
                            <div class="dna-tags">${value.replicable_patterns.map(p => `<span class="dna-tag dna-tag-pattern">${p}</span>`).join('')}</div>
                        </div>
                    ` : ''}
                    ${value.success_factors && value.success_factors.length ? `
                        <div class="dna-section">
                            <div class="dna-label">${I18N.label('success_factors')}</div>
                            <div class="dna-tags">${value.success_factors.map(f => `<span class="dna-tag dna-tag-success">${f}</span>`).join('')}</div>
                        </div>
                    ` : ''}
                    ${value.content_pillars && value.content_pillars.length ? `
                        <div class="dna-section">
                            <div class="dna-label">${I18N.label('content_pillars')}</div>
                            <div class="dna-tags">${value.content_pillars.map(p => `<span class="dna-tag dna-tag-pillar">${p}</span>`).join('')}</div>
                        </div>
                    ` : ''}
                </div>
            `;
            container.appendChild(dnaCard);
            makeCollapsible(dnaCard, dnaCard.querySelector('.card-body'));
            return;
        }

        // Recreation Mega Prompt
        if (key === 'recreation_mega_prompt' && typeof value === 'string') {
            const megaCard = document.createElement('div');
            megaCard.className = 'card card-full';
            megaCard.innerHTML = `
                <div class="card-header">
                    <h3>&#127775; ${I18N.label('recreation_mega_prompt')}</h3>
                    <button class="copy-btn">${I18N.t('copy')}</button>
                </div>
                <div class="card-body">
                    <div class="mega-prompt-info">${I18N.t('mega_prompt_info')}</div>
                    <div class="mega-prompt-text">${sanitizeHTML(value).replace(/\n/g, '<br>')}</div>
                </div>
            `;
            megaCard.querySelector('.copy-btn').addEventListener('click', () => {
                copyToClipboard(value);
                showToast(I18N.t('copied'));
            });
            container.appendChild(megaCard);
            makeCollapsible(megaCard, megaCard.querySelector('.card-body'));
            return;
        }

        // Fallback: genel card olarak render et
        const card = createCard(key, value, false);
        container.appendChild(card);
    }

    // ==================== VIDEO PRODUCTION ====================
    function renderVideoProduction(data, container) {
        if (!container || !data) return;

        // Quick actions card
        const quickCard = document.createElement('div');
        quickCard.className = 'card card-full';
        quickCard.innerHTML = `
            <div class="card-header">
                <h3>${I18N.t('video_production')}</h3>
            </div>
            <div class="quick-actions">
                <button class="action-btn action-voiceover" id="copy-full-voiceover">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                    ${I18N.t('copy_voiceover', 'Tam Seslendirme Metnini Kopyala')}
                </button>
                <button class="action-btn action-prompts" id="copy-all-prompts">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    ${I18N.t('copy_all_prompts', 'Tum AI Promptlarini Kopyala')}
                </button>
                <button class="action-btn action-export" id="export-video-package">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    ${I18N.t('download_video_package', 'Video Paketi Indir (JSON)')}
                </button>
                <button class="action-btn action-markdown" id="copy-markdown-package">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    ${I18N.t('copy_as_markdown', 'Markdown Olarak Kopyala')}
                </button>
            </div>
        `;
        container.appendChild(quickCard);

        // Quick action events
        quickCard.querySelector('#copy-full-voiceover').addEventListener('click', () => {
            const voiceover = data.full_voiceover_script || data.storyboard?.map(s => s.voiceover_script).filter(Boolean).join('\n\n') || '';
            copyToClipboard(voiceover);
            showToast(I18N.t('copied'));
        });

        quickCard.querySelector('#copy-all-prompts').addEventListener('click', () => {
            let allPrompts = '';
            if (data.storyboard) {
                allPrompts += I18N.t('scene_prompts_header') + '\n\n';
                data.storyboard.filter(s => s.ai_video_prompt).forEach((s, i) => {
                    allPrompts += `Scene ${i + 1} (${s.sure || ''}):\n${s.ai_video_prompt}\n\n`;
                });
            }
            if (data.export_ready_prompts) {
                allPrompts += I18N.t('platform_prompts_header') + '\n\n';
                Object.entries(data.export_ready_prompts).forEach(([k, v]) => {
                    allPrompts += `${k.replace(/_/g, ' ').toUpperCase()}:\n${v}\n\n`;
                });
            }
            copyToClipboard(allPrompts);
            showToast(I18N.t('copied'));
        });

        quickCard.querySelector('#export-video-package').addEventListener('click', () => {
            const pkg = {
                storyboard: data.storyboard,
                voiceover: data.full_voiceover_script,
                style: { overall_style: data.overall_style, color_palette: data.color_palette, music_mood: data.music_mood, transition_style: data.transition_style, aspect_ratio: data.aspect_ratio_recommendation },
                music_recommendations: data.music_recommendations,
                export_ready_prompts: data.export_ready_prompts
            };
            const json = JSON.stringify(pkg, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'video-production-package.json'; a.click();
            URL.revokeObjectURL(url);
            showToast(I18N.t('copied'));
        });

        quickCard.querySelector('#copy-markdown-package').addEventListener('click', () => {
            let md = I18N.t('md_video_production') + '\n\n';
            md += `${I18N.t('md_style_guide')}\n- **${I18N.t('md_visual_style')}:** ${data.overall_style || '-'}\n- **${I18N.t('md_color_palette')}:** ${data.color_palette || '-'}\n- **${I18N.t('md_music')}:** ${data.music_mood || '-'}\n- **${I18N.t('md_transitions')}:** ${data.transition_style || '-'}\n- **${I18N.t('md_aspect_ratio')}:** ${data.aspect_ratio_recommendation || '-'}\n\n`;
            if (data.storyboard) {
                md += I18N.t('md_storyboard') + '\n\n';
                data.storyboard.forEach((s, i) => {
                    md += `### ${I18N.t('md_scene')} ${s.sahne || i + 1} (${s.sure || ''})\n`;
                    md += `- **${I18N.t('md_description')}:** ${s.aciklama || '-'}\n`;
                    md += `- **${I18N.t('md_camera')}:** ${s.kamera || '-'}\n`;
                    md += `- **${I18N.t('md_sound')}:** ${s.ses || '-'}\n`;
                    if (s.voiceover_script) md += `- **${I18N.t('md_voiceover')}:** ${s.voiceover_script}\n`;
                    if (s.text_overlay?.length) md += `- **Text Overlay:** ${s.text_overlay.join(', ')}\n`;
                    if (s.ai_video_prompt) md += `- **AI Prompt:** ${s.ai_video_prompt}\n`;
                    md += '\n';
                });
            }
            if (data.full_voiceover_script) md += `${I18N.t('md_full_voiceover')}\n${data.full_voiceover_script}\n\n`;
            if (data.export_ready_prompts) {
                md += I18N.t('md_platform_prompts') + '\n\n';
                Object.entries(data.export_ready_prompts).forEach(([k, v]) => {
                    md += `### ${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n${v}\n\n`;
                });
            }
            copyToClipboard(md);
            showToast(I18N.t('copied'));
        });

        // Stil rehberi
        if (data.overall_style || data.color_palette || data.music_mood) {
            const styleCard = document.createElement('div');
            styleCard.className = 'card card-full';
            styleCard.innerHTML = `
                <div class="card-header"><h3>${I18N.t('style_guide', 'Video Stil Rehberi')}</h3></div>
                <div class="style-grid">
                    ${data.overall_style ? `<div class="style-item"><div class="style-label">${I18N.label('overall_style')}</div><div class="style-value">${data.overall_style}</div></div>` : ''}
                    ${data.color_palette ? `<div class="style-item"><div class="style-label">${I18N.label('color_palette')}</div><div class="style-value">${data.color_palette}</div></div>` : ''}
                    ${data.music_mood ? `<div class="style-item"><div class="style-label">${I18N.label('music_mood')}</div><div class="style-value">${data.music_mood}</div></div>` : ''}
                    ${data.transition_style ? `<div class="style-item"><div class="style-label">${I18N.label('transition_style')}</div><div class="style-value">${data.transition_style}</div></div>` : ''}
                    ${data.aspect_ratio_recommendation ? `<div class="style-item"><div class="style-label">${I18N.label('aspect_ratio_recommendation')}</div><div class="style-value">${data.aspect_ratio_recommendation}</div></div>` : ''}
                </div>
            `;
            container.appendChild(styleCard);
        }

        // Muzik onerileri
        if (data.music_recommendations && Array.isArray(data.music_recommendations)) {
            const musicCard = document.createElement('div');
            musicCard.className = 'card card-full';
            musicCard.innerHTML = `<div class="card-header"><h3>${I18N.t('music_recommendations')}</h3></div>`;
            const musicContent = document.createElement('div');
            musicContent.className = 'music-recommendations';
            data.music_recommendations.forEach(m => {
                const item = document.createElement('div');
                item.className = 'music-item';
                item.innerHTML = `
                    <div class="music-name">${m.name || '-'}</div>
                    <div class="music-mood">${m.mood || '-'}</div>
                    <div class="music-where">${m.where || '-'}</div>
                `;
                musicContent.appendChild(item);
            });
            musicCard.appendChild(musicContent);
            container.appendChild(musicCard);
        }

        // Storyboard
        if (data.storyboard && Array.isArray(data.storyboard)) {
            const storyCard = document.createElement('div');
            storyCard.className = 'card card-full';
            storyCard.innerHTML = `<div class="card-header"><h3>${I18N.label('storyboard')} - ${data.storyboard.length} ${I18N.t('scene')}</h3><button class="copy-btn" id="copy-all-scenes">${I18N.t('copy_all_prompts', 'Tum Sahne Promptlarini Kopyala')}</button></div>`;

            const storyContent = document.createElement('div');

            data.storyboard.forEach((scene, i) => {
                const item = document.createElement('div');
                item.className = 'storyboard-item';
                item.innerHTML = `
                    <div class="storyboard-header">
                        <div style="display:flex;align-items:center;gap:10px">
                            <div class="scene-number">${scene.sahne || (i + 1)}</div>
                            <strong style="font-size:14px;color:var(--text)">${sanitizeHTML(scene.aciklama || '')}</strong>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px">
                            ${scene.duration_seconds ? `<span class="scene-duration">${scene.duration_seconds}s</span>` : ''}
                            <span class="scene-time">${scene.sure || ''}</span>
                        </div>
                    </div>
                    <div class="storyboard-details">
                        <div class="storyboard-detail"><span class="label">${I18N.t('camera_label')}</span><span class="value">${scene.kamera || '-'}</span></div>
                        <div class="storyboard-detail"><span class="label">${I18N.t('sound_label')}</span><span class="value">${scene.ses || '-'}</span></div>
                        ${scene.metin ? `<div class="storyboard-detail"><span class="label">${I18N.t('screen_text_label')}</span><span class="value">${scene.metin}</span></div>` : ''}
                    </div>
                    ${scene.voiceover_script ? `
                        <div class="voiceover-box">
                            <div class="voiceover-label">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                                ${I18N.t('voiceover')}
                            </div>
                            <div class="voiceover-text">${sanitizeHTML(scene.voiceover_script)}</div>
                        </div>
                    ` : ''}
                    ${scene.text_overlay && scene.text_overlay.length ? `
                        <div class="text-overlay-box">
                            <div class="overlay-label">Text Overlay</div>
                            <div class="overlay-items">${scene.text_overlay.map(t => `<span class="overlay-tag">${t}</span>`).join('')}</div>
                        </div>
                    ` : ''}
                    ${scene.ai_video_prompt ? `
                        <div class="ai-prompt-box" data-prompt="${encodeURIComponent(scene.ai_video_prompt)}">
                            <div class="prompt-label"><span>AI VIDEO PROMPT</span><span style="font-size:10px;opacity:0.6">${I18N.t('click_to_copy')}</span></div>
                            <div class="prompt-text">${sanitizeHTML(scene.ai_video_prompt)}</div>
                        </div>
                    ` : ''}
                    <button class="copy-scene-btn" data-scene="${i}">${I18N.t('copy_scene')}</button>
                `;
                storyContent.appendChild(item);
            });

            storyCard.appendChild(storyContent);
            container.appendChild(storyCard);
            makeCollapsible(storyCard, storyContent, 500);

            // Copy events
            storyCard.querySelectorAll('.copy-scene-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.scene);
                    const s = data.storyboard[idx];
                    if (!s) return;
                    let text = `${I18N.t('md_scene')} ${s.sahne || idx + 1} (${s.sure || ''})\n`;
                    text += `${I18N.t('md_description')}: ${s.aciklama || '-'}\n${I18N.t('md_camera')}: ${s.kamera || '-'}\n${I18N.t('md_sound')}: ${s.ses || '-'}\n`;
                    if (s.voiceover_script) text += `${I18N.t('md_voiceover')}: ${s.voiceover_script}\n`;
                    if (s.text_overlay?.length) text += `Text Overlay: ${s.text_overlay.join(', ')}\n`;
                    if (s.ai_video_prompt) text += `AI Video Prompt: ${s.ai_video_prompt}\n`;
                    copyToClipboard(text);
                    btn.innerText = I18N.t('copied');
                    setTimeout(() => { btn.innerText = I18N.t('copy_scene'); }, 2000);
                });
            });

            storyCard.querySelectorAll('.ai-prompt-box').forEach(box => {
                box.addEventListener('click', (e) => {
                    if (e.target.closest('.copy-scene-btn')) return;
                    const prompt = decodeURIComponent(box.dataset.prompt);
                    copyToClipboard(prompt);
                    showToast(I18N.t('copied'));
                });
            });

            const copyAllBtn = storyCard.querySelector('#copy-all-scenes');
            if (copyAllBtn) {
                copyAllBtn.addEventListener('click', () => {
                    const allPrompts = data.storyboard
                        .filter(s => s.ai_video_prompt)
                        .map((s, i) => `Scene ${i + 1} (${s.sure || ''}):\n${s.ai_video_prompt}`)
                        .join('\n\n');
                    copyToClipboard(allPrompts);
                    showToast(I18N.t('copied'));
                    copyAllBtn.innerText = I18N.t('copied');
                    copyAllBtn.classList.add('copied');
                    setTimeout(() => {
                        copyAllBtn.innerText = I18N.t('copy_all_prompts', 'Tum Sahne Promptlarini Kopyala');
                        copyAllBtn.classList.remove('copied');
                    }, 2000);
                });
            }
        }

        // Tam seslendirme metni
        if (data.full_voiceover_script) {
            const voiceCard = document.createElement('div');
            voiceCard.className = 'card card-full';
            voiceCard.innerHTML = `
                <div class="card-header">
                    <h3>${I18N.t('full_voiceover_script')}</h3>
                    <button class="copy-btn" id="copy-voiceover-card">${I18N.t('copy')}</button>
                </div>
                <div class="card-body">
                    <div class="full-voiceover">${data.full_voiceover_script}</div>
                </div>
            `;
            container.appendChild(voiceCard);
            makeCollapsible(voiceCard, voiceCard.querySelector('.card-body'));
            voiceCard.querySelector('#copy-voiceover-card').addEventListener('click', () => {
                copyToClipboard(data.full_voiceover_script);
                showToast(I18N.t('copied'));
            });
        }

        // Platform promptlari
        if (data.export_ready_prompts) {
            const platformCard = document.createElement('div');
            platformCard.className = 'card card-full';
            platformCard.innerHTML = `<div class="card-header"><h3>${I18N.t('platform_prompts')}</h3></div>`;

            const platformGrid = document.createElement('div');
            platformGrid.className = 'platform-grid';

            const platforms = [
                { key: 'sora_prompt', name: 'OpenAI Sora', icon: '&#9733;', color: '#10a37f' },
                { key: 'runway_prompt', name: 'Runway Gen-3', icon: '&#9654;', color: '#6366f1' },
                { key: 'pika_prompt', name: 'Pika Labs', icon: '&#9672;', color: '#f59e0b' },
                { key: 'kling_prompt', name: 'Kling AI', icon: '&#9830;', color: '#ec4899' },
                { key: 'luma_prompt', name: 'Luma Dream', icon: '&#9788;', color: '#06b6d4' }
            ];

            platforms.forEach(p => {
                const val = data.export_ready_prompts[p.key];
                if (!val) return;
                const item = document.createElement('div');
                item.className = 'platform-card';
                item.style.borderColor = p.color + '33';
                item.innerHTML = `
                    <div class="platform-header">
                        <span class="platform-icon" style="color:${p.color}">${p.icon}</span>
                        <span class="platform-name">${p.name}</span>
                    </div>
                    <div class="platform-prompt">${val}</div>
                    <button class="platform-copy-btn" style="background:${p.color}">${I18N.t('copy')}</button>
                `;
                item.querySelector('.platform-copy-btn').addEventListener('click', () => {
                    copyToClipboard(val);
                    const btn = item.querySelector('.platform-copy-btn');
                    btn.innerText = I18N.t('copied');
                    setTimeout(() => { btn.innerText = I18N.t('copy'); }, 2000);
                });
                platformGrid.appendChild(item);
            });

            platformCard.appendChild(platformGrid);
            container.appendChild(platformCard);
        }
    }

    // ==================== AI STUDIO ====================
    function renderAIStudio(results) {
        const container = document.getElementById('aistudio-content');
        if (!container) return;
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'aistudio-header';
        header.innerHTML = `
            <h2>${I18N.t('ai_studio_title', 'AI Studio')}</h2>
            <p>${I18N.t('ai_studio_desc', 'Bu videoyu yeniden olusturmak icin platform bazli hazir promptlar')}</p>
        `;
        container.appendChild(header);

        // Collect all prompts by category
        const allTools = [];

        // 1. Video Production - Export Ready Prompts
        const vp = results.video_production || {};
        if (vp.export_ready_prompts) {
            const platforms = [
                { key: 'sora_prompt', name: 'OpenAI Sora', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9733;', color: '#10a37f', cat: 'video' },
                { key: 'runway_prompt', name: 'Runway Gen-3', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9654;', color: '#6366f1', cat: 'video' },
                { key: 'pika_prompt', name: 'Pika Labs', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9672;', color: '#f59e0b', cat: 'video' },
                { key: 'kling_prompt', name: 'Kling AI', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9830;', color: '#ec4899', cat: 'video' },
                { key: 'luma_prompt', name: 'Luma Dream Machine', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9788;', color: '#06b6d4', cat: 'video' }
            ];
            platforms.forEach(p => {
                const val = vp.export_ready_prompts[p.key];
                if (val) allTools.push({ ...p, prompt: val });
            });
        }

        // 2. AI Video Prompts (per-platform arrays)
        const avp = results.ai_video_prompts || {};
        const videoArrayPlatforms = [
            { key: 'runway_prompts', name: 'Runway ML', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9654;', color: '#6366f1', cat: 'video' },
            { key: 'sora_prompts', name: 'OpenAI Sora', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9733;', color: '#10a37f', cat: 'video' },
            { key: 'kling_prompts', name: 'Kling AI', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9830;', color: '#ec4899', cat: 'video' },
            { key: 'pika_prompts', name: 'Pika Labs', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9672;', color: '#f59e0b', cat: 'video' },
            { key: 'luma_prompts', name: 'Luma AI', type: I18N.t('ai_cat_video', 'Video Olusturma'), icon: '&#9788;', color: '#06b6d4', cat: 'video' },
            { key: 'shorts_reels_prompts', name: 'Shorts / Reels / TikTok', type: I18N.t('ai_cat_short', 'Kisa Video'), icon: '&#9889;', color: '#ff0050', cat: 'video' }
        ];
        videoArrayPlatforms.forEach(p => {
            const arr = avp[p.key];
            if (arr && Array.isArray(arr)) {
                arr.forEach((prompt, i) => {
                    if (prompt && prompt.length > 10) {
                        allTools.push({ ...p, name: `${p.name} #${i + 1}`, prompt });
                    }
                });
            }
        });

        // 3. Thumbnail / Image prompts
        const thumbArr = avp.thumbnail_dalle_prompts || [];
        thumbArr.forEach((prompt, i) => {
            if (prompt && prompt.length > 10) {
                allTools.push({
                    name: `DALL-E / Midjourney #${i + 1}`,
                    type: I18N.t('ai_cat_image', 'Gorsel Olusturma'),
                    icon: '&#127912;',
                    color: '#f472b6',
                    cat: 'image',
                    prompt
                });
            }
        });
        // Midjourney from ai_prompts_toolkit
        const toolkit = results.ai_prompts_toolkit || {};
        if (toolkit.midjourney_prompts) {
            toolkit.midjourney_prompts.forEach((prompt, i) => {
                if (prompt && prompt.length > 10) {
                    allTools.push({
                        name: `Midjourney #${i + 1}`,
                        type: I18N.t('ai_cat_image', 'Gorsel Olusturma'),
                        icon: '&#127912;',
                        color: '#818cf8',
                        cat: 'image',
                        prompt
                    });
                }
            });
        }

        // 4. Text/Content prompts from toolkit
        const textPrompts = [
            { key: 'blog_post_prompt', name: 'Blog Post', icon: '&#128221;', color: '#2ea043' },
            { key: 'twitter_thread_prompt', name: 'Twitter / X Thread', icon: '&#128172;', color: '#1da1f2' },
            { key: 'linkedin_post_prompt', name: 'LinkedIn Post', icon: '&#128188;', color: '#0a66c2' },
            { key: 'tiktok_script_prompt', name: 'TikTok Script', icon: '&#127916;', color: '#ff0050' },
            { key: 'email_newsletter_prompt', name: 'Email Newsletter', icon: '&#9993;', color: '#d29922' }
        ];
        textPrompts.forEach(p => {
            const val = toolkit[p.key];
            if (val && val.length > 10) {
                allTools.push({
                    ...p,
                    type: I18N.t('ai_cat_content', 'Icerik Donusumu'),
                    cat: 'content',
                    prompt: val
                });
            }
        });

        // 5. ChatGPT prompts
        if (toolkit.chatgpt_prompts) {
            toolkit.chatgpt_prompts.forEach((prompt, i) => {
                if (prompt && prompt.length > 10) {
                    allTools.push({
                        name: `ChatGPT Prompt #${i + 1}`,
                        type: I18N.t('ai_cat_text', 'Metin / Sohbet'),
                        icon: '&#129302;',
                        color: '#10a37f',
                        cat: 'text',
                        prompt
                    });
                }
            });
        }

        // 6. Storyboard scene prompts
        if (vp.storyboard && Array.isArray(vp.storyboard)) {
            vp.storyboard.forEach((scene, i) => {
                if (scene.ai_video_prompt && scene.ai_video_prompt.length > 10) {
                    allTools.push({
                        name: `${I18N.t('scene', 'Sahne')} ${scene.sahne || i + 1} - ${(scene.aciklama || '').substring(0, 40)}`,
                        type: I18N.t('ai_cat_scene', 'Sahne Promptu'),
                        icon: '&#127910;',
                        color: '#8b5cf6',
                        cat: 'scene',
                        prompt: scene.ai_video_prompt
                    });
                }
            });
        }

        // 7. Mega Prompt
        if (results.recreation_mega_prompt && results.recreation_mega_prompt.length > 10) {
            allTools.push({
                name: 'Mega Prompt',
                type: I18N.t('ai_cat_mega', 'Tam Yeniden Olusturma'),
                icon: '&#128640;',
                color: '#ff0000',
                cat: 'mega',
                prompt: results.recreation_mega_prompt
            });
        }

        if (allTools.length === 0) {
            container.innerHTML += `<div class="aistudio-empty"><h3>${I18N.t('no_prompts', 'Prompt bulunamadi')}</h3><p>${I18N.t('no_prompts_desc', 'Analiz tamamlandiginda AI promptlari burada gorunecek')}</p></div>`;
            return;
        }

        // Category filter buttons
        const categories = [
            { key: 'all', label: I18N.t('ai_filter_all', 'Tumunu Goster') },
            { key: 'video', label: I18N.t('ai_cat_video', 'Video Olusturma') },
            { key: 'image', label: I18N.t('ai_cat_image', 'Gorsel Olusturma') },
            { key: 'content', label: I18N.t('ai_cat_content', 'Icerik Donusumu') },
            { key: 'text', label: I18N.t('ai_cat_text', 'Metin / Sohbet') },
            { key: 'scene', label: I18N.t('ai_cat_scene', 'Sahne Promptlari') },
            { key: 'mega', label: 'Mega Prompt' }
        ];

        // Only show categories that have items
        const activeCats = new Set(allTools.map(t => t.cat));
        const filterDiv = document.createElement('div');
        filterDiv.className = 'aistudio-categories';
        categories.forEach(c => {
            if (c.key !== 'all' && !activeCats.has(c.key)) return;
            const btn = document.createElement('button');
            btn.className = 'aistudio-cat-btn' + (c.key === 'all' ? ' active' : '');
            btn.textContent = c.label;
            btn.dataset.cat = c.key;
            btn.addEventListener('click', () => {
                filterDiv.querySelectorAll('.aistudio-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                grid.querySelectorAll('.ai-tool-card').forEach(card => {
                    card.style.display = (c.key === 'all' || card.dataset.cat === c.key) ? '' : 'none';
                });
            });
            filterDiv.appendChild(btn);
        });
        container.appendChild(filterDiv);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'aistudio-grid';

        allTools.forEach(tool => {
            const card = document.createElement('div');
            card.className = 'ai-tool-card';
            card.dataset.cat = tool.cat;
            card.innerHTML = `
                <div class="ai-tool-header">
                    <div class="ai-tool-icon" style="background:${tool.color}22">${tool.icon}</div>
                    <div class="ai-tool-info">
                        <h4>${tool.name}</h4>
                        <span class="ai-tool-type">${tool.type}</span>
                    </div>
                    <span class="ai-tool-badge" style="background:${tool.color}22;color:${tool.color}">${tool.cat === 'scene' ? 'SCENE' : tool.cat === 'mega' ? 'MEGA' : 'AI'}</span>
                </div>
                <div class="ai-tool-prompt">${tool.prompt}</div>
                <div class="ai-tool-actions">
                    <button class="ai-tool-copy" style="background:${tool.color}">${I18N.t('copy_prompt', 'Promptu Kopyala')}</button>
                    <button class="ai-tool-expand">${I18N.t('show_more', 'Devamini gor')}</button>
                </div>
            `;

            card.querySelector('.ai-tool-copy').addEventListener('click', () => {
                copyToClipboard(tool.prompt);
                const btn = card.querySelector('.ai-tool-copy');
                btn.textContent = I18N.t('copied');
                setTimeout(() => { btn.textContent = I18N.t('copy_prompt', 'Promptu Kopyala'); }, 2000);
            });

            card.querySelector('.ai-tool-expand').addEventListener('click', () => {
                const promptEl = card.querySelector('.ai-tool-prompt');
                const expandBtn = card.querySelector('.ai-tool-expand');
                const isExpanded = promptEl.classList.toggle('expanded');
                expandBtn.textContent = isExpanded ? I18N.t('show_less', 'Daralt') : I18N.t('show_more', 'Devamini gor');
            });

            grid.appendChild(card);
        });

        container.appendChild(grid);
    }

    // ==================== ANIMATED COUNTER ====================
    function animateCounter(el, start, end, duration, delay) {
        setTimeout(() => {
            const startTime = performance.now();
            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                el.textContent = Math.round(start + (end - start) * eased);
                if (progress < 1) requestAnimationFrame(update);
            }
            requestAnimationFrame(update);
        }, delay);
    }

    // ==================== SCORE BANNER ====================
    function renderScoreBanner(score) {
        const banner = document.getElementById('score-banner');
        banner.style.display = 'grid';
        banner.innerHTML = '';

        const items = [
            { label: I18N.t('overall_score'), value: score.overall_score },
            { label: I18N.t('seo_score'), value: score.seo_score },
            { label: I18N.t('engagement_score'), value: score.engagement_score },
            { label: I18N.t('viral_potential'), value: score.viral_potential },
            { label: I18N.t('content_quality'), value: score.content_quality }
        ];

        items.forEach((item) => {
            const val = parseInt(item.value) || 0;
            const colorClass = val >= 70 ? 'score-high' : val >= 40 ? 'score-mid' : 'score-low';
            const div = document.createElement('div');
            div.className = 'score-item';
            div.innerHTML = `
                <div class="score-value ${colorClass}" data-target="${val}">0</div>
                <div class="score-label">${item.label}</div>
            `;
            banner.appendChild(div);
        });

        requestAnimationFrame(() => {
            banner.querySelectorAll('.score-value[data-target]').forEach((el, i) => {
                const target = parseInt(el.dataset.target);
                animateCounter(el, 0, target, 1200, i * 150);
            });
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

        const header = document.createElement('div');
        header.className = 'card-header';

        const title = document.createElement('h3');
        title.innerText = formatLabel(key);
        header.appendChild(title);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerText = I18N.t('copy');
        copyBtn.addEventListener('click', () => {
            const text = extractText(value);
            copyToClipboard(text);
            copyBtn.innerText = I18N.t('copied');
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.innerText = I18N.t('copy');
                copyBtn.classList.remove('copied');
            }, 2000);
        });
        header.appendChild(copyBtn);
        card.appendChild(header);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'card-body';

        if (isPromptType && Array.isArray(value)) {
            renderPromptList(value, contentDiv);
        } else {
            renderValue(value, contentDiv, key);
        }

        card.appendChild(contentDiv);

        // Auto-collapse long content
        makeCollapsible(card, contentDiv);

        return card;
    }

    // Auto-collapse helper - wraps content in collapse-content div
    function makeCollapsible(card, contentEl, threshold = 400) {
        requestAnimationFrame(() => {
            const target = contentEl || card.querySelector('.card-body') || card.querySelector('.timeline-container') || card.querySelector('.faq-container') || card.querySelector('.concepts-grid') || card.querySelector('.storyboard-item')?.parentElement;
            if (!target || target.scrollHeight <= threshold) return;

            // Wrap target in collapse-content div
            const wrapper = document.createElement('div');
            wrapper.className = 'collapse-content';
            target.parentNode.insertBefore(wrapper, target);
            wrapper.appendChild(target);

            card.classList.add('collapsible');
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'card-toggle';
            toggleBtn.innerHTML = `<span>${I18N.t('show_more') || 'Devamini gor'}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
            toggleBtn.addEventListener('click', () => {
                const isExpanded = card.classList.toggle('expanded');
                toggleBtn.querySelector('span').textContent = isExpanded
                    ? (I18N.t('show_less') || 'Daralt')
                    : (I18N.t('show_more') || 'Devamini gor');
            });
            card.appendChild(toggleBtn);
        });
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
                showToast(I18N.t('copied'));
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
                bar.title = `${I18N.t('estimated_interest')}: %${val}`;
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
                    const spanEl = document.createElement('span');
                    spanEl.className = 'speaker';
                    spanEl.textContent = speaker.trim() + ':';
                    p.appendChild(spanEl);
                    p.appendChild(document.createTextNode(' ' + rest.join(':').trim()));
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
        // Onceki istegi iptal et
        if (historyAbortController) {
            historyAbortController.abort();
        }
        historyAbortController = new AbortController();

        const container = document.getElementById('history-content');
        container.innerHTML = `<div class="history-grid">
            ${Array(6).fill('<div class="skeleton skeleton-card" style="height:100px;border-radius:12px"></div>').join('')}
        </div>`;

        try {
            const token = await SupabaseAuth.getToken();
            if (!token) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">&#128274;</div>
                        <h3>${I18N.t('login_required_short')}</h3>
                        <p>${I18N.t('login_to_see_history_short')}</p>
                    </div>
                `;
                return;
            }

            const response = await fetch(`${BACKEND_URL}/api/analyses`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: historyAbortController.signal
            });

            if (!response.ok) throw new Error(I18N.t('error_connection'));
            const data = await response.json();

            if (!data.analyses || data.analyses.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">&#128270;</div>
                        <h3>${I18N.t('no_analysis_yet_short')}</h3>
                        <p>${I18N.t('start_analysis_hint')}</p>
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

                const date = new Date(item.createdAt).toLocaleDateString(I18N.getLocale(), {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                card.innerHTML = `
                    <img src="${item.thumbnail}" alt="" onerror="this.style.display='none'">
                    <div class="info">
                        <h4>${item.title}</h4>
                        <span>${item.channelName} - ${date}</span>
                    </div>
                    <button class="delete-btn" title="${I18N.t('delete')}">x</button>
                `;

                card.addEventListener('click', (e) => {
                    if (e.target.classList.contains('delete-btn')) return;
                    window.location.href = `index.html?id=${item.id}`;
                });

                card.querySelector('.delete-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(I18N.t('delete_confirm'))) return;
                    try {
                        await authFetch(`${BACKEND_URL}/api/analysis/${item.id}`, { method: 'DELETE' });
                        card.remove();
                        showToast(I18N.t('analysis_deleted'));
                    } catch (err) {
                        showToast(I18N.t('delete_error'));
                    }
                });

                grid.appendChild(card);
            });

            container.appendChild(grid);
        } catch (error) {
            if (error.name === 'AbortError') return; // Iptal edilen istek
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">&#9888;</div>
                    <h3>${I18N.t('connection_error_title')}</h3>
                    <p>${I18N.t('connection_error_desc')}</p>
                </div>
            `;
        }
    }

    // ==================== EXPORT ====================
    document.getElementById('export-txt').addEventListener('click', () => {
        if (!currentAnalysisData || currentAnalysisData.is_limited) return;
        const text = generateTextReport(currentAnalysisData);
        downloadFile(text, `analiz-${currentAnalysisData.video_id || 'rapor'}.txt`, 'text/plain');
        showToast(I18N.t('txt_downloaded'));
    });

    document.getElementById('export-json').addEventListener('click', () => {
        if (!currentAnalysisData || currentAnalysisData.is_limited) return;
        const json = JSON.stringify(currentAnalysisData, null, 2);
        downloadFile(json, `analiz-${currentAnalysisData.video_id || 'rapor'}.json`, 'application/json');
        showToast(I18N.t('json_downloaded'));
    });

    document.getElementById('copy-all').addEventListener('click', () => {
        if (!currentAnalysisData || currentAnalysisData.is_limited) return;
        const text = generateTextReport(currentAnalysisData);
        copyToClipboard(text);
        showToast(I18N.t('report_copied'));
    });

    // ==================== UTILITIES ====================
    function formatLabel(key) {
        return I18N.label(key);
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

        let report = I18N.t('report_title') + '\n\n';
        report += `${I18N.t('video_label')}: ${metadata.title}\n`;
        report += `${I18N.t('channel_label')}: ${metadata.channelName}\n`;
        report += `URL: ${metadata.url}\n`;
        report += `${I18N.t('date_label')}: ${new Date().toLocaleDateString(I18N.getLocale())}\n`;
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

    const upgradeBtn = document.getElementById('upgrade-btn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://www.skool.com/omnicore-8861' });
        });
    }
});
