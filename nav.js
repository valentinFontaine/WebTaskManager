/**
 * tw-web shared chrome — barre de navigation partagee par toutes les pages.
 * A inclure en synchrone dans <head> : <script src="/nav.js"></script>
 *
 * Ecrit par linuxcaffe (PR #1). Porte ici depuis sa version, en retirant tout
 * ce qui n'a pas encore de contrepartie cote serveur ou cote page :
 *
 *   - menu lateral (Contexts/Projects/Tags/Stats/Settings/Sync) : ses six
 *     entrees se contentaient d'emettre `tw-menu-action`, et seule `sync`
 *     etait traitee quelque part -- par un dialogue qui n'existe pas ici.
 *   - champs de filtre `filter` et `pri` : pas de contrepartie cote page.
 *     (`project` et `tags` sont revenus au lot 1, ainsi que la barre de
 *     resume, qui est ce qui rend l'etat persistant supportable.)
 *   - indicateur de synchronisation (`/api/sync/status`) et flux SSE
 *     (`/api/events`) : endpoints absents. Le SSE d'origine ne gerait pas
 *     l'echec, et aurait boucle en reconnexion indefiniment.
 *   - lien Agenda : la page n'existe pas encore.
 *
 * Tout cela est retire, pas reecrit : la structure d'origine est conservee
 * pour que chaque morceau puisse revenir tel quel le jour ou son support
 * existe.
 *
 * Repartition du filtrage, deliberee :
 *
 *   - `context` et `statuses` filtrent **cote serveur**. Un filtre de contexte
 *     est une expression TaskWarrior arbitraire (`+a or +b`, `project:X`,
 *     `due.before:eom`) : la reinterpreter en JavaScript ferait echouer en
 *     silence tout contexte sortant du sous-ensemble supporte.
 *   - `project` et `tags` filtrent **cote client**, a la frappe : ce sont des
 *     comparaisons litterales, et aucun aller-retour ne se justifie.
 *
 * D'ou le drapeau `clientOnly` de `tw-filter-change` : la page recharge, ou se
 * contente de re-rendre.
 *
 * API publique :  window.twNav.getState()
 *                 window.twNav.setState(patch, {clientOnly})
 *                 window.twNav.stateToParams(state?)
 *                 window.twNav.setCount(filtered, total)
 *                 window.twNav.getTags(state?)        -> tableau de tags
 *                 window.twNav.projectsReady          -> Promise<string[]>
 */
(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────────────
    const BREAK = 860;               // px — empile les barres et raccourcit le nom

    const STATE_KEY = 'tw-nav-state';
    const CTX_KEY   = 'tw-contexts';
    const PROJ_KEY  = 'tw-projects';
    const COUNT_KEY = 'tw-count-text';

    // Au-dela, les boutons de contexte debordent : on passe en liste deroulante.
    const MAX_CTX_BTNS = 5;
    // Delai anti-rebond de la saisie, en ms. Le filtrage est local, donc court.
    const SAISIE_DELAI = 150;

    const PAGES = [
        { id: 'tasks',    href: '/',                      label: 'List'     },
        { id: 'kanban',   href: '/kanban.html',           label: 'Kanban'   },
        { id: 'calendar', href: '/calendar-planner.html', label: 'Calendar' },
        { id: 'graphe',   href: '/graphe.html',           label: 'Graphe'   },
    ];

    const STATUS_BTNS = [
        { id: 'pending',   label: 'Pending'   },
        { id: 'recurring', label: 'Recurring' },
        { id: 'waiting',   label: 'Waiting'   },
        { id: 'completed', label: 'Completed' },
        { id: 'deleted',   label: 'Deleted'   },
    ];

    // ── State ─────────────────────────────────────────────────────────────────
    // La forme complete est conservee, y compris les cles des champs texte
    // retires : reactiver ces champs redeviendra un pur ajout.
    function defaultState() {
        return { statuses: ['pending'], filter: '', context: '', priority: '', project: '', tags: '' };
    }
    function getState() {
        try { return Object.assign(defaultState(), JSON.parse(localStorage.getItem(STATE_KEY))); }
        catch { return defaultState(); }
    }
    function setState(patch, { clientOnly = false } = {}) {
        const next = Object.assign({}, getState(), patch);
        try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); } catch {}
        _applyState(next);
        document.dispatchEvent(new CustomEvent('tw-filter-change', { detail: { ...next, clientOnly } }));
    }
    function stateToParams(state) {
        state = state || getState();
        const p = new URLSearchParams();
        if (state.statuses && state.statuses.length) p.set('status', state.statuses.join(','));
        if (state.context) p.set('context', state.context);
        return p.toString();
    }
    function setCount(filtered, total) {
        const text = filtered === total ? String(total) : `${filtered}/${total}`;
        const el = document.getElementById('tw-count');
        if (el) el.textContent = text;
        try { sessionStorage.setItem(COUNT_KEY, text); } catch {}
    }

    // Les tags sont saisis en une chaine separee par des virgules, et
    // conserves tels quels : c'est ce que l'utilisateur relit dans le champ.
    // La conversion en tableau appartient donc a nav, pas a chaque page.
    function getTags(state) {
        state = state || getState();
        return String(state.tags || '')
            .split(',').map(t => t.trim()).filter(Boolean);
    }

    window.twNav = { getState, setState, stateToParams, setCount, getTags,
                     projectsReady: Promise.resolve([]) };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function activePage() {
        const p = window.location.pathname;
        if (p.endsWith('kanban.html'))           return 'kanban';
        if (p.endsWith('calendar-planner.html')) return 'calendar';
        if (p.endsWith('graphe.html'))           return 'graphe';
        return 'tasks';
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

.tw-logo { height: 50px; width: 50px; display: block; flex-shrink: 0; }

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
.tw-ctx-btn.active    { background: #27ae60; color: #fff; }
.tw-status-btn.active { background: #3498db; color: #fff; }

/* filter bar — troisieme rangee : saisie libre + resume */
#tw-filter-bar {
    display: flex; justify-content: space-between; align-items: center;
    min-height: 38px; padding: 4px 14px; background: #34495e;
    gap: 12px; box-sizing: border-box;
}
.tw-filter-input {
    padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.25);
    background: rgba(255,255,255,0.10); color: #fff; font-size: 14px;
    min-width: 0; width: 200px;
}
.tw-filter-input::placeholder { color: rgba(255,255,255,0.45); }
.tw-filter-input:focus {
    outline: none; border-color: #3498db; background: rgba(255,255,255,0.18);
}
.tw-ctx-select {
    padding: 3px 9px; border-radius: 4px; border: none; font-size: 14px;
    cursor: pointer; color: #fff; background: #27ae60;
}
.tw-filter-summary {
    color: rgba(255,255,255,0.85); font-size: 13px; font-style: italic;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#tw-clear-filters {
    padding: 3px 9px; border-radius: 4px; border: none; font-size: 13px;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    color: #fff; background: #c0392b;
}
#tw-clear-filters:hover { background: #e74c3c; }

/* responsive — stack both bars at BREAK */
@media (max-width: ${BREAK}px) {
    #tw-nav-bar {
        height: auto; flex-wrap: wrap; padding: 5px 10px; gap: 4px;
    }
    #tw-btn-bar {
        height: auto; flex-wrap: wrap; padding: 5px 10px; gap: 4px;
    }
    #tw-filter-bar {
        flex-wrap: wrap; padding: 5px 10px; gap: 4px;
    }
    .tw-filter-input { width: 100%; }
    .tw-bar-left  { flex-wrap: wrap; width: 100%; justify-content: flex-start; }
    .tw-bar-right { flex-wrap: wrap; width: 100%; justify-content: flex-end; }
    .tw-name-full  { display: none; }
    .tw-name-short { display: inline; }
}
`;

    // ── HTML builders ─────────────────────────────────────────────────────────
    function buildNavBar(active) {
        const links = PAGES.map(p =>
            `<a href="${p.href}" class="tw-nav-link${p.id === active ? ' active' : ''}">${esc(p.label)}</a>`
        ).join('');
        return (
            `<div class="tw-bar-left">` +
                `<img src="/logo.svg" alt="" class="tw-logo">` +
                `<button id="tw-brand-refresh" title="Refresh">` +
                    `<span class="tw-name-full">Taskwarrior</span>` +
                    `<span class="tw-name-short">Task</span>` +
                `</button>` +
                links +
            `</div>` +
            `<div class="tw-bar-right">` +
                `<div id="tw-add-area" title="Add task">` +
                    `<span id="tw-count" class="tw-count"></span>` +
                    `<button id="tw-add-btn" tabindex="-1">+</button>` +
                `</div>` +
            `</div>`
        );
    }

    // Au-dela de MAX_CTX_BTNS, les boutons deborderaient la barre : liste
    // deroulante. Les deux rendus partagent la meme valeur d'etat, donc rien
    // d'autre dans le fichier n'a a savoir lequel est affiche.
    function buildCtxWidget(state, contexts) {
        if (contexts.length > MAX_CTX_BTNS) {
            const opts = [`<option value="">All</option>`].concat(contexts.map(c =>
                `<option value="${esc(c)}">${esc(cap(c))}</option>`));
            return `<select id="tw-ctx-select" class="tw-ctx-select">${opts.join('')}</select>`;
        }
        return [
            `<button class="tw-ctx-btn${!state.context ? ' active' : ''}" data-ctx="">All</button>`,
            ...contexts.map(c =>
                `<button class="tw-ctx-btn${state.context === c ? ' active' : ''}" data-ctx="${esc(c)}">${esc(cap(c))}</button>`)
        ].join('');
    }

    function buildFilterBar() {
        return (
            `<div class="tw-bar-left">` +
                `<input type="text" id="tw-project" class="tw-filter-input" ` +
                    `placeholder="Projet" list="tw-project-list" autocomplete="off">` +
                `<datalist id="tw-project-list"></datalist>` +
                `<input type="text" id="tw-tags" class="tw-filter-input" ` +
                    `placeholder="Tags, separes par des virgules" autocomplete="off">` +
            `</div>` +
            `<div class="tw-bar-right">` +
                `<span id="tw-filter-summary" class="tw-filter-summary" hidden></span>` +
                `<button id="tw-clear-filters" hidden>Tout effacer</button>` +
            `</div>`
        );
    }

    function remplirProjets(noms) {
        const liste = document.getElementById('tw-project-list');
        if (!liste) return;
        liste.innerHTML = (noms || []).filter(Boolean)
            .map(n => `<option value="${esc(n)}"></option>`).join('');
    }

    function buildBtnBar(state, contexts) {
        const statusBtns = STATUS_BTNS.map(s =>
            `<button class="tw-status-btn${state.statuses.includes(s.id) ? ' active' : ''}" data-status="${s.id}">${s.label}</button>`
        ).join('');
        return (
            `<div class="tw-bar-left"  id="tw-ctx-btns">${buildCtxWidget(state, contexts)}</div>` +
            `<div class="tw-bar-right" id="tw-status-btns">${statusBtns}</div>`
        );
    }

    // ── Apply state to live DOM ───────────────────────────────────────────────
    function _applyState(state) {
        document.querySelectorAll('.tw-ctx-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.ctx === state.context));
        const liste = document.getElementById('tw-ctx-select');
        if (liste && liste.value !== state.context) liste.value = state.context;
        document.querySelectorAll('.tw-status-btn').forEach(b =>
            b.classList.toggle('active', state.statuses.includes(b.dataset.status)));

        // Ne reecrire un champ que s'il differe : sinon le curseur saute a la
        // fin a chaque frappe, puisque setState repasse par ici.
        const proj = document.getElementById('tw-project');
        if (proj && proj.value !== state.project) proj.value = state.project || '';
        const tags = document.getElementById('tw-tags');
        if (tags && tags.value !== state.tags) tags.value = state.tags || '';

        _applySummary(state);
    }

    // L'etat vit dans localStorage : il survit a la fermeture de l'onglet. Un
    // filtre pose la veille tronquerait la liste le lendemain sans la moindre
    // trace visible -- d'ou ce resume, et le bouton qui va avec.
    //
    // Les statuts en sont absents : leurs cinq boutons sont toujours a l'ecran,
    // et `pending` est le defaut.
    function _applySummary(state) {
        const resume = document.getElementById('tw-filter-summary');
        const bouton = document.getElementById('tw-clear-filters');
        if (!resume || !bouton) return;
        const bouts = [];
        if (state.context) bouts.push('contexte ' + cap(state.context));
        if (state.project) bouts.push('projet ' + state.project);
        if (state.tags)    bouts.push('tags ' + state.tags);
        resume.textContent = bouts.length ? 'Filtre par ' + bouts.join(' \u00b7 ') : '';
        resume.hidden = bouton.hidden = bouts.length === 0;
    }

    // ── Event wiring ──────────────────────────────────────────────────────────
    function bindEvents() {
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

        // Contextes : boutons ou liste deroulante selon leur nombre. Les deux
        // passent par le meme conteneur, et `change` remonte, donc un seul
        // couple d'ecouteurs suffit.
        const ctxDiv = document.getElementById('tw-ctx-btns');
        ctxDiv.addEventListener('click', e => {
            const b = e.target.closest('.tw-ctx-btn');
            if (b) setState({ context: b.dataset.ctx });
        });
        ctxDiv.addEventListener('change', e => {
            if (e.target.id === 'tw-ctx-select') setState({ context: e.target.value });
        });

        // Projet et tags : filtrage local, donc `clientOnly` -- la page
        // re-rend sans relancer /api/tasks. Anti-rebond pour ne pas re-rendre
        // a chaque touche.
        //
        // Un minuteur **par champ**, et non un seul partage : avec un minuteur
        // unique, ecrire dans « tags » juste apres « projet » annulait la
        // saisie du premier, qui n'atteignait jamais l'etat.
        const minuteries = {};
        function saisie(cle, valeur) {
            clearTimeout(minuteries[cle]);
            minuteries[cle] = setTimeout(
                () => setState({ [cle]: valeur }, { clientOnly: true }), SAISIE_DELAI);
        }
        document.getElementById('tw-project')
            .addEventListener('input', e => saisie('project', e.target.value));
        document.getElementById('tw-tags')
            .addEventListener('input', e => saisie('tags', e.target.value));

        // « Tout effacer » ne touche qu'a l'etat de nav. Les vues propres a une
        // page -- « prevues aujourd'hui », « en retard » -- restent les siennes.
        document.getElementById('tw-clear-filters').addEventListener('click', () => {
            Object.values(minuteries).forEach(clearTimeout);
            setState({ context: '', project: '', tags: '', statuses: ['pending'] });
        });

        // Status buttons
        document.getElementById('tw-status-btns').addEventListener('click', e => {
            const b = e.target.closest('.tw-status-btn');
            if (b) setState({ statuses: [b.dataset.status] });
        });
    }

    // ── Data ──────────────────────────────────────────────────────────────────
    async function fetchProjects() {
        try {
            const r = await fetch('/api/projects');
            const d = await r.json();
            if (d.success) return d.projects || [];
        } catch {}
        return [];
    }

    async function fetchContexts() {
        try {
            const r = await fetch('/api/contexts');
            const d = await r.json();
            if (d.success) return d.contexts || [];
        } catch {}
        return [];
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const state    = getState();
        const active   = activePage();
        const contexts = ss(CTX_KEY) || [];

        const navBar = document.createElement('div');
        navBar.id = 'tw-nav-bar';
        navBar.innerHTML = buildNavBar(active);

        const btnBar = document.createElement('div');
        btnBar.id = 'tw-btn-bar';
        btnBar.innerHTML = buildBtnBar(state, contexts);

        const filterBar = document.createElement('div');
        filterBar.id = 'tw-filter-bar';
        filterBar.innerHTML = buildFilterBar();

        // Insere a l'envers, chacun en premier enfant : navBar, btnBar, filterBar.
        [filterBar, btnBar, navBar].forEach(el =>
            document.body.insertBefore(el, document.body.firstChild));

        // Restore count from last visit immediately (before API returns)
        const savedCount = sessionStorage.getItem(COUNT_KEY);
        if (savedCount) {
            const el = document.getElementById('tw-count');
            if (el) el.textContent = savedCount;
        }

        _applyState(state);
        bindEvents();

        // Background: refresh context list, update buttons if changed
        fetchContexts().then(names => {
            ss(CTX_KEY, names);
            if (JSON.stringify(names) !== JSON.stringify(contexts)) {
                const ctxDiv = document.getElementById('tw-ctx-btns');
                if (ctxDiv) ctxDiv.innerHTML = buildCtxWidget(getState(), names);
                _applyState(getState());
            }
        });

        // Projets : peints depuis le cache de session, puis rafraichis. La
        // promesse est exposee pour que les pages n'aient pas a redemander la
        // meme liste -- `task _projects` est un sous-processus, pas un cache.
        remplirProjets(ss(PROJ_KEY) || []);
        window.twNav.projectsReady = fetchProjects().then(noms => {
            ss(PROJ_KEY, noms);
            remplirProjets(noms);
            return noms;
        });

        // Background: fetch notification timeout
        fetch('/api/config').then(r => r.json()).then(d => {
            window.twNotifTimeout = (d.notification_timeout != null) ? d.notification_timeout : 3000;
        }).catch(() => { window.twNotifTimeout = 3000; });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
