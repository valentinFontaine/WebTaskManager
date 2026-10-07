// @ts-check
/**
 * Contrat de test : redessin du graphe sans flash et sans perdre la vue.
 *
 * Besoin (07/10) : apres une modification (lien cree ou retire, edition,
 * suppression, ajout de tache, filtre nav), le graphe etait vide, "Chargement..."
 * s'affichait, puis le zoom et la position revenaient a "Ajuster".
 *
 * - L'ancien graphe reste affiche pendant le rechargement ; "Chargement..."
 *   n'apparait que si aucun graphe n'est encore affiche.
 * - Zoom et position (transformation du <g class="svg-pan-zoom_viewport">)
 *   sont conserves d'un redessin au suivant.
 * - "Ajuster" s'applique au premier dessin, quand la liste des projets
 *   choisis change (ajout ou retrait d'une bulle), et sur le bouton Ajuster.
 * - Un rendu qui echoue n'est pas masque par l'ancien graphe : graphe vide,
 *   message d'erreur.
 */
const { test, expect } = require('@playwright/test');

const A = 'e001-0000-0000-0000-000000000001';
const B = 'e002-0000-0000-0000-000000000002';
const C = 'e003-0000-0000-0000-000000000003';
const T = 'e004-0000-0000-0000-000000000004';

function noeud(uuid, description, project) {
  return { uuid, description, project, estTime: null, due: null,
    externe: false, fige: false, dans_projet: true };
}

const NOEUDS = {
  'NPD.Orion': [noeud(A, 'Concevoir arbre', 'NPD.Orion'),
                noeud(B, 'Tracer carter', 'NPD.Orion'),
                noeud(C, 'Devis reducteur', 'NPD.Orion')],
  'NPD.Triton': [noeud(T, 'Specification amont', 'NPD.Triton')],
};

/**
 * Mocke /api/projects, /api/graphe et POST /api/task/<uuid>/depends.
 * Les aretes servies sont mutables (`etat.aretes`) ; `etat.retenir` met les
 * reponses /api/graphe en attente jusqu'a `liberer()`, pour observer la page
 * pendant un rechargement sans dependre d'un minutage.
 */
async function preparer(page) {
  const etat = { aretes: [], retenir: false, retenues: 0, appelsGraphe: 0 };
  let liberer = () => {};
  let barriere = Promise.resolve();
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, projects: ['NPD', 'NPD.Orion', 'NPD.Triton'] }),
  }));
  await page.route('**/api/graphe**', async route => {
    etat.appelsGraphe++;
    const projets = new URL(route.request().url()).searchParams.getAll('projet');
    if (etat.retenir) {
      etat.retenues++;
      await barriere;
    }
    const noeuds = projets.flatMap(p => NOEUDS[p] || []);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet: projets[0], projets, noeuds, aretes: etat.aretes }) });
  });
  await page.route('**/api/task/*/depends', async route => {
    const segments = new URL(route.request().url()).pathname.split('/');
    const vers = segments[segments.length - 2];
    const corps = route.request().postDataJSON();
    for (const de of corps.ajouter || []) etat.aretes = [...etat.aretes, { de, vers }];
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true }) });
  });
  return {
    etat,
    retenir() {
      etat.retenir = true;
      barriere = new Promise(r => { liberer = r; });
    },
    liberer() {
      etat.retenir = false;
      liberer();
    },
  };
}

const noeudGraphe = (page, uuid) => page.locator(`#graphe-svg [data-uuid="${uuid}"]`);
const fleche = (page, de, vers) => page.locator(`#graphe-svg path[data-de="${de}"][data-vers="${vers}"]`);
const message = (page) => page.locator('#graphe-message');

async function ajouterProjet(page, nom) {
  await page.locator('#graphe-projets').fill(nom);
  await page.locator('.graphe-projets-suggestions li',
    { hasText: new RegExp('^' + nom.replace(/\./g, '\\.') + '$') }).click();
  await expect(page.locator(`.graphe-projet-puce[data-projet="${nom}"]`)).toBeVisible();
}

/** Transformation courante de svg-pan-zoom, en nombres (matrix(a,b,c,d,e,f)). */
async function transformation(page) {
  const brut = await page.locator('#graphe-svg g.svg-pan-zoom_viewport').getAttribute('transform');
  const nombres = (brut || '').match(/-?\d+(\.\d+)?(e-?\d+)?/g) || [];
  return nombres.map(Number);
}

/**
 * Deux clics Zoom avant (x1.25 chacun). svg-pan-zoom applique la
 * transformation a l'image suivante (requestAnimationFrame) : on attend
 * qu'elle ait atteint le zoom vise avant de la lire, sinon la mesure de
 * reference peut preceder le second clic.
 */
async function zoomerDeuxFois(page) {
  const ajustee = await transformation(page);
  await page.locator('#graphe-zoom-avant').click();
  await page.locator('#graphe-zoom-avant').click();
  const vise = ajustee[0] * 1.25 * 1.25;
  await expect.poll(async () => (await transformation(page))[0]).toBeCloseTo(vise, 2);
  return transformation(page);
}

function attendreProche(obtenue, attendue) {
  expect(obtenue).toHaveLength(6);
  obtenue.forEach((v, i) => expect(v).toBeCloseTo(attendue[i], 1));
}

/** Cree un lien A -> B par l'interface (selection, Relier, clic cible). */
async function relierAversB(page) {
  await noeudGraphe(page, A).click();
  await page.getByRole('button', { name: 'Relier' }).click();
  await noeudGraphe(page, B).click();
}

test.describe('graphe.html -- redessin sans flash ni perte de vue', () => {

  test('le zoom et la position sont conserves apres la creation d\'un lien', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));
    await preparer(page);
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'NPD.Orion');
    await expect(noeudGraphe(page, A)).toBeVisible();

    const zoomee = await zoomerDeuxFois(page);

    await relierAversB(page);
    // Redessin effectif : la nouvelle fleche est la.
    await expect(fleche(page, A, B)).toHaveCount(1);

    attendreProche(await transformation(page), zoomee);
    expect(erreurs).toEqual([]);
  });

  test('pendant le rechargement, l\'ancien graphe reste affiche, sans "Chargement..."', async ({ page }) => {
    const mock = await preparer(page);
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'NPD.Orion');
    await expect(noeudGraphe(page, A)).toBeVisible();

    mock.retenir();
    await relierAversB(page);
    // La requete de rechargement est bien en attente.
    await expect.poll(() => mock.etat.retenues).toBeGreaterThan(0);

    for (const uuid of [A, B, C]) await expect(noeudGraphe(page, uuid)).toBeVisible();
    await expect(message(page)).not.toHaveText(/Chargement/);

    mock.liberer();
    await expect(fleche(page, A, B)).toHaveCount(1);
    await expect(noeudGraphe(page, A)).toBeVisible();
  });

  test('ajouter un projet reajuste la vue (comme le bouton Ajuster)', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'NPD.Orion');
    await expect(noeudGraphe(page, A)).toBeVisible();
    const zoomee = await zoomerDeuxFois(page);

    await ajouterProjet(page, 'NPD.Triton');
    await expect(noeudGraphe(page, T)).toBeVisible();
    const apresAjout = await transformation(page);
    expect(apresAjout[0]).not.toBeCloseTo(zoomee[0], 1);

    await page.locator('#graphe-ajuster').click();
    attendreProche(await transformation(page), apresAjout);
  });

  test('un rendu en echec vide le graphe et affiche l\'erreur', async ({ page }) => {
    await preparer(page);
    await page.goto('/graphe.html');
    await ajouterProjet(page, 'NPD.Orion');
    await expect(noeudGraphe(page, A)).toBeVisible();

    await page.evaluate(() => {
      window.mermaid.render = () => Promise.reject(new Error('rendu impossible (test)'));
    });
    await relierAversB(page);

    await expect(message(page)).toHaveText('Erreur lors du rendu du graphe.');
    await expect(page.locator('#graphe-svg [data-uuid]')).toHaveCount(0);
  });
});
