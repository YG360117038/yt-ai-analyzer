const { GoogleAIFileManager } = require('@google/generative-ai/server');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const MAX_DURATION_SECONDS = parseInt(process.env.MAX_VIDEO_DURATION_SECONDS) || 600;
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const DOWNLOAD_TIMEOUT_MS = 120000; // 2 dakika
const PROCESSING_TIMEOUT_MS = 120000; // 2 dakika polling

// Ayni anda max 1 video analizi
let activeVideoAnalyses = 0;
const MAX_CONCURRENT = 1;

function isAvailable() {
    return process.env.VIDEO_ANALYSIS_ENABLED === 'true';
}

function isBusy() {
    return activeVideoAnalyses >= MAX_CONCURRENT;
}

async function downloadVideo(videoId) {
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `yt-${videoId}-${Date.now()}.mp4`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    return new Promise((resolve, reject) => {
        const args = [
            url,
            '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--match-filter', `duration < ${MAX_DURATION_SECONDS}`,
            '-o', outputPath,
            '--no-playlist',
            '--socket-timeout', '30'
        ];

        const proc = spawn(YTDLP_PATH, args);
        let stderr = '';

        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timeout = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error('Video download timeout'));
        }, DOWNLOAD_TIMEOUT_MS);

        proc.on('close', code => {
            clearTimeout(timeout);
            if (code === 0 && fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(`Video downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
                resolve(outputPath);
            } else {
                reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(-200)}`));
            }
        });

        proc.on('error', err => {
            clearTimeout(timeout);
            reject(new Error(`yt-dlp not found or error: ${err.message}`));
        });
    });
}

async function uploadToGemini(filePath) {
    const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: 'video/mp4',
        displayName: path.basename(filePath)
    });

    // Processing tamamlanana kadar bekle
    let file = uploadResult.file;
    const startTime = Date.now();

    while (file.state === 'PROCESSING') {
        if (Date.now() - startTime > PROCESSING_TIMEOUT_MS) {
            throw new Error('Gemini file processing timeout');
        }
        await new Promise(r => setTimeout(r, 5000));
        file = await fileManager.getFile(file.name);
    }

    if (file.state === 'FAILED') {
        throw new Error('Gemini file processing failed');
    }

    console.log(`Video uploaded to Gemini: ${file.name}, state: ${file.state}`);
    return file;
}

async function cleanup(localPath, geminiFileName) {
    if (localPath) {
        try { fs.unlinkSync(localPath); } catch (e) { /* ignore */ }
    }
    if (geminiFileName) {
        try { await fileManager.deleteFile(geminiFileName); } catch (e) { /* ignore */ }
    }
}

function acquireSlot() {
    if (activeVideoAnalyses >= MAX_CONCURRENT) return false;
    activeVideoAnalyses++;
    return true;
}

function releaseSlot() {
    activeVideoAnalyses = Math.max(0, activeVideoAnalyses - 1);
}

module.exports = {
    downloadVideo,
    uploadToGemini,
    cleanup,
    isAvailable,
    isBusy,
    acquireSlot,
    releaseSlot,
    MAX_DURATION_SECONDS
};
