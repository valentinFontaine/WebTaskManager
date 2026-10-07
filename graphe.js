/**
 * graphe.html — visualisation des dependances de projets, rendue par
 * Mermaid (charge depuis CDN, version majeure figee dans graphe.html).
 *
 * Les projets affiches viennent du champ a bulles #graphe-projets (cf.
 * tests/graphe-projets.spec.js) : recherche floue (sous-sequence, insensible
 * a la casse) sur window.twNav.projectsReady, une bulle par projet choisi,
 * persistees en localStorage ('graphe-projets'). /api/graphe est appele avec
 * un parametre `projet` par bulle ; sans bulle, aucun appel et un message.
 *
 * Le filtre projet de la nav (#tw-project) ne choisit plus rien : il
 * restreint seulement l'affichage aux noeuds du projet filtre ou de ses
 * sous-projets (prefixe a frontiere de point, comme main.js), aretes
 * pendantes retirees. Un changement de ce filtre redessine depuis la
 * derniere reponse, sans nouvel appel serveur.
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
 *
 * Redessin sans flash (cf. tests/graphe-redessin.spec.js) : l'ancien graphe
 * reste affiche pendant le rechargement et le rendu Mermaid ; le nouveau le
 * remplace d'un coup. "Chargement..." n'apparait que si rien n'est affiche.
 * Chaque rendu recoit un id Mermaid unique : mermaid.render retire du
 * document l'element qui porte deja l'id demande, ce qui effacerait l'ancien
 * graphe des le debut du rendu. Zoom et position sont repris d'un rendu au
 * suivant en valeurs absolues (getSizes().realZoom, getPan()) : getZoom() est
 * relatif a l'ajustement initial de chaque graphe, qui change avec sa taille.
 * La vue n'est ajustee qu'au premier dessin, quand la liste des projets
 * choisis change, ou sur le bouton Ajuster.
 */
(function () {
    'use strict';

    // Compteur de requetes : une reponse qui arrive apres qu'un changement de
    // projet plus recent a ete demande est perimee et doit etre ignoree.
    let requeteEnCours = 0;

    // Instance svg-pan-zoom courante, recreee a chaque nouveau rendu.
    let panZoom = null;

    // Compteur de rendus : un rendu Mermaid termine apres qu'un plus recent
    // a ete lance est perime et ne doit pas remplacer l'affichage.
    let dessinEnCours = 0;

    // Vrai quand le prochain rendu doit ajuster la vue au lieu de reprendre
    // zoom et position : premier dessin, ou liste des projets choisis changee.
    let reajusterVue = true;
    let projetsDessines = null; // liste des projets du dernier chargement (JSON)

    // Instance TaskEditor partagee, creee au premier besoin (cf. initTaskEditor).
    let taskEditor = null;

    // Etat d'edition des dependances (H2). Remis a zero a chaque redessin,
    // cf. resetInteractionLiaison() appelee par installerRendu().
    const liaison = {
        selectionnes: new Set(), // uuids selectionnes (hors mode liaison : selection en cours)
        modeLiaison: false,
        lienSelectionne: null, // { de, vers } ou null
        lienSelectionneEl: null, // element <path> correspondant
    };
    let noeudsCourants = new Map(); // uuid -> noeud (donnees /api/graphe du dernier rendu)
    let aretesCourantes = []; // { de, vers } du dernier rendu

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
    // `sansCadre` : racine sans cadre (un seul projet choisi). Une racine
    // cadree (plusieurs projets choisis) porte son nom complet comme libelle.
    function emettreArbre(noeudArbre, parProjet, lignes, cadres, estRacine, sansCadre) {
        const taches = parProjet.get(noeudArbre.chemin) || [];
        const sansCadreCourant = estRacine && sansCadre;
        if (!sansCadreCourant) {
            const libelle = estRacine ? noeudArbre.chemin : dernierSegment(noeudArbre.chemin);
            lignes.push(`subgraph ${idSousGraphe(noeudArbre.chemin)}["${echapperLabel(libelle)}"]`);
            cadres.push(noeudArbre.chemin);
        }
        for (const n of taches) {
            lignes.push(`${idNoeud(n.uuid)}["${echapperLabel(n.description)}"]`);
        }
        for (const enfant of noeudArbre.enfants.values()) {
            emettreArbre(enfant, parProjet, lignes, cadres, false, sansCadre);
        }
        if (!sansCadreCourant) {
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

    // `racines` : projets choisis, sans descendant d'un autre (absorbe par son
    // ancetre). Une seule racine : pas de cadre (regle du 23/09) ; plusieurs :
    // chacune a son cadre, sous-projets imbriques dedans.
    function construireDefinitionMermaid(racines, noeuds, aretes) {
        const parProjet = new Map();
        for (const n of noeuds) {
            const cle = n.project || '(sans projet)';
            if (!parProjet.has(cle)) parProjet.set(cle, []);
            parProjet.get(cle).push(n);
        }

        const parRacine = new Map(racines.map(r => [r, []]));
        const horsRacine = [];
        for (const cle of parProjet.keys()) {
            const racine = racines.find(r => cle === r || cle.startsWith(r + '.'));
            if (racine) parRacine.get(racine).push(cle);
            else horsRacine.push(cle);
        }

        const lignes = ['flowchart TD'];
        const cadres = [];
        const sansCadre = racines.length === 1;
        for (const [racine, chemins] of parRacine) {
            if (chemins.length === 0) continue;
            const arbre = construireArbreProjets(racine, chemins);
            emettreArbre(arbre, parProjet, lignes, cadres, true, sansCadre);
        }
        for (const projet of horsRacine) {
            emettreArbre({ chemin: projet, enfants: new Map() }, parProjet, lignes, cadres, false, false);
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

    function boutonModifier() {
        return elt('graphe-modifier');
    }

    function boutonSupprimer() {
        return elt('graphe-supprimer');
    }

    function majBoutonRelier() {
        boutonRelier().disabled = liaison.selectionnes.size === 0;
    }

    function majBoutonRetirerLien() {
        boutonRetirerLien().hidden = !liaison.lienSelectionne;
    }

    // Visible seulement pour exactement une selection, et jamais pendant un
    // geste "Relier" en cours (cf. l'en-tete de tests/graphe-modifier.spec.js).
    function majBoutonModifier() {
        const cache = liaison.modeLiaison || liaison.selectionnes.size !== 1;
        boutonModifier().hidden = cache;
        // Meme regle pour Supprimer (cf. tests/graphe-supprimer.spec.js)
        // et Decouper (tests/graphe-decouper.spec.js).
        boutonSupprimer().hidden = cache;
        elt('graphe-decouper').hidden = cache;
    }

    // Remise a zero de l'etat d'edition des dependances, appelee a chaque
    // redessin au moment ou le nouveau graphe remplace l'ancien (les elements
    // DOM precedents disparaissent de toute facon avec viderSvg()).
    function resetInteractionLiaison() {
        liaison.selectionnes.clear();
        liaison.modeLiaison = false;
        liaison.lienSelectionne = null;
        liaison.lienSelectionneEl = null;
        mousedownNoeud = null;
        majBoutonRelier();
        majBoutonRetirerLien();
        majBoutonModifier();
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
        majBoutonModifier();
    }

    function entrerModeLiaison() {
        if (liaison.selectionnes.size === 0) return;
        liaison.modeLiaison = true;
        for (const uuid of liaison.selectionnes) {
            const g = elementNoeud(uuid);
            if (g) g.classList.add('source-liaison');
        }
        majBoutonModifier();
    }

    // Sort du mode liaison sans y toucher a la selection (annulation : Echap
    // ou second clic sur "Relier").
    function annulerModeLiaison() {
        liaison.modeLiaison = false;
        for (const uuid of liaison.selectionnes) {
            const g = elementNoeud(uuid);
            if (g) g.classList.remove('source-liaison');
        }
        majBoutonModifier();
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
        majBoutonModifier();
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

    // Suppression d'une tache : grosse confirmation d'abord (cf.
    // tests/graphe-supprimer.spec.js). Annuler a le focus, pour qu'un Entree
    // machinal ne supprime rien.
    let uuidASupprimer = null;

    function modaleSuppression() {
        return elt('graphe-confirmation-suppression');
    }

    function demanderSuppression(uuid) {
        const noeud = noeudsCourants.get(uuid);
        if (!noeud) return;
        uuidASupprimer = uuid;
        elt('graphe-suppression-description').textContent = noeud.description || uuid;
        // Taches du graphe qui dependent de celle-ci (arete de -> vers :
        // "vers" depend de "de") : elles perdront cette dependance.
        const dependantes = aretesCourantes
            .filter(a => a.de === uuid)
            .map(a => noeudsCourants.get(a.vers))
            .filter(Boolean)
            .map(n => n.description);
        const zone = elt('graphe-suppression-dependantes');
        zone.textContent = dependantes.length
            ? 'Attention : ' + dependantes.length + ' tâche(s) en dépendent et perdront ce lien : '
              + dependantes.join(', ') + '.'
            : '';
        zone.hidden = dependantes.length === 0;
        modaleSuppression().hidden = false;
        elt('graphe-suppression-annuler').focus();
    }

    function fermerSuppression() {
        uuidASupprimer = null;
        modaleSuppression().hidden = true;
    }

    async function confirmerSuppression() {
        const uuid = uuidASupprimer;
        if (!uuid) return;
        const description = (noeudsCourants.get(uuid) || {}).description || uuid;
        fermerSuppression();
        try {
            const r = await fetch('/api/task/' + encodeURIComponent(uuid) + '/delete', { method: 'DELETE' });
            const d = await r.json().catch(() => null);
            // La route renvoie 200 meme en cas d'echec Taskwarrior :
            // seul `success` fait foi.
            if (!r.ok || !d || !d.success) {
                const raison = (d && (d.detail || d.message)) || 'erreur ' + r.status + '.';
                definirMessage('Suppression refusée : ' + raison, { erreur: true });
                return;
            }
            await chargerEtDessiner(selection.slice());
            definirMessage('Tâche supprimée : ' + description);
        } catch (e) {
            console.error(e);
            definirMessage('Erreur réseau lors de la suppression.', { erreur: true });
        }
    }

    // ----- Decoupage d'une tache (POST /api/task/<uuid>/split) -----
    // La tache devient un jalon qui depend de ses sous-taches. Contrat :
    // tests/graphe-decouper.spec.js ; modele : NOTES.md, docs/tags.md.

    let uuidADecouper = null;
    let estTimeOrigine = null;
    let sousTachesJalon = []; // [{ uuid, description }] des jalons predecesseurs

    function modaleDecoupage() {
        return elt('graphe-decoupage');
    }

    // Minutes d'une duree Taskwarrior ou saisie (PT1H30M, 90min, 1.5h, 1h30,
    // 1h+30min) ; null si illisible. Sert seulement au total indicatif.
    function dureeMinutes(texte) {
        const t = (texte || '').trim().toLowerCase();
        if (!t) return 0;
        let m = t.match(/^p(?:(\d+)d)?(?:t(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?)?$/);
        if (m && t !== 'p') {
            return (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) + Math.round((+(m[4] || 0)) / 60);
        }
        m = t.match(/^(\d+(?:\.\d+)?)\s*(min|m|h|d)$/);
        if (m) return Math.round(+m[1] * { min: 1, m: 1, h: 60, d: 1440 }[m[2]]);
        m = t.match(/^(\d+)\s*h\s*\+?\s*(\d+)\s*(?:min|m)?$/);
        if (m) return +m[1] * 60 + +m[2];
        return null;
    }

    function formaterMinutes(min) {
        const h = Math.floor(min / 60);
        const r = min % 60;
        if (h === 0) return r + 'min';
        return h + 'h' + (r ? String(r).padStart(2, '0') : '');
    }

    function lignesDecoupage() {
        return Array.from(document.querySelectorAll('#graphe-decoupage-lignes .graphe-decoupage-ligne'));
    }

    function majTotalDecoupage() {
        let total = 0;
        let lisible = true;
        for (const ligne of lignesDecoupage()) {
            const m = dureeMinutes(ligne.querySelector('.graphe-decoupage-duree').value);
            if (m === null) lisible = false;
            else total += m;
        }
        const origine = dureeMinutes(estTimeOrigine);
        elt('graphe-decoupage-total').textContent = 'Total : '
            + (lisible ? formaterMinutes(total) : '?')
            + (origine ? ' (tâche d\'origine : ' + formaterMinutes(origine) + ')' : '');
    }

    // Appariement prerempli dans l'ordre : ligne i -> i-eme sous-tache du jalon.
    function majChoixApparier() {
        const actif = elt('graphe-decoupage-apparier').checked;
        lignesDecoupage().forEach((ligne, i) => {
            const choix = ligne.querySelector('.graphe-decoupage-apres');
            choix.hidden = !actif;
            if (actif && !choix.value && sousTachesJalon[i]) choix.value = sousTachesJalon[i].uuid;
        });
    }

    function ajouterLigneDecoupage() {
        const ligne = document.createElement('div');
        ligne.className = 'graphe-decoupage-ligne';
        const desc = document.createElement('input');
        desc.type = 'text';
        desc.className = 'graphe-decoupage-desc';
        desc.placeholder = 'Sous-tâche';
        desc.setAttribute('aria-label', 'Description de la sous-tâche');
        const duree = document.createElement('input');
        duree.type = 'text';
        duree.className = 'graphe-decoupage-duree';
        duree.placeholder = 'Durée';
        duree.setAttribute('aria-label', 'Durée estimée');
        duree.addEventListener('input', majTotalDecoupage);
        const choix = document.createElement('select');
        choix.className = 'graphe-decoupage-apres';
        choix.setAttribute('aria-label', 'Sous-tâche du jalon à suivre');
        choix.hidden = true;
        const aucune = document.createElement('option');
        aucune.value = '';
        aucune.textContent = 'Après le jalon (pas d\'appariement)';
        choix.appendChild(aucune);
        for (const s of sousTachesJalon) {
            const o = document.createElement('option');
            o.value = s.uuid;
            o.textContent = 'Après : ' + s.description;
            choix.appendChild(o);
        }
        ligne.append(desc, duree, choix);
        elt('graphe-decoupage-lignes').appendChild(ligne);
        majChoixApparier();
        majTotalDecoupage();
    }

    // Nom de sous-projet propose : la description, reduite aux caracteres
    // admis par le backend, rendue libre parmi les projets existants.
    function nomSousProjetPropose(description, projet, existants) {
        const base = (description || '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '-')
            .replace(/^-+|-+$/g, '') || 'Etapes';
        const pris = new Set(existants.map(p => p.toLowerCase()));
        let nom = base;
        for (let i = 2; pris.has((projet + '.' + nom).toLowerCase()); i++) nom = base + '-' + i;
        return nom;
    }

    function listeDepends(brut) {
        if (Array.isArray(brut)) return brut;
        return String(brut || '').split(',').map(u => u.trim()).filter(Boolean);
    }

    function erreurDecoupage(texte) {
        const zone = elt('graphe-decoupage-erreur');
        zone.textContent = texte || '';
        zone.hidden = !texte;
    }

    // Lit /api/tasks (tags et depends complets, absents des noeuds du graphe)
    // pour trouver les jalons predecesseurs, et /api/projects pour le nom libre.
    async function ouvrirDecoupage(uuid) {
        const noeud = noeudsCourants.get(uuid);
        if (!noeud) return;
        definirMessage('');
        let taches = [];
        let projets = [];
        try {
            const [rt, rp] = await Promise.all([fetch('/api/tasks'), fetch('/api/projects')]);
            if (rt.ok) taches = ((await rt.json()) || {}).tasks || [];
            if (rp.ok) projets = ((await rp.json()) || {}).projects || [];
        } catch (e) {
            console.error(e);
        }
        const parUuid = new Map(taches.map(t => [t.uuid, t]));
        const tache = parUuid.get(uuid) || {};

        const jalons = listeDepends(tache.depends).map(u => parUuid.get(u))
            .filter(t => t && (t.tags || []).includes('milestone'));
        sousTachesJalon = [];
        for (const j of jalons) {
            listeDepends(j.depends).map(u => parUuid.get(u)).filter(Boolean)
                .sort((a, b) => String(a.entry || '').localeCompare(String(b.entry || '')))
                .forEach(t => sousTachesJalon.push({ uuid: t.uuid, description: t.description }));
        }

        uuidADecouper = uuid;
        estTimeOrigine = tache.estTime || noeud.estTime || null;
        elt('graphe-decoupage-description').textContent = noeud.description || uuid;
        elt('graphe-decoupage-jalon').textContent = jalons.map(j => j.description).join(', ');
        elt('graphe-decoupage-apparier-zone').hidden = sousTachesJalon.length === 0;
        elt('graphe-decoupage-apparier').checked = false;

        const projet = noeud.project || tache.project || '';
        elt('graphe-decoupage-sous-projet-zone').hidden = !projet;
        elt('graphe-decoupage-sous-projet').checked = false;
        elt('graphe-decoupage-projet').textContent = projet;
        elt('graphe-decoupage-nom').value = projet
            ? nomSousProjetPropose(noeud.description, projet, projets) : '';

        elt('graphe-decoupage-lignes').innerHTML = '';
        ajouterLigneDecoupage();
        ajouterLigneDecoupage();
        erreurDecoupage('');
        modaleDecoupage().hidden = false;
        lignesDecoupage()[0].querySelector('.graphe-decoupage-desc').focus();
    }

    function fermerDecoupage() {
        uuidADecouper = null;
        modaleDecoupage().hidden = true;
    }

    async function confirmerDecoupage() {
        const uuid = uuidADecouper;
        if (!uuid) return;
        const apparier = elt('graphe-decoupage-apparier').checked;
        const corps = {
            sous_taches: lignesDecoupage().map(ligne => ({
                description: ligne.querySelector('.graphe-decoupage-desc').value.trim(),
                estTime: ligne.querySelector('.graphe-decoupage-duree').value.trim() || null,
                apparier_a: (apparier && ligne.querySelector('.graphe-decoupage-apres').value) || null,
            })),
            sous_projet: elt('graphe-decoupage-sous-projet').checked
                ? elt('graphe-decoupage-nom').value.trim() : null,
        };
        const description = (noeudsCourants.get(uuid) || {}).description || uuid;
        const bouton = elt('graphe-decoupage-confirmer');
        bouton.disabled = true;
        erreurDecoupage('');
        try {
            const r = await fetch('/api/task/' + encodeURIComponent(uuid) + '/split', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corps),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok || !d || !d.success) {
                // 422 (validation pydantic) : detail est une liste.
                const detail = d && Array.isArray(d.detail) ? 'requête invalide.' : messageServeur(d, 'erreur ' + r.status + '.');
                erreurDecoupage('Découpage refusé : ' + detail);
                return;
            }
            fermerDecoupage();
            await chargerEtDessiner(selection.slice());
            definirMessage('Tâche découpée : ' + description + ' (' + corps.sous_taches.length + ' sous-tâches).');
        } catch (e) {
            console.error(e);
            erreurDecoupage('Erreur réseau lors du découpage.');
        } finally {
            bouton.disabled = false;
        }
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

    // Vue courante en valeurs absolues, ou null sans graphe affiche.
    function lireVue() {
        if (!panZoom) return null;
        return { realZoom: panZoom.getSizes().realZoom, pan: panZoom.getPan() };
    }

    function restaurerVue(vue) {
        panZoom.zoomBy(vue.realZoom / panZoom.getSizes().realZoom);
        panZoom.pan(vue.pan);
    }

    // Remplace d'un coup le graphe affiche (svg vide : graphe retire) et
    // l'etat qui s'y rapporte.
    function installerRendu(svg, noeuds, aretes) {
        viderSvg();
        resetInteractionLiaison();
        noeudsCourants = new Map(noeuds.map(n => [n.uuid, n]));
        aretesCourantes = aretes;
        elt('graphe-svg').innerHTML = svg;
    }

    async function dessiner(racines, noeuds, aretes) {
        const idDessin = ++dessinEnCours;
        if (noeuds.length === 0) {
            installerRendu('', noeuds, aretes);
            definirMessage('Aucune tâche trouvée pour ce projet.');
            return;
        }
        const ajuster = reajusterVue;
        const aretesUniques = dedupeAretes(aretes);
        const { definition, cadres } = construireDefinitionMermaid(racines, noeuds, aretesUniques);
        try {
            const { svg } = await window.mermaid.render('graphe-mermaid-svg-' + idDessin, definition);
            if (idDessin !== dessinEnCours) return; // rendu perime
            const vue = ajuster ? null : lireVue();
            installerRendu(svg, noeuds, aretes);
            definirMessage('');
            const conteneur = elt('graphe-svg');
            appliquerAttributsNoeuds(conteneur, noeuds);
            appliquerAttributsCadres(conteneur, cadres);
            appliquerAttributsAretes(conteneur, aretesUniques);
            if (ajuster) reajusterVue = false;
            // svg-pan-zoom peut lever ("matrix not invertible") si la zone
            // est de taille nulle au moment du calcul. Le rendu Mermaid a
            // deja reussi a ce stade : une erreur ici ne doit ni l'effacer,
            // ni empecher les dessins suivants (cf. l'en-tete du describe
            // "fenetre basse" de tests/graphe.spec.js).
            try {
                initPanZoom();
                if (vue) restaurerVue(vue);
                else ajusterVue();
            } catch (e) {
                console.error(e);
            }
        } catch (e) {
            if (idDessin !== dessinEnCours) return;
            console.error(e);
            installerRendu('', [], []);
            definirMessage('Erreur lors du rendu du graphe.', { erreur: true });
        }
    }

    // ----- Filtre projet de la nav : restriction cote client -----

    function filtreNav() {
        return window.twNav ? String(window.twNav.getState().project || '').trim() : '';
    }

    // Meme regle que main.js (getFilteredTasks) : le projet ou un
    // sous-projet a frontiere de point. Les aretes dont une extremite est
    // retiree disparaissent aussi.
    function appliquerFiltreNav(noeuds, aretes) {
        const vise = filtreNav();
        if (!vise) return { noeuds, aretes };
        const gardes = noeuds.filter(n => {
            const porte = n.project || '';
            return porte === vise || porte.startsWith(vise + '.');
        });
        const uuids = new Set(gardes.map(n => n.uuid));
        return {
            noeuds: gardes,
            aretes: aretes.filter(a => uuids.has(a.de) && uuids.has(a.vers)),
        };
    }

    // Derniere reponse du serveur ({ projets, noeuds, aretes }), pour
    // redessiner sans appel quand seul le filtre de la nav change.
    let derniereReponse = null;

    function redessiner() {
        if (!derniereReponse) return;
        const { noeuds, aretes } = appliquerFiltreNav(derniereReponse.noeuds, derniereReponse.aretes);
        return dessiner(racinesDe(derniereReponse.projets), noeuds, aretes);
    }

    // Les projets choisis, moins ceux qui descendent d'un autre choisi.
    function racinesDe(projets) {
        return projets.filter(p => !projets.some(q => q !== p && p.startsWith(q + '.')));
    }

    async function chargerEtDessiner(projets) {
        const idRequete = ++requeteEnCours;
        derniereReponse = null;
        const cle = JSON.stringify(projets);
        if (cle !== projetsDessines) {
            projetsDessines = cle;
            reajusterVue = true;
        }
        // L'ancien graphe reste affiche jusqu'au nouveau rendu.
        if (!elt('graphe-svg').querySelector('svg')) definirMessage('Chargement...');
        try {
            const requete = projets.map(p => 'projet=' + encodeURIComponent(p)).join('&');
            const r = await fetch('/api/graphe?' + requete);
            if (idRequete !== requeteEnCours) return; // reponse perimee
            if (!r.ok) {
                installerRendu('', [], []);
                definirMessage('Erreur : le serveur a renvoyé une erreur (' + r.status + ').', { erreur: true });
                return;
            }
            const d = await r.json();
            if (idRequete !== requeteEnCours) return;
            derniereReponse = { projets, noeuds: d.noeuds || [], aretes: d.aretes || [] };
            await redessiner();
        } catch (e) {
            if (idRequete !== requeteEnCours) return;
            console.error(e);
            installerRendu('', [], []);
            definirMessage('Erreur réseau lors du chargement du graphe.', { erreur: true });
        }
    }

    function actualiser() {
        if (selection.length === 0) {
            requeteEnCours++; // invalide toute requete deja partie
            dessinEnCours++; // et tout rendu en cours
            derniereReponse = null;
            projetsDessines = null;
            installerRendu('', [], []);
            definirMessage('Choisissez au moins un projet pour afficher son graphe.');
            return;
        }
        chargerEtDessiner(selection.slice());
    }

    // ----- Champ Projets a bulles -----

    const CLE_SELECTION = 'graphe-projets';
    const MAX_SUGGESTIONS = 8;
    let selection = lireSelection();
    let projetsConnusCache = [];
    let suggestionsAffichees = [];
    let suggestionActive = -1;
    let requeteSuggestions = 0;

    function lireSelection() {
        try {
            const brut = JSON.parse(localStorage.getItem(CLE_SELECTION));
            if (Array.isArray(brut)) {
                return brut.filter((p, i) => typeof p === 'string' && p && brut.indexOf(p) === i);
            }
        } catch (e) { /* stockage indisponible ou corrompu : selection vide */ }
        return [];
    }

    function ecrireSelection() {
        try { localStorage.setItem(CLE_SELECTION, JSON.stringify(selection)); } catch (e) { /* ignore */ }
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

    function calculerSuggestions(projets, saisie) {
        const q = saisie.trim().toLowerCase().replace(/\s+/g, '');
        if (!q) return [];
        const candidats = projets.filter(p => !selection.includes(p) && correspondFlou(p, q));
        // Les correspondances contigues d'abord, sinon l'ordre de la liste.
        const contigus = candidats.filter(p => p.toLowerCase().includes(q));
        const autres = candidats.filter(p => !p.toLowerCase().includes(q));
        return contigus.concat(autres).slice(0, MAX_SUGGESTIONS);
    }

    function champProjets() { return elt('graphe-projets'); }
    function listeSuggestions() { return document.querySelector('.graphe-projets-suggestions'); }

    function afficherSuggestions() {
        const liste = listeSuggestions();
        liste.innerHTML = '';
        suggestionsAffichees.forEach((nom, i) => {
            const li = document.createElement('li');
            li.className = 'graphe-projets-suggestion';
            if (i === suggestionActive) li.classList.add('graphe-projets-suggestion--active');
            li.textContent = nom;
            // mousedown + preventDefault : le champ garde le focus
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                ajouterProjet(nom);
            });
            liste.appendChild(li);
        });
        liste.hidden = suggestionsAffichees.length === 0;
    }

    async function majSuggestions() {
        const id = ++requeteSuggestions;
        const projets = await projetsConnus();
        if (id !== requeteSuggestions) return;
        suggestionsAffichees = calculerSuggestions(projets, champProjets().value);
        suggestionActive = -1;
        afficherSuggestions();
    }

    function afficherPuces() {
        const conteneur = elt('graphe-projets-puces');
        conteneur.innerHTML = '';
        for (const nom of selection) {
            const puce = document.createElement('span');
            puce.className = 'graphe-projet-puce';
            puce.dataset.projet = nom;
            const libelle = document.createElement('span');
            libelle.textContent = nom;
            const retirer = document.createElement('button');
            retirer.type = 'button';
            retirer.className = 'graphe-projet-puce-retirer';
            retirer.textContent = '×';
            retirer.setAttribute('aria-label', 'Retirer ' + nom);
            retirer.addEventListener('click', () => retirerProjet(nom));
            puce.append(libelle, retirer);
            conteneur.appendChild(puce);
        }
    }

    function selectionChangee() {
        ecrireSelection();
        afficherPuces();
        actualiser();
    }

    function ajouterProjet(nom) {
        if (!selection.includes(nom)) selection.push(nom);
        champProjets().value = '';
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

    function initChampProjets() {
        const champ = champProjets();
        afficherPuces();
        projetsConnus(); // echauffement : la premiere frappe n'attend plus
        champ.addEventListener('input', majSuggestions);
        champ.addEventListener('focus', () => { if (champ.value) majSuggestions(); });
        champ.addEventListener('blur', () => { listeSuggestions().hidden = true; });
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
        boutonModifier().addEventListener('click', () => {
            if (liaison.selectionnes.size !== 1) return;
            const [uuid] = liaison.selectionnes;
            ouvrirEdition(uuid);
        });
        boutonSupprimer().addEventListener('click', () => {
            if (liaison.selectionnes.size !== 1) return;
            const [uuid] = liaison.selectionnes;
            demanderSuppression(uuid);
        });
        elt('graphe-decouper').addEventListener('click', () => {
            if (liaison.selectionnes.size !== 1) return;
            const [uuid] = liaison.selectionnes;
            ouvrirDecoupage(uuid);
        });
        elt('graphe-decoupage-ajouter').addEventListener('click', ajouterLigneDecoupage);
        elt('graphe-decoupage-apparier').addEventListener('change', majChoixApparier);
        elt('graphe-decoupage-annuler').addEventListener('click', fermerDecoupage);
        elt('graphe-decoupage-confirmer').addEventListener('click', confirmerDecoupage);
        modaleDecoupage().addEventListener('click', (e) => {
            if (e.target === modaleDecoupage()) fermerDecoupage();
        });
        elt('graphe-suppression-annuler').addEventListener('click', fermerSuppression);
        elt('graphe-suppression-confirmer').addEventListener('click', confirmerSuppression);
        // Clic sur le fond assombri = annuler.
        modaleSuppression().addEventListener('click', (e) => {
            if (e.target === modaleSuppression()) fermerSuppression();
        });
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
                if (!modaleSuppression().hidden) fermerSuppression();
                else if (!modaleDecoupage().hidden) fermerDecoupage();
                else if (liaison.modeLiaison) annulerModeLiaison();
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
        initChampProjets();
        initInteractionsGlobales();
        window.addEventListener('resize', surRedimensionnement);
        // Le filtre projet de la nav ne selectionne rien : il restreint
        // l'affichage, sans nouvel appel serveur.
        document.addEventListener('tw-filter-change', redessiner);
        // nav.js : ajout de tache via l'editeur generique -> rafraichir.
        document.addEventListener('tw-task-added', actualiser);
        actualiser();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
