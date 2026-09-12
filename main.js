import { TRACKS } from './tracks-manifest.js';
import { PHOTOS } from './photos-manifest.js';
import { initStickGame } from './game.js';
import { initPlayer, refreshAllViews, drawVisualizer, stopVisualizer, stopAudio, addUploadedTracks } from './player.js';
import {
    dbShield, initSupabase, fetchDesktopIcons, subscribeDesktopIcons,
    upsertIcon, batchUpsertIcons, deleteIcons, getClient
} from './supabase-sync.js';
import { useSupabase } from './supabase-sync.js';
import { setSupabaseClient, checkAdminPassword, uploadTrack, fetchUploadedTracks, subscribeUploadedTracks } from './uploads.js';
import { SOCIAL_LINKS } from './links-manifest.js';

const LIMEWIRE_REDIRECT = "https://untitled.stream/library/project/s8sfC4czG3QgWt43XpV1g";

const iconsLayer = document.getElementById('icons-layer');
const trashCan = document.getElementById('trash-can');
const activeAppTitle = document.getElementById('menu-active-app');
const hintArrow = document.getElementById('hint-arrow');

let isDragging = false, activeEl = null, dragOffset = { x: 0, y: 0 }, dragStartTime = 0, totalMoved = 0;
let idleTimer = null, hintIndex = 0;

// window.innerWidth/innerHeight can briefly report 0 before the viewport's first layout pass
// (observed in embedded preview panes) — fall back to clientWidth/Height, then a sane default,
// so desktop icons never get positioned off-screen.
function getViewportWidth() {
    return window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth || 1280;
}
function getViewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 800;
}

async function startApp() {
    await initSupabase();
    document.getElementById('loading-overlay').style.display = 'none';
    await loadDesktop();
    initializeUI();

    if (useSupabase) {
        setSupabaseClient(getClient());
        const uploaded = await fetchUploadedTracks();
        addUploadedTracks(uploaded);
        subscribeUploadedTracks((track) => addUploadedTracks([track]));
    }
}

function initializeUI() {
    initPlayer();
    refreshAllViews();
    renderPhotos();
    renderFinderLinks();
    initStickGame();
    setupTerminalDate();
    resetIdleTimer();
    initTerminalInteractive();
}

function renderFinderLinks() {
    const el = document.getElementById('finder-about-links');
    if (!el) return;
    el.innerHTML = SOCIAL_LINKS.map(link => `
        <a class="finder-link-row" href="${link.url}" target="_blank" rel="noopener">
            <span class="finder-link-icon" style="background:${link.color}">${link.icon}</span>
            <span class="finder-link-label">${link.label}</span>
        </a>`).join('');
}

if (activeAppTitle) {
    activeAppTitle.style.cursor = 'pointer';
    activeAppTitle.onclick = (e) => {
        window.openApp('finder-about-window');
        e.stopPropagation();
    };
}

startApp();

window.resetIdleTimer = () => {
    clearTimeout(idleTimer);
    if (hintArrow) hintArrow.style.opacity = '0';
    idleTimer = setTimeout(showAssistance, 10000);
};

function showAssistance() {
    const targets = [
        { id: 'main-folder', msg: 'Open the GREY project folder on your desktop.' },
        { id: 'dock-music', msg: 'Listen to the exclusive unreleased master of MUD GREY 4.' },
        { id: 'dock-limewire', msg: 'Unlock the LimeWire secure vault. Clue: "We put in overtime..."' },
        { id: 'info-window', msg: 'Launch the Terminal command utility for system status logs.' }
    ];

    const target = targets[hintIndex % targets.length];
    const targetEl = document.querySelector(`[data-id="${target.id}"]`) || document.getElementById(target.id);

    if (targetEl && hintArrow) {
        const rect = targetEl.getBoundingClientRect();
        hintArrow.style.left = (rect.left + rect.width / 2 - 9) + 'px';
        hintArrow.style.top = (rect.top - 25) + 'px';
        hintArrow.style.opacity = '0.4';
        hintArrow.classList.add('floating');
        logTerminal(`Assistant Log: ${target.msg}`);
    }
    hintIndex++;
}

function logTerminal(msg) {
    const history = document.getElementById('terminal-history');
    if (!history) return;
    const div = document.createElement('div');
    div.className = "text-white opacity-60 mt-1";
    div.textContent = "> " + msg;
    history.appendChild(div);
    const body = document.getElementById('terminal-body-click');
    if (body) body.scrollTop = body.scrollHeight;
}
window.logTerminal = logTerminal;

function initTerminalInteractive() {
    const hiddenInput = document.getElementById('terminal-hidden-input');
    const inputDisplay = document.getElementById('terminal-input-display');
    const terminalClickArea = document.getElementById('terminal-body-click');
    if (!hiddenInput || !inputDisplay || !terminalClickArea) return;

    terminalClickArea.onclick = () => hiddenInput.focus();

    hiddenInput.oninput = () => {
        inputDisplay.textContent = hiddenInput.value;
    };

    hiddenInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const cmd = hiddenInput.value.trim().toLowerCase();
            hiddenInput.value = "";
            inputDisplay.textContent = "";
            executeTerminalCommand(cmd);
        }
    };
}

function executeTerminalCommand(fullCmd) {
    const history = document.getElementById('terminal-history');
    if (!history) return;
    const cmdLine = document.createElement('div');
    cmdLine.className = "text-white opacity-70 mt-2";
    cmdLine.textContent = "$ " + fullCmd;
    history.appendChild(cmdLine);

    const response = document.createElement('div');
    response.className = "text-green-400 font-bold ml-2";

    const args = fullCmd.split(' ');
    const primary = args[0];

    switch (primary) {
        case 'help':
            response.innerHTML = `Available commands:<br>
              - <span class='text-white'>system</span> : Check OS specifications and status<br>
              - <span class='text-white'>vault</span>  : Check lock and retrieve secure hints<br>
              - <span class='text-white'>music</span>  : Trigger playback of the current track<br>
              - <span class='text-white'>clear</span>  : Purge historical console lines`;
            break;
        case 'system':
            response.innerHTML = `System: LevyGrey OS v1.2<br>
              Memory Snaps: Synchronized (${useSupabase ? 'Supabase' : 'Local'} Engine Active)<br>
              Visualizer Buffer: Web Audio AnalyserNode online`;
            break;
        case 'vault':
            response.innerHTML = `Secure storage: LOCKED.<br>
              Lock Hint: "We put in overtime..."`;
            break;
        case 'music':
            window.toggleAudio();
            response.innerHTML = `Audio command dispatched to preview module.`;
            break;
        case 'clear':
            history.innerHTML = "<div>Console buffer cleared. Type 'help' for diagnostics.</div>";
            response.innerHTML = "";
            break;
        default:
            response.className = "text-red-500 ml-2";
            response.textContent = `Command '${primary}' not mapped. Type 'help' for support.`;
    }

    if (response.innerHTML || response.textContent) {
        history.appendChild(response);
    }
    const body = document.getElementById('terminal-body-click');
    if (body) body.scrollTop = body.scrollHeight;
}

window.openApp = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    el.style.zIndex = 5000 + (Date.now() % 1000);
    const name = id.split('-')[0];
    if (activeAppTitle) {
        activeAppTitle.textContent = name === 'limewire' ? 'LimeWire' : name.charAt(0).toUpperCase() + name.slice(1);
    }
    const dot = document.getElementById(`dot-${name}`);
    if (dot) dot.style.display = 'block';
    logTerminal(`Console: Loaded module '${name}'`);

    if (id === 'music-window') {
        drawVisualizer();
    }
};

window.closeApp = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
    if (activeAppTitle) activeAppTitle.textContent = "Finder";
    const name = id.split('-')[0];
    const dot = document.getElementById(`dot-${name}`);
    if (dot) dot.style.display = 'none';
    if (id === 'music-window') {
        stopAudio();
        stopVisualizer();
    }
};

function toRemoteFields(data) {
    return { name: data.name, type: data.type, top: data.top, left: data.left, is_main: !!data.isMain };
}
function fromRemoteRow(r) {
    return { name: r.name, type: r.type, top: r.top, left: r.left, isMain: r.is_main };
}

function renderIconsFromStore() {
    const currentIds = [];
    Object.keys(dbShield.store.desktop_icons).forEach(id => {
        const data = dbShield.store.desktop_icons[id];
        currentIds.push(id);
        let node = document.querySelector(`[data-id="${id}"]`);
        if (!node) {
            node = document.createElement('div');
            node.className = `desktop-icon ${data.isMain ? 'main-folder' : 'chaos-item'}`;
            node.dataset.id = id;
            node.style.top = data.top + 'px';
            node.style.left = data.left + 'px';
            node.innerHTML = `
                <div class="w-[50px] h-[45px] flex items-center justify-center">
                    ${data.type === 'folder' ? getFolderSVG() : getMp3SVG()}
                </div>
                <div class="icon-name">${data.name}</div>
            `;
            setupDrag(node, node);
            iconsLayer.appendChild(node);
        } else if (activeEl !== node) {
            node.style.top = data.top + 'px';
            node.style.left = data.left + 'px';
        }
    });
    Array.from(iconsLayer.children).forEach(n => { if (!currentIds.includes(n.dataset.id)) n.remove(); });
}

function ensureMainFolder() {
    if (dbShield.store.desktop_icons['main-folder']) return false;
    const isMobile = getViewportWidth() < 640;
    const offset = isMobile ? 80 : 110;
    dbShield.store.desktop_icons['main-folder'] = {
        name: "LevyGrey - GREY (Unmixed)", type: "folder",
        top: 80, left: getViewportWidth() - offset, isMain: true
    };
    dbShield.save();
    return true;
}

async function loadDesktop() {
    if (useSupabase) {
        const rows = await fetchDesktopIcons();
        if (rows) {
            dbShield.store.desktop_icons = {};
            rows.forEach(r => { dbShield.store.desktop_icons[r.id] = fromRemoteRow(r); });
            dbShield.save();
        }
    }
    const created = ensureMainFolder();
    renderIconsFromStore();
    if (created && useSupabase) {
        const main = dbShield.store.desktop_icons['main-folder'];
        await upsertIcon('main-folder', toRemoteFields(main));
    }
    if (useSupabase) {
        subscribeDesktopIcons(handleRealtimeChange);
    }
}

function handleRealtimeChange(payload) {
    if (payload.eventType === 'DELETE') {
        delete dbShield.store.desktop_icons[payload.old.id];
    } else {
        const r = payload.new;
        dbShield.store.desktop_icons[r.id] = fromRemoteRow(r);
    }
    dbShield.save();
    renderIconsFromStore();
}

window.alignGrid = async () => {
    const items = Array.from(document.querySelectorAll('.chaos-item'));
    const colWidth = 100;
    const rowHeight = 90;
    const startX = 20;
    const startY = 60;
    const cols = Math.floor(getViewportWidth() / colWidth);

    const updates = [];
    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const top = startY + r * rowHeight;
        const left = startX + c * colWidth;
        item.style.top = top + 'px';
        item.style.left = left + 'px';

        if (dbShield.store.desktop_icons[item.dataset.id]) {
            dbShield.store.desktop_icons[item.dataset.id].top = top;
            dbShield.store.desktop_icons[item.dataset.id].left = left;
        }
        updates.push({ id: item.dataset.id, fields: { top, left } });
    }
    dbShield.save();
    if (useSupabase) await batchUpsertIcons(updates);
    logTerminal(`Cleaned up desktop layout.`);
};

const alignGridBtn = document.getElementById('menu-align-grid');
if (alignGridBtn) alignGridBtn.onclick = window.alignGrid;

window.addEventListener('mousemove', handleMove);
window.addEventListener('touchmove', handleMove, { passive: false });
window.addEventListener('mouseup', handleEnd);
window.addEventListener('touchend', handleEnd);

function handleMove(e) {
    if (!isDragging || !activeEl) return;
    const p = e.touches ? e.touches[0] : e;

    let x = p.clientX - dragOffset.x;
    let y = p.clientY - dragOffset.y;

    const minX = 5;
    const maxX = getViewportWidth() - activeEl.offsetWidth - 5;
    const minY = 35;
    const maxY = getViewportHeight() - 100;

    x = Math.max(minX, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));

    activeEl.style.left = x + 'px';
    activeEl.style.top = y + 'px';
    totalMoved++;
}

async function handleEnd(e) {
    if (!isDragging || !activeEl) return;
    const duration = Date.now() - dragStartTime;
    const threshold = (e && e.type === 'touchend') ? 12 : 5;

    if (activeEl.classList.contains('desktop-icon')) {
        if (totalMoved < threshold && duration < 350 && activeEl.dataset.id === 'main-folder') {
            const newItems = [];
            TRACKS.forEach(t => {
                const localId = crypto.randomUUID();
                const top = 80 + Math.random() * (getViewportHeight() - 300);
                const left = 30 + Math.random() * (getViewportWidth() - 120);
                const itemData = { name: t.title + ".mp3", type: "mp3", top: Math.floor(top), left: Math.floor(left), isMain: false };
                dbShield.store.desktop_icons[localId] = itemData;
                newItems.push({ id: localId, data: itemData });
            });
            dbShield.save();
            renderIconsFromStore();
            logTerminal(`Console: Generated album tracks. Files accumulated on Desktop.`);

            if (useSupabase) {
                await batchUpsertIcons(newItems.map(i => ({ id: i.id, fields: toRemoteFields(i.data) })));
            }
        } else if (totalMoved >= threshold) {
            const topVal = parseInt(activeEl.style.top);
            const leftVal = parseInt(activeEl.style.left);

            if (dbShield.store.desktop_icons[activeEl.dataset.id]) {
                dbShield.store.desktop_icons[activeEl.dataset.id].top = topVal;
                dbShield.store.desktop_icons[activeEl.dataset.id].left = leftVal;
                dbShield.save();
            }
            if (useSupabase) {
                await upsertIcon(activeEl.dataset.id, { top: topVal, left: leftVal });
            }
        }
    }
    isDragging = false; activeEl = null;
}

function setupDrag(handle, target) {
    const start = (e) => {
        isDragging = true; activeEl = target; totalMoved = 0; dragStartTime = Date.now();
        const p = e.touches ? e.touches[0] : e;
        dragOffset = { x: p.clientX - target.offsetLeft, y: p.clientY - target.offsetTop };
        // Desktop icons must never outrank windows (base z-index 5000, up to 8000+ while
        // dragged) — give icons a much lower bump range so a window dragged over an icon
        // always stays on top of it.
        target.style.zIndex = target.classList.contains('desktop-icon')
            ? 100 + (Date.now() % 100)
            : 8000 + (Date.now() % 1000);
        e.stopPropagation();
    };
    handle.onmousedown = handle.ontouchstart = start;
}

const MIN_WINDOW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 220;

function setupResize(handle, windowEl) {
    const start = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const p = e.touches ? e.touches[0] : e;
        const startX = p.clientX, startY = p.clientY;
        const startWidth = windowEl.offsetWidth;
        const startHeight = windowEl.offsetHeight;
        // Free resize needs to escape the initial max-width/max-height caps.
        windowEl.style.maxWidth = 'none';
        windowEl.style.maxHeight = 'none';
        windowEl.style.zIndex = 8000 + (Date.now() % 1000);

        const move = (ev) => {
            const mp = ev.touches ? ev.touches[0] : ev;
            const maxAllowedWidth = getViewportWidth() - windowEl.offsetLeft - 10;
            const maxAllowedHeight = getViewportHeight() - windowEl.offsetTop - 10;
            const newWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(startWidth + (mp.clientX - startX), maxAllowedWidth));
            const newHeight = Math.max(MIN_WINDOW_HEIGHT, Math.min(startHeight + (mp.clientY - startY), maxAllowedHeight));
            windowEl.style.width = newWidth + 'px';
            windowEl.style.height = newHeight + 'px';
        };
        const end = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('touchmove', move);
            window.removeEventListener('mouseup', end);
            window.removeEventListener('touchend', end);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('mouseup', end);
        window.addEventListener('touchend', end);
    };
    handle.onmousedown = handle.ontouchstart = start;
}

document.querySelectorAll('.resize-handle').forEach(h => {
    const windowEl = h.closest('.mac-window');
    if (windowEl) setupResize(h, windowEl);
});

function getFolderSVG() {
    return `
        <svg viewBox="0 0 24 24" class="w-full h-full text-[#61b3e7] fill-current filter drop-shadow">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
    `;
}

function getMp3SVG() {
    return `
        <div class="relative w-full h-[48px] flex items-center justify-center">
            <svg viewBox="0 0 24 24" class="w-[34px] h-[48px] text-zinc-100 fill-current filter drop-shadow">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
            </svg>
            <span class="absolute text-[10px] font-black text-red-500" style="bottom: 10px;">&#9835;</span>
        </div>
    `;
}

document.querySelectorAll('.window-header').forEach(h => setupDrag(h, h.parentElement));

const menuFileTrigger = document.getElementById('menu-file-trigger');
if (menuFileTrigger) {
    menuFileTrigger.onclick = (e) => {
        const m = document.getElementById('file-menu');
        if (m) m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
        e.stopPropagation();
    };
}

document.addEventListener('mousedown', (e) => {
    const m = document.getElementById('file-menu');
    if (!m || m.style.display !== 'flex') return;
    if (m.contains(e.target) || (menuFileTrigger && menuFileTrigger.contains(e.target))) return;
    m.style.display = 'none';
});
document.addEventListener('touchstart', (e) => {
    const m = document.getElementById('file-menu');
    if (!m || m.style.display !== 'flex') return;
    if (m.contains(e.target) || (menuFileTrigger && menuFileTrigger.contains(e.target))) return;
    m.style.display = 'none';
});

const unlockBtn = document.getElementById('unlock-btn');
if (unlockBtn) {
    unlockBtn.onclick = () => {
        const pinInput = document.getElementById('pincode-input');
        const pin = pinInput ? pinInput.value.toLowerCase().trim() : "";
        if (pin === "5thquarter") {
            window.open(LIMEWIRE_REDIRECT, '_blank');
            window.closeApp('limewire-auth');
        } else {
            const w = document.getElementById('limewire-auth');
            if (w) {
                w.style.transform = 'translateX(-52%)';
                setTimeout(() => w.style.transform = 'translateX(-48%)', 50);
                setTimeout(() => w.style.transform = 'translateX(-50%)', 100);
            }
        }
    };
}

const uploadUnlockBtn = document.getElementById('upload-unlock-btn');
if (uploadUnlockBtn) {
    uploadUnlockBtn.onclick = () => {
        const pinInput = document.getElementById('upload-pincode-input');
        if (checkAdminPassword(pinInput ? pinInput.value : "")) {
            document.getElementById('upload-gate').classList.add('hidden');
            document.getElementById('upload-form').classList.remove('hidden');
            refreshAllViews(); // reveal delete buttons across the Music app now that admin is unlocked
        } else {
            const w = document.getElementById('upload-window');
            if (w) {
                w.style.transform = 'translateX(-52%)';
                setTimeout(() => w.style.transform = 'translateX(-48%)', 50);
                setTimeout(() => w.style.transform = 'translateX(-50%)', 100);
            }
        }
    };
}

const uploadSubmitBtn = document.getElementById('upload-submit-btn');
if (uploadSubmitBtn) {
    uploadSubmitBtn.onclick = async () => {
        const fileInput = document.getElementById('upload-file-input');
        const titleInput = document.getElementById('upload-title-input');
        const status = document.getElementById('upload-status');
        const file = fileInput && fileInput.files[0];

        if (!file) {
            if (status) status.textContent = 'Choose an audio file first.';
            return;
        }
        if (!useSupabase) {
            if (status) status.textContent = 'Backend not connected — uploads need Supabase configured.';
            return;
        }

        uploadSubmitBtn.disabled = true;
        if (status) status.textContent = 'Uploading...';
        try {
            const track = await uploadTrack(file, titleInput ? titleInput.value.trim() : "");
            addUploadedTracks([track]);
            if (status) status.textContent = `Uploaded "${track.title}" — it's now in the tracklist.`;
            if (fileInput) fileInput.value = "";
            if (titleInput) titleInput.value = "";
            logTerminal(`Console: New track uploaded — "${track.title}".`);
        } catch (e) {
            console.warn('Upload failed:', e);
            if (status) status.textContent = 'Upload failed. See console for details.';
        } finally {
            uploadSubmitBtn.disabled = false;
        }
    };
}

function renderPhotos() {
    const el = document.getElementById('photos-content');
    if (!el) return;
    el.innerHTML = PHOTOS.map(p => `
        <div class="photo-card">
            ${p.type === 'video'
                ? `<video src="${p.src}" muted loop playsinline controls preload="metadata"></video>`
                : `<img src="${p.src}" alt="${p.label}">`}
            <div class="photo-label uppercase">${p.label}</div>
        </div>`).join('');
}

function updateClock() {
    const clockEl = document.getElementById('clock');
    if (!clockEl) return;
    const opt = { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    clockEl.textContent = new Intl.DateTimeFormat('en-US', opt).format(new Date()).replace(',', '');
}
function setupTerminalDate() {
    const opt = { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    const date = new Intl.DateTimeFormat('en-US', opt).format(new Date());
    const display = document.getElementById('terminal-last-login');
    if (display) display.textContent = date;
}
setInterval(updateClock, 1000); updateClock();

if (trashCan) {
    trashCan.onclick = async () => {
        const items = Array.from(document.querySelectorAll('.chaos-item'));
        const ids = items.map(i => i.dataset.id);
        items.forEach(c => c.remove());

        const mainFolderData = dbShield.store.desktop_icons['main-folder'];
        dbShield.store.desktop_icons = mainFolderData ? { 'main-folder': mainFolderData } : {};
        dbShield.save();

        if (useSupabase) await deleteIcons(ids);
        logTerminal(`Trash emptied.`);
    };
}
