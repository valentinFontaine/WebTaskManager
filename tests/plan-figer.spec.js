// @ts-check
/**
 * Nuit 3 -- E3 : deplacer un bloc propose fige la tache, puis relance le calcul.
 *
 * Decisions (23/09) et defauts declares :
 * - deplacer un bloc propose ECRIT TOUT DE SUITE `+fige` et `scheduled` =
 *   nouveau debut, par `POST /api/task/{uuid}/figer` avec
 *   `{scheduled: "YYYYMMDDTHHMMSSZ"}` (UTC compact) -- jamais par
 *   `PUT /api/task/{id}/modify`, qui efface les tags ;
 * - seul le bloc d'indice 0 d'une tache non `+externe` est deplacable (`+fige`
 *   n'impose que le debut du bloc 0, et Taskwarrior n'a qu'un `scheduled`) ;
 *   les autres blocs et les blocs externes restent en lecture seule ;
 * - un deplacement ne change pas la duree : un redimensionnement (seule la fin
 *   bouge) n'ecrit rien ;
 * - apres le figeage, un calcul sans ecriture (E1) est relance, puis le plan
 *   est relu ;
 * - un refus du serveur (forme FastAPI `{"detail": ...}`) s'affiche dans
 *   #plan-etat, et rien n'est relance.
 *
 * Le glisser a la souris dans TOAST UI se simule mal ; on appelle donc le
 * gestionnaire que le calendrier appelle (`handleBeforeUpdateEvent`) avec
 * l'evenement tel que le calendrier le rend. Le caractere deplacable, lui, se
 * lit sur l'evenement (`isReadOnly`). L'essai de bout en bout de l'etape 6
 * fait un vrai glisser contre le vrai serveur.
 */
const { test, expect } = require('@playwright/test');

const U_A = 'f1f1f1f1-0000-4000-8000-000000000001';
const U_E = 'f1f1f1f1-0000-4000-8000-000000000002';

function isoLocal(jours, heure) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(heure, 0, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`;
}

function utcCompact(isoLocalTexte) {
  return new Date(isoLocalTexte).toISOString().replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
}

function bloc(indice, jours, h1, h2, extra = {}) {
  return { indice, debut: isoLocal(jours, h1), fin: isoLocal(jours, h2),
    externe: false, agrege: false, opportuniste: false, precision: 'heure', ...extra };
}

function plan() {
  return {
    version: 1, statut: 'OPTIMAL', retard_total: 0, en_retard: [],
    t0: isoLocal(0, 0), granularite_minutes: 30,
    taches: {
      [U_A]: { description: 'Plan de detail carter', projet: 'NPD.Orion.plans',
        debut: isoLocal(0, 9), fin: isoLocal(0, 16), due: isoLocal(0, 16),
        blocs: [bloc(0, 0, 9, 11), bloc(1, 0, 14, 16)] },
      [U_E]: { description: 'Usinage fournisseur', projet: 'NPD.Orion.achats',
        debut: isoLocal(0, 0), fin: isoLocal(3, 0), due: isoLocal(3, 0),
        blocs: [{ indice: 0, debut: isoLocal(0, 0), fin: isoLocal(3, 0), externe: true,
          agrege: false, opportuniste: false, precision: 'heure' }] },
    },
  };
}

async function preparer(page, { figer = null } = {}) {
  const vus = { figer: [], modify: 0, calculer: 0, plan: 0 };
  let rangEtat = 0;
  const etats = [{ statut: 'en_cours' }, { statut: 'termine', duree_s: 3 }];

  await page.route('**/plan.json', async route => {
    vus.plan++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(plan()) });
  });
  await page.route('**/api/task/*/figer', async route => {
    vus.figer.push({ url: route.request().url(), corps: route.request().postDataJSON() });
    const r = figer || { status: 200, corps: { success: true, message: null, error: null,
      data: null, tasks: null, task: { uuid: U_A, tags: ['pro', 'fige'] } } };
    await route.fulfill({ status: r.status, contentType: 'application/json',
      body: JSON.stringify(r.corps) });
  });
  await page.route('**/api/task/*/modify', async route => {
    vus.modify++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/plan/calculer', async route => {
    vus.calculer++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { statut: 'en_cours' } }) });
  });
  await page.route('**/api/plan/etat', async route => {
    const etat = etats[Math.min(rangEtat, etats.length - 1)];
    rangEtat++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: etat }) });
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

/** Lit un evenement du calendrier : son calendrier et son caractere modifiable. */
async function evenement(page, id) {
  return page.evaluate(id => {
    for (const cal of ['plan-contraint', 'plan-opportuniste', 'plan-externe']) {
      const ev = calendar.getEvent(id, cal);
      if (ev) return { calendarId: cal, isReadOnly: !!ev.isReadOnly };
    }
    return null;
  }, id);
}

/** Appelle le gestionnaire de depot du calendrier, comme TOAST UI le fait. */
async function deposer(page, id, changes) {
  return page.evaluate(async ({ id, changes }) => {
    let ev = null;
    for (const cal of ['plan-contraint', 'plan-opportuniste', 'plan-externe']) {
      ev = ev || calendar.getEvent(id, cal);
    }
    const ch = {};
    if (changes.start) ch.start = new Date(changes.start);
    if (changes.end) ch.end = new Date(changes.end);
    await handleBeforeUpdateEvent({ event: ev, changes: ch });
  }, { id, changes });
}

test.describe('E3 -- deplacer un bloc propose', () => {
  test('seul le bloc 0 d\'une tache non externe est deplacable', async ({ page }) => {
    await preparer(page);
    await ouvrir(page);
    expect(await evenement(page, `plan-${U_A}-0`)).toEqual(
      { calendarId: 'plan-contraint', isReadOnly: false });
    expect((await evenement(page, `plan-${U_A}-1`)).isReadOnly).toBe(true);
    expect((await evenement(page, `plan-${U_E}-0`)).isReadOnly).toBe(true);
  });

  test('deposer le bloc 0 fige la tache au nouveau debut, sans passer par modify',
    async ({ page }) => {
      const vus = await preparer(page);
      await ouvrir(page);
      await deposer(page, `plan-${U_A}-0`, { start: isoLocal(1, 14), end: isoLocal(1, 16) });
      await expect.poll(() => vus.figer.length).toBe(1);
      expect(vus.figer[0].url).toContain(`/api/task/${U_A}/figer`);
      expect(vus.figer[0].corps).toEqual({ scheduled: utcCompact(isoLocal(1, 14)) });
      expect(vus.modify).toBe(0);
    });

  test('apres le figeage, le calcul est relance puis le plan relu', async ({ page }) => {
    const vus = await preparer(page);
    await ouvrir(page);
    const lectures = vus.plan;
    await deposer(page, `plan-${U_A}-0`, { start: isoLocal(1, 14), end: isoLocal(1, 16) });
    await expect.poll(() => vus.calculer, { timeout: 10000 }).toBe(1);
    await expect.poll(() => vus.plan, { timeout: 15000 }).toBeGreaterThan(lectures);
  });

  test('un redimensionnement (seule la fin bouge) n\'ecrit rien', async ({ page }) => {
    const vus = await preparer(page);
    await ouvrir(page);
    await deposer(page, `plan-${U_A}-0`, { end: isoLocal(0, 12) });
    await page.waitForTimeout(500);
    expect(vus.figer.length).toBe(0);
    expect(vus.modify).toBe(0);
    expect(vus.calculer).toBe(0);
  });

  test('un bloc d\'indice 1 ou externe n\'ecrit rien meme si le gestionnaire est appele',
    async ({ page }) => {
      const vus = await preparer(page);
      await ouvrir(page);
      await deposer(page, `plan-${U_A}-1`, { start: isoLocal(1, 9), end: isoLocal(1, 11) });
      await deposer(page, `plan-${U_E}-0`, { start: isoLocal(1, 0), end: isoLocal(4, 0) });
      await page.waitForTimeout(500);
      expect(vus.figer.length).toBe(0);
      expect(vus.modify).toBe(0);
    });

  test('un refus du serveur s\'affiche et ne relance pas le calcul', async ({ page }) => {
    const detail = 'Identifiant de tâche invalide';
    const vus = await preparer(page, { figer: { status: 400, corps: { detail } } });
    await ouvrir(page);
    await deposer(page, `plan-${U_A}-0`, { start: isoLocal(1, 14), end: isoLocal(1, 16) });
    await expect(page.locator('#plan-etat')).toContainText(detail, { timeout: 10000 });
    await page.waitForTimeout(500);
    expect(vus.calculer).toBe(0);
  });
});
