// @ts-check
/**
 * Contrat de test : bouton "Supprimer" de la barre d'outils du graphe.
 *
 * - #graphe-supprimer, visible seulement pour exactement une tache
 *   selectionnee et hors geste "Relier" (meme regle que #graphe-modifier).
 * - Clic -> grosse fenetre de confirmation #graphe-confirmation-suppression
 *   ("Êtes-vous sûr ?!?"), qui nomme la tache et, si d'autres taches en
 *   dependent, le dit. Rien n'est envoye au serveur avant confirmation.
 * - Annuler (bouton ou Echap) ferme sans rien supprimer ; Annuler a le focus
 *   a l'ouverture, pour qu'un Entree machinal ne supprime rien.
 * - Confirmer -> DELETE /api/task/<uuid>/delete, puis graphe rafraichi.
 *   La route renvoie 200 avec success: false en cas d'echec Taskwarrior :
 *   l'erreur doit alors etre affichee, pas un succes.
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

const A = 'aaaa1111-0000-0000-0000-000000000001';
const B = 'aaaa2222-0000-0000-0000-000000000002';

function donneesOrion() {
  const noeuds = [
    { uuid: A, description: 'Concevoir arbre de transmission', project: 'NPD.Orion',
      estTime: 'PT1H', due: null, externe: false, fige: false, dans_projet: true },
    { uuid: B, description: 'Tracer plan carter', project: 'NPD.Orion.plans',
      estTime: null, due: null, externe: false, fige: false, dans_projet: true },
  ];
  // B depend de A.
  const aretes = [{ de: A, vers: B }];
  return { noeuds, aretes };
}

/** Mocke GET /api/graphe ; `etat.donnees` peut etre remplace en cours de test. */
async function preparerGraphe(page, etat) {
  const appels = [];
  await page.route('**/api/graphe**', async (route) => {
    const projet = new URL(route.request().url()).searchParams.get('projet');
    appels.push(projet);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet, ...etat.donnees }) });
  });
  return appels;
}

/** Mocke DELETE /api/task/:uuid/delete et capture l'uuid de chaque appel. */
async function preparerSuppression(page, { reponse = { success: true, message: 'Deleted 1 task.' } } = {}) {
  const appels = [];
  await page.route('**/api/task/*/delete', async (route) => {
    const segments = new URL(route.request().url()).pathname.split('/');
    appels.push({ uuid: segments[segments.length - 2], methode: route.request().method() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reponse) });
  });
  return appels;
}

async function choisirProjet(page, nom) {
  await page.locator('#tw-project').fill(nom);
  await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
}

const bouton = (page) => page.locator('#graphe-supprimer');
const modale = (page) => page.locator('#graphe-confirmation-suppression');
const noeud = (page, uuid) => page.locator(`[data-uuid="${uuid}"]`);

async function ouvrirGraphe(page, etat) {
  const appelsGraphe = await preparerGraphe(page, etat);
  await page.goto('/graphe.html');
  await choisirProjet(page, 'NPD.Orion');
  await expect(noeud(page, A)).toBeVisible();
  return appelsGraphe;
}

test.describe('graphe.html -- bouton Supprimer', () => {

  test('cache sans selection, visible avec une seule, cache a deux et pendant Relier', async ({ page }) => {
    await ouvrirGraphe(page, { donnees: donneesOrion() });

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

  test('la confirmation nomme la tache, signale ses dependantes, et Annuler ne supprime rien', async ({ page }) => {
    const appels = await preparerSuppression(page);
    await ouvrirGraphe(page, { donnees: donneesOrion() });

    await noeud(page, A).click();
    await bouton(page).click();

    await expect(modale(page)).toBeVisible();
    await expect(modale(page)).toContainText('Êtes-vous sûr ?!?');
    await expect(modale(page)).toContainText('Concevoir arbre de transmission');
    // B depend de A : l'avertissement le dit.
    await expect(modale(page)).toContainText('Tracer plan carter');
    await expect(page.locator('#graphe-suppression-annuler')).toBeFocused();

    await page.locator('#graphe-suppression-annuler').click();
    await expect(modale(page)).toBeHidden();
    await expect(noeud(page, A)).toBeVisible();
    expect(appels).toEqual([]);
  });

  test('Echap et Entree a l\'ouverture ne suppriment rien', async ({ page }) => {
    const appels = await preparerSuppression(page);
    await ouvrirGraphe(page, { donnees: donneesOrion() });

    await noeud(page, B).click();
    await bouton(page).click();
    await expect(modale(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modale(page)).toBeHidden();

    await bouton(page).click();
    await expect(modale(page)).toBeVisible();
    await page.keyboard.press('Enter'); // focus sur Annuler
    await expect(modale(page)).toBeHidden();

    expect(appels).toEqual([]);
  });

  test('confirmer envoie DELETE sur le bon uuid et rafraichit le graphe', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e));
    const appels = await preparerSuppression(page);
    const etat = { donnees: donneesOrion() };
    const appelsGraphe = await ouvrirGraphe(page, etat);

    await noeud(page, B).click();
    await bouton(page).click();
    // Le graphe renvoye apres suppression ne contient plus B.
    etat.donnees = { noeuds: donneesOrion().noeuds.filter((n) => n.uuid !== B), aretes: [] };
    const avant = appelsGraphe.length;
    await page.locator('#graphe-suppression-confirmer').click();

    await expect.poll(() => appels.length).toBe(1);
    expect(appels[0]).toEqual({ uuid: B, methode: 'DELETE' });
    await expect(modale(page)).toBeHidden();
    await expect.poll(() => appelsGraphe.length).toBeGreaterThan(avant);
    await expect(noeud(page, B)).toHaveCount(0);
    await expect(noeud(page, A)).toBeVisible();
    await expect(page.locator('#graphe-message')).toContainText('Tracer plan carter');
    expect(erreurs).toEqual([]);
  });

  test('echec Taskwarrior (200, success: false) : erreur affichee, tache conservee', async ({ page }) => {
    const appels = await preparerSuppression(page, {
      reponse: { success: false, message: 'No tasks specified.' },
    });
    await ouvrirGraphe(page, { donnees: donneesOrion() });

    await noeud(page, A).click();
    await bouton(page).click();
    await page.locator('#graphe-suppression-confirmer').click();

    await expect.poll(() => appels.length).toBe(1);
    const message = page.locator('#graphe-message');
    await expect(message).toContainText('No tasks specified.');
    await expect(message).toHaveClass(/erreur/);
    await expect(noeud(page, A)).toBeVisible();
  });
});
