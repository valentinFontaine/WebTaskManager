// @ts-check
/**
 * Contrat : saisie des tags en puces dans TaskEditor, avec suggestions.
 *
 * Decision de l'utilisateur (2026-10-06) :
 *   - la liste proposee vient de docs/tags.md seul, servie par GET /api/tags ;
 *   - chaque tag est une puce supprimable ; on tape, une liste filtree apparait ;
 *   - un tag absent de la liste reste permis, mais sa puce est signalee
 *     (classe `tag-puce--non-valide`).
 *
 * Structure attendue dans la modale :
 *   - `.tag-puce[data-tag="<nom>"]`, avec un bouton `.tag-puce-retirer` ;
 *   - `#task-editor-tags` reste le champ ou l'on tape (le texte en cours) ;
 *   - `.tag-suggestions .tag-suggestion` : les suggestions affichees.
 *
 * Saisie : Entree ou virgule transforme le texte en puce (Entree ne soumet
 * pas le formulaire tant que du texte est en cours) ; Retour arriere dans un
 * champ vide retire la derniere puce ; a l'enregistrement, le texte encore en
 * cours (« a, b ») est ajoute aux puces.
 *
 * Fixture isolee (test_editor_fixture.html) et reseau entierement stubbe :
 * aucune commande Taskwarrior.
 */
const { test, expect } = require('@playwright/test');

const FIXTURE = '/test_editor_fixture.html';
const MODAL_ID = 'fixture-task-editor';
const TAGS_VALIDES = ['cao', 'coding', 'phone', 'sport'];

async function preparer(page) {
  const appels = { tags: 0, add: [], modify: [] };
  await page.route('**/api/tags', (route) => {
    appels.tags++;
    route.fulfill({ json: { success: true, tags: TAGS_VALIDES } });
  });
  await page.route('**/api/task/add', (route) => {
    const corps = route.request().postDataJSON();
    appels.add.push(corps);
    route.fulfill({ json: { success: true, task: { uuid: 'nouvelle-0001', ...corps } } });
  });
  await page.route('**/api/task/*/modify', (route) => {
    appels.modify.push(route.request().postDataJSON());
    route.fulfill({ json: { success: true, task: {} } });
  });

  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e));

  await page.goto(FIXTURE);
  await page.evaluate((modalId) => {
    // eslint-disable-next-line no-undef
    window.__editor = new TaskEditor({ showAllFields: true, priorityFormat: 'letters', language: 'fr', modalId });
  }, MODAL_ID);
  await expect.poll(() => page.evaluate(
    () => !!(window.__editor && window.__editor.modal && window.__editor.template)
  )).toBe(true);
  // La liste doit avoir ete demandee au backend : sinon les tests de
  // validite passeraient pour une mauvaise raison.
  await expect.poll(() => appels.tags).toBeGreaterThan(0);
  return { appels, erreurs };
}

const modale = (page) => page.locator('#' + MODAL_ID);
const puce = (page, tag) => modale(page).locator(`.tag-puce[data-tag="${tag}"]`);
const champ = (page) => modale(page).locator('#task-editor-tags');

async function nomsDesPuces(page) {
  return modale(page).locator('.tag-puce').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-tag')));
}

test.describe('TaskEditor : tags en puces', () => {

  test('les suggestions filtrent la liste de docs/tags.md ; un clic ajoute une puce validee', async ({ page }) => {
    const { erreurs } = await preparer(page);
    await page.evaluate(() => window.__editor.showForCreate({}));

    await champ(page).pressSequentially('co');
    const suggestions = modale(page).locator('.tag-suggestions .tag-suggestion');
    await expect(suggestions).toHaveText(['coding']);

    await champ(page).fill('');
    await champ(page).pressSequentially('c');
    await expect(suggestions).toHaveText(['cao', 'coding']);

    await suggestions.filter({ hasText: 'coding' }).click();
    await expect(puce(page, 'coding')).toBeVisible();
    await expect(puce(page, 'coding')).not.toHaveClass(/tag-puce--non-valide/);
    await expect(champ(page)).toHaveValue('');
    // Un tag deja choisi n'est plus propose.
    await champ(page).pressSequentially('c');
    await expect(suggestions).toHaveText(['cao']);

    expect(erreurs).toEqual([]);
  });

  test('un tag inconnu est accepte mais signale ; Entree ne soumet pas', async ({ page }) => {
    const { appels } = await preparer(page);
    await page.evaluate(() => window.__editor.showForCreate({ description: 'Tache tags' }));

    await champ(page).pressSequentially('bidule');
    await champ(page).press('Enter');

    await expect(puce(page, 'bidule')).toBeVisible();
    await expect(puce(page, 'bidule')).toHaveClass(/tag-puce--non-valide/);
    await expect(champ(page)).toHaveValue('');
    expect(appels.add.length).toBe(0);

    // La virgule valide aussi, et le « + » tape par habitude est retire.
    await champ(page).pressSequentially('+phone,');
    await expect(puce(page, 'phone')).toBeVisible();
    await expect(puce(page, 'phone')).not.toHaveClass(/tag-puce--non-valide/);

    await modale(page).locator('#task-editor-save').click();
    await expect.poll(() => appels.add.length).toBe(1);
    expect(appels.add[0].tags).toEqual(['bidule', 'phone']);
  });

  test('edition : puces pre-remplies, retrait d\'une puce, enregistrement', async ({ page }) => {
    const { appels } = await preparer(page);
    await page.evaluate(() => window.__editor.showForTask({
      id: 1, uuid: 'u-0001', description: 'Existante', tags: ['cao', 'inconnu'],
    }));

    expect(await nomsDesPuces(page)).toEqual(['cao', 'inconnu']);
    await expect(puce(page, 'cao')).not.toHaveClass(/tag-puce--non-valide/);
    await expect(puce(page, 'inconnu')).toHaveClass(/tag-puce--non-valide/);

    await puce(page, 'cao').locator('.tag-puce-retirer').click();
    expect(await nomsDesPuces(page)).toEqual(['inconnu']);

    await modale(page).locator('#task-editor-save').click();
    await expect.poll(() => appels.modify.length).toBe(1);
    expect(appels.modify[0].tags).toEqual(['inconnu']);
  });

  test('Retour arriere dans un champ vide retire la derniere puce ; tout retirer envoie []', async ({ page }) => {
    const { appels } = await preparer(page);
    await page.evaluate(() => window.__editor.showForTask({
      id: 2, uuid: 'u-0002', description: 'Deux tags', tags: ['sport', 'phone'],
    }));

    await champ(page).focus();
    await champ(page).press('Backspace');
    expect(await nomsDesPuces(page)).toEqual(['sport']);
    await champ(page).press('Backspace');
    expect(await nomsDesPuces(page)).toEqual([]);

    await modale(page).locator('#task-editor-save').click();
    await expect.poll(() => appels.modify.length).toBe(1);
    expect(appels.modify[0].tags).toEqual([]);
  });

  test('le texte encore en cours est ajoute aux puces a l\'enregistrement, sans doublon', async ({ page }) => {
    const { appels } = await preparer(page);
    await page.evaluate(() => window.__editor.showForTask({
      id: 3, uuid: 'u-0003', description: 'Texte en cours', tags: ['cao'],
    }));

    await champ(page).fill('cao, nouveau');
    await modale(page).locator('#task-editor-save').click();
    await expect.poll(() => appels.modify.length).toBe(1);
    expect(appels.modify[0].tags).toEqual(['cao', 'nouveau']);
  });

  test('rouvrir l\'editeur sur une autre tache remplace les puces', async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => window.__editor.showForTask({ id: 4, uuid: 'u-4', description: 'A', tags: ['cao'] }));
    expect(await nomsDesPuces(page)).toEqual(['cao']);
    await page.evaluate(() => window.__editor.hide());
    await page.evaluate(() => window.__editor.showForTask({ id: 5, uuid: 'u-5', description: 'B', tags: ['sport'] }));
    expect(await nomsDesPuces(page)).toEqual(['sport']);
    await page.evaluate(() => window.__editor.hide());
    await page.evaluate(() => window.__editor.showForCreate({}));
    expect(await nomsDesPuces(page)).toEqual([]);
  });
});
