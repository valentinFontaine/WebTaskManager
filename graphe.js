/**
 * graphe.html — visualisation des dependances d'un projet, rendue par
 * Mermaid (charge depuis CDN, version majeure figee dans graphe.html).
 *
 * Le projet affiche vient du champ #tw-project de nav.js (cf. nav.js).
 * Contrairement aux autres pages, cette page n'a jamais en memoire les
 * donnees d'un projet avant de l'avoir demande : elle relance donc
 * /api/graphe a chaque changement de state.project, meme quand
 * l'evenement `tw-filter-change` porte `clientOnly: true` (cf. l'en-tete
 * de tests/graphe.spec.js).
 *
 * Forme de la reponse attendue de GET /api/graphe (voir construire_graphe
 * dans main_fastapi.py) :
 *   { projet, noeuds: [{ uuid, description, project, estTime, due,
 *                          externe, fige, dans_projet }],
 *     aretes: [{ de, vers }] }
 *
 * Cadres imbriques (subgraphs) : un cadre par valeur distincte de `project`
 * parmi les noeuds du projet demande et de ses sous-projets, imbrique selon
 * la hierarchie a points (NPD.Orion.achats.devis -> NPD.Orion > achats >
 * devis). Un sous-projet intermediaire sans tache propre recoit quand meme
 * son cadre s'il a des enfants. Chaque cadre porte `data-cadre="<nom
 * complet>"` et `title="<nom complet>"` (poses apres coup, Mermaid n'offre
 * pas ces attributs) ; le libelle affiche dans le cadre est son dernier
 * segment seulement. Les projets voisins hors de l'arbre du projet demande
 * (dans_projet: false) gardent un cadre plat, non imbrique.
 *
 * Zoom / deplacement : svg-pan-zoom (CDN jsdelivr, version figee 3.6.1).
 * Choisi plutot qu'une implementation maison parce que la molette et le
 * glisser demandent tous deux de composer une transformation SVG (translate
 * + scale) tout en desactivant le defilement de la page pendant le survol,
 * ce que la bibliotheque fait deja de facon eprouvee ; l'ecrire a la main
 * n'aurait rien simplifie pour un gain de taille de code negligeable.
 *
 * Edition d'une tache depuis un noeud (H3) : un bouton stylo est pose APRES
 * le rendu Mermaid, en DOM (createElement + textContent/aria-label), plutot
 * qu'injecte dans le texte du libelle Mermaid. Deux raisons : le libelle
 * Mermaid passe par sa propre syntaxe d'echappement (echapperLabel), qui ne
 * connait rien du HTML d'un bouton -- y injecter un <button> obligerait a
 * dupliquer/contourner cet echappement au risque de casser la securite deja
 * en place (securityLevel 'loose' + htmlLabels rend Mermaid capable
 * d'interpreter du HTML dans un libelle, donc une description mal echappee y
 * deviendrait une injection) ; et le label rendu est de toute facon un
 * foreignObject HTML (htmlLabels), donc y ajouter un <button> apres coup est
 * strictement equivalent visuellement sans repasser par cette syntaxe.
 * Seuls les noeuds `dans_projet: true` recoivent le bouton (voir
 * appliquerAttributsNoeuds). Au clic, la tache complete est recuperee via
 * GET /api/tasks (et non depuis le noeud /api/graphe, qui n'expose ni tags,
 * ni priority, ni scheduled) puis passee a taskEditor.showForTask.
 *
 * Edition des dependances depuis le graphe (H2) : un clic (pas un glisser)
 * sur un noeud dans_projet le selectionne (classe `selectionne`) ; le bouton
 * "Relier" (desactive sans selection) passe en mode liaison, ou les
 * selectionnes recoivent la classe `source-liaison`. Le clic suivant sur un
 * noeud dans_projet non selectionne poste /api/task/<cible>/depends avec
 * ajouter=[selectionnes], puis redessine. Une fleche cliquee recoit
 * `lien-selectionne` (elle porte data-de/data-vers) ; le bouton "Retirer le
 * lien" ou la touche Suppr postent alors retirer=[data-de] sur data-vers.
 * Voir tests/graphe-depends.spec.js pour le contrat complet.
 *
 * Distinction clic / glisser : svg-pan-zoom ecoute mousedown sur tout le
 * SVG pour son propre panoramique, donc un simple ecouteur 'click' sur un
 * noeud se declencherait aussi a l'issue d'un glisser. On mesure donc
 * nous-memes le deplacement entre mousedown (sur le noeud) et mouseup (sur
 * le document) : sous le seuil, c'est un clic ; au-dessus, on l'ignore et on
 * laisse svg-pan-zoom faire son panoramique.
 *
 * data-de / data-vers sur les fleches : Mermaid ne les expose pas. On
 * retrouve chaque arete apres coup via les classes `LS-<id>` / `LE-<id>`
 * que Mermaid pose sur le <path> (verifie sur le SVG rendu, version 10 du
 * CDN) -- plus fiable que de decouper l'id du chemin (`L-<id>-<id>-<n>`),
 * qui suppose implicitement que ni l'id source ni l'id cible ne contiennent
 * eux-memes de tiret.
 */
(function () {
    'use strict';

    // Compteur de requetes : une reponse qui arrive apres qu'un changement de
    // projet plus recent a ete demande est perimee et doit etre ignoree.
    let requeteEnCours = 0;

    // Instance svg-pan-zoom courante, recreee a chaque nouveau rendu.
    let panZoom = null;

    // Instance TaskEditor partagee, creee au premier besoin (cf. initTaskEditor).
    let taskEditor = null;

    // Etat d'edition des dependances (H2). Remis a zero a chaque redessin,
    // cf. resetInteractionLiaison() appelee en tete de dessiner().
    const liaison = {
        selectionnes: new Set(), // uuids selectionnes (hors mode liaison : selection en cours)
        modeLiaison: false,
        lienSelectionne: null, // { de, vers } ou null
        lienSelectionneEl: null, // element <path> correspondant
    };
    let noeudsCourants = new Map(); // uuid -> noeud (donnees /api/graphe du dernier rendu)

    // Distinction clic / glisser sur un noeud : voir la note d'en-tete.
    const SEUIL_GLISSER_PX = 5;
    let mousedownNoeud = null; // { uuid, x, y }

    function elt(id) {
        return document.getElementById(id);
    }

    function definirMessage(texte, { erreur = false } = {}) {
        const zone = elt('graphe-message');
        zone.textContent = texte || '';
        zone.hidden = !texte;
        zone.classList.toggle('erreur', !!erreur);
    }

    function viderSvg() {
        if (panZoom) {
            panZoom.destroy();
            panZoom = null;
        }
        elt('graphe-svg').innerHTML = '';
    }

    // Les ids Mermaid doivent etre alphanumeriques/underscore : un uuid avec
    // tirets est reecrit tel quel, prefixe pour ne jamais commencer par un
    // chiffre.
    function idNoeud(uuid) {
        return 'n_' + String(uuid).replace(/[^a-zA-Z0-9_]/g, '_');
    }

    function idSousGraphe(projet) {
        return 'p_' + String(projet).replace(/[^a-zA-Z0-9_]/g, '_');
    }

    function dernierSegment(chemin) {
        const parties = String(chemin).split('.');
        return parties[parties.length - 1];
    }

    // Mermaid a sa propre syntaxe d'entites pour les caracteres qui
    // entreraient en conflit avec la sienne (guillemets, crochets...). Les
    // accents, eux, passent tels quels.
    function echapperLabel(valeur) {
        return String(valeur == null ? '' : valeur)
            .replace(/&/g, '#38;')
            .replace(/"/g, '#quot;')
            .replace(/\[/g, '#91;')
            .replace(/\]/g, '#93;')
            .replace(/\(/g, '#40;')
            .replace(/\)/g, '#41;')
            .replace(/\{/g, '#123;')
            .replace(/\}/g, '#125;');
    }

    // Construit l'arbre des projets a partir de la racine (projet demande)
    // et de la liste des chemins de projet distincts qui lui appartiennent
    // (la racine elle-meme ou un de ses sous-projets, point-separes). Cree
    // les noeuds intermediaires meme sans tache propre.
    function construireArbreProjets(racine, chemins) {
        const parChemin = new Map();
        function assurer(chemin) {
            let n = parChemin.get(chemin);
            if (!n) {
                n = { chemin, enfants: new Map() };
                parChemin.set(chemin, n);
            }
            return n;
        }
        const racineNoeud = assurer(racine);
        for (const chemin of chemins) {
            if (chemin === racine) continue;
            const suffixe = chemin.slice(racine.length + 1);
            const segments = suffixe.split('.');
            let parent = racineNoeud;
            let courant = racine;
            for (const segment of segments) {
                courant = courant + '.' + segment;
                let enfant = parent.enfants.get(courant);
                if (!enfant) {
                    enfant = assurer(courant);
                    parent.enfants.set(courant, enfant);
                }
                parent = enfant;
            }
        }
        return racineNoeud;
    }

    // Emet un noeud d'arbre (et ses enfants) comme subgraph Mermaid imbrique,
    // et empile son chemin complet dans `cadres` pour le post-traitement.
    // Le projet demande (racine, estRacine=true) n'a pas de cadre : ses
    // taches directes sont emises au premier niveau, et seuls ses
    // sous-projets recoivent un cadre (regle du 23/09, cf. l'en-tete du
    // fichier et tests/graphe.spec.js).
    function emettreArbre(noeudArbre, parProjet, lignes, cadres, estRacine) {
        const taches = parProjet.get(noeudArbre.chemin) || [];
        if (!estRacine) {
            lignes.push(`subgraph ${idSousGraphe(noeudArbre.chemin)}["${echapperLabel(dernierSegment(noeudArbre.chemin))}"]`);
            cadres.push(noeudArbre.chemin);
        }
        for (const n of taches) {
            lignes.push(`${idNoeud(n.uuid)}["${echapperLabel(n.description)}"]`);
        }
        for (const enfant of noeudArbre.enfants.values()) {
            emettreArbre(enfant, parProjet, lignes, cadres, false);
        }
        if (!estRacine) {
            lignes.push('end');
        }
    }

    // Une dependance ne peut pas etre dupliquee cote Taskwarrior (depends est
    // un ensemble), mais un redessin apres ajout peut momentanement recevoir
    // deux fois la meme paire (de, vers) selon la source de donnees ; deux
    // lignes Mermaid identiques se rendraient comme deux fleches superposees
    // et non comme une seule. On ne garde donc que la premiere occurrence de
    // chaque paire.
    function dedupeAretes(aretes) {
        const vues = new Set();
        const resultat = [];
        for (const a of aretes) {
            const cle = a.de + '\u0000' + a.vers;
            if (vues.has(cle)) continue;
            vues.add(cle);
            resultat.push(a);
        }
        return resultat;
    }

    function construireDefinitionMermaid(racine, noeuds, aretes) {
        const parProjet = new Map();
        for (const n of noeuds) {
            const cle = n.project || '(sans projet)';
            if (!parProjet.has(cle)) parProjet.set(cle, []);
            parProjet.get(cle).push(n);
        }

        const dansRacine = [];
        const horsRacine = [];
        for (const cle of parProjet.keys()) {
            if (cle === racine || cle.startsWith(racine + '.')) dansRacine.push(cle);
            else horsRacine.push(cle);
        }

        const lignes = ['flowchart TD'];
        const cadres = [];
        const arbre = construireArbreProjets(racine, dansRacine);
        emettreArbre(arbre, parProjet, lignes, cadres, true);
        for (const projet of horsRacine) {
            emettreArbre({ chemin: projet, enfants: new Map() }, parProjet, lignes, cadres, false);
        }
        for (const a of aretes) {
            lignes.push(`${idNoeud(a.de)} --> ${idNoeud(a.vers)}`);
        }
        return { definition: lignes.join('\n'), cadres };
    }

    // Mermaid ne pose pas d'attribut dedie sur ses noeuds : on retrouve le
    // groupe SVG de chaque noeud par son id (prefixe "flowchart-<id>-") et on
    // y ajoute data-uuid, plus les classes CSS externe/fige/hors-projet.
    function appliquerAttributsNoeuds(conteneur, noeuds) {
        for (const n of noeuds) {
            const idSan = idNoeud(n.uuid);
            const g = conteneur.querySelector(`g.node[id^="flowchart-${idSan}-"]`)
                || conteneur.querySelector(`[id*="${idSan}"]`);
            if (!g) continue;
            g.setAttribute('data-uuid', n.uuid);
            if (n.externe) g.classList.add('externe');
            if (n.fige) g.classList.add('fige');
            if (!n.dans_projet) g.classList.add('hors-projet');
            if (n.dans_projet) ajouterBoutonEdition(g, n.uuid);
            g.addEventListener('mousedown', (e) => {
                mousedownNoeud = { uuid: n.uuid, x: e.clientX, y: e.clientY };
            });
        }
    }

    // ----- Selection des noeuds et mode liaison (H2) -----

    function elementNoeud(uuid) {
        return elt('graphe-svg').querySelector(selecteurUuid(uuid));
    }

    function selecteurUuid(uuid) {
        return `[data-uuid="${cssEchapper(uuid)}"]`;
    }

    // CSS.escape n'est pas garanti par tous les environnements de test ; les
    // uuids utilises ici ne contiennent que des caracteres deja surs pour un
    // attribut CSS entre guillemets (alphanumerique et tirets).
    function cssEchapper(valeur) {
        return String(valeur).replace(/"/g, '\\"');
    }

    function boutonRelier() {
        return elt('graphe-relier');
    }

    function boutonRetirerLien() {
        return elt('graphe-retirer-lien');
    }

    function majBoutonRelier() {
        boutonRelier().disabled = liaison.selectionnes.size === 0;
    }

    function majBoutonRetirerLien() {
        boutonRetirerLien().hidden = !liaison.lienSelectionne;
    }

    // Remise a zero de l'etat d'edition des dependances, appelee en tete de
    // chaque redessin (les elements DOM precedents disparaissent de toute
    // facon avec viderSvg()).
    function resetInteractionLiaison() {
        liaison.selectionnes.clear();
        liaison.modeLiaison = false;
        liaison.lienSelectionne = null;
        liaison.lienSelectionneEl = null;
        mousedownNoeud = null;
        majBoutonRelier();
        majBoutonRetirerLien();
    }

    function basculerSelection(uuid) {
        const g = elementNoeud(uuid);
        if (liaison.selectionnes.has(uuid)) {
            liaison.selectionnes.delete(uuid);
            if (g) g.classList.remove('selectionne');
        } else {
            liaison.selectionnes.add(uuid);
            if (g) g.classList.add('selectionne');
        }
        majBoutonRelier();
    }

    function entrerModeLiaison() {
        if (liaison.selectionnes.size === 0) return;
        liaison.modeLiaison = true;
        for (const uuid of liaison.selectionnes) {
            const g = elementNoeud(uuid);
            if (g) g.classList.add('source-liaison');
        }
    }

    // Sort du mode liaison sans y toucher a la selection (annulation : Echap
    // ou second clic sur "Relier").
    function annulerModeLiaison() {
        liaison.modeLiaison = false;
        for (const uuid of liaison.selectionnes) {
            const g = elementNoeud(uuid);
            if (g) g.classList.remove('source-liaison');
        }
    }

    // Efface entierement selection + mode, apres une tentative de liaison
    // (succes ou refus serveur) : cf. tests/graphe-depends.spec.js.
    function effacerSelectionEtMode() {
        for (const uuid of liaison.selectionnes) {
            const g = elementNoeud(uuid);
            if (g) g.classList.remove('selectionne', 'source-liaison');
        }
        liaison.selectionnes.clear();
        liaison.modeLiaison = false;
        majBoutonRelier();
    }

    function gererClicNoeud(uuid) {
        const noeud = noeudsCourants.get(uuid);
        if (!noeud) return;
        if (liaison.modeLiaison) {
            gererClicCible(uuid, noeud);
            return;
        }
        if (!noeud.dans_projet) return; // non selectionnable
        basculerSelection(uuid);
    }

    function gererClicCible(uuid, noeud) {
        if (liaison.selectionnes.has(uuid)) {
            definirMessage('Une tâche ne peut pas être reliée à elle-même.', { erreur: true });
            return;
        }
        if (!noeud.dans_projet) {
            definirMessage('Impossible de relier vers une tâche hors du projet.', { erreur: true });
            return;
        }
        lierVersLaCible(uuid);
    }

    // Message d'erreur renvoye par le serveur : `detail` (HTTPException de
    // FastAPI, forme reelle de l'endpoint /api/task/{uuid}/depends) en
    // priorite, `error` en repli (autre convention utilisee ailleurs dans le
    // depot, cf. calendar-planner.js/main.js), puis le message par defaut.
    function messageServeur(d, parDefaut) {
        return (d && (d.detail || d.error)) || parDefaut;
    }

    async function lierVersLaCible(cibleUuid) {
        const sources = Array.from(liaison.selectionnes);
        try {
            const r = await fetch('/api/task/' + encodeURIComponent(cibleUuid) + '/depends', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ajouter: sources, retirer: [] }),
            });
            let d = {};
            try { d = await r.json(); } catch (e) { d = {}; }
            effacerSelectionEtMode();
            if (!r.ok || d.success === false) {
                definirMessage(messageServeur(d, 'Erreur lors de la création du lien.'), { erreur: true });
                return;
            }
            definirMessage('');
            actualiser();
        } catch (e) {
            console.error(e);
            effacerSelectionEtMode();
            definirMessage('Erreur réseau lors de la création du lien.', { erreur: true });
        }
    }

    // ----- Retrait d'un lien existant (H2) -----

    function selectionnerLien(path, de, vers) {
        if (liaison.lienSelectionneEl && liaison.lienSelectionneEl !== path) {
            liaison.lienSelectionneEl.classList.remove('lien-selectionne');
        }
        if (liaison.lienSelectionneEl === path && liaison.lienSelectionne) {
            // second clic sur le meme lien : deselectionne
            path.classList.remove('lien-selectionne');
            liaison.lienSelectionne = null;
            liaison.lienSelectionneEl = null;
        } else {
            path.classList.add('lien-selectionne');
            liaison.lienSelectionne = { de, vers };
            liaison.lienSelectionneEl = path;
        }
        majBoutonRetirerLien();
    }

    function effacerLienSelectionne() {
        if (liaison.lienSelectionneEl) liaison.lienSelectionneEl.classList.remove('lien-selectionne');
        liaison.lienSelectionne = null;
        liaison.lienSelectionneEl = null;
        majBoutonRetirerLien();
    }

    async function retirerLienSelectionne() {
        if (!liaison.lienSelectionne) return;
        const { de, vers } = liaison.lienSelectionne;
        try {
            const r = await fetch('/api/task/' + encodeURIComponent(vers) + '/depends', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ajouter: [], retirer: [de] }),
            });
            let d = {};
            try { d = await r.json(); } catch (e) { d = {}; }
            if (!r.ok || d.success === false) {
                definirMessage(messageServeur(d, 'Erreur lors du retrait du lien.'), { erreur: true });
                return;
            }
            definirMessage('');
            effacerLienSelectionne();
            actualiser();
        } catch (e) {
            console.error(e);
            definirMessage('Erreur réseau lors du retrait du lien.', { erreur: true });
        }
    }

    const NS_SVG = 'http://www.w3.org/2000/svg';
    const MARGE_ZONE_CLIC_LIEN = 8; // cf. creerZoneClicLien

    // Une fleche Mermaid parfaitement verticale ou horizontale a un
    // getBoundingClientRect() de largeur ou hauteur nulle (verifie : le
    // stroke n'y participe pas dans Chromium, seule la geometrie du trace
    // compte) -- un element sans aire n'est jamais "visible" pour Playwright,
    // qui refuse alors tout clic dessus. On pose donc, par-dessus le trace
    // visible, un second <path> invisible dont la geometrie est un
    // rectangle englobant la fleche avec une marge : c'est LUI qui porte
    // data-de/data-vers et l'ecouteur de clic (le selecteur du contrat,
    // `path[data-de][data-vers]`, n'exige pas que ce soit le trace visible).
    function creerZoneClicLien(pathVisible, a) {
        const boite = pathVisible.getBBox();
        const x = boite.x - MARGE_ZONE_CLIC_LIEN;
        const y = boite.y - MARGE_ZONE_CLIC_LIEN;
        const largeur = boite.width + 2 * MARGE_ZONE_CLIC_LIEN;
        const hauteur = boite.height + 2 * MARGE_ZONE_CLIC_LIEN;
        const zone = document.createElementNS(NS_SVG, 'path');
        zone.setAttribute('d', `M${x},${y} L${x + largeur},${y} L${x + largeur},${y + hauteur} L${x},${y + hauteur} Z`);
        zone.setAttribute('data-de', a.de);
        zone.setAttribute('data-vers', a.vers);
        zone.setAttribute('class', 'graphe-zone-clic-lien');
        pathVisible.insertAdjacentElement('afterend', zone);
        zone.addEventListener('click', () => selectionnerLien(zone, a.de, a.vers));
        return zone;
    }

    // Retrouve chaque arete rendue via les classes LS-<id>/LE-<id> que
    // Mermaid pose sur le <path> (cf. note d'en-tete du fichier), et pose une
    // zone de clic dediee (cf. creerZoneClicLien) portant data-de/data-vers.
    function appliquerAttributsAretes(conteneur, aretes) {
        for (const a of aretes) {
            const classeSource = 'LS-' + idNoeud(a.de);
            const classeCible = 'LE-' + idNoeud(a.vers);
            const path = conteneur.querySelector(`path.${classeSource}.${classeCible}`);
            if (!path) continue;
            creerZoneClicLien(path, a);
        }
    }

    // Pose le bouton stylo dans le libelle HTML du noeud (foreignObject posee
    // par Mermaid, htmlLabels). Voir la note d'en-tete du fichier : ajoute en
    // DOM apres le rendu, pas dans le texte du libelle Mermaid.
    function ajouterBoutonEdition(g, uuid) {
        const labelDiv = g.querySelector('.label foreignObject > div, foreignObject > div');
        const porteur = labelDiv || g.querySelector('.label') || g;
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'graphe-btn-modifier';
        bouton.setAttribute('aria-label', 'Modifier la tâche');
        bouton.textContent = '✏️';
        // Empeche le glisser/zoom du graphe (svg-pan-zoom ecoute mousedown sur
        // le SVG) et l'ouverture depuis un autre gestionnaire de clic porte
        // par le noeud : la propagation est coupee avant toute chose.
        bouton.addEventListener('mousedown', (e) => e.stopPropagation());
        bouton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            ouvrirEdition(uuid);
        });
        porteur.appendChild(bouton);
    }

    function initTaskEditor() {
        if (taskEditor || typeof TaskEditor === 'undefined') return;
        taskEditor = new TaskEditor({
            showAllFields: true,
            priorityFormat: 'letters',
            language: 'fr',
            modalId: 'graphe-task-editor',
            onSaveSuccess: () => actualiser(),
            onSaveError: (erreur) => definirMessage(erreur || 'Erreur lors de l\'enregistrement.', { erreur: true }),
            onCancel: () => {},
        });
    }

    // Recupere la tache complete depuis /api/tasks (pas le noeud /api/graphe,
    // qui n'expose ni tags, ni priority, ni scheduled) et ouvre l'editeur.
    async function ouvrirEdition(uuid) {
        initTaskEditor();
        if (!taskEditor) return;
        definirMessage('');
        try {
            const r = await fetch('/api/tasks');
            if (!r.ok) {
                definirMessage('Erreur lors de la récupération de la tâche (' + r.status + ').', { erreur: true });
                return;
            }
            const d = await r.json();
            const taches = d.tasks || [];
            const tache = taches.find(t => t.uuid === uuid);
            if (!tache) {
                definirMessage('Tâche introuvable : impossible de l\'éditer.', { erreur: true });
                return;
            }
            taskEditor.showForTask(tache);
        } catch (e) {
            console.error(e);
            definirMessage('Erreur réseau lors de la récupération de la tâche.', { erreur: true });
        }
    }

    // Meme principe que appliquerAttributsNoeuds, pour les clusters de
    // subgraph. L'id genere par Mermaid pour un cluster reprend l'id fourni,
    // suffixe par "-<n>". Match ancre en fin de chaine (plutot qu'un simple
    // prefixe) : "p_NPD_Orion" est un prefixe litteral de
    // "p_NPD_Orion_achats", et un `[id^=...]` les confondrait.
    function appliquerAttributsCadres(conteneur, cadres) {
        const groupes = conteneur.querySelectorAll('g.cluster');
        for (const chemin of cadres) {
            const idSan = idSousGraphe(chemin);
            const re = new RegExp('^' + idSan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(-\\d+)?$');
            let trouve = null;
            for (const g of groupes) {
                if (re.test(g.id)) { trouve = g; break; }
            }
            if (!trouve) continue;
            trouve.setAttribute('data-cadre', chemin);
            trouve.setAttribute('title', chemin);
        }
    }

    function initPanZoom() {
        const svgEl = elt('graphe-svg').querySelector('svg');
        if (!svgEl || !window.svgPanZoom) return;
        // Mermaid pose un style inline (max-width...) pense pour un rendu
        // statique ; on le remplace pour que le SVG occupe tout le
        // conteneur, ce dont svg-pan-zoom a besoin pour calculer son ajustement.
        svgEl.removeAttribute('style');
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        panZoom = window.svgPanZoom(svgEl, {
            zoomEnabled: true,
            panEnabled: true,
            controlIconsEnabled: false,
            fit: true,
            center: true,
            minZoom: 0.1,
            maxZoom: 20,
            zoomScaleSensitivity: 0.3,
            mouseWheelZoomEnabled: true,
        });
    }

    // Ajuste le zoom/deplacement courant pour que toute l'etendue du graphe
    // tienne dans la zone visible. Une legere marge (zoomBy < 1 apres fit)
    // absorbe le depassement d'un ou deux pixels du au trait des contours,
    // que le viewBox calcule par Mermaid n'inclut pas toujours.
    function ajusterVue() {
        if (!panZoom) return;
        panZoom.resize();
        panZoom.fit();
        panZoom.center();
        panZoom.zoomBy(0.95);
        panZoom.center();
    }

    async function dessiner(racine, noeuds, aretes) {
        viderSvg();
        resetInteractionLiaison();
        noeudsCourants = new Map(noeuds.map(n => [n.uuid, n]));
        if (noeuds.length === 0) {
            definirMessage('Aucune tâche trouvée pour ce projet.');
            return;
        }
        definirMessage('');
        const aretesUniques = dedupeAretes(aretes);
        const { definition, cadres } = construireDefinitionMermaid(racine, noeuds, aretesUniques);
        try {
            const { svg } = await window.mermaid.render('graphe-mermaid-svg', definition);
            const conteneur = elt('graphe-svg');
            conteneur.innerHTML = svg;
            appliquerAttributsNoeuds(conteneur, noeuds);
            appliquerAttributsCadres(conteneur, cadres);
            appliquerAttributsAretes(conteneur, aretesUniques);
            // svg-pan-zoom peut lever ("matrix not invertible") si la zone
            // est de taille nulle au moment du calcul. Le rendu Mermaid a
            // deja reussi a ce stade : une erreur ici ne doit ni l'effacer,
            // ni empecher les dessins suivants (cf. l'en-tete du describe
            // "fenetre basse" de tests/graphe.spec.js).
            try {
                initPanZoom();
                ajusterVue();
            } catch (e) {
                console.error(e);
            }
        } catch (e) {
            console.error(e);
            viderSvg();
            definirMessage('Erreur lors du rendu du graphe.', { erreur: true });
        }
    }

    async function chargerEtDessiner(projet) {
        const idRequete = ++requeteEnCours;
        definirMessage('Chargement...');
        viderSvg();
        try {
            const r = await fetch('/api/graphe?projet=' + encodeURIComponent(projet));
            if (idRequete !== requeteEnCours) return; // reponse perimee
            if (!r.ok) {
                definirMessage('Erreur : le serveur a renvoyé une erreur (' + r.status + ').', { erreur: true });
                return;
            }
            const d = await r.json();
            if (idRequete !== requeteEnCours) return;
            await dessiner(projet, d.noeuds || [], d.aretes || []);
        } catch (e) {
            if (idRequete !== requeteEnCours) return;
            console.error(e);
            definirMessage('Erreur réseau lors du chargement du graphe.', { erreur: true });
        }
    }

    function projetCourant() {
        return window.twNav ? String(window.twNav.getState().project || '').trim() : '';
    }

    function actualiser() {
        const projet = projetCourant();
        if (!projet) {
            requeteEnCours++; // invalide toute requete deja partie
            viderSvg();
            definirMessage('Choisissez un projet dans le filtre pour afficher son graphe.');
            return;
        }
        chargerEtDessiner(projet);
    }

    function initBoutons() {
        elt('graphe-zoom-avant').addEventListener('click', () => {
            if (panZoom) panZoom.zoomBy(1.25);
        });
        elt('graphe-zoom-arriere').addEventListener('click', () => {
            if (panZoom) panZoom.zoomBy(0.8);
        });
        elt('graphe-ajuster').addEventListener('click', ajusterVue);
        boutonRelier().addEventListener('click', () => {
            if (liaison.selectionnes.size === 0) return;
            if (liaison.modeLiaison) annulerModeLiaison();
            else entrerModeLiaison();
        });
        boutonRetirerLien().addEventListener('click', retirerLienSelectionne);
    }

    // Distingue clic et glisser (cf. note d'en-tete) : le mousedown est pose
    // sur chaque noeud (appliquerAttributsNoeuds), le mouseup est ecoute une
    // fois pour toutes sur le document.
    function initInteractionsGlobales() {
        document.addEventListener('mouseup', (e) => {
            if (!mousedownNoeud) return;
            const info = mousedownNoeud;
            mousedownNoeud = null;
            const distance = Math.hypot(e.clientX - info.x, e.clientY - info.y);
            if (distance > SEUIL_GLISSER_PX) return; // glisser : pas une selection
            gererClicNoeud(info.uuid);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (liaison.modeLiaison) annulerModeLiaison();
            } else if (e.key === 'Delete') {
                if (liaison.lienSelectionne) {
                    e.preventDefault();
                    retirerLienSelectionne();
                }
            }
        });
    }

    // La geometrie du cadre est purement CSS (flexbox, cf. graphe.css) : pas
    // besoin de la recalculer ici. svg-pan-zoom, lui, doit etre informe des
    // nouvelles dimensions pour garder son rendu aligne apres un redimensionnement.
    let redimensionnementEnAttente = null;
    function surRedimensionnement() {
        if (redimensionnementEnAttente) clearTimeout(redimensionnementEnAttente);
        redimensionnementEnAttente = setTimeout(() => {
            if (panZoom) panZoom.resize();
        }, 100);
    }

    function init() {
        if (window.mermaid) {
            window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
        }
        initTaskEditor();
        initBoutons();
        initInteractionsGlobales();
        window.addEventListener('resize', surRedimensionnement);
        document.addEventListener('tw-filter-change', actualiser);
        actualiser();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
