// @ts-check
/**
 * Contrat de test pour C (bouton "Modifier" de la barre d'outils du graphe)
 * et pour B (pre-remplissage du projet dans l'editeur generique de nav.js,
 * verifie sur graphe et sur kanban), plus un temoin sur la page liste.
 *
 * Aucune de ces fonctionnalites n'existe au moment ou ce fichier est ecrit :
 *   - #graphe-modifier n'existe pas dans graphe.html -- les tests qui le
 *     cherchent doivent etre ROUGES pour cette raison (selecteur absent),
 *     pas pour une autre.
 *   - nav.js appelle `instance.show()` sans argument (nav.js:444) : le champ
 *     projet ne sera PAS pre-rempli tant que showForCreate (contrat A,
 *     tests/task-editor-showforcreate.spec.js) n'est pas branche ici. Ces
 *     tests-la doivent donc aussi etre rouges, pour cette raison precise
 *     (champ vide alors qu'un projet est filtre), pas pour une erreur reseau.
 *
 * Fichier separe de tests/graphe-edition.spec.js (H3, bouton stylo par
 * noeud -- inchange) et de tests/graphe.spec.js : un autre agent y travaille
 * en parallele sur le calendrier (tests/plan-retard.spec.js), aucun des deux
 * fichiers n'est touche ici. Les helpers utiles sont copies depuis
 * graphe-edition.spec.js plutot que partages par import.
 *
 * ## Decisions retenues pour C (barre d'outils, #graphe-modifier)
 *
 * - Bouton id="graphe-modifier", pose dans .graphe-toolbar a cote de
 *   Zoom/Ajuster/Relier (voir graphe.html:21-27).
 * - Visible seulement quand EXACTEMENT une tache est selectionnee
 *   (liaison.selectionnes.size === 1, cf. graphe.js:90-96/321-331) : cache a
 *   0 selection et cache de nouveau a 2 ou plus.
 * - Clic -> meme chemin que le bouton stylo d'un noeud (graphe.js:548-570,
 *   ouvrirEdition) : recupere la tache complete via GET /api/tasks (pas le
 *   noeud /api/graphe), l'ouvre via taskEditor.showForTask(tache) (titre
 *   "Modifier la tache", cf. task-editor.js:172-210), enregistre par PUT
 *   /api/task/<uuid>/modify, puis rafraichit le graphe (actualiser()).
 * - Pendant un geste "Relier" en cours (liaison.modeLiaison === true, entre
 *   apres clic sur le bouton Relier), #graphe-modifier reste CACHE (choix
 *   retenu : plus simple a comprendre que de le laisser utilisable en pleine
 *   selection de cible).
 * - Deselection (retour a 0 tache selectionnee) -> cache a nouveau.
 *
 * ## Decisions retenues pour B (projet pre-rempli, editeur generique)
 *
 * - Mecanisme : editeurGenerique() dans nav.js pre-remplit le champ projet
 *   avec l'etat courant de la nav (window.twNav.getState().project), via
 *   showForCreate({ project }) au lieu de show() (nav.js:444). Meme
 *   comportement sur toute page qui utilise cet editeur generique (kanban,
 *   graphe, import) : teste ici sur graphe (contrat complet) et sur kanban
 *   (verification minimale, filtre actif).
 * - Projet courant vide -> champ projet vide (pas de valeur par defaut
 *   surprenante).
 * - L'enregistrement (POST /api/task/add) porte ce projet dans son corps.
 * - Liste (page /, editeur propre a main.js, PAS l'editeur generique de
 *   nav.js) : temoin, doit rester inchangee -- son taskEditor.show() ne
 *   recoit aucun projet force, meme quand un filtre projet est actif dans la
 *   nav (main.js:66-68, `taskEditor.show()` sans argument).
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

function selecteurNoeud(uuid) {
  return `[data-uuid="${uuid}"]`;
}

function boutonModifier(page) {
  return page.locator('#graphe-modifier');
}

function boutonRelier(page) {
  return page.locator('#graphe-relier');
}

/** Jeu de noeuds/aretes NPD.Orion (copie de graphe-edition.spec.js). */
function donneesOrion() {
  const noeuds = [
    {
      uuid: 'aaaa1111-0000-0000-0000-000000000001',
      description: 'Concevoir arbre de transmission',
      project: 'NPD.Orion',
      estTime: 'PT1H',
      due: null,
      externe: false,
      fige: false,
      dans_projet: true,
    },
    {
      uuid: 'aaaa2222-0000-0000-0000-000000000002',
      description: 'Tracer plan carter',
      project: 'NPD.Orion.plans',
      estTime: null,
      due: null,
      externe: false,
      fige: false,
      dans_projet: true,
    },
  ];
  const aretes = [
    { de: 'aaaa1111-0000-0000-0000-000000000001', vers: 'aaaa2222-0000-0000-0000-000000000002' },
  ];
  return { noeuds, aretes };
}

/** Tache complete (forme export TaskWarrior), description distincte du
 * libelle du noeud graphe pour prouver que la source est bien /api/tasks. */
function tacheComplete(uuid, overrides = {}) {
  return {
    uuid,
    description: 'Description venue de /api/tasks (pas du graphe)',
    project: 'NPD.Orion',
    priority: 'H',
    tags: ['pro'],
    due: null,
    scheduled: null,
    estTime: 'PT1H',
    urgency: 5,
    status: 'pending',
    ...overrides,
  };
}

/** Mocke GET /api/graphe pour les projets fournis. Renvoie la liste des projets demandes. */
async function preparerGraphe(page, { reponsesParProjet = {} } = {}) {
  const appels = [];
  await page.route('**/api/graphe**', async (route) => {
    const url = new URL(route.request().url());
    const projet = url.searchParams.get('projet');
    appels.push(projet);
    const donnees = reponsesParProjet[projet];
    if (donnees === undefined) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ projet, noeuds: [], aretes: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet, noeuds: donnees.noeuds, aretes: donnees.aretes }) });
  });
  return appels;
}

/** Mocke GET /api/tasks (forme { success, tasks: [...] }). */
async function preparerTaches(page, { tasks = [] } = {}) {
  const appels = [];
  await page.route('**/api/tasks*', async (route) => {
    appels.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, tasks }) });
  });
  return appels;
}

/** Mocke PUT /api/task/:uuid/modify et capture chaque requete (uuid cible + corps). */
async function preparerModification(page) {
  const requetes = [];
  await page.route('**/api/task/*/modify', async (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const uuidCible = segments[segments.length - 2];
    let corps = null;
    try { corps = route.request().postDataJSON(); } catch (e) { corps = null; }
    requetes.push({ uuid: uuidCible, corps });
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, task: { uuid: uuidCible, ...corps } }) });
  });
  return requetes;
}

/** Mocke POST /api/task/add et capture chaque requete (corps). */
async function preparerCreation(page) {
  const requetes = [];
  await page.route('**/api/task/add', async (route) => {
    let corps = null;
    try { corps = route.request().postDataJSON(); } catch (e) { corps = null; }
    requetes.push(corps);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, task: { uuid: 'nouvelle-0001', ...corps } }) });
  });
  return requetes;
}

/** Mocks minimaux communs (contexts/projects/config/kanban/tasks-planned),
 * pour que chaque page se charge sans erreur de reseau non pertinente. */
async function preparerMocksCommuns(page) {
  await page.route('**/api/contexts', (route) =>
    route.fulfill({ json: { success: true, contexts: [] } }));
  await page.route('**/api/projects', (route) =>
    route.fulfill({ json: { success: true, projects: [] } }));
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { notification_timeout: 3000 } }));
  await page.route('**/api/kanban/columns', (route) =>
    route.fulfill({ json: { success: true, columns: ['todo', 'doing', 'done'] } }));
  await page.route('**/api/tasks/planned', (route) =>
    route.fulfill({ json: { success: true, data: [] } }));
}

/** Tape dans le filtre projet de nav.js et attend l'anti-rebond. */
async function choisirProjet(page, nom) {
  const champ = page.locator('#tw-project');
  await champ.fill(nom);
  await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
}

/** Seme un projet dans l'etat de nav AVANT le chargement de la page
 * (localStorage, cle 'tw-nav-state'), comme dans tests/nav-ajout.spec.js. */
async function semerProjetNav(page, projet) {
  await page.addInitScript((p) => {
    localStorage.setItem('tw-nav-state', JSON.stringify({
      statuses: ['pending'], filter: '', context: '', priority: '', project: p, tags: '',
    }));
  }, projet);
}

function modalesVisibles(page) {
  return page.locator('.task-editor-modal:visible');
}

test.describe('graphe.html -- bouton Modifier de la barre d\'outils (C)', () => {

  test('cache sans selection, visible avec exactement une selection, cache des la deuxieme', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    await preparerGraphe(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: noeuds.map((n) => tacheComplete(n.uuid)) });

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(noeuds[0].uuid))).toBeVisible();

    // 0 selection : cache.
    await expect(boutonModifier(page)).toBeHidden();

    // 1 selection : visible.
    await page.locator(selecteurNoeud(noeuds[0].uuid)).click();
    await expect(boutonModifier(page)).toBeVisible();

    // 2 selections : cache de nouveau.
    await page.locator(selecteurNoeud(noeuds[1].uuid)).click();
    await expect(boutonModifier(page)).toBeHidden();

    // Retour a 1 selection (deselection du premier) : visible.
    await page.locator(selecteurNoeud(noeuds[0].uuid)).click();
    await expect(boutonModifier(page)).toBeVisible();

    // Retour a 0 (deselection du dernier restant) : cache.
    await page.locator(selecteurNoeud(noeuds[1].uuid)).click();
    await expect(boutonModifier(page)).toBeHidden();

    expect(erreurs).toEqual([]);
  });

  test('cache pendant un geste Relier en cours, meme avec une selection', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparerGraphe(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: noeuds.map((n) => tacheComplete(n.uuid)) });

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await page.locator(selecteurNoeud(noeuds[0].uuid)).click();
    await expect(boutonModifier(page)).toBeVisible();

    // Entree en mode liaison (bouton Relier, deja active car une selection existe).
    await boutonRelier(page).click();
    await expect(boutonModifier(page)).toBeHidden();

    // Annulation du mode liaison (second clic sur Relier) : la selection
    // initiale est preservee (cf. annulerModeLiaison, graphe.js), le bouton
    // redevient donc visible.
    await boutonRelier(page).click();
    await expect(boutonModifier(page)).toBeVisible();
  });

  test('clic sur Modifier ouvre la modale de la tache selectionnee, PUT sur le bon uuid, graphe rafraichi', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e));

    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[1]; // libelle graphe : "Tracer plan carter"
    const tache = tacheComplete(cible.uuid); // description volontairement differente
    const nouvelleDescription = tache.description + ' (revisee depuis Modifier)';

    const noeudsApresModif = noeuds.map((n) =>
      n.uuid === cible.uuid ? { ...n, description: nouvelleDescription } : n);

    await preparerGraphe(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [tacheComplete(noeuds[0].uuid), tache] });
    const requetes = await preparerModification(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud(cible.uuid))).toContainText(cible.description);

    // Rebranche /api/graphe pour repondre les donnees a jour a partir de
    // maintenant : l'appel declenche par l'enregistrement doit voir la
    // nouvelle description.
    await page.unroute('**/api/graphe**');
    await preparerGraphe(page, { reponsesParProjet: { 'NPD.Orion': { noeuds: noeudsApresModif, aretes } } });

    await page.locator(selecteurNoeud(cible.uuid)).click();
    await expect(boutonModifier(page)).toBeVisible();
    await boutonModifier(page).click();

    // Meme chemin que le bouton stylo : source /api/tasks, titre EDITION.
    await expect(page.locator('#task-editor-title')).toHaveText('Modifier la tâche');
    await expect(page.locator('#task-editor-description')).toHaveValue(tache.description);
    // Preuve que ce n'est pas le libelle du noeud Mermaid qui a rempli le champ.
    await expect(page.locator('#task-editor-description')).not.toHaveValue(cible.description);

    await page.fill('#task-editor-description', nouvelleDescription);
    await page.click('#task-editor-save');

    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(cible.uuid);
    expect(requetes[0].corps.description).toBe(nouvelleDescription);

    await expect(page.locator('#task-editor-description')).toBeHidden();
    await expect(page.locator(selecteurNoeud(cible.uuid))).toContainText(nouvelleDescription, { timeout: 10000 });

    expect(erreurs).toEqual([]);
  });

  test('clic sur Modifier avec une seule des deux taches selectionnees cible bien celle-la, pas l\'autre', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    const cible = noeuds[0];
    const autre = noeuds[1];
    const tacheCible = tacheComplete(cible.uuid, { description: 'Tache CIBLE (uuid ' + cible.uuid + ')' });
    const tacheAutre = tacheComplete(autre.uuid, { description: 'Tache AUTRE (uuid ' + autre.uuid + ')' });

    await preparerGraphe(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [tacheCible, tacheAutre] });
    const requetes = await preparerModification(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await page.locator(selecteurNoeud(cible.uuid)).click();
    await expect(boutonModifier(page)).toBeVisible();
    await boutonModifier(page).click();

    await expect(page.locator('#task-editor-description')).toHaveValue(tacheCible.description);

    await page.click('#task-editor-save');
    await expect.poll(() => requetes.length).toBeGreaterThan(0);
    expect(requetes[0].uuid).toBe(cible.uuid);
  });
});

test.describe('graphe.html -- projet pre-rempli dans l\'editeur generique (B)', () => {

  test('bouton + de la nav : le champ projet est pre-rempli avec le projet courant du graphe', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparerGraphe(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await preparerTaches(page, { tasks: [] });
    await preparerMocksCommuns(page);
    const requetesAdd = await preparerCreation(page);

    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await page.locator('#tw-add-area').click();
    const modale = modalesVisibles(page);
    await expect(modale).toHaveCount(1, { timeout: 3000 });

    // Mode CREATION (pas celui du bouton Modifier) : titre "Ajouter", pas "Modifier".
    await expect(modale.locator('#task-editor-title')).toHaveText('Ajouter une tâche');
    await expect(modale.locator('#task-editor-project')).toHaveValue('NPD.Orion');

    await modale.locator('#task-editor-description').fill('Nouvelle tache du projet courant');
    await modale.locator('#task-editor-save').click();

    await expect.poll(() => requetesAdd.length).toBeGreaterThan(0);
    expect(requetesAdd[0].project).toBe('NPD.Orion');
  });

  test('projet courant vide : le champ projet reste vide a l\'ouverture', async ({ page }) => {
    await preparerGraphe(page, {});
    await preparerTaches(page, { tasks: [] });
    await preparerMocksCommuns(page);
    await preparerCreation(page);

    await page.goto('/graphe.html');
    // Aucun choisirProjet() : l'etat nav par defaut a project: '' (defaultState, nav.js).

    await page.locator('#tw-add-area').click();
    const modale = modalesVisibles(page);
    await expect(modale).toHaveCount(1, { timeout: 3000 });
    await expect(modale.locator('#task-editor-project')).toHaveValue('');
  });
});

test.describe('kanban.html -- projet pre-rempli dans l\'editeur generique (B)', () => {

  test('bouton + de la nav : le champ projet est pre-rempli si un filtre projet est actif', async ({ page }) => {
    await preparerMocksCommuns(page);
    await preparerTaches(page, { tasks: [] });
    const requetesAdd = await preparerCreation(page);
    await semerProjetNav(page, 'NPD.Orion');

    await page.goto('/kanban.html');
    await page.waitForLoadState('networkidle');

    await page.locator('#tw-add-area').click();
    const modale = modalesVisibles(page);
    await expect(modale).toHaveCount(1, { timeout: 3000 });
    await expect(modale.locator('#task-editor-title')).toHaveText('Ajouter une tâche');
    await expect(modale.locator('#task-editor-project')).toHaveValue('NPD.Orion');

    await modale.locator('#task-editor-description').fill('Nouvelle tache kanban');
    await modale.locator('#task-editor-save').click();
    await expect.poll(() => requetesAdd.length).toBeGreaterThan(0);
    expect(requetesAdd[0].project).toBe('NPD.Orion');
  });
});

test.describe('liste (/) -- temoin : son editeur propre ne recoit aucun projet force (B, inchange)', () => {

  test('filtre projet actif dans la nav, mais l\'editeur de la liste s\'ouvre avec le champ projet vide', async ({ page }) => {
    await preparerMocksCommuns(page);
    await preparerTaches(page, { tasks: [] });
    const requetesAdd = await preparerCreation(page);
    await semerProjetNav(page, 'NPD.Orion');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('#tw-add-area').click();
    const modale = modalesVisibles(page);
    await expect(modale).toHaveCount(1, { timeout: 3000 });
    // C'est bien l'editeur propre de la liste (unified-task-editor, main.js),
    // pas l'editeur generique de nav.js : voir main.js:66-68, taskEditor.show()
    // sans argument. Le champ projet doit donc rester vide, meme si la nav
    // porte un filtre projet -- ce comportement n'a pas a changer ici.
    await expect(modale).toHaveAttribute('id', 'unified-task-editor');
    await expect(modale.locator('#task-editor-project')).toHaveValue('');

    await modale.locator('#task-editor-description').fill('Tache liste, sans projet force');
    await modale.locator('#task-editor-save').click();
    await expect.poll(() => requetesAdd.length).toBeGreaterThan(0);
    expect(requetesAdd[0].project).toBeFalsy();
  });
});
