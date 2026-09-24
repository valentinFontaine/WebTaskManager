// @ts-check
/**
 * Nuit 3, defaut 3 -- un plan dont la passe 1 est INFEASIBLE/UNKNOWN n'est pas
 * un succes : l'interface ne doit pas afficher « Calcul termine. » et le
 * bouton Valider ne doit pas rester actif.
 *
 * `plan.json` porte reellement un champ `statut` (voir
 * `../TaskWarriorPlanner/planif/sortie.py::plan_en_dict`, et le test pytest
 * `test_plan_statut.py` qui verifie la meme chose cote backend).
 *
 * Piege delibere dans le plan mocke ci-dessous : un bloc OPPORTUNISTE est
 * present meme quand `statut` est INFEASIBLE/UNKNOWN. C'est fidele au depot
 * voisin (`planif/solveur.py::completer`, qui ne lit jamais `plan.statut` et
 * peut donc placer des taches sur un plan de passe 1 rate). Un test qui se
 * contenterait de verifier « aucun bloc » ne prouverait rien : il faut que le
 * refus vienne du STATUT, pas de l'absence de blocs -- cf. AGENTS.md §4,
 * exigence 2 (« le test doit prouver qu'il exerce bien le chemin vise »).
 *
 * Mocks : forme exacte des routes lues dans main_fastapi.py --
 * `/api/plan/calculer` et `/api/plan/valider` rendent `ResponseModel`
 * (`{success, data}` / `{"detail": ...}` sur refus FastAPI),
 * `/api/plan/etat` rend `{success, data: {statut: ...}}` (`plan_runner.etat()`).
 */
const { test, expect } = require('@playwright/test');

function isoLocal(jours, heure) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(heure, 0, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`;
}

/** Plan dont la passe 1 porte `statut`, avec un unique bloc OPPORTUNISTE
 * (place par la passe 2 malgre l'echec de la passe 1 -- voir l'en-tete). */
function planAvecStatut(statut) {
  return {
    version: 1, statut, retard_total: 0, en_retard: [],
    t0: isoLocal(0, 0), granularite_minutes: 30,
    taches: {
      'eeeeeeee-0000-4000-8000-000000000009': {
        description: 'Placee par la passe 2 malgre l\'echec de la passe 1',
        projet: 'NPD.x',
        debut: isoLocal(1, 14), fin: isoLocal(1, 15), due: null,
        blocs: [{ indice: 0, debut: isoLocal(1, 14), fin: isoLocal(1, 15),
          externe: false, agrege: false, opportuniste: true, precision: 'heure' }],
      },
    },
  };
}

async function preparer(page, { statut, etats }) {
  const vus = { calculer: 0, valider: 0, etat: 0, plan: 0 };
  let rangEtat = 0;

  await page.route('**/plan.json', async route => {
    vus.plan++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(planAvecStatut(statut)) });
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
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { scheduled: {}, due: {} } }) });
  });
  await page.route('**/api/tasks**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, tasks: [] }) }));
  await page.route('**/api/contexts', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
  return vus;
}

async function ouvrirEtCalculer(page, statut) {
  await preparer(page, { statut, etats: [{ statut: 'en_cours' }, { statut: 'termine' }] });
  await page.goto('/calendar-planner.html');
  // Le premier chargement lit deja plan.json (chargerPlan() au demarrage) :
  // on attend le bloc opportuniste avant de declencher un nouveau calcul.
  await expect.poll(() => page.locator('.bloc-plan').count(), { timeout: 15000 })
    .toBeGreaterThan(0);
  await page.locator('#calculer-plan-btn').click();
}

for (const statut of ['INFEASIBLE', 'UNKNOWN']) {
  test(`plan ${statut} : pas de "Calcul termine", Valider desactive`, async ({ page }) => {
    await ouvrirEtCalculer(page, statut);

    // Pas affiche comme un succes.
    await expect(page.locator('#plan-etat')).not.toHaveText('Calcul termine.',
      { timeout: 15000 });
    // Le message mentionne le statut.
    await expect(page.locator('#plan-etat')).toContainText(new RegExp(statut, 'i'),
      { timeout: 15000 });

    const btn = page.locator('#valider-plan-btn');
    // Absent ou desactive : les deux comportements satisfont la specification.
    if (await btn.count()) {
      await expect(btn).toBeDisabled();
    }
  });
}

for (const statut of ['OPTIMAL', 'FEASIBLE']) {
  test(`temoin -- plan ${statut} : "Calcul termine" et Valider actif`, async ({ page }) => {
    await ouvrirEtCalculer(page, statut);

    await expect(page.locator('#plan-etat')).toHaveText('Calcul termine.',
      { timeout: 15000 });
    await expect(page.locator('#valider-plan-btn')).toBeEnabled();
  });
}
