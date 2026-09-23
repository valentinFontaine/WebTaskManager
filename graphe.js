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
 */
(function () {
    'use strict';

    // Compteur de requetes : une reponse qui arrive apres qu'un changement de
    // projet plus recent a ete demande est perimee et doit etre ignoree.
    let requeteEnCours = 0;

    // Instance svg-pan-zoom courante, recreee a chaque nouveau rendu.
    let panZoom = null;

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
        if (noeuds.length === 0) {
            definirMessage('Aucune tâche trouvée pour ce projet.');
            return;
        }
        definirMessage('');
        const { definition, cadres } = construireDefinitionMermaid(racine, noeuds, aretes);
        try {
            const { svg } = await window.mermaid.render('graphe-mermaid-svg', definition);
            const conteneur = elt('graphe-svg');
            conteneur.innerHTML = svg;
            appliquerAttributsNoeuds(conteneur, noeuds);
            appliquerAttributsCadres(conteneur, cadres);
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
        initBoutons();
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
