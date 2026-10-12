// @ts-check
/**
 * Perimetre du calcul (2026-10-12) : « Calculer le plan » ouvre une fenetre
 * avant de lancer quoi que ce soit.
 *
 * - #plan-calcul-modal (classe .modal, visible avec .show), deux champs :
 *   - projets : meme champ a bulles que le graphe (composant partage
 *     champ-projets.js) : #plan-calcul-projets (saisie), bulles dans
 *     #plan-calcul-projets-puces (.champ-projets-puce, data-projet, bouton
 *     .champ-projets-puce-retirer), suggestions .champ-projets-suggestion
 *     (recherche floue par sous-sequence, insensible a la casse) ;
 *   - #plan-calcul-horizon : nombre de jours du calcul detaille, 14 par defaut.
 * - #plan-calcul-lancer ferme la fenetre et poste
 *   `{ projets: [...], horizon_detaille: N }` a /api/plan/calculer ;
 *   aucune bulle = tous les projets (`projets: []`).
 * - #plan-calcul-annuler (ou Echap) ferme sans rien poster.
 * - Projets et horizon sont retenus d'une ouverture a l'autre (localStorage
 *   'plan-calcul-projets' et 'plan-calcul-horizon'), y compris apres
 *   rechargement.
 * - Horizon hors de 1..90 ou non entier : Lancer ne poste rien et un message
 *   s'affiche dans la fenetre (#plan-calcul-erreur).
 *
 * Tout est stubbe : aucun appel ne touche Taskwarrior.
 */
const { test, expect } = require('@playwright/test');

const PROJETS = ['Balise77', 'Balise77.RegionaleNov2026', 'maisonChristina', 'NPD.Heliside'];

async function preparer(page) {
  const postes = [];
  await page.route('**/api/plan/calculer', async route => {
    postes.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { statut: 'en_cours' } }) });
  });
  await page.route('**/api/plan/etat', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { statut: 'en_cours' } }) }));
  await page.route('**/plan.json', route => route.fulfill({
    status: 404, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/tasks**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, tasks: [] }) }));
  await page.route('**/api/contexts', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }) }));
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, projects: PROJETS }) }));
  return postes;
}

async function ouvrir(page) {
  await page.goto('/calendar-planner.html');
  await page.locator('#calculer-plan-btn').click();
  await expect(page.locator('#plan-calcul-modal')).toHaveClass(/show/);
}

async function choisir(page, saisie, attendu) {
  const champ = page.locator('#plan-calcul-projets');
  await champ.fill(saisie);
  await page.locator('.champ-projets-suggestion', { hasText: attendu }).first().click();
  await expect(page.locator(`#plan-calcul-projets-puces .champ-projets-puce[data-projet="${attendu}"]`))
    .toBeVisible();
}

test.describe('Calculer le plan : fenetre de perimetre', () => {
  test.describe.configure({ mode: 'parallel' });

  test('le bouton ouvre la fenetre sans rien lancer', async ({ page }) => {
    const postes = await preparer(page);
    await ouvrir(page);
    await expect(page.locator('#plan-calcul-projets')).toBeVisible();
    await expect(page.locator('#plan-calcul-horizon')).toHaveValue('14');
    await page.waitForTimeout(300);
    expect(postes).toHaveLength(0);
  });

  test('recherche floue : « bl77 » propose Balise77', async ({ page }) => {
    await preparer(page);
    await ouvrir(page);
    await page.locator('#plan-calcul-projets').fill('bl77');
    await expect(page.locator('.champ-projets-suggestion').first()).toHaveText('Balise77');
    await expect(page.locator('.champ-projets-suggestion', { hasText: 'maisonChristina' }))
      .toHaveCount(0);
  });

  test('deux projets en bulles, horizon 30 : le POST les porte', async ({ page }) => {
    const postes = await preparer(page);
    await ouvrir(page);
    await choisir(page, 'balise', 'Balise77');
    await choisir(page, 'maison', 'maisonChristina');
    await page.locator('#plan-calcul-horizon').fill('30');
    await page.locator('#plan-calcul-lancer').click();
    await expect(page.locator('#plan-calcul-modal')).not.toHaveClass(/show/);
    await expect.poll(() => postes.length).toBe(1);
    expect(postes[0]).toEqual({ projets: ['Balise77', 'maisonChristina'], horizon_detaille: 30 });
    await expect(page.locator('#plan-etat')).toContainText('Calcul en cours');
  });

  test('une bulle se retire ; sans bulle, tous les projets', async ({ page }) => {
    const postes = await preparer(page);
    await ouvrir(page);
    await choisir(page, 'balise', 'Balise77');
    await page.locator('.champ-projets-puce[data-projet="Balise77"] .champ-projets-puce-retirer').click();
    await expect(page.locator('#plan-calcul-projets-puces .champ-projets-puce')).toHaveCount(0);
    await page.locator('#plan-calcul-lancer').click();
    await expect.poll(() => postes.length).toBe(1);
    expect(postes[0]).toEqual({ projets: [], horizon_detaille: 14 });
  });

  test('Annuler ferme sans rien poster', async ({ page }) => {
    const postes = await preparer(page);
    await ouvrir(page);
    await choisir(page, 'balise', 'Balise77');
    await page.locator('#plan-calcul-annuler').click();
    await expect(page.locator('#plan-calcul-modal')).not.toHaveClass(/show/);
    await expect(page.locator('#calculer-plan-btn')).toBeEnabled();
    await page.waitForTimeout(300);
    expect(postes).toHaveLength(0);
  });

  test('Echap ferme sans rien poster', async ({ page }) => {
    const postes = await preparer(page);
    await ouvrir(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#plan-calcul-modal')).not.toHaveClass(/show/);
    await page.waitForTimeout(300);
    expect(postes).toHaveLength(0);
  });

  test('projets et horizon sont retenus apres rechargement', async ({ page }) => {
    const postes = await preparer(page);
    await ouvrir(page);
    await choisir(page, 'balise', 'Balise77');
    await page.locator('#plan-calcul-horizon').fill('21');
    await page.locator('#plan-calcul-lancer').click();
    await expect.poll(() => postes.length).toBe(1);

    await page.reload();
    await page.locator('#calculer-plan-btn').click();
    await expect(page.locator('#plan-calcul-modal')).toHaveClass(/show/);
    await expect(page.locator('#plan-calcul-projets-puces .champ-projets-puce[data-projet="Balise77"]'))
      .toBeVisible();
    await expect(page.locator('#plan-calcul-horizon')).toHaveValue('21');
  });

  for (const mauvais of ['0', '91', '2.5', '']) {
    test(`horizon « ${mauvais} » : rien n'est poste, un message le dit`, async ({ page }) => {
      const postes = await preparer(page);
      await ouvrir(page);
      await page.locator('#plan-calcul-horizon').fill(mauvais);
      await page.locator('#plan-calcul-lancer').click();
      await expect(page.locator('#plan-calcul-erreur')).toBeVisible();
      await expect(page.locator('#plan-calcul-erreur')).not.toBeEmpty();
      await expect(page.locator('#plan-calcul-modal')).toHaveClass(/show/);
      await page.waitForTimeout(300);
      expect(postes).toHaveLength(0);
    });
  }
});
