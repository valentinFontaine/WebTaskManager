// @ts-check
/**
 * Contrat de test pour le bouton "Add task" de la barre de nav (#tw-add-area,
 * nav.js:371-372), sur les 5 pages qui incluent nav.js.
 *
 * Defaut constate (voir scratchpad/nav_addbtn_repro.js) : nav.js emet un
 * CustomEvent document 'tw-open-add' NON annulable, sans ecouteur propre.
 * Seul main.js (page liste) l'ecoute (main.js:65-67) et ouvre son propre
 * TaskEditor (modalId 'unified-task-editor'). Sur kanban.html,
 * calendar-planner.html, graphe.html et import.html, rien n'ecoute cet
 * evenement : le clic ne fait rien, sans la moindre erreur console.
 *
 * ## Conception retenue (a implementer, pas encore en place)
 *
 * - nav.js emet 'tw-open-add' comme evenement ANNULABLE (cancelable: true).
 *   Une page qui a deja son propre editeur l'intercepte et appelle
 *   preventDefault() :
 *     - main.js (liste)            -> son TaskEditor existant, modalId
 *       'unified-task-editor' (deja instancie, voir main.js:376-384) ;
 *     - calendar-planner.js        -> le MEME flux que son bouton
 *       #add-task-btn (calendar-planner.js:668-679) : appeler
 *       taskEditor.show(). Cette instance est creee dans calendar-planner.html
 *       (script inline, ligne 141) SANS option modalId, donc avec le modalId
 *       par defaut de TaskEditor : 'task-editor-modal'
 *       (task-editor.js:13, `modalId: 'task-editor-modal'`).
 * - Si personne n'a appele preventDefault, nav.js ouvre un editeur generique :
 *   charge task-editor.js a la demande si `TaskEditor` n'existe pas encore,
 *   cree SA PROPRE instance (modale dediee, id documente ici comme
 *   NAV_GENERIC_MODAL_ID -- voir note plus bas), cree la tache par la meme
 *   route que les autres pages (POST /api/task/add), puis emet un
 *   CustomEvent document 'tw-task-added' (detail: la tache retournee, ou la
 *   reponse complete).
 *   Concerne kanban.html, graphe.html, import.html : aucun n'a d'editeur a
 *   lui aujourd'hui (graphe.html instancie bien un TaskEditor pour l'edition
 *   d'un noeud existant -- modalId 'graphe-task-editor', voir
 *   graphe.js:533-544 -- mais cette instance n'est jamais branchee sur
 *   'tw-open-add' : elle reste hors sujet ici).
 * - graphe.html ecoute 'tw-task-added' et rappelle GET /api/graphe (nouveau
 *   rendu). kanban.html ecoute 'tw-task-added' et recharge ses taches
 *   (rappelle GET /api/tasks, le meme appel qu'au chargement).
 * - Jamais deux editeurs visibles en meme temps.
 *
 * ## Note sur NAV_GENERIC_MODAL_ID
 *
 * L'enonce ne fixe pas l'id de la modale generique de nav.js : c'est un choix
 * d'implementation. Ce fichier ne le suppose PAS pour verifier qu'une modale
 * s'ouvre (le test 1 compte les modales VISIBLES par la classe commune
 * '.task-editor-modal', posee par TaskEditor.createModal() quel que soit
 * l'id -- voir task-editor.js:47). Il ne s'en sert que comme documentation ;
 * s'il s'avere faux apres implementation, aucun test ci-dessous n'en depend.
 * (Les tests 5 verifient l'INVERSE : que la modale visible sur liste/calendrier
 * porte bien l'id de leur propre editeur, pas un id different.)
 *
 * ## Forme reelle des routes (lue dans main_fastapi.py)
 *
 * - POST /api/task/add : body TaskCreate {description, tags?, due?,
 *   scheduled?, priority?, project?, estTime?}. Reponse ResponseModel
 *   {success, message, task: {..., uuid, description, ...}} (voir
 *   main_fastapi.py:959-1017). C'est la route qu'utilise TaskEditor.saveTask
 *   (task-editor.js:398-423, endpoint '/api/task/add' quand isEdit=false).
 * - GET /api/tasks : reponse ResponseModel {success, tasks: [...]}
 *   (main_fastapi.py:461-498).
 * - GET /api/graphe?projet=X : reponse {projet, noeuds: [...], aretes: [...]}
 *   (main_fastapi.py:585 et suivantes, construire_graphe()).
 *
 * ## Lecture attendue de ce fichier avant implementation
 *
 * Tous les tests qui dependent d'une modale ouverte doivent etre ROUGES sur
 * les 4 pages hors liste (aucune modale ne s'ouvre aujourd'hui), et VERTS sur
 * la liste (main.js gere deja 'tw-open-add'). Le test "aucune erreur
 * console" peut etre vert partout : le defaut actuel ne leve aucune erreur,
 * il ne fait simplement rien.
 */
const { test, expect } = require('@playwright/test');

const PAGES = [
  { path: '/', nom: 'liste', editeurPropre: true, modalIdPropre: 'unified-task-editor' },
  { path: '/kanban.html', nom: 'kanban', editeurPropre: false, modalIdPropre: null },
  { path: '/calendar-planner.html', nom: 'calendrier', editeurPropre: true, modalIdPropre: 'task-editor-modal' },
  { path: '/graphe.html', nom: 'graphe', editeurPropre: false, modalIdPropre: null },
  { path: '/import.html', nom: 'import', editeurPropre: false, modalIdPropre: null },
];

const DESCRIPTION_TEST = 'Tache creee via le bouton Add task de la nav';

// ── Mocks reseau, communs a toutes les pages ─────────────────────────────────
//
// Seuls /api/task/add, /api/tasks et /api/graphe sont observes (compteurs
// d'appels, capture du corps envoye) : c'est ce que les tests ont besoin de
// verifier. Le reste (contexts, projects, config, kanban/columns,
// tasks/planned, plan.json) recoit une reponse minimale mais valide, pour que
// chaque page se charge sans erreur, sans pour autant en tester le contenu.
async function installerMocks(page) {
  const etat = { appelsAdd: [], appelsTasks: 0, appelsGraphe: 0 };

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
  // /plan.json n'est PAS mocke : c'est un fichier statique reel du depot
  // (racine), servi normalement par le backend. Le mocker en 404 avait
  // paru inoffensif (chargerPlan() le degrade en console.warn) mais un 404
  // HTTP est aussi journalise par le navigateur lui-meme comme erreur
  // console, independamment du code applicatif : un faux rouge du seul fait
  // du mock, pas du defaut teste.

  // '*' final : sans '/', ne capture donc pas /api/tasks/planned (glob
  // Playwright -- '**' traverse les '/', un '*' simple non).
  await page.route('**/api/tasks*', (route) => {
    etat.appelsTasks++;
    route.fulfill({ json: { success: true, tasks: [] } });
  });

  await page.route('**/api/graphe*', (route) => {
    etat.appelsGraphe++;
    route.fulfill({ json: { projet: 'ProjetTest', noeuds: [], aretes: [] } });
  });

  await page.route('**/api/task/add', (route) => {
    const corps = route.request().postDataJSON();
    etat.appelsAdd.push(corps);
    route.fulfill({
      json: {
        success: true,
        message: 'Task created successfully',
        task: Object.assign(
          { id: 99, uuid: 'nouvelle-tache-0001', urgency: 1, tags: [], project: null },
          corps,
        ),
      },
    });
  });

  return etat;
}

// Selecteur robuste : task-editor.js pose toujours la classe
// 'modal task-editor-modal' sur la modale, quel que soit son id
// (task-editor.js: `modal.className = 'modal task-editor-modal'`), et
// TaskEditor.show() bascule `style.display = 'block'` (le CSS par defaut est
// `display: none`, task-editor-styles.css). Une modale invisible d'une autre
// page (ex. l'editeur d'edition-de-noeud de graphe.js, jamais montre tant
// qu'aucun noeud n'est clique) ne doit donc pas compter ici.
function modalesVisibles(page) {
  return page.locator('.task-editor-modal:visible');
}

function messagesConsoleErreur(page, sink) {
  page.on('console', (msg) => { if (msg.type() === 'error') sink.push(msg.text()); });
  page.on('pageerror', (err) => sink.push('[pageerror] ' + err.message));
}

// TaskEditor.createModal() charge son template par fetch (task-editor.js:80-98)
// et show() se degrade silencieusement en no-op si ce fetch n'est pas encore
// resolu (this.template est alors null) -- un simple `goto` suivi d'un clic
// immediat est donc course-dependant, independamment du defaut teste ici.
// Attendre `networkidle` laisse le temps aux fetch de demarrage (templates,
// contexts, projects, config, tasks...) de se terminer avant le premier clic.
async function ouvrirPage(page, chemin) {
  await page.goto(chemin);
  await page.waitForLoadState('networkidle');
}

for (const p of PAGES) {
  test.describe(`Add task (nav) sur ${p.nom}`, () => {
    test(`${p.nom} : une seule modale d'edition s'ouvre`, async ({ page }) => {
      const erreurs = [];
      messagesConsoleErreur(page, erreurs);
      await installerMocks(page);

      await ouvrirPage(page, p.path);
      await page.locator('#tw-add-area').click();

      // Exactement une modale visible : ni zero (bouton mort -- le defaut
      // constate aujourd'hui sur les 4 pages hors liste), ni deux (editeur
      // de nav ET editeur propre ouverts a la fois).
      await expect(modalesVisibles(page)).toHaveCount(1, { timeout: 3000 });

      expect(erreurs, 'aucune erreur console pendant l\'ouverture').toEqual([]);
    });

    test(`${p.nom} : remplir et enregistrer envoie la creation avec la description saisie`, async ({ page }) => {
      const etat = await installerMocks(page);

      await ouvrirPage(page, p.path);
      await page.locator('#tw-add-area').click();

      const modale = modalesVisibles(page);
      await expect(modale).toHaveCount(1, { timeout: 3000 });

      await modale.locator('#task-editor-description').fill(DESCRIPTION_TEST);
      await modale.locator('#task-editor-save').click();

      await expect.poll(() => etat.appelsAdd.length, {
        message: 'aucune requete de creation partie apres Enregistrer',
        timeout: 3000,
      }).toBeGreaterThan(0);

      expect(etat.appelsAdd[0].description).toBe(DESCRIPTION_TEST);
    });

    if (p.editeurPropre) {
      test(`${p.nom} : c'est bien l'editeur existant de la page qui s'ouvre, pas celui de la nav`, async ({ page }) => {
        await installerMocks(page);

        await ouvrirPage(page, p.path);
        await page.locator('#tw-add-area').click();

        const modale = modalesVisibles(page);
        await expect(modale).toHaveCount(1, { timeout: 3000 });
        await expect(modale).toHaveAttribute('id', p.modalIdPropre);
      });
    }
  });
}

// ── graphe : rappel de GET /api/graphe apres enregistrement ─────────────────
//
// actualiser() (graphe.js) ne rappelle /api/graphe que si un projet est
// selectionne (projetCourant(), lu depuis window.twNav.getState().project) --
// sinon elle vide le svg et affiche un message, sans requete. On seme donc un
// projet dans l'etat de nav AVANT le chargement de la page (localStorage,
// cle 'tw-nav-state', lue par nav.js dans defaultState()/getState()), ce qui
// declenche un premier appel au chargement -- puis on verifie qu'un second
// appel suit l'ajout de tache, distinct de tout appel du a 'tw-filter-change'
// (la spec exige explicitement un ecouteur sur 'tw-task-added').
test.describe('Add task (nav) sur graphe : rafraichissement', () => {
  test('apres enregistrement, GET /api/graphe est rappele', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tw-nav-state', JSON.stringify({
        statuses: ['pending'], filter: '', context: '', priority: '',
        project: 'ProjetTest', tags: '',
      }));
    });
    const etat = await installerMocks(page);

    await ouvrirPage(page, '/graphe.html');

    // Chargement initial : un appel du au projet deja selectionne.
    await expect.poll(() => etat.appelsGraphe, { timeout: 3000 }).toBeGreaterThan(0);
    const appelsAvant = etat.appelsGraphe;

    await page.locator('#tw-add-area').click();
    const modale = modalesVisibles(page);
    await expect(modale).toHaveCount(1, { timeout: 3000 });
    await modale.locator('#task-editor-description').fill(DESCRIPTION_TEST);
    await modale.locator('#task-editor-save').click();

    await expect.poll(() => etat.appelsGraphe, {
      message: 'GET /api/graphe pas rappele apres l\'ajout de tache',
      timeout: 3000,
    }).toBeGreaterThan(appelsAvant);
  });
});

// ── kanban : rechargement des taches apres enregistrement ───────────────────
test.describe('Add task (nav) sur kanban : rechargement', () => {
  test('apres enregistrement, les taches du kanban sont rechargees', async ({ page }) => {
    const etat = await installerMocks(page);

    await ouvrirPage(page, '/kanban.html');

    // Chargement initial : loadTasks() est appele une fois (kanban.html:328).
    await expect.poll(() => etat.appelsTasks, { timeout: 3000 }).toBeGreaterThan(0);
    const appelsAvant = etat.appelsTasks;

    await page.locator('#tw-add-area').click();
    const modale = modalesVisibles(page);
    await expect(modale).toHaveCount(1, { timeout: 3000 });
    await modale.locator('#task-editor-description').fill(DESCRIPTION_TEST);
    await modale.locator('#task-editor-save').click();

    await expect.poll(() => etat.appelsTasks, {
      message: 'GET /api/tasks pas rappele apres l\'ajout de tache',
      timeout: 3000,
    }).toBeGreaterThan(appelsAvant);
  });
});

// ── aucune erreur console, sur l'ensemble du parcours ────────────────────────
//
// Test distinct des precedents : il doit rester significatif meme quand
// l'ouverture de la modale echoue (bouton mort) -- verifier alors qu'echouer
// silencieusement ne laisse au moins aucune trace d'erreur, avant comme
// apres l'implementation.
for (const p of PAGES) {
  test(`${p.nom} : aucune erreur console pendant clic + saisie + enregistrement`, async ({ page }) => {
    const erreurs = [];
    messagesConsoleErreur(page, erreurs);
    await installerMocks(page);

    await ouvrirPage(page, p.path);
    await page.locator('#tw-add-area').click();
    await page.waitForTimeout(300);

    const modale = modalesVisibles(page);
    if (await modale.count() === 1) {
      await modale.locator('#task-editor-description').fill(DESCRIPTION_TEST);
      await modale.locator('#task-editor-save').click();
      await page.waitForTimeout(300);
    }

    expect(erreurs).toEqual([]);
  });
}
