// @ts-check
/**
 * Contrat de test : bouton "Découper" de la barre d'outils du graphe.
 *
 * - #graphe-decouper, visible seulement pour exactement une tache
 *   selectionnee et hors geste "Relier" (meme regle que Modifier/Supprimer).
 * - Clic -> fenetre #graphe-decoupage : nomme la tache, deux lignes de
 *   sous-taches (description + duree) au depart, bouton pour en ajouter,
 *   total indicatif des durees face a l'estTime d'origine.
 * - Case "sous-projet" (absente si la tache n'a pas de projet), nom propose
 *   d'apres la description et libre parmi /api/projects, modifiable.
 * - Si la tache depend d'un jalon (+milestone, lu dans /api/tasks), case
 *   "Apparier" : chaque ligne recoit un choix de sous-tache du jalon,
 *   prerempli dans l'ordre.
 * - Confirmer -> POST /api/task/<uuid>/split, puis graphe rafraichi. Un refus
 *   (409 nom pris...) s'affiche dans la fenetre, qui reste ouverte.
 * - Annuler / Echap n'envoient rien.
 *
 * Tout est stubbe : rien n'ecrit dans la base.
 */
const { test, expect } = require('@playwright/test');

const A = 'aaaa1111-0000-0000-0000-000000000001'; // a decouper
const B = 'aaaa2222-0000-0000-0000-000000000002'; // successeur de A
const M = 'bbbb0000-0000-0000-0000-000000000000'; // jalon
const M1 = 'bbbb1111-0000-0000-0000-000000000001';
const M2 = 'bbbb2222-0000-0000-0000-000000000002';
const C = 'cccc0000-0000-0000-0000-000000000000'; // successeur du jalon
const S1 = 'dddd1111-0000-0000-0000-000000000001';
const S2 = 'dddd2222-0000-0000-0000-000000000002';

const PROJETS_MOCK = ['NPD', 'NPD.Orion', 'NPD.Orion.Concevoir-arbre'];

function n(uuid, description, extra = {}) {
  return { uuid, description, project: 'NPD.Orion', estTime: null, due: null,
    externe: false, fige: false, dans_projet: true, ...extra };
}

function donneesInitiales() {
  return {
    noeuds: [
      n(A, 'Concevoir arbre', { estTime: 'PT6H' }), n(B, 'Tracer plan carter'),
      n(M, 'Plans'), n(M1, 'Plan APM'), n(M2, 'Plan GPM'), n(C, 'Consulter'),
    ],
    aretes: [{ de: A, vers: B }, { de: M1, vers: M }, { de: M2, vers: M }, { de: M, vers: C }],
  };
}

function tachesApi() {
  const t = (uuid, description, extra = {}) => ({
    uuid, description, project: 'NPD.Orion', status: 'pending', tags: [], ...extra });
  return [
    t(A, 'Concevoir arbre', { estTime: 'PT6H', tags: ['committed'] }),
    t(B, 'Tracer plan carter', { depends: [A] }),
    t(M, 'Plans', { tags: ['milestone'], estTime: 'PT30M', depends: [M1, M2], entry: '20261001T080000Z' }),
    t(M1, 'Plan APM', { entry: '20261001T080000Z' }),
    t(M2, 'Plan GPM', { entry: '20261001T080001Z' }),
    t(C, 'Consulter', { depends: [M] }),
  ];
}

async function preparer(page, etat, { reponseSplit = null } = {}) {
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, projects: PROJETS_MOCK }),
  }));
  const compteurs = { graphe: 0, taches: 0 };
  await page.route('**/api/graphe**', async (route) => {
    compteurs.graphe++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet: 'NPD.Orion', ...etat.donnees }) });
  });
  await page.route('**/api/tasks', async (route) => {
    compteurs.taches++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, tasks: tachesApi() }) });
  });
  const splits = [];
  await page.route('**/api/task/*/split', async (route) => {
    const segments = new URL(route.request().url()).pathname.split('/');
    splits.push({ uuid: segments[segments.length - 2], corps: route.request().postDataJSON() });
    const r = reponseSplit || { status: 200, body: { success: true, tasks: [{ uuid: S1 }, { uuid: S2 }] } };
    await route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
  });
  return { compteurs, splits };
}

const bouton = (page) => page.locator('#graphe-decouper');
const fenetre = (page) => page.locator('#graphe-decoupage');
const lignes = (page) => page.locator('#graphe-decoupage .graphe-decoupage-ligne');
const noeud = (page, uuid) => page.locator(`[data-uuid="${uuid}"]`);

async function ouvrirGraphe(page, etat, options) {
  const espions = await preparer(page, etat, options);
  await page.goto('/graphe.html');
  await page.locator('#graphe-projets').fill('NPD.Orion');
  await page.locator('.graphe-projets-suggestions li', { hasText: /^NPD\.Orion$/ }).click();
  await expect(noeud(page, A)).toBeVisible();
  return espions;
}

async function ouvrirDecoupage(page, uuid) {
  await noeud(page, uuid).click();
  await bouton(page).click();
  await expect(fenetre(page)).toBeVisible();
}

async function remplirLigne(page, i, description, duree) {
  const ligne = lignes(page).nth(i);
  await ligne.locator('.graphe-decoupage-desc').fill(description);
  if (duree !== undefined) await ligne.locator('.graphe-decoupage-duree').fill(duree);
}

test.describe('graphe.html -- Découper', () => {
  test.describe.configure({ mode: 'parallel' });

  test('cache sans selection, visible avec une seule, cache a deux et pendant Relier', async ({ page }) => {
    await ouvrirGraphe(page, { donnees: donneesInitiales() });

    await expect(bouton(page)).toBeHidden();
    await noeud(page, A).click();
    await expect(bouton(page)).toBeVisible();
    await noeud(page, B).click();
    await expect(bouton(page)).toBeHidden();
    await noeud(page, B).click();
    await expect(bouton(page)).toBeVisible();
    await page.locator('#graphe-relier').click();
    await expect(bouton(page)).toBeHidden();
  });

  test('fenetre : tache nommee, deux lignes, ajout de ligne, total indicatif', async ({ page }) => {
    await ouvrirGraphe(page, { donnees: donneesInitiales() });
    await ouvrirDecoupage(page, A);

    await expect(fenetre(page)).toContainText('Concevoir arbre');
    await expect(lignes(page)).toHaveCount(2);
    await page.locator('#graphe-decoupage-ajouter').click();
    await expect(lignes(page)).toHaveCount(3);

    await remplirLigne(page, 0, 'a', '2h');
    await remplirLigne(page, 1, 'b', '90min');
    const total = page.locator('#graphe-decoupage-total');
    await expect(total).toContainText('3h30');
    await expect(total).toContainText('6h');
    // Pas de jalon parmi les predecesseurs de A : pas d'appariement.
    await expect(page.locator('#graphe-decoupage-apparier-zone')).toBeHidden();
  });

  test('nom de sous-projet propose libre, d\'apres la description', async ({ page }) => {
    await ouvrirGraphe(page, { donnees: donneesInitiales() });
    await ouvrirDecoupage(page, A);
    // NPD.Orion.Concevoir-arbre existe deja.
    await expect(page.locator('#graphe-decoupage-nom')).toHaveValue('Concevoir-arbre-2');
  });

  test('parcours : decouper en deux avec sous-projet, graphe rafraichi', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e));
    const etat = { donnees: donneesInitiales() };
    const { compteurs, splits } = await ouvrirGraphe(page, etat);
    await ouvrirDecoupage(page, A);

    await remplirLigne(page, 0, 'Plan APM arbre', '2h');
    await remplirLigne(page, 1, 'Plan GPM arbre', '');
    await page.locator('#graphe-decoupage-sous-projet').check();
    await page.locator('#graphe-decoupage-nom').fill('Plans');

    const d = donneesInitiales();
    etat.donnees = {
      noeuds: [...d.noeuds, n(S1, 'Plan APM arbre', { project: 'NPD.Orion.Plans' }),
        n(S2, 'Plan GPM arbre', { project: 'NPD.Orion.Plans' })],
      aretes: [...d.aretes, { de: S1, vers: A }, { de: S2, vers: A }],
    };
    const avant = compteurs.graphe;
    await page.locator('#graphe-decoupage-confirmer').click();

    await expect.poll(() => splits.length).toBe(1);
    expect(splits[0].uuid).toBe(A);
    expect(splits[0].corps).toEqual({
      sous_taches: [
        { description: 'Plan APM arbre', estTime: '2h', apparier_a: null },
        { description: 'Plan GPM arbre', estTime: null, apparier_a: null },
      ],
      sous_projet: 'Plans',
    });
    await expect(fenetre(page)).toBeHidden();
    await expect.poll(() => compteurs.graphe).toBeGreaterThan(avant);
    await expect(noeud(page, S1)).toBeVisible();
    await expect(noeud(page, S2)).toBeVisible();
    const message = page.locator('#graphe-message');
    await expect(message).toContainText('Concevoir arbre');
    await expect(message).not.toHaveClass(/erreur/);
    expect(erreurs).toEqual([]);
  });

  test('sans sous-projet : sous_projet null', async ({ page }) => {
    const { splits } = await ouvrirGraphe(page, { donnees: donneesInitiales() });
    await ouvrirDecoupage(page, A);
    await remplirLigne(page, 0, 'a');
    await remplirLigne(page, 1, 'b');
    await page.locator('#graphe-decoupage-confirmer').click();
    await expect.poll(() => splits.length).toBe(1);
    expect(splits[0].corps.sous_projet).toBeNull();
  });

  test('apparier : chaque ligne pointe la sous-tache du jalon, dans l\'ordre', async ({ page }) => {
    const { compteurs, splits } = await ouvrirGraphe(page, { donnees: donneesInitiales() });
    await ouvrirDecoupage(page, C);

    const zone = page.locator('#graphe-decoupage-apparier-zone');
    await expect(zone).toBeVisible();
    await expect(zone).toContainText('Plans');
    expect(compteurs.taches).toBeGreaterThan(0);
    await page.locator('#graphe-decoupage-apparier').check();

    const choix = page.locator('#graphe-decoupage .graphe-decoupage-apres');
    await expect(choix).toHaveCount(2);
    await expect(choix.nth(0)).toHaveValue(M1);
    await expect(choix.nth(1)).toHaveValue(M2);

    await remplirLigne(page, 0, 'Consulter APM');
    await remplirLigne(page, 1, 'Consulter GPM');
    await page.locator('#graphe-decoupage-confirmer').click();
    await expect.poll(() => splits.length).toBe(1);
    expect(splits[0].corps.sous_taches.map((s) => s.apparier_a)).toEqual([M1, M2]);
  });

  test('refus 409 (nom pris) : message dans la fenetre, qui reste ouverte', async ({ page }) => {
    const { splits } = await ouvrirGraphe(page, { donnees: donneesInitiales() }, {
      reponseSplit: { status: 409, body: { detail: 'Le projet NPD.Orion.Plans existe déjà.' } },
    });
    await ouvrirDecoupage(page, A);
    await remplirLigne(page, 0, 'a');
    await remplirLigne(page, 1, 'b');
    await page.locator('#graphe-decoupage-sous-projet').check();
    await page.locator('#graphe-decoupage-nom').fill('Plans');
    await page.locator('#graphe-decoupage-confirmer').click();

    await expect.poll(() => splits.length).toBe(1);
    await expect(page.locator('#graphe-decoupage-erreur')).toContainText('existe déjà');
    await expect(fenetre(page)).toBeVisible();
    await expect(page.locator('#graphe-decoupage-nom')).toHaveValue('Plans');
  });

  test('Annuler et Echap n\'envoient rien', async ({ page }) => {
    const { splits } = await ouvrirGraphe(page, { donnees: donneesInitiales() });
    await ouvrirDecoupage(page, A);
    await page.locator('#graphe-decoupage-annuler').click();
    await expect(fenetre(page)).toBeHidden();
    await bouton(page).click();
    await expect(fenetre(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(fenetre(page)).toBeHidden();
    expect(splits).toEqual([]);
  });
});
