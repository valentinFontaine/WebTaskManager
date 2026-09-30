// @ts-check
/**
 * Edition de CHAQUE champ de la modale, depuis la page principale, sans mock.
 *
 * Pour chaque champ : creer une tache par l'API, l'editer par l'UI (un seul
 * champ modifie), verifier ce que voit l'utilisateur (notification de succes,
 * pas d'erreur, modale fermee), puis relire la base par l'API.
 *
 * Ecrit dans la base pointee par TASKRC (jetable) : ne pas lancer autrement.
 * Descriptions volontairement ASCII : le non-ASCII est un defaut connu a part.
 */
const { test, expect } = require('@playwright/test');

test.describe('Edition de chaque champ depuis la page principale', () => {
  // Pas de mode serial : chaque test cree sa propre tache et est independant ;
  // un echec ne doit pas faire sauter les suivants. Le fichier reste dans un
  // seul worker (fullyParallel: false), donc pas de course sur la base.

  /** Cree une tache par l'API et la renvoie telle que la relit /api/tasks. */
  async function creer(request, description, extra = {}) {
    const ajout = await request.post('/api/task/add', {
      data: { description, project: 'TestChamps.Origine', tags: ['tstchamps'], ...extra },
    });
    expect((await ajout.json()).success).toBe(true);
    return relire(request, description);
  }

  async function relire(request, description) {
    const liste = await (await request.get('/api/tasks')).json();
    return liste.tasks.find((t) => t.description === description);
  }

  /** Ouvre la modale d'edition de la tache, apres chargement de la page. */
  async function ouvrirEditeur(page, description) {
    await page.goto('/');
    const carte = page.locator('.task-card', { hasText: description });
    await expect(carte).toBeVisible({ timeout: 10000 });
    await carte.locator('.dropdown-expand').click();
    await carte.locator('.task-edit').click();
    await expect(page.locator('#task-editor-description')).toHaveValue(description);
  }

  /**
   * Enregistre et attend la reponse du PUT. Compte les PUT : un test dont le
   * chemin ne declenche plus le PUT passerait sinon au vert en silence.
   */
  async function enregistrer(page) {
    const [reponse] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/modify')),
      page.click('#task-editor-save'),
    ]);
    const corps = await reponse.json();
    expect(corps.success, `PUT /modify a echoue : ${JSON.stringify(corps)}`).toBe(true);

    // Ce que voit l'utilisateur : succes affiche, aucune erreur, modale fermee.
    const notification = page.locator('#notification');
    await expect(notification).toHaveClass(/success/);
    await expect(notification).not.toHaveClass(/error/);
    await expect(page.locator('#task-editor-description')).toBeHidden();
    return corps;
  }

  test('description', async ({ page, request }) => {
    const avant = `Champ description ${Date.now()}`;
    const apres = `${avant} modifiee`;
    await creer(request, avant);
    await ouvrirEditeur(page, avant);
    await page.fill('#task-editor-description', apres);
    await enregistrer(page);
    expect((await relire(request, apres)).description).toBe(apres);
  });

  test('priorite', async ({ page, request }) => {
    const d = `Champ priorite ${Date.now()}`;
    await creer(request, d);
    await ouvrirEditeur(page, d);
    await page.selectOption('#task-editor-priority', 'H');
    await enregistrer(page);
    expect((await relire(request, d)).priority).toBe('H');
  });

  test('priorite : retour a aucune', async ({ page, request }) => {
    const d = `Champ priorite vide ${Date.now()}`;
    await creer(request, d, { priority: 'M' });
    await ouvrirEditeur(page, d);
    await page.selectOption('#task-editor-priority', '');
    await enregistrer(page);
    expect((await relire(request, d)).priority).toBeUndefined();
  });

  test('duree', async ({ page, request }) => {
    const d = `Champ duree ${Date.now()}`;
    await creer(request, d);
    await ouvrirEditeur(page, d);
    await page.fill('#task-editor-duration', '90min');
    await enregistrer(page);
    expect((await relire(request, d)).estTime).toBe('PT1H30M');
  });

  test('tags', async ({ page, request }) => {
    const d = `Champ tags ${Date.now()}`;
    await creer(request, d);
    await ouvrirEditeur(page, d);
    await page.fill('#task-editor-tags', 'tstchamps, nouveau');
    await enregistrer(page);
    expect((await relire(request, d)).tags.sort()).toEqual(['nouveau', 'tstchamps']);
  });

  test('projet', async ({ page, request }) => {
    const d = `Champ projet ${Date.now()}`;
    await creer(request, d);
    await ouvrirEditeur(page, d);
    await page.fill('#task-editor-project', 'TestChamps.Change');
    await enregistrer(page);
    expect((await relire(request, d)).project).toBe('TestChamps.Change');
  });

  test('projet : effacement', async ({ page, request }) => {
    const d = `Champ projet vide ${Date.now()}`;
    await creer(request, d);
    await ouvrirEditeur(page, d);
    await page.fill('#task-editor-project', '');
    await enregistrer(page);
    expect((await relire(request, d)).project).toBeUndefined();
  });

  test('echeance', async ({ page, request }) => {
    const d = `Champ echeance ${Date.now()}`;
    await creer(request, d);
    await ouvrirEditeur(page, d);
    await page.fill('#task-editor-due', '2030-05-06T09:30');
    await enregistrer(page);
    const t = await relire(request, d);
    expect(t.due).toBeTruthy();
    // Le champ est saisi en heure locale du navigateur : on compare a l'instant local.
    const attendu = new Date('2030-05-06T09:30').toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    expect(t.due).toBe(attendu);
  });

  test('planification', async ({ page, request }) => {
    const d = `Champ planif ${Date.now()}`;
    await creer(request, d);
    await ouvrirEditeur(page, d);
    await page.fill('#task-editor-scheduled', '2030-05-07T14:00');
    await enregistrer(page);
    const t = await relire(request, d);
    const attendu = new Date('2030-05-07T14:00').toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    expect(t.scheduled).toBe(attendu);
  });

  test('echeance : effacement', async ({ page, request }) => {
    const d = `Champ echeance vide ${Date.now()}`;
    await creer(request, d, { due: '2030-05-06T09:30:00' });
    await ouvrirEditeur(page, d);
    await page.fill('#task-editor-due', '');
    await enregistrer(page);
    expect((await relire(request, d)).due).toBeUndefined();
  });

  test('tous les champs a la fois', async ({ page, request }) => {
    const avant = `Champ tous ${Date.now()}`;
    const apres = `${avant} complet`;
    await creer(request, avant);
    await ouvrirEditeur(page, avant);
    await page.fill('#task-editor-description', apres);
    await page.selectOption('#task-editor-priority', 'L');
    await page.fill('#task-editor-duration', '2h');
    await page.fill('#task-editor-tags', 'tstchamps, tous');
    await page.fill('#task-editor-project', 'TestChamps.Tous');
    await page.fill('#task-editor-due', '2030-06-01T10:00');
    await page.fill('#task-editor-scheduled', '2030-05-30T08:00');
    await enregistrer(page);
    const t = await relire(request, apres);
    expect(t.priority).toBe('L');
    expect(t.estTime).toBe('PT2H');
    expect(t.tags.sort()).toEqual(['tous', 'tstchamps']);
    expect(t.project).toBe('TestChamps.Tous');
    expect(t.due).toBeTruthy();
    expect(t.scheduled).toBeTruthy();
  });
});
