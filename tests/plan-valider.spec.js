// @ts-check
/**
 * Nuit 3 -- E4 : le bouton « Valider » ecrit le plan affiche.
 *
 * Decisions (23/09) et defauts declares :
 * - Valider ecrit EXACTEMENT le plan affiche (POST /api/plan/valider, qui lance
 *   `--appliquer` sur plan.json cote serveur) ;
 * - une confirmation est demandee avant d'ecrire, avec le nombre de taches du
 *   plan ; la refuser n'envoie rien ;
 * - le bouton est desactive tant qu'aucun plan n'est affiche, et pendant un
 *   calcul ;
 * - le compte rendu (modifiees / inchangees / ignorees, pour scheduled et pour
 *   due) s'affiche dans #valider-compte-rendu ;
 * - apres un Valider reussi, un calcul est relance (le plan affiche doit
 *   integrer ce qui vient d'etre ecrit, et l'empreinte doit etre reprise) ;
 * - un refus du serveur s'affiche tel quel. Forme REELLE des refus : FastAPI
 *   `HTTPException` -> `{"detail": "..."}` (lecon du 23/09 : un mock en
 *   `{error}` restait vert pendant que le vrai message ne s'affichait jamais).
 *
 * Le premier test couvre l'etape 2 : un plan dont les taches portent un champ
 * `due` en plus se lit et s'affiche normalement (lecture tolerante).
 */
const { test, expect } = require('@playwright/test');

function isoLocal(jours, heure) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(heure, 0, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`;
}

function bloc(indice, jours, h1, h2, extra = {}) {
  return { indice, debut: isoLocal(jours, h1), fin: isoLocal(jours, h2),
    externe: false, agrege: false, opportuniste: false, precision: 'heure', ...extra };
}

/** Plan de trois taches, champ `due` compris (etape 2). */
function planTroisTaches() {
  return {
    version: 1, statut: 'OPTIMAL', retard_total: 0, en_retard: [],
    t0: isoLocal(0, 0), granularite_minutes: 30,
    taches: {
      'eeeeeeee-0000-4000-8000-000000000001': {
        description: 'Engagement valider', projet: 'NPD.x',
        debut: isoLocal(0, 9), fin: isoLocal(1, 11), due: isoLocal(1, 11),
        blocs: [bloc(0, 0, 9, 10), bloc(1, 1, 10, 11)] },
      'eeeeeeee-0000-4000-8000-000000000002': {
        description: 'Suggestion valider', projet: 'NPD.x',
        debut: isoLocal(1, 14), fin: isoLocal(1, 15), due: null,
        blocs: [bloc(0, 1, 14, 15, { opportuniste: true })] },
      'eeeeeeee-0000-4000-8000-000000000003': {
        description: 'Fournisseur valider', projet: 'NPD.x',
        debut: isoLocal(0, 0), fin: isoLocal(5, 0), due: isoLocal(5, 0),
        blocs: [{ indice: 0, debut: isoLocal(0, 0), fin: isoLocal(5, 0), externe: true,
          agrege: false, opportuniste: false, precision: 'heure' }] },
    },
  };
}

/** Reponse de succes : forme exacte de ResponseModel serialise par FastAPI. */
function succesValider() {
  return {
    success: true, message: null, error: null,
    data: {
      scheduled: { modifiees: ['u1', 'u2'], inchangees: ['u3'], ignorees: ['u4'] },
      due: { modifiees: ['u1'], inchangees: [], ignorees: ['u2', 'u3', 'u4'] },
    },
    tasks: null, task: null, projects: null, columns: null, contexts: null,
    filters: null, active: null,
  };
}

async function preparer(page, { plan = planTroisTaches(), valider = null,
                                etats = [{ statut: 'en_cours' }] } = {}) {
  const vus = { calculer: 0, valider: 0, etat: 0, plan: 0 };
  let rangEtat = 0;

  await page.route('**/plan.json', async route => {
    vus.plan++;
    if (!plan) {
      await route.fulfill({ status: 404, contentType: 'application/json',
        body: '{"detail":"File not found"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(plan) });
  });
  await page.route('**/api/plan/calculer', async route => {
    vus.calculer++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { statut: 'en_cours' } }) });
  });
  await page.route('**/api/plan/etat', async route => {
    vus.etat++;
    const etat = etats[Math.min(rangEtat, etats.length - 1)];
    rangEtat++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: etat }) });
  });
  await page.route('**/api/plan/valider', async route => {
    vus.valider++;
    const r = valider || { status: 200, corps: succesValider() };
    await route.fulfill({ status: r.status, contentType: 'application/json',
      body: JSON.stringify(r.corps) });
  });
  await page.route('**/api/tasks**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, tasks: [] }) }));
  await page.route('**/api/contexts', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }) }));
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }) }));
  return vus;
}

async function ouvrir(page) {
  await page.goto('/calendar-planner.html');
  await expect.poll(() => page.locator('.bloc-plan').count(), { timeout: 15000 })
    .toBeGreaterThan(0);
}

test.describe('Etape 2 -- plan.json porte `due`', () => {
  test('un plan dont les taches portent `due` s\'affiche normalement', async ({ page }) => {
    const vus = await preparer(page);
    await page.goto('/calendar-planner.html');
    await expect(page.locator('.bloc--contraint').first()).toBeVisible({ timeout: 15000 });
    expect(vus.plan).toBeGreaterThan(0);
  });
});

test.describe('E4 -- Valider', () => {
  test('sans plan affiche, Valider est desactive', async ({ page }) => {
    const vus = await preparer(page, { plan: null });
    await page.goto('/calendar-planner.html');
    await expect.poll(() => vus.plan, { timeout: 15000 }).toBeGreaterThan(0);
    await expect(page.locator('#valider-plan-btn')).toBeVisible();
    await expect(page.locator('#valider-plan-btn')).toBeDisabled();
  });

  test('avec un plan affiche, Valider est actif', async ({ page }) => {
    await preparer(page);
    await ouvrir(page);
    await expect(page.locator('#valider-plan-btn')).toBeEnabled();
  });

  test('pendant un calcul, Valider est desactive', async ({ page }) => {
    await preparer(page, { etats: [{ statut: 'en_cours' }] });
    await ouvrir(page);
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#valider-plan-btn')).toBeDisabled();
  });

  test('la confirmation donne le nombre de taches, et la refuser n\'envoie rien',
    async ({ page }) => {
      const vus = await preparer(page);
      await ouvrir(page);
      let message = null;
      page.once('dialog', async d => { message = d.message(); await d.dismiss(); });
      await page.locator('#valider-plan-btn').click();
      await expect.poll(() => message).not.toBeNull();
      expect(message).toMatch(/\b3\b/);
      await page.waitForTimeout(500);
      expect(vus.valider).toBe(0);
    });

  test('confirmer envoie une seule validation et affiche le compte rendu', async ({ page }) => {
    const vus = await preparer(page);
    await ouvrir(page);
    page.once('dialog', d => d.accept());
    await page.locator('#valider-plan-btn').click();
    const cr = page.locator('#valider-compte-rendu');
    await expect(cr).toContainText(/2 modifiée/, { timeout: 10000 });
    await expect(cr).toContainText(/1 inchangée/);
    await expect(cr).toContainText(/0 inchangée/);
    await expect(cr).toContainText(/3 ignorée/);
    expect(vus.valider).toBe(1);
  });

  test('apres un Valider reussi, un calcul est relance', async ({ page }) => {
    const vus = await preparer(page);
    await ouvrir(page);
    page.once('dialog', d => d.accept());
    await page.locator('#valider-plan-btn').click();
    await expect.poll(() => vus.calculer, { timeout: 10000 }).toBe(1);
  });

  test('un refus 409 affiche le detail du serveur et ne relance rien', async ({ page }) => {
    const detail = 'La base a changé depuis le calcul : recalculez avant de valider.';
    const vus = await preparer(page, { valider: { status: 409, corps: { detail } } });
    await ouvrir(page);
    page.once('dialog', d => d.accept());
    await page.locator('#valider-plan-btn').click();
    await expect(page.locator('#valider-compte-rendu')).toContainText(detail, { timeout: 10000 });
    await page.waitForTimeout(500);
    expect(vus.calculer).toBe(0);
  });

  test('un echec 500 affiche le detail du serveur', async ({ page }) => {
    const detail = 'task modify a echoue pour eeee';
    await preparer(page, { valider: { status: 500, corps: { detail } } });
    await ouvrir(page);
    page.once('dialog', d => d.accept());
    await page.locator('#valider-plan-btn').click();
    await expect(page.locator('#valider-compte-rendu')).toContainText(detail, { timeout: 10000 });
  });
});
