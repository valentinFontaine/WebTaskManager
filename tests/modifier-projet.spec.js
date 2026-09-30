// @ts-check
/**
 * Bug rapporte : depuis la page principale, ouvrir la modale d'edition d'une
 * tache, ne changer que le projet, cliquer « Save changes » -> message
 * « Failed to update task ».
 *
 * Parcours reel, sans mock : cree une tache par l'API, l'edite par l'UI,
 * relit la tache par l'API. Ecrit dans la base pointee par TASKRC (jetable).
 */
const { test, expect } = require('@playwright/test');

test.describe('Edition du projet depuis la page principale', () => {
  test.describe.configure({ mode: 'serial' });

  test('changer uniquement le projet enregistre le nouveau projet', async ({ page, request }) => {
    const description = `Projet a changer ${Date.now()}`;
    const nouveauProjet = 'TestProjet.Change';

    const ajout = await request.post('/api/task/add', {
      data: { description, project: 'TestProjet.Origine', tags: ['test'] },
    });
    expect((await ajout.json()).success).toBe(true);

    // Compteur : prouve que le PUT est bien emis par le parcours teste.
    let nbPut = 0;
    let reponsePut = null;
    page.on('response', async (r) => {
      if (r.request().method() === 'PUT' && r.url().includes('/modify')) {
        nbPut++;
        reponsePut = { status: r.status(), corps: await r.text() };
      }
    });

    await page.goto('/');
    const carte = page.locator('.task-card', { hasText: description });
    await expect(carte).toBeVisible({ timeout: 10000 });
    await carte.locator('.dropdown-expand').click();
    await carte.locator('.task-edit').click();

    await expect(page.locator('#task-editor-project')).toHaveValue('TestProjet.Origine');
    await page.fill('#task-editor-project', nouveauProjet);
    await page.click('#task-editor-save');

    await expect.poll(() => nbPut, { timeout: 10000 }).toBeGreaterThan(0);
    console.log('PUT /modify ->', JSON.stringify(reponsePut));

    // Ce que voit l'utilisateur : pas de notification d'erreur, projet a jour.
    await expect(page.locator('.notification.error, .notification-error, [class*="error"]:visible'))
      .toHaveCount(0);
    await expect(page.locator('#task-editor-project')).toBeHidden();

    // Et dans la base.
    const liste = await (await request.get('/api/tasks')).json();
    const tache = liste.tasks.find((t) => t.description === description);
    expect(tache.project).toBe(nouveauProjet);
  });
});
