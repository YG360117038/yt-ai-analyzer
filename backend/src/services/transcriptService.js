const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/\n/g, ' ')
        .trim();
}

function parseTranscriptXml(xml) {
    const segments = [];
    const regex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
    let match;

    while ((match = regex.exec(xml)) !== null) {
        const start = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        const text = decodeHtmlEntities(match[3]);

        if (text.length > 0) {
            segments.push({ text, start, duration });
        }
    }

    return segments;
}

async function fetchTranscript(videoId) {
    try {
        const tempDir = os.tmpdir();
        const outputBase = path.join(tempDir, `yt-sub-${videoId}-${Date.now()}`);
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        // yt-dlp ile altyazi indir (auto-generated)
        const args = [
            '-m', 'yt_dlp',
            '--js-runtimes', 'node',
            '--write-auto-sub',
            '--sub-lang', 'en',
            '--sub-format', 'srv1',
            '--skip-download',
            '-o', outputBase,
            url
        ];

        await new Promise((resolve, reject) => {
            const proc = spawn('python3', args);
            let stderr = '';
            proc.stdout.on('data', () => {}); // drain stdout
            proc.stderr.on('data', d => { stderr += d.toString(); });

            const timeout = setTimeout(() => {
                proc.kill('SIGTERM');
                reject(new Error('Transcript download timeout'));
            }, 20000);

            proc.on('close', code => {
                clearTimeout(timeout);
                if (stderr && stderr.includes('ERROR')) {
                    console.warn('yt-dlp stderr:', stderr.substring(0, 200));
                }
                resolve();
            });
            proc.on('error', err => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        // Indirilen dosyayi bul (tr > en oncelikli)
        let subFile = null;
        let language = 'unknown';
        const dir = path.dirname(outputBase);
        const base = path.basename(outputBase);

        // Dosyalari tara
        const allFiles = fs.readdirSync(dir);
        const subFiles = allFiles.filter(f => f.startsWith(base) && f.endsWith('.srv1'));

        if (subFiles.length === 0) {
            console.warn('No subtitle file found for video:', videoId);
            return null;
        }

        // Turkce > Ingilizce > ilk bulunan
        const trFile = subFiles.find(f => f.includes('.tr.'));
        const enFile = subFiles.find(f => f.includes('.en.'));

        if (trFile) {
            subFile = path.join(dir, trFile);
            language = 'tr';
        } else if (enFile) {
            subFile = path.join(dir, enFile);
            language = 'en';
        } else {
            subFile = path.join(dir, subFiles[0]);
            // Dil kodunu dosya adindan cikar
            const langMatch = subFiles[0].match(/\.([a-z]{2})\./);
            if (langMatch) language = langMatch[1];
        }

        // XML parse et
        const xml = fs.readFileSync(subFile, 'utf-8');
        const segments = parseTranscriptXml(xml);

        // Tum subtitle dosyalarini temizle
        for (const f of subFiles) {
            try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ }
        }

        if (segments.length === 0) {
            console.warn('No segments parsed from subtitle file');
            return null;
        }

        const fullText = segments.map(s => s.text).join(' ');
        console.log(`Transcript fetched (${language}): ${segments.length} segments, ${fullText.length} chars`);

        return { segments, fullText, language };

    } catch (e) {
        console.warn('Transcript fetch failed:', e.message);
        return null;
    }
}

module.exports = { fetchTranscript, formatTime };
