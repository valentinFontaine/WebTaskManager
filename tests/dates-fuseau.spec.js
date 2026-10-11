// @ts-check
/**
 * Dates `scheduled` / `due` et fuseau horaire (bug du 2026-10-11).
 *
 * Taskwarrior exporte en UTC (`20261012T080000Z`) et lit une date sans `Z`
 * comme une heure LOCALE (mesure : `scheduled:2026-10-12T08:00:00` est
 * stocke `20261012T060000Z` en heure d'ete de Paris). Deux chemins du
 * frontend :
 *   - l'editeur affichait l'heure UTC dans le champ (10:00 locale -> 08:00)
 *     et la renvoyait sans `Z` : chaque enregistrement reculait la date ;
 * DateFromISOtoTW (glisser-deposer du calendrier) etait suspect ; la mesure
 * l'a disculpe, il reste ici comme temoin.
 *
 * Fuseau fixe a Europe/Paris : en UTC le bug serait invisible.
 * Aucune commande Taskwarrior : toute l'API est simulee (page.route).
 */
const { test, expect } = require('@playwright/test');

test.use({ timezoneId: 'Europe/Paris' });

const MODAL_ID = 'fixture-task-editor';
const UUID = 'aaaaaaaa-0000-0000-0000-000000000001';

test.describe('Editeur : dates en heure locale, aller-retour sans decalage', () => {
  test('affiche 10:00 pour 08:00Z et renvoie le meme instant', async ({ page }) => {
    const requetesModify = [];
    await page.route('**/api/task/*/modify', (route) => {
      requetesModify.push(route.request().postDataJSON());
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

    await page.evaluate((uuid) => window.__editor.show({
      uuid, id: 1, description: 'Tache datee', status: 'pending',
      scheduled: '20261012T080000Z', due: '20261215T090000Z',
    }), UUID);

    const modale = page.locator('#' + MODAL_ID);
    // Ce que voit l'utilisateur : l'heure locale (CEST +2, CET +1).
    await expect(modale.locator('#task-editor-scheduled')).toHaveValue('2026-10-12T10:00');
    await expect(modale.locator('#task-editor-due')).toHaveValue('2026-12-15T10:00');

    await modale.locator('#task-editor-save').click();
    await expect.poll(() => requetesModify.length).toBeGreaterThan(0);

    // Enregistrer sans toucher aux dates ne doit pas les deplacer.
    expect(requetesModify[0].scheduled).toBe('20261012T080000Z');
    expect(requetesModify[0].due).toBe('20261215T090000Z');
  });
});

test.describe('Calendrier et editeur montrent la meme heure', () => {
  test('tache planifiee a 08:00Z : 10:00 dans la grille et dans l\'editeur', async ({ page }) => {
    const tache = {
      uuid: UUID, id: 1, description: 'Tache datee', status: 'pending',
      scheduled: '20261012T080000Z', estTime: 'PT1H',
    };
    await page.route('**/plan.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/api/**', (route) =>
      route.fulfill({ json: { success: true, tasks: [tache], data: [] } }));

    await page.goto('/calendar-planner.html');
    await expect.poll(() => page.evaluate(
      // eslint-disable-next-line no-undef
      () => typeof taskEditor !== 'undefined' && !!taskEditor.template
    )).toBe(true);

    // Heure de la grille : celle de l'evenement construit pour le calendrier.
    const grille = await page.evaluate((t) => {
      // eslint-disable-next-line no-undef
      const e = createCalendarEvent(t, t.scheduled);
      return `${String(e.start.getHours()).padStart(2, '0')}:${String(e.start.getMinutes()).padStart(2, '0')}`;
    }, tache);
    expect(grille).toBe('10:00');

    // eslint-disable-next-line no-undef
    await page.evaluate((t) => taskEditor.showForTask(t), tache);
    await expect(page.locator('#task-editor-scheduled')).toHaveValue(`2026-10-12T${grille}`);
  });
});

test.describe('Calendrier : DateFromISOtoTW garde l\'instant', () => {
  // Temoin : ce chemin est juste. toISOString() porte des millisecondes, ne
  // correspond a aucun motif de DateFromISOtoTW et retombe sur la conversion
  // en heure locale, sans `Z` -- que Taskwarrior lit comme locale.
  test('un deplacement a 10:00 locale ecrit 10:00 locale', async ({ page }) => {
    const vide = (route) => route.fulfill({ json: { success: true, tasks: [], data: [] } });
    await page.route('**/plan.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/api/**', vide);

    await page.goto('/calendar-planner.html');
    await expect.poll(() => page.evaluate(() => typeof DateFromISOtoTW)).toBe('function');

    const ecrit = await page.evaluate(() =>
      // eslint-disable-next-line no-undef
      DateFromISOtoTW(new Date(2026, 9, 12, 10, 0, 0).toISOString()));
    expect(ecrit).toBe('2026-10-12T10:00:00');
  });
});
