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
 */
(function () {
    'use strict';

    // Compteur de requetes : une reponse qui arrive apres qu'un changement de
    // projet plus recent a ete demande est perimee et doit etre ignoree.
    let requeteEnCours = 0;

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
        elt('graphe-svg').innerHTML = '';
    }

    // Les ids Mermoid doivent etre alphanumeriques/underscore : un uuid avec
    // tirets est reecrit tel quel, prefixe pour ne jamais commencer par un
    // chiffre.
    function idNoeud(uuid) {
        return 'n_' + String(uuid).replace(/[^a-zA-Z0-9_]/g, '_');
    }

    function idSousGraphe(projet) {
        return 'p_' + String(projet).replace(/[^a-zA-Z0-9_]/g, '_');
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

    // Un subgraph par valeur distincte de `project` parmi les noeuds recus
    // (projet demande et voisins hors projet compris).
    function construireDefinitionMermaid(noeuds, aretes) {
        const parProjet = new Map();
        for (const n of noeuds) {
            const cle = n.project || '(sans projet)';
            if (!parProjet.has(cle)) parProjet.set(cle, []);
            parProjet.get(cle).push(n);
        }

        const lignes = ['flowchart TD'];
        for (const [projet, liste] of parProjet) {
            lignes.push(`subgraph ${idSousGraphe(projet)}["${echapperLabel(projet)}"]`);
            for (const n of liste) {
                lignes.push(`${idNoeud(n.uuid)}["${echapperLabel(n.description)}"]`);
            }
            lignes.push('end');
        }
        for (const a of aretes) {
            lignes.push(`${idNoeud(a.de)} --> ${idNoeud(a.vers)}`);
        }
        return lignes.join('\n');
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

    async function dessiner(noeuds, aretes) {
        viderSvg();
        if (noeuds.length === 0) {
            definirMessage('Aucune tâche trouvée pour ce projet.');
            return;
        }
        definirMessage('');
        const definition = construireDefinitionMermaid(noeuds, aretes);
        try {
            const { svg } = await window.mermaid.render('graphe-mermaid-svg', definition);
            const conteneur = elt('graphe-svg');
            conteneur.innerHTML = svg;
            appliquerAttributsNoeuds(conteneur, noeuds);
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
            await dessiner(d.noeuds || [], d.aretes || []);
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

    function init() {
        if (window.mermaid) {
            window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
        }
        document.addEventListener('tw-filter-change', actualiser);
        actualiser();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
