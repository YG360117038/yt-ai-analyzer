require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Init
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

// ==================== ROUTES ====================

// Yeni Analiz Yap
app.post('/api/analyze', async (req, res) => {
    console.log("Received analysis request for video:", req.body.videoId);
    try {
        const videoData = req.body;

        if (!videoData.videoId) {
            return res.status(400).json({ error: "videoId gerekli." });
        }

        // Gemini AI Analysis
        console.log("Starting Gemini Analysis...");
        const { analyzeVideo } = require('./services/aiService');
        const analysis = await analyzeVideo(videoData);
        console.log("Analysis complete!");

        // Save to DB
        console.log("Saving to Supabase...");
        const { data, error } = await supabase
            .from('analyses')
            .insert([{
                video_id: videoData.videoId,
                video_metadata: videoData,
                analysis_results: analysis
            }])
            .select();

        if (error) {
            console.error("Supabase Error:", error);
            throw error;
        }

        console.log("Success! Analysis ID:", data[0].id);
        res.json(data[0]);
    } catch (error) {
        console.error("Error in /api/analyze:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Tek Analiz Getir
app.get('/api/analysis/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('analyses')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: "Analiz bulunamadi." });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Gecmis Analizler Listesi
app.get('/api/analyses', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const { data, error, count } = await supabase
            .from('analyses')
            .select('id, video_id, video_metadata, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        res.json({
            analyses: data.map(item => ({
                id: item.id,
                videoId: item.video_id,
                title: item.video_metadata?.title || "Basliksiz",
                channelName: item.video_metadata?.channelName || "",
                thumbnail: item.video_metadata?.thumbnail || "",
                createdAt: item.created_at
            })),
            total: count,
            hasMore: (offset + limit) < count
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Analiz Sil
app.delete('/api/analysis/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('analyses')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
