/**
 * Champ Projets a bulles, partage par le graphe (graphe.js) et la fenetre
 * « Calculer le plan » (calendar-planner.js).
 *
 * Recherche floue (sous-sequence, insensible a la casse) dans la liste de
 * `window.twNav.projectsReady`, suggestions au clavier (fleches, Entree,
 * Retour arriere retire la derniere bulle), bulles retirables, selection
 * retenue en localStorage.
 *
 *   const champ = ChampProjets.creer({
 *       champ, puces, suggestions,        // elements du DOM (saisie, bulles, <ul>)
 *       cleStockage: 'ma-cle',
 *       classesSupplementaires: { puce: '...', retirer: '...', suggestion: '...',
 *                                 suggestionActive: '...' },   // optionnel
 *       onChange: (selection) => {},      // apres chaque ajout ou retrait
 *   });
 *   champ.selection()    // copie de la liste choisie
 *   champ.definir(liste) // remplace la selection (sans onChange)
 *
 * Classes generiques : .champ-projets-puce, .champ-projets-puce-retirer,
 * .champ-projets-suggestion, .champ-projets-suggestion--active
 * (cf. champ-projets.css).
 */
(function () {
    const MAX_SUGGESTIONS = 8;

    // Sous-sequence insensible a la casse : les lettres tapees apparaissent
    // dans l'ordre, pas forcement contigues.
    function correspondFlou(nom, saisie) {
        const n = nom.toLowerCase();
        let pos = 0;
        for (const c of saisie) {
            pos = n.indexOf(c, pos);
            if (pos === -1) return false;
            pos++;
        }
        return true;
    }

    function creer(options) {
        const { champ, puces, suggestions, cleStockage } = options;
        const sup = options.classesSupplementaires || {};
        const onChange = options.onChange || (() => {});
        const classes = (base, extra) => (extra ? base + ' ' + extra : base);

        let selection = lireSelection();
        let projetsConnusCache = [];
        let suggestionsAffichees = [];
        let suggestionActive = -1;
        let requeteSuggestions = 0;

        function lireSelection() {
            try {
                const brut = JSON.parse(localStorage.getItem(cleStockage));
                if (Array.isArray(brut)) {
                    return brut.filter((p, i) => typeof p === 'string' && p && brut.indexOf(p) === i);
                }
            } catch (e) { /* stockage indisponible ou corrompu : selection vide */ }
            return [];
        }

        function ecrireSelection() {
            try { localStorage.setItem(cleStockage, JSON.stringify(selection)); } catch (e) { /* ignore */ }
        }

        // nav.js remplace projectsReady apres sa creation : on le relit a chaque
        // besoin tant que la liste obtenue est vide.
        async function projetsConnus() {
            if (projetsConnusCache.length) return projetsConnusCache;
            try {
                const liste = window.twNav ? await window.twNav.projectsReady : [];
                if (Array.isArray(liste) && liste.length) projetsConnusCache = liste;
            } catch (e) { /* liste indisponible : aucune suggestion */ }
            return projetsConnusCache;
        }

        function calculerSuggestions(projets, saisie) {
            const q = saisie.trim().toLowerCase().replace(/\s+/g, '');
            if (!q) return [];
            const candidats = projets.filter(p => !selection.includes(p) && correspondFlou(p, q));
            // Les correspondances contigues d'abord, sinon l'ordre de la liste.
            const contigus = candidats.filter(p => p.toLowerCase().includes(q));
            const autres = candidats.filter(p => !p.toLowerCase().includes(q));
            return contigus.concat(autres).slice(0, MAX_SUGGESTIONS);
        }

        function afficherSuggestions() {
            suggestions.innerHTML = '';
            suggestionsAffichees.forEach((nom, i) => {
                const li = document.createElement('li');
                li.className = classes('champ-projets-suggestion', sup.suggestion);
                if (i === suggestionActive) {
                    li.classList.add('champ-projets-suggestion--active');
                    if (sup.suggestionActive) li.classList.add(sup.suggestionActive);
                }
                li.textContent = nom;
                // mousedown + preventDefault : le champ garde le focus
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    ajouterProjet(nom);
                });
                suggestions.appendChild(li);
            });
            suggestions.hidden = suggestionsAffichees.length === 0;
        }

        async function majSuggestions() {
            const id = ++requeteSuggestions;
            const projets = await projetsConnus();
            if (id !== requeteSuggestions) return;
            suggestionsAffichees = calculerSuggestions(projets, champ.value);
            suggestionActive = -1;
            afficherSuggestions();
        }

        function afficherPuces() {
            puces.innerHTML = '';
            for (const nom of selection) {
                const puce = document.createElement('span');
                puce.className = classes('champ-projets-puce', sup.puce);
                puce.dataset.projet = nom;
                const libelle = document.createElement('span');
                libelle.textContent = nom;
                const retirer = document.createElement('button');
                retirer.type = 'button';
                retirer.className = classes('champ-projets-puce-retirer', sup.retirer);
                retirer.textContent = '×';
                retirer.setAttribute('aria-label', 'Retirer ' + nom);
                retirer.addEventListener('click', () => retirerProjet(nom));
                puce.append(libelle, retirer);
                puces.appendChild(puce);
            }
        }

        function selectionChangee() {
            ecrireSelection();
            afficherPuces();
            onChange(selection.slice());
        }

        function ajouterProjet(nom) {
            if (!selection.includes(nom)) selection.push(nom);
            champ.value = '';
            requeteSuggestions++;
            suggestionsAffichees = [];
            suggestionActive = -1;
            afficherSuggestions();
            selectionChangee();
        }

        function retirerProjet(nom) {
            selection = selection.filter(p => p !== nom);
            selectionChangee();
        }

        afficherPuces();
        projetsConnus(); // echauffement : la premiere frappe n'attend plus
        champ.addEventListener('input', majSuggestions);
        champ.addEventListener('focus', () => { if (champ.value) majSuggestions(); });
        champ.addEventListener('blur', () => { suggestions.hidden = true; });
        champ.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!suggestionsAffichees.length) return;
                e.preventDefault();
                suggestionActive = e.key === 'ArrowDown'
                    ? Math.min(suggestionActive + 1, suggestionsAffichees.length - 1)
                    : Math.max(suggestionActive - 1, 0);
                afficherSuggestions();
            } else if (e.key === 'Enter') {
                // Sans suggestion active, la premiere ; sans suggestion du
                // tout, rien (projets connus seulement).
                e.preventDefault();
                const choix = suggestionsAffichees[Math.max(suggestionActive, 0)];
                if (choix) ajouterProjet(choix);
            } else if (e.key === 'Backspace' && !champ.value && selection.length) {
                retirerProjet(selection[selection.length - 1]);
            }
        });

        return {
            selection: () => selection.slice(),
            definir(liste) {
                selection = liste.filter((p, i) => typeof p === 'string' && p && liste.indexOf(p) === i);
                ecrireSelection();
                afficherPuces();
            },
        };
    }

    window.ChampProjets = { creer };
})();
