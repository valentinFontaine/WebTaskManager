// @ts-check
/**
 * Contrat de test : champ "Projets" du graphe (selection a bulles).
 *
 * Besoin (07/10) : relier des taches de sous-projets freres
 * (NPD.MRE.CPQ -> NPD.MRE.JDE) sans devoir afficher tout leur parent commun.
 *
 * - Le champ #graphe-projets est LE moyen de choisir ce que montre le graphe.
 *   La frappe propose les projets connus (window.twNav.projectsReady, donc
 *   GET /api/projects) en recherche floue : les lettres tapees doivent
 *   apparaitre dans l'ordre, pas forcement contigues ("mrecpq" trouve
 *   NPD.MRE.CPQ). Suggestions : `.graphe-projets-suggestions li`.
 *   Clic, ou fleches + Entree, ajoute le projet en bulle
 *   `.graphe-projet-puce[data-projet="<nom>"]`, avec un bouton de retrait
 *   (aria-label "Retirer <nom>"). Retour arriere dans le champ vide retire
 *   la derniere bulle.
 * - GET /api/graphe recoit un parametre `projet` par bulle (repete).
 * - Aucune bulle : aucun appel, aucune tache affichee, un message le dit.
 * - Avec deux bulles ou plus, chaque projet choisi a son cadre
 *   [data-cadre="<nom>"] ; avec une seule, la regle du 23/09 tient (le
 *   projet demande n'a pas de cadre, cf. tests/graphe.spec.js).
 * - Le filtre projet de la nav (#tw-project) ne choisit plus rien : il
 *   restreint seulement l'affichage aux taches de ce projet ou de ses
 *   sous-projets, comme sur les autres pages. Filtre seul, sans bulle :
 *   rien n'apparait.
 * - La selection survit au rechargement de la page (localStorage).
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

const CPQ1 = 'cccc1111-0000-0000-0000-000000000001';
const CPQ2 = 'cccc2222-0000-0000-0000-000000000002';
const JDE1 = 'dddd1111-0000-0000-0000-000000000001';

const PROJETS = ['NPD', 'NPD.MRE', 'NPD.MRE.CPQ', 'NPD.MRE.JDE', 'NPD.Orion', 'Perso'];

function noeud(uuid, description, project) {
  return { uuid, description, project, estTime: null, due: null,
    externe: false, fige: false, dans_projet: true };
}

const PAR_PROJET = {
  'NPD.MRE.CPQ': [noeud(CPQ1, 'Configurer le CPQ', 'NPD.MRE.CPQ'),
                  noeud(CPQ2, 'Recetter le CPQ', 'NPD.MRE.CPQ')],
  'NPD.MRE.JDE': [noeud(JDE1, 'Ouvrir les articles JDE', 'NPD.MRE.JDE')],
};

/** Mocke /api/projects et /api/graphe ; renvoie la liste des appels
 *  /api/graphe, chacun sous forme du tableau de ses parametres `projet`. */
async function preparer(page) {
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, projects: PROJETS }),
  }));
  const appels = [];
  await page.route('**/api/graphe**', async route => {
    const projets = new URL(route.request().url()).searchParams.getAll('projet');
    appels.push(projets);
    const noeuds = projets.flatMap(p => PAR_PROJET[p] || []);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet: projets[0], projets, noeuds, aretes: [] }) });
  });
  return appels;
}

const champ = (page) => page.locator('#graphe-projets');
const suggestions = (page) => page.locator('.graphe-projets-suggestions li');
const puce = (page, nom) => page.locator(`.graphe-projet-puce[data-projet="${nom}"]`);
const noeudGraphe = (page, uuid) => page.locator(`#graphe-svg [data-uuid="${uuid}"]`);

async function ajouterProjet(page, saisie, nom) {
  await champ(page).fill(saisie);
  await suggestions(page).filter({ hasText: new RegExp(`^${nom.replace(/\./g, '\\.')}$`) }).click();
  await expect(puce(page, nom)).toBeVisible();
}

test.describe('graphe.html -- champ Projets a bulles', () => {

  test('sans bulle : aucun appel, aucune tache, un message', async ({ page }) => {
    const appels = await preparer(page);
    await page.goto('/graphe.html');

    await expect(page.locator('#graphe-message')).toContainText(/projet/i);
    await page.waitForTimeout(300);
    expect(appels).toEqual([]);
    await expect(page.locator('#graphe-svg [data-uuid]')).toHaveCount(0);
  });

  test('recherche floue : les lettres dans l\'ordre suffisent', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');

    await champ(page).fill('mrecpq');
    await expect(suggestions(page)).toHaveText(['NPD.MRE.CPQ']);

    await champ(page).fill('jde');
    await expect(suggestions(page)).toHaveText(['NPD.MRE.JDE']);
  });

  test('choisir un projet : bulle, appel /api/graphe, taches affichees', async ({ page }) => {
    const appels = await preparer(page);
    await page.goto('/graphe.html');

    await ajouterProjet(page, 'cpq', 'NPD.MRE.CPQ');

    await expect(noeudGraphe(page, CPQ1)).toBeVisible();
    await expect(noeudGraphe(page, CPQ2)).toBeVisible();
    expect(appels[appels.length - 1]).toEqual(['NPD.MRE.CPQ']);
    await expect(champ(page)).toHaveValue('');
  });

  test('deux projets : un parametre projet chacun, un cadre chacun', async ({ page }) => {
    const appels = await preparer(page);
    await page.goto('/graphe.html');

    await ajouterProjet(page, 'cpq', 'NPD.MRE.CPQ');
    await ajouterProjet(page, 'jde', 'NPD.MRE.JDE');

    await expect(noeudGraphe(page, JDE1)).toBeVisible();
    await expect(noeudGraphe(page, CPQ1)).toBeVisible();
    expect(appels[appels.length - 1]).toEqual(['NPD.MRE.CPQ', 'NPD.MRE.JDE']);
    await expect(page.locator('[data-cadre="NPD.MRE.CPQ"]')).toHaveCount(1);
    await expect(page.locator('[data-cadre="NPD.MRE.JDE"]')).toHaveCount(1);
  });

  test('un projet deja choisi n\'est plus propose', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');

    await ajouterProjet(page, 'cpq', 'NPD.MRE.CPQ');
    await champ(page).fill('mre');
    await expect(suggestions(page)).not.toContainText(['NPD.MRE.CPQ']);
    await expect(suggestions(page).filter({ hasText: /^NPD\.MRE\.JDE$/ })).toHaveCount(1);
  });

  test('clavier : fleche bas + Entree ajoute, retour arriere retire la derniere bulle', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');

    await champ(page).fill('jde');
    await champ(page).press('ArrowDown');
    await champ(page).press('Enter');
    await expect(puce(page, 'NPD.MRE.JDE')).toBeVisible();
    await expect(noeudGraphe(page, JDE1)).toBeVisible();

    await champ(page).press('Backspace');
    await expect(puce(page, 'NPD.MRE.JDE')).toHaveCount(0);
    await expect(page.locator('#graphe-svg [data-uuid]')).toHaveCount(0);
  });

  test('Entree sans suggestion active prend la premiere suggestion', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');

    await champ(page).fill('jde');
    await expect(suggestions(page)).toHaveText(['NPD.MRE.JDE']);
    await champ(page).press('Enter');
    await expect(puce(page, 'NPD.MRE.JDE')).toBeVisible();
  });

  test('retirer une bulle relance l\'appel sans elle ; retirer la derniere vide le graphe', async ({ page }) => {
    const appels = await preparer(page);
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'cpq', 'NPD.MRE.CPQ');
    await ajouterProjet(page, 'jde', 'NPD.MRE.JDE');
    await expect(noeudGraphe(page, JDE1)).toBeVisible();

    await puce(page, 'NPD.MRE.CPQ').getByRole('button', { name: 'Retirer NPD.MRE.CPQ' }).click();
    await expect(noeudGraphe(page, CPQ1)).toHaveCount(0);
    await expect(noeudGraphe(page, JDE1)).toBeVisible();
    expect(appels[appels.length - 1]).toEqual(['NPD.MRE.JDE']);

    const nbAppels = appels.length;
    await puce(page, 'NPD.MRE.JDE').getByRole('button', { name: 'Retirer NPD.MRE.JDE' }).click();
    await expect(page.locator('#graphe-svg [data-uuid]')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(appels.length).toBe(nbAppels);
  });

  test('filtre projet de la nav : restreint l\'affichage aux taches de ce projet', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'cpq', 'NPD.MRE.CPQ');
    await ajouterProjet(page, 'jde', 'NPD.MRE.JDE');
    await expect(noeudGraphe(page, JDE1)).toBeVisible();

    await page.locator('#tw-project').fill('NPD.MRE.CPQ');
    await page.waitForTimeout(DELAI_SAISIE_NAV + 100);

    await expect(noeudGraphe(page, JDE1)).toHaveCount(0);
    await expect(noeudGraphe(page, CPQ1)).toBeVisible();
    // Le filtre ne retire pas la bulle : il ne fait que masquer.
    await expect(puce(page, 'NPD.MRE.JDE')).toBeVisible();

    // Filtre sur le parent commun : tout redevient visible.
    await page.locator('#tw-project').fill('NPD.MRE');
    await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
    await expect(noeudGraphe(page, JDE1)).toBeVisible();
    await expect(noeudGraphe(page, CPQ1)).toBeVisible();
  });

  test('filtre projet de la nav seul, sans bulle : rien n\'apparait', async ({ page }) => {
    const appels = await preparer(page);
    await page.goto('/graphe.html');

    await page.locator('#tw-project').fill('NPD.MRE.CPQ');
    await page.waitForTimeout(DELAI_SAISIE_NAV + 300);

    expect(appels).toEqual([]);
    await expect(page.locator('#graphe-svg [data-uuid]')).toHaveCount(0);
  });

  test('la selection survit au rechargement', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'cpq', 'NPD.MRE.CPQ');
    await ajouterProjet(page, 'jde', 'NPD.MRE.JDE');

    await page.reload();

    await expect(puce(page, 'NPD.MRE.CPQ')).toBeVisible();
    await expect(puce(page, 'NPD.MRE.JDE')).toBeVisible();
    await expect(noeudGraphe(page, JDE1)).toBeVisible();
  });

  test('relier deux taches de projets freres choisis en bulles', async ({ page }) => {
    await preparer(page);
    const postes = [];
    await page.route('**/api/task/*/depends', async route => {
      const segments = new URL(route.request().url()).pathname.split('/');
      postes.push({ cible: segments[segments.length - 2], corps: route.request().postDataJSON() });
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true }) });
    });
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'jde', 'NPD.MRE.JDE');
    await ajouterProjet(page, 'cpq', 'NPD.MRE.CPQ');
    await expect(noeudGraphe(page, CPQ1)).toBeVisible();

    // CPQ1 depend de JDE1 : on selectionne la source (JDE1), Relier, puis la cible.
    await noeudGraphe(page, JDE1).click();
    await page.locator('#graphe-relier').click();
    await noeudGraphe(page, CPQ1).click();

    await expect.poll(() => postes.length).toBe(1);
    expect(postes[0]).toEqual({ cible: CPQ1, corps: { ajouter: [JDE1], retirer: [] } });
    await expect(page.locator('#graphe-message')).not.toHaveClass(/erreur/);
  });
});
