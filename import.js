/**
 * import.html — import CSV en masse : choix d'un fichier, apercu (tableau +
 * graphe Mermaid) via POST /api/import/apercu, puis import effectif via
 * POST /api/import.
 *
 * Lecture du fichier : FileReader.readAsText(fichier, 'UTF-8'), le texte brut
 * est envoye tel quel a /api/import/apercu puis /api/import (memes octets,
 * accents et point-virgules compris -- cf. l'en-tete de tests/import.spec.js).
 *
 * Echappement : tout texte venant du CSV est insere via textContent (jamais
 * innerHTML) dans le tableau et la liste d'erreurs. Le graphe Mermaid utilise
 * la meme fonction d'echappement de libelle que graphe.js (guillemets,
 * crochets, parentheses, accolades -- les accents passent tels quels, Mermaid
 * les rend sans probleme).
 *
 * Marquage des lignes en erreur (decision non fixee par le contrat) : une
 * erreur dont la ligne correspond a une ligne de donnees (tr[data-ligne])
 * marque cette seule ligne. Une erreur sans ligne de donnees propre
 * (typiquement l'entete, ligne 1 -- colonne non reconnue, colonne
 * description manquante) affecte le parsing de TOUTES les lignes : dans ce
 * cas, toutes les lignes du tableau sont marquees "en-erreur".
 *
 * Erreurs serveur (POST /api/import) : `detail.erreurs` pour un 400 (memes
 * champs que l'apercu), `detail` texte brut pour un 500/502 (message
 * Taskwarrior). Jamais de message de succes affiche dans ces deux cas.
 */
(function () {
    'use strict';

    let compteurRequete = 0;
    let csvCourant = null;       // texte du dernier fichier choisi, envoye tel quel a /api/import
    let apercuValide = false;    // dernier apercu recu, sans erreur
    let projetPourGraphe = '';   // pris sur la premiere tache de l'apercu, pour le lien vers graphe.html

    function elt(id) {
        return document.getElementById(id);
    }

    function viderEnfants(el) {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    // Meme echappement de libelle Mermaid que graphe.js.
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

    function idNoeud(uuid) {
        return 'n_' + String(uuid).replace(/[^a-zA-Z0-9_]/g, '_');
    }

    function majBouton() {
        elt('import-bouton-importer').disabled = !apercuValide;
    }

    // Remet la page a plat avant un nouvel apercu : desactive Importer,
    // efface l'ancien tableau, les anciennes erreurs et l'ancien graphe.
    function reinitialiserAvantApercu() {
        apercuValide = false;
        majBouton();
        viderEnfants(elt('import-apercu-tableau').querySelector('tbody'));
        viderEnfants(elt('import-erreurs'));
        viderEnfants(elt('import-graphe'));
        viderEnfants(elt('import-resultat'));
    }

    function construireLigneTableau(tache, enErreur) {
        const tr = document.createElement('tr');
        tr.dataset.ligne = String(tache.ligne);
        if (enErreur) tr.classList.add('en-erreur');

        const tdLigne = document.createElement('td');
        tdLigne.textContent = String(tache.ligne);
        const tdDesc = document.createElement('td');
        tdDesc.textContent = tache.description || '';
        const tdProjet = document.createElement('td');
        tdProjet.textContent = tache.project || '';
        const tdStatut = document.createElement('td');
        tdStatut.textContent = tache.nouvelle ? 'Nouvelle' : 'Mise à jour';

        tr.append(tdLigne, tdDesc, tdProjet, tdStatut);
        return tr;
    }

    function remplirTableau(taches, erreurs) {
        const corps = elt('import-apercu-tableau').querySelector('tbody');
        viderEnfants(corps);

        const lignesAvecDonnee = new Set(taches.map(t => t.ligne));
        const lignesErreurDirectes = new Set(
            erreurs.filter(e => lignesAvecDonnee.has(e.ligne)).map(e => e.ligne)
        );
        // Une erreur sans ligne de donnees propre (l'entete, le plus souvent)
        // affecte tout le fichier : toutes les lignes sont alors marquees.
        const erreurGlobale = erreurs.some(e => !lignesAvecDonnee.has(e.ligne));

        for (const tache of taches) {
            const enErreur = erreurGlobale || lignesErreurDirectes.has(tache.ligne);
            corps.appendChild(construireLigneTableau(tache, enErreur));
        }
    }

    function remplirErreurs(erreurs) {
        const liste = elt('import-erreurs');
        viderEnfants(liste);
        for (const e of erreurs) {
            const li = document.createElement('li');
            li.textContent = `Ligne ${e.ligne} (${e.colonne}) : ${e.message}`;
            liste.appendChild(li);
        }
    }

    async function dessinerGraphe(noeuds, aretes) {
        const conteneur = elt('import-graphe');
        viderEnfants(conteneur);
        if (!window.mermaid || !noeuds.length) return;

        const lignes = ['flowchart TD'];
        for (const n of noeuds) {
            lignes.push(`${idNoeud(n.uuid)}["${echapperLabel(n.description)}"]`);
        }
        for (const a of aretes) {
            lignes.push(`${idNoeud(a.de)} --> ${idNoeud(a.vers)}`);
        }
        const definition = lignes.join('\n');

        try {
            const { svg } = await window.mermaid.render('import-mermaid-svg', definition);
            conteneur.innerHTML = svg;
            // Mermaid ne pose pas d'attribut dedie sur ses noeuds : on
            // retrouve chaque groupe par son id (prefixe "flowchart-<id>-",
            // cf. graphe.js) pour y ajouter data-uuid.
            for (const n of noeuds) {
                const idSan = idNoeud(n.uuid);
                const g = conteneur.querySelector(`g.node[id^="flowchart-${idSan}-"]`)
                    || conteneur.querySelector(`[id*="${idSan}"]`);
                if (g) g.setAttribute('data-uuid', n.uuid);
            }
        } catch (e) {
            console.error(e);
            viderEnfants(conteneur);
        }
    }

    async function traiterApercu(texteCsv) {
        const idRequete = ++compteurRequete;
        try {
            const r = await fetch('/api/import/apercu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: texteCsv }),
            });
            if (idRequete !== compteurRequete) return; // reponse perimee
            const corps = await r.json();
            if (idRequete !== compteurRequete) return;

            const taches = corps.taches || [];
            const erreurs = corps.erreurs || [];
            remplirTableau(taches, erreurs);
            remplirErreurs(erreurs);
            await dessinerGraphe(
                (corps.graphe && corps.graphe.noeuds) || [],
                (corps.graphe && corps.graphe.aretes) || []
            );

            apercuValide = r.ok && erreurs.length === 0;
            projetPourGraphe = taches.length ? (taches[0].project || '') : '';
            majBouton();
        } catch (e) {
            if (idRequete !== compteurRequete) return;
            console.error(e);
            remplirErreurs([{ ligne: 0, colonne: '', message: 'Erreur réseau lors de l\'aperçu.' }]);
        }
    }

    function surChoixFichier(e) {
        const fichier = e.target.files && e.target.files[0];
        if (!fichier) return;
        reinitialiserAvantApercu();
        const lecteur = new FileReader();
        lecteur.addEventListener('load', () => {
            csvCourant = lecteur.result;
            traiterApercu(csvCourant);
        });
        lecteur.readAsText(fichier, 'UTF-8');
    }

    function afficherResultatSucces(corps) {
        const zone = elt('import-resultat');
        viderEnfants(zone);
        const p = document.createElement('p');
        p.textContent = `${corps.creees} tâche(s) créée(s), ${corps.mises_a_jour} mise(s) à jour.`;
        const lien = document.createElement('a');
        lien.href = 'graphe.html?projet=' + encodeURIComponent(projetPourGraphe);
        lien.textContent = 'Voir le graphe';
        zone.append(p, lien);
    }

    function afficherResultatEchec(messages) {
        const zone = elt('import-resultat');
        viderEnfants(zone);
        const ul = document.createElement('ul');
        for (const m of messages) {
            const li = document.createElement('li');
            li.textContent = m;
            ul.appendChild(li);
        }
        zone.appendChild(ul);
    }

    async function surClicImporter() {
        if (!csvCourant) return;
        try {
            const r = await fetch('/api/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: csvCourant }),
            });
            const corps = await r.json().catch(() => ({}));
            if (r.ok) {
                afficherResultatSucces(corps);
                return;
            }
            if (r.status === 400 && corps.detail && corps.detail.erreurs) {
                afficherResultatEchec(corps.detail.erreurs.map(
                    e => `Ligne ${e.ligne} (${e.colonne}) : ${e.message}`
                ));
                return;
            }
            const detail = typeof corps.detail === 'string' ? corps.detail : 'Erreur lors de l\'import.';
            afficherResultatEchec([detail]);
        } catch (e) {
            console.error(e);
            afficherResultatEchec(['Erreur réseau lors de l\'import.']);
        }
    }

    function init() {
        if (window.mermaid) {
            window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
        }
        elt('import-fichier').addEventListener('change', surChoixFichier);
        elt('import-bouton-importer').addEventListener('click', surClicImporter);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
