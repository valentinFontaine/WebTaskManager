/**
 * tw-web shared chrome — two-bar responsive layout.
 * Inject with: <script src="/nav.js"></script> in <head> (synchronous).
 *
 * Bar 1 (nav-bar): [logo→menu] [Task(warrior)→refresh] List Kanban Day Planner Calendar
 *                  | [filter..][×] [pri..][×] [project..][×] [tags..][×] [count/total][+]
 * Bar 2 (btn-bar): [ctx buttons]  |  [Pending] [Recurring] [Waiting] [Completed] [Deleted]
 * Bar 3 (filter-bar): active filter summary — hidden when nothing active
 *
 * Side menu (logo click): Contexts · Projects · Tags · Stats · Settings · Sync
 *
 * Public API:  window.twNav.getState()
 *              window.twNav.setState(patch, {clientOnly})
 *              window.twNav.stateToParams(state?)
 *              window.twNav.setCount(filtered, total)
 */
(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────────────
    const BREAK    = 860;            // px — stack bars AND shorten brand name
    const DEBOUNCE = 400;            // ms — filter input debounce

    const STATE_KEY    = 'tw-nav-state';
    const CTX_KEY      = 'tw-contexts';
    const CTX_FILT_KEY = 'tw-ctx-filters';
    const COUNT_KEY    = 'tw-count-text';

    const PAGES = [
        { id: 'tasks',    href: '/',                      label: 'List'       },
        { id: 'kanban',   href: '/kanban.html',           label: 'Kanban'     },
        { id: 'agenda',   href: '/agenda.html',            label: 'Agenda'     },
        { id: 'calendar', href: '/calendar-planner.html', label: 'Calendar'   },
    ];

    const STATUS_BTNS = [
        { id: 'pending',   label: 'Pending'   },
        { id: 'recurring', label: 'Recurring' },
        { id: 'waiting',   label: 'Waiting'   },
        { id: 'completed', label: 'Completed' },
        { id: 'deleted',   label: 'Deleted'   },
    ];

    const MENU_ITEMS = ['Contexts', 'Projects', 'Tags', 'Stats', 'Settings', 'Sync'];

    // ── State ─────────────────────────────────────────────────────────────────
    function defaultState() {
        return { statuses: ['pending'], filter: '', context: '', priority: '', project: '', tags: '' };
    }
    function getState() {
        try { return Object.assign(defaultState(), JSON.parse(localStorage.getItem(STATE_KEY))); }
        catch { return defaultState(); }
    }
    function setState(patch, { clientOnly = false } = {}) {
        const next = Object.assign({}, getState(), patch);
        localStorage.setItem(STATE_KEY, JSON.stringify(next));
        _applyState(next);
        _updateFilterBar(next);
        document.dispatchEvent(new CustomEvent('tw-filter-change', { detail: { ...next, clientOnly } }));
    }
    function stateToParams(state) {
        state = state || getState();
        const p = new URLSearchParams();
        if (state.statuses && state.statuses.length) p.set('status', state.statuses.join(','));
        if (state.context) p.set('context', state.context);
        // filter / priority / project / tags — applied client-side, not sent to server
        return p.toString();
    }
    function setCount(filtered, total) {
        const text = filtered === total ? String(total) : `${filtered}/${total}`;
        const el = document.getElementById('tw-count');
        if (el) el.textContent = text;
        try { sessionStorage.setItem(COUNT_KEY, text); } catch {}
    }

    window.twNav = { getState, setState, stateToParams, setCount };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function activePage() {
        const p = window.location.pathname;
        if (p.endsWith('kanban.html'))           return 'kanban';
        if (p.endsWith('agenda.html'))           return 'agenda';
        if (p.endsWith('calendar-planner.html')) return 'calendar';
        return 'tasks';
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function ss(key, val) {
        try {
            if (val !== undefined) sessionStorage.setItem(key, JSON.stringify(val));
            else return JSON.parse(sessionStorage.getItem(key));
        } catch { return null; }
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    const CSS = `
#tw-nav-bar {
    display: flex; justify-content: space-between; align-items: center;
    height: 50px; padding: 0 14px 0 0; background: #1a1a1a;
    position: sticky; top: 0; z-index: 9999;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4); gap: 8px; box-sizing: border-box;
}
#tw-btn-bar {
    display: flex; justify-content: space-between; align-items: center;
    height: 50px; padding: 0 14px; background: #2c3e50;
    gap: 12px; box-sizing: border-box;
}
.tw-bar-left  { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.tw-bar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 1; }

/* logo button → opens side menu */
.tw-logo-btn {
    background: none; border: none; cursor: pointer; padding: 0;
    flex-shrink: 0; display: flex; align-items: center;
}
.tw-logo-btn:hover { opacity: 0.8; }
.tw-logo { height: 50px; width: 50px; display: block; }
.tw-logo.sync-pending { filter: sepia(1) saturate(6) hue-rotate(5deg) brightness(1.15); }
.tw-menu-item.sync-pending { color: #f0b429 !important; }

/* brand name button → refresh */
#tw-brand-refresh {
    background: none; border: none; color: #fff; font-weight: 600; font-size: 18px;
    white-space: nowrap; opacity: 0.9; flex-shrink: 0; margin-right: 4px; cursor: pointer; padding: 0;
}
#tw-brand-refresh:hover { opacity: 1; }
@keyframes tw-blink { 0%,100%{opacity:1} 35%{opacity:0.1} 65%{opacity:0.1} }
#tw-brand-refresh.blinking { animation: tw-blink 0.45s ease; }
.tw-name-short { display: none; }

/* nav links */
.tw-nav-link {
    padding: 3px 9px; border-radius: 4px; text-decoration: none;
    color: rgba(255,255,255,0.75); font-size: 14px; white-space: nowrap;
}
.tw-nav-link:hover  { background: rgba(255,255,255,0.12); color: #fff; }
.tw-nav-link.active { background: #3498db; color: #fff; }

/* filter inputs */
.tw-filter-wrap {
    display: flex; align-items: center;
    background: rgba(255,255,255,0.1); border-radius: 4px; padding: 0 6px; gap: 3px;
}
.tw-filter-wrap:focus-within { background: rgba(255,255,255,0.18); }
.tw-filter-wrap input {
    background: transparent; border: none; outline: none;
    color: #fff; font-size: 13px; padding: 5px 0;
}
.tw-filter-wrap input::placeholder { color: rgba(255,255,255,0.35); }
#tw-filter-input  { width: 90px;  min-width: 28px; }
#tw-pri-input     { width: 42px;  min-width: 20px; }
#tw-project-input { width: 80px;  min-width: 28px; }
#tw-tags-input    { width: 70px;  min-width: 28px; }
.tw-inp-clear {
    background: none; border: none; color: rgba(255,255,255,0.4);
    cursor: pointer; font-size: 14px; padding: 0 1px; line-height: 1; display: none;
}
.tw-inp-clear.vis { display: block; }
.tw-inp-clear:hover { color: #fff; }

/* count + add — single clickable unit */
#tw-add-area {
    display: flex; align-items: center; gap: 5px; cursor: pointer; flex-shrink: 0;
}
.tw-count {
    color: rgba(255,255,255,0.7); font-size: 18px; white-space: nowrap;
    min-width: 32px; text-align: right; font-weight: 500;
}
#tw-add-area:hover .tw-count { color: #fff; }
#tw-add-btn {
    width: 28px; height: 28px; border-radius: 50%;
    background: #555; border: none; color: #fff; font-size: 22px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; padding: 0 0 1px 0; pointer-events: none;
}
#tw-add-area:hover #tw-add-btn { background: #3498db; }

/* btn-bar buttons */
.tw-ctx-btn, .tw-status-btn {
    padding: 3px 9px; border-radius: 4px; border: none; font-size: 14px;
    cursor: pointer; white-space: nowrap;
    color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.08);
}
.tw-ctx-btn:hover, .tw-status-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
.tw-ctx-btn.active   { background: #27ae60; color: #fff; }
.tw-status-btn.active { background: #3498db; color: #fff; }

/* active filter summary bar */
#tw-filter-bar {
    background: #0d1117; color: rgba(255,255,255,0.5);
    font-size: 11.5px; padding: 3px 14px;
    display: none; flex-wrap: wrap; gap: 10px; align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}
#tw-filter-bar.active { display: flex; }
.tw-fbar-item strong { color: rgba(255,255,255,0.65); font-weight: 500; }
.tw-fbar-sep { color: rgba(255,255,255,0.2); }

/* hook prompt dialog */
#tw-prompt-backdrop {
    display:none; position:fixed; inset:0;
    background:rgba(0,0,0,0.5); z-index:20001;
    align-items:center; justify-content:center;
}
#tw-prompt-backdrop.open { display:flex; }
#tw-prompt-dialog {
    background:#2c3e50; color:#ecf0f1;
    border-radius:8px; width:min(360px,92vw);
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    overflow:hidden;
}
#tw-prompt-header {
    padding:14px 16px 10px;
    border-bottom:1px solid rgba(255,255,255,0.1);
    font-size:1rem; font-weight:600;
    display:flex; align-items:center; gap:8px;
}
#tw-prompt-header .tw-prompt-icon { font-size:1.2rem; }
#tw-prompt-body { padding:14px 16px; }
#tw-prompt-question { font-size:0.95rem; margin-bottom:6px; }
#tw-prompt-context  { font-size:0.78rem; color:rgba(255,255,255,0.45); margin-bottom:14px; min-height:0; }
#tw-prompt-timer {
    height:3px; background:rgba(255,255,255,0.12); border-radius:2px; margin-bottom:14px;
}
#tw-prompt-timer-bar {
    height:100%; background:#3498db; border-radius:2px;
    transition:width 1s linear;
}
#tw-prompt-actions { display:flex; gap:8px; justify-content:flex-end; }
.tw-prompt-btn {
    padding:7px 20px; border:none; border-radius:5px;
    font-size:0.88rem; font-weight:600; cursor:pointer;
}
.tw-prompt-btn-yes  { background:#3498db; color:#fff; }
.tw-prompt-btn-yes:hover  { background:#2980b9; }
.tw-prompt-btn-no   { background:rgba(255,255,255,0.1); color:#ecf0f1; }
.tw-prompt-btn-no:hover   { background:rgba(255,255,255,0.18); }

/* side menu */
#tw-side-menu {
    position: fixed; top: 0; left: -270px; width: 260px; height: 100vh;
    background: #111; z-index: 20000; transition: left 0.22s ease;
    display: flex; flex-direction: column;
    box-shadow: 4px 0 24px rgba(0,0,0,0.6); box-sizing: border-box;
}
#tw-side-menu.open { left: 0; }
.tw-menu-header {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.1); background: #1a1a1a; flex-shrink: 0;
}
.tw-menu-header img  { height: 34px; width: 34px; }
.tw-menu-header span { color: #fff; font-size: 15px; font-weight: 600; }
.tw-menu-items { flex: 1; padding: 8px 0; overflow-y: auto; }
.tw-menu-item {
    display: block; width: 100%; text-align: left; padding: 11px 20px;
    background: none; border: none; border-left: 3px solid transparent;
    color: rgba(255,255,255,0.7); font-size: 15px; cursor: pointer;
}
.tw-menu-item:hover { background: rgba(255,255,255,0.07); color: #fff; border-left-color: #3498db; }
#tw-menu-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.4); z-index: 19999;
}
#tw-menu-backdrop.open { display: block; }

/* responsive — stack both bars at BREAK */
@media (max-width: ${BREAK}px) {
    #tw-nav-bar {
        height: auto; flex-wrap: wrap; padding: 5px 10px; gap: 4px;
    }
    #tw-btn-bar {
        height: auto; flex-wrap: wrap; padding: 5px 10px; gap: 4px;
    }
    .tw-bar-left  { flex-wrap: wrap; width: 100%; justify-content: flex-start; }
    .tw-bar-right { flex-wrap: wrap; width: 100%; justify-content: flex-end; }
    #tw-filter-input, #tw-pri-input, #tw-project-input, #tw-tags-input { width: 55px; min-width: 22px; }
    .tw-name-full  { display: none; }
    .tw-name-short { display: inline; }
}
`;

    // ── HTML builders ─────────────────────────────────────────────────────────
    function buildNavBar(active) {
        const links = PAGES.map(p =>
            `<a href="${p.href}" class="tw-nav-link${p.id === active ? ' active' : ''}">${p.label}</a>`
        ).join('');
        return (
            `<div class="tw-bar-left">` +
                `<button id="tw-logo-btn" class="tw-logo-btn" title="Menu">` +
                    `<img src="/logo.svg" alt="Menu" class="tw-logo">` +
                `</button>` +
                `<button id="tw-brand-refresh" title="Refresh">` +
                    `<span class="tw-name-full">Taskwarrior</span>` +
                    `<span class="tw-name-short">Task</span>` +
                `</button>` +
                links +
            `</div>` +
            `<div class="tw-bar-right">` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-filter-input"  type="text" placeholder="filter.."  autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-filter-clear"  title="Clear">×</button>` +
                `</div>` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-pri-input"     type="text" placeholder="pri.."     autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-pri-clear"    title="Clear">×</button>` +
                `</div>` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-project-input" type="text" placeholder="project.." autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-project-clear" title="Clear">×</button>` +
                `</div>` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-tags-input"    type="text" placeholder="tags.."    autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-tags-clear"   title="Clear">×</button>` +
                `</div>` +
                `<div id="tw-add-area" title="Add task">` +
                    `<span id="tw-count" class="tw-count"></span>` +
                    `<button id="tw-add-btn" tabindex="-1">+</button>` +
                `</div>` +
            `</div>`
        );
    }

    function buildCtxBtns(state, contexts) {
        return [
            `<button class="tw-ctx-btn${!state.context ? ' active' : ''}" data-ctx="">All</button>`,
            ...contexts.map(c =>
                `<button class="tw-ctx-btn${state.context === c ? ' active' : ''}" data-ctx="${c}">${cap(c)}</button>`)
        ].join('');
    }

    function buildBtnBar(state, contexts) {
        const statusBtns = STATUS_BTNS.map(s =>
            `<button class="tw-status-btn${state.statuses.includes(s.id) ? ' active' : ''}" data-status="${s.id}">${s.label}</button>`
        ).join('');
        return (
            `<div class="tw-bar-left"  id="tw-ctx-btns">${buildCtxBtns(state, contexts)}</div>` +
            `<div class="tw-bar-right" id="tw-status-btns">${statusBtns}</div>`
        );
    }

    // ── Filter bar ────────────────────────────────────────────────────────────
    function _updateFilterBar(state) {
        const bar = document.getElementById('tw-filter-bar');
        if (!bar) return;
        const parts = [];
        if (state.context) {
            const ctxFilters = ss(CTX_FILT_KEY) || {};
            const expr = ctxFilters[state.context];
            parts.push(`<span class="tw-fbar-item"><strong>ctx:</strong> ${esc(expr || state.context)}</span>`);
        }
        if (state.filter)   parts.push(`<span class="tw-fbar-item"><strong>filter:</strong> "${esc(state.filter)}"</span>`);
        if (state.priority) parts.push(`<span class="tw-fbar-item"><strong>pri:</strong> ${esc(state.priority)}</span>`);
        if (state.project)  parts.push(`<span class="tw-fbar-item"><strong>project:</strong> ${esc(state.project)}</span>`);
        if (state.tags)     parts.push(`<span class="tw-fbar-item"><strong>tags:</strong> ${esc(state.tags)}</span>`);
        bar.innerHTML = parts.join('<span class="tw-fbar-sep"> | </span>');
        bar.classList.toggle('active', parts.length > 0);
    }

    // ── Apply state to live DOM ───────────────────────────────────────────────
    function _applyState(state) {
        [
            ['tw-filter-input',  'tw-filter-clear',  state.filter   || ''],
            ['tw-pri-input',     'tw-pri-clear',     state.priority || ''],
            ['tw-project-input', 'tw-project-clear', state.project  || ''],
            ['tw-tags-input',    'tw-tags-clear',    state.tags     || ''],
        ].forEach(([inpId, clrId, val]) => {
            const inp = document.getElementById(inpId);
            const clr = document.getElementById(clrId);
            if (inp && inp.value !== val) inp.value = val;
            if (clr) clr.classList.toggle('vis', !!val);
        });
        document.querySelectorAll('.tw-ctx-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.ctx === state.context));
        document.querySelectorAll('.tw-status-btn').forEach(b =>
            b.classList.toggle('active', state.statuses.includes(b.dataset.status)));
    }

    // ── Side menu ─────────────────────────────────────────────────────────────
    function openMenu()  {
        document.getElementById('tw-side-menu').classList.add('open');
        document.getElementById('tw-menu-backdrop').classList.add('open');
    }
    function closeMenu() {
        document.getElementById('tw-side-menu').classList.remove('open');
        document.getElementById('tw-menu-backdrop').classList.remove('open');
    }

    // ── Event wiring ──────────────────────────────────────────────────────────
    function bindEvents() {
        function wireInput(inpId, clrId, stateKey) {
            const inp = document.getElementById(inpId);
            const clr = document.getElementById(clrId);
            if (!inp) return;
            let timer;
            inp.addEventListener('input', () => {
                clr.classList.toggle('vis', !!inp.value);
                clearTimeout(timer);
                timer = setTimeout(() => setState({ [stateKey]: inp.value }, { clientOnly: true }), DEBOUNCE);
            });
            clr.addEventListener('click', () => {
                inp.value = '';
                clr.classList.remove('vis');
                setState({ [stateKey]: '' }, { clientOnly: true });
            });
        }

        wireInput('tw-filter-input',  'tw-filter-clear',  'filter');
        wireInput('tw-pri-input',     'tw-pri-clear',     'priority');
        wireInput('tw-project-input', 'tw-project-clear', 'project');
        wireInput('tw-tags-input',    'tw-tags-clear',    'tags');

        // Logo → side menu
        document.getElementById('tw-logo-btn').addEventListener('click', openMenu);
        document.getElementById('tw-menu-backdrop').addEventListener('click', closeMenu);
        document.getElementById('tw-side-menu').addEventListener('click', e => {
            const item = e.target.closest('.tw-menu-item');
            if (!item) return;
            closeMenu();
            document.dispatchEvent(new CustomEvent('tw-menu-action', { detail: { action: item.dataset.menu } }));
        });

        // Brand text → refresh with blink
        document.getElementById('tw-brand-refresh').addEventListener('click', () => {
            const btn = document.getElementById('tw-brand-refresh');
            btn.classList.add('blinking');
            btn.addEventListener('animationend', () => btn.classList.remove('blinking'), { once: true });
            document.dispatchEvent(new CustomEvent('tw-filter-change', { detail: getState() }));
            document.dispatchEvent(new CustomEvent('tw-show-notification',
                { detail: { message: 'Refreshed', type: 'success' } }));
        });

        // Count + add area → open add dialog
        document.getElementById('tw-add-area').addEventListener('click', () =>
            document.dispatchEvent(new CustomEvent('tw-open-add')));

        // Context buttons
        document.getElementById('tw-ctx-btns').addEventListener('click', e => {
            const b = e.target.closest('.tw-ctx-btn');
            if (b) setState({ context: b.dataset.ctx });
        });

        // Status buttons
        document.getElementById('tw-status-btns').addEventListener('click', e => {
            const b = e.target.closest('.tw-status-btn');
            if (b) setState({ statuses: [b.dataset.status] });
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const state    = getState();
        const active   = activePage();
        const contexts = ss(CTX_KEY) || [];

        // Nav bar
        const navBar = document.createElement('div');
        navBar.id = 'tw-nav-bar';
        navBar.innerHTML = buildNavBar(active);

        // Button bar
        const btnBar = document.createElement('div');
        btnBar.id = 'tw-btn-bar';
        btnBar.innerHTML = buildBtnBar(state, contexts);

        // Filter summary bar (hidden until a filter is active)
        const filterBar = document.createElement('div');
        filterBar.id = 'tw-filter-bar';

        // Side menu + backdrop
        const sideMenu = document.createElement('div');
        sideMenu.id = 'tw-side-menu';
        sideMenu.innerHTML =
            `<div class="tw-menu-header">` +
                `<img src="/logo.svg" alt="">` +
                `<span>Taskwarrior</span>` +
            `</div>` +
            `<nav class="tw-menu-items">` +
                MENU_ITEMS.map(item =>
                    `<button class="tw-menu-item" data-menu="${item.toLowerCase()}">${item}</button>`
                ).join('') +
            `</nav>`;

        const backdrop = document.createElement('div');
        backdrop.id = 'tw-menu-backdrop';

        // Insert order: navBar first child → btnBar → filterBar → sideMenu → backdrop
        [backdrop, sideMenu, filterBar, btnBar, navBar].forEach(el =>
            document.body.insertBefore(el, document.body.firstChild));

        // Restore count from last visit immediately (before API returns)
        const savedCount = sessionStorage.getItem(COUNT_KEY);
        if (savedCount) {
            const el = document.getElementById('tw-count');
            if (el) el.textContent = savedCount;
        }

        _applyState(state);
        _updateFilterBar(state);
        bindEvents();

        // Sync status indicator
        pollSyncStatus();
        setInterval(pollSyncStatus, 60_000);
        window.twPollSyncStatus = pollSyncStatus;

        // Background: refresh context list, update buttons if changed
        fetchContexts().then(({ names, filters }) => {
            ss(CTX_KEY, names);
            ss(CTX_FILT_KEY, filters);
            if (JSON.stringify(names) !== JSON.stringify(contexts)) {
                const ctxDiv = document.getElementById('tw-ctx-btns');
                if (ctxDiv) ctxDiv.innerHTML = buildCtxBtns(getState(), names);
                _applyState(getState());
            }
            _updateFilterBar(getState());   // refresh with real context expressions
        });

        // Background: fetch notification timeout
        fetch('/api/config').then(r => r.json()).then(d => {
            window.twNotifTimeout = (d.notification_timeout != null) ? d.notification_timeout : 3000;
        }).catch(() => { window.twNotifTimeout = 3000; });
    }

    function updateSyncIndicator(changes) {
        const logo    = document.querySelector('.tw-logo');
        const logoBtn = document.getElementById('tw-logo-btn');
        const syncBtn = document.querySelector('.tw-menu-item[data-menu="sync"]');
        if (changes > 0) {
            logo?.classList.add('sync-pending');
            logoBtn?.setAttribute('title', `${changes} change(s) — Menu`);
            syncBtn?.classList.add('sync-pending');
            if (syncBtn) syncBtn.textContent = `Sync (${changes})`;
        } else {
            logo?.classList.remove('sync-pending');
            logoBtn?.setAttribute('title', 'Menu');
            syncBtn?.classList.remove('sync-pending');
            if (syncBtn) syncBtn.textContent = 'Sync';
        }
    }

    async function pollSyncStatus() {
        try {
            const r = await fetch('/api/sync/status');
            const d = await r.json();
            updateSyncIndicator(d.changes || 0);
        } catch {}
    }

    async function fetchContexts() {
        try {
            const r = await fetch('/api/contexts');
            const d = await r.json();
            if (d.success) return { names: d.contexts || [], filters: d.filters || {} };
        } catch {}
        return { names: [], filters: {} };
    }

    // ── Hook prompt system ────────────────────────────────────────────────────
    const _promptQueue = [];
    let   _promptActive = false;

    function _buildPromptUI() {
        if (document.getElementById('tw-prompt-backdrop')) return;
        const el = document.createElement('div');
        el.innerHTML =
            `<div id="tw-prompt-backdrop">` +
              `<div id="tw-prompt-dialog">` +
                `<div id="tw-prompt-header"><span class="tw-prompt-icon">❓</span><span id="tw-prompt-title">Hook Prompt</span></div>` +
                `<div id="tw-prompt-body">` +
                  `<div id="tw-prompt-question"></div>` +
                  `<div id="tw-prompt-context"></div>` +
                  `<div id="tw-prompt-timer"><div id="tw-prompt-timer-bar" style="width:100%"></div></div>` +
                  `<div id="tw-prompt-actions">` +
                    `<button class="tw-prompt-btn tw-prompt-btn-no"  id="tw-prompt-no">No</button>` +
                    `<button class="tw-prompt-btn tw-prompt-btn-yes" id="tw-prompt-yes">Yes</button>` +
                  `</div>` +
                `</div>` +
              `</div>` +
            `</div>`;
        document.body.appendChild(el.firstChild);
    }

    function _showNextPrompt() {
        if (_promptActive || _promptQueue.length === 0) return;
        const prompt = _promptQueue.shift();
        _promptActive = true;
        _buildPromptUI();

        document.getElementById('tw-prompt-question').textContent = prompt.question || '';
        const ctx = document.getElementById('tw-prompt-context');
        ctx.textContent = prompt.context || '';
        ctx.style.display = prompt.context ? '' : 'none';

        const isDefaultYes = (prompt.default || 'no') === 'yes';
        const yesBtn = document.getElementById('tw-prompt-yes');
        const noBtn  = document.getElementById('tw-prompt-no');
        yesBtn.style.order = isDefaultYes ? '2' : '1';
        noBtn.style.order  = isDefaultYes ? '1' : '2';

        document.getElementById('tw-prompt-backdrop').classList.add('open');

        // Countdown timer
        const timeout = (prompt.timeout || 30);
        const bar = document.getElementById('tw-prompt-timer-bar');
        bar.style.transition = 'none';
        bar.style.width = '100%';
        requestAnimationFrame(() => {
            bar.style.transition = `width ${timeout}s linear`;
            bar.style.width = '0%';
        });

        let answered = false;
        const timer = setTimeout(() => answer(prompt.default || 'no'), timeout * 1000);

        function answer(val) {
            if (answered) return;
            answered = true;
            clearTimeout(timer);
            document.getElementById('tw-prompt-backdrop').classList.remove('open');
            fetch('/api/hook-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: prompt.id, answer: val })
            }).catch(() => {});
            _promptActive = false;
            _showNextPrompt();
        }

        yesBtn.onclick = () => answer('yes');
        noBtn.onclick  = () => answer('no');
    }

    function _initSSE() {
        const es = new EventSource('/api/events');
        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'confirm') {
                    _promptQueue.push(msg);
                    _showNextPrompt();
                } else if (msg.type === 'info') {
                    document.dispatchEvent(new CustomEvent('tw-show-notification',
                        { detail: { message: msg.question, type: 'info' } }));
                }
            } catch (_) {}
        };
        es.onerror = () => {
            // Browser auto-reconnects — no action needed
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { init(); _initSSE(); });
    } else {
        init();
        _initSSE();
    }
}());
