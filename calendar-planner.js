'use strict';

// ── Globals ───────────────────────────────────────────────────────────────────
let calendar;
let taskEditor;
let taskCardManager;
let unplannedTasks   = [];
let allTasks         = [];
let dueTasks         = [];
let _calEventSource  = null;  // managed FC event source — remove before re-adding
let _loadId          = 0;     // increment each loadTasks() call; cancelled calls are ignored

// ── Priority helper ───────────────────────────────────────────────────────────
function calPriClass(pri) {
    if (!pri) return '';
    const n = parseInt(pri);
    if (!isNaN(n)) return n <= 2 ? 'high' : n <= 4 ? 'med' : 'low';
    if (pri === 'H') return 'high';
    if (pri === 'M') return 'med';
    if (pri === 'L') return 'low';
    return '';
}

// ── Debug helper (temporary) ──────────────────────────────────────────────────
function _dbg(msg) {
    console.error('[cal-debug]', msg);
    fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: String(msg) }) }).catch(() => {});
    const el = document.getElementById('cal-debug-banner');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}
window.onerror = (msg, src, line, col, err) => {
    _dbg(`JS ERROR: ${msg} @ ${src}:${line}:${col}${err ? ' — ' + err.stack : ''}`);
};
// Unhandled promise rejections — log only, don't show banner (SSE/nav churn is benign)
window.onunhandledrejection = (e) => {
    const msg = e.reason?.message || String(e.reason);
    console.warn('[cal-debug] Unhandled promise:', msg);
    fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: 'Unhandled promise: ' + msg }) }).catch(() => {});
};

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const _step = (name, fn) => { try { fn(); } catch(e) { _dbg(`CRASH in ${name}: ${e.message}\n${e.stack}`); throw e; } };

    _step('TaskCardManager', () => {
        taskCardManager = new TaskCardManager(new CalendarTaskActionHandler());
    });

    _step('TaskEditor', () => {
        taskEditor = new TaskEditor({
            showAllFields:  true,
            priorityFormat: 'letters',
            language:       'en',
            modalId:        'unified-task-editor',
            onSaveSuccess:  () => loadTasks(),
            onSaveError:    (err) => showCalNotification(err, 'error'),
            onCancel:       () => {}
        });
    });

    _step('initializeCalendar', () => initializeCalendar());
    _step('setupEventListeners', () => setupEventListeners());
    _step('initSidebarControls', () => initSidebarControls());
    _step('loadTasks', () => loadTasks());
    _step('setupCalTooltip', () => setupCalTooltip());

    document.addEventListener('tw-open-add',      () => { if (taskEditor) taskEditor.show(null); });
    document.addEventListener('tw-filter-change', () => loadTasks());
    document.addEventListener('tw-menu-action', (e) => {
        if (e.detail?.action === 'sync') openSyncDialog();
    });
    document.addEventListener('tw-show-notification', (e) => {
        const { message, type } = e.detail || {};
        if (message) showCalNotification(message, type || 'info');
    });
    document.getElementById('notif-close')?.addEventListener('click', () =>
        document.getElementById('notification')?.classList.remove('show'));

    // Navigate to date/view from URL params (e.g. Agenda page date-header click)
    const params    = new URLSearchParams(location.search);
    const paramView = params.get('view');
    const paramDate = params.get('date');
    if (paramView) changeView(paramView);
    if (paramDate && /^\d{8}$/.test(paramDate)) {
        const y = +paramDate.slice(0, 4), mo = +paramDate.slice(4, 6) - 1, d = +paramDate.slice(6, 8);
        calendar.gotoDate(new Date(y, mo, d));
    }
});

// ── Calendar initialisation ───────────────────────────────────────────────────
function initializeCalendar() {
    const el = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(el, {
        initialView:     'timeGridWeek',
        headerToolbar:   false,          // we render our own toolbar
        expandRows:      true,           // slots expand to fill height — height set via fitCalHeight()
        slotMinTime:     '06:00:00',
        slotMaxTime:     '23:00:00',
        firstDay:        1,              // Monday
        nowIndicator:    true,
        allDaySlot:      false,          // due events are timed; no allday strip needed
        editable:        true,           // drag + resize on scheduled events
        droppable:       true,           // accept external drags from sidebar
        eventMinHeight:  18,

        eventTimeFormat: {
            hour:           'numeric',
            minute:         '2-digit',
            omitZeroMinute: true,
            meridiem:       'short'
        },

        // Custom event content: description text + priority bar
        eventContent: renderEventContent,

        // Callbacks
        eventClick:   (info) => showEventModal(info.event),
        eventDrop:    handleEventDrop,
        eventResize:  handleEventResize,
        eventReceive: handleEventReceive,
        dateClick:    handleDateClick,

        datesSet: () => updateCalendarTitle(),
    });

    calendar.render();
    setupExternalDrag();

    // Set explicit pixel height after flex layout settles, and on every resize
    requestAnimationFrame(fitCalHeight);
    window.addEventListener('resize', fitCalHeight);
    new ResizeObserver(fitCalHeight).observe(el);
}

function fitCalHeight() {
    if (!calendar) return;
    const col   = document.querySelector('.calendar-column');
    const calEl = document.getElementById('calendar');
    const h     = col ? col.clientHeight : 0;
    const msg   = `fitCalHeight: col=${h} calEl=${calEl?.clientHeight} win=${window.innerWidth}x${window.innerHeight} mobile=${window.innerWidth <= 768}`;
    console.log('[cal-debug]', msg);
    fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg }) }).catch(() => {});

    if (window.innerWidth <= 768) {
        calendar.setOption('height', 'auto');
        return;
    }
    if (h > 0) calendar.setOption('height', h);
}

// ── External drag: sidebar task cards → calendar ──────────────────────────────
function setupExternalDrag() {
    const container = document.getElementById('unplanned-tasks');
    if (!container || typeof FullCalendar?.Draggable === 'undefined') return;

    new FullCalendar.Draggable(container, {
        itemSelector: '.task-card',
        eventData(cardEl) {
            const task = JSON.parse(cardEl.dataset.taskData || '{}');
            const mins = parseEstTime(task.sched_duration) || 30;
            return {
                id:              task.uuid,
                title:           task.description || '',
                duration:        { hours: Math.floor(mins / 60), minutes: mins % 60 },
                backgroundColor: '#4a90e2',
                borderColor:     '#357abd',
                textColor:       '#fff',
                extendedProps:   { raw: task },
            };
        }
    });
}

// ── Click empty slot → create new task ───────────────────────────────────────
function handleDateClick(info) {
    if (!taskEditor) return;

    // Format clicked date as local YYYY-MM-DDTHH:MM for the datetime-local input
    const d   = info.date;
    const pad = (n) => String(n).padStart(2, '0');
    const localDT = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    taskEditor.show(null);   // open as new task (clears form)

    // Set scheduled field after show() renders the form
    requestAnimationFrame(() => {
        const modal = document.getElementById('unified-task-editor');
        const schedField = modal?.querySelector('#task-editor-scheduled');
        if (schedField) schedField.value = localDT;
    });
}

// ── Event content renderer ────────────────────────────────────────────────────
function renderEventContent(arg) {
    const task = arg.event.extendedProps?.raw || {};
    const desc = arg.event.title;
    const pc   = calPriClass(task.priority);
    const view = calendar.view.type;

    const wrap = document.createElement('div');
    wrap.className  = 'fc-ev-wrap';
    wrap.dataset.desc = desc;

    const body = document.createElement('div');
    body.className = 'fc-ev-body';

    const title = document.createElement('span');
    title.className   = 'fc-ev-title';
    title.textContent = desc;
    body.appendChild(title);

    // Project: only in day view where there's more room
    if (task.project && view === 'timeGridDay') {
        const proj = document.createElement('span');
        proj.className   = 'fc-ev-project';
        proj.textContent = task.project;
        body.appendChild(proj);
    }

    // Priority dot — leads the text, no horizontal padding
    if (pc) {
        const dot = document.createElement('span');
        dot.className = `fc-pri-dot fc-pri-${pc}`;
        wrap.insertBefore(dot, body);
    }

    wrap.appendChild(body);
    return { domNodes: [wrap] };
}

// ── Optimistic event drop/resize ──────────────────────────────────────────────
async function handleEventDrop(info) {
    const task = info.event.extendedProps?.raw;
    if (!task?.uuid) return;

    const modData = { scheduled: toLocalISOString(info.event.start) };
    if (info.event.end) {
        const mins = Math.round((info.event.end - info.event.start) / 60000);
        modData.sched_duration = minsToISO(mins);
    }
    const result = await modifyTaskInBackend(task.uuid, modData);
    if (!result.success) {
        info.revert();
        showCalNotification('Failed to move task: ' + (result.error || ''), 'error');
    }
}

async function handleEventResize(info) {
    const task = info.event.extendedProps?.raw;
    if (!task?.uuid) return;

    const mins   = Math.round((info.event.end - info.event.start) / 60000);
    const result = await modifyTaskInBackend(task.uuid, {
        scheduled:      toLocalISOString(info.event.start),
        sched_duration: minsToISO(mins)
    });
    if (!result.success) {
        info.revert();
        showCalNotification('Failed to resize: ' + (result.error || ''), 'error');
    }
}

// External drag received from sidebar
async function handleEventReceive(info) {
    const task = info.event.extendedProps?.raw;
    if (!task?.uuid) { info.event.remove(); return; }

    const result = await modifyTaskInBackend(task.uuid, {
        scheduled: toLocalISOString(info.event.start)
    });
    if (!result.success) {
        info.event.remove();
        showCalNotification('Failed to schedule task: ' + (result.error || ''), 'error');
        return;
    }
    loadTasks();  // reload sidebar + calendar
}

function minsToISO(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h > 0 && m > 0) return `PT${h}H${m}M`;
    if (h > 0)           return `PT${h}H`;
    return `PT${m}M`;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('prev-btn').addEventListener('click',  () => { calendar.prev();  updateCalendarTitle(); });
    document.getElementById('next-btn').addEventListener('click',  () => { calendar.next();  updateCalendarTitle(); });
    document.getElementById('today-btn').addEventListener('click', () => { calendar.today(); updateCalendarTitle(); });

    document.querySelectorAll('.view-btn[data-view]').forEach(btn =>
        btn.addEventListener('click', (e) => changeView(e.currentTarget.dataset.view))
    );
}

function changeView(view) {
    const fcViews = { week: 'timeGridWeek', day: 'timeGridDay', month: 'dayGridMonth' };
    if (fcViews[view]) calendar.changeView(fcViews[view]);
    document.getElementById('calendar').dataset.view = view;
    document.querySelectorAll('.view-btn[data-view]').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.view === view)
    );
    updateCalendarTitle();
}

function updateCalendarTitle() {
    const titleEl = document.getElementById('calendar-title');
    if (titleEl) titleEl.textContent = calendar.view.title;

    const todayBtn = document.getElementById('today-btn');
    if (todayBtn) {
        const now = new Date();
        todayBtn.classList.toggle('active',
            calendar.view.currentStart <= now && now < calendar.view.currentEnd);
    }
}

// ── Data loading ──────────────────────────────────────────────────────────────
function loadTasks() {
    const myId        = ++_loadId;   // mark this wave; older in-flight calls become stale
    const params      = window.twNav ? window.twNav.stateToParams() : 'status=pending';
    const navState    = window.twNav ? window.twNav.getState() : {};
    const statusParam = 'status=' + encodeURIComponent((navState.statuses || ['pending']).join(','));

    function _fetch(attempt) {
        Promise.all([
            fetch('/api/tasks?'         + params      ).then(r => r.json()),
            fetch('/api/tasks/planned?' + statusParam ).then(r => r.json()),
            fetch('/api/tasks/due?'     + statusParam ).then(r => r.json()),
        ])
        .then(([data, plannedData, dueData]) => {
            if (myId !== _loadId) return;   // superseded by a newer loadTasks() call
            if (!data.success) throw new Error(data.error || 'Failed to load tasks');

            const allFetched   = data.tasks || [];
            const plannedTasks = plannedData.success ? (plannedData.data || []) : [];
            dueTasks           = dueData.success      ? (dueData.data  || []) : [];

            unplannedTasks = allFetched.filter(t => !t.scheduled);
            allTasks       = [...unplannedTasks, ...plannedTasks];

            applyFiltersAndDisplay();
            processTasksForCalendar(plannedTasks);
        })
        .catch(err => {
            if (myId !== _loadId) return;   // stale — a newer call is handling things
            // Retry up to 2× on transient WebKit body-read errors (SW race, stream drop)
            if (attempt < 2 && /object|network|fetch/i.test(err.message || '')) {
                const delay = attempt === 0 ? 1200 : 2500;
                setTimeout(() => { if (myId === _loadId) _fetch(attempt + 1); }, delay);
            } else {
                showCalNotification('Failed to load tasks: ' + err.message, 'error');
            }
        });
    }

    _fetch(0);
}

function processTasksForCalendar(scheduledTasks) {
    // Remove the previous event source cleanly (removeAllEvents() leaves stale
    // sources that FC may re-evaluate; tracking one source avoids this).
    if (_calEventSource) {
        try { _calEventSource.remove(); } catch (_) {}
        _calEventSource = null;
    }

    const events = [];
    scheduledTasks.filter(matchesNavFilter).forEach(task => {
        try { const e = createCalendarEvent(task); if (e) events.push(e); } catch (_) {}
    });
    dueTasks.filter(matchesNavFilter).forEach(task => {
        try { const e = createDueEvent(task); if (e) events.push(e); } catch (_) {}
    });

    _calEventSource = calendar.addEventSource(events);

    // diagnostics — remove once calendar is confirmed working
    const fcEvents = calendar.getEvents();
    const view     = calendar.view;
    const evDates  = events.slice(0, 5).map(e => e.start instanceof Date
        ? e.start.toISOString() : String(e.start));
    const _evMsg   = `cal: addEventSource(${events.length}) → getEvents()=${fcEvents.length} | view=${view?.type} start=${view?.currentStart?.toISOString?.()} | evDates=${JSON.stringify(evDates)}`;
    console.log('[cal-debug]', _evMsg);
    fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: _evMsg }) }).catch(() => {});

    // Check DOM after FC renders (~400ms)
    setTimeout(() => {
        const fcWrap  = document.querySelector('.fc');
        const fcViewH = document.querySelector('.fc-view-harness');
        const evEls   = document.querySelectorAll('.fc-timegrid-event, .fc-daygrid-event');
        const msg2    = `fcDOM: wrap=${fcWrap?.clientHeight} viewH=${fcViewH?.clientHeight} eventEls=${evEls.length} fcH=${document.getElementById('calendar')?.clientHeight}`;
        console.log('[cal-debug]', msg2);
        fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msg: msg2 }) }).catch(() => {});
    }, 400);
}

// ── Event object factories ─────────────────────────────────────────────────────
function createCalendarEvent(task) {
    if (!task.scheduled) return null;
    // Keep Z — TW exports UTC; let JS parse as UTC so FullCalendar displays in local time
    const isoDate = task.scheduled.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'
    );
    const start = new Date(isoDate);
    if (isNaN(start.getTime())) return null;

    let mins = 60;
    if (task.sched_duration?.startsWith('PT')) {
        const m = task.sched_duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (m) mins = (parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0)) || 60;
    }

    const ev = {
        id:              task.uuid,
        title:           task.description,
        start,
        end:             new Date(start.getTime() + mins * 60000),
        backgroundColor: '#4a90e2',
        borderColor:     '#357abd',
        textColor:       '#fff',
        editable:        true,
        extendedProps:   { raw: task },
    };
    if (task.status === 'completed') { ev.backgroundColor = '#78909c'; ev.borderColor = '#546e7a'; ev.editable = false; }
    if (task.status === 'deleted')   { ev.backgroundColor = '#ab47bc'; ev.borderColor = '#8e24aa'; ev.editable = false; }
    return ev;
}

function createDueEvent(task) {
    if (!task.due) return null;
    const isoDate = task.due.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'
    );
    const start = new Date(isoDate);
    if (isNaN(start.getTime())) return null;

    let mins = 30;
    if (task.due_duration?.startsWith('PT')) {
        const m = task.due_duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (m) mins = (parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0)) || 30;
    }

    const ev = {
        id:              task.uuid + '_due',
        title:           '⚑ ' + task.description,
        start,
        end:             new Date(start.getTime() + mins * 60000),
        backgroundColor: '#e74c3c',
        borderColor:     '#c0392b',
        textColor:       '#fff',
        editable:        false,   // due date events are read-only on the calendar
        extendedProps:   { raw: task },
    };
    if (task.status === 'completed') { ev.backgroundColor = '#78909c'; ev.borderColor = '#546e7a'; }
    if (task.status === 'deleted')   { ev.backgroundColor = '#ab47bc'; ev.borderColor = '#8e24aa'; }
    return ev;
}

// ── Task detail modal ─────────────────────────────────────────────────────────
function showEventModal(fcEvent) {
    const task  = fcEvent.extendedProps?.raw || {};
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;

    document.getElementById('modal-task-title').textContent =
        task.description || fcEvent.title || 'Task';

    const fmt = (twDate) => {
        const m = (twDate || '').match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
        if (!m) return twDate;
        return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1]}`;
    };

    const rows = [];
    if (task.status && task.status !== 'pending')
        rows.push(`<tr><th>Status</th><td><em>${task.status}</em></td></tr>`);
    if (task.project)  rows.push(`<tr><th>Project</th><td>${task.project}</td></tr>`);
    if (task.priority) {
        const label = { H: 'High', M: 'Medium', L: 'Low' }[task.priority] || task.priority;
        rows.push(`<tr><th>Priority</th><td>${label}</td></tr>`);
    }
    if (task.due)            rows.push(`<tr><th>Due</th><td>${fmt(task.due)}</td></tr>`);
    if (task.scheduled)      rows.push(`<tr><th>Scheduled</th><td>${fmt(task.scheduled)}</td></tr>`);
    if (task.sched_duration) rows.push(`<tr><th>Duration</th><td>${task.sched_duration}</td></tr>`);
    if (task.tags?.length)
        rows.push(`<tr><th>Tags</th><td>${task.tags.map(t => `<span class="card-tag">${t}</span>`).join(' ')}</td></tr>`);
    if (task.urgency != null)
        rows.push(`<tr><th>Urgency</th><td>${Number(task.urgency).toFixed(1)}</td></tr>`);

    document.getElementById('modal-task-body').innerHTML = rows.length
        ? `<table class="task-detail-table">${rows.join('')}</table>`
        : '<em>No details available.</em>';

    const close = () => modal.classList.remove('show');
    const isActive    = !!task.start;
    const isEditable  = fcEvent.editable !== false;

    // Start / Stop
    const startBtn = document.getElementById('modal-start-btn');
    const stopBtn  = document.getElementById('modal-stop-btn');
    startBtn.style.display = (isActive || !isEditable) ? 'none' : '';
    stopBtn.style.display  = (!isActive || !isEditable) ? 'none' : '';
    startBtn.onclick = async () => {
        await taskCardManager.actionHandler.performTaskAction(task.uuid, 'start');
        close(); loadTasks();
    };
    stopBtn.onclick = async () => {
        await taskCardManager.actionHandler.performTaskAction(task.uuid, 'stop');
        close(); loadTasks();
    };

    // Edit
    document.getElementById('modal-edit-btn').onclick = () => {
        close();
        if (taskEditor) taskEditor.showForTask(task);
    };

    // Unschedule (calendar-specific — hide for non-editable/due events)
    const unschedBtn = document.getElementById('modal-unschedule-btn');
    unschedBtn.style.display = isEditable ? '' : 'none';
    unschedBtn.onclick = async () => {
        const r = await modifyTaskInBackend(task.uuid, { scheduled: null });
        if (r.success) { close(); loadTasks(); }
    };

    // Done
    document.getElementById('modal-done-btn').onclick = async () => {
        await taskCardManager.actionHandler.performTaskAction(task.uuid, 'done');
        close(); loadTasks();
    };

    // Delete
    document.getElementById('modal-delete-btn').onclick = () => {
        close();
        taskCardManager.actionHandler.confirmDelete(task.uuid);
    };

    document.getElementById('modal-close-btn').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
    modal.classList.add('show');
}

// ── Action handler ────────────────────────────────────────────────────────────
class CalendarTaskActionHandler extends TaskActionHandler {
    constructor() {
        super({
            onTaskUpdate: () => loadTasks(),
            onTaskDelete: () => loadTasks(),
            showNotification: (msg, type) =>
                document.dispatchEvent(new CustomEvent('tw-show-notification', { detail: { message: msg, type } }))
        });
    }
}

// ── Sidebar: filter + display ─────────────────────────────────────────────────
// Shared client-side filter predicate — used by both sidebar and calendar
function matchesNavFilter(task) {
    const state    = window.twNav ? window.twNav.getState() : {};
    const filter   = (state.filter   || '').trim().toLowerCase();
    const priority = (state.priority || '').trim().toLowerCase();
    const project  = (state.project  || '').trim().toLowerCase();
    const tags     = (state.tags     || '').split(',').map(t => t.trim()).filter(Boolean);
    if (filter   && !(task.description || '').toLowerCase().includes(filter))       return false;
    if (priority && !String(task.priority || '').toLowerCase().includes(priority))  return false;
    if (project  && !(task.project      || '').toLowerCase().includes(project))     return false;
    if (tags.length && !tags.every(t => (task.tags || []).includes(t)))             return false;
    return true;
}

function applyFiltersAndDisplay() {
    const filtered = unplannedTasks.filter(matchesNavFilter);
    window.twNav?.setCount(filtered.length, unplannedTasks.length);
    displayUnplannedTasks(sortUnplanned(filtered));
}

function displayUnplannedTasks(tasks) {
    const container = document.getElementById('unplanned-tasks');
    if (tasks.length === 0) {
        container.innerHTML = unplannedTasks.length === 0
            ? `<div class="empty-message"><span class="icon">✅</span><p>No tasks to schedule</p></div>`
            : `<div class="empty-message"><p>No tasks match the current filter</p></div>`;
        return;
    }
    container.innerHTML = '';
    tasks.forEach(task => {
        const card = taskCardManager.createTaskCard(task);
        card.dataset.taskData = JSON.stringify(task);  // required by FullCalendar.Draggable
        container.appendChild(card);
    });
}

// ── Sidebar sort ──────────────────────────────────────────────────────────────
const SIDEBAR_SORT_FIELDS = [
    { value: 'urgency',     label: 'Urgency (default)' },
    { value: 'priority',    label: 'Priority' },
    { value: 'due',         label: 'Due date' },
    { value: 'description', label: 'Description' },
    { value: 'project',     label: 'Project' },
    { value: 'entry',       label: 'Created' },
    { value: 'modified',    label: 'Modified' },
    { value: 'start',       label: 'Started' },
    { value: 'scheduled',   label: 'Scheduled' },
    { value: 'wait',        label: 'Wait date' },
    { value: 'id',          label: 'ID' },
    { value: 'tags',        label: 'Tags' },
];

function sortUnplanned(tasks) {
    const field = localStorage.getItem('tw-sort-field') || 'urgency';
    const rev   = localStorage.getItem('tw-sort-reverse') === 'true' ? -1 : 1;
    if (field === 'urgency') return rev === 1 ? tasks : [...tasks].reverse();
    const PRI = { H: 3, M: 2, L: 1 };
    return [...tasks].sort((a, b) => {
        let av = a[field], bv = b[field];
        if (field === 'priority') { av = PRI[av] || 0; bv = PRI[bv] || 0; }
        else if (field === 'tags') { av = (av || []).join(','); bv = (bv || []).join(','); }
        av = av ?? ''; bv = bv ?? '';
        if (av < bv) return -1 * rev;
        if (av > bv) return  1 * rev;
        return 0;
    });
}

function initSidebarControls() {
    const cardBtn   = document.getElementById('cal-view-card');
    const listBtn   = document.getElementById('cal-view-list');
    const container = document.getElementById('unplanned-tasks');

    const setView = (mode) => {
        localStorage.setItem('tw-view-mode', mode);
        cardBtn.classList.toggle('active', mode === 'card');
        listBtn.classList.toggle('active', mode === 'list');
        if (container) container.classList.toggle('list-view', mode === 'list');
    };
    setView(localStorage.getItem('tw-view-mode') || 'card');
    cardBtn?.addEventListener('click', () => setView('card'));
    listBtn?.addEventListener('click', () => setView('list'));

    if (container) {
        container.addEventListener('click', (e) => {
            if (e.target.closest('[data-task-action]')) return;
            const card = e.target.closest('.task-card');
            if (!card) return;
            const mode = localStorage.getItem('tw-view-mode') || 'card';
            if (mode === 'list') card.classList.toggle('expanded');
            else card.classList.toggle('collapsed');
        });
    }

    const sortBtn    = document.getElementById('cal-sort-btn');
    const sortPopup  = document.getElementById('cal-sort-popup');
    const sortFields = document.getElementById('cal-sort-fields');
    const revBox     = document.getElementById('cal-sort-reverse');
    if (!sortBtn || !sortPopup || !sortFields || !revBox) return;

    const curField = localStorage.getItem('tw-sort-field') || 'urgency';
    sortFields.innerHTML = SIDEBAR_SORT_FIELDS.map(f =>
        `<label><input type="radio" name="cal-sort" value="${f.value}"${f.value === curField ? ' checked' : ''}> ${f.label}</label>`
    ).join('');
    revBox.checked = localStorage.getItem('tw-sort-reverse') === 'true';

    const updateSortBtn = () => {
        const f   = localStorage.getItem('tw-sort-field') || 'urgency';
        const rev = localStorage.getItem('tw-sort-reverse') === 'true';
        const def = f === 'urgency' && !rev;
        sortBtn.classList.toggle('sort-active', !def);
        sortBtn.title = def ? 'Sort'
            : `Sort: ${SIDEBAR_SORT_FIELDS.find(x => x.value === f)?.label || f}${rev ? ' ↑' : ' ↓'}`;
    };
    updateSortBtn();

    sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sortPopup.style.display = sortPopup.style.display === 'none' ? 'block' : 'none';
    });
    sortFields.addEventListener('change', (e) => {
        if (e.target.name === 'cal-sort') {
            localStorage.setItem('tw-sort-field', e.target.value);
            updateSortBtn();
            applyFiltersAndDisplay();
        }
    });
    revBox.addEventListener('change', () => {
        localStorage.setItem('tw-sort-reverse', revBox.checked);
        updateSortBtn();
        applyFiltersAndDisplay();
    });
    document.addEventListener('click', () => { sortPopup.style.display = 'none'; });
    sortPopup.addEventListener('click', (e) => e.stopPropagation());
}

// ── Hover tooltip (shows full description when event block is small) ───────────
function setupCalTooltip() {
    const tip = document.createElement('div');
    tip.id = 'cal-tooltip';
    tip.className = 'cal-tooltip';
    tip.style.display = 'none';
    document.body.appendChild(tip);

    const calEl = document.getElementById('calendar');
    calEl.addEventListener('mouseover', e => {
        const evBlock = e.target.closest('.fc-timegrid-event, .fc-daygrid-event');
        if (!evBlock) { tip.style.display = 'none'; return; }
        const descEl = evBlock.querySelector('[data-desc]');
        if (!descEl)  { tip.style.display = 'none'; return; }
        tip.textContent = descEl.dataset.desc;
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top  = (e.clientY + 14) + 'px';
    });
    calEl.addEventListener('mousemove', e => {
        if (tip.style.display !== 'none') {
            tip.style.left = (e.clientX + 14) + 'px';
            tip.style.top  = (e.clientY + 14) + 'px';
        }
    });
    calEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// ── Sync dialog ───────────────────────────────────────────────────────────────
function openSyncDialog() {
    const dialog   = document.getElementById('sync-dialog');
    const btn      = document.getElementById('sync-now-btn');
    const output   = document.getElementById('sync-output');
    const method   = document.getElementById('sync-method');
    const closeBtn = document.getElementById('sync-dialog-close');
    if (!dialog) return;

    output.style.display = 'none';
    output.textContent   = '';
    btn.disabled         = false;
    btn.textContent      = 'Sync Now';

    fetch('/api/sync/info').then(r => r.json())
        .then(d => { method.textContent = `Method: ${d.method}`; })
        .catch(() => { method.textContent = ''; });

    dialog.style.display = 'flex';
    const close = () => { dialog.style.display = 'none'; };
    closeBtn.onclick = close;
    dialog.onclick   = (e) => { if (e.target === dialog) close(); };

    btn.onclick = () => {
        btn.disabled    = true;
        btn.textContent = 'Syncing…';
        output.style.display = 'none';
        fetch('/api/sync', { method: 'POST' })
            .then(r => r.json())
            .then(data => {
                output.textContent   = data.output || (data.success ? 'Sync complete.' : 'Sync failed.');
                output.style.display = 'block';
                btn.textContent      = data.success ? 'Sync Now' : 'Retry';
                btn.disabled         = false;
                if (data.success) loadTasks();
            })
            .catch(err => {
                output.textContent   = 'Error: ' + err;
                output.style.display = 'block';
                btn.textContent      = 'Retry';
                btn.disabled         = false;
            });
    };
}

// ── Notifications ─────────────────────────────────────────────────────────────
function showCalNotification(message, type = 'info') {
    const el  = document.getElementById('notification');
    const txt = document.getElementById('notif-text');
    if (!el) return;
    if (txt) txt.textContent = message; else el.textContent = message;
    el.className = `notification ${type} show`;
    clearTimeout(showCalNotification._t);
    showCalNotification._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Backend API ───────────────────────────────────────────────────────────────
async function modifyTaskInBackend(taskId, taskData) {
    try {
        const r = await fetch(`/api/task/${taskId}/modify`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(taskData)
        });
        const d = await r.json();
        return { success: d.success, error: d.error || 'Unknown error' };
    } catch (err) {
        return { success: false, error: err.message || 'Network error' };
    }
}

async function addTaskToBackend(taskData) {
    try {
        const r = await fetch('/api/task/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(taskData)
        });
        const d = await r.json();
        return d.success && d.task
            ? { success: true,  task: d.task, error: null }
            : { success: false, task: null,   error: d.error || 'Unknown error' };
    } catch (err) {
        return { success: false, task: null, error: err.message || 'Network error' };
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Format a JS Date as local YYYY-MM-DDTHH:MM:SS for Taskwarrior (no Z, no UTC shift)
function toLocalISOString(date) {
    if (!date) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}` +
           `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function parseEstTime(sched_duration) {
    if (!sched_duration) return null;
    if (sched_duration.startsWith('PT')) {
        const m = sched_duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (m) return parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0) + Math.round(parseInt(m[3] || 0) / 60);
    }
    const m = sched_duration.match(/(\d+)h|(\d+)min/g);
    if (!m) return null;
    return m.reduce((sum, p) => sum + (p.includes('h') ? parseInt(p) * 60 : parseInt(p)), 0);
}

function DateFromISOtoTW(isoString) {
    if (!isoString) return null;
    if (/^\d{8}T\d{6}Z$/.test(isoString))
        return isoString.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(isoString))
        return isoString.slice(0, -1);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoString))
        return isoString;
    try {
        const d = new Date(isoString);
        if (!isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
    } catch (_) {}
    return null;
}
