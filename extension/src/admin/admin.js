const BACKEND_URL = CONFIG.BACKEND_URL;

async function authFetch(url, options = {}) {
    const token = await SupabaseAuth.getToken();
    if (!token) {
        window.location.href = '../popup/index.html';
        return;
    }
    return fetch(url, {
        ...options,
        headers: { ...options.headers, 'Authorization': `Bearer ${token}` }
    });
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Az once';
    if (mins < 60) return `${mins} dk once`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} saat once`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} gun once`;
    return new Date(dateStr).toLocaleDateString('tr-TR');
}

// Tab sistemi
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    });
});

// Stat animasyonu
function animateValue(el, target, duration = 1000) {
    const start = performance.now();
    function update(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(2, -10 * progress);
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// Verileri yukle
async function loadAdmin() {
    try {
        // Istatistikler
        const statsRes = await authFetch(`${BACKEND_URL}/api/admin/stats`);
        if (statsRes.status === 403) {
            document.querySelector('.container').innerHTML = '<div class="error-msg">Admin yetkisi gerekli.</div>';
            return;
        }
        const stats = await statsRes.json();

        animateValue(document.getElementById('stat-users'), stats.totalUsers || 0);
        animateValue(document.getElementById('stat-analyses'), stats.totalAnalyses || 0);
        animateValue(document.getElementById('stat-pro'), stats.proUsers || 0);

        // Bugunun analizleri
        const today = new Date().toISOString().split('T')[0];
        const todayCount = (stats.recentAnalyses || []).filter(a =>
            a.created_at && a.created_at.startsWith(today)
        ).length;
        animateValue(document.getElementById('stat-today'), todayCount);

        // Son aktivite
        renderRecent(stats.recentAnalyses || []);

        // Kullanicilar
        const usersRes = await authFetch(`${BACKEND_URL}/api/admin/users`);
        const usersData = await usersRes.json();
        renderUsers(usersData.users || []);

        // Analizler
        const analysesRes = await authFetch(`${BACKEND_URL}/api/admin/analyses`);
        const analysesData = await analysesRes.json();
        renderAnalyses(analysesData.analyses || []);

    } catch (error) {
        console.error('Admin load error:', error);
        document.querySelector('.container').innerHTML =
            `<div class="error-msg">Yukleme hatasi: ${error.message}</div>`;
    }
}

function renderRecent(items) {
    const panel = document.getElementById('panel-recent');
    if (!items.length) {
        panel.innerHTML = '<div class="error-msg">Henuz analiz yapilmamis.</div>';
        return;
    }
    panel.innerHTML = `<div class="recent-list">
        ${items.map(a => `
            <div class="recent-item">
                <img src="${a.video_metadata?.thumbnail || `https://img.youtube.com/vi/${a.video_id}/mqdefault.jpg`}" alt="">
                <div class="info">
                    <h4>${a.video_metadata?.title || 'Basliksiz'}</h4>
                    <span>${a.video_metadata?.channelName || ''}</span>
                </div>
                <div class="time">${timeAgo(a.created_at)}</div>
            </div>
        `).join('')}
    </div>`;
}

function renderUsers(users) {
    const panel = document.getElementById('panel-users');
    if (!users.length) {
        panel.innerHTML = '<div class="error-msg">Kullanici bulunamadi.</div>';
        return;
    }
    panel.innerHTML = `<table>
        <thead><tr>
            <th>Kullanici</th>
            <th>Plan</th>
            <th>Analiz Sayisi</th>
            <th>Durum</th>
        </tr></thead>
        <tbody>
            ${users.map(u => `<tr>
                <td>
                    <div style="font-weight:500">${u.display_name || '-'}</div>
                    <div style="font-size:12px;color:var(--text-dim)">${u.email}</div>
                </td>
                <td><span class="plan-badge ${u.plan === 'pro' ? 'plan-pro' : 'plan-free'}">${u.plan}</span></td>
                <td style="font-weight:600">${u.analysis_count || 0}</td>
                <td style="font-size:12px;color:var(--text-dim)">${u.subscription_status || 'Ucretsiz'}</td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

function renderAnalyses(analyses) {
    const panel = document.getElementById('panel-analyses');
    if (!analyses.length) {
        panel.innerHTML = '<div class="error-msg">Analiz bulunamadi.</div>';
        return;
    }
    panel.innerHTML = `<table>
        <thead><tr>
            <th>Video</th>
            <th>Kullanici</th>
            <th>Tarih</th>
        </tr></thead>
        <tbody>
            ${analyses.map(a => `<tr>
                <td>
                    <div class="video-row">
                        <img src="${a.thumbnail || `https://img.youtube.com/vi/${a.videoId}/mqdefault.jpg`}" alt="">
                        <div class="video-info">
                            <h4>${a.videoTitle}</h4>
                            <span>${a.channelName}</span>
                        </div>
                    </div>
                </td>
                <td style="font-size:13px">${a.userEmail}</td>
                <td style="font-size:12px;color:var(--text-dim);white-space:nowrap">${timeAgo(a.createdAt)}</td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

// Baslat
loadAdmin();
