/**
 * Calendar Planner - Intégration Toast UI Calendar avec Taskwarrior
 * Permet de glisser-déposer des tâches non planifiées dans le calendrier
 */

/**
 * Valriables globales
 */
let calendar;
let unplannedTasks = [];
let allTasks = [];
// `readyOnly` : ne proposer que les taches dont la duree estimee est connue.
// Actif par defaut -- c'est la vue de travail attendue -- mais reversible d'un
// clic, et le choix est retenu d'une visite a l'autre.
const READY_ONLY_KEY = 'tw-calendar-ready-only';

function lireReadyOnly() {
    try {
        const stocke = localStorage.getItem(READY_ONLY_KEY);
        return stocke === null ? true : stocke === 'true';
    } catch {
        return true;
    }
}

// Le tri et la bascule sont propres a cette page. Projet, tags, contexte et
// statut viennent de la barre nav, partagee avec la liste et le kanban.
// Les blocs hors filtre sont visibles par defaut : le defaut sur est de voir
// ce qui est deja pris, sous peine de planifier deux choses en meme temps.
const HORS_FILTRE_KEY = 'tw-calendar-hors-filtre';

function lireHorsFiltre() {
    try {
        const stocke = localStorage.getItem(HORS_FILTRE_KEY);
        return stocke === null ? true : stocke === 'true';
    } catch {
        return true;
    }
}

let currentFilter = {
    sort: 'urgency',
    readyOnly: lireReadyOnly(),
    horsFiltre: lireHorsFiltre()
};

// Identifiant du calendrier TOAST UI reserve aux blocs hors filtre.
const CAL_HORS_FILTRE = 'hors-filtre';

/**
 * Plan calcule par l'ordonnanceur (lot 9, ordonnanceur-par-contraintes).
 *
 * Contrat documente dans `../TaskWarriorPlanner/openspec/changes/
 * ordonnanceur-par-contraintes/design.md` §7. Produit par `planif/sortie.py`
 * dans cet autre depot ; ce fichier-ci ne fait que le lire. Aucune donnee du
 * plan n'est recalculee : `externe`, `agrege`, `opportuniste` et `precision`
 * sont lus tels quels sur chaque bloc.
 *
 * Chemin choisi : `/plan.json`, a la racine, servi par la route catch-all
 * deja presente dans `main_fastapi.py` (`FileResponse` sur le nom de fichier
 * demande). Rien n'a ete ajoute cote backend : ce depot ne produit pas encore
 * ce fichier, et ce lot se developpe sur un plan bouchonne (cf. tasks.md).
 */
const VERSION_PLAN_ATTENDUE = 1;
const URL_PLAN = '/plan.json';

// Trois calendriers TOAST UI distincts, un par regime lu dans le plan, plus
// un pour l'externe (qui n'est pas un regime de travail, voir plus bas).
const CAL_PLAN_CONTRAINT = 'plan-contraint';
const CAL_PLAN_OPPORTUNISTE = 'plan-opportuniste';
const CAL_PLAN_EXTERNE = 'plan-externe';

// Evenements construits a partir du dernier plan charge avec succes. Vide
// tant qu'aucun plan valide n'a ete lu -- c'est ainsi que la degradation
// propre est obtenue : on ne rend simplement rien de plus.
let planEvents = [];

function estCalendrierDePlan(calendarId) {
    return calendarId === CAL_PLAN_CONTRAINT
        || calendarId === CAL_PLAN_OPPORTUNISTE
        || calendarId === CAL_PLAN_EXTERNE;
}

/**
 * Verifie que le plan respecte le contrat minimal avant d'en tirer quoi que
 * ce soit. Rien n'est devine : `version` autre que 1, ou `taches` absent/mal
 * forme, et le plan entier est traite comme malformé (design.md §7 regle 6).
 */
function planEstValide(donnees) {
    if (!donnees || typeof donnees !== 'object') return false;
    if (donnees.version !== VERSION_PLAN_ATTENDUE) return false;
    if (!donnees.taches || typeof donnees.taches !== 'object' || Array.isArray(donnees.taches)) {
        return false;
    }
    return true;
}

/**
 * Un plan est considere perime quand la fin de **tous** ses blocs est deja
 * passee : il n'y a alors plus rien a en montrer dans un calendrier tourne
 * vers l'avenir. Le contrat JSON ne porte aucune date de generation -- c'est
 * le seul critere qu'on puisse tirer honnetement de son contenu, plutot que
 * d'inventer un champ qui n'existe pas.
 *
 * Un plan sans aucun bloc n'est pas perime : il n'y a rien a juger, et un
 * plan techniquement vide (aucune tache a planifier) est un plan valide.
 */
function planEstPerime(donnees, maintenant = new Date()) {
    const blocs = [];
    Object.values(donnees.taches).forEach(tache => {
        (tache.blocs || []).forEach(bloc => blocs.push(bloc));
    });
    if (blocs.length === 0) return false;
    return blocs.every(bloc => {
        const fin = new Date(bloc.fin);
        return !isNaN(fin.getTime()) && fin <= maintenant;
    });
}

/**
 * Transforme le plan valide en evenements TOAST UI. Ne recalcule aucun
 * regime : `externe`, `opportuniste` et `precision` sont lus tels quels.
 *
 * - `precision: "jour"` (regime agrege) : seule la journee est garantie, et
 *   deux blocs agreges d'une meme journee peuvent se chevaucher dans le JSON
 *   (design.md §7 regle 1). Les afficher comme des creneaux a l'heure pres
 *   mentirait sur leur precision reelle ; ils sont donc rendus en evenements
 *   « jour entier », qui ne se disputent pas d'heure et ne se chevauchent
 *   jamais visuellement entre eux.
 * - `externe: true` : delai fournisseur, qui ne consomme pas la capacite de
 *   l'utilisateur (design.md §7, ecriture de `scheduled`). Le montrer comme un
 *   creneau de travail donnerait l'illusion d'un agenda charge alors que
 *   l'utilisateur est libre. Rendu en marqueur journee, sur un calendrier a
 *   part, en retrait visuel (voir calendar-planner.css) : l'information reste
 *   visible sans se confondre avec du travail reel.
 */
function construireEvenementsPlan(donnees) {
    const evenements = [];
    Object.entries(donnees.taches).forEach(([uuid, tache]) => {
        const description = tache.description || '(tache sans description)';
        (tache.blocs || []).forEach(bloc => {
            const regime = bloc.externe ? 'externe' : (bloc.opportuniste ? 'opportuniste' : 'contraint');
            const calendarId = regime === 'externe' ? CAL_PLAN_EXTERNE
                : regime === 'opportuniste' ? CAL_PLAN_OPPORTUNISTE
                : CAL_PLAN_CONTRAINT;
            const estJour = bloc.precision === 'jour';

            const base = {
                id: `plan-${uuid}-${bloc.indice}`,
                calendarId,
                title: description,
                isReadOnly: true,
                raw: { uuid, regime, agrege: estJour, projet: tache.projet || null }
            };

            if (regime === 'externe') {
                // Bandeau couvrant TOUTE l'attente, du depart a l'arrivee.
                // Le reduire a son jour de depart perdrait la seule
                // information qui compte ici : combien de temps on attend.
                // C'est ce delai qui explique pourquoi le travail en aval est
                // place si loin, et c'est le scenario qui a motive
                // l'ordonnanceur.
                evenements.push({
                    ...base, isAllday: true, category: 'allday',
                    start: new Date(bloc.debut), end: new Date(bloc.fin)
                });
            } else if (estJour) {
                // Journee entiere, sur la seule journee du bloc : l'heure
                // n'est pas garantie en regime agrege, donc on ne l'affiche
                // pas. La fin est ramenee a la journee de debut -- un bloc
                // agrege repond a « quel jour », jamais a « de quand a quand ».
                const jour = new Date(bloc.debut);
                evenements.push({ ...base, isAllday: true, category: 'allday', start: jour, end: jour });
            } else {
                evenements.push({ ...base, start: new Date(bloc.debut), end: new Date(bloc.fin) });
            }
        });
    });
    return evenements;
}

/**
 * Gabarit d'affichage commun aux blocs du plan (heure et jour entier). La
 * distinction contraint/opportuniste doit se voir sans lire de couleur --
 * bordure, trame et icone different franchement, et surtout les classes
 * `.bloc--contraint` / `.bloc--opportuniste` sont stables : c'est sur elles
 * que s'appuie le test Playwright, pas sur un rendu visuel.
 */
function gabaritBlocPlan(event) {
    const raw = event.raw || {};
    const classes = ['bloc-plan', `bloc--${raw.regime || 'contraint'}`];
    if (raw.agrege) classes.push('bloc--jour');
    const icone = raw.regime === 'opportuniste' ? '💡' : raw.regime === 'externe' ? '🏭' : '📌';
    return `<div class="${classes.join(' ')}">${icone} ${echapperHtml(event.title)}</div>`;
}

/**
 * Charge le plan et remplit `planEvents`. Ne lance jamais d'exception et
 * n'affiche jamais de bandeau : un plan absent (404), illisible (reseau) ou
 * malforme (JSON invalide, version inattendue, `taches` absent) degenere
 * silencieusement vers « pas de plan », exactement comme s'il n'y avait
 * jamais eu de plan a afficher. C'est le piege nomme par tasks.md : le
 * calendrier doit continuer a s'afficher normalement dans tous ces cas.
 */
async function chargerPlan() {
    planEvents = [];
    try {
        const reponse = await fetch(URL_PLAN);
        if (!reponse.ok) {
            console.warn('Plan absent ou inaccessible (' + reponse.status + '), calendrier sans plan.');
            return;
        }
        const texte = await reponse.text();
        if (!texte || !texte.trim()) {
            console.warn('Fichier de plan vide, calendrier sans plan.');
            return;
        }
        let donnees;
        try {
            donnees = JSON.parse(texte);
        } catch (e) {
            console.warn('Plan JSON illisible, calendrier sans plan:', e.message);
            return;
        }
        if (!planEstValide(donnees)) {
            console.warn('Plan malforme (version ou structure inattendue), calendrier sans plan.', donnees);
            return;
        }
        if (planEstPerime(donnees)) {
            console.warn('Plan perime (tous les blocs sont dans le passe), calendrier sans plan.');
            return;
        }
        planEvents = construireEvenementsPlan(donnees);
    } catch (e) {
        // Erreur reseau ou autre : degradation silencieuse, jamais de bandeau.
        console.warn('Impossible de charger le plan, calendrier sans plan:', e.message);
    }
}

/**
 * Declenchement du calcul de plan depuis l'interface (lot E2), et suivi
 * jusqu'a la fin.
 *
 * `chargerPlan()` degrade en silence par construction (voir plus haut) : elle
 * est faite pour un plan qu'on LIT, pas pour prevenir d'un echec. Ici, c'est
 * l'inverse : un calcul qu'on DECLENCHE nous-memes ne doit jamais se taire,
 * sous peine de laisser croire que le plan affiche est a jour alors qu'il ne
 * l'est pas. D'ou l'affichage explicite dans #plan-etat a chaque etape, y
 * compris et surtout sur l'echec.
 */
let minuteurEtatPlan = null;

function afficherEtatPlan(texte) {
    const el = document.getElementById('plan-etat');
    if (el) el.textContent = texte;
}

function arreterInterrogationEtatPlan() {
    if (minuteurEtatPlan) {
        clearTimeout(minuteurEtatPlan);
        minuteurEtatPlan = null;
    }
}

/**
 * Interroge une fois l'etat du calcul, et reagit si l'etat est terminal.
 *
 * Reprogrammee par `setTimeout` a la fin de son propre traitement plutot que
 * par un `setInterval` a echeance fixe : la relecture du plan sur `termine`
 * (chargerPlan + redessin du calendrier) peut prendre du temps, et un
 * `setInterval` aurait pu declencher un appel suivant pendant que celui-ci
 * tourne encore, avant que l'arret ne soit pose. Ici, il n'y a simplement pas
 * d'appel suivant tant que celui-ci n'a pas decide s'il y en a un.
 */
async function interrogerEtatPlan() {
    const btn = document.getElementById('calculer-plan-btn');
    try {
        const reponse = await fetch('/api/plan/etat');
        const donnees = await reponse.json();
        if (!donnees.success) {
            // Reponse qu'on ne sait pas lire : on arrete plutot que de
            // boucler indefiniment dessus, mais on ne le tait pas.
            arreterInterrogationEtatPlan();
            if (btn) btn.disabled = false;
            afficherEtatPlan(donnees.error || 'Etat du calcul indisponible.');
            return;
        }
        const etat = donnees.data || {};
        if (etat.statut === 'termine') {
            // Etat terminal : on arrete d'interroger, on relit le plan (celui
            // qu'on vient de calculer, pas celui d'avant), puis on redessine
            // avec la meme fonction que sur un changement de filtre.
            arreterInterrogationEtatPlan();
            if (btn) btn.disabled = false;
            afficherEtatPlan('Calcul termine.');
            await chargerPlan();
            processTasksForCalendar();
        } else if (etat.statut === 'echec') {
            arreterInterrogationEtatPlan();
            if (btn) btn.disabled = false;
            afficherEtatPlan(etat.message || 'Le calcul a echoue.');
        } else if (etat.statut === 'en_cours') {
            afficherEtatPlan('Calcul en cours...');
            minuteurEtatPlan = setTimeout(interrogerEtatPlan, 2000);
        } else {
            // 'inactif' ou valeur inconnue : rien de terminal, on continue
            // d'interroger.
            afficherEtatPlan('En attente du calcul...');
            minuteurEtatPlan = setTimeout(interrogerEtatPlan, 2000);
        }
    } catch (e) {
        // Erreur reseau sur une interrogation qu'on a nous-memes declenchee :
        // meme regle, ca ne se tait pas.
        arreterInterrogationEtatPlan();
        if (btn) btn.disabled = false;
        afficherEtatPlan('Impossible de recuperer l\'etat du calcul: ' + e.message);
    }
}

/** Lance le calcul du plan et demarre le suivi si le backend l'accepte. */
async function lancerCalculPlan() {
    const btn = document.getElementById('calculer-plan-btn');
    // Desactive tout de suite, avant meme l'appel reseau : sinon la fenetre
    // entre le clic et la reponse du POST laisse le bouton recliquable, et
    // rien ne distingue plus « pas encore parti » de « deja fini ».
    if (btn) btn.disabled = true;
    afficherEtatPlan('Lancement du calcul...');
    try {
        const reponse = await fetch('/api/plan/calculer', { method: 'POST' });
        const donnees = await reponse.json();
        if (!donnees.success) {
            // Refus du backend (calcul deja en cours, etc.) : montre, pas
            // avale.
            if (btn) btn.disabled = false;
            afficherEtatPlan(donnees.error || 'Le calcul n\'a pas pu demarrer.');
            return;
        }
        afficherEtatPlan('Calcul en cours...');
        arreterInterrogationEtatPlan();
        minuteurEtatPlan = setTimeout(interrogerEtatPlan, 2000);
    } catch (e) {
        if (btn) btn.disabled = false;
        afficherEtatPlan('Erreur reseau lors du lancement du calcul: ' + e.message);
    }
}

// UUID des taches que le backend a renvoyees pour le filtre courant. Le
// contexte est une expression TaskWarrior : seul le serveur sait y repondre,
// donc on se souvient de ce qu'il a repondu plutot que de le reinterpreter.
let uuidsEnContexte = new Set();
// Le titre d'une tache finissait dans `innerHTML` sans echappement.
function echapperHtml(valeur) {
    return String(valeur == null ? '' : valeur)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let selectedTaskCard = null;
let selectedTaskData = null;
let tempEventData = null; 

/**
 * Initialisation
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser taskCardManager avec le gestionnaire d'actions pour calendar-planner
    taskCardManager = new TaskCardManager(new CalendarTaskActionHandler());
    initializeCalendar();
    setupEventListeners();
    // Les templates de cartes arrivent par fetch : sans cette attente, le premier
    // rendu tombe avant eux. Meme contrat que dans main.js.
    // Le plan est charge avant les taches : il ne bloque jamais le rendu (il
    // degenere silencieusement vers « rien a montrer »), donc l'attendre en
    // premier ne coute rien et evite un second passage de rendu.
    taskCardManager.templatesReady.then(() => chargerPlan().then(loadTasks));
    console.log('SetupTasksSelection');
    console.log('Setup Task Selection Done');
    
    // Ajouter un écouteur d'événements pour les événements taskSelected
    document.addEventListener('taskSelected', (e) => {
        handleTaskCardClick(e.detail.cardElement);
    });
});

/**
 * Initialisation du calendrier Toast UI
 */
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new tui.Calendar(calendarEl, {
        defaultView: 'week',
        useFormPopup: true,
        useDetailPopup: true,
        usageStatistics: false,
        isReadOnly: false,
        week: {
            startDayOfWeek: 1, // Lundi
            dayNames: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
            hourStart: 6,
            hourEnd: 23,
            taskView: true,
            // `allday` est INDISPENSABLE, pas decoratif : les blocs `externe`
            // et ceux du regime agrege sont rendus en evenements journee
            // entiere (voir `construireEvenementsPlan`). Avec le seul panneau
            // `time`, ils etaient construits, remis au calendrier, et
            // n'arrivaient jamais dans la page -- deux des trois regimes du
            // plan restaient invisibles, sans le moindre message.
            eventView: ['allday', 'time'],
            // Replier les doublons, oui -- mais un doublon, c'est la MEME
            // chose affichee deux fois, pas deux choses qui portent le meme
            // nom. Le groupage sur le seul titre repliait les blocs d'une
            // tache coupee en plusieurs creneaux : l'ordonnanceur leur donne
            // a tous la description de la tache, donc deux creneaux distincts
            // passaient pour un doublon. Un bloc s'affichait normalement,
            // l'autre en filet de 14px contre 85px -- comme s'ils avaient lieu
            // en meme temps. On exige donc aussi les memes bornes.
            collapseDuplicateEvents: {
                getDuplicateEvents: (targetEvent, events) => {
                    const instant = e => [
                        new Date(e.start).getTime(), new Date(e.end).getTime()
                    ].join('-');
                    const cible = instant(targetEvent);
                    return events.filter(event => event.title === targetEvent.title
                                              && instant(event) === cible);
                },
                getMainEvent: (events) => events[0]
            }
        },
        month: {
            dayNames: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
            startDayOfWeek: 1,
            narrowWeekend: true
        },
        template: {
            time(event) {
                // Un bloc hors filtre montre que le creneau est pris, et rien
                // d'autre : ni titre, ni donnee rendue dans le DOM.
                if (event.calendarId === CAL_HORS_FILTRE) {
                    return '<div class="calendar-event-hors-filtre"'
                         + ' title="Creneau occupe, hors du filtre courant"></div>';
                }
                if (estCalendrierDePlan(event.calendarId)) {
                    return gabaritBlocPlan(event);
                }
                return `<div class="calendar-event-title">${echapperHtml(event.title)}</div>`;
            },
            allday(event) {
                // Les blocs agreges (precision "jour") et externes du plan
                // sont les seuls evenements journee entiere de cette page.
                if (estCalendrierDePlan(event.calendarId)) {
                    return gabaritBlocPlan(event);
                }
                return `<div class="calendar-event-title">${echapperHtml(event.title)}</div>`;
            },
            popupSave() {
              return 'Ajouter';
            }
        },
        calendars: [
            {
                // Un seul calendrier pour les taches planifiees. Les deux
                // precedents, « Pool Pro » et « Pool Perso », n'etaient jamais
                // atteints : `calendarId` valait 'scheduled' pour toute tache
                // sans `pool`, c'est-a-dire pour toutes -- et 'scheduled' ne
                // figurait meme pas dans cette liste.
                id: 'scheduled',
                name: 'Planifie',
                backgroundColor: '#28a745',
                borderColor: '#1e7e34',
            },
            {
                id: CAL_HORS_FILTRE,
                name: 'Hors filtre',
                backgroundColor: '#b0b8c1',
                borderColor: '#8a929c',
            },
            {
                // Regime contraint (design.md §7) : un engagement, date, pose
                // contre son mur. Bleu soutenu, pour ne pas se confondre avec
                // le vert des taches deja planifiees dans Taskwarrior.
                id: CAL_PLAN_CONTRAINT,
                name: 'Plan - engagement',
                backgroundColor: '#0d47a1',
                borderColor: '#08306b',
            },
            {
                // Regime opportuniste : une suggestion, non datee, qui remplit
                // par urgence. Ambre, delibrement different du bleu contraint.
                id: CAL_PLAN_OPPORTUNISTE,
                name: 'Plan - suggestion',
                backgroundColor: '#ff8f00',
                borderColor: '#c56000',
            },
            {
                // Externe : delai fournisseur, ne consomme pas la capacite de
                // l'utilisateur. Gris en retrait, pour ne pas se lire comme un
                // engagement de travail.
                id: CAL_PLAN_EXTERNE,
                name: 'Plan - externe',
                backgroundColor: '#9e9e9e',
                borderColor: '#707070',
            }
        ]
    });

    updateCalendarTitle();
}

/**
 * Configuration des écouteurs d'événements 
 */
function setupEventListeners() {
    // Navigation du calendrier
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const todayBtn = document.getElementById('today-btn');
    const addTaskBtn = document.getElementById('add-task-btn');
    
    console.log('Boutons de navigation:', { prevBtn, nextBtn, todayBtn, addTaskBtn });
    
    prevBtn.addEventListener('click', () => {
        console.log('Bouton précédent cliqué');
        try {
            calendar.prev();
            console.log('Navigation précédente effectuée');
            updateCalendarTitle();
        } catch (error) {
            console.error('Erreur lors de la navigation précédente:', error);
        }
    });

    nextBtn.addEventListener('click', () => {
        console.log('Bouton suivant cliqué');
        try {
            calendar.next();
            console.log('Navigation suivante effectuée');
            updateCalendarTitle();
        } catch (error) {
            console.error('Erreur lors de la navigation suivante:', error);
        }
    });

    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            console.log('Bouton aujourd\'hui cliqué');
            try {
                calendar.today();
                console.log('Retour à aujourd\'hui effectué');
                updateCalendarTitle();
            } catch (error) {
                console.error('Erreur lors du retour à aujourd\'hui:', error);
            }
        });
    }
    
    // Bouton pour ajouter une nouvelle tâche
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Bouton ajouter tâche cliqué');
            if (typeof taskEditor !== 'undefined') {
                taskEditor.show(); // Ouvrir l'éditeur sans données de tâche
            } else {
                console.error('taskEditor is not defined');
                alert('Task editor is not available.');
            }
        });
    }

    // Changement de vue
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            changeView(view);
        });
    });

    // Actualiser
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadTasks();
    });

    // Calculer le plan (lot E2) : declenche le calcul cote serveur, puis
    // suit son etat jusqu'a la fin.
    const calculerPlanBtn = document.getElementById('calculer-plan-btn');
    if (calculerPlanBtn) {
        calculerPlanBtn.addEventListener('click', () => {
            lancerCalculPlan();
        });
    }

    // Filtres partages : le contexte et le statut filtrent cote serveur, donc
    // on recharge ; le projet et les tags filtrent cote client, un re-rendu
    // suffit. Recharger a chaque frappe relancerait TaskWarrior pour rien.
    document.addEventListener('tw-filter-change', (e) => {
        if (e.detail && e.detail.clientOnly) {
            filterAndDisplayTasks();
            // Le calendrier aussi : projet et tags redecoupent les blocs entre
            // « dans le filtre » et « hors filtre ».
            processTasksForCalendar();
        } else {
            loadTasks();
        }
    });

    const basculeHors = document.getElementById('filter-hors-filtre');
    if (basculeHors) {
        basculeHors.checked = currentFilter.horsFiltre;
        basculeHors.addEventListener('change', (e) => {
            currentFilter.horsFiltre = e.target.checked;
            try { localStorage.setItem(HORS_FILTRE_KEY, String(e.target.checked)); } catch {}
            processTasksForCalendar();
        });
    }

    const basculePretes = document.getElementById('filter-ready-only');
    if (basculePretes) {
        basculePretes.checked = currentFilter.readyOnly;
        basculePretes.addEventListener('change', (e) => {
            currentFilter.readyOnly = e.target.checked;
            try { localStorage.setItem(READY_ONLY_KEY, String(e.target.checked)); } catch {}
            filterAndDisplayTasks();
        });
    }

    document.getElementById('sort-tasks').addEventListener('change', (e) => {
        currentFilter.sort = e.target.value;
        filterAndDisplayTasks();
    });

    // Evenements liées à tui-calendar
    calendar.on('selectDateTime', handleSelectDateTimeEvent);

    calendar.on('beforeCreateEvent', handleBeforeCreateEvent);

    calendar.on('beforeUpdateEvent', handleBeforeUpdateEvent);

    // Écouter la suppression
    calendar.on('beforeDeleteEvent', handleBeforeDeleteEvent);

}

function handleSelectDateTimeEvent(eventInfo) {
    if (!selectedTaskData) return;

    const duration = parseEstTime(selectedTaskData.estTime);

    // La duree ne sert qu'a ajuster la fin du creneau. Tout le reste -- report
    // de la description, et surtout `tempEventData` -- doit avoir lieu dans
    // tous les cas. Ce bloc etait entierement enferme dans `if (duration)`,
    // alors que `parseEstTime` renvoie null des que estTime est absent : la
    // majorite des taches ne pouvaient donc pas etre planifiees. Pire,
    // `tempEventData` restant null, `handleBeforeCreateEvent` retombait sur sa
    // branche par defaut et creait une NOUVELLE tache au titre vide au lieu de
    // planifier celle qui etait selectionnee.
    const newEndDate = duration
        ? new Date(eventInfo.start.getTime() + duration * 60000)
        : eventInfo.end;

    // Le formulaire de TOAST UI n'est pas encore monte quand l'evenement est
    // emis, d'ou ce report.
    setTimeout(() => {
        const endInput = document.querySelector('input.toastui-calendar-content[name="end"]');
        const titleInput = document.querySelector('input.toastui-calendar-content[name="title"]');

        // Sans duree estimee, on laisse la fin proposee par le calendrier.
        if (duration) {
            if (endInput) {
                endInput.value = formatDateTimeForInput(newEndDate);
            } else {
                console.warn('End date input field not found');
            }
        }

        if (titleInput) {
            titleInput.value = selectedTaskData.description;
        } else {
            console.warn('Title input field not found');
        }
    }, 100);

    // Consomme par handleBeforeCreateEvent : c'est ce qui distingue
    // « planifier la tache selectionnee » de « creer une tache ».
    tempEventData = {
        id: selectedTaskData.uuid,
        start: eventInfo.start,
        end: newEndDate,
        title: selectedTaskData.description,
        isAllday: eventInfo.isAllday
    };
}

/**
 * Fonction pour gérer l'événement beforeCreateEvent 
 */
async function handleBeforeCreateEvent(eventObj) {
    let newEvent;
    // Use the temporarily stored event data if available
    if (tempEventData) {
        // Create the event with our modified data
        newEvent = {
            ...tempEventData,
            calendarId: eventObj.calendarId || 'scheduled'
        };
        tempEventData = null;// Clear the temporary data
    } else {
        // Default behavior if no temp data
        newEvent = {
            ...eventObj,
            id: 'toast_' + String(Date.now()),
            calendarId: eventObj.calendarId || 'scheduled'
        };
    }
    
    // Handle toast-prefixed events (new tasks)
    if (newEvent.id && newEvent.id.startsWith('toast_')) {
        // Create new task via API
        const newTaskData = {
            description: newEvent.title,
            scheduled: newEvent.start ? (newEvent.start instanceof Date ? DateFromISOtoTW(newEvent.start.toISOString()) : DateFromISOtoTW(newEvent.start)) : null,
            estTime: calculateDurationFromEvent(newEvent)
        };

        const result = await addTaskToBackend(newTaskData);
        if (result.success && result.task && result.task.uuid) {
            // Update the event with the real UUID
            newEvent.id = result.task.uuid;
        } else {
            console.error('Failed to create task to backend:', result.error || 'Unknown error');
            // Show error to user
            showError('Failed to create task to backend: ' + (result.error || 'Unknown error'));
        }
    }
    // Sync to backend if this is a TaskWarrior task (not a toast_ prefixed ID)
    else if (newEvent.id && !newEvent.id.startsWith('toast_')) {
        // Prepare task data in the format expected by the backend
        const modifiedTaskData = {
            description: newEvent.title,
            scheduled: newEvent.start ? DateFromISOtoTW(newEvent.start.toISOString()) : null
        };

        const result = await modifyTaskInBackend(newEvent.id, modifiedTaskData);
        if (!result.success) {
            console.error('Failed to sync task to backend:', result.error);
        }
    }

    calendar.createEvents([newEvent]);
    console.log('Event created :', newEvent);

    // NOUVEAU CODE : Suppression de la taskCard et réinitialisation
    if (selectedTaskCard && selectedTaskData) {
        // Supprimer la taskCard du DOM
        selectedTaskCard.remove();

        // Supprimer la tâche du tableau unplannedTasks (suppression logique)
        const taskIndex = unplannedTasks.findIndex(task => task.uuid === selectedTaskData.uuid);
        if (taskIndex !== -1) {
            unplannedTasks.splice(taskIndex, 1);
        }

        // Réinitialiser les variables
        selectedTaskCard = null;
        selectedTaskData = null;
        tempEventData = null;

        // Mettre à jour le compteur de tâches
        updateTaskCount();
    }
}

/**
 * Fonction pour gérer l'événement beforeUpdateEvent
 */
async function handleBeforeUpdateEvent({ event, changes }) {
    // Only handle TaskWarrior tasks (not toast_ prefixed IDs)
    if (event.id && !event.id.startsWith('toast_')) {
        // Prepare task data in the format expected by the backend
        const modifiedTaskData = {
            description: changes.title || event.title,
            scheduled: null
        };

        // Handle scheduled date using the new helper function
        console.log("Processing date changes - changes.start:", changes.start);
        console.log("Processing date changes - event.start:", event.start);
        
        // Extract dates using the helper function
        const extractedStartDate = extractDateFromToastChange(changes.start);
        const extractedEndDate = extractDateFromToastChange(changes.end);
        
        // Use extracted start date or fall back to event start date
        const finalStartDate = extractedStartDate || extractDateFromToastChange(event.start);
        const finalEndDate = extractedEndDate || extractDateFromToastChange(event.end);
        
        console.log("Extracted start date:", finalStartDate);
        console.log("Extracted end date:", finalEndDate);
        
        // Set scheduled date if we have a valid start date
        if (finalStartDate) {
            modifiedTaskData.scheduled = DateFromISOtoTW(finalStartDate.toISOString());
            console.log("Final scheduled date for backend:", modifiedTaskData.scheduled);
        } else {
            console.warn("No valid start date found - scheduled will remain null");
        }
        
        // Add duration if we have valid dates
        if (finalStartDate && finalEndDate) {
            const duration = calculateDurationFromEvent({
                start: finalStartDate,
                end: finalEndDate
            });
            modifiedTaskData.estTime = duration;
            console.log("Calculated duration:", duration);
        } else if (finalStartDate) {
            // If we have a start date but no end date, use default duration
            modifiedTaskData.estTime = 'PT30M';
            console.log("Using default duration PT30M (no end date available)");
        }

        try {
            console.log("Status : modifiedTaskData : ", modifiedTaskData);
            const result = await modifyTaskInBackend(event.id, modifiedTaskData);
            if (!result.success) {
                console.error('Failed to sync task update to backend:', result.error);
                showError('Failed to update task: ' + (result.error || 'Unknown error'));
                return false; // Prevent the update if backend sync fails
            }
            console.log('Task updated successfully:', event.id);
        } catch (error) {
            console.error('Error updating task:', error);
            showError('Error updating task: ' + error.message);
            return false;
        }
    }

    // Allow the update to proceed
    calendar.updateEvent(event.id, event.calendarId, changes);
    return true;

}

/**
 * Fonction pour gérer l'événement beforeDeleteEvent
 * Supprime la date planifiée d'une tâche au lieu de la supprimer complètement
 */
async function handleBeforeDeleteEvent(event) {
    // Only handle TaskWarrior tasks (not toast_ prefixed IDs)
    if (event.id && !event.id.startsWith('toast_')) {
        console.log('Handling delete event for task:', event.id);
        
        try {
            // Prepare task data to remove the scheduled date
            // Setting scheduled to null or empty string will unschedule the task
            const modifiedTaskData = {
                scheduled: null  // This removes the scheduled date from the task
            };

            console.log('Attempting to unschedule task by removing scheduled date:', modifiedTaskData);
            
            // Call the backend to modify the task (remove scheduled date)
            const result = await modifyTaskInBackend(event.id, modifiedTaskData);
            
            if (result.success) {
                console.log('Task unscheduled successfully:', event.id);
                showSuccess('Task has been unscheduled and moved back to the unplanned tasks list.');
                
                // Remove from calendar frontend
                calendar.deleteEvent(event.id, event.calendarId);
                
                // Refresh the unplanned tasks list to show the newly unscheduled task
                loadTasks();
                
                return true;
            } else {
                console.error('Failed to unschedule task:', result.error);
                showError('Failed to unschedule task: ' + (result.error || 'Unknown error'));
                return false; // Prevent deletion if backend sync fails
            }
        } catch (error) {
            console.error('Error unscheduling task:', error);
            showError('Error unscheduling task: ' + error.message);
            return false;
        }
    } else {
        // For toast_ prefixed events (new events not yet saved), just delete from calendar
        console.log('Deleting temporary event (toast_ prefixed):', event.id);
        calendar.deleteEvent(event.id, event.calendarId);
        return true;
    }
}

/**
 * Chargement des tâches depuis l'API 
 */
function loadTasks() {
    console.log('Chargement des tâches...');
    // Les taches a planifier suivent le contexte et le statut de la barre nav,
    // appliques par TaskWarrior lui-meme. La page les ignorait entierement.
    const params = window.twNav ? window.twNav.stateToParams() : 'status=pending';
    fetch('/api/tasks?' + params)
        .then(response => response.json())
        .then(data => {
            console.log('Tâches non planifiées reçues:', data);
            if (data.success) {
                // Réinitialiser allTasks avant d'ajouter les nouvelles tâches
                allTasks = [];
                const initialTasks = data.tasks || [];
                // Premiere source : ce que le backend retient du filtre. On
                // garde les UUID -- planifiees comprises -- pour savoir plus
                // bas quels blocs sont dans le filtre et lesquels n'y sont pas.
                uuidsEnContexte = new Set(initialTasks.map(t => t.uuid));
                unplannedTasks = initialTasks.filter(task => !task.scheduled);
                console.log(`${unplannedTasks.length} tâches non planifiées trouvées`);
                filterAndDisplayTasks();

                // Charger les tâches planifiées
                console.log('Chargement des tâches planifiées...');
                return fetch('/api/tasks/planned');
            } else {
                throw new Error(data.error || 'Erreur lors du chargement des tâches');
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log('Tâches planifiées reçues:', data);
            if (data.success) {
                const plannedTasks = data.data || [];
                console.log(`${plannedTasks.length} tâches planifiées trouvées`);
                
                // Afficher les détails des tâches planifiées pour le débogage
                plannedTasks.forEach((task, index) => {
                    /*
                    console.log(`Tâche planifiée ${index + 1}:`, {
                        description: task.description,
                        scheduled: task.scheduled,
                        due: task.due,
                        estTime: task.estTime
                    });
                    //*/
                });
                
                // Mettre à jour allTasks avec les tâches non planifiées et planifiées
                allTasks = [...unplannedTasks, ...plannedTasks];
                console.log(`Total des tâches chargées: ${allTasks.length} (${unplannedTasks.length} non planifiées, ${plannedTasks.length} planifiées)`);
                processTasksForCalendar();
            } else {
                console.error('Erreur lors du chargement des tâches planifiées:', data.error);
            }
        })
        .catch(error => {
            console.error('Erreur lors du chargement des tâches:', error);
            showError('Erreur lors du chargement des tâches: ' + error.message);
        });
}

/**
 * Traitement des tâches pour le calendrier 
 */
function processTasksForCalendar() {
    // Séparer les tâches planifiées et non planifiées
    const scheduledTasks = [];
    unplannedTasks = [];

    allTasks.forEach(task => {
        if (task.scheduled) {
            scheduledTasks.push(task);
        } else {
            unplannedTasks.push(task);
        }
    });

    // Seconde source : /api/tasks/planned renvoie **tous** les creneaux pris,
    // sans filtre. Les masquer ferait planifier deux choses en meme temps ;
    // ceux qui sortent du filtre sont donc rendus hachures et muets.
    const events = [];
    scheduledTasks.forEach(task => {
        try {
            const dedans = estDansLeFiltre(task);
            if (!dedans && !currentFilter.horsFiltre) return;
            const event = createCalendarEvent(task, task.scheduled, dedans);
            if (event) {
                events.push(event);
            }
        } catch (e) {
            console.error('Erreur lors de la création de l\'événement pour la tâche:', task, e);
        }
    });
    
    // Effacer les événements existants et ajouter les nouveaux
    calendar.clear();
    if (events.length > 0) {
        calendar.createEvents(events);
    }
    // Le plan (lot 9) est independant des taches Taskwarrior deja planifiees :
    // il vient s'ajouter, jamais remplacer. `planEvents` est vide tant qu'aucun
    // plan valide n'a ete charge -- degradation propre par simple absence.
    if (planEvents.length > 0) {
        calendar.createEvents(planEvents);
    }

    // Mettre à jour l'affichage
    calendar.render();
}

/**
 * Créer un événement calendrier depuis une tâche 
 */
function createCalendarEvent(task, scheduledDate, dansLeFiltre = true) {
    // Vérifier et formater la date de planification au format ISO 8601 (20251220T120000Z)
    let start;
    try {
        // Convertir le format 20251220T120000Z en 2025-12-20T12:00:00Z pour une meilleure compatibilité
        const isoDate = scheduledDate.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            '$1-$2-$3T$4:$5:$6Z'
        );
        start = new Date(isoDate);
        
        if (isNaN(start.getTime())) {
            console.error('Date de planification invalide:', scheduledDate, 'formaté en:', isoDate, 'pour la tâche:', task);
            return null;
        } else {
            //console.log('Date convertie avec succès:', scheduledDate, '->', start);
        }
    } catch (e) {
        console.error('Erreur lors de la création de la date:', e, 'pour la tâche:', task);
        return null;
    }
    
    // Définir une durée par défaut si nécessaire
    let duration;
    if (task.estTime && task.estTime.startsWith('PT')) {
        // Format ISO 8601 pour la durée (ex: PT1H pour 1 heure, PT30M pour 30 minutes)
        const durationMatch = task.estTime.match(/PT(\d+H)?(\d+M)?/);
        let hours = 0, minutes = 0;
        if (durationMatch) {
            if (durationMatch[1]) hours = parseInt(durationMatch[1]);
            if (durationMatch[2]) minutes = parseInt(durationMatch[2]);
        }
        duration = hours * 60 + minutes;
    }
    
    // Durée par défaut de 60 minutes si non spécifiée ou invalide
    duration = duration || 60;
    const end = new Date(start.getTime() + duration * 60000);

    // Hors filtre : on annonce un creneau occupe, et rien de plus. Ni titre,
    // ni `raw` -- la fiche de detail ne doit pas rendre ce qu'on vient de
    // masquer dans la grille.
    if (!dansLeFiltre) {
        return {
            id: task.uuid,
            calendarId: CAL_HORS_FILTRE,
            title: '',
            start: start,
            end: end,
            isReadOnly: true,
            raw: { uuid: task.uuid }
        };
    }

    return {
        id: task.uuid,
        calendarId: 'scheduled',
        title: task.description,
        start: start,
        end: end,
        isReadOnly: false,
        raw: task
    };
}

/**
 * TaskActionHandler pour calendar-planner.js
 */
class CalendarTaskActionHandler extends TaskActionHandler {
    constructor() {
        super({
            onEditRequest: (task) => {
                console.log('Appel de la fonction onEditRequest !')
                if (typeof taskEditor !== 'undefined') {
                    taskEditor.showForTask(task);
                } else {
                    console.error('taskEditor is not defined in calendar-planner');
                    alert('Task editor is not available in this view.');
                }
            }
        });
    }
    
    performTaskAction(taskUuid, action) {
        console.log('Action performed:', action, 'on task:', taskUuid);
    }
    
    confirmDelete(taskUuid) {
        console.log('Delete confirmed for task:', taskUuid);
    }
}

/**
 * Configuration de la sélection des tâches 
 */
function handleTaskCardClick(cardElement) {
    console.log('Evenement declenché !');
    // Deselect currently selected card if it's different
    if (selectedTaskCard && selectedTaskCard !== cardElement) {
        selectedTaskCard.classList.remove('selected');
    }

    // Toggle selection on clicked card
    if (selectedTaskCard === cardElement) {
        // Clicking the same card again - deselect it
        cardElement.classList.remove('selected');
        selectedTaskCard = null;
        selectedTaskData = null;
        tempEventData = null;
    } else {
        // Select the new card
        cardElement.classList.add('selected');
        selectedTaskCard = cardElement;
        selectedTaskData = JSON.parse(cardElement.dataset.taskData);
        
        console.log('Task selected:', selectedTaskData.description);
        console.log('tempEventData updated:', tempEventData);
    }
}
/**
 * Fonction pour obtenir la tâche sélectionnée 
 */
function getSelectedTask() {
    return selectedTaskData;
}

/**
 * Filtrer et afficher les tâches non planifiées 
 */
// Projet et tags, depuis la barre nav. Le projet est un prefixe sur la
// hierarchie pointee, comme TaskWarrior : `Maison` retient `Maison.Cuisine`.
//
// Remplace le menu des pools, qui recopiait a la main sur chaque tache une
// information deja portee par ses tags -- et qui mentait : `task.pool ||
// 'pro'` declarait « pro » toute tache sans pool.
function passeProjetEtTags(task) {
    const etatNav = window.twNav ? window.twNav.getState() : {};
    const projet = (etatNav.project || '').trim();
    const tags = window.twNav ? window.twNav.getTags(etatNav) : [];
    if (projet) {
        const porte = task.project || '';
        if (porte !== projet && !porte.startsWith(projet + '.')) return false;
    }
    if (tags.length && !tags.every(tag => (task.tags || []).includes(tag))) return false;
    return true;
}

// Une tache est « dans le filtre » si le backend l'a renvoyee pour le contexte
// et le statut courants, **et** qu'elle passe le filtre client.
function estDansLeFiltre(task) {
    return uuidsEnContexte.has(task.uuid) && passeProjetEtTags(task);
}

function filterAndDisplayTasks() {
    let filteredTasks = [...unplannedTasks];

    filteredTasks = filteredTasks.filter(passeProjetEtTags);

    // Ne garder que les taches pretes a etre planifiees, c'est-a-dire dont la
    // duree est exploitable. `parseEstTime` fait autorite : une valeur presente
    // mais illisible ne rend pas la tache prete pour autant.
    let masquees = 0;
    if (currentFilter.readyOnly) {
        const avant = filteredTasks.length;
        filteredTasks = filteredTasks.filter(task => parseEstTime(task.estTime));
        masquees = avant - filteredTasks.length;
    }

    // Trier
    filteredTasks.sort((a, b) => {
        switch (currentFilter.sort) {
            case 'urgency':
                return (b.urgency || 0) - (a.urgency || 0);
            case 'due':
                if (!a.due && !b.due) return 0;
                if (!a.due) return 1;
                if (!b.due) return -1;
                return new Date(a.due) - new Date(b.due);
            case 'duration':
                const durationA = parseEstTime(a.estTime) || 0;
                const durationB = parseEstTime(b.estTime) || 0;
                return durationB - durationA;
            default:
                return 0;
        }
    });

    displayUnplannedTasks(filteredTasks, masquees);
}

/**
 * Afficher les tâches non planifiées 
 */
function displayUnplannedTasks(tasks, masquees = 0) {
    const container = document.getElementById('unplanned-tasks');
    const countEl = document.getElementById('task-count');

    // Annoncer ce qui est masque : une tache qui disparait sans explication
    // est une tache qu'on oublie d'estimer.
    const suffixe = masquees > 0 ? ` (+${masquees} sans durée)` : '';
    countEl.textContent = `${tasks.length} tâche${tasks.length > 1 ? 's' : ''}${suffixe}`;

    if (tasks.length === 0) {
        const explication = masquees > 0
            ? `<p>${masquees} tâche${masquees > 1 ? 's' : ''} en attente d'une durée estimée.<br>
                  Décochez « Prêtes seulement » pour les afficher.</p>`
            : '<p>Aucune tâche à planifier</p>';
        container.innerHTML = `
            <div class="empty-message">
                <span class="icon">✅</span>
                ${explication}
            </div>
        `;
        return;
    }

    // Vide le conteneur
    container.innerHTML = '';

    // Crée et ajoute chaque carte de tâche.
    // Une carte qui echoue ne doit pas interrompre le rendu des autres.
    let nonAffichees = 0;
    tasks.forEach(task => {
        try {
            container.appendChild(taskCardManager.createTaskCard(task, 'full'));
        } catch (e) {
            if (nonAffichees === 0) console.error(e);
            nonAffichees++;
        }
    });
    if (nonAffichees > 0) {
        showError(`${nonAffichees} tâche(s) non affichées : template de carte indisponible.`);
    }
}

/**
 * Met à jour le compteur de tâches sans recharger depuis le serveur
 */
function updateTaskCount() {
    const container = document.getElementById('unplanned-tasks');
    const countEl = document.getElementById('task-count');

    // Compter les taskCards restantes
    const remainingCards = container.querySelectorAll('.task-card').length;

    countEl.textContent = `${remainingCards} tâche${remainingCards > 1 ? 's' : ''}`;

    // Si plus aucune tâche, afficher le message "Aucune tâche à planifier"
    if (remainingCards === 0) {
        container.innerHTML = `
            <div class="empty-message">
                <span class="icon">✅</span>
                <p>Aucune tâche à planifier</p>
            </div>
        `;
    }
}


// La fonction createTaskCard est maintenant gérée par taskCardManager
/**
 * Changement de vue du calendrier 
 */
function changeView(view) {
    calendar.changeView(view);
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });

    updateCalendarTitle();
}

/**
 * Mide à jour du titre du calendrier 
 */
function updateCalendarTitle() {
    const titleEl = document.getElementById('calendar-title');
    
    try {
        const dateRange = calendar.getDateRangeStart();
        const view = calendar.getViewName();
        
        // Extraire la date de l'objet dateRange
        let startDate;
        if (dateRange && dateRange.d) {
            // Si dateRange a une propriété 'd' (cas de Toast UI Calendar)
            startDate = new Date(dateRange.d);
        } else if (dateRange instanceof Date || (dateRange && dateRange.getTime)) {
            // Si c'est déjà un objet Date
            startDate = new Date(dateRange);
        } else {
            // Fallback sur la date actuelle
            startDate = new Date();
        }
        
        let title = '';
        
        if (view === 'month') {
            // Pour la vue mois, on prend le 1er jour du mois de la première semaine complète
            // pour éviter d'afficher le mois précédent
            let firstDayOfMonth = new Date(startDate);
            
            // Si on n'est pas le 1er du mois, on passe au mois suivant
            if (firstDayOfMonth.getDate() > 1) {
                firstDayOfMonth.setMonth(firstDayOfMonth.getMonth() + 1, 1);
            }
            
            title = firstDayOfMonth.toLocaleDateString('fr-FR', { 
                month: 'long', 
                year: 'numeric' 
            });
        } else if (view === 'week') {
            let endDateObj = calendar.getDateRangeEnd();
            let endDate = endDateObj && (endDateObj.d ? new Date(endDateObj.d) : new Date(endDateObj));
            
            if (!endDate || isNaN(endDate.getTime())) {
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 6); // Ajoute 6 jours pour avoir une semaine complète
            }
            
            title = `${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        } else {
            // Vue jour
            title = startDate.toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            });
        }

        titleEl.textContent = title.charAt(0).toUpperCase() + title.slice(1);
        console.log('Titre mis à jour:', titleEl.textContent);
    } catch (error) {
        console.error('Erreur lors de la mise à jour du titre:', error);
    }
}

/**
 * Fonctions utilitaires 
 */
function parseEstTime(estTime) {
    if (!estTime) return null;
    
    // Handle ISO 8601 duration format (PT2H30M) that TaskWarrior uses
    if (estTime.startsWith('PT')) {
        const match = estTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
            const hours = parseInt(match[1] || 0);
            const minutes = parseInt(match[2] || 0);
            const seconds = parseInt(match[3] || 0);
            
            return hours * 60 + minutes + Math.round(seconds / 60);
        }
    }
    
    // Fallback for old format: "1h30min" ou "30min" ou "1h"
    const match = estTime.match(/(\d+)h|(\d+)min/g);
    if (!match) return null;

    let minutes = 0;
    match.forEach(part => {
        if (part.includes('h')) {
            minutes += parseInt(part) * 60;
        } else if (part.includes('min')) {
            minutes += parseInt(part);
        }
    });

    return minutes;
}

/**
 * Extracts a Date object from Toast UI Calendar change objects
 * Handles the nested structure: { tzOffset: null, d: { d: Date(...) } }
 * @param {Object} changeObj - The change object from Toast UI Calendar
 * @returns {Date|null} - The extracted Date object or null if not found
 */
function extractDateFromToastChange(changeObj) {
    if (!changeObj) {
        console.log('extractDateFromToastChange: null/undefined input');
        return null;
    }

    // Log the original structure for debugging
    console.log('Extracting date from object:', changeObj);

    // Case 1: Already a Date object
    if (changeObj instanceof Date) {
        console.log('Direct Date object found');
        return changeObj;
    }

    // Case 2: Toast UI nested structure { tzOffset: null, d: { d: Date(...) } }
    if (changeObj.d && changeObj.d.d && changeObj.d.d instanceof Date) {
        console.log('Toast UI nested Date structure found:', changeObj.d.d);
        return changeObj.d.d;
    }

    // Case 3: Simpler nested structure { d: Date(...) }
    if (changeObj.d && changeObj.d instanceof Date) {
        console.log('Simple nested Date structure found:', changeObj.d);
        return changeObj.d;
    }

    // Case 4: String format
    if (typeof changeObj === 'string') {
        console.log('String date found, creating Date object:', changeObj);
        const date = new Date(changeObj);
        return isNaN(date.getTime()) ? null : date;
    }

    // Case 5: Try to create Date from object (fallback)
    try {
        const date = new Date(changeObj);
        if (!isNaN(date.getTime())) {
            console.log('Created Date from object:', date);
            return date;
        }
    } catch (e) {
        console.error('Failed to create Date from object:', e);
    }

    console.warn('Could not extract valid Date from object:', changeObj);
    return null;
}

async function addTaskToBackend(taskData) {
    /**
     * Add a new task to the backend
     * @param {Object} taskData - Task data to add
     * @returns {Promise<Object>} - Promise that resolves to {success: boolean, task: Object, error: string}
     */
    try {
        const response = await fetch('/api/task/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });

        const data = await response.json();

        if (data.success && data.task) {
            return {
                success: true,
                task: data.task,
                error: null
            };
        } else {
            return {
                success: false,
                task: null,
                error: data.error || 'Unknown error creating task'
            };
        }
    } catch (error) {
        console.error('Network error creating task:', error);
        return {
            success: false,
            task: null,
            error: error.message || 'Network error'
        };
    }
}


async function modifyTaskInBackend(taskId, taskData) {
    try {
        const response = await fetch(`/api/task/${taskId}/modify`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });
        const data = await response.json();

        return {
            success: data.success,
            error: data.error || 'Unknown error creating task'
        };
       
    } catch (error) {
        console.error('Network error modifying task:', error);
        return {
            success: false,
            error: error.message || 'Network error'
        };

    }
}
function calculateDurationFromEvent(event) {
    // Calculate duration between event.start and event.end
    // Returns ISO 8601 duration format (PT2H30M)
    
    if (!event || !event.start || !event.end) {
        console.warn('Event missing start or end time, using default duration');
        return 'PT30M'; // Default 30 minutes
    }
    
    try {
        // Handle cases where start/end might be strings or Date objects
        const startDate = event.start instanceof Date ? event.start : new Date(event.start);
        const endDate = event.end instanceof Date ? event.end : new Date(event.end);
        
        // Check for invalid dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.warn('Invalid date format in event, using default duration');
            return 'PT30M';
        }
        
        // Calculate duration in milliseconds
        const durationMs = endDate - startDate;
        
        // Handle negative or zero duration
        if (durationMs <= 0) {
            console.warn('Zero or negative duration, using default duration');
            return 'PT30M';
        }
        
        // Convert to hours and minutes
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        
        // Format as ISO 8601 duration (PT2H30M)
        let durationString = 'PT';
        if (hours > 0) {
            durationString += `${hours}H`;
        }
        if (minutes > 0) {
            durationString += `${minutes}M`;
        }
        
        // Default to PT30M if duration is 0 (shouldn't happen due to above check)
        return durationString === 'PT' ? 'PT30M' : durationString;
        
    } catch (error) {
        console.error('Error calculating duration:', error);
        return 'PT30M'; // Fallback to default
    }
}

function DateFromISOtoTW(isoString) {
    // Convert ISO string to YYYY-MM-DDTHH:MM:SS format
    // Input format: 20251220T120000Z or 2025-12-20T12:00:00Z
    // Output format: 2025-12-20T12:00:00
    
    if (!isoString) return null;
    
    // Handle both formats: 20251220T120000Z and 2025-12-20T12:00:00Z
    let date;
    
    // First try the compact format (20251220T120000Z)
    if (/^\d{8}T\d{6}Z$/.test(isoString)) {
        // Convert 20251220T120000Z to 2025-12-20T12:00:00
        const formatted = isoString.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            '$1-$2-$3T$4:$5:$6'
        );
        return formatted;
    }
    // Try the standard ISO format (2025-12-20T12:00:00Z)
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(isoString)) {
        // Remove the Z at the end
        return isoString.slice(0, -1);
    }
    // Try format without Z (2025-12-20T12:00:00)
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoString)) {
        return isoString;
    }
    
    // If format doesn't match, try to parse as Date and format
    try {
        date = new Date(isoString);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        }
    } catch (e) {
        console.error('Error parsing date:', e);
        return null;
    }
    
    return null;
}
function formatDateTimeForInput(date) {
    // Format a Date object as 'YYYY-MM-DD HH:MM' (with space separator)
    if (!date || !(date instanceof Date)) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0 && mins > 0) {
        return `${hours}h${mins}min`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${mins}min`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    // Simple notification (peut être amélioré avec une bibliothèque de notifications)
    console.log('✅', message);
    alert(message);
}

function showError(message) {
    console.error('❌', message);
    alert(message);
}
