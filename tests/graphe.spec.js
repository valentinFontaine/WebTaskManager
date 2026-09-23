// @ts-check
/**
 * Contrat de test pour graphe.html / graphe.js (fonctionnalite H, cote UI).
 *
 * Page absente au moment ou ce fichier est ecrit : ces tests doivent echouer
 * (page introuvable / selecteurs absents), pas passer par accident.
 *
 * ## Forme de la reponse mockee
 *
 * Alignee sur test_graphe.py : GET /api/graphe?projet=X repond
 *   { projet, noeuds: [{ uuid, description, project, estTime, due,
 *                          externe, fige, dans_projet }],
 *     aretes: [{ de, vers }] }
 *
 * ## Choix d'identification d'un noeud
 *
 * On suppose que graphe.js pose un attribut `data-uuid="<uuid>"` sur l'element
 * DOM qui represente chaque noeud (le noeud Mermaid genere porte cet attribut,
 * par exemple via une classe ou un `click` binding qui ajoute l'attribut apres
 * le rendu). Choix documente ici parce que l'enonce laissait deux options
 * (attribut dedie, ou id contenant l'uuid sans tirets a cause des contraintes
 * d'id Mermaid) : `data-uuid` evite tout probleme d'id invalide en cas de
 * tirets ou de caracteres non alphanumeriques dans l'uuid, et se retrouve par
 * un simple `[data-uuid="..."]` sans transformation cote test.
 * Si l'implementation choisit finalement un id sans tirets, ce fichier devra
 * etre ajuste sur ce seul point (fonction `selecteurNoeud`).
 *
 * ## Mecanisme de selection du projet (lu dans nav.js)
 *
 * Le filtre projet est un champ texte `#tw-project` dans la barre de nav.
 * Sa frappe est anti-rebondie (150ms, cf. SAISIE_DELAI) puis appelle
 * `window.twNav.setState({ project: valeur }, { clientOnly: true })`, qui
 * ecrit l'etat dans localStorage (cle `tw-nav-state`) et emet un
 * CustomEvent `tw-filter-change` sur `document`, avec `detail.project` et
 * `detail.clientOnly = true`.
 *
 * Le flag `clientOnly` sert aux pages qui ont deja tout leur jeu de donnees
 * en memoire (liste, kanban) : pas la peine de retaper le serveur, un
 * re-rendu local suffit. graphe.js n'a jamais les donnees d'un projet avant
 * de l'avoir demande : il doit donc re-appeler /api/graphe a chaque
 * changement de state.project, meme quand clientOnly vaut true. C'est une
 * lecture deliberee de l'evenement, differente de celle des autres pages,
 * et testee explicitement (test "changer le projet relance l'appel").
 *
 * Ces tests pilotent le filtre en tapant dans #tw-project (chemin reel),
 * plutot qu'en appelant twNav.setState() directement depuis le test.
 */
const { test, expect } = require('@playwright/test');

const DELAI_SAISIE_NAV = 150; // cf. SAISIE_DELAI dans nav.js

function selecteurNoeud(uuid) {
  return `[data-uuid="${uuid}"]`;
}

/** Jeu de noeuds/aretes construit a la main, projet NPD.Orion. */
function donneesOrion() {
  const noeuds = [
    {
      uuid: 'aaaa1111-0000-0000-0000-000000000001',
      description: 'Concevoir arbre de transmission',
      project: 'NPD.Orion',
      estTime: 'PT1H',
      due: null,
      externe: false,
      fige: false,
      dans_projet: true,
    },
    {
      // description avec guillemets, crochets, accents : ne doit pas casser
      // le rendu Mermaid (qui utilise lui-meme des guillemets et crochets).
      uuid: 'aaaa2222-0000-0000-0000-000000000002',
      description: 'Tracer plan "carter" [rev B] été',
      project: 'NPD.Orion.plans',
      estTime: null,
      due: '20260901T000000Z',
      externe: true,
      fige: false,
      dans_projet: true,
    },
    {
      uuid: 'aaaa3333-0000-0000-0000-000000000003',
      description: 'Devis fournisseur reducteur',
      project: 'NPD.Orion.achats',
      estTime: null,
      due: null,
      externe: false,
      fige: true,
      dans_projet: true,
    },
    {
      // voisin hors projet
      uuid: 'bbbb4444-0000-0000-0000-000000000004',
      description: 'Fournir la specification amont',
      project: 'NPD.Triton',
      estTime: null,
      due: null,
      externe: false,
      fige: false,
      dans_projet: false,
    },
  ];
  const aretes = [
    { de: 'bbbb4444-0000-0000-0000-000000000004', vers: 'aaaa1111-0000-0000-0000-000000000001' },
    { de: 'aaaa1111-0000-0000-0000-000000000001', vers: 'aaaa2222-0000-0000-0000-000000000002' },
    { de: 'aaaa2222-0000-0000-0000-000000000002', vers: 'aaaa3333-0000-0000-0000-000000000003' },
  ];
  return { noeuds, aretes };
}

/** Prepare la page : mocke /api/graphe, laisse le reste au vrai serveur. */
async function preparer(page, { reponsesParProjet = {}, statutHttp = null } = {}) {
  const appels = [];
  await page.route('**/api/graphe**', async route => {
    const url = new URL(route.request().url());
    const projet = url.searchParams.get('projet');
    appels.push(projet);

    if (statutHttp) {
      await route.fulfill({ status: statutHttp, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'erreur serveur simulee' }) });
      return;
    }

    const donnees = reponsesParProjet[projet];
    if (donnees === undefined) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ projet, noeuds: [], aretes: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projet, noeuds: donnees.noeuds, aretes: donnees.aretes }) });
  });
  return appels;
}

/** Tape dans le filtre projet de nav.js et attend l'anti-rebond. */
async function choisirProjet(page, nom) {
  const champ = page.locator('#tw-project');
  await champ.fill(nom);
  await page.waitForTimeout(DELAI_SAISIE_NAV + 100);
}

test.describe('graphe.html — visualisation des dependances', () => {

  test('sans projet selectionne, invite a en choisir un, aucun appel a /api/graphe', async ({ page }) => {
    const appels = await preparer(page);
    await page.goto('/graphe.html');
    await expect(page.locator('body')).toContainText(/choisi(r|ssez).*projet|selectionn.*projet/i);
    await page.waitForTimeout(300);
    expect(appels.length).toBe(0);
  });

  test('avec un projet choisi, appelle /api/graphe et dessine un noeud par tache', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    const appels = await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect.poll(() => appels.filter(p => p === 'NPD.Orion').length).toBeGreaterThan(0);
    for (const n of noeuds) {
      // Un mot du debut de la description suffit : le texte source complet
      // n'a pas a survivre tel quel a travers Mermaid (echappement interne).
      await expect(page.locator(selecteurNoeud(n.uuid)))
        .toContainText(new RegExp(escapeRegExp(n.description.split(' ')[0])));
    }
  });

  test('les classes CSS externe / hors-projet / fige sont posees sur les bons noeuds', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator(selecteurNoeud('aaaa2222-0000-0000-0000-000000000002')))
      .toHaveClass(/externe/);
    await expect(page.locator(selecteurNoeud('aaaa3333-0000-0000-0000-000000000003')))
      .toHaveClass(/fige/);
    await expect(page.locator(selecteurNoeud('bbbb4444-0000-0000-0000-000000000004')))
      .toHaveClass(/hors-projet/);
    // Le premier noeud n'a aucune de ces trois proprietes.
    const classeN1 = await page.locator(selecteurNoeud('aaaa1111-0000-0000-0000-000000000001'))
      .getAttribute('class');
    expect(classeN1 || '').not.toMatch(/externe|fige|hors-projet/);
  });

  test('un cadre (subgraph) par sous-projet distinct parmi les noeuds du projet', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    // Mermaid rend un subgraph comme un cluster nomme dans le SVG : on
    // cherche le texte du titre du cadre, pas une structure interne precise.
    const conteneur = page.locator('#graphe-svg, svg').first();
    await expect(conteneur).toBeVisible();
    for (const titre of ['NPD.Orion', 'NPD.Orion.plans', 'NPD.Orion.achats']) {
      await expect(page.locator('body')).toContainText(titre);
    }
  });

  test('une fleche par arete rendue dans le SVG', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    const svg = page.locator('svg').first();
    await expect(svg).toBeVisible();
    // Mermaid rend chaque arete comme un <path class="...edge...dge..."> (ou
    // un marker de fleche) : on compte les chemins d'arete, pas les traits
    // internes des noeuds (rectangles/texte), qui ne sont pas des <path>.
    const nbFleches = await svg.locator('path.flowchart-link, path[class*="edge"], marker path')
      .count();
    expect(nbFleches).toBeGreaterThanOrEqual(aretes.length);
  });

  test('description avec guillemets, crochets et accents ne casse pas le rendu', async ({ page }) => {
    const { noeuds, aretes } = donneesOrion();
    await preparer(page, { reponsesParProjet: { 'NPD.Orion': { noeuds, aretes } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    // La page ne doit pas afficher de bandeau d'erreur, et le SVG doit
    // exister malgre la description a caracteres speciaux.
    await expect(page.locator('svg')).toBeVisible();
    // innerText et non textContent : le <style> que Mermaid embarque dans le
    // SVG contient ses propres noms de classes (.error-text), jamais affiches.
    expect(await page.locator('body').innerText()).not.toMatch(/erreur|error/i);
    await expect(page.locator('svg .error-icon')).toHaveCount(0);
    // Le libelle entier, pas un mot : un echappement qui mange les guillemets,
    // les crochets ou l'accent doit se voir.
    await expect(page.locator(selecteurNoeud('aaaa2222-0000-0000-0000-000000000002')))
      .toContainText('Tracer plan "carter" [rev B] été');
  });

  test('reponse vide : message "aucune tache", pas de SVG', async ({ page }) => {
    await preparer(page, { reponsesParProjet: { 'NPD.Vide': { noeuds: [], aretes: [] } } });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Vide');

    await expect(page.locator('body')).toContainText(/aucune t[aâ]che/i);
    await expect(page.locator('svg')).toHaveCount(0);
  });

  test('erreur HTTP : message d\'erreur visible dans la page', async ({ page }) => {
    await preparer(page, { statutHttp: 500 });
    await page.goto('/graphe.html');
    await choisirProjet(page, 'NPD.Orion');

    await expect(page.locator('body')).toContainText(/erreur/i);
    await expect(page.locator('svg')).toHaveCount(0);
  });

  test('changer le projet dans le filtre relance l\'appel et redessine', async ({ page }) => {
    const orion = donneesOrion();
    const triton = {
      noeuds: [{
        uuid: 'cccc5555-0000-0000-0000-000000000005',
        description: 'Tache du projet Triton',
        project: 'NPD.Triton',
        estTime: null, due: null, externe: false, fige: false, dans_projet: true,
      }],
      aretes: [],
    };
    const appels = await preparer(page, {
      reponsesParProjet: { 'NPD.Orion': orion, 'NPD.Triton': triton },
    });
    await page.goto('/graphe.html');

    await choisirProjet(page, 'NPD.Orion');
    await expect(page.locator(selecteurNoeud('aaaa1111-0000-0000-0000-000000000001'))).toBeVisible();
    const appelsAvant = appels.filter(p => p === 'NPD.Triton').length;

    await choisirProjet(page, 'NPD.Triton');
    await expect.poll(() => appels.filter(p => p === 'NPD.Triton').length).toBeGreaterThan(appelsAvant);
    await expect(page.locator(selecteurNoeud('cccc5555-0000-0000-0000-000000000005'))).toBeVisible();
    // L'ancien noeud d'Orion a disparu : le graphe a bien ete redessine, pas
    // seulement complete.
    await expect(page.locator(selecteurNoeud('aaaa1111-0000-0000-0000-000000000001'))).toHaveCount(0);
  });
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
