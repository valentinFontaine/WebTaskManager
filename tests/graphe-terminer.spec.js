// @ts-check
/**
 * Contrat : terminer une tache depuis un noeud du graphe.
 *
 * Un bouton "Terminer" (✓) est pose dans le noeud, a cote du stylo, sur les
 * seuls noeuds `dans_projet` (meme regle que le stylo, cf.
 * tests/graphe-edition.spec.js). Un clic envoie POST /api/task/<uuid>/done
 * sans confirmation, comme les taskcards (task-card.js), puis recharge le
 * graphe : /api/graphe ne renvoie que des taches en attente, la tache
 * terminee disparait.
 *
 * Tests entierement stubbes : aucune ecriture dans une base Taskwarrior.
 */
const { test, expect } = require('@playwright/test');

const A = 'aaaa1111-0000-0000-0000-000000000001';
const B = 'aaaa2222-0000-0000-0000-000000000002';
const C = 'aaaa3333-0000-0000-0000-000000000003';
const HORS = 'bbbb4444-0000-0000-0000-000000000004';

function noeud(uuid, description, dansProjet = true) {
  return {
    uuid, description, project: dansProjet ? 'NPD.Orion' : 'NPD.Triton',
    estTime: null, due: null, externe: false, fige: false, dans_projet: dansProjet,
  };
}

const NOEUDS = [
  noeud(A, 'Concevoir arbre de transmission'),
  noeud(B, 'Tracer plan carter'),
  // Libelle plus etroit que la ligne de boutons : la boite doit s'elargir.
  noeud(C, 'Plan'),
  noeud(HORS, 'Fournir la specification amont', false),
];
const ARETES = [{ de: HORS, vers: A }, { de: A, vers: B }];

/**
 * Mocke /api/projects, /api/graphe (renvoie les noeuds encore en attente)
 * et POST /api/task/<uuid>/done. `reponseDone` permet de simuler un refus.
 */
async function preparer(page, { reponseDone = null } = {}) {
  const termines = new Set();
  const etat = { appelsGraphe: 0, appelsDone: [] };
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, projects: ['NPD', 'NPD.Orion', 'NPD.Triton'] }),
  }));
  await page.route('**/api/graphe**', async route => {
    etat.appelsGraphe++;
    const noeuds = NOEUDS.filter(n => !termines.has(n.uuid));
    const aretes = ARETES.filter(a => !termines.has(a.de) && !termines.has(a.vers));
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet: 'NPD.Orion', noeuds, aretes }) });
  });
  await page.route('**/api/task/*/done', async route => {
    const segments = new URL(route.request().url()).pathname.split('/');
    const uuid = segments[segments.length - 2];
    etat.appelsDone.push({ uuid, methode: route.request().method() });
    if (reponseDone) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(reponseDone) });
      return;
    }
    termines.add(uuid);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Completed task.' }) });
  });
  return etat;
}

async function ouvrirOrion(page) {
  await page.goto('/graphe.html');
  await page.locator('#graphe-projets').fill('NPD.Orion');
  await page.locator('.graphe-projets-suggestions li', { hasText: /^NPD\.Orion$/ }).click();
  await expect(page.locator(`[data-uuid="${A}"]`)).toBeVisible();
}

function boutonTerminer(page, uuid) {
  return page.locator(`[data-uuid="${uuid}"]`).getByRole('button', { name: /terminer/i });
}

test.describe('graphe.html — terminer une tache depuis un noeud', () => {

  test('un bouton Terminer accessible sur chaque noeud dans_projet, absent hors-projet', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));
    await preparer(page);
    await ouvrirOrion(page);

    await expect(boutonTerminer(page, A)).toBeVisible();
    await expect(boutonTerminer(page, B)).toBeVisible();
    await expect(boutonTerminer(page, HORS)).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  // toBeVisible ne voit pas le rognage par le foreignObject de Mermaid : un
  // bouton pose hors de la boite mesuree au rendu etait present, "visible"
  // pour Playwright, et invisible a l'ecran (stylo compris). On compare donc
  // les boites.
  test('stylo et coche tiennent dans la boite du noeud (pas de rognage)', async ({ page }) => {
    await preparer(page);
    await ouvrirOrion(page);

    for (const uuid of [A, B, C]) {
      const g = page.locator(`[data-uuid="${uuid}"]`);
      const boites = await g.evaluate(el => {
        const fo = el.querySelector('foreignObject').getBoundingClientRect();
        return [...el.querySelectorAll('button')].map(b => {
          const r = b.getBoundingClientRect();
          return { nom: b.getAttribute('aria-label'), dedans:
            r.width > 0 && r.left >= fo.left - 1 && r.right <= fo.right + 1
            && r.top >= fo.top - 1 && r.bottom <= fo.bottom + 1 };
        });
      });
      expect(boites.map(b => b.nom).sort()).toEqual(['Modifier la tâche', 'Terminer la tâche']);
      for (const b of boites) expect(b, b.nom).toMatchObject({ dedans: true });
      // Le texte non plus n'est pas rogne.
      const texteRogne = await g.evaluate(el => {
        const div = el.querySelector('foreignObject > div');
        return div.scrollWidth > div.clientWidth + 1;
      });
      expect(texteRogne, uuid).toBe(false);
    }
  });

  test('clic : POST /done sur le bon uuid, graphe recharge, la tache disparait', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e));
    const etat = await preparer(page);
    await ouvrirOrion(page);
    const graphesAvant = etat.appelsGraphe;

    await boutonTerminer(page, B).click();

    await expect(page.locator(`[data-uuid="${B}"]`)).toHaveCount(0);
    expect(etat.appelsDone).toEqual([{ uuid: B, methode: 'POST' }]);
    expect(etat.appelsGraphe).toBeGreaterThan(graphesAvant);
    await expect(page.locator(`[data-uuid="${A}"]`)).toBeVisible();
    await expect(page.locator('#graphe-message')).toContainText('Tracer plan carter');
    await expect(page.locator('#graphe-message')).not.toHaveClass(/erreur/);
    // Le clic sur le bouton ne selectionne pas le noeud.
    await expect(page.locator('#graphe-svg g.node.selectionne')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  test('refus de Taskwarrior : message d\'erreur visible, la tache reste', async ({ page }) => {
    const etat = await preparer(page, {
      reponseDone: { success: false, message: 'Task 7 is blocked.' },
    });
    await ouvrirOrion(page);

    await boutonTerminer(page, A).click();

    await expect(page.locator('#graphe-message')).toContainText('Task 7 is blocked.');
    expect(etat.appelsDone.length).toBe(1);
    await expect(page.locator(`[data-uuid="${A}"]`)).toBeVisible();
  });

  test('le bouton ne selectionne pas le noeud', async ({ page }) => {
    await preparer(page, { reponseDone: { success: false, message: 'non' } });
    await ouvrirOrion(page);

    await boutonTerminer(page, A).click();
    await expect(page.locator('#graphe-message')).toContainText('non');
    await expect(page.locator('#graphe-svg g.node.selectionne')).toHaveCount(0);
  });
});
