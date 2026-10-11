// @ts-check
/**
 * Edit de la petite fenetre de detail du calendrier (TOAST UI) : ouvre
 * l'editeur general (TaskEditor), pas le formulaire de TOAST UI (demande du
 * 2026-10-11). Le formulaire de TOAST UI reste celui de la planification
 * d'une tache selectionnee par glisser sur un creneau.
 *
 * Aucune commande Taskwarrior : toute l'API est simulee (page.route).
 */
const { test, expect } = require('@playwright/test');

test.use({ timezoneId: 'Europe/Paris' });

const UUID = 'aaaaaaaa-0000-0000-0000-000000000001';

/** Tache planifiee aujourd'hui a 10:00 locale : visible en vue semaine. */
function tachePlanifiee() {
  const d = new Date(); d.setHours(10, 0, 0, 0);
  const scheduled = d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
  return { uuid: UUID, id: 1, description: 'Tache du calendrier', status: 'pending',
    project: 'NPD.Orion', scheduled, estTime: 'PT1H' };
}

/** Clic sur un evenement : TOAST UI n'ouvre sa fenetre de detail que sur un
 * appui/relachement explicite (un locator.click() ne l'ouvre pas, mesure). */
async function cliquerEvenement(page, texte) {
  const ev = page.locator('#calendar').getByText(texte).first();
  await ev.waitFor({ state: 'attached', timeout: 15000 });
  await ev.scrollIntoViewIfNeeded();
  const b = await ev.boundingBox();
  await page.mouse.move(b.x + 20, b.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
}

test('Edit ouvre l\'editeur general, pas le formulaire de TOAST UI', async ({ page }) => {
  const t = tachePlanifiee();
  const modifies = [];
  await page.route('**/plan.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, tasks: [t], data: [] } }));
  await page.route('**/api/tasks/planned', (r) => r.fulfill({ json: { success: true, data: [t] } }));
  await page.route('**/api/task/*/modify', (r) => {
    modifies.push({ url: r.request().url(), corps: r.request().postDataJSON() });
    r.fulfill({ json: { success: true, task: t } });
  });

  await page.goto('/calendar-planner.html');
  await cliquerEvenement(page, 'Tache du calendrier');

  const edit = page.locator('.toastui-calendar-detail-container .toastui-calendar-edit-button');
  await expect(edit).toBeVisible();
  await edit.click();

  // La page porte deux #task-editor-modal (nav.js et calendrier) : on vise
  // celle qui s'affiche.
  const editeur = page.locator('#task-editor-modal:visible');
  await expect(editeur).toBeVisible();
  await expect(editeur.locator('#task-editor-description')).toHaveValue('Tache du calendrier');
  await expect(editeur.locator('#task-editor-project')).toHaveValue('NPD.Orion');
  // Ni formulaire TOAST UI, ni fenetre de detail restee ouverte par-dessus.
  await expect(page.locator('.toastui-calendar-form-container')).toHaveCount(0);
  await expect(page.locator('.toastui-calendar-detail-container')).toHaveCount(0);

  await editeur.locator('#task-editor-save').click();
  await expect.poll(() => modifies.length).toBeGreaterThan(0);
  expect(modifies[0].url).toContain(UUID);
  expect(modifies[0].corps.scheduled).toBe(t.scheduled);
});
