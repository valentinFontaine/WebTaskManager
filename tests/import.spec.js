// @ts-check
/**
 * Contrat de test pour import.html / import.js (import CSV en masse, cote UI).
 *
 * Page absente au moment ou ce fichier est ecrit : ces tests doivent echouer
 * (page introuvable, lien absent, selecteurs absents), pas passer par
 * accident. Le detail exact de la reponse mockee vient de main_fastapi.py
 * (routes POST /api/import/apercu et POST /api/import) et de import_csv.py --
 * voir les docstrings de test_import_routes.py / test_import_csv.py, deja
 * lues pour ecrire ce fichier.
 *
 * ## Selecteurs choisis (a transmettre a l'implementeur, rien n'est encore
 * ecrit cote page) :
 *
 *   - page                : /import.html
 *   - lien nav.js         : <a class="tw-nav-link"> texte "Import", href
 *                           se terminant par "import.html" (meme motif que
 *                           les quatre entrees existantes de PAGES).
 *   - champ fichier        : #import-fichier (input[type=file][accept=".csv"])
 *   - tableau d'apercu     : #import-apercu-tableau, une ligne
 *                           <tr data-ligne="N"> par tache, classe "en-erreur"
 *                           sur la ligne concernee par une erreur.
 *   - liste des erreurs    : #import-erreurs, un <li> par erreur, texte
 *                           contenant ligne + colonne + message.
 *   - graphe du lot        : #import-graphe (conteneur), <svg> dedans quand
 *                           rendu ; un noeud par tache via [data-uuid].
 *   - bouton importer      : #import-bouton-importer
 *   - zone de resultat     : #import-resultat (succes ou echec)
 *   - lien vers le graphe  : a[href^="graphe.html?projet="] dans #import-resultat
 *   - lien modele          : #import-modele-lien, href="/modele-import.csv"
 *
 * Si l'implementation choisit d'autres selecteurs, seules les fonctions
 * utilitaires en tete de ce fichier (selecteurs*) sont a ajuster.
 *
 * ## Forme des reponses mockees (lue dans main_fastapi.py / import_csv.py)
 *
 *   POST /api/import/apercu {csv} -> 200
 *     { taches: [{ uuid, description, project?, ligne, nouvelle, depends? }],
 *       erreurs: [{ ligne, colonne, message }],
 *       graphe: { noeuds: [{ uuid, description }], aretes: [{ de, vers }] } }
 *
 *   POST /api/import {csv} -> 200 { success: true, creees, mises_a_jour }
 *                          -> 400 { detail: { erreurs: [...] } }
 *                          -> 500/502 { detail: "..." } (jamais 200)
 */
const { test, expect } = require('@playwright/test');

const CSV_SIMPLE =
  'ref;description;projet\n' +
  'a;Tache A;Proj\n';

// Contient un accent et un point-virgule dans une valeur, pour verifier que
// le texte transmis au serveur n'est ni tronque ni reencode au passage.
const CSV_ACCENTS =
  'ref;description;projet;tags;estTime;due;scheduled;priorite;depend_de\n' +
  'devis;Demander 3 devis;NPD.Orion.achats;pro;2h;;;M;\n' +
  'attente;Reponse fournisseurs;NPD.Orion.achats;externe;10j;;;;devis\n';

const CSV_EN_ERREUR =
  'ref;description;projet;bidule\n' +
  'a;Tache A;Proj;x\n';

function reponseApercuValide() {
  return {
    taches: [
      { uuid: 'u-devis', description: 'Demander 3 devis', project: 'NPD.Orion.achats', ligne: 2, nouvelle: true },
      { uuid: 'u-attente', description: 'Reponse fournisseurs', project: 'NPD.Orion.achats', ligne: 3, nouvelle: true, depends: ['u-devis'] },
    ],
    erreurs: [],
    graphe: {
      noeuds: [
        { uuid: 'u-devis', description: 'Demander 3 devis' },
        { uuid: 'u-attente', description: 'Reponse fournisseurs' },
      ],
      aretes: [{ de: 'u-devis', vers: 'u-attente' }],
    },
  };
}

function reponseApercuEnErreur() {
  return {
    taches: [
      { uuid: 'u-a', description: 'Tache A', project: 'Proj', ligne: 2, nouvelle: true },
    ],
    erreurs: [
      { ligne: 1, colonne: 'bidule', message: 'Colonne non reconnue : bidule' },
    ],
    graphe: { noeuds: [{ uuid: 'u-a', description: 'Tache A' }], aretes: [] },
  };
}

/** Intercepte /api/import/apercu et /api/import, capture les corps recus. */
async function preparer(page, { apercu = null, statutApercu = 200, statutImport = null, reponseImport = null } = {}) {
  const corpsApercu = [];
  const corpsImport = [];

  await page.route('**/api/import/apercu', async route => {
    corpsApercu.push(JSON.parse(route.request().postData()));
    await route.fulfill({
      status: statutApercu,
      contentType: 'application/json',
      body: JSON.stringify(apercu || reponseApercuValide()),
    });
  });

  // Route distincte : /api/import ne doit pas intercepter /api/import/apercu,
  // d'ou l'ordre d'enregistrement (Playwright prend la derniere route posee
  // qui matche, donc /api/import/apercu doit rester plus specifique et etre
  // enregistree ; ** dans le motif ci-dessous ne matche que le chemin exact
  // /api/import puisqu'aucun segment supplementaire n'est demande ici).
  await page.route('**/api/import', async route => {
    if (route.request().url().includes('/api/import/apercu')) {
      await route.fallback();
      return;
    }
    corpsImport.push(JSON.parse(route.request().postData()));
    if (statutImport === null) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(reponseImport || { success: true, creees: 5, mises_a_jour: 0 }) });
      return;
    }
    if (statutImport === 400) {
      await route.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify(reponseImport || { detail: { erreurs: [{ ligne: 1, colonne: 'x', message: 'erreur' }] } }) });
      return;
    }
    await route.fulfill({ status: statutImport, contentType: 'application/json',
      body: JSON.stringify(reponseImport || { detail: 'Erreur Taskwarrior : donnee invalide' }) });
  });

  return { corpsApercu, corpsImport };
}

/** Selectionne un fichier CSV via un buffer, sans passer par le disque. */
async function choisirFichier(page, contenuCsv, nomFichier = 'import.csv') {
  await page.locator('#import-fichier').setInputFiles({
    name: nomFichier,
    mimeType: 'text/csv',
    buffer: Buffer.from(contenuCsv, 'utf-8'),
  });
}

test.describe('import.html — import CSV en masse', () => {

  // --- 1. Lien de navigation ------------------------------------------------

  test('nav.js porte un lien Import vers la page d\'import', async ({ page }) => {
    // Depuis une page existante quelconque : le lien est partage par nav.js.
    await preparer(page);
    await page.goto('/graphe.html');
    const lien = page.locator('a.tw-nav-link', { hasText: 'Import' });
    await expect(lien).toHaveCount(1);
    await expect(lien).toHaveAttribute('href', /import\.html$/);
  });

  // --- 2. Selection de fichier -> apercu automatique ------------------------

  test('choisir un fichier lit son contenu UTF-8 et poste l\'apercu automatiquement', async ({ page }) => {
    const { corpsApercu } = await preparer(page);
    await page.goto('/import.html');

    await choisirFichier(page, CSV_ACCENTS);

    await expect.poll(() => corpsApercu.length).toBeGreaterThan(0);
    expect(corpsApercu[0].csv).toBe(CSV_ACCENTS);
  });

  // --- 3. Tableau d'apercu, erreurs et ligne marquee ------------------------

  test('le tableau d\'apercu liste chaque tache et marque la ligne en erreur', async ({ page }) => {
    await preparer(page, { apercu: reponseApercuEnErreur() });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_EN_ERREUR);

    const tableau = page.locator('#import-apercu-tableau');
    await expect(tableau).toBeVisible();
    const ligne2 = tableau.locator('tr[data-ligne="2"]');
    await expect(ligne2).toContainText('Tache A');
    await expect(ligne2).toContainText('Proj');
    await expect(ligne2).toContainText(/nouvelle/i);

    // La liste des erreurs affiche ligne, colonne et message.
    const erreurs = page.locator('#import-erreurs');
    await expect(erreurs).toContainText('1');
    await expect(erreurs).toContainText('bidule');
    await expect(erreurs).toContainText('Colonne non reconnue');

    // La ligne concernee par l'erreur (ligne 1 = l'entete, colonne "bidule")
    // n'a pas de ligne de tableau propre puisque l'entete n'a pas de
    // data-ligne : ici l'erreur porte sur la tache de la ligne 2, marquee.
    await expect(ligne2).toHaveClass(/en-erreur/);
  });

  // --- 4. Graphe du lot rendu quand aucune erreur de cycle ------------------

  test('le graphe du lot est rendu (SVG, un noeud par tache) sans erreur de cycle', async ({ page }) => {
    await preparer(page, { apercu: reponseApercuValide() });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_ACCENTS);

    const conteneur = page.locator('#import-graphe');
    await expect(conteneur.locator('svg')).toBeVisible();
    await expect(conteneur.locator('[data-uuid="u-devis"]')).toHaveCount(1);
    await expect(conteneur.locator('[data-uuid="u-attente"]')).toHaveCount(1);
  });

  // --- 5. Bouton Importer : desactivation, puis trois issues ----------------

  test('le bouton Importer est desactive avant tout apercu', async ({ page }) => {
    await preparer(page);
    await page.goto('/import.html');
    await expect(page.locator('#import-bouton-importer')).toBeDisabled();
  });

  test('le bouton Importer reste desactive si l\'apercu contient une erreur', async ({ page }) => {
    await preparer(page, { apercu: reponseApercuEnErreur() });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_EN_ERREUR);

    await expect(page.locator('#import-erreurs')).toContainText('Colonne non reconnue');
    await expect(page.locator('#import-bouton-importer')).toBeDisabled();
  });

  test('un apercu sans erreur active le bouton Importer', async ({ page }) => {
    await preparer(page, { apercu: reponseApercuValide() });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_ACCENTS);

    await expect(page.locator('#import-bouton-importer')).toBeEnabled();
  });

  test('import reussi : message avec les compteurs et un lien vers le graphe', async ({ page }) => {
    const { corpsApercu, corpsImport } = await preparer(page, {
      apercu: reponseApercuValide(),
      reponseImport: { success: true, creees: 5, mises_a_jour: 0 },
    });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_ACCENTS);
    await expect(page.locator('#import-bouton-importer')).toBeEnabled();
    await page.locator('#import-bouton-importer').click();

    const resultat = page.locator('#import-resultat');
    await expect(resultat).toContainText(/5.*cr[ée][ée]s?/i);
    await expect(resultat).toContainText(/0.*mise.*(a|à) jour/i);
    await expect(resultat.locator('a[href^="graphe.html?projet="]')).toHaveCount(1);

    // Le corps envoye a /api/import est exactement le meme texte que celui
    // envoye pour l'apercu (accents et point-virgule preserves).
    expect(corpsImport.length).toBe(1);
    expect(corpsImport[0].csv).toBe(corpsApercu[0].csv);
    expect(corpsImport[0].csv).toBe(CSV_ACCENTS);
  });

  test('import refuse (400) : les erreurs de detail.erreurs sont affichees, pas de succes', async ({ page }) => {
    await preparer(page, {
      apercu: reponseApercuValide(),
      statutImport: 400,
      reponseImport: { detail: { erreurs: [{ ligne: 3, colonne: 'depend_de', message: 'Reference inconnue' }] } },
    });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_ACCENTS);
    await page.locator('#import-bouton-importer').click();

    const resultat = page.locator('#import-resultat');
    await expect(resultat).toContainText('Reference inconnue');
    await expect(resultat).not.toContainText(/cr[ée][ée]s?/i);
  });

  test('echec serveur (500) : le detail est affiche, aucun message de succes', async ({ page }) => {
    await preparer(page, {
      apercu: reponseApercuValide(),
      statutImport: 500,
      reponseImport: { detail: 'Erreur Taskwarrior : donnee invalide' },
    });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_ACCENTS);
    await page.locator('#import-bouton-importer').click();

    const resultat = page.locator('#import-resultat');
    await expect(resultat).toContainText(/erreur taskwarrior/i);
    await expect(resultat).not.toContainText(/cr[ée][ée]s?/i);
  });

  // --- 6. Changer de fichier remplace l'apercu et desactive Importer -------

  test('choisir un autre fichier remplace l\'apercu et desactive Importer jusqu\'a la nouvelle reponse', async ({ page }) => {
    let resoudre;
    const attenteApercu2 = new Promise(r => { resoudre = r; });
    let appel = 0;

    await page.route('**/api/import/apercu', async route => {
      appel += 1;
      if (appel === 1) {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(reponseApercuValide()) });
        return;
      }
      // Deuxieme appel : ne repond qu'apres que le test a verifie l'etat
      // intermediaire (bouton desactive, ancien apercu remplace).
      await attenteApercu2;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(reponseApercuEnErreur()) });
    });
    await page.route('**/api/import', async route => {
      if (route.request().url().includes('/api/import/apercu')) { await route.fallback(); return; }
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, creees: 1, mises_a_jour: 0 }) });
    });

    await page.goto('/import.html');
    await choisirFichier(page, CSV_ACCENTS, 'premier.csv');
    await expect(page.locator('#import-bouton-importer')).toBeEnabled();
    await expect(page.locator('#import-apercu-tableau')).toContainText('Demander 3 devis');

    await choisirFichier(page, CSV_EN_ERREUR, 'second.csv');
    // Avant que la deuxieme reponse n'arrive : Importer redevient desactive.
    await expect(page.locator('#import-bouton-importer')).toBeDisabled();

    resoudre();
    await expect(page.locator('#import-apercu-tableau')).toContainText('Tache A');
    await expect(page.locator('#import-apercu-tableau')).not.toContainText('Demander 3 devis');
    await expect(page.locator('#import-bouton-importer')).toBeDisabled();
  });

  // --- 7. Lien de telechargement du modele ----------------------------------

  test('un lien Telecharger le modele pointe vers le CSV modele', async ({ page }) => {
    await preparer(page);
    await page.goto('/import.html');
    const lien = page.locator('#import-modele-lien');
    await expect(lien).toBeVisible();
    await expect(lien).toHaveAttribute('href', '/modele-import.csv');
  });

  // --- Trou I14 : innerHTML brut non detecte --------------------------------
  //
  // Le texte du CSV (description, projet) vient de l'utilisateur qui a
  // choisi le fichier -- rien ne garantit qu'il soit inoffensif. La
  // docstring de import.js promet un echappement par textContent, jamais
  // innerHTML, pour ce tableau. Ce test verifie ce point precis : une
  // description contenant une balise <img onerror=...> et un projet
  // contenant <b> ne doivent produire NI execution de script, NI element
  // DOM correspondant dans #import-apercu-tableau -- seul le texte brut,
  // tel quel, doit apparaitre.
  //
  // Attendu VERT sur le code actuel (import.js utilise deja textContent).
  // Un rapport separe verifie que la mutation "innerHTML brut pour la
  // description" fait bien echouer ce test (rouge), avant restauration.

  test('I14 : une description/projet HTML n\'est jamais interpretee dans le tableau d\'apercu', async ({ page }) => {
    const chargeUtile = '<img src=x onerror="window.__xss=1">';
    const projetHtml = '<b>p</b>';
    await preparer(page, {
      apercu: {
        taches: [
          { uuid: 'u-xss', description: chargeUtile, project: projetHtml, ligne: 2, nouvelle: true },
        ],
        erreurs: [],
        graphe: { noeuds: [{ uuid: 'u-xss', description: chargeUtile }], aretes: [] },
      },
    });
    await page.goto('/import.html');
    await choisirFichier(page, CSV_SIMPLE);

    const tableau = page.locator('#import-apercu-tableau');
    await expect(tableau.locator('tr[data-ligne="2"]')).toBeVisible();

    // Aucune execution du gestionnaire onerror injecte.
    const xss = await page.evaluate(() => window.__xss);
    expect(xss).toBeUndefined();

    // Aucun element <img> ni <b> cree a partir du contenu du CSV.
    await expect(tableau.locator('img')).toHaveCount(0);
    await expect(tableau.locator('b')).toHaveCount(0);

    // Le texte brut, non interprete, reste visible tel quel.
    await expect(tableau.locator('tr[data-ligne="2"]')).toContainText(chargeUtile);
    await expect(tableau.locator('tr[data-ligne="2"]')).toContainText(projetHtml);
  });
});
