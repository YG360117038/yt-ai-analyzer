/**
 * Lightweight i18n system for YT AI Analyzer
 * Supports Turkish (tr) and English (en)
 * Auto-detects browser language, falls back to English
 */

const I18N = (() => {
    let currentLang = 'en';

    const translations = {
        // ==================== POPUP ====================
        'login_with_google': { tr: 'Google ile Giris Yap', en: 'Sign in with Google' },
        'logout': { tr: 'Cikis', en: 'Logout' },
        'not_youtube_warning': { tr: 'Bir YouTube video sayfasina gidin ve tekrar deneyin.', en: 'Go to a YouTube video page and try again.' },
        'login_warning': { tr: 'Analiz yapmak icin giris yapin.', en: 'Sign in to analyze videos.' },
        'video_title_placeholder': { tr: 'Video Basligi', en: 'Video Title' },
        'channel_name_placeholder': { tr: 'Kanal Adi', en: 'Channel Name' },
        'status': { tr: 'Durum', en: 'Status' },
        'ready': { tr: 'Hazir', en: 'Ready' },
        'subscription': { tr: 'Abonelik', en: 'Subscription' },
        'remaining': { tr: 'kalan', en: 'left' },
        'remaining_rights': { tr: 'Kalan hak', en: 'Remaining' },
        'used': { tr: 'Kullanilan', en: 'Used' },
        'pro_full_access': { tr: 'Tam Analiz Erisimi', en: 'Full Analysis Access' },
        'pro_see_all': { tr: 'Tum sonuclari gorun', en: 'See all results' },
        'analyze_video': { tr: 'Videoyu Analiz Et', en: 'Analyze Video' },
        'analysis_history': { tr: 'Gecmis Analizler', en: 'Analysis History' },
        'popup_footer': { tr: 'YouTube sayfasinda sag tikla > "Analyze Video with AI"', en: 'Right-click on YouTube > "Analyze Video with AI"' },
        'free': { tr: 'Ucretsiz', en: 'Free' },
        'pro_plan': { tr: 'Pro Plan', en: 'Pro Plan' },
        'analyzing': { tr: 'Analiz ediliyor...', en: 'Analyzing...' },
        'unlimited': { tr: 'Sinirsiz', en: 'Unlimited' },
        'score_only': { tr: 'Sadece skor gorunur', en: 'Score only visible' },
        'pro_full_access_short': { tr: 'Pro ile tam erisim', en: 'Full access with Pro' },
        'logged_in': { tr: 'Giris yapildi', en: 'Logged in' },
        'logging_in': { tr: 'Giris yapiliyor...', en: 'Signing in...' },
        'login_failed': { tr: 'Giris yapilamadi', en: 'Login failed' },
        'login_cancelled': { tr: 'Giris iptal edildi', en: 'Login cancelled' },

        // ==================== DASHBOARD SIDEBAR ====================
        'nav_analysis': { tr: 'Analiz', en: 'Analysis' },
        'nav_other': { tr: 'Diger', en: 'Other' },
        'deep_analysis': { tr: 'Derin Analiz', en: 'Deep Analysis' },
        'prompt_toolkit': { tr: 'Prompt Toolkit', en: 'Prompt Toolkit' },
        'notebook_mode': { tr: 'Notebook Modu', en: 'Notebook Mode' },
        'scripts_titles': { tr: 'Script & Basliklar', en: 'Scripts & Titles' },
        'character_transform': { tr: 'Karakter Donusumu', en: 'Character Transform' },
        'video_production': { tr: 'Video Uretim Merkezi', en: 'Video Production' },
        'history': { tr: 'Gecmis Analizler', en: 'Analysis History' },
        'admin_panel': { tr: 'Admin Panel', en: 'Admin Panel' },

        // ==================== DASHBOARD HEADER ====================
        'loading': { tr: 'Yukleniyor...', en: 'Loading...' },
        'export_txt': { tr: 'TXT Indir', en: 'Download TXT' },
        'export_json': { tr: 'JSON Indir', en: 'Download JSON' },
        'copy_all': { tr: 'Tumunu Kopyala', en: 'Copy All' },
        'video_flow_chart': { tr: 'Video Akis Semasi', en: 'Video Flow Chart' },

        // ==================== LOADING SCREEN ====================
        'preparing_data': { tr: 'Video Verileri Hazirlaniyor...', en: 'Preparing Video Data...' },
        'ai_analyzing': { tr: 'AI Analizi Yapiliyor...', en: 'AI Analysis in Progress...' },
        'video_content_analyzing': { tr: 'Video icerik analizi devam ediyor...', en: 'Video content analysis continues...' },
        'detailed_analysis_completing': { tr: 'Detayli analiz tamamlaniyor...', en: 'Completing detailed analysis...' },
        'processing_results': { tr: 'Sonuclar Isleniyor...', en: 'Processing Results...' },
        'preparing_report': { tr: 'Rapor Hazirlaniyor...', en: 'Preparing Report...' },

        // ==================== ERRORS ====================
        'error_no_video_data': { tr: 'Video verisi bulunamadi.', en: 'Video data not found.' },
        'error_no_video_data_desc': { tr: 'Lutfen YouTube video sayfasindan tekrar baslatin.', en: 'Please start again from a YouTube video page.' },
        'error_timeout': { tr: 'Analiz cok uzun surdu.', en: 'Analysis took too long.' },
        'error_timeout_desc': { tr: 'AI modeli yanitlamiyor. Lutfen daha sonra tekrar deneyin.', en: 'AI model is not responding. Please try again later.' },
        'error_auth': { tr: 'Oturum suresi dolmus.', en: 'Session expired.' },
        'error_auth_desc': { tr: 'Lutfen uzanti popup\'indan tekrar giris yapin.', en: 'Please sign in again from the extension popup.' },
        'error_rate_limit': { tr: 'Cok fazla istek.', en: 'Too many requests.' },
        'error_rate_limit_desc': { tr: 'Lutfen 1 dakika bekleyip tekrar deneyin.', en: 'Please wait 1 minute and try again.' },
        'error_connection': { tr: 'Baglanti hatasi.', en: 'Connection error.' },
        'error_connection_desc': { tr: 'Sunucuya ulasilamiyor. Internet baglantinizi kontrol edin.', en: 'Cannot reach server. Check your internet connection.' },
        'error_analysis': { tr: 'Analiz hatasi', en: 'Analysis error' },
        'error_login_required': { tr: 'Giris gerekli.', en: 'Login required.' },
        'error_login_required_desc': { tr: 'Lutfen uzanti popup\'indan Google ile giris yapin.', en: 'Please sign in with Google from the extension popup.' },

        // ==================== SCORE BANNER ====================
        'overall_score': { tr: 'Genel Puan', en: 'Overall Score' },
        'seo_score': { tr: 'SEO Puani', en: 'SEO Score' },
        'engagement_score': { tr: 'Etkilesim', en: 'Engagement' },
        'viral_potential': { tr: 'Viral Potansiyel', en: 'Viral Potential' },
        'content_quality': { tr: 'Icerik Kalitesi', en: 'Content Quality' },

        // ==================== ANALYSIS TYPE BADGE ====================
        'analysis_type_video': { tr: 'Video Analizi', en: 'Video Analysis' },
        'analysis_type_transcript': { tr: 'Transcript Analizi', en: 'Transcript Analysis' },
        'analysis_type_metadata': { tr: 'Metadata Analizi', en: 'Metadata Analysis' },

        // ==================== PRO LOCK ====================
        'pro_required': { tr: 'Pro Erisim Gerekli', en: 'Pro Access Required' },
        'pro_locked_desc': { tr: 'Bu bolumu goruntulemek icin Pro plana gecin. Tum analiz sonuclarina, prompt\'lara ve video uretim aracina erisim saglayin.', en: 'Upgrade to Pro to view this section. Get access to all analysis results, prompts, and video production tools.' },
        'upgrade_to_pro': { tr: 'Pro Plana Gec', en: 'Upgrade to Pro' },
        'upgrade_message': { tr: 'Tam analiz icin Pro plana gecin.', en: 'Upgrade to Pro for full analysis.' },

        // ==================== HISTORY ====================
        'no_analysis_yet': { tr: 'Henuz analiz yapilmamis.', en: 'No analyses yet.' },
        'start_first_analysis': { tr: 'YouTube\'da bir video analiz ederek baslayabilirsiniz.', en: 'Start by analyzing a video on YouTube.' },
        'login_to_see_history': { tr: 'Gecmis analizleri gormek icin giris yapin.', en: 'Sign in to see your analysis history.' },
        'delete_confirm': { tr: 'Bu analizi silmek istediginize emin misiniz?', en: 'Are you sure you want to delete this analysis?' },
        'load_more': { tr: 'Daha Fazla Yukle', en: 'Load More' },

        // ==================== CARD TOGGLE ====================
        'show_more': { tr: 'Devamini gor', en: 'Show more' },
        'show_less': { tr: 'Daralt', en: 'Show less' },
        'ai_studio': { tr: 'AI Studio', en: 'AI Studio' },
        'ai_studio_title': { tr: 'AI Studio', en: 'AI Studio' },
        'ai_studio_desc': { tr: 'Bu videoyu yeniden olusturmak icin platform bazli hazir promptlar', en: 'Ready-to-use prompts by platform to recreate this video' },
        'ai_filter_all': { tr: 'Tumunu Goster', en: 'Show All' },
        'ai_cat_video': { tr: 'Video Olusturma', en: 'Video Generation' },
        'ai_cat_image': { tr: 'Gorsel Olusturma', en: 'Image Generation' },
        'ai_cat_content': { tr: 'Icerik Donusumu', en: 'Content Repurpose' },
        'ai_cat_text': { tr: 'Metin / Sohbet', en: 'Text / Chat' },
        'ai_cat_scene': { tr: 'Sahne Promptlari', en: 'Scene Prompts' },
        'ai_cat_short': { tr: 'Kisa Video', en: 'Short Video' },
        'ai_cat_mega': { tr: 'Tam Yeniden Olusturma', en: 'Full Recreation' },
        'copy_prompt': { tr: 'Promptu Kopyala', en: 'Copy Prompt' },
        'no_prompts': { tr: 'Prompt bulunamadi', en: 'No prompts found' },
        'no_prompts_desc': { tr: 'Analiz tamamlandiginda AI promptlari burada gorunecek', en: 'AI prompts will appear here when analysis is complete' },

        // ==================== COPY/EXPORT ====================
        'copied': { tr: 'Kopyalandi!', en: 'Copied!' },
        'copy': { tr: 'Kopyala', en: 'Copy' },
        'report_title': { tr: '=== YT AI ANALYZER RAPORU ===', en: '=== YT AI ANALYZER REPORT ===' },
        'video_label': { tr: 'Video', en: 'Video' },
        'channel_label': { tr: 'Kanal', en: 'Channel' },
        'date_label': { tr: 'Tarih', en: 'Date' },

        // ==================== NOTEBOOK ====================
        'estimated_interest': { tr: 'Tahmini Ilgi', en: 'Estimated Interest' },
        'study_notes': { tr: 'Calisma Notlari', en: 'Study Notes' },
        'quick_recap': { tr: 'Hizli Ozet', en: 'Quick Recap' },
        'timeline': { tr: 'Zaman Cizelgesi', en: 'Timeline' },

        // ==================== VIDEO PRODUCTION ====================
        'scene': { tr: 'Sahne', en: 'Scene' },
        'voiceover': { tr: 'Seslendirme', en: 'Voiceover' },
        'full_voiceover_script': { tr: 'Tam Seslendirme Metni', en: 'Full Voiceover Script' },
        'music_recommendations': { tr: 'Muzik Onerileri', en: 'Music Recommendations' },
        'platform_prompts': { tr: 'Platform Prompt\'lari', en: 'Platform Prompts' },
        'copy_prompt': { tr: 'Kopyala', en: 'Copy' },
        'copy_scene': { tr: 'Sahneyi Kopyala', en: 'Copy Scene' },

        // ==================== MEGA PROMPT ====================
        'mega_prompt_info': { tr: 'Bu promptu dogrudan bir AI aracina (ChatGPT, Claude vs.) yapistirarak bu videonun tarzinda yeni bir video olusturabilirsiniz.', en: 'Paste this prompt directly into an AI tool (ChatGPT, Claude, etc.) to create a new video in this style.' },
        'click_to_copy': { tr: 'Kopyalamak icin tikla', en: 'Click to copy' },

        // ==================== DASHBOARD DYNAMIC ====================
        'video_analysis_title': { tr: 'Video Analizi', en: 'Video Analysis' },
        'unknown': { tr: 'Bilinmeyen', en: 'Unknown' },
        'pro_content': { tr: 'Pro Icerik', en: 'Pro Content' },
        'pro_plan_required': { tr: 'Pro plan gerekli', en: 'Pro plan required' },
        'retry': { tr: 'Tekrar Dene', en: 'Retry' },
        'style_guide': { tr: 'Video Stil Rehberi', en: 'Video Style Guide' },
        'copy_voiceover': { tr: 'Tam Seslendirme Metnini Kopyala', en: 'Copy Full Voiceover Script' },
        'copy_all_prompts': { tr: 'Tum AI Promptlarini Kopyala', en: 'Copy All AI Prompts' },
        'download_video_package': { tr: 'Video Paketi Indir (JSON)', en: 'Download Video Package (JSON)' },
        'copy_as_markdown': { tr: 'Markdown Olarak Kopyala', en: 'Copy as Markdown' },
        'copy_all_scene_prompts': { tr: 'Tum Sahne Promptlarini Kopyala', en: 'Copy All Scene Prompts' },
        'scene_prompts_header': { tr: '=== SAHNE PROMPTLARI ===', en: '=== SCENE PROMPTS ===' },
        'platform_prompts_header': { tr: '=== PLATFORM PROMPTLARI ===', en: '=== PLATFORM PROMPTS ===' },
        'md_video_production': { tr: '# Video Uretim Paketi', en: '# Video Production Package' },
        'md_style_guide': { tr: '## Stil Rehberi', en: '## Style Guide' },
        'md_visual_style': { tr: 'Gorsel Stil', en: 'Visual Style' },
        'md_color_palette': { tr: 'Renk Paleti', en: 'Color Palette' },
        'md_music': { tr: 'Muzik', en: 'Music' },
        'md_transitions': { tr: 'Gecisler', en: 'Transitions' },
        'md_aspect_ratio': { tr: 'En-Boy Orani', en: 'Aspect Ratio' },
        'md_storyboard': { tr: '## Storyboard', en: '## Storyboard' },
        'md_scene': { tr: 'Sahne', en: 'Scene' },
        'md_description': { tr: 'Aciklama', en: 'Description' },
        'md_camera': { tr: 'Kamera', en: 'Camera' },
        'md_sound': { tr: 'Ses', en: 'Sound' },
        'md_voiceover': { tr: 'Seslendirme', en: 'Voiceover' },
        'md_full_voiceover': { tr: '## Tam Seslendirme Metni', en: '## Full Voiceover Script' },
        'md_platform_prompts': { tr: '## Platform Promptlari', en: '## Platform Prompts' },
        'camera_label': { tr: 'Kamera', en: 'Camera' },
        'sound_label': { tr: 'Ses/Muzik', en: 'Sound/Music' },
        'screen_text_label': { tr: 'Ekran Metni', en: 'Screen Text' },
        'login_required_short': { tr: 'Giris gerekli', en: 'Login required' },
        'login_to_see_history_short': { tr: 'Gecmis analizlerinizi gormek icin giris yapin.', en: 'Sign in to see your analysis history.' },
        'no_analysis_yet_short': { tr: 'Henuz analiz yok', en: 'No analyses yet' },
        'start_analysis_hint': { tr: 'Bir YouTube videosuna gidin ve analiz baslatin.', en: 'Go to a YouTube video and start an analysis.' },
        'delete': { tr: 'Sil', en: 'Delete' },
        'analysis_deleted': { tr: 'Analiz silindi.', en: 'Analysis deleted.' },
        'delete_error': { tr: 'Silme hatasi.', en: 'Delete error.' },
        'connection_error_title': { tr: 'Baglanti Hatasi', en: 'Connection Error' },
        'connection_error_desc': { tr: 'Sunucu baglantisi kurulamadi. Lutfen tekrar deneyin.', en: 'Could not connect to server. Please try again.' },
        'txt_downloaded': { tr: 'TXT dosyasi indirildi!', en: 'TXT file downloaded!' },
        'json_downloaded': { tr: 'JSON dosyasi indirildi!', en: 'JSON file downloaded!' },
        'report_copied': { tr: 'Tum rapor panoya kopyalandi!', en: 'Full report copied to clipboard!' },
        'payment_loading': { tr: 'Yukleniyor...', en: 'Loading...' },
        'payment_error': { tr: 'Odeme olusturulamadi.', en: 'Payment could not be created.' },
        'payment_create_error': { tr: 'Odeme olusturulurken hata olustu.', en: 'Error creating payment.' },
        'upgrade_to_pro_short': { tr: "Pro'ya Yukselt", en: 'Upgrade to Pro' },
    };

    // ==================== FIELD LABELS ====================
    const fieldLabels = {
        tr: {
            'video_score': 'Video Puani', 'content_style_breakdown': 'Icerik Stili Analizi',
            'psychological_triggers': 'Psikolojik Tetikleyiciler', 'hook_structure': 'Giris (Hook) Yapisi',
            'retention_strategy': 'Izleyici Tutma Stratejisi', 'thumbnail_psychology': 'Kucuk Resim Psikolojisi',
            'target_audience': 'Hedef Kitle', 'tone_analysis': 'Ton Analizi',
            'script_reverse_engineering': 'Senaryo Yapisi', 'cta_strategy': 'CTA Stratejisi',
            'competitor_analysis': 'Rakip Analizi', 'comment_sentiment': 'Yorum Duygu Analizi',
            'video_flow_mermaid': 'Video Akis Semasi', 'deep_digest_summary': 'Derin Ozet & Aksiyon Plani',
            'notebook_podcast_script': 'Podcast Senaryosu', 'audience_retention_heatmap': 'Izleyici Ilgi Isi Haritasi',
            'similar_video_prompts': 'Benzer Video Promptlari', 'viral_hook_prompts': 'Viral Giris Promptlari',
            'title_variations': 'Baslik Varyasyonlari', 'seo_descriptions': 'SEO Aciklamalari',
            'high_ctr_titles': 'Yuksek CTR Basliklar', 'thumbnail_text_ideas': 'Thumbnail Metin Fikirleri',
            'seo_tags': 'SEO Tag Onerileri', 'full_script_template': 'Tam Senaryo Sablonu',
            'hook_variations': 'Giris Varyasyonlari', 'storytelling_framework': 'Hikaye Anlatim Cercevesi',
            'aggressive_sales': 'Agresif Satis Tonu', 'calm_educational': 'Egitici & Sakin Ton',
            'documentary': 'Belgesel Tarzi', 'motivational': 'Motivasyonel Anlatim',
            'controversial': 'Tartismali Yaklasim', 'ai_prompts_toolkit': 'AI Prompt Araclari',
            'chatgpt_prompts': 'ChatGPT Promptlari', 'midjourney_prompts': 'Midjourney Promptlari',
            'blog_post_prompt': 'Blog Yazisi Promptu', 'twitter_thread_prompt': 'Twitter Thread Promptu',
            'linkedin_post_prompt': 'LinkedIn Paylasim Promptu', 'tiktok_script_prompt': 'TikTok/Reels Promptu',
            'email_newsletter_prompt': 'Email Bulten Promptu', 'content_repurpose_ideas': 'Icerik Donusturme Fikirleri',
            'monetization_ideas': 'Para Kazanma Fikirleri',
            'overall_score': 'Genel Puan', 'seo_score': 'SEO Puani',
            'engagement_score': 'Etkilesim Puani', 'viral_potential': 'Viral Potansiyel',
            'content_quality': 'Icerik Kalitesi', 'demographics': 'Demografik',
            'psychographics': 'Psikografik', 'viewer_intent': 'Izleyici Niyeti',
            'niche_positioning': 'Nis Konumlandirma', 'differentiation': 'Farklilasma',
            'market_gap': 'Pazar Boslugu', 'overall_mood': 'Genel Duygu',
            'top_themes': 'One Cikan Temalar', 'audience_questions': 'Izleyici Sorulari',
            'content_ideas_from_comments': 'Yorumlardan Fikirler',
            'key_takeaways': 'Onemli Dersler', 'action_plan': 'Aksiyon Plani',
            'one_sentence_summary': 'Tek Cumle Ozet', 'type': 'Tip',
            'analysis': 'Analiz', 'first_5_seconds': 'Ilk 5 Saniye',
            'improvement_tips': 'Iyilestirme Onerileri', 'structure': 'Yapi',
            'hero': 'Ana Karakter', 'conflict': 'Problem/Catisma',
            'resolution': 'Cozum', 'template': 'Sablon', 'verdict': 'Degerlendirme',
            'video_production': 'Video Production', 'ai_video_prompts': 'AI Video Prompt\'lari',
            'runway_prompts': 'Runway ML Prompt\'lari', 'luma_prompts': 'Luma AI Prompt\'lari',
            'kling_prompts': 'Kling AI Prompt\'lari', 'sora_prompts': 'OpenAI Sora Prompt\'lari',
            'pika_prompts': 'Pika Labs Prompt\'lari', 'shorts_reels_prompts': 'Shorts/Reels/TikTok Prompt\'lari',
            'thumbnail_dalle_prompts': 'Thumbnail AI Prompt\'lari', 'b_roll_suggestions': 'B-Roll Onerileri',
            'storyboard': 'Storyboard', 'overall_style': 'Gorsel Stil',
            'color_palette': 'Renk Paleti', 'music_mood': 'Muzik Tarzi',
            'transition_style': 'Gecis Efekti', 'aspect_ratio_recommendation': 'En-Boy Orani',
            'content_briefing': 'Icerik Ozeti', 'faq': 'Sik Sorulan Sorular',
            'key_concepts': 'Anahtar Kavramlar', 'content_dna': 'Icerik DNA\'si',
            'recreation_mega_prompt': 'Video Yeniden Uretim Promptu',
            'format_formula': 'Format Formulu', 'unique_elements': 'Benzersiz Elemanlar',
            'replicable_patterns': 'Tekrar Kullanilabilir Kaliplar',
            'success_factors': 'Basari Faktorleri', 'content_pillars': 'Icerik Sutunlari',
            'emotional_arc': 'Duygusal Yolculuk', 'study_notes': 'Calisma Notlari',
            'quick_recap': 'Hizli Ozet', 'timeline': 'Zaman Cizelgesi'
        },
        en: {
            'video_score': 'Video Score', 'content_style_breakdown': 'Content Style Analysis',
            'psychological_triggers': 'Psychological Triggers', 'hook_structure': 'Hook Structure',
            'retention_strategy': 'Retention Strategy', 'thumbnail_psychology': 'Thumbnail Psychology',
            'target_audience': 'Target Audience', 'tone_analysis': 'Tone Analysis',
            'script_reverse_engineering': 'Script Structure', 'cta_strategy': 'CTA Strategy',
            'competitor_analysis': 'Competitor Analysis', 'comment_sentiment': 'Comment Sentiment',
            'video_flow_mermaid': 'Video Flow Chart', 'deep_digest_summary': 'Deep Digest & Action Plan',
            'notebook_podcast_script': 'Podcast Script', 'audience_retention_heatmap': 'Audience Retention Heatmap',
            'similar_video_prompts': 'Similar Video Prompts', 'viral_hook_prompts': 'Viral Hook Prompts',
            'title_variations': 'Title Variations', 'seo_descriptions': 'SEO Descriptions',
            'high_ctr_titles': 'High CTR Titles', 'thumbnail_text_ideas': 'Thumbnail Text Ideas',
            'seo_tags': 'SEO Tag Suggestions', 'full_script_template': 'Full Script Template',
            'hook_variations': 'Hook Variations', 'storytelling_framework': 'Storytelling Framework',
            'aggressive_sales': 'Aggressive Sales Tone', 'calm_educational': 'Calm & Educational',
            'documentary': 'Documentary Style', 'motivational': 'Motivational Style',
            'controversial': 'Controversial Approach', 'ai_prompts_toolkit': 'AI Prompt Tools',
            'chatgpt_prompts': 'ChatGPT Prompts', 'midjourney_prompts': 'Midjourney Prompts',
            'blog_post_prompt': 'Blog Post Prompt', 'twitter_thread_prompt': 'Twitter Thread Prompt',
            'linkedin_post_prompt': 'LinkedIn Post Prompt', 'tiktok_script_prompt': 'TikTok/Reels Prompt',
            'email_newsletter_prompt': 'Email Newsletter Prompt', 'content_repurpose_ideas': 'Content Repurpose Ideas',
            'monetization_ideas': 'Monetization Ideas',
            'overall_score': 'Overall Score', 'seo_score': 'SEO Score',
            'engagement_score': 'Engagement Score', 'viral_potential': 'Viral Potential',
            'content_quality': 'Content Quality', 'demographics': 'Demographics',
            'psychographics': 'Psychographics', 'viewer_intent': 'Viewer Intent',
            'niche_positioning': 'Niche Positioning', 'differentiation': 'Differentiation',
            'market_gap': 'Market Gap', 'overall_mood': 'Overall Mood',
            'top_themes': 'Top Themes', 'audience_questions': 'Audience Questions',
            'content_ideas_from_comments': 'Ideas from Comments',
            'key_takeaways': 'Key Takeaways', 'action_plan': 'Action Plan',
            'one_sentence_summary': 'One Sentence Summary', 'type': 'Type',
            'analysis': 'Analysis', 'first_5_seconds': 'First 5 Seconds',
            'improvement_tips': 'Improvement Tips', 'structure': 'Structure',
            'hero': 'Main Character', 'conflict': 'Conflict',
            'resolution': 'Resolution', 'template': 'Template', 'verdict': 'Verdict',
            'video_production': 'Video Production', 'ai_video_prompts': 'AI Video Prompts',
            'runway_prompts': 'Runway ML Prompts', 'luma_prompts': 'Luma AI Prompts',
            'kling_prompts': 'Kling AI Prompts', 'sora_prompts': 'OpenAI Sora Prompts',
            'pika_prompts': 'Pika Labs Prompts', 'shorts_reels_prompts': 'Shorts/Reels/TikTok Prompts',
            'thumbnail_dalle_prompts': 'Thumbnail AI Prompts', 'b_roll_suggestions': 'B-Roll Suggestions',
            'storyboard': 'Storyboard', 'overall_style': 'Visual Style',
            'color_palette': 'Color Palette', 'music_mood': 'Music Style',
            'transition_style': 'Transition Effect', 'aspect_ratio_recommendation': 'Aspect Ratio',
            'content_briefing': 'Content Briefing', 'faq': 'FAQ',
            'key_concepts': 'Key Concepts', 'content_dna': 'Content DNA',
            'recreation_mega_prompt': 'Video Recreation Prompt',
            'format_formula': 'Format Formula', 'unique_elements': 'Unique Elements',
            'replicable_patterns': 'Replicable Patterns',
            'success_factors': 'Success Factors', 'content_pillars': 'Content Pillars',
            'emotional_arc': 'Emotional Arc', 'study_notes': 'Study Notes',
            'quick_recap': 'Quick Recap', 'timeline': 'Timeline'
        }
    };

    /**
     * Detect browser language and set current language
     */
    async function init() {
        // Check stored preference first
        try {
            const stored = await chrome.storage.local.get('user_language');
            if (stored.user_language) {
                currentLang = stored.user_language;
                return currentLang;
            }
        } catch (e) { /* ignore */ }

        // Auto-detect from browser
        const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        currentLang = browserLang.startsWith('tr') ? 'tr' : 'en';

        // Save preference
        try {
            await chrome.storage.local.set({ user_language: currentLang });
        } catch (e) { /* ignore */ }

        return currentLang;
    }

    /**
     * Translate a key
     * @param {string} key - Translation key
     * @param {string} fallback - Fallback text if key not found
     * @returns {string}
     */
    function t(key, fallback) {
        const entry = translations[key];
        if (entry) return entry[currentLang] || entry['en'] || fallback || key;
        return fallback || key;
    }

    /**
     * Get field label for analysis results
     * @param {string} fieldKey - JSON field name
     * @returns {string}
     */
    function label(fieldKey) {
        const cleanKey = fieldKey.replace(/^[0-9]+\.\s*/, '').toLowerCase().trim().replace(/ /g, '_');
        const labels = fieldLabels[currentLang] || fieldLabels['en'];
        return labels[cleanKey] || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Apply translations to all elements with data-i18n attribute
     */
    function applyToDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = t(key);
            if (translated !== key) {
                el.textContent = translated;
            }
        });
        // Also handle placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = t(key);
        });
    }

    /**
     * Get current language code
     * @returns {string} 'tr' or 'en'
     */
    function getLang() {
        return currentLang;
    }

    /**
     * Set language manually
     * @param {string} lang - 'tr' or 'en'
     */
    async function setLang(lang) {
        currentLang = lang === 'tr' ? 'tr' : 'en';
        try {
            await chrome.storage.local.set({ user_language: currentLang });
        } catch (e) { /* ignore */ }
        applyToDOM();
        return currentLang;
    }

    /**
     * Get date locale string based on current language
     * @returns {string}
     */
    function getLocale() {
        return currentLang === 'tr' ? 'tr-TR' : 'en-US';
    }

    return { init, t, label, applyToDOM, getLang, setLang, getLocale };
})();
