// @ts-check
/**
 * Contrat de test pour A (decision de l'utilisateur/architecte, voir le
 * brief de cette tache) : TaskEditor.showForCreate(valeurs).
 *
 * Etat au moment ou ce fichier est ecrit : showForCreate n'existe pas sur
 * TaskEditor (task-editor.js n'expose que show(task) et showForTask(task),
 * cf. task-editor.js:270-309). Ces tests doivent donc etre ROUGES pour la
 * bonne raison : "showForCreate is not a function" (TypeError), pas un
 * probleme de selecteur ou de reseau.
 *
 * Spec (A) :
 *   showForCreate(valeurs) ouvre en mode CREATION :
 *     - titre "Ajouter une tache" (texte reel : "Ajouter une tâche", cf.
 *       getTexts().addTask, task-editor.js:175)
 *     - currentTask est null (donc handleSave() suit la branche creation :
 *       POST, pas PUT -- cf. task-editor.js:389-396)
 *     - les champs sont pre-remplis depuis `valeurs` : au moins project,
 *       et description/tags si fournis dans l'appel.
 *   show(task) et show() gardent leur comportement actuel (temoins).
 *
 * Isolation : ce fichier charge task-editor.js seul, via une fixture dediee
 * (test_editor_fixture.html, a la racine du depot) qui ne charge ni nav.js
 * ni graphe.js ni main.js -- aucune autre instance de TaskEditor ne peut
 * donc interferer. La fixture est servie par le catch-all statique de
 * main_fastapi.py, comme test_taskcard_autonomy.html (meme racine : voir
 * le commentaire de la fixture pour pourquoi un sous-dossier casserait le
 * fetch relatif de task-editor-templates.html).
 *
 * Pas de TASKRC necessaire ici : aucune commande Taskwarrior n'est appelee,
 * /api/task/add et /api/task/*\/modify sont entierement mockes (page.route).
 */
const { test, expect } = require('@playwright/test');

const FIXTURE = '/test_editor_fixture.html';
const MODAL_ID = 'fixture-task-editor';

/** Cree une instance TaskEditor dans la page et attend qu'elle soit prete
 * (modal + template charges -- meme garde que attendreModalePrete dans nav.js). */
async function creerEditeur(page) {
  await page.evaluate((modalId) => {
    // `class TaskEditor {}` en script classique cree un binding lexical
    // global mais PAS une propriete de `window` (meme constat que le
    // commentaire de nav.js sur editeurGenerique) : on reference
    // l'identifiant nu, pas window.TaskEditor.
    // eslint-disable-next-line no-undef
    window.__editor = new TaskEditor({
      showAllFields: true,
      priorityFormat: 'letters',
      language: 'fr',
      modalId,
    });
  }, MODAL_ID);

  await expect.poll(() => page.evaluate(
    () => !!(window.__editor && window.__editor.modal && window.__editor.template)
  )).toBe(true);
}

function modale(page) {
  return page.locator('#' + MODAL_ID);
}

/** Installe les mocks reseau et retourne les listes de requetes capturees. */
async function installerMocks(page) {
  const requetesAdd = [];
  const requetesModify = [];
  await page.route('**/api/task/add', (route) => {
    const corps = route.request().postDataJSON();
    requetesAdd.push(corps);
    route.fulfill({ json: { success: true, task: { uuid: 'nouvelle-0001', ...corps } } });
  });
  await page.route('**/api/task/*/modify', (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const uuidCible = segments[segments.length - 2];
    requetesModify.push({ uuid: uuidCible, corps: route.request().postDataJSON() });
    route.fulfill({ json: { success: true, task: { uuid: uuidCible } } });
  });
  return { requetesAdd, requetesModify };
}

test.describe('TaskEditor.showForCreate (contrat A)', () => {

  test('ouvre en mode CREATION avec project pre-rempli, titre "Ajouter une tache"', async ({ page }) => {
    const { requetesAdd, requetesModify } = await installerMocks(page);

    await page.goto(FIXTURE);
    await creerEditeur(page);

    await page.evaluate(() => window.__editor.showForCreate({ project: 'NPD.Orion' }));

    await expect(modale(page).locator('#task-editor-title')).toHaveText('Ajouter une tâche');
    await expect(modale(page).locator('#task-editor-project')).toHaveValue('NPD.Orion');

    // currentTask doit etre null : c'est ce qui fait suivre la branche
    // creation dans handleSave()/saveTask().
    const currentTaskEstNull = await page.evaluate(() => window.__editor.currentTask === null);
    expect(currentTaskEstNull).toBe(true);

    await modale(page).locator('#task-editor-description').fill('Nouvelle tache via showForCreate');
    await modale(page).locator('#task-editor-save').click();

    await expect.poll(() => requetesAdd.length).toBeGreaterThan(0);
    expect(requetesAdd[0].project).toBe('NPD.Orion');
    expect(requetesModify.length).toBe(0); // aucun PUT : c'est une creation
  });

  test('pre-remplit aussi description et tags quand ils sont fournis', async ({ page }) => {
    await installerMocks(page);
    await page.goto(FIXTURE);
    await creerEditeur(page);

    await page.evaluate(() => window.__editor.showForCreate({
      project: 'NPD.Orion.plans',
      description: 'Description pre-remplie',
      tags: ['pro', 'urgent'],
    }));

    await expect(modale(page).locator('#task-editor-description')).toHaveValue('Description pre-remplie');
    await expect(modale(page).locator('#task-editor-tags')).toHaveValue('pro, urgent');
    await expect(modale(page).locator('#task-editor-project')).toHaveValue('NPD.Orion.plans');
  });

  test('project absent des valeurs : champ projet vide', async ({ page }) => {
    await installerMocks(page);
    await page.goto(FIXTURE);
    await creerEditeur(page);

    await page.evaluate(() => window.__editor.showForCreate({}));

    await expect(modale(page).locator('#task-editor-project')).toHaveValue('');
    await expect(modale(page).locator('#task-editor-title')).toHaveText('Ajouter une tâche');
  });

  // Trou G1 : showForCreate doit lui-meme remettre currentTask a null. Note :
  // hide() le remet deja a null (task-editor.js:354), donc apres une fermeture
  // propre la mutation "showForCreate ne remet pas currentTask a null" est
  // masquee. Le test sans fermeture (modale d'edition laissee ouverte, puis
  // showForCreate sur la MEME instance) est celui qui la rend visible.
  for (const [nom, fermer] of [
    ['apres fermeture par hide()', true],
    ['sans fermeture prealable', false],
  ]) {
    test(`meme instance : show(existante) puis showForCreate -> POST, aucun PUT (${nom})`, async ({ page }) => {
      const { requetesAdd, requetesModify } = await installerMocks(page);
      await page.goto(FIXTURE);
      await creerEditeur(page);

      await page.evaluate(() => window.__editor.show({
        uuid: 'precedente-0001', description: 'Tache precedente', project: 'Ancien',
      }));
      await expect(modale(page).locator('#task-editor-title')).toHaveText('Modifier la tâche');
      if (fermer) await page.evaluate(() => window.__editor.hide());

      await page.evaluate(() => window.__editor.showForCreate({ project: 'X' }));
      await expect(modale(page).locator('#task-editor-title')).toHaveText('Ajouter une tâche');
      await modale(page).locator('#task-editor-description').fill('Creation apres edition');
      await modale(page).locator('#task-editor-save').click();

      await expect.poll(() => requetesAdd.length).toBeGreaterThan(0);
      expect(requetesAdd[0].project).toBe('X');
      expect(requetesModify.length).toBe(0);
      expect(requetesModify.some((r) => r.uuid === 'precedente-0001')).toBe(false);
    });
  }

  test('temoin : show(task) garde son comportement (mode EDITION, PUT)', async ({ page }) => {
    const { requetesAdd, requetesModify } = await installerMocks(page);
    await page.goto(FIXTURE);
    await creerEditeur(page);

    await page.evaluate(() => window.__editor.show({
      uuid: 'existante-0001', description: 'Deja existante', project: 'NPD.Orion',
    }));

    await expect(modale(page).locator('#task-editor-title')).toHaveText('Modifier la tâche');
    await modale(page).locator('#task-editor-save').click();

    await expect.poll(() => requetesModify.length).toBeGreaterThan(0);
    expect(requetesModify[0].uuid).toBe('existante-0001');
    expect(requetesAdd.length).toBe(0);
  });

  test('temoin : show() sans argument garde son comportement (mode CREATION, champs vides)', async ({ page }) => {
    await installerMocks(page);
    await page.goto(FIXTURE);
    await creerEditeur(page);

    // Pre-remplir un champ a la main (sans passer par showForCreate, pour ne
    // pas dependre de la fonctionnalite testee ailleurs dans ce fichier) puis
    // prouver que show() sans argument l'efface bien (clearForm). Fait par
    // evaluate() et non par fill() : le modal est encore display:none avant
    // le premier show(), donc pas actionnable pour Playwright.
    await page.evaluate((modalId) => {
      document.querySelector('#' + modalId + ' #task-editor-project').value = 'Valeur qui doit disparaitre';
    }, MODAL_ID);

    await page.evaluate(() => window.__editor.show());

    await expect(modale(page).locator('#task-editor-title')).toHaveText('Ajouter une tâche');
    await expect(modale(page).locator('#task-editor-project')).toHaveValue('');
  });
});
