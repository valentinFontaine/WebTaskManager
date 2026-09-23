// @ts-check
/**
 * E2 — declencher le calcul depuis le calendrier, et en voir le resultat.
 *
 * E1 a pose les deux endpoints (`POST /api/plan/calculer`,
 * `GET /api/plan/etat`) et garanti qu'un calcul lance depuis l'interface
 * n'ecrit rien dans Taskwarrior. Il manquait le bouton, et surtout ce qui se
 * passe APRES : la resolution dure de 30 s a 2 minutes, donc l'interface doit
 * dire ou on en est puis redessiner le calendrier quand c'est fini.
 *
 * ## Le point de conception qui porte ce lot
 *
 * `chargerPlan()` degrade EN SILENCE par construction : plan absent, illisible
 * ou perime, il n'affiche rien de plus et le calendrier continue de marcher
 * (lot 9, exigence explicite). C'est juste pour un plan qu'on lit.
 *
 * Ca ne l'est pas du tout pour un calcul qu'on DECLENCHE. Si l'ordonnanceur
 * echoue et que l'echec se tait, l'utilisateur clique, ne voit rien changer, et
 * conclut que son plan est a jour alors qu'il regarde celui d'hier. C'est la
 * meme faute que le faux `INFEASIBLE` du solveur : une panne qui se fait passer
 * pour un resultat.
 *
 * D'ou la regle testee ici : **un plan qu'on LIT degrade en silence, un calcul
 * qu'on LANCE ne se tait jamais.**
 */
const { test, expect } = require('@playwright/test');

/** Prepare la page avec des routes controlees. */
async function preparer(page, { etats = [], calculReponse = null, plan = null } = {}) {
  const vus = { calculer: 0, etat: 0, plan: 0 };
  let rangEtat = 0;

  await page.route('**/api/plan/calculer', async route => {
    vus.calculer++;
    const corps = calculReponse || { success: true, data: { statut: 'en_cours' } };
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(corps) });
  });

  await page.route('**/api/plan/etat', async route => {
    vus.etat++;
    const etat = etats[Math.min(rangEtat, etats.length - 1)] || { statut: 'inactif' };
    rangEtat++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: etat }) });
  });

  await page.route('**/plan.json', async route => {
    vus.plan++;
    if (!plan) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(plan) });
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

test.describe('E2 — calcul du plan depuis le calendrier', () => {

  test('le bouton existe et est visible', async ({ page }) => {
    await preparer(page);
    await page.goto('/calendar-planner.html');
    await expect(page.locator('#calculer-plan-btn')).toBeVisible();
  });

  test('cliquer lance le calcul', async ({ page }) => {
    const vus = await preparer(page, { etats: [{ statut: 'en_cours' }] });
    await page.goto('/calendar-planner.html');
    await page.locator('#calculer-plan-btn').click();
    await expect.poll(() => vus.calculer).toBeGreaterThan(0);
  });

  test('pendant le calcul, le bouton ne peut pas etre reclique', async ({ page }) => {
    // Deux calculs simultanes ecriraient le meme fichier en meme temps ; le
    // backend les refuse deja, l'interface ne doit pas les proposer.
    await preparer(page, { etats: [{ statut: 'en_cours' }] });
    await page.goto('/calendar-planner.html');
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#calculer-plan-btn')).toBeDisabled();
  });

  test('l\'interface dit qu\'un calcul est en cours', async ({ page }) => {
    await preparer(page, { etats: [{ statut: 'en_cours' }] });
    await page.goto('/calendar-planner.html');
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#plan-etat')).toContainText(/cours|calcul/i);
  });

  test('quand le calcul finit, le plan est RELU', async ({ page }) => {
    // C'est l'interet du bouton : sans relecture, on regarderait encore le plan
    // d'avant sans le savoir.
    const vus = await preparer(page, {
      etats: [{ statut: 'en_cours' }, { statut: 'termine', duree_s: 41.2 }],
    });
    await page.goto('/calendar-planner.html');
    const avant = vus.plan;
    await page.locator('#calculer-plan-btn').click();
    await expect.poll(() => vus.plan, { timeout: 15000 }).toBeGreaterThan(avant);
  });

  test('quand le calcul finit, le bouton redevient cliquable', async ({ page }) => {
    await preparer(page, {
      etats: [{ statut: 'en_cours' }, { statut: 'termine', duree_s: 41.2 }],
    });
    await page.goto('/calendar-planner.html');
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#calculer-plan-btn')).toBeEnabled({ timeout: 15000 });
  });

  test('UN ECHEC NE SE TAIT PAS', async ({ page }) => {
    // LE test de ce fichier. Un plan qu'on LIT degrade en silence ; un calcul
    // qu'on LANCE ne le doit jamais, sinon l'utilisateur croit regarder un plan
    // a jour alors qu'il regarde celui d'hier.
    await preparer(page, {
      etats: [{ statut: 'en_cours' },
              { statut: 'echec', message: 'ortools introuvable' }],
    });
    await page.goto('/calendar-planner.html');
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#plan-etat')).toContainText(/ortools introuvable/,
      { timeout: 15000 });
  });

  test('un refus du backend est montre, pas avale', async ({ page }) => {
    // Cas reel : un calcul est deja en cours cote serveur.
    await preparer(page, {
      calculReponse: { success: false, error: 'un calcul est deja en cours' },
      etats: [{ statut: 'en_cours' }],
    });
    await page.goto('/calendar-planner.html');
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#plan-etat')).toContainText(/deja en cours/i);
  });

  test('l\'interrogation d\'etat s\'arrete quand le calcul est fini', async ({ page }) => {
    // Sans arret, on interroge le serveur indefiniment pour rien.
    const vus = await preparer(page, {
      etats: [{ statut: 'en_cours' }, { statut: 'termine', duree_s: 12.0 }],
    });
    await page.goto('/calendar-planner.html');
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#calculer-plan-btn')).toBeEnabled({ timeout: 15000 });
    const apresFin = vus.etat;
    await page.waitForTimeout(3000);
    expect(vus.etat, 'l\'interrogation continue apres la fin du calcul')
      .toBeLessThanOrEqual(apresFin);
  });
});
