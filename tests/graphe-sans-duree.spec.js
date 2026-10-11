// @ts-check
/**
 * Contrat : un noeud sans estTime se voit d'un coup d'oeil.
 *
 * Une tache sans duree estimee n'est pas planifiable. graphe.js pose la
 * classe `sans-duree` sur son groupe SVG, et graphe.css lui donne un fond
 * distinct. Une duree vide ('') compte comme absente.
 *
 * Tests entierement stubbes : aucune ecriture dans une base Taskwarrior.
 */
const { test, expect } = require('@playwright/test');

const AVEC = 'aaaa1111-0000-0000-0000-000000000001';
const SANS = 'aaaa2222-0000-0000-0000-000000000002';
const VIDE = 'aaaa3333-0000-0000-0000-000000000003';

function noeud(uuid, description, estTime) {
  return {
    uuid, description, project: 'NPD.Orion',
    estTime, due: null, externe: false, fige: false, dans_projet: true,
  };
}

const NOEUDS = [
  noeud(AVEC, 'Concevoir arbre', 'PT2H'),
  noeud(SANS, 'Tracer plan carter', null),
  noeud(VIDE, 'Chiffrer', ''),
];

async function ouvrirOrion(page) {
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, projects: ['NPD', 'NPD.Orion'] }),
  }));
  await page.route('**/api/graphe**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ projet: 'NPD.Orion', noeuds: NOEUDS, aretes: [{ de: AVEC, vers: SANS }] }),
  }));
  await page.goto('/graphe.html');
  await page.locator('#graphe-projets').fill('NPD.Orion');
  await page.locator('.graphe-projets-suggestions li', { hasText: /^NPD\.Orion$/ }).click();
  await expect(page.locator(`[data-uuid="${AVEC}"]`)).toBeVisible();
}

function fond(page, uuid) {
  return page.locator(`[data-uuid="${uuid}"]`).locator('rect, polygon').first()
    .evaluate(el => getComputedStyle(el).fill);
}

test.describe('graphe : noeud sans duree', () => {
  test('seuls les noeuds sans estTime portent la classe sans-duree', async ({ page }) => {
    await ouvrirOrion(page);
    await expect(page.locator(`[data-uuid="${SANS}"]`)).toHaveClass(/\bsans-duree\b/);
    await expect(page.locator(`[data-uuid="${VIDE}"]`)).toHaveClass(/\bsans-duree\b/);
    await expect(page.locator(`[data-uuid="${AVEC}"]`)).not.toHaveClass(/\bsans-duree\b/);
  });

  test('le fond d\'un noeud sans duree differe de celui d\'un noeud planifiable', async ({ page }) => {
    await ouvrirOrion(page);
    const avec = await fond(page, AVEC);
    const sans = await fond(page, SANS);
    expect(sans).not.toBe(avec);
  });
});
