/**
 * Lightweight i18n system for Dion Youtube Analyzer
 * Supports Turkish (tr) and English (en)
 * Auto-detects browser language, falls back to English
 */

const I18N = (() => {
    let currentLang = 'en';

    const translations = {
        // ==================== POPUP ====================
        'login_with_google': { tr: 'Google ile Giriş Yap', en: 'Sign in with Google' },
        'logout': { tr: 'Çıkış', en: 'Logout' },
        'not_youtube_warning': { tr: 'Bir YouTube video sayfasına gidin ve tekrar deneyin.', en: 'Go to a YouTube video page and try again.' },
        'login_warning': { tr: 'Analiz yapmak için giriş yapın.', en: 'Sign in to analyze videos.' },
        'video_title_placeholder': { tr: 'Video Başlığı', en: 'Video Title' },
        'channel_name_placeholder': { tr: 'Kanal Adı', en: 'Channel Name' },
        'status': { tr: 'Durum', en: 'Status' },
        'ready': { tr: 'Hazır', en: 'Ready' },
        'subscription': { tr: 'Abonelik', en: 'Subscription' },
        'remaining': { tr: 'kalan', en: 'left' },
        'remaining_rights': { tr: 'Kalan hak', en: 'Remaining' },
        'used': { tr: 'Kullanılan', en: 'Used' },
        'pro_full_access': { tr: 'Tam Analiz Erişimi', en: 'Full Analysis Access' },
        'pro_see_all': { tr: 'Tüm sonuçları görün', en: 'See all results' },
        'analyze_video': { tr: 'Videoyu Analiz Et', en: 'Analyze Video' },
        'analysis_history': { tr: 'Geçmiş Analizler', en: 'Analysis History' },
        'popup_footer': { tr: 'YouTube sayfasında sağ tıkla > "Analyze Video with AI"', en: 'Right-click on YouTube > "Analyze Video with AI"' },
        'free': { tr: 'Ücretsiz', en: 'Free' },
        'pro_plan': { tr: 'Pro Plan', en: 'Pro Plan' },
        'analyzing': { tr: 'Analiz ediliyor...', en: 'Analyzing...' },
        'unlimited': { tr: 'Sınırsız', en: 'Unlimited' },
        'score_only': { tr: 'Sadece skor görünür', en: 'Score only visible' },
        'pro_full_access_short': { tr: 'Pro ile tam erişim', en: 'Full access with Pro' },
        'logged_in': { tr: 'Giriş yapıldı', en: 'Logged in' },
        'logging_in': { tr: 'Giriş yapılıyor...', en: 'Signing in...' },
        'login_failed': { tr: 'Giriş yapılamadı', en: 'Login failed' },
        'login_cancelled': { tr: 'Giriş iptal edildi', en: 'Login cancelled' },

        // ==================== DASHBOARD SIDEBAR ====================
        'nav_analysis': { tr: 'Analiz', en: 'Analysis' },
        'nav_other': { tr: 'Diğer', en: 'Other' },
        'deep_analysis': { tr: 'Derin Analiz', en: 'Deep Analysis' },
        'prompt_toolkit': { tr: 'Prompt Toolkit', en: 'Prompt Toolkit' },
        'notebook_mode': { tr: 'Notebook Modu', en: 'Notebook Mode' },
        'scripts_titles': { tr: 'Script & Başlıklar', en: 'Scripts & Titles' },
        'character_transform': { tr: 'Karakter Dönüşümü', en: 'Character Transform' },
        'video_production': { tr: 'Video Üretim Merkezi', en: 'Video Production' },
        'history': { tr: 'Geçmiş Analizler', en: 'Analysis History' },
        'admin_panel': { tr: 'Admin Panel', en: 'Admin Panel' },

        // ==================== DASHBOARD HEADER ====================
        'loading': { tr: 'Yükleniyor...', en: 'Loading...' },
        'export_txt': { tr: 'TXT İndir', en: 'Download TXT' },
        'export_json': { tr: 'JSON İndir', en: 'Download JSON' },
        'copy_all': { tr: 'Tümünü Kopyala', en: 'Copy All' },
        'video_flow_chart': { tr: 'Video Akış Şeması', en: 'Video Flow Chart' },

        // ==================== LOADING SCREEN ====================
        'preparing_data': { tr: 'Video Verileri Hazırlanıyor...', en: 'Preparing Video Data...' },
        'ai_analyzing': { tr: 'AI Analizi Yapılıyor...', en: 'AI Analysis in Progress...' },
        'video_content_analyzing': { tr: 'Video içerik analizi devam ediyor...', en: 'Video content analysis continues...' },
        'detailed_analysis_completing': { tr: 'Detaylı analiz tamamlanıyor...', en: 'Completing detailed analysis...' },
        'processing_results': { tr: 'Sonuçlar İşleniyor...', en: 'Processing Results...' },
        'preparing_report': { tr: 'Rapor Hazırlanıyor...', en: 'Preparing Report...' },

        // ==================== ERRORS ====================
        'error_no_video_data': { tr: 'Video verisi bulunamadı.', en: 'Video data not found.' },
        'error_no_video_data_desc': { tr: 'Lütfen YouTube video sayfasından tekrar başlatın.', en: 'Please start again from a YouTube video page.' },
        'error_timeout': { tr: 'Analiz çok uzun sürdü.', en: 'Analysis took too long.' },
        'error_timeout_desc': { tr: 'AI modeli yanıtlamıyor. Lütfen daha sonra tekrar deneyin.', en: 'AI model is not responding. Please try again later.' },
        'error_auth': { tr: 'Oturum süresi dolmuş.', en: 'Session expired.' },
        'error_auth_desc': { tr: 'Lütfen uzantı popup\'ından tekrar giriş yapın.', en: 'Please sign in again from the extension popup.' },
        'error_rate_limit': { tr: 'Çok fazla istek.', en: 'Too many requests.' },
        'error_rate_limit_desc': { tr: 'Lütfen 1 dakika bekleyip tekrar deneyin.', en: 'Please wait 1 minute and try again.' },
        'error_connection': { tr: 'Bağlantı hatası.', en: 'Connection error.' },
        'error_connection_desc': { tr: 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.', en: 'Cannot reach server. Check your internet connection.' },
        'error_analysis': { tr: 'Analiz hatası', en: 'Analysis error' },
        'error_login_required': { tr: 'Giriş gerekli.', en: 'Login required.' },
        'error_login_required_desc': { tr: 'Lütfen uzantı popup\'ından Google ile giriş yapın.', en: 'Please sign in with Google from the extension popup.' },

        // ==================== SCORE BANNER ====================
        'overall_score': { tr: 'Genel Puan', en: 'Overall Score' },
        'seo_score': { tr: 'SEO Puanı', en: 'SEO Score' },
        'engagement_score': { tr: 'Etkileşim', en: 'Engagement' },
        'viral_potential': { tr: 'Viral Potansiyel', en: 'Viral Potential' },
        'content_quality': { tr: 'İçerik Kalitesi', en: 'Content Quality' },

        // ==================== ANALYSIS TYPE BADGE ====================
        'analysis_type_video': { tr: 'Video Analizi', en: 'Video Analysis' },
        'analysis_type_transcript': { tr: 'Transcript Analizi', en: 'Transcript Analysis' },
        'analysis_type_metadata': { tr: 'Metadata Analizi', en: 'Metadata Analysis' },

        // ==================== PRO LOCK ====================
        'pro_required': { tr: 'Pro Erişim Gerekli', en: 'Pro Access Required' },
        'pro_locked_desc': { tr: 'Bu bölümü görüntülemek için Pro plana geçin. Tüm analiz sonuçlarına, prompt\'lara ve video üretim aracına erişim sağlayın.', en: 'Upgrade to Pro to view this section. Get access to all analysis results, prompts, and video production tools.' },
        'upgrade_to_pro': { tr: 'Pro Plana Geç', en: 'Upgrade to Pro' },
        'upgrade_message': { tr: 'Tam analiz için Pro plana geçin.', en: 'Upgrade to Pro for full analysis.' },

        // ==================== HISTORY ====================
        'no_analysis_yet': { tr: 'Henüz analiz yapılmamış.', en: 'No analyses yet.' },
        'start_first_analysis': { tr: 'YouTube\'da bir video analiz ederek başlayabilirsiniz.', en: 'Start by analyzing a video on YouTube.' },
        'login_to_see_history': { tr: 'Geçmiş analizleri görmek için giriş yapın.', en: 'Sign in to see your analysis history.' },
        'delete_confirm': { tr: 'Bu analizi silmek istediğinize emin misiniz?', en: 'Are you sure you want to delete this analysis?' },
        'load_more': { tr: 'Daha Fazla Yükle', en: 'Load More' },

        // ==================== CARD TOGGLE ====================
        'show_more': { tr: 'Devamını gör', en: 'Show more' },
        'show_less': { tr: 'Daralt', en: 'Show less' },
        'ai_studio': { tr: 'AI Studio', en: 'AI Studio' },
        'ai_studio_title': { tr: 'AI Studio', en: 'AI Studio' },
        'ai_studio_desc': { tr: 'Bu videoyu yeniden oluşturmak için platform bazlı hazır promptlar', en: 'Ready-to-use prompts by platform to recreate this video' },
        'ai_filter_all': { tr: 'Tümünü Göster', en: 'Show All' },
        'ai_cat_video': { tr: 'Video Oluşturma', en: 'Video Generation' },
        'ai_cat_image': { tr: 'Görsel Oluşturma', en: 'Image Generation' },
        'ai_cat_content': { tr: 'İçerik Dönüşümü', en: 'Content Repurpose' },
        'ai_cat_text': { tr: 'Metin / Sohbet', en: 'Text / Chat' },
        'ai_cat_scene': { tr: 'Sahne Promptları', en: 'Scene Prompts' },
        'ai_cat_short': { tr: 'Kısa Video', en: 'Short Video' },
        'ai_cat_mega': { tr: 'Tam Yeniden Oluşturma', en: 'Full Recreation' },
        'copy_prompt': { tr: 'Promptu Kopyala', en: 'Copy Prompt' },
        'no_prompts': { tr: 'Prompt bulunamadı', en: 'No prompts found' },
        'no_prompts_desc': { tr: 'Analiz tamamlandığında AI promptları burada görünecek', en: 'AI prompts will appear here when analysis is complete' },

        // ==================== COPY/EXPORT ====================
        'copied': { tr: 'Kopyalandı!', en: 'Copied!' },
        'copy': { tr: 'Kopyala', en: 'Copy' },
        'report_title': { tr: '=== DION YOUTUBE ANALYZER RAPORU ===', en: '=== DION YOUTUBE ANALYZER REPORT ===' },
        'video_label': { tr: 'Video', en: 'Video' },
        'channel_label': { tr: 'Kanal', en: 'Channel' },
        'date_label': { tr: 'Tarih', en: 'Date' },

        // ==================== NOTEBOOK ====================
        'estimated_interest': { tr: 'Tahmini İlgi', en: 'Estimated Interest' },
        'study_notes': { tr: 'Çalışma Notları', en: 'Study Notes' },
        'quick_recap': { tr: 'Hızlı Özet', en: 'Quick Recap' },
        'timeline': { tr: 'Zaman Çizelgesi', en: 'Timeline' },

        // ==================== VIDEO PRODUCTION ====================
        'scene': { tr: 'Sahne', en: 'Scene' },
        'voiceover': { tr: 'Seslendirme', en: 'Voiceover' },
        'full_voiceover_script': { tr: 'Tam Seslendirme Metni', en: 'Full Voiceover Script' },
        'music_recommendations': { tr: 'Müzik Önerileri', en: 'Music Recommendations' },
        'platform_prompts': { tr: 'Platform Prompt\'ları', en: 'Platform Prompts' },
        'copy_prompt': { tr: 'Kopyala', en: 'Copy' },
        'copy_scene': { tr: 'Sahneyi Kopyala', en: 'Copy Scene' },

        // ==================== MEGA PROMPT ====================
        'mega_prompt_info': { tr: 'Bu promptu doğrudan bir AI aracına (ChatGPT, Claude vs.) yapıştırarak bu videonun tarzında yeni bir video oluşturabilirsiniz.', en: 'Paste this prompt directly into an AI tool (ChatGPT, Claude, etc.) to create a new video in this style.' },
        'click_to_copy': { tr: 'Kopyalamak için tıkla', en: 'Click to copy' },

        // ==================== DASHBOARD DYNAMIC ====================
        'video_analysis_title': { tr: 'Video Analizi', en: 'Video Analysis' },
        'unknown': { tr: 'Bilinmeyen', en: 'Unknown' },
        'pro_content': { tr: 'Pro İçerik', en: 'Pro Content' },
        'pro_plan_required': { tr: 'Pro plan gerekli', en: 'Pro plan required' },
        'retry': { tr: 'Tekrar Dene', en: 'Retry' },
        'style_guide': { tr: 'Video Stil Rehberi', en: 'Video Style Guide' },
        'copy_voiceover': { tr: 'Tam Seslendirme Metnini Kopyala', en: 'Copy Full Voiceover Script' },
        'copy_all_prompts': { tr: 'Tüm AI Promptlarını Kopyala', en: 'Copy All AI Prompts' },
        'download_video_package': { tr: 'Video Paketi İndir (JSON)', en: 'Download Video Package (JSON)' },
        'copy_as_markdown': { tr: 'Markdown Olarak Kopyala', en: 'Copy as Markdown' },
        'copy_all_scene_prompts': { tr: 'Tüm Sahne Promptlarını Kopyala', en: 'Copy All Scene Prompts' },
        'scene_prompts_header': { tr: '=== SAHNE PROMPTLARI ===', en: '=== SCENE PROMPTS ===' },
        'platform_prompts_header': { tr: '=== PLATFORM PROMPTLARI ===', en: '=== PLATFORM PROMPTS ===' },
        'md_video_production': { tr: '# Video Üretim Paketi', en: '# Video Production Package' },
        'md_style_guide': { tr: '## Stil Rehberi', en: '## Style Guide' },
        'md_visual_style': { tr: 'Görsel Stil', en: 'Visual Style' },
        'md_color_palette': { tr: 'Renk Paleti', en: 'Color Palette' },
        'md_music': { tr: 'Müzik', en: 'Music' },
        'md_transitions': { tr: 'Geçişler', en: 'Transitions' },
        'md_aspect_ratio': { tr: 'En-Boy Oranı', en: 'Aspect Ratio' },
        'md_storyboard': { tr: '## Storyboard', en: '## Storyboard' },
        'md_scene': { tr: 'Sahne', en: 'Scene' },
        'md_description': { tr: 'Açıklama', en: 'Description' },
        'md_camera': { tr: 'Kamera', en: 'Camera' },
        'md_sound': { tr: 'Ses', en: 'Sound' },
        'md_voiceover': { tr: 'Seslendirme', en: 'Voiceover' },
        'md_full_voiceover': { tr: '## Tam Seslendirme Metni', en: '## Full Voiceover Script' },
        'md_platform_prompts': { tr: '## Platform Promptları', en: '## Platform Prompts' },
        'camera_label': { tr: 'Kamera', en: 'Camera' },
        'sound_label': { tr: 'Ses/Müzik', en: 'Sound/Music' },
        'screen_text_label': { tr: 'Ekran Metni', en: 'Screen Text' },
        'login_required_short': { tr: 'Giriş gerekli', en: 'Login required' },
        'login_to_see_history_short': { tr: 'Geçmiş analizlerinizi görmek için giriş yapın.', en: 'Sign in to see your analysis history.' },
        'no_analysis_yet_short': { tr: 'Henüz analiz yok', en: 'No analyses yet' },
        'start_analysis_hint': { tr: 'Bir YouTube videosuna gidin ve analiz başlatın.', en: 'Go to a YouTube video and start an analysis.' },
        'delete': { tr: 'Sil', en: 'Delete' },
        'analysis_deleted': { tr: 'Analiz silindi.', en: 'Analysis deleted.' },
        'delete_error': { tr: 'Silme hatası.', en: 'Delete error.' },
        'connection_error_title': { tr: 'Bağlantı Hatası', en: 'Connection Error' },
        'connection_error_desc': { tr: 'Sunucu bağlantısı kurulamadı. Lütfen tekrar deneyin.', en: 'Could not connect to server. Please try again.' },
        'txt_downloaded': { tr: 'TXT dosyası indirildi!', en: 'TXT file downloaded!' },
        'json_downloaded': { tr: 'JSON dosyası indirildi!', en: 'JSON file downloaded!' },
        'report_copied': { tr: 'Tüm rapor panoya kopyalandı!', en: 'Full report copied to clipboard!' },
        'payment_loading': { tr: 'Yükleniyor...', en: 'Loading...' },
        'payment_error': { tr: 'Ödeme oluşturulamadı.', en: 'Payment could not be created.' },
        'payment_create_error': { tr: 'Ödeme oluşturulurken hata oluştu.', en: 'Error creating payment.' },
        'upgrade_to_pro_short': { tr: "Pro'ya Yükselt", en: 'Upgrade to Pro' },
    };

    // ==================== FIELD LABELS ====================
    const fieldLabels = {
        tr: {
            'video_score': 'Video Puanı', 'content_style_breakdown': 'İçerik Stili Analizi',
            'psychological_triggers': 'Psikolojik Tetikleyiciler', 'hook_structure': 'Giriş (Hook) Yapısı',
            'retention_strategy': 'İzleyici Tutma Stratejisi', 'thumbnail_psychology': 'Küçük Resim Psikolojisi',
            'target_audience': 'Hedef Kitle', 'tone_analysis': 'Ton Analizi',
            'script_reverse_engineering': 'Senaryo Yapısı', 'cta_strategy': 'CTA Stratejisi',
            'competitor_analysis': 'Rakip Analizi', 'comment_sentiment': 'Yorum Duygu Analizi',
            'video_flow_mermaid': 'Video Akış Şeması', 'deep_digest_summary': 'Derin Özet & Aksiyon Planı',
            'notebook_podcast_script': 'Podcast Senaryosu', 'audience_retention_heatmap': 'İzleyici İlgi Isı Haritası',
            'similar_video_prompts': 'Benzer Video Promptları', 'viral_hook_prompts': 'Viral Giriş Promptları',
            'title_variations': 'Başlık Varyasyonları', 'seo_descriptions': 'SEO Açıklamaları',
            'high_ctr_titles': 'Yüksek CTR Başlıklar', 'thumbnail_text_ideas': 'Thumbnail Metin Fikirleri',
            'seo_tags': 'SEO Tag Önerileri', 'full_script_template': 'Tam Senaryo Şablonu',
            'hook_variations': 'Giriş Varyasyonları', 'storytelling_framework': 'Hikaye Anlatım Çerçevesi',
            'aggressive_sales': 'Agresif Satış Tonu', 'calm_educational': 'Eğitici & Sakin Ton',
            'documentary': 'Belgesel Tarzı', 'motivational': 'Motivasyonel Anlatım',
            'controversial': 'Tartışmalı Yaklaşım', 'ai_prompts_toolkit': 'AI Prompt Araçları',
            'chatgpt_prompts': 'ChatGPT Promptları', 'midjourney_prompts': 'Midjourney Promptları',
            'blog_post_prompt': 'Blog Yazısı Promptu', 'twitter_thread_prompt': 'Twitter Thread Promptu',
            'linkedin_post_prompt': 'LinkedIn Paylaşım Promptu', 'tiktok_script_prompt': 'TikTok/Reels Promptu',
            'email_newsletter_prompt': 'Email Bülten Promptu', 'content_repurpose_ideas': 'İçerik Dönüştürme Fikirleri',
            'monetization_ideas': 'Para Kazanma Fikirleri',
            'overall_score': 'Genel Puan', 'seo_score': 'SEO Puanı',
            'engagement_score': 'Etkileşim Puanı', 'viral_potential': 'Viral Potansiyel',
            'content_quality': 'İçerik Kalitesi', 'demographics': 'Demografik',
            'psychographics': 'Psikografik', 'viewer_intent': 'İzleyici Niyeti',
            'niche_positioning': 'Niş Konumlandırma', 'differentiation': 'Farklılaşma',
            'market_gap': 'Pazar Boşluğu', 'overall_mood': 'Genel Duygu',
            'top_themes': 'Öne Çıkan Temalar', 'audience_questions': 'İzleyici Soruları',
            'content_ideas_from_comments': 'Yorumlardan Fikirler',
            'key_takeaways': 'Önemli Dersler', 'action_plan': 'Aksiyon Planı',
            'one_sentence_summary': 'Tek Cümle Özet', 'type': 'Tip',
            'analysis': 'Analiz', 'first_5_seconds': 'İlk 5 Saniye',
            'improvement_tips': 'İyileştirme Önerileri', 'structure': 'Yapı',
            'hero': 'Ana Karakter', 'conflict': 'Problem/Çatışma',
            'resolution': 'Çözüm', 'template': 'Şablon', 'verdict': 'Değerlendirme',
            'video_production': 'Video Production', 'ai_video_prompts': 'AI Video Prompt\'ları',
            'runway_prompts': 'Runway ML Prompt\'ları', 'luma_prompts': 'Luma AI Prompt\'ları',
            'kling_prompts': 'Kling AI Prompt\'ları', 'sora_prompts': 'OpenAI Sora Prompt\'ları',
            'pika_prompts': 'Pika Labs Prompt\'ları', 'shorts_reels_prompts': 'Shorts/Reels/TikTok Prompt\'ları',
            'thumbnail_dalle_prompts': 'Thumbnail AI Prompt\'ları', 'b_roll_suggestions': 'B-Roll Önerileri',
            'storyboard': 'Storyboard', 'overall_style': 'Görsel Stil',
            'color_palette': 'Renk Paleti', 'music_mood': 'Müzik Tarzı',
            'transition_style': 'Geçiş Efekti', 'aspect_ratio_recommendation': 'En-Boy Oranı',
            'content_briefing': 'İçerik Özeti', 'faq': 'Sık Sorulan Sorular',
            'key_concepts': 'Anahtar Kavramlar', 'content_dna': 'İçerik DNA\'sı',
            'recreation_mega_prompt': 'Video Yeniden Üretim Promptu',
            'format_formula': 'Format Formülü', 'unique_elements': 'Benzersiz Elemanlar',
            'replicable_patterns': 'Tekrar Kullanılabilir Kalıplar',
            'success_factors': 'Başarı Faktörleri', 'content_pillars': 'İçerik Sütunları',
            'emotional_arc': 'Duygusal Yolculuk', 'study_notes': 'Çalışma Notları',
            'quick_recap': 'Hızlı Özet', 'timeline': 'Zaman Çizelgesi'
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
