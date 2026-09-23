// @ts-check
/**
 * Contrat de test pour H2 : editer les dependances depuis le graphe
 * (selection de noeuds, bouton de liaison, retrait d'un lien existant).
 *
 * Fonctionnalite pas encore implementee au moment ou ce fichier est ecrit :
 * ces tests doivent echouer (selecteurs/attributs absents), pas passer par
 * accident.
 *
 * Nouveau fichier separe de tests/graphe.spec.js et tests/graphe-edition.spec.js
 * (un autre agent travaille sur graphe.js en parallele) : les helpers utiles
 * (preparer, choisirProjet, donnees de test, selecteurNoeud) sont copies ici
 * plutot que partages par import, pour ne pas toucher a ces fichiers.
 *
 * ## Specification (decisions utilisateur du 23/09), voir aussi le prompt
 *
 * - Un clic sur un noeud dans_projet le selectionne / deselectionne (classe
 *   `selectionne`) ; plusieurs noeuds peuvent etre selectionnes. Un glisser
 *   ne selectionne pas. Le clic sur le stylo (H3) ne selectionne pas.
 * - Bouton de liaison, desactive tant que rien n'est selectionne. Clic ->
 *   mode liaison : les noeuds selectionnes passent en surbrillance (classe
 *   `source-liaison`).
 * - En mode liaison, clic sur un noeud cible -> POST
 *   /api/task/<uuid cible>/depends avec ajouter = uuids des selectionnes (la
 *   CIBLE porte le depends), puis /api/graphe rappele et redessin ; la
 *   selection et le mode sont effaces. Cliquer comme cible un noeud qui est
 *   lui-meme selectionne : pas de requete, message visible.
 * - Echap OU second clic sur le bouton de liaison annule le mode : plus de
 *   surbrillance, aucune requete.
 * - Noeuds hors-projet : ni selectionnables ni cibles.
 * - Clic sur une fleche -> elle s'allume (classe `lien-selectionne` sur le
 *   chemin, qui porte data-de et data-vers) ; puis bouton "Retirer le lien"
 *   OU touche Suppr -> POST /api/task/<data-vers>/depends avec
 *   retirer=[<data-de>], puis redessin. Retirer un lien vers un voisin hors
 *   projet est permis.
 * - Refus par le serveur (409 cycle, ou autre erreur) : message du serveur
 *   affiche dans #graphe-message, graphe pas modifie, sortie du mode liaison.
 *
 * ## Choix documentes dans ce contrat (pas encore implementes)
 *
 * - Nom accessible du bouton de liaison : "Relier" (aria-label="Relier" sur
 *   un bouton dont le texte visible peut etre la fleche "→"). Recherche via
 *   getByRole('button', { name: 'Relier' }). Si l'implementation choisit un
 *   autre nom accessible, seule la fonction `boutonRelier` ci-dessous doit
 *   changer.
 * - Bouton de retrait de lien : role=button, nom accessible "Retirer le
 *   lien" (fonction `boutonRetirerLien`).
 * - Selecteur d'une fleche : `path[data-de="<uuid>"][data-vers="<uuid>"]`
 *   (fonction `selecteurFleche`), sur le modele de data-uuid / data-cadre.
 * - Message d'erreur (cible = source, ou refus serveur) : zone
 *   `#graphe-message`, deja utilisee par graphe.js (cf. definirMessage dans
 *   graphe.js et tests/graphe.spec.js / graphe-edition.spec.js). Si
 *   l'implementation choisit un autre emplacement, seule la fonction
 *   `messageZone` ci-dessous doit changer.
 * - Distinction clic / glisser : un `page.click()` (mousedown+mouseup sans
 *   deplacement) doit compter comme un clic ; une sequence mouse.move avec
 *   un deplacement notable entre down et up (fonction `glisser`) ne doit pas
 *   selectionner.
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

function selecteurNoeud(uuid) {
  return `[data-uuid="${uuid}"]`;
}

function noeudLocator(page, uuid) {
  return page.locator(selecteurNoeud(uuid));
}

/** Bouton de mise en mode liaison. Voir choix documentes en tete de fichier. */
function boutonRelier(page) {
  return page.getByRole('button', { name: 'Relier' });
}

/** Bouton de retrait du lien actuellement selectionne. */
function boutonRetirerLien(page) {
  return page.getByRole('button', { name: /retirer le lien/i });
}

/** Bouton stylo (H3) a l'interieur d'un noeud donne -- copie de graphe-edition.spec.js. */
function selecteurBoutonEdition(page, uuid) {
  return noeudLocator(page, uuid).getByRole('button', { name: /modifier/i });
}

/** Selecteur d'une fleche (arete rendue) entre deux uuid. */
function selecteurFleche(page, de, vers) {
  return page.locator(`path[data-de="${de}"][data-vers="${vers}"]`);
}

/** Zone de message d'etat/erreur de graphe.js. */
function messageZone(page) {
  return page.locator('#graphe-message');
}

/** Jeu de noeuds/aretes : trois taches dans_projet, un voisin hors-projet. */
function donneesLiaison() {
  const noeuds = [
    {
      uuid: 'd001-0000-0000-0000-000000000001',
      description: 'Concevoir arbre de transmission',
      project: 'NPD.Orion',
      estTime: null, due: null, externe: false, fige: false, dans_projet: true,
    },
    {
      uuid: 'd002-0000-0000-0000-000000000002',
      description: 'Tracer plan carter',
      project: 'NPD.Orion.plans',
      estTime: null, due: null, externe: false, fige: false, dans_projet: true,
    },
    {
      uuid: 'd003-0000-0000-0000-000000000003',
      description: 'Devis fournisseur reducteur',
      project: 'NPD.Orion.achats',
      estTime: null, due: null, externe: false, fige: false, dans_projet: true,
    },
    {
      // voisin hors projet, deja lie a d001
      uuid: 'd004-0000-0000-0000-000000000004',
      description: 'Fournir la specification amont',
      project: 'NPD.Triton',
      estTime: null, due: null, externe: false, fige: false, dans_projet: false,
    },
  ];
  const aretes = [
    { de: 'd004-0000-0000-0000-000000000004', vers: 'd001-0000-0000-0000-000000000001' },
    { de: 'd001-0000-0000-0000-000000000001', vers: 'd002-0000-0000-0000-000000000002' },
  ];
  return { noeuds, aretes };
}

/**
 * Prepare la page : mocke /api/graphe. Renvoie { appels, reroute } -- reroute
 * permet de changer la reponse servie (pour prouver le redessin apres une
 * modification de dependances), sans reecrire tout l'appel a page.route.
 */
async function preparer(page, { reponsesParProjet = {} } = {}) {
  const appels = [];
  let reponses = reponsesParProjet;
  await page.route('**/api/graphe**', async route => {
    const url = new URL(route.request().url());
    const projet = url.searchParams.get('projet');
    appels.push(projet);

    const donnees = reponses[projet];
    if (donnees === undefined) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ projet, noeuds: [], aretes: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet, noeuds: donnees.noeuds, aretes: donnees.aretes }) });
  });
  function reroute(nouvellesReponses) {
    reponses = nouvellesReponses;
  }
  return { appels, reroute };
}

/** Mocke GET /api/tasks, necessaire uniquement pour les tests qui touchent au stylo H3. */
async function preparerTaches(page, { tasks = [] } = {}) {
  await page.route('**/api/tasks*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, tasks }) });
  });
}

/**
 * Mocke POST /api/task/:uuid/depends et capture chaque requete
 * (uuid cible + corps). `reponse` permet de simuler un refus serveur
 * ({ statut, corps }) ; par defaut un succes 200.
 */
async function preparerDepends(page, { reponse = null } = {}) {
  const requetes = [];
  await page.route('**/api/task/*/depends', async route => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const uuidCible = segments[segments.length - 2]; // /api/task/<uuid>/depends
    let corps = null;
    try { corps = route.request().postDataJSON(); } catch (e) { corps = null; }
    requetes.push({ uuid: uuidCible, corps });

    if (reponse) {
      await route.fulfill({ status: reponse.statut, contentType: 'application/json',
        body: JSON.stringify(reponse.corps) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true }) });
  });
  return requetes;
}

/** Tape dans le filtre projet de nav.js et attend l'anti-rebond. */
async function choisirProjet(page, nom) {
  const champ = page.locator('#tw-project');
  await champ.fill(nom);
  await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
}

/** Glisser depuis un locator, pour prouver qu'un glisser ne selectionne pas. */
async function glisser(page, locator, dx = 80, dy = 40) {
  const boite = await locator.boundingBox();
  const depart = { x: boite.x + boite.width / 2, y: boite.y + boite.height / 2 };
  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  await page.mouse.move(depart.x + dx, depart.y + dy, { steps: 10 });
  await page.mouse.up();
}

test.describe('graphe.html — selection des noeuds (H2)', () => {

  test('un clic sur un noeud dans_projet ajoute la classe selectionne ; un second clic la retire', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    await expect(n1).toBeVisible();

    await n1.click();
    await expect(n1).toHaveClass(/selectionne/);
    await n1.click();
    await expect(n1).not.toHaveClass(/selectionne/);

    expect(erreurs).toEqual([]);
  });

  test('plusieurs noeuds peuvent etre selectionnes simultanement', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    const n2 = noeudLocator(page, noeuds[1].uuid);
    await n1.click();
    await n2.click();

    await expect(n1).toHaveClass(/selectionne/);
    await expect(n2).toHaveClass(/selectionne/);
  });

  test('un glisser sur un noeud ne le selectionne pas', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    await expect(n1).toBeVisible();
    await glisser(page, n1);

    await expect(n1).not.toHaveClass(/selectionne/);
  });

  test('le clic sur le stylo (H3) ne selectionne pas le noeud', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: noeuds.map(n => ({ uuid: n.uuid, description: n.description, project: n.project })) });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    await selecteurBoutonEdition(page, noeuds[0].uuid).click();
    await expect(n1).not.toHaveClass(/selectionne/);
  });

  test('un noeud hors-projet n\'est pas selectionnable', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const horsProjet = noeudLocator(page, noeuds[3].uuid);
    await expect(horsProjet).toBeVisible();
    await horsProjet.click();
    await expect(horsProjet).not.toHaveClass(/selectionne/);
  });
});

test.describe('graphe.html — bouton de liaison et mode liaison (H2)', () => {

  test('le bouton de liaison est desactive tant que rien n\'est selectionne, active des qu\'un noeud l\'est', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(boutonRelier(page)).toBeDisabled();
    await noeudLocator(page, noeuds[0].uuid).click();
    await expect(boutonRelier(page)).toBeEnabled();
  });

  test('cliquer le bouton de liaison met les noeuds selectionnes en surbrillance (source-liaison)', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    await n1.click();
    await boutonRelier(page).click();

    await expect(n1).toHaveClass(/source-liaison/);
  });

  test('en mode liaison, cliquer un noeud cible poste ajouter=[selectionnes] sur l\'uuid cible, puis redessine', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesLiaison();
    const source = noeuds[0];
    const cible = noeuds[1];
    const { reroute } = await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await noeudLocator(page, source.uuid).click();
    await boutonRelier(page).click();

    // Reponse differente apres modification, pour prouver le redessin.
    const aretesApres = [...aretes, { de: source.uuid, vers: cible.uuid }];
    reroute({ 'NPD.Orion': { noeuds, aretes: aretesApres } });

    await noeudLocator(page, cible.uuid).click();

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(cible.uuid);
    expect(requetes[0].corps).toEqual({ ajouter: [source.uuid], retirer: [] });

    // Selection et mode effaces, nouvelle fleche visible (redessin).
    await expect(noeudLocator(page, source.uuid)).not.toHaveClass(/selectionne|source-liaison/);
    await expect(selecteurFleche(page, source.uuid, cible.uuid)).toHaveCount(1);

    expect(erreurs).toEqual([]);
  });

  test('en mode liaison avec plusieurs sources, poste ajouter=[tous les uuids selectionnes]', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    const [source1, source2, cible] = [noeuds[0], noeuds[2], noeuds[1]];
    const { reroute } = await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await noeudLocator(page, source1.uuid).click();
    await noeudLocator(page, source2.uuid).click();
    await boutonRelier(page).click();
    reroute({ 'NPD.Orion': { noeuds, aretes } });
    await noeudLocator(page, cible.uuid).click();

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(cible.uuid);
    expect(new Set(requetes[0].corps.ajouter)).toEqual(new Set([source1.uuid, source2.uuid]));
    expect(requetes[0].corps.retirer).toEqual([]);
  });

  test('cliquer comme cible un noeud lui-meme selectionne : aucune requete, message visible', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    await n1.click();
    await boutonRelier(page).click();
    await n1.click(); // se clique lui-meme comme cible

    await expect(messageZone(page)).toBeVisible();
    expect(requetes.length).toBe(0);
  });

  test('un noeud hors-projet n\'est pas une cible valide en mode liaison', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await noeudLocator(page, noeuds[0].uuid).click();
    await boutonRelier(page).click();
    await noeudLocator(page, noeuds[3].uuid).click(); // hors-projet

    await page.waitForTimeout(200);
    expect(requetes.length).toBe(0);
  });

  test('la touche Echap annule le mode liaison sans requete', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    await n1.click();
    await boutonRelier(page).click();
    await expect(n1).toHaveClass(/source-liaison/);

    await page.keyboard.press('Escape');

    await expect(n1).not.toHaveClass(/source-liaison/);
    expect(requetes.length).toBe(0);
  });

  test('un second clic sur le bouton de liaison annule le mode sans requete', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const n1 = noeudLocator(page, noeuds[0].uuid);
    await n1.click();
    await boutonRelier(page).click();
    await expect(n1).toHaveClass(/source-liaison/);

    await boutonRelier(page).click();

    await expect(n1).not.toHaveClass(/source-liaison/);
    expect(requetes.length).toBe(0);
  });
});

test.describe('graphe.html — retrait d\'un lien existant (H2)', () => {

  test('un clic sur une fleche l\'allume (lien-selectionne), avec data-de/data-vers corrects', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const [source, cible] = [noeuds[0].uuid, noeuds[1].uuid]; // arete d001 -> d002
    const fleche = selecteurFleche(page, source, cible);
    await expect(fleche).toHaveCount(1);
    await fleche.click();
    await expect(fleche).toHaveClass(/lien-selectionne/);
  });

  test('bouton "Retirer le lien" poste retirer=[data-de] sur l\'uuid data-vers, puis redessine', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    const { noeuds, aretes } = donneesLiaison();
    const de = noeuds[0].uuid;
    const vers = noeuds[1].uuid;
    const { reroute } = await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await selecteurFleche(page, de, vers).click();

    const aretesApres = aretes.filter(a => !(a.de === de && a.vers === vers));
    reroute({ 'NPD.Orion': { noeuds, aretes: aretesApres } });

    await boutonRetirerLien(page).click();

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(vers);
    expect(requetes[0].corps).toEqual({ ajouter: [], retirer: [de] });

    await expect(selecteurFleche(page, de, vers)).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  test('la touche Suppr retire aussi le lien selectionne', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    const de = noeuds[0].uuid;
    const vers = noeuds[1].uuid;
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await selecteurFleche(page, de, vers).click();
    await page.keyboard.press('Delete');

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(vers);
    expect(requetes[0].corps).toEqual({ ajouter: [], retirer: [de] });
  });

  test('retirer un lien vers un voisin hors-projet est permis', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    // arete d004 (hors-projet) -> d001 (dans_projet)
    const de = noeuds[3].uuid;
    const vers = noeuds[0].uuid;
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const requetes = await preparerDepends(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await selecteurFleche(page, de, vers).click();
    await boutonRetirerLien(page).click();

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(vers);
    expect(requetes[0].corps).toEqual({ ajouter: [], retirer: [de] });
  });
});

test.describe('graphe.html — refus du serveur (H2)', () => {

  test('409 cycle : message du serveur affiche, graphe inchange, sortie du mode liaison', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));

    // Vrai cycle : d001 -> d002 existe deja ; faire dependre d001 de d002
    // (source d002, cible d001) le fermerait. (La version precedente reliait
    // d001 -> d002, paire deja presente : l'assertion "aucune fleche" ne
    // pouvait etre satisfaite par aucune implementation.)
    const { noeuds, aretes } = donneesLiaison();
    const source = noeuds[1];
    const cible = noeuds[0];
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const messageServeur = 'Dépendance circulaire détectée : opération refusée.';
    // Forme REELLE d'une erreur du serveur : HTTPException de FastAPI rend
    // {"detail": ...} (main_fastapi.py), pas {success:false, error:...}.
    await preparerDepends(page, { reponse: { statut: 409, corps: { detail: messageServeur } } });

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await noeudLocator(page, source.uuid).click();
    await boutonRelier(page).click();
    await noeudLocator(page, cible.uuid).click();

    await expect(messageZone(page)).toContainText(messageServeur);
    // Le graphe n'a pas ete modifie : l'arete refusee n'apparait pas.
    await expect(selecteurFleche(page, source.uuid, cible.uuid)).toHaveCount(0);
    // Sortie du mode liaison : plus de surbrillance.
    await expect(noeudLocator(page, source.uuid)).not.toHaveClass(/source-liaison/);

    expect(erreurs).toEqual([]);
  });

  test('autre erreur serveur : message affiche, graphe inchange', async ({ page }) => {
    const { noeuds, aretes } = donneesLiaison();
    const de = noeuds[0].uuid;
    const vers = noeuds[1].uuid;
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    const messageServeur = "La tâche n'existe pas.";
    await preparerDepends(page, { reponse: { statut: 400, corps: { detail: messageServeur } } });

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await selecteurFleche(page, de, vers).click();
    await boutonRetirerLien(page).click();

    await expect(messageZone(page)).toContainText(messageServeur);
    await expect(selecteurFleche(page, de, vers)).toHaveCount(1);
  });
});
