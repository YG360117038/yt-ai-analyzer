const BACKEND_URL = CONFIG.BACKEND_URL;

// Initialize mermaid (CSP-compliant)
if (typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
}

// Auth fetch helper
async function authFetch(url, options = {}) {
    const token = await SupabaseAuth.getToken();
    if (!token) throw new Error('AUTH_REQUIRED');
    const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    return fetch(url, { ...options, headers });
}

// Timeout fetch wrapper
function fetchWithTimeout(fetchPromise, timeoutMs = 120000) {
    let timer;
    return Promise.race([
        fetchPromise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
        })
    ]).finally(() => clearTimeout(timer));
}

// XSS sanitization
function sanitizeHTML(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Abort controller for history
let historyAbortController = null;

document.addEventListener('DOMContentLoaded', async () => {
    await I18N.init();
    I18N.applyToDOM();

    // ==================== LANGUAGE TOGGLE ====================
    const langToggleBtn = document.getElementById('lang-toggle');
    const langToggleLabel = document.getElementById('lang-toggle-label');
    if (langToggleBtn && langToggleLabel) {
        langToggleLabel.textContent = I18N.getLang().toUpperCase();
        langToggleBtn.addEventListener('click', async () => {
            const newLang = I18N.getLang() === 'tr' ? 'en' : 'tr';
            await I18N.setLang(newLang);
            location.reload();
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const analysisId = urlParams.get('id');
    const mode = urlParams.get('mode');

    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
    const progressFill = document.getElementById('progress-fill');

    // ==================== TAB SWITCHING ====================
    const navItems = document.querySelectorAll('.nav-item[data-tab]');
    const tabPanes = document.querySelectorAll('.tab-pane');

    const NAV_ACTIVE_CLASS = {
        viral:     'active',
        clone:     'active-clone',
        factory:   'active-purple',
        structure: 'active-purple',
        script:    'active-purple',
        seo:       'active-purple',
        channel:   'active-green',
        monetize:  'active-green',
        battle:    'active',
        history:   'active'
    };

    const VIDEO_ONLY_TABS = ['viral', 'clone', 'factory', 'structure', 'script', 'seo', 'monetize', 'battle'];
    let currentMode = null;

    function showVideoOnlyMessage(tabName) {
        const pane = document.getElementById(`tab-${tabName}`);
        if (!pane) return;
        if (pane.querySelector('.video-only-msg')) return;
        pane.innerHTML = `<div class="video-only-msg" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;gap:16px;color:var(--text-dim);text-align:center;padding:40px">
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" opacity="0.4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            <div>
                <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px">Bu sekme video analizine özel</div>
                <div style="font-size:13px">Lütfen bir YouTube videosu açıp analiz edin.</div>
            </div>
        </div>`;
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            if (!tabName) return;

            if (currentMode === 'channel' && VIDEO_ONLY_TABS.includes(tabName)) {
                showVideoOnlyMessage(tabName);
            }

            navItems.forEach(n => n.classList.remove('active', 'active-clone', 'active-purple', 'active-green'));
            const cls = NAV_ACTIVE_CLASS[tabName] || 'active';
            item.classList.add(cls);
            tabPanes.forEach(p => {
                p.classList.remove('active');
                if (p.id === `tab-${tabName}`) p.classList.add('active');
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
    } catch (e) { /* admin check silent */ }

    // ==================== ROUTING ====================
    const shareToken = urlParams.get('share');

    if (mode === 'new') {
        startNewAnalysis();
    } else if (mode === 'channel') {
        startChannelAnalysis();
    } else if (mode === 'demo') {
        loadDemoAnalysis();
    } else if (mode === 'upgrade') {
        loadingScreen.style.display = 'none';
        document.getElementById('paywall-overlay').style.display = 'flex';
    } else if (mode === 'history') {
        loadingScreen.style.display = 'none';
        document.getElementById('topbar').style.display = 'none';
        activateTab('history');
        loadHistory();
    } else if (shareToken) {
        loadSharedAnalysis(shareToken);
    } else if (analysisId) {
        loadingScreen.style.display = 'none';
        loadAnalysis(analysisId);
    } else {
        loadingScreen.style.display = 'none';
    }

    // ==================== DEMO MODE ====================
    const DEMO_DATA = {
        id: 'demo',
        video_id: 'dQw4w9WgXcQ',
        is_demo: true,
        video_metadata: {
            title: 'How I Made $100K on YouTube WITHOUT Millions of Subscribers',
            channelName: 'DemoChannel',
            viewCount: '2.4M görüntülenme',
            publishDate: '15 Mart 2024',
            duration: '14:22',
            thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        },
        analysis_results: {
            _analysisType: 'transcript',
            viral_score: { score: 92, ctr_potential: 88, retention_potential: 85, growth_potential: 90, why: 'Güçlü merak boşluğu + parasal başarı hikayesi = viral formül' },
            hook_analysis: { type: 'curiosity', why_it_works: 'Zıtlık prensibi: Para kazandım + az abonem var. İzleyici nasıl olduğunu merak ediyor.', first_10_seconds: '"Bu videoyu izlediğinizde neden abone sayısının hiç önemi olmadığını anlayacaksınız..."' },
            video_structure: { hook: 'İlk 30 saniyede büyük iddia: Abone sayısı olmadan gelir nasıl elde edildi', setup: 'Klasik başarısızlık hikayesi — 2 yıl boyunca sıfır gelir', buildup: '3 kritik strateji açıklaması: Niche seçimi, SEO odağı, monetizasyon çeşitliliği', payoff: 'Gerçek gelir ekran görüntüleri + adım adım sistem', cta: 'Sistemi öğrenmek için kanalı takip et + ücretsiz checklist indir' },
            viral_patterns: ['Para kazanma vaadi + düşük engel ("herkes yapabilir")', 'İspat + şeffaflık: Gerçek rakamlar gösteriliyor', 'Zıtlık: "Beklediğiniz yol değil" → merak boşluğu'],
            title_thumbnail: {
                why_title_works: 'Rakam ($100K) + zıtlık (without millions) = güçlü CTR formülü',
                ctr_angle: 'Okuyucu anında "nasıl?" diye soruyor — bu içeri çeken kanca',
                thumbnail_psychology: 'Şaşkın yüz + büyük rakam + kırmızı ok = dikkat çekici kombinasyon',
                improved_titles: [
                    { title: 'Sıfırdan $100K: Abone Sayısı Olmadan YouTube\'da Para Kazanmak', ctr_score: 94, angle: 'Sıfırdan başlama' },
                    { title: 'Neden Az Abonem Var Ama Çok Kazanıyorum? (Gerçek Rakamlar)', ctr_score: 91, angle: 'Şeffaflık + merak' },
                    { title: 'Bu 3 Strateji Olmadan YouTube\'da Para Kazanamazsınız', ctr_score: 88, angle: 'Negatif framing' }
                ]
            },
            clone_this_video: {
                new_video_idea: 'Kendi nişinizde: "X olmadan Y\'yi nasıl başardım" formatı',
                full_hook: '"Bugün size bir itirafım var. [Nişinizde yaygın yanlış inanç] sanılıyor. Ama ben bunu yapmadan [hedefe] ulaştım..."',
                script_outline: '1. Hook (0:00-0:45): Büyük iddia\n2. Problem (0:45-2:00): Klasik yaklaşımın neden işe yaramadığı\n3. Çözüm (2:00-3:30): Farklı stratejik yaklaşım\n4. Strateji 1 (3:30-6:00): Niche optimizasyonu\n5. Strateji 2 (6:00-9:00): SEO odaklı içerik\n6. Strateji 3 (9:00-12:00): Çoklu gelir\n7. Kanıt (12:00-13:30): Gerçek rakamlar\n8. CTA (13:30-14:22)',
                scene_plan: [
                    { scene: 1, time: '0:00-0:10', description: 'Şaşırtıcı istatistik gösterilir', voiceover: '"Bu videoyu izleyenlerin %90\'ı bunu yanlış yapıyor..."', ai_video_prompt: 'Close-up of person looking surprised at laptop screen', clip_prompt_10s: 'A creator looking shocked at their laptop, modern home office' },
                    { scene: 2, time: '0:10-0:20', description: 'Para rakamları animasyon', voiceover: '"$100,000 dolar. Hiç düşünmediğiniz bir yoldan."', ai_video_prompt: 'Animated dollar signs and growth charts', clip_prompt_10s: 'Money counter animation, green numbers rising' }
                ],
                seo_tags: ['youtube para kazanma', 'youtube monetizasyon', 'az abone ile para', 'youtube büyüme', 'içerik üreticisi']
            },
            content_factory: {
                video_ideas: [
                    { title: 'İlk 1000 Aboneyi 30 Günde Nasıl Aldım', hook: 'Kimse bu stratejiyi söylemiyor...', why: 'Milestone içeriği viral olur' },
                    { title: 'YouTube Algoritması Hakkında Bildiğiniz 5 Yalan', hook: 'Gurular bunu size söylemez...', why: 'Myth-busting yüksek paylaşım alır' },
                    { title: 'Tek Bir Video İle Nasıl $5000 Kazandım', hook: 'Tek bir video, değişen her şey...', why: 'Spesifik rakam + kısa süre = güçlü hook' }
                ],
                high_ctr_titles: [
                    { title: 'YouTube\'da GERÇEKTEN Para Kazanmanın 7 Yolu (2024)', ctr_score: 89 },
                    { title: 'Bu Hatayı Yapıyorsanız YouTube\'da Asla Büyüyemezsiniz', ctr_score: 86 }
                ]
            },
            shorts_opportunities: [
                { title: 'En Büyük YouTube Hatası', timestamp: '3:45', duration: '45 sn', hook: 'Herkesin yaptığı bu hata...', why: 'Kısa ve güçlü - viral short potansiyeli' },
                { title: 'İlk $1000 Nasıl Geldi', timestamp: '8:20', duration: '60 sn', hook: 'İlk büyük rakamı gördüğümde...', why: 'Duygusal an - özgün ve ilişkilendirilebilir' }
            ],
            monetization: {
                how_it_makes_money: 'AdSense + kurs satışı + affiliate link + üyelik sistemi',
                strategies: ['Yüksek CPM nişe odaklanmak (finans, eğitim)', 'Email listesi oluşturup kurs satmak', 'Affiliate marketing entegrasyonu'],
                best_cta: '"Ücretsiz YouTube Büyüme Checklist\'im için açıklamadaki linke tıkla"'
            }
        }
    };

    function loadDemoAnalysis() {
        loadingScreen.style.display = 'none';
        currentMode = 'video';
        renderAnalysis(DEMO_DATA);
        showToast('Demo modu — Gerçek analiz için giriş yapın');
    }

    // ==================== SHARED ANALYSIS ====================
    async function loadSharedAnalysis(id) {
        try {
            updateProgress('Paylaşılan analiz yükleniyor...', 50);
            const res = await fetch(`${BACKEND_URL}/api/share/${id}`);
            if (!res.ok) throw new Error('Analiz bulunamadı');
            const data = await res.json();
            loadingScreen.style.display = 'none';
            currentMode = 'video';
            renderAnalysis(data);
            showToast('Paylaşılan analiz yüklendi');
        } catch (e) {
            showError('Analiz Bulunamadı', 'Bu link geçersiz veya analiz silinmiş olabilir.');
        }
    }

    // ==================== NEW VIDEO ANALYSIS ====================
    async function startNewAnalysis() {
        try {
            setStep(1);
            updateProgress(I18N.t('preparing_data', 'Video verileri hazırlanıyor...'), 15);

            const result = await chrome.storage.local.get('pending_analysis');
            const videoData = result.pending_analysis;
            if (!videoData) {
                showError(I18N.t('error_no_video_data'), I18N.t('error_no_video_data_desc'));
                return;
            }

            setStep(2);
            updateProgress(I18N.t('ai_analyzing', 'AI Analizi yapılıyor...'), 40);

            const t1 = setTimeout(() => updateProgress(I18N.t('video_content_analyzing', 'İçerik analizi devam ediyor...'), 60), 30000);
            const t2 = setTimeout(() => updateProgress(I18N.t('detailed_analysis_completing', 'Detaylı analiz tamamlanıyor...'), 75), 90000);

            videoData.language = I18N.getLang();

            const response = await fetchWithTimeout(
                authFetch(`${BACKEND_URL}/api/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(videoData)
                }),
                240000
            );

            clearTimeout(t1); clearTimeout(t2);

            if (response.status === 403) {
                const err = await response.json().catch(() => ({}));
                if (err.requiresUpgrade || err.upgrade_required) { showPaywall(); return; }
                showError('Erişim Engellendi', err.error || 'Analiz hakkınız dolmuş olabilir. Pro\'ya geçerek sınırsız analiz yapabilirsiniz.');
                return;
            }
            if (response.status === 401) { showError(I18N.t('error_auth'), I18N.t('error_auth_desc')); return; }
            if (response.status === 429) { showError(I18N.t('error_rate_limit'), I18N.t('error_rate_limit_desc')); return; }
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || I18N.t('error_analysis'));
            }

            setStep(3);
            updateProgress(I18N.t('processing_results', 'Sonuçlar işleniyor...'), 75);

            const data = await response.json();
            setStep(4);
            updateProgress(I18N.t('preparing_report', 'Rapor hazırlanıyor...'), 95);

            renderAnalysis(data);
            await chrome.storage.local.remove('pending_analysis');

            setTimeout(() => {
                loadingScreen.style.opacity = '0';
                setTimeout(() => { loadingScreen.style.display = 'none'; }, 400);
            }, 500);

        } catch (error) {
            if (error.message === 'TIMEOUT') showError(I18N.t('error_timeout'), I18N.t('error_timeout_desc'));
            else if (error.message === 'AUTH_REQUIRED') showError(I18N.t('error_login_required'), I18N.t('error_login_required_desc'));
            else if (error.message === 'Failed to fetch' || error.name === 'TypeError') showError(I18N.t('error_connection'), I18N.t('error_connection_desc'));
            else showError(I18N.t('error_analysis'), error.message);
        }
    }

    // ==================== CHANNEL ANALYSIS ====================
    async function startChannelAnalysis() {
        currentMode = 'channel';
        try {
            setStep(1);
            updateProgress(I18N.t('preparing_channel_data', 'Kanal verileri hazırlanıyor...'), 15);

            const result = await chrome.storage.local.get('pending_channel_analysis');
            const channelData = result.pending_channel_analysis;
            if (!channelData) {
                showError(I18N.t('error_no_channel_data', 'Kanal verisi bulunamadı.'), I18N.t('error_no_video_data_desc'));
                return;
            }

            setStep(2);
            updateProgress(I18N.t('channel_analyzing', 'Kanal analizi yapılıyor...'), 40);

            const t1 = setTimeout(() => updateProgress(I18N.t('channel_deep_analyzing', 'Kanal derinlemesine analiz ediliyor...'), 65), 20000);

            const payload = {
                channelName: channelData.channelName,
                videos: channelData.videos || [],
                language: I18N.getLang()
            };

            const response = await fetchWithTimeout(
                authFetch(`${BACKEND_URL}/api/channel-analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }),
                180000
            );

            clearTimeout(t1);

            if (response.status === 403) {
                const err = await response.json().catch(() => ({}));
                if (err.requiresUpgrade || err.upgrade_required) { showPaywall(); return; }
                showError('Erişim Engellendi', err.error || 'Analiz hakkınız dolmuş olabilir. Pro\'ya geçerek sınırsız analiz yapabilirsiniz.');
                return;
            }
            if (response.status === 401) { showError(I18N.t('error_auth'), I18N.t('error_auth_desc')); return; }
            if (response.status === 429) { showError(I18N.t('error_rate_limit'), I18N.t('error_rate_limit_desc')); return; }
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || I18N.t('error_analysis'));
            }

            setStep(3);
            updateProgress(I18N.t('processing_results', 'Sonuçlar işleniyor...'), 80);

            const data = await response.json();
            setStep(4);
            updateProgress(I18N.t('preparing_report', 'Rapor hazırlanıyor...'), 95);

            renderChannelPage(channelData, data);
            await chrome.storage.local.remove('pending_channel_analysis');

            setTimeout(() => {
                loadingScreen.style.opacity = '0';
                setTimeout(() => { loadingScreen.style.display = 'none'; }, 400);
            }, 500);

        } catch (error) {
            if (error.message === 'TIMEOUT') showError(I18N.t('error_timeout'), I18N.t('error_timeout_desc'));
            else if (error.message === 'AUTH_REQUIRED') showError(I18N.t('error_login_required'), I18N.t('error_login_required_desc'));
            else if (error.message === 'Failed to fetch' || error.name === 'TypeError') showError(I18N.t('error_connection'), I18N.t('error_connection_desc'));
            else showError(I18N.t('error_analysis'), error.message);
        }
    }

    // ==================== LOAD EXISTING ANALYSIS ====================
    async function loadAnalysis(id) {
        try {
            const response = await fetchWithTimeout(authFetch(`${BACKEND_URL}/api/analysis/${id}`), 30000);
            if (!response.ok) throw new Error(I18N.t('error_analysis'));
            const data = await response.json();
            if (data.video_metadata?.type === 'channel') {
                renderChannelPage(data.video_metadata, data);
            } else {
                renderAnalysis(data);
            }
        } catch (error) {
            if (error.message === 'AUTH_REQUIRED') { showToast(I18N.t('error_login_required')); return; }
            showToast(I18N.t('error_analysis'));
        }
    }

    // ==================== HELPERS ====================
    function updateProgress(text, percent) {
        if (loadingText) loadingText.textContent = text;
        if (progressFill) progressFill.style.width = `${percent}%`;
    }

    function setStep(num) {
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById(`step-${i}`);
            if (!step) continue;
            step.className = 'step';
            if (i < num) step.className = 'step done';
            if (i === num) step.className = 'step active';
        }
    }

    function showError(title, subtitle) {
        if (loadingText) { loadingText.textContent = title; loadingText.style.color = '#ff4444'; }
        const sub = document.querySelector('.loading-sub');
        if (sub && subtitle) sub.textContent = subtitle;
        const steps = document.querySelector('.loading-steps');
        if (steps) {
            steps.innerHTML = `<button id="retry-btn" style="margin-top:16px;padding:10px 24px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Tekrar Dene</button>`;
            const retryBtn = document.getElementById('retry-btn');
            if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
        }
    }

    function showPaywall() {
        if (loadingScreen) loadingScreen.style.display = 'none';
        const overlay = document.getElementById('paywall-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    function activateTab(tabName) {
        navItems.forEach(n => n.classList.remove('active', 'active-clone', 'active-purple', 'active-green'));
        const navItem = document.querySelector(`[data-tab="${tabName}"]`);
        if (navItem) {
            const cls = NAV_ACTIVE_CLASS[tabName] || 'active';
            navItem.classList.add(cls);
        }
        tabPanes.forEach(p => {
            p.classList.remove('active');
            if (p.id === `tab-${tabName}`) p.classList.add('active');
        });
    }

    // ==================== SCHEMA MIGRATION (old analyses) ====================
    function migrateOldSchema(r) {
        // old video_score → viral_score
        if (!r.viral_score && r.video_score) {
            const vs = r.video_score;
            r.viral_score = {
                score: parseInt(vs.overall_score) || parseInt(vs.viral_potential) || 0,
                ctr_potential: parseInt(vs.seo_score) || parseInt(vs.engagement_score) || 0,
                retention_potential: parseInt(vs.content_quality) || 0,
                growth_potential: parseInt(vs.viral_potential) || 0,
                why: vs.verdict || ''
            };
        }

        // old hook_structure → hook_analysis
        if (!r.hook_analysis && r.hook_structure) {
            const hs = r.hook_structure;
            r.hook_analysis = {
                type: hs.type || 'curiosity',
                why_it_works: hs.analysis || '',
                first_10_seconds: hs.first_5_seconds || hs.first_10_seconds || ''
            };
        }

        // old fields → viral_patterns
        if (!r.viral_patterns) {
            const patterns = [];
            if (r.content_dna && Array.isArray(r.content_dna.replicable_patterns)) {
                r.content_dna.replicable_patterns.forEach(p => patterns.push(String(p)));
            }
            if (r.psychological_triggers && Array.isArray(r.psychological_triggers)) {
                r.psychological_triggers.slice(0, 2).forEach(p => patterns.push(String(p)));
            }
            if (patterns.length) r.viral_patterns = patterns;
        }

        // old seo_section → title_thumbnail
        if (!r.title_thumbnail && r.seo_section) {
            const seo = r.seo_section;
            r.title_thumbnail = {
                why_title_works: '',
                ctr_angle: '',
                thumbnail_psychology: typeof r.thumbnail_psychology === 'object' ? (r.thumbnail_psychology.analysis || '') : (r.thumbnail_psychology || ''),
                improved_titles: (seo.title_variations || []).map(t =>
                    typeof t === 'string' ? { title: t, ctr_score: 0, angle: '' } : { title: t.title || '', ctr_score: t.ctr_score || 0, angle: t.why || '' }
                ),
                thumbnail_text_ideas: seo.thumbnail_text_ideas || []
            };
        }

        // old storytelling_framework → script_extraction
        if (!r.script_extraction && r.storytelling_framework) {
            const sf = r.storytelling_framework;
            r.script_extraction = {
                opening: sf.template || sf.structure || '',
                key_points: [sf.hero || '', sf.conflict || '', sf.resolution || ''].filter(Boolean),
                ending: sf.full_script ? sf.full_script.substring(0, 300) : ''
            };
        }

        // old fields → clone_this_video
        if (!r.clone_this_video) {
            const clone = {};
            clone.new_video_idea = (r.video_ideas && r.video_ideas[0]) ? (typeof r.video_ideas[0] === 'string' ? r.video_ideas[0] : r.video_ideas[0].title || '') : '';
            clone.full_hook = (r.hook_variations && r.hook_variations[0]) ? String(r.hook_variations[0]) : '';
            clone.script_outline = (r.ai_prompt_hub && r.ai_prompt_hub.recreation_mega_prompt) ? r.ai_prompt_hub.recreation_mega_prompt : (r.script_reverse_engineering || '');
            clone.scene_plan = (r.video_production && Array.isArray(r.video_production.storyboard)) ?
                r.video_production.storyboard.slice(0, 5).map((s, i) => ({
                    scene: i + 1,
                    time: s.sure || '',
                    description: s.aciklama || '',
                    voiceover: s.voiceover_script || '',
                    ai_video_prompt: s.ai_video_prompt || ''
                })) : [];
            clone.seo_tags = (r.seo_section && r.seo_section.seo_tags) ? r.seo_section.seo_tags : (r.seo_tags || []);
            r.clone_this_video = clone;
        }

        // old video_ideas → content_factory
        if (!r.content_factory) {
            const ideas = [];
            const src = r.video_ideas || r.similar_video_prompts || r.viral_hook_prompts || [];
            src.forEach(item => {
                if (typeof item === 'string') ideas.push({ title: item, hook: '', why: '' });
                else ideas.push({ title: item.title || '', hook: item.hook || '', why: item.angle || item.why || '' });
            });
            const highCtr = (r.seo_section && r.seo_section.title_variations) ?
                r.seo_section.title_variations.map(t => ({ title: typeof t === 'string' ? t : (t.title || ''), ctr_score: t.ctr_score || 0 })) :
                (r.high_ctr_titles || []).map(t => typeof t === 'string' ? { title: t, ctr_score: 0 } : t);
            r.content_factory = { video_ideas: ideas, high_ctr_titles: highCtr };
        }

        // old video_structure / retention_strategy → video_structure
        if (!r.video_structure) {
            r.video_structure = {
                hook: (r.hook_structure && r.hook_structure.first_5_seconds) || '',
                setup: '',
                buildup: typeof r.retention_strategy === 'string' ? r.retention_strategy.substring(0, 200) : '',
                payoff: '',
                cta: r.cta_strategy || ''
            };
        }

        // old shorts_moments → shorts_opportunities
        if (!r.shorts_opportunities && r.shorts_moments) {
            r.shorts_opportunities = r.shorts_moments.map(m => ({
                title: '',
                timestamp: m.timestamp || '',
                duration: m.duration || '',
                hook: '',
                why: m.reason || ''
            }));
        }

        // old monetization_ideas → monetization
        if (!r.monetization) {
            r.monetization = {
                how_it_makes_money: '',
                strategies: r.monetization_ideas || [],
                best_cta: r.cta_strategy || ''
            };
        }

        return r;
    }

    // ==================== MAIN RENDER ====================
    let currentAnalysisData = null;

    function renderAnalysis(data) {
        currentAnalysisData = data;
        const rawR = data.analysis_results || {};
        const r = migrateOldSchema(rawR);
        const meta = data.video_metadata || {};
        const isLimited = data.is_limited === true;

        // Topbar
        document.getElementById('video-title').textContent = meta.title || I18N.t('video_analysis_title', 'Video Analizi');
        const chanName = document.getElementById('channel-name');
        if (chanName) chanName.textContent = meta.channelName || I18N.t('unknown', 'Bilinmiyor');
        const chanImg = document.getElementById('channel-img');
        if (chanImg && (meta.channelAvatar || meta.thumbnail)) {
            chanImg.src = meta.channelAvatar || meta.thumbnail;
            chanImg.style.display = '';
        }
        const topbarThumb = document.getElementById('topbar-thumb');
        if (topbarThumb) {
            if (meta.thumbnail) {
                topbarThumb.src = meta.thumbnail;
                topbarThumb.style.display = '';
            } else {
                topbarThumb.style.display = 'none';
            }
        }
        const metaViews = document.getElementById('meta-views');
        const viewCount = document.getElementById('view-count');
        if (meta.viewCount && metaViews && viewCount) {
            metaViews.style.display = 'flex';
            viewCount.textContent = meta.viewCount;
        }
        const metaDate = document.getElementById('meta-date');
        const publishDate = document.getElementById('publish-date');
        if (meta.publishDate && metaDate && publishDate) {
            metaDate.style.display = 'flex';
            publishDate.textContent = meta.publishDate;
        }

        // Analysis type badge
        const analysisType = r._analysisType || 'metadata';
        const badgeMap = {
            'video': { text: 'Video Analizi', color: '#10b981' },
            'transcript': { text: 'Transkript', color: '#3b82f6' },
            'metadata': { text: 'Metadata', color: '#6b7280' }
        };
        const badge = badgeMap[analysisType] || badgeMap.metadata;
        const badgeEl = document.getElementById('analysis-type-badge');
        if (badgeEl) {
            badgeEl.style.cssText = `display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:white;background:${badge.color};margin-left:8px;`;
            badgeEl.textContent = badge.text;
        }

        // Score banner (new: 4 scores from viral_score)
        if (r.viral_score) renderScoreBanner(r.viral_score);

        // Clear containers
        const containers = ['viral-content', 'clone-content', 'factory-content', 'structure-content', 'script-content', 'seo-content', 'channel-content', 'monetize-content', 'battle-content'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        // Render tabs
        renderTabViral(r);
        renderTabClone(r);
        renderTabFactory(r);
        renderTabStructure(r);
        renderTabScript(data);
        renderTabSEO(r);
        renderTabMonetize(r);
        renderTabBattle(r);

        // Free user locked state
        if (isLimited) renderLockedState();
    }

    // ==================== SCORE BANNER ====================
    function renderScoreBanner(vs) {
        const banner = document.getElementById('score-banner');
        if (!banner) return;
        banner.style.display = 'grid';
        banner.innerHTML = '';

        const CIRCUMFERENCE = 201.06; // 2 * π * 32

        const items = [
            { label: 'Viral Skor',      value: vs.score,              color: '#ff4444' },
            { label: 'CTR Potansiyeli', value: vs.ctr_potential,      color: '#7b68ee' },
            { label: 'Retention',       value: vs.retention_potential, color: '#f59e0b' },
            { label: 'Büyüme',          value: vs.growth_potential,   color: '#00c851' }
        ];

        items.forEach(item => {
            const val = Math.min(100, Math.max(0, parseInt(item.value) || 0));
            const colorClass = val >= 70 ? 'score-high' : val >= 40 ? 'score-mid' : 'score-low';
            const targetOffset = CIRCUMFERENCE * (1 - val / 100);

            const div = document.createElement('div');
            div.className = 'score-card';
            div.style.setProperty('--bar-color', item.color);
            div.innerHTML = `
                <div class="score-ring-wrap">
                    <svg class="score-ring-svg" viewBox="0 0 80 80">
                        <circle class="score-ring-bg" cx="40" cy="40" r="32"/>
                        <circle class="score-ring-fill" cx="40" cy="40" r="32"
                                style="stroke:${item.color};stroke-dasharray:${CIRCUMFERENCE};stroke-dashoffset:${CIRCUMFERENCE}"
                                data-target-offset="${targetOffset}"/>
                    </svg>
                    <div class="score-ring-num ${colorClass}" data-target="${val}">0</div>
                </div>
                <div class="score-lbl">${item.label}</div>`;
            banner.appendChild(div);
        });

        requestAnimationFrame(() => {
            // Animate ring fills
            banner.querySelectorAll('.score-ring-fill[data-target-offset]').forEach((circle, i) => {
                const targetOffset = parseFloat(circle.dataset.targetOffset);
                setTimeout(() => {
                    circle.style.strokeDashoffset = targetOffset;
                }, i * 150);
            });
            // Animate counters
            banner.querySelectorAll('.score-ring-num[data-target]').forEach((el, i) => {
                animateCounter(el, 0, parseInt(el.dataset.target), 1200, i * 150);
            });
        });

        if (vs.why) {
            const verdictDiv = document.createElement('div');
            verdictDiv.className = 'verdict-card';
            verdictDiv.textContent = vs.why;
            banner.appendChild(verdictDiv);
        }
    }

    // ==================== TAB: VIRAL SCORE ====================
    function renderTabViral(r) {
        const container = document.getElementById('viral-content');
        if (!container) return;

        const grid = document.createElement('div');
        grid.className = 'grid-2';

        // Hook Analysis card
        if (r.hook_analysis) {
            const ha = r.hook_analysis;
            const card = document.createElement('div');
            card.className = 'card accent';
            const typeColor = { curiosity: '#7b68ee', shock: '#ff4444', story: '#f59e0b', promise: '#00c851', controversy: '#ec4899', question: '#06b6d4' };
            const tc = typeColor[ha.type] || 'var(--accent)';
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title">&#128165; Hook Analizi</span>
                    ${ha.type ? `<span style="background:${tc}22;color:${tc};padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase">${sanitizeHTML(ha.type)}</span>` : ''}
                </div>
                <div class="card-body">
                    ${ha.why_it_works ? `<div class="dna-row"><div class="dna-lbl">Neden İşe Yarıyor</div><div class="dna-val">${sanitizeHTML(ha.why_it_works)}</div></div>` : ''}
                    ${ha.first_10_seconds ? `<div class="dna-row"><div class="dna-lbl">İlk 10 Saniye</div><div class="dna-val" style="font-style:italic;color:var(--text-dim)">${sanitizeHTML(ha.first_10_seconds)}</div></div>` : ''}
                </div>`;
            grid.appendChild(card);
        }

        // Viral Patterns
        if (r.viral_patterns && Array.isArray(r.viral_patterns) && r.viral_patterns.length > 0) {
            const card = document.createElement('div');
            card.className = 'card accent';
            const patternsHTML = r.viral_patterns.map((p, i) => `
                <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(255,68,68,0.04);border:1px solid rgba(255,68,68,0.12);border-radius:8px;margin-bottom:8px">
                    <span style="background:var(--accent);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${i + 1}</span>
                    <span style="font-size:13px;color:var(--text-dim);line-height:1.5">${sanitizeHTML(String(p))}</span>
                </div>`).join('');
            card.innerHTML = `<div class="card-header"><span class="card-title">&#9889; Viral Kalıplar</span></div><div class="card-body">${patternsHTML}</div>`;
            grid.appendChild(card);
        }

        // Niche Benchmark
        if (r.niche_benchmark) {
            const nb = r.niche_benchmark;
            const verdictColor = {
                'ÜSTÜN': '#00c851', 'ORTALAMANIN ÜZERİNDE': '#06b6d4',
                'ORTALAMA': '#f59e0b', 'ORTALAMANIN ALTINDA': '#f97316', 'ZAYIF': '#ff4444'
            };
            const vc = verdictColor[nb.performance_verdict] || '#aaa';
            const pct = Math.min(100, Math.max(0, parseInt(nb.percentile) || 0));
            const card = document.createElement('div');
            card.className = 'card accent';
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title">&#128202; Niche Benchmark</span>
                    ${nb.niche ? `<span style="background:#ffffff10;color:var(--text-dim);padding:3px 10px;border-radius:100px;font-size:11px;font-weight:600">${sanitizeHTML(nb.niche)}</span>` : ''}
                </div>
                <div class="card-body">
                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
                        <div style="text-align:center">
                            <div style="font-size:28px;font-weight:900;color:${vc}">${pct}</div>
                            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Yüzdelik</div>
                        </div>
                        <div style="flex:1">
                            <div style="background:${vc}22;color:${vc};padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:8px">${sanitizeHTML(nb.performance_verdict || '')}</div>
                            <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:10px;overflow:hidden">
                                <div style="height:100%;width:${pct}%;background:${vc};border-radius:10px"></div>
                            </div>
                        </div>
                    </div>
                    ${nb.typical_view_range ? `<div class="dna-row"><div class="dna-lbl">Niche Ortalaması</div><div class="dna-val">${sanitizeHTML(nb.typical_view_range)}</div></div>` : ''}
                    ${nb.benchmark_context ? `<div class="dna-row"><div class="dna-lbl">Yorum</div><div class="dna-val">${sanitizeHTML(nb.benchmark_context)}</div></div>` : ''}
                </div>`;
            grid.appendChild(card);
        }

        // Trend Signal
        if (r.trend_signal) {
            const ts = r.trend_signal;
            const statusColor = {
                'RISING': '#00c851', 'EMERGING': '#06b6d4', 'PEAK': '#f59e0b',
                'DECLINING': '#f97316', 'EVERGREEN': '#7b68ee'
            };
            const statusIcon = {
                'RISING': '&#128200;', 'EMERGING': '&#9889;', 'PEAK': '&#127942;',
                'DECLINING': '&#128201;', 'EVERGREEN': '&#9752;'
            };
            const sc = statusColor[ts.status] || '#aaa';
            const si = statusIcon[ts.status] || '&#128202;';
            const longevityLabel = { SHORT: 'Kısa Vadeli', MEDIUM: 'Orta Vadeli', LONG: 'Uzun Vadeli', EVERGREEN: 'Evergreen' };
            const card = document.createElement('div');
            card.className = 'card accent';
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title">&#128293; Trend Sinyali</span>
                    ${ts.status ? `<span style="background:${sc}22;color:${sc};padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700">${si} ${sanitizeHTML(ts.status)}</span>` : ''}
                </div>
                <div class="card-body">
                    ${ts.longevity ? `<div class="dna-row"><div class="dna-lbl">Trend Ömrü</div><div class="dna-val" style="color:${sc};font-weight:600">${sanitizeHTML(longevityLabel[ts.longevity] || ts.longevity)}</div></div>` : ''}
                    ${ts.momentum ? `<div class="dna-row"><div class="dna-lbl">Momentum</div><div class="dna-val">${sanitizeHTML(ts.momentum)}</div></div>` : ''}
                    ${ts.action ? `<div style="margin-top:12px;padding:10px 14px;background:${sc}15;border-left:3px solid ${sc};border-radius:0 8px 8px 0;font-size:13px;color:var(--text);font-weight:500">&#128161; ${sanitizeHTML(ts.action)}</div>` : ''}
                </div>`;
            grid.appendChild(card);
        }

        // Viral score breakdown (if detailed)
        if (r.viral_score) {
            const vs = r.viral_score;
            const card = document.createElement('div');
            card.className = 'card col-full purple';
            const bars = [
                { label: 'Viral Skor', val: vs.score, color: '#ff4444' },
                { label: 'CTR Potansiyeli', val: vs.ctr_potential, color: '#7b68ee' },
                { label: 'Retention Potansiyeli', val: vs.retention_potential, color: '#f59e0b' },
                { label: 'Büyüme Potansiyeli', val: vs.growth_potential, color: '#00c851' }
            ];
            const barsHTML = bars.map(b => {
                const v = parseInt(b.val) || 0;
                return `
                    <div style="margin-bottom:14px">
                        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                            <span style="font-size:12px;color:var(--text-dim);font-weight:500">${b.label}</span>
                            <span style="font-size:14px;font-weight:800;color:${b.color}">${v}</span>
                        </div>
                        <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:10px;overflow:hidden">
                            <div style="height:100%;width:${v}%;background:${b.color};border-radius:10px;transition:width 1s ease"></div>
                        </div>
                    </div>`;
            }).join('');
            card.innerHTML = `<div class="card-header"><span class="card-title">&#128200; Skor Analizi</span></div><div class="card-body">${barsHTML}</div>`;
            grid.appendChild(card);
        }

        container.appendChild(grid);
    }

    // ==================== TAB: CLONE THIS VIDEO ====================
    function renderTabClone(r) {
        const container = document.getElementById('clone-content');
        if (!container) return;

        const clone = r.clone_this_video || {};

        // Hero banner
        const banner = document.createElement('div');
        banner.className = 'clone-hero-banner';
        banner.innerHTML = `
            <div class="clone-hero-icon">&#127916;</div>
            <div class="clone-hero-text">
                <h2>Bir Sonraki Videonuz Hazır</h2>
                <p>Bu videoyu klonlayın — aynı başarı formülü, taze bakış açısı. Hemen çekmeye başlayın.</p>
            </div>`;
        container.appendChild(banner);

        // New video idea
        if (clone.new_video_idea) {
            const ideaCard = document.createElement('div');
            ideaCard.className = 'clone-idea-card';
            ideaCard.innerHTML = `
                <div class="clone-idea-label">&#127775; Yeni Video Fikri</div>
                <div class="clone-idea-text">${sanitizeHTML(clone.new_video_idea)}</div>`;
            container.appendChild(ideaCard);
        }

        // Full Hook
        if (clone.full_hook) {
            const hookDiv = document.createElement('div');
            hookDiv.className = 'hook-display';
            hookDiv.innerHTML = `
                <div class="hook-display-label">&#128165; Tam Hook — Hemen Kullan</div>
                <div class="hook-display-text">"${sanitizeHTML(clone.full_hook)}"</div>
                <button class="hook-copy-btn" id="copy-hook-btn">Kopyala</button>`;
            hookDiv.querySelector('#copy-hook-btn').addEventListener('click', () => {
                copyToClipboard(clone.full_hook);
                const btn = hookDiv.querySelector('#copy-hook-btn');
                btn.textContent = 'Kopyalandı!';
                setTimeout(() => { btn.textContent = 'Kopyala'; }, 2000);
            });
            container.appendChild(hookDiv);
        }

        // Script Outline (collapsible)
        if (clone.script_outline) {
            const card = document.createElement('div');
            card.className = 'card gold';
            card.style.marginBottom = '14px';
            const wrap = document.createElement('div');
            wrap.className = 'collapse-wrap collapsed';
            wrap.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:var(--text-dim);line-height:1.8;padding:14px 18px">${sanitizeHTML(clone.script_outline)}</pre>`;
            const colBtn = document.createElement('button');
            colBtn.className = 'collapse-btn';
            colBtn.innerHTML = `<span>Senaryo Taslağını Gör</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
            colBtn.addEventListener('click', () => {
                const isCollapsed = wrap.classList.toggle('collapsed');
                colBtn.querySelector('span').textContent = isCollapsed ? 'Senaryo Taslağını Gör' : 'Daralt';
            });
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title gold">&#128196; Senaryo Taslağı</span>
                    <button class="copy-btn" id="copy-script-outline">Kopyala</button>
                </div>`;
            card.appendChild(wrap);
            card.appendChild(colBtn);
            card.querySelector('#copy-script-outline').addEventListener('click', () => {
                copyToClipboard(clone.script_outline);
                showToast('Kopyalandı');
            });
            container.appendChild(card);
        }

        // Scene Plan
        if (clone.scene_plan && Array.isArray(clone.scene_plan) && clone.scene_plan.length > 0) {
            const scenesCard = document.createElement('div');
            scenesCard.className = 'card purple';
            scenesCard.style.marginBottom = '14px';
            scenesCard.innerHTML = `<div class="card-header"><span class="card-title purple">&#127916; Sahne Planı — ${clone.scene_plan.length} Sahne</span></div>`;

            const scenesBody = document.createElement('div');
            scenesBody.style.padding = '12px';

            clone.scene_plan.forEach((scene, i) => {
                const sceneEl = document.createElement('div');
                sceneEl.className = 'scene-card';
                sceneEl.innerHTML = `
                    <div class="scene-header">
                        <div class="scene-num">${scene.scene || i + 1}</div>
                        <div class="scene-title">${sanitizeHTML(scene.description || '')}</div>
                        ${scene.time ? `<span class="scene-time-badge">${sanitizeHTML(scene.time)}</span>` : ''}
                    </div>
                    ${scene.voiceover ? `
                        <div class="voiceover-box">
                            <div class="voiceover-label">&#127908; Seslendirme</div>
                            <div class="voiceover-text">${sanitizeHTML(scene.voiceover)}</div>
                        </div>` : ''}
                    ${scene.ai_video_prompt ? `
                        <div class="ai-prompt-box data-copy-trigger" data-copy="${encodeURIComponent(scene.ai_video_prompt || '')}">
                            <div style="flex:1">
                                <div class="ai-prompt-label">&#127918; AI Video Prompt — Tıkla Kopyala</div>
                                <div class="ai-prompt-text">${sanitizeHTML(scene.ai_video_prompt)}</div>
                            </div>
                            <span style="color:var(--purple);font-size:14px;flex-shrink:0">&#128203;</span>
                        </div>` : ''}
                    ${scene.clip_prompt_10s ? `
                        <div class="clip-prompt-10s-box data-copy-trigger" data-copy="${encodeURIComponent(scene.clip_prompt_10s || '')}">
                            <div style="flex:1">
                                <div class="clip-prompt-10s-label">&#9201; 10sn Klip Promptu &mdash; Kling / Runway / Luma &mdash; Tıkla Kopyala</div>
                                <div class="clip-prompt-10s-text">${sanitizeHTML(scene.clip_prompt_10s)}</div>
                            </div>
                            <span style="color:#ff6b35;font-size:14px;flex-shrink:0">&#128203;</span>
                        </div>` : ''}`;
                scenesBody.appendChild(sceneEl);
            });

            scenesCard.appendChild(scenesBody);
            container.appendChild(scenesCard);
        }

        // SEO Tags
        if (clone.seo_tags && Array.isArray(clone.seo_tags) && clone.seo_tags.length > 0) {
            const tagsCard = document.createElement('div');
            tagsCard.className = 'card green';
            const tagsHTML = clone.seo_tags.map(tag =>
                `<span class="tag data-copy-trigger" data-copy="${encodeURIComponent(String(tag))}">${sanitizeHTML(String(tag))}</span>`
            ).join('');
            tagsCard.innerHTML = `
                <div class="card-header">
                    <span class="card-title cyan">&#127991; SEO Etiketleri</span>
                    <button class="copy-btn" id="copy-seo-tags">Tümünü Kopyala</button>
                </div>
                <div class="card-body"><div class="tag-cloud">${tagsHTML}</div></div>`;
            tagsCard.querySelector('#copy-seo-tags').addEventListener('click', () => {
                copyToClipboard(clone.seo_tags.join(', '));
                showToast('Etiketler kopyalandı');
            });
            container.appendChild(tagsCard);
        }
    }

    // ==================== TAB: CONTENT FACTORY ====================
    function renderTabFactory(r) {
        const container = document.getElementById('factory-content');
        if (!container) return;

        const factory = r.content_factory || {};

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align:center;padding:0 0 24px;border-bottom:1px solid var(--card-border);margin-bottom:24px';
        header.innerHTML = `
            <h2 style="font-size:22px;font-weight:800;background:linear-gradient(135deg,var(--purple),#ec4899);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px">&#127981; Content Factory</h2>
            <p style="color:var(--text-muted);font-size:13px">Bu videodan 10 yeni video fikri + yüksek CTR başlıkları</p>`;
        container.appendChild(header);

        // 10 Video Ideas grid
        if (factory.video_ideas && Array.isArray(factory.video_ideas) && factory.video_ideas.length > 0) {
            const ideasLabel = document.createElement('div');
            ideasLabel.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px';
            ideasLabel.textContent = '10 Video Fikri';
            container.appendChild(ideasLabel);

            const ideasGrid = document.createElement('div');
            ideasGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:28px';

            factory.video_ideas.forEach((idea, i) => {
                const card = document.createElement('div');
                card.className = 'factory-idea-card';
                card.innerHTML = `
                    <div class="factory-idea-num">Fikir ${i + 1}</div>
                    <div class="factory-idea-title">${sanitizeHTML(idea.title || '')}</div>
                    ${idea.hook ? `<div class="factory-idea-hook">"${sanitizeHTML(idea.hook)}"</div>` : ''}
                    ${idea.why ? `<div class="factory-idea-why">&#128161; ${sanitizeHTML(idea.why)}</div>` : ''}`;
                ideasGrid.appendChild(card);
            });

            container.appendChild(ideasGrid);
        }

        // High CTR Titles
        if (factory.high_ctr_titles && Array.isArray(factory.high_ctr_titles) && factory.high_ctr_titles.length > 0) {
            const titlesLabel = document.createElement('div');
            titlesLabel.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px';
            titlesLabel.textContent = 'Yüksek CTR Başlıklar';
            container.appendChild(titlesLabel);

            const titlesDiv = document.createElement('div');
            titlesDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px';

            factory.high_ctr_titles.forEach(item => {
                const score = parseInt(item.ctr_score) || 0;
                const color = score >= 85 ? 'var(--green)' : score >= 70 ? 'var(--orange)' : 'var(--accent)';
                const bg = score >= 85 ? 'rgba(0,200,81,0.1)' : score >= 70 ? 'rgba(245,158,11,0.1)' : 'rgba(255,68,68,0.1)';
                const row = document.createElement('div');
                row.className = 'ctr-title-item';
                row.addEventListener('click', () => {
                    navigator.clipboard && navigator.clipboard.writeText(item.title || '');
                    showToast('Kopyalandı');
                });
                row.innerHTML = `
                    <div class="ctr-score-badge" style="background:${bg};color:${color}">${score}</div>
                    <div class="ctr-title-text">
                        <h4>${sanitizeHTML(item.title || '')}</h4>
                    </div>`;
                titlesDiv.appendChild(row);
            });

            container.appendChild(titlesDiv);
        }
    }

    // ==================== TAB: STRUCTURE & SCRIPT ====================
    function renderTabStructure(r) {
        const container = document.getElementById('structure-content');
        if (!container) return;

        const grid = document.createElement('div');
        grid.className = 'grid-2';

        // Video Structure (5 sections)
        if (r.video_structure) {
            const vs = r.video_structure;
            const card = document.createElement('div');
            card.className = 'card col-full accent';
            const sections = [
                { key: 'hook', label: '&#128165; Hook', color: 'var(--accent)' },
                { key: 'setup', label: '&#128270; Setup', color: 'var(--blue)' },
                { key: 'buildup', label: '&#128200; Buildup', color: 'var(--orange)' },
                { key: 'payoff', label: '&#127775; Payoff', color: 'var(--green)' },
                { key: 'cta', label: '&#128226; CTA', color: 'var(--purple)' }
            ];
            const sectionsHTML = sections.filter(s => vs[s.key]).map(s => `
                <div class="structure-section">
                    <div class="structure-section-label" style="color:${s.color}">${s.label}</div>
                    <div class="structure-section-text">${sanitizeHTML(vs[s.key])}</div>
                </div>`).join('');
            card.innerHTML = `<div class="card-header"><span class="card-title">&#127916; Video Yapısı</span></div><div class="card-body">${sectionsHTML}</div>`;
            grid.appendChild(card);
        }

        // Script Extraction
        if (r.script_extraction) {
            const se = r.script_extraction;
            const card = document.createElement('div');
            card.className = 'card purple';
            let html = '';
            if (se.opening) html += `<div class="dna-row"><div class="dna-lbl">Açılış</div><div class="dna-val">${sanitizeHTML(se.opening)}</div></div>`;
            if (se.key_points && Array.isArray(se.key_points) && se.key_points.length) {
                html += `<div class="dna-row"><div class="dna-lbl">Ana Noktalar</div><ul class="item-list">${se.key_points.map(p => `<li>${sanitizeHTML(String(p))}</li>`).join('')}</ul></div>`;
            }
            if (se.ending) html += `<div class="dna-row"><div class="dna-lbl">Kapanış</div><div class="dna-val">${sanitizeHTML(se.ending)}</div></div>`;
            card.innerHTML = `<div class="card-header"><span class="card-title purple">&#128214; Script Çıkarımı</span></div><div class="card-body">${html || '<p class="body-text">Veri yok</p>'}</div>`;
            grid.appendChild(card);
        }

        // Shorts Opportunities
        if (r.shorts_opportunities && Array.isArray(r.shorts_opportunities) && r.shorts_opportunities.length > 0) {
            const card = document.createElement('div');
            card.className = 'card green';
            const shortsHTML = r.shorts_opportunities.map(s => `
                <div class="shorts-item">
                    <div style="flex-shrink:0;text-align:center">
                        <div class="shorts-timestamp">${sanitizeHTML(s.timestamp || '')}</div>
                        ${s.duration ? `<div class="shorts-duration">${sanitizeHTML(s.duration)}</div>` : ''}
                    </div>
                    <div class="shorts-info">
                        ${s.title ? `<div class="shorts-title">${sanitizeHTML(s.title)}</div>` : ''}
                        ${s.hook ? `<div class="shorts-hook">"${sanitizeHTML(s.hook)}"</div>` : ''}
                        ${s.why ? `<div class="shorts-why">&#128161; ${sanitizeHTML(s.why)}</div>` : ''}
                    </div>
                </div>`).join('');
            card.innerHTML = `<div class="card-header"><span class="card-title green">&#9889; Shorts Fırsatları</span></div><div class="card-body">${shortsHTML}</div>`;
            grid.appendChild(card);
        }

        container.appendChild(grid);
    }

    // ==================== TAB: SEO & TITLE ====================
    function renderTabSEO(r) {
        const container = document.getElementById('seo-content');
        if (!container) return;

        const tt = r.title_thumbnail || {};
        const grid = document.createElement('div');
        grid.className = 'grid-2';

        // Title analysis
        if (tt.why_title_works || tt.ctr_angle) {
            const card = document.createElement('div');
            card.className = 'card purple';
            let html = '';
            if (tt.why_title_works) html += `<div class="dna-row"><div class="dna-lbl">Başlık Neden Çalışıyor</div><div class="dna-val">${sanitizeHTML(tt.why_title_works)}</div></div>`;
            if (tt.ctr_angle) html += `<div class="dna-row"><div class="dna-lbl">CTR Açısı</div><div class="dna-val" style="color:var(--accent);font-weight:600">${sanitizeHTML(tt.ctr_angle)}</div></div>`;
            if (tt.thumbnail_psychology) html += `<div class="dna-row"><div class="dna-lbl">Thumbnail Psikolojisi</div><div class="dna-val">${sanitizeHTML(tt.thumbnail_psychology)}</div></div>`;
            card.innerHTML = `<div class="card-header"><span class="card-title">&#127919; Başlık ve Thumbnail Analizi</span></div><div class="card-body">${html}</div>`;
            grid.appendChild(card);
        }

        // Improved Titles with CTR scores
        if (tt.improved_titles && Array.isArray(tt.improved_titles) && tt.improved_titles.length > 0) {
            const card = document.createElement('div');
            card.className = 'card col-full accent';
            const titlesHTML = tt.improved_titles.map(item => {
                const score = parseInt(item.ctr_score) || 0;
                const color = score >= 80 ? 'var(--green)' : score >= 65 ? 'var(--orange)' : 'var(--accent)';
                const bg = score >= 80 ? 'rgba(0,200,81,0.1)' : score >= 65 ? 'rgba(245,158,11,0.1)' : 'rgba(255,68,68,0.1)';
                return `<div class="ctr-title-item data-copy-trigger" style="cursor:pointer" data-copy="${encodeURIComponent(item.title || '')}">
                    <div class="ctr-score-badge" style="background:${bg};color:${color}">${score}</div>
                    <div class="ctr-title-text">
                        <h4>${sanitizeHTML(item.title || '')}</h4>
                        ${item.angle ? `<p>${sanitizeHTML(item.angle)}</p>` : ''}
                    </div>
                </div>`;
            }).join('');
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title">&#127919; Geliştirilmiş Başlıklar + CTR Skoru</span>
                    <button class="copy-btn" id="copy-all-titles">Tümünü Kopyala</button>
                </div>
                <div class="card-body" style="padding:12px">${titlesHTML}</div>`;
            card.querySelector('#copy-all-titles').addEventListener('click', () => {
                const txt = tt.improved_titles.map(t => t.title || '').join('\n');
                copyToClipboard(txt);
                showToast('Kopyalandı');
            });
            grid.appendChild(card);
        }

        // Thumbnail Text Ideas
        if (tt.thumbnail_text_ideas && Array.isArray(tt.thumbnail_text_ideas) && tt.thumbnail_text_ideas.length > 0) {
            const card = document.createElement('div');
            card.className = 'card gold';
            const itemsHTML = tt.thumbnail_text_ideas.map(item =>
                `<div class="prompt-item data-copy-trigger" data-copy="${encodeURIComponent(String(item))}">${sanitizeHTML(String(item))}</div>`
            ).join('');
            card.innerHTML = `<div class="card-header"><span class="card-title orange">&#128247; Thumbnail Metin Fikirleri</span></div><div class="card-body"><div class="prompt-list">${itemsHTML}</div></div>`;
            grid.appendChild(card);
        }

        // SEO Tags from clone
        const cloneTags = (r.clone_this_video || {}).seo_tags || [];
        if (cloneTags.length > 0) {
            const card = document.createElement('div');
            card.className = 'card green';
            const tagsHTML = cloneTags.map(tag =>
                `<span class="tag data-copy-trigger" data-copy="${encodeURIComponent(String(tag))}">${sanitizeHTML(String(tag))}</span>`
            ).join('');
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title cyan">&#127991; SEO Etiketleri</span>
                    <button class="copy-btn" id="copy-seo-tags-seo">Kopyala</button>
                </div>
                <div class="card-body"><div class="tag-cloud">${tagsHTML}</div></div>`;
            card.querySelector('#copy-seo-tags-seo').addEventListener('click', () => {
                copyToClipboard(cloneTags.join(', '));
                showToast('Kopyalandı');
            });
            grid.appendChild(card);
        }

        container.appendChild(grid);
    }

    // ==================== TAB: MONETIZATION ====================
    function renderTabMonetize(r) {
        const container = document.getElementById('monetize-content');
        if (!container) return;

        const mon = r.monetization || {};
        const grid = document.createElement('div');
        grid.className = 'grid-2';

        if (mon.how_it_makes_money) {
            const card = document.createElement('div');
            card.className = 'card col-full green';
            card.innerHTML = `<div class="card-header"><span class="card-title green">&#128176; Para Kazanma Mekanizması</span></div><div class="card-body"><p class="body-text" style="font-size:15px;font-weight:500;color:var(--text)">${sanitizeHTML(mon.how_it_makes_money)}</p></div>`;
            grid.appendChild(card);
        }

        if (mon.strategies && Array.isArray(mon.strategies) && mon.strategies.length > 0) {
            const card = document.createElement('div');
            card.className = 'card purple';
            card.innerHTML = `<div class="card-header"><span class="card-title">&#128161; Stratejiler</span></div><div class="card-body"><ul class="item-list">${mon.strategies.map(s => `<li>${sanitizeHTML(String(s))}</li>`).join('')}</ul></div>`;
            grid.appendChild(card);
        }

        if (mon.best_cta) {
            const card = document.createElement('div');
            card.className = 'card gold';
            card.innerHTML = `
                <div class="card-header"><span class="card-title orange">&#128226; En İyi CTA</span></div>
                <div class="card-body">
                    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:14px 16px;font-size:14px;font-weight:600;color:var(--text);line-height:1.6">
                        ${sanitizeHTML(mon.best_cta)}
                    </div>
                </div>`;
            grid.appendChild(card);
        }

        if (!mon.how_it_makes_money && !mon.strategies && !mon.best_cta) {
            container.innerHTML = `<div class="empty-state"><div class="icon">&#128176;</div><h3>Monetizasyon verisi yok</h3><p>Bu analiz için monetizasyon bilgisi mevcut değil.</p></div>`;
            return;
        }

        container.appendChild(grid);
    }

    // ==================== TAB: BATTLE PLAN ====================
    function renderTabBattle(r) {
        const container = document.getElementById('battle-content');
        if (!container) return;

        const bp = r.battle_plan;
        const nb = r.niche_benchmark;
        const ts = r.trend_signal;

        if (!bp && !nb && !ts) {
            container.innerHTML = `<div class="empty-state"><div class="icon">&#9876;</div><h3>Rakip verisi yok</h3><p>Bu analiz henüz rakip karşılaştırması içermiyor. Videoyu yeniden analiz edin.</p></div>`;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'grid-2';

        // Hero banner
        const hero = document.createElement('div');
        hero.className = 'clone-hero-banner col-full';
        hero.style.cssText = 'background:linear-gradient(135deg,rgba(255,68,68,0.12),rgba(123,104,238,0.12));border:1px solid rgba(255,68,68,0.2)';
        hero.innerHTML = `
            <div class="clone-hero-icon">&#9876;</div>
            <div class="clone-hero-text">
                <h2>Rakip Analizi & Karşı Strateji</h2>
                <p>Bu videonun zayıf noktalarını exploit et. Trend'ini yakala. Rakibi geç.</p>
            </div>`;
        container.appendChild(hero);

        // Weakness + Gap
        if (bp) {
            if (bp.weakness || bp.gap) {
                const card = document.createElement('div');
                card.className = 'card accent';
                let html = '';
                if (bp.weakness) html += `<div class="dna-row"><div class="dna-lbl" style="color:#ff4444">&#128245; Zayıf Nokta</div><div class="dna-val">${sanitizeHTML(bp.weakness)}</div></div>`;
                if (bp.gap) html += `<div class="dna-row"><div class="dna-lbl" style="color:#f59e0b">&#128270; Doldurulmamış Boşluk</div><div class="dna-val">${sanitizeHTML(bp.gap)}</div></div>`;
                if (bp.differentiation) html += `<div class="dna-row"><div class="dna-lbl" style="color:#06b6d4">&#9889; Farklılaşma</div><div class="dna-val">${sanitizeHTML(bp.differentiation)}</div></div>`;
                card.innerHTML = `<div class="card-header"><span class="card-title">&#128245; Rakip Zayıflıkları</span></div><div class="card-body">${html}</div>`;
                grid.appendChild(card);
            }

            // Counter video idea + hook
            if (bp.counter_video_idea || bp.counter_hook) {
                const card = document.createElement('div');
                card.className = 'card purple';
                let html = '';
                if (bp.counter_video_idea) {
                    html += `
                        <div style="background:rgba(123,104,238,0.08);border:1px solid rgba(123,104,238,0.2);border-radius:10px;padding:14px;margin-bottom:12px">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--purple);font-weight:700;margin-bottom:6px">&#127916; Karşı Video Fikri</div>
                            <div style="font-size:14px;font-weight:600;color:var(--text)">${sanitizeHTML(bp.counter_video_idea)}</div>
                        </div>`;
                }
                if (bp.counter_hook) {
                    html += `
                        <div style="background:rgba(255,68,68,0.06);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 14px">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--accent);font-weight:700;margin-bottom:6px">&#128165; Hook — Hemen Kullan</div>
                            <div style="font-size:13px;font-weight:500;color:var(--text);font-style:italic">"${sanitizeHTML(bp.counter_hook)}"</div>
                            <button class="action-btn battle-copy-hook" data-copy="${sanitizeHTML(bp.counter_hook)}" style="margin-top:10px">Kopyala</button>
                        </div>`;
                }
                card.innerHTML = `<div class="card-header"><span class="card-title" style="color:var(--purple)">&#127919; Karşı Strateji</span></div><div class="card-body">${html}</div>`;
                card.querySelectorAll('.battle-copy-hook').forEach(btn => {
                    btn.addEventListener('click', () => { copyToClipboard(btn.dataset.copy); showToast('Hook kopyalandı!'); });
                });
                grid.appendChild(card);
            }

            // Counter titles
            if (bp.counter_titles && bp.counter_titles.length > 0) {
                const card = document.createElement('div');
                card.className = 'card col-full purple';
                const titlesHTML = bp.counter_titles.map((t, i) => `
                    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(123,104,238,0.05);border:1px solid rgba(123,104,238,0.12);border-radius:8px;margin-bottom:8px">
                        <span style="background:var(--purple);color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${i + 1}</span>
                        <span style="font-size:13px;color:var(--text);flex:1;font-weight:500">${sanitizeHTML(String(t))}</span>
                        <button class="action-btn battle-copy-title" data-copy="${sanitizeHTML(String(t))}">Kopyala</button>
                    </div>`).join('');
                card.innerHTML = `<div class="card-header"><span class="card-title" style="color:var(--purple)">&#127942; Rakibe Karşı Başlıklar</span></div><div class="card-body">${titlesHTML}</div>`;
                card.querySelectorAll('.battle-copy-title').forEach(btn => {
                    btn.addEventListener('click', () => { copyToClipboard(btn.dataset.copy); showToast('Başlık kopyalandı!'); });
                });
                grid.appendChild(card);
            }
        }

        // Niche + Trend summary in battle context
        if (nb || ts) {
            const card = document.createElement('div');
            card.className = 'card col-full';
            let html = '';
            if (nb && nb.benchmark_context) {
                html += `<div class="dna-row"><div class="dna-lbl">&#128202; Niche Bağlamı</div><div class="dna-val">${sanitizeHTML(nb.benchmark_context)}</div></div>`;
            }
            if (ts && ts.action) {
                html += `<div class="dna-row"><div class="dna-lbl">&#128293; Trend Aksiyonu</div><div class="dna-val" style="color:var(--green);font-weight:600">${sanitizeHTML(ts.action)}</div></div>`;
            }
            if (html) {
                card.innerHTML = `<div class="card-header"><span class="card-title">&#128161; Strateji Özeti</span></div><div class="card-body">${html}</div>`;
                grid.appendChild(card);
            }
        }

        container.appendChild(grid);
    }

    // ==================== CHANNEL PAGE RENDER ====================
    function renderChannelPage(channelData, apiData) {
        const channelNavItem = document.getElementById('channel-nav-item');
        if (channelNavItem) channelNavItem.style.display = 'flex';

        document.getElementById('video-title').textContent = channelData.channelName || 'Kanal Analizi';
        const chanName = document.getElementById('channel-name');
        if (chanName) chanName.textContent = `${(apiData.videoCount || channelData.videoCount || 0)} video analiz edildi`;
        const chanImg = document.getElementById('channel-img');
        if (chanImg && channelData.channelAvatar) {
            chanImg.src = channelData.channelAvatar;
            chanImg.style.display = '';
        }

        activateTab('channel');

        const r = apiData.analysis_results || {};
        renderChannelAnalysis(r, channelData);
    }

    function renderChannelAnalysis(r, channelData) {
        const container = document.getElementById('channel-content');
        if (!container) return;
        container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'grid-2';

        // Channel Health Score
        if (r.channel_health_score) {
            const chs = r.channel_health_score;
            const scoreCard = document.createElement('div');
            scoreCard.className = 'card col-full';
            const scores = [
                { label: 'Genel Puan', val: chs.overall },
                { label: 'Tutarlılık', val: chs.consistency },
                { label: 'Büyüme Potansiyeli', val: chs.growth_potential },
                { label: 'İçerik Çeşitliliği', val: chs.content_diversity }
            ];
            const scoresHTML = scores.map(s => {
                const v = parseInt(s.val) || 0;
                const color = v >= 70 ? 'var(--green)' : v >= 40 ? 'var(--orange)' : 'var(--accent)';
                return `<div class="channel-score-item">
                    <div class="channel-score-num" style="color:${color}" data-target="${v}">0</div>
                    <div class="channel-score-lbl">${s.label}</div>
                </div>`;
            }).join('');
            scoreCard.innerHTML = `
                <div class="card-header"><span class="card-title">&#128250; Kanal Sağlık Skoru</span></div>
                <div class="card-body">
                    <div class="channel-score-grid">${scoresHTML}</div>
                    ${chs.verdict ? `<p class="body-text" style="text-align:center;border-top:1px solid var(--card-border);padding-top:12px">${sanitizeHTML(chs.verdict)}</p>` : ''}
                </div>`;
            grid.appendChild(scoreCard);

            requestAnimationFrame(() => {
                scoreCard.querySelectorAll('.channel-score-num[data-target]').forEach((el, i) => {
                    animateCounter(el, 0, parseInt(el.dataset.target), 1200, i * 150);
                });
            });
        }

        // Channel Strategy (new section)
        if (r.channel_strategy) {
            const cs = r.channel_strategy;

            // DNA
            if (cs.channel_dna) {
                const card = document.createElement('div');
                card.className = 'card col-full';
                card.innerHTML = `
                    <div class="card-header"><span class="card-title gold">&#129516; Kanal DNA</span></div>
                    <div class="card-body">
                        <p style="font-size:14px;color:var(--text);line-height:1.7;padding:4px 0">${sanitizeHTML(cs.channel_dna)}</p>
                        ${cs.channel_formula ? `<div style="margin-top:12px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:8px;padding:12px 16px;font-size:14px;font-weight:700;color:var(--gold)">${sanitizeHTML(cs.channel_formula)}</div>` : ''}
                    </div>`;
                grid.appendChild(card);
            }

            // Growth Plan
            if (cs.growth_plan) {
                const gp = cs.growth_plan;
                const card = document.createElement('div');
                card.className = 'card col-full';
                card.innerHTML = `
                    <div class="card-header"><span class="card-title green">&#128640; Büyüme Planı</span></div>
                    <div class="card-body">
                        <div class="growth-plan-grid">
                            ${gp['7_days'] ? `<div class="growth-plan-item"><div class="growth-plan-label">7 Gün</div><div class="growth-plan-text">${sanitizeHTML(gp['7_days'])}</div></div>` : ''}
                            ${gp['30_days'] ? `<div class="growth-plan-item"><div class="growth-plan-label">30 Gün</div><div class="growth-plan-text">${sanitizeHTML(gp['30_days'])}</div></div>` : ''}
                            ${gp['90_days'] ? `<div class="growth-plan-item"><div class="growth-plan-label">90 Gün</div><div class="growth-plan-text">${sanitizeHTML(gp['90_days'])}</div></div>` : ''}
                        </div>
                    </div>`;
                grid.appendChild(card);
            }

            // Next 5 Videos
            if (cs.next_5_videos && Array.isArray(cs.next_5_videos) && cs.next_5_videos.length > 0) {
                const card = document.createElement('div');
                card.className = 'card col-full';
                const videosHTML = cs.next_5_videos.map(v => {
                    const ctr = parseInt(v.expected_ctr) || 0;
                    return `<div class="next-video-card">
                        <div class="next-video-title">${sanitizeHTML(v.title || '')}</div>
                        ${v.why ? `<div class="next-video-why">${sanitizeHTML(v.why)}</div>` : ''}
                        <div style="display:flex;gap:6px;margin-top:6px">
                            ${ctr > 0 ? `<span class="next-video-ctr">CTR: ${ctr}/100</span>` : ''}
                            ${v.format ? `<span style="font-size:10px;font-weight:700;color:var(--text-muted);background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:100px;text-transform:uppercase">${sanitizeHTML(v.format)}</span>` : ''}
                        </div>
                    </div>`;
                }).join('');
                card.innerHTML = `<div class="card-header"><span class="card-title purple">&#128161; Sonraki 5 Video</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${videosHTML}</div></div>`;
                grid.appendChild(card);
            }

            // Content Gaps
            if (cs.content_gaps && Array.isArray(cs.content_gaps) && cs.content_gaps.length > 0) {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `<div class="card-header"><span class="card-title green">&#128269; İçerik Boşlukları</span></div><div class="card-body"><ul class="item-list">${cs.content_gaps.map(g => `<li>${sanitizeHTML(String(g))}</li>`).join('')}</ul></div>`;
                grid.appendChild(card);
            }

            // Double Down
            if (cs.double_down && Array.isArray(cs.double_down) && cs.double_down.length > 0) {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `<div class="card-header"><span class="card-title orange">&#128293; Üzerine Basılacaklar</span></div><div class="card-body"><ul class="item-list">${cs.double_down.map(d => `<li>${sanitizeHTML(String(d))}</li>`).join('')}</ul></div>`;
                grid.appendChild(card);
            }
        }

        // Performance Patterns
        if (r.performance_patterns) {
            const pp = r.performance_patterns;
            const card = document.createElement('div');
            card.className = 'card';
            let html = '';
            if (pp.viral_formula) html += `<div class="dna-row"><div class="dna-lbl">Viral Formül</div><div class="dna-val dna-formula">${sanitizeHTML(pp.viral_formula)}</div></div>`;
            if (pp.optimal_duration) html += `<div class="dna-row"><div class="dna-lbl">Optimal Süre</div><div class="dna-val">${sanitizeHTML(pp.optimal_duration)}</div></div>`;
            if (pp.best_performing_topics && pp.best_performing_topics.length) html += `<div class="dna-row"><div class="dna-lbl">En İyi Konular</div><div class="dna-tags">${pp.best_performing_topics.map(t => `<span class="dna-tag success">${sanitizeHTML(String(t))}</span>`).join('')}</div></div>`;
            if (pp.title_patterns && pp.title_patterns.length) html += `<div class="dna-row"><div class="dna-lbl">Başlık Kalıpları</div><div class="dna-tags">${pp.title_patterns.map(t => `<span class="dna-tag pattern">${sanitizeHTML(String(t))}</span>`).join('')}</div></div>`;
            card.innerHTML = `<div class="card-header"><span class="card-title">&#128200; Performans Kalıpları</span></div><div class="card-body">${html}</div>`;
            grid.appendChild(card);
        }

        // Content Gaps (old schema)
        if (r.content_gaps && Array.isArray(r.content_gaps)) {
            const card = document.createElement('div');
            card.className = 'card';
            const gapsHTML = r.content_gaps.map(gap => `
                <div style="padding:12px;background:rgba(255,255,255,0.02);border:1px solid var(--card-border);border-radius:8px;margin-bottom:8px">
                    <div style="font-size:13px;font-weight:600;color:var(--green);margin-bottom:4px">${sanitizeHTML(gap.topic || '')}</div>
                    <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">${sanitizeHTML(gap.opportunity || '')}</div>
                    ${gap.estimated_views ? `<span style="font-size:11px;background:rgba(0,200,81,0.1);color:var(--green);padding:2px 8px;border-radius:100px">&#128200; ${sanitizeHTML(gap.estimated_views)}</span>` : ''}
                </div>`).join('');
            card.innerHTML = `<div class="card-header"><span class="card-title green">&#128269; İçerik Boşlukları</span></div><div class="card-body">${gapsHTML}</div>`;
            grid.appendChild(card);
        }

        // Growth Strategy (old schema)
        if (r.growth_strategy) {
            const gs = r.growth_strategy;
            const card = document.createElement('div');
            card.className = 'card col-full';
            let html = '';
            if (gs.short_term && gs.short_term.length) html += `<div class="dna-row"><div class="dna-lbl">Kısa Vade (30 Gün)</div><ul class="item-list">${gs.short_term.map(a => `<li>${sanitizeHTML(String(a))}</li>`).join('')}</ul></div>`;
            if (gs.long_term && gs.long_term.length) html += `<div class="dna-row"><div class="dna-lbl">Uzun Vade (6 Ay)</div><ul class="item-list">${gs.long_term.map(a => `<li>${sanitizeHTML(String(a))}</li>`).join('')}</ul></div>`;
            if (gs.monetization_opportunities && gs.monetization_opportunities.length) html += `<div class="dna-row"><div class="dna-lbl">Para Kazanma Fırsatları</div><div class="dna-tags">${gs.monetization_opportunities.map(m => `<span class="dna-tag success">${sanitizeHTML(String(m))}</span>`).join('')}</div></div>`;
            card.innerHTML = `<div class="card-header"><span class="card-title green">&#128640; Büyüme Stratejisi</span></div><div class="card-body">${html}</div>`;
            grid.appendChild(card);
        }

        // Next Video Ideas (old schema)
        if (r.next_video_ideas && Array.isArray(r.next_video_ideas)) {
            const card = document.createElement('div');
            card.className = 'card col-full';
            const ideasHTML = r.next_video_ideas.map(idea => {
                const ctr = parseInt(idea.estimated_ctr) || 0;
                return `<div class="next-video-card">
                    <div class="next-video-title">${sanitizeHTML(idea.title || '')}</div>
                    ${idea.hook ? `<div class="next-video-hook">"${sanitizeHTML(idea.hook)}"</div>` : ''}
                    ${idea.why ? `<div class="next-video-why">${sanitizeHTML(idea.why)}</div>` : ''}
                    ${ctr > 0 ? `<span class="next-video-ctr">CTR Tahmini: ${ctr}/100</span>` : ''}
                </div>`;
            }).join('');
            card.innerHTML = `<div class="card-header"><span class="card-title purple">&#128161; Sonraki Video Fikirleri</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">${ideasHTML}</div></div>`;
            grid.appendChild(card);
        }

        // Niche Research
        if (r.niche_research) {
            const nr = r.niche_research;

            // Section header
            const nicheHeader = document.createElement('div');
            nicheHeader.className = 'col-full';
            nicheHeader.innerHTML = `<div class="section-divider"><span>&#128300; Niche Araştırması</span></div>`;
            grid.appendChild(nicheHeader);

            // Trending Niches
            if (nr.trending_niches && nr.trending_niches.length > 0) {
                const card = document.createElement('div');
                card.className = 'card col-full';
                const itemsHTML = nr.trending_niches.map(n => {
                    const gp = parseInt(n.growth_potential) || 0;
                    const compColor = n.competition === 'low' ? 'var(--green)' : n.competition === 'high' ? 'var(--accent)' : 'var(--orange)';
                    const compLabel = n.competition === 'low' ? 'Düşük' : n.competition === 'high' ? 'Yüksek' : 'Orta';
                    return `<div class="niche-card">
                        <div class="niche-card-top">
                            <div class="niche-name">${sanitizeHTML(n.niche || '')}</div>
                            <div class="niche-meta">
                                <span class="niche-badge" style="color:${compColor};border-color:${compColor}20;background:${compColor}10">${compLabel} Rekabet</span>
                                <span class="niche-score" style="color:${gp>=70?'var(--green)':gp>=50?'var(--orange)':'var(--accent)'}">${gp}/100</span>
                            </div>
                        </div>
                        <div class="niche-bar"><div class="niche-bar-fill" style="width:${gp}%;background:${gp>=70?'var(--green)':gp>=50?'var(--orange)':'var(--accent)'}"></div></div>
                        <div class="niche-why">${sanitizeHTML(n.why_trending || '')}</div>
                    </div>`;
                }).join('');
                card.innerHTML = `<div class="card-header"><span class="card-title purple">&#128200; Trend Nişler</span></div><div class="card-body"><div class="niche-grid">${itemsHTML}</div></div>`;
                grid.appendChild(card);
            }

            // Low Competition + High Monetization side by side
            const rowDiv = document.createElement('div');
            rowDiv.className = 'col-full';
            rowDiv.style.display = 'grid';
            rowDiv.style.gridTemplateColumns = 'repeat(auto-fill,minmax(300px,1fr))';
            rowDiv.style.gap = '12px';

            if (nr.low_competition_niches && nr.low_competition_niches.length > 0) {
                const card = document.createElement('div');
                card.className = 'card';
                const itemsHTML = nr.low_competition_niches.map(n => `
                    <div class="niche-list-item">
                        <div class="niche-list-name">&#128994; ${sanitizeHTML(n.niche || '')}</div>
                        <div class="niche-list-desc">${sanitizeHTML(n.explanation || '')}</div>
                        <span class="niche-badge" style="color:var(--green);border-color:rgba(0,200,81,0.2);background:rgba(0,200,81,0.08)">${n.potential === 'high' ? 'Yüksek Potansiyel' : 'Orta Potansiyel'}</span>
                    </div>`).join('');
                card.innerHTML = `<div class="card-header"><span class="card-title green">&#128247; Düşük Rekabet Nişler</span></div><div class="card-body">${itemsHTML}</div>`;
                rowDiv.appendChild(card);
            }

            if (nr.high_monetization_niches && nr.high_monetization_niches.length > 0) {
                const card = document.createElement('div');
                card.className = 'card';
                const itemsHTML = nr.high_monetization_niches.map(n => `
                    <div class="niche-list-item">
                        <div class="niche-list-name">&#128176; ${sanitizeHTML(n.niche || '')}</div>
                        <div class="niche-list-desc">${sanitizeHTML(n.target_audience || '')}</div>
                        ${n.estimated_rpm ? `<span class="niche-badge" style="color:var(--gold,#f59e0b);border-color:rgba(245,158,11,0.2);background:rgba(245,158,11,0.08)">RPM ${sanitizeHTML(n.estimated_rpm)}</span>` : ''}
                    </div>`).join('');
                card.innerHTML = `<div class="card-header"><span class="card-title gold">&#128176; Yüksek Gelir Nişleri</span></div><div class="card-body">${itemsHTML}</div>`;
                rowDiv.appendChild(card);
            }

            if (rowDiv.children.length > 0) grid.appendChild(rowDiv);

            // Viral Formats
            if (nr.viral_formats && nr.viral_formats.length > 0) {
                const card = document.createElement('div');
                card.className = 'card';
                const itemsHTML = nr.viral_formats.map((f, i) => `
                    <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--card-border)">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(123,104,238,0.15);color:var(--purple);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
                        <div>
                            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${sanitizeHTML(f.format || '')}</div>
                            <div style="font-size:12px;color:var(--text-dim)">${sanitizeHTML(f.description || '')}</div>
                        </div>
                    </div>`).join('');
                card.innerHTML = `<div class="card-header"><span class="card-title purple">&#127909; Viral Format Şablonları</span></div><div class="card-body" style="padding:0 16px">${itemsHTML}</div>`;
                grid.appendChild(card);
            }

            // Ready-to-Post Ideas
            if (nr.ready_to_post_ideas && nr.ready_to_post_ideas.length > 0) {
                const card = document.createElement('div');
                card.className = 'card col-full';
                const ideasHTML = nr.ready_to_post_ideas.map(idea => `
                    <div class="factory-idea-card">
                        <div class="factory-idea-title">${sanitizeHTML(idea.title || '')}</div>
                        <div class="factory-idea-hook">"${sanitizeHTML(idea.hook || '')}"</div>
                        <div class="factory-idea-why">${sanitizeHTML(idea.why_it_will_perform || '')}</div>
                        ${idea.format ? `<span style="font-size:10px;font-weight:700;color:var(--text-muted);background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:100px;text-transform:uppercase;margin-top:6px;display:inline-block">${sanitizeHTML(idea.format)}</span>` : ''}
                    </div>`).join('');
                card.innerHTML = `<div class="card-header"><span class="card-title accent">&#9889; Hemen Çek: Hazır Video Fikirleri</span></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${ideasHTML}</div></div>`;
                grid.appendChild(card);
            }
        }

        // Video list preview
        if (channelData && channelData.videos && channelData.videos.length > 0) {
            const videoCard = document.createElement('div');
            videoCard.className = 'card col-full';
            const videosHTML = channelData.videos.slice(0, 12).map(v => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--card-border)">
                    <img src="${sanitizeHTML(v.thumbnail || '')}" style="width:80px;height:45px;border-radius:4px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${sanitizeHTML(v.title || '')}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${sanitizeHTML(v.viewCount || '')} ${v.publishDate ? '• ' + sanitizeHTML(v.publishDate) : ''}</div>
                    </div>
                </div>`).join('');
            videoCard.innerHTML = `<div class="card-header"><span class="card-title">&#127909; Analiz Edilen Videolar (${channelData.videos.length})</span></div><div class="card-body" style="padding:0 16px">${videosHTML}</div>`;
            grid.appendChild(videoCard);
        }

        container.appendChild(grid);
    }

    // ==================== FREE USER LOCKED STATE ====================
    function renderLockedState() {
        const lockedTabs = ['tab-clone', 'tab-factory', 'tab-structure', 'tab-seo', 'tab-monetize', 'tab-script', 'tab-battle'];
        lockedTabs.forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (!tab) return;

            const contentDiv = tab.querySelector('div');
            if (contentDiv) {
                const lockContent = document.createElement('div');
                lockContent.className = 'lock-content';
                while (contentDiv.firstChild) lockContent.appendChild(contentDiv.firstChild);
                contentDiv.appendChild(lockContent);
            }

            tab.classList.add('pro-locked');
            const lockBanner = document.createElement('div');
            lockBanner.className = 'lock-banner';
            lockBanner.innerHTML = `
                <div style="font-size:28px;margin-bottom:10px">&#128274;</div>
                <h3>Pro Özellik</h3>
                <p>Bu bölüm Pro üyelere özel. Topluluğumuza katılarak Pro erişim kazan.</p>
                <button class="lock-cta js-upgrade-btn">&#127758; Topluluğa Katıl → Pro Ol</button>`;
            tab.appendChild(lockBanner);
            lockBanner.querySelector('.js-upgrade-btn').addEventListener('click', () => {
                chrome.tabs.create({ url: CONFIG.SKOOL_URL });
            });
        });

        ['export-txt', 'export-json', 'export-pdf', 'share-btn', 'copy-all'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; }
        });
    }

    // ==================== HISTORY ====================
    async function loadHistory() {
        if (historyAbortController) historyAbortController.abort();
        historyAbortController = new AbortController();

        const container = document.getElementById('history-content');
        container.innerHTML = `<div class="history-grid">${Array(6).fill('<div class="skeleton" style="height:90px;border-radius:12px"></div>').join('')}</div>`;

        try {
            const token = await SupabaseAuth.getToken();
            if (!token) {
                container.innerHTML = `<div class="empty-state"><div class="icon">&#128274;</div><h3>Giriş Gerekli</h3><p>Geçmişi görmek için giriş yapın.</p></div>`;
                return;
            }

            const response = await fetch(`${BACKEND_URL}/api/analyses`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: historyAbortController.signal
            });

            if (!response.ok) throw new Error('Bağlantı hatası');
            const data = await response.json();

            if (!data.analyses || data.analyses.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">&#128270;</div><h3>Henüz Analiz Yok</h3><p>YouTube'da bir videoyu analiz etmeye başlayın.</p></div>`;
                return;
            }

            container.innerHTML = '';
            const grid = document.createElement('div');
            grid.className = 'history-grid';

            data.analyses.forEach(item => {
                const card = document.createElement('div');
                card.className = 'history-card';

                const isChannel = item.video_id && item.video_id.startsWith('channel_');
                const icon = isChannel ? '&#128250;' : '&#127909;';
                const date = new Date(item.createdAt || item.created_at).toLocaleDateString(I18N.getLocale(), {
                    day: 'numeric', month: 'short', year: 'numeric'
                });

                card.innerHTML = `
                    <img class="history-thumb" src="${sanitizeHTML(item.thumbnail || '')}" alt="" onerror="this.style.display='none'">
                    <div class="history-info">
                        <h4>${icon} ${sanitizeHTML(item.title || item.channelName || 'Analiz')}</h4>
                        <span>${sanitizeHTML(item.channelName || '-')} — ${date}</span>
                    </div>
                    <button class="history-delete" title="Sil">&#10005;</button>`;

                card.addEventListener('click', e => {
                    if (e.target.classList.contains('history-delete')) return;
                    window.location.href = `index.html?id=${item.id}`;
                });

                card.querySelector('.history-delete').addEventListener('click', async e => {
                    e.stopPropagation();
                    if (!confirm('Silmek istediğinize emin misiniz?')) return;
                    try {
                        await authFetch(`${BACKEND_URL}/api/analysis/${item.id}`, { method: 'DELETE' });
                        card.remove();
                        showToast('Analiz silindi.');
                    } catch (err) {
                        showToast('Silme başarısız.');
                    }
                });

                grid.appendChild(card);
            });

            container.appendChild(grid);

        } catch (error) {
            if (error.name === 'AbortError') return;
            container.innerHTML = `<div class="empty-state"><div class="icon">&#9888;</div><h3>Bağlantı Hatası</h3><p>Sunucuya ulaşılamıyor.</p></div>`;
        }
    }

    // ==================== EXPORT ====================
    document.getElementById('export-txt').addEventListener('click', () => {
        if (!currentAnalysisData || currentAnalysisData.is_limited) return;
        const text = generateTextReport(currentAnalysisData);
        downloadFile(text, `analiz-${currentAnalysisData.video_id || 'rapor'}.txt`, 'text/plain');
        showToast('TXT indirildi.');
    });

    document.getElementById('export-json').addEventListener('click', () => {
        if (!currentAnalysisData || currentAnalysisData.is_limited) return;
        const json = JSON.stringify(currentAnalysisData, null, 2);
        downloadFile(json, `analiz-${currentAnalysisData.video_id || 'rapor'}.json`, 'application/json');
        showToast('JSON indirildi.');
    });

    document.getElementById('export-pdf').addEventListener('click', () => {
        if (!currentAnalysisData || currentAnalysisData.is_limited) return;
        // Show all tab panes temporarily for print
        const panes = document.querySelectorAll('.tab-pane');
        panes.forEach(p => p.style.setProperty('display', 'block', 'important'));
        window.print();
        setTimeout(() => {
            panes.forEach(p => p.style.removeProperty('display'));
        }, 1000);
    });

    // ==================== SHARE ====================
    const shareModal = document.getElementById('share-modal');
    const shareUrlInput = document.getElementById('share-url-input');

    document.getElementById('share-btn').addEventListener('click', async () => {
        if (!currentAnalysisData) return;
        const id = currentAnalysisData.id || '';
        if (!id || id === 'demo') {
            shareUrlInput.value = 'Demo analiz paylaşılamaz';
            shareModal.classList.add('show');
            return;
        }
        try {
            await authFetch(`${BACKEND_URL}/api/analyses/${id}/share`, { method: 'POST' });
        } catch (e) { /* sessizce devam et */ }
        shareUrlInput.value = `${BACKEND_URL}/api/share/${id}`;
        shareModal.classList.add('show');
    });

    document.getElementById('share-modal-close').addEventListener('click', () => {
        shareModal.classList.remove('show');
    });

    shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) shareModal.classList.remove('show');
    });

    document.getElementById('share-copy-link').addEventListener('click', () => {
        const url = shareUrlInput.value;
        if (!url || url.includes('Demo')) return;
        copyToClipboard(url);
        showToast('Link kopyalandı!');
        shareModal.classList.remove('show');
    });

    document.getElementById('share-copy-text').addEventListener('click', () => {
        if (!currentAnalysisData) return;
        const text = generateMarkdownReport(currentAnalysisData);
        copyToClipboard(text);
        showToast('Markdown kopyalandı!');
        shareModal.classList.remove('show');
    });

    document.getElementById('share-download-md').addEventListener('click', () => {
        if (!currentAnalysisData) return;
        const md = generateMarkdownReport(currentAnalysisData);
        const title = (currentAnalysisData.video_metadata?.title || 'analiz').substring(0, 40).replace(/[^a-zA-Z0-9]/g, '-');
        downloadFile(md, `${title}.md`, 'text/markdown');
        showToast('Markdown indirildi!');
        shareModal.classList.remove('show');
    });

    document.getElementById('copy-all').addEventListener('click', () => {
        if (!currentAnalysisData || currentAnalysisData.is_limited) return;
        const text = generateTextReport(currentAnalysisData);
        copyToClipboard(text);
        showToast('Rapor kopyalandı.');
    });

    // ==================== SCRIPT GENERATOR TAB ====================
    function renderTabScript(data) {
        const container = document.getElementById('script-content');
        if (!container) return;

        const analysisId = data.id;
        const isDemo = data.is_demo === true || analysisId === 'demo';

        container.innerHTML = `
            <div style="max-width:800px">
                <div class="card purple" style="margin-bottom:20px">
                    <div class="card-header">
                        <span class="card-title purple">&#9999; AI Script Generator</span>
                    </div>
                    <div class="card-body">
                        <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">
                            Bu videodaki analiz verilerini kullanarak word-for-word bir senaryo oluştur. Claude AI ile yazılır, 8-12 dakikalık video için.
                        </p>
                        <div class="script-toolbar">
                            <select class="script-lang-select" id="script-lang">
                                <option value="tr">🇹🇷 Türkçe</option>
                                <option value="en">🇺🇸 English</option>
                                <option value="es">🇪🇸 Español</option>
                                <option value="de">🇩🇪 Deutsch</option>
                                <option value="no">🇳🇴 Norsk</option>
                            </select>
                        </div>
                        <button class="script-generate-btn" id="generate-script-btn" ${isDemo ? 'disabled title="Demo modda script üretilemez"' : ''}>
                            <span id="script-btn-icon">&#9889;</span>
                            <span id="script-btn-text">${isDemo ? 'Demo — Giriş yaparak script üret' : 'Senaryo Üret (AI)'}</span>
                        </button>
                    </div>
                </div>
                <div id="script-result" style="display:none">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                        <span style="font-size:13px;font-weight:600;color:var(--purple)">&#9989; Senaryo Hazır</span>
                        <div style="display:flex;gap:8px">
                            <button class="action-btn" id="script-copy-btn">Kopyala</button>
                            <button class="action-btn" id="script-download-btn">&#8595; İndir</button>
                        </div>
                    </div>
                    <div class="script-output" id="script-output"></div>
                </div>
            </div>`;

        if (isDemo) return;

        const generateBtn = document.getElementById('generate-script-btn');
        const scriptResult = document.getElementById('script-result');
        const scriptOutput = document.getElementById('script-output');

        generateBtn.addEventListener('click', async () => {
            const lang = document.getElementById('script-lang').value;
            generateBtn.disabled = true;
            document.getElementById('script-btn-icon').textContent = '⏳';
            document.getElementById('script-btn-text').textContent = 'Senaryo yazılıyor... (30-60 sn)';
            scriptResult.style.display = 'none';

            try {
                const res = await fetchWithTimeout(
                    authFetch(`${BACKEND_URL}/api/generate-script`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ analysisId, language: lang })
                    }),
                    180000
                );
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Senaryo oluşturulamadı');
                }
                const { script } = await res.json();
                // Highlight section headers
                const formatted = sanitizeHTML(script).replace(
                    /=== (.+?) ===/g,
                    '<span class="script-section-header">=== $1 ===</span>'
                );
                scriptOutput.innerHTML = formatted;
                scriptResult.style.display = 'block';
                showToast('Senaryo hazır!');

                const copyBtn = document.getElementById('script-copy-btn');
                const dlBtn = document.getElementById('script-download-btn');
                const newCopyBtn = copyBtn.cloneNode(true);
                const newDlBtn = dlBtn.cloneNode(true);
                copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
                dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);

                newCopyBtn.addEventListener('click', () => {
                    copyToClipboard(script);
                    showToast('Senaryo kopyalandı!');
                });
                newDlBtn.addEventListener('click', () => {
                    const title = (data.video_metadata?.title || 'senaryo').substring(0, 40).replace(/[^a-zA-Z0-9]/g, '-');
                    downloadFile(script, `${title}-senaryo.txt`, 'text/plain');
                    showToast('Senaryo indirildi!');
                });
            } catch (err) {
                showToast('Hata: ' + err.message);
                document.getElementById('script-btn-icon').textContent = '⚠️';
                document.getElementById('script-btn-text').textContent = 'Tekrar Dene';
                generateBtn.disabled = false;
                return;
            }

            document.getElementById('script-btn-icon').textContent = '✅';
            document.getElementById('script-btn-text').textContent = 'Yeniden Üret';
            generateBtn.disabled = false;
        });
    }

    // Paywall upgrade button
    const paywallUpgradeBtn = document.getElementById('paywall-upgrade-btn');
    if (paywallUpgradeBtn) {
        paywallUpgradeBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: CONFIG.SKOOL_URL });
        });
    }

    // ==================== UTILITIES ====================
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

    function generateMarkdownReport(data) {
        const meta = data.video_metadata || {};
        const r = data.analysis_results || {};
        const vs = r.viral_score || {};
        const hook = r.hook_analysis || {};
        const clone = r.clone_this_video || {};
        const seo = r.title_thumbnail || {};

        let md = `# 🎬 ${meta.title || 'YouTube Video Analizi'}\n\n`;
        md += `**Kanal:** ${meta.channelName || '-'} | **Görüntülenme:** ${meta.viewCount || '-'} | **Tarih:** ${new Date().toLocaleDateString('tr-TR')}\n\n`;
        md += `> *Dion YouTube Analyzer tarafından oluşturulmuştur*\n\n---\n\n`;

        if (vs.score) {
            md += `## 📊 Skorlar\n`;
            md += `| Viral Skor | CTR Potansiyeli | Retention | Büyüme |\n`;
            md += `|-----------|----------------|-----------|--------|\n`;
            md += `| ${vs.score}/100 | ${vs.ctr_potential || '-'}/100 | ${vs.retention_potential || '-'}/100 | ${vs.growth_potential || '-'}/100 |\n\n`;
            if (vs.why) md += `> ${vs.why}\n\n`;
        }

        if (hook.why_it_works) {
            md += `## 🎣 Hook Analizi\n`;
            md += `**Tip:** ${hook.type || '-'}\n\n`;
            md += `**Neden Çalışıyor:** ${hook.why_it_works}\n\n`;
            if (hook.first_10_seconds) md += `**İlk 10 Saniye:** ${hook.first_10_seconds}\n\n`;
        }

        if (clone.full_hook || clone.script_outline) {
            md += `## 🎬 Clone This Video\n`;
            if (clone.new_video_idea) md += `**Fikir:** ${clone.new_video_idea}\n\n`;
            if (clone.full_hook) md += `**Hook:**\n\`\`\`\n${clone.full_hook}\n\`\`\`\n\n`;
            if (clone.script_outline) md += `**Senaryo Taslağı:**\n\`\`\`\n${clone.script_outline}\n\`\`\`\n\n`;
        }

        if (seo.improved_titles && seo.improved_titles.length) {
            md += `## 🎯 Önerilen Başlıklar\n`;
            seo.improved_titles.forEach(t => {
                md += `- **[${t.ctr_score || '-'}]** ${t.title || ''}\n`;
            });
            md += '\n';
        }

        if (clone.seo_tags && clone.seo_tags.length) {
            md += `## 🏷️ SEO Etiketleri\n`;
            md += clone.seo_tags.map(t => `\`${t}\``).join(' ') + '\n\n';
        }

        md += `---\n*Analiz: ${new Date().toLocaleString('tr-TR')} — Dion YouTube Analyzer*\n`;
        return md;
    }

    function generateTextReport(data) {
        const meta = data.video_metadata || {};
        const r = data.analysis_results || {};
        let report = '=== DION YOUTUBE ANALYZER ===\n\n';
        report += `Video: ${meta.title || '-'}\n`;
        report += `Kanal: ${meta.channelName || '-'}\n`;
        report += `URL: ${meta.url || '-'}\n`;
        report += `Tarih: ${new Date().toLocaleDateString()}\n`;
        report += `${'='.repeat(50)}\n\n`;
        Object.entries(r).forEach(([key, value]) => {
            if (key.startsWith('_')) return;
            report += `--- ${key.replace(/_/g, ' ').toUpperCase()} ---\n`;
            report += extractTextValue(value) + '\n\n';
        });
        return report;
    }

    function extractTextValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        if (Array.isArray(value)) return value.map(v => '• ' + extractTextValue(v)).join('\n');
        if (typeof value === 'object') {
            return Object.entries(value).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${extractTextValue(v)}`).join('\n');
        }
        return String(value);
    }

    // ==================== EVENT DELEGATION (CSP-safe copy) ====================
    // Replaces all inline onclick="navigator.clipboard..." handlers
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-copy]');
        if (!el) return;
        try {
            const text = decodeURIComponent(el.dataset.copy || '');
            if (!text) return;
            copyToClipboard(text);
            showToast('Kopyalandı');
        } catch (err) { /* ignore decode error */ }
    });

    function copyToClipboard(text) {
        navigator.clipboard.writeText(String(text || '')).catch(() => {
            // navigator.clipboard unavailable (non-secure context) — silent fail
        });
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }
});
