// @ts-check
/**
 * Champs `due` / `scheduled` de l'editeur au format europeen (2026-10-12) :
 * jj/mm/aaaa hh:mm, horloge sur 24 h.
 *
 * Un `<input type="datetime-local">` s'affiche dans le format de la locale du
 * navigateur (mm/dd/yyyy hh:mm AM/PM sur un Chrome en anglais) et la page ne
 * peut pas l'imposer : les champs sont donc des champs texte que l'editeur
 * formate et lit lui-meme.
 *
 * Fuseau fixe a Europe/Paris et locale anglaise volontaire : c'est la
 * configuration qui affichait l'AM/PM.
 * Aucune commande Taskwarrior : toute l'API est simulee (page.route).
 */
const { test, expect } = require('@playwright/test');

test.use({ timezoneId: 'Europe/Paris', locale: 'en-US' });

const MODAL_ID = 'fixture-task-editor';
const UUID = 'aaaaaaaa-0000-0000-0000-000000000002';

/** Monte l'editeur sur la page de fixture et ouvre la tache donnee. */
async function ouvrir(page, tache) {
  const requetes = [];
  await page.route('**/api/task/*/modify', (route) => {
    requetes.push(route.request().postDataJSON());
    route.fulfill({ json: { success: true, task: { uuid: UUID } } });
  });
  await page.goto('/test_editor_fixture.html');
  await page.evaluate((modalId) => {
    // eslint-disable-next-line no-undef
    window.__editor = new TaskEditor({
      showAllFields: true, priorityFormat: 'letters', language: 'fr', modalId,
    });
  }, MODAL_ID);
  await expect.poll(() => page.evaluate(
    () => !!(window.__editor && window.__editor.modal && window.__editor.template)
  )).toBe(true);
  await page.evaluate((t) => window.__editor.show(t), { uuid: UUID, id: 1, status: 'pending', ...tache });
  return { modale: page.locator('#' + MODAL_ID), requetes };
}

test.describe('Editeur : dates au format europeen', () => {
  test('affiche jj/mm/aaaa hh:mm sur 24 h', async ({ page }) => {
    // 16:45Z = 18:45 a Paris en octobre (CEST), 06:05Z = 07:05 en decembre (CET).
    const { modale } = await ouvrir(page, {
      description: 'Tache datee', scheduled: '20261012T164500Z', due: '20261205T060500Z',
    });
    await expect(modale.locator('#task-editor-scheduled')).toHaveValue('12/10/2026 18:45');
    await expect(modale.locator('#task-editor-due')).toHaveValue('05/12/2026 07:05');
    await expect(modale.locator('#task-editor-due')).toHaveAttribute('placeholder', 'jj/mm/aaaa hh:mm');
  });

  test('une saisie europeenne est envoyee en UTC', async ({ page }) => {
    const { modale, requetes } = await ouvrir(page, { description: 'Saisie' });
    await modale.locator('#task-editor-scheduled').fill('03/11/2026 18:30');
    await modale.locator('#task-editor-due').fill('3/1/2027');   // sans heure : minuit
    await modale.locator('#task-editor-save').click();
    await expect.poll(() => requetes.length).toBeGreaterThan(0);

    // Le jour vient en premier : 03/11 est le 3 novembre, pas le 11 mars.
    expect(requetes[0].scheduled).toBe('20261103T173000Z');
    expect(requetes[0].due).toBe('20270102T230000Z');
  });

  test('une saisie illisible n\'est pas envoyee et le champ le signale', async ({ page }) => {
    const { modale, requetes } = await ouvrir(page, { description: 'Invalide' });
    await modale.locator('#task-editor-due').fill('31/02/2026 10:00');
    await modale.locator('#task-editor-save').click();

    const message = await modale.locator('#task-editor-due')
      .evaluate((el) => /** @type {HTMLInputElement} */ (el).validationMessage);
    expect(message).toContain('jj/mm/aaaa');
    await expect(modale.locator('#task-editor-due')).toBeVisible();   // modale restee ouverte
    await page.waitForTimeout(300);
    expect(requetes.length).toBe(0);
  });

  test('vider les deux champs envoie un effacement', async ({ page }) => {
    const { modale, requetes } = await ouvrir(page, {
      description: 'A effacer', scheduled: '20261012T080000Z', due: '20261215T090000Z',
    });
    await modale.locator('#task-editor-scheduled').fill('');
    await modale.locator('#task-editor-due').fill('');
    await modale.locator('#task-editor-save').click();
    await expect.poll(() => requetes.length).toBeGreaterThan(0);

    expect(requetes[0].scheduled).toBe('');
    expect(requetes[0].due).toBe('');
  });
});
