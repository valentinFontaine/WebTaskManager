#!/usr/bin/env python3
"""
Analyse d'un CSV d'import en masse de taches Taskwarrior.

Fonction pure : `analyser(texte_csv, taches_existantes)` -> objet avec
`.taches`, `.erreurs`, `.aretes`. Voir test_import_csv.py pour le contrat
complet (formats de colonnes, formules d'identite, regles de fusion).

Fusion avec l'existant -- regle generale et exception `scheduled` :
regle generale, une cellule vide = champ omis = efface (le champ n'est pas
recopie depuis la tache existante). Exception : `scheduled` n'est pas un
contenu du fichier mais un etat du planning ; une cellule VIDE conserve le
scheduled existant, une cellule renseignee le remplace. Sans cette exception,
chaque reimport effacerait le planning, y compris celui des taches +fixed.

Ce module ne fait aucun appel a `task` : il ne fait que construire les
objets destines a `task import`. L'ecriture reelle est du ressort des
routes (main_fastapi.py, POST /api/import).
"""

import csv
import io
import re
import uuid
from datetime import datetime, timezone


# Namespace fixe, utilise pour deriver l'identite des taches par uuid5.
# Ne jamais changer cette valeur : elle doit rester stable d'un import a
# l'autre pour que le reimport retrouve les memes uuids.
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "import-csv.webtaskmanager.local")


# Alias de colonnes (francais et anglais) -> champ canonique Taskwarrior.
# Recherche insensible a la casse.
_ALIAS_COLONNES = {
    "ref": "ref",
    "description": "description",
    "projet": "project",
    "project": "project",
    "tags": "tags",
    "esttime": "estTime",
    "duree": "estTime",
    "duration": "estTime",
    "due": "due",
    "echeance": "due",
    "scheduled": "scheduled",
    "planifie": "scheduled",
    "planifiee": "scheduled",
    "priorite": "priority",
    "priority": "priority",
    "depend_de": "depends",
    "depends": "depends",
    "dependances": "depends",
}

# Champs geres par simple copie de texte (pas de parsing specifique).
_CHAMPS_TEXTE = ("description", "project", "priority")

_TAG_VALIDE = re.compile(r"^\w+$", re.UNICODE)

_FORMATS_DATE = [
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
]

# Une date deja au format Taskwarrior (UTC) est acceptee telle quelle.
_DATE_UTC_DEJA = re.compile(r"^\d{8}T\d{6}Z$")

# Duree deja en ISO-8601 : acceptee telle quelle (mise en majuscules).
_ISO_DUREE = re.compile(r"^P(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$", re.IGNORECASE)

# Unites de duree reconnues, du plus grand au plus petit -- sert a inferer
# l'unite d'un nombre isole dans une forme composee ("1h30" = 1h + 30min).
_ORDRE_UNITES = ["j", "h", "min", "s"]

_ALIAS_UNITE = {
    "s": "s", "sec": "s", "secs": "s", "seconde": "s", "secondes": "s",
    "second": "s", "seconds": "s",
    "min": "min", "mn": "min", "minute": "min", "minutes": "min",
    "h": "h", "hr": "h", "hrs": "h", "heure": "h", "heures": "h",
    "hour": "h", "hours": "h",
    "j": "j", "jour": "j", "jours": "j", "d": "j", "day": "j", "days": "j",
}

_SECONDES_PAR_UNITE = {"s": 1, "min": 60, "h": 3600, "j": 86400}


class ResultatAnalyse:
    """Conteneur simple pour le resultat de `analyser()`."""

    def __init__(self, taches, erreurs, aretes):
        self.taches = taches
        self.erreurs = erreurs
        self.aretes = aretes


class _ErreurCellule(Exception):
    """Erreur de parsing localisee a une cellule (colonne + message)."""

    def __init__(self, colonne, message):
        super().__init__(message)
        self.colonne = colonne
        self.message = message


# --- Detection du separateur et decoupage en lignes physiques ---------------

def _detecter_delimiteur(premiere_ligne):
    """Choisit ';' ou ',' selon celui le plus present dans l'en-tete."""
    if premiere_ligne.count(";") >= premiere_ligne.count(","):
        return ";"
    return ","


def _lignes_physiques(texte_csv):
    """Renvoie la liste des lignes CSV (une entree par ligne physique,
    en-tete compris), BOM initial retire."""
    texte = texte_csv.lstrip("﻿")
    premiere_ligne = texte.split("\n", 1)[0]
    delimiteur = _detecter_delimiteur(premiere_ligne)
    lecteur = csv.reader(io.StringIO(texte), delimiter=delimiteur)
    return list(lecteur)


# --- Normalisation de la duree (estTime) ------------------------------------

def _normaliser_duree(valeur):
    """Convertit une duree en ISO-8601. Leve _ErreurCellule si illisible."""
    brut = valeur.strip()
    if _ISO_DUREE.match(brut):
        return brut.upper()

    motifs = re.findall(r"(\d+(?:[.,]\d+)?)\s*([a-zA-Zéèêà]*)", brut)
    motifs = [(n, u) for n, u in motifs if n]
    if not motifs:
        raise _ErreurCellule("estTime", f"Duree illisible : {valeur!r}")

    total_secondes = 0.0
    unite_precedente = None
    for nombre_str, unite_str in motifs:
        nombre = float(nombre_str.replace(",", "."))
        unite_str = unite_str.lower()
        if unite_str:
            unite = _ALIAS_UNITE.get(unite_str)
            if unite is None:
                raise _ErreurCellule("estTime", f"Unite de duree inconnue : {valeur!r}")
        else:
            # Nombre isole (forme composee type "1h30") : unite plus fine
            # que la precedente.
            if unite_precedente is None:
                raise _ErreurCellule("estTime", f"Duree illisible : {valeur!r}")
            idx = _ORDRE_UNITES.index(unite_precedente)
            if idx + 1 >= len(_ORDRE_UNITES):
                raise _ErreurCellule("estTime", f"Duree illisible : {valeur!r}")
            unite = _ORDRE_UNITES[idx + 1]
        total_secondes += nombre * _SECONDES_PAR_UNITE[unite]
        unite_precedente = unite

    return _secondes_vers_iso(total_secondes)


def _secondes_vers_iso(total_secondes):
    total = int(round(total_secondes))
    jours, reste = divmod(total, 86400)
    heures, reste = divmod(reste, 3600)
    minutes, secondes = divmod(reste, 60)

    resultat = "P"
    if jours:
        resultat += f"{jours}D"
    partie_temps = ""
    if heures:
        partie_temps += f"{heures}H"
    if minutes:
        partie_temps += f"{minutes}M"
    if secondes:
        partie_temps += f"{secondes}S"
    if partie_temps:
        resultat += "T" + partie_temps
    if resultat == "P":
        resultat = "PT0S"
    return resultat


# --- Normalisation des dates (due, scheduled) -------------------------------

def _normaliser_date(valeur, colonne):
    brut = valeur.strip()
    if _DATE_UTC_DEJA.match(brut):
        return brut.upper()

    for fmt in _FORMATS_DATE:
        try:
            date_locale = datetime.strptime(brut, fmt)
        except ValueError:
            continue
        return date_locale.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    raise _ErreurCellule(colonne, f"Date illisible : {valeur!r}")


# --- Tags --------------------------------------------------------------------

def _parser_tags(valeur):
    """Renvoie (tags_valides, tags_invalides)."""
    brut = valeur.strip()
    if not brut:
        return [], []
    jetons = [j for j in re.split(r"[,\s]+", brut) if j]
    valides = []
    invalides = []
    for jeton in jetons:
        nettoye = jeton[1:] if jeton.startswith("+") else jeton
        if _TAG_VALIDE.match(nettoye):
            valides.append(nettoye)
        else:
            invalides.append(jeton)
    return valides, invalides


# --- Fonction principale -------------------------------------------------------

def analyser(texte_csv, taches_existantes):
    lignes = _lignes_physiques(texte_csv)
    erreurs = []

    if not lignes:
        return ResultatAnalyse([], [], [])

    entete = lignes[0]
    champ_par_position = {}
    a_description = False
    for position, nom_colonne in enumerate(entete):
        nom_normalise = nom_colonne.strip().lower()
        champ = _ALIAS_COLONNES.get(nom_normalise)
        if champ is None:
            erreurs.append({
                "ligne": 1,
                "colonne": nom_colonne,
                "message": f"Colonne non reconnue : {nom_colonne}",
            })
            continue
        champ_par_position[position] = champ
        if champ == "description":
            a_description = True

    if not a_description:
        erreurs.append({
            "ligne": 1,
            "colonne": "description",
            "message": "Colonne description manquante",
        })

    champs_presents = set(champ_par_position.values())

    # --- Passe 1 : identite de chaque ligne non vide -------------------------
    enregistrements = []
    for indice, ligne in enumerate(lignes[1:], start=2):
        if not ligne or all(cellule.strip() == "" for cellule in ligne):
            continue
        valeurs = {}
        for position, cellule in enumerate(ligne):
            champ = champ_par_position.get(position)
            if champ is None:
                continue
            valeurs[champ] = cellule

        ref = (valeurs.get("ref") or "").strip() or None
        description = valeurs.get("description", "")
        projet = (valeurs.get("project") or "").strip()
        cle_identite = ref if ref else description
        uuid_ligne = str(uuid.uuid5(NAMESPACE, f"{projet}/{cle_identite}"))

        enregistrements.append({
            "ligne": indice,
            "valeurs": valeurs,
            "ref": ref,
            "description": description,
            "projet": projet,
            "uuid": uuid_ligne,
        })

    # Table des refs explicites -> uuid (pour la resolution de depend_de).
    table_refs = {}
    for enr in enregistrements:
        if enr["ref"]:
            table_refs.setdefault(enr["ref"], enr["uuid"])

    # Doublons d'identite dans le fichier.
    vues = {}
    for enr in enregistrements:
        if enr["uuid"] in vues:
            erreurs.append({
                "ligne": enr["ligne"],
                "colonne": "ref" if enr["ref"] else "description",
                "message": "Ligne dupliquee (meme identite qu'une ligne precedente)",
            })
            enr["duplique"] = True
        else:
            vues[enr["uuid"]] = enr["ligne"]
            enr["duplique"] = False

    # Index des taches existantes par uuid, pour la fusion.
    existantes_par_uuid = {t["uuid"]: t for t in taches_existantes if "uuid" in t}

    taches = []
    aretes = []
    ligne_par_uuid = {}  # uuid de ligne de fichier -> numero de ligne
    aretes_pour_cycles = []  # (de, vers) valides, pour la detection de cycles

    uuid_ligne_precedente = None

    for enr in enregistrements:
        ligne_par_uuid[enr["uuid"]] = enr["ligne"]

        if enr["duplique"]:
            uuid_ligne_precedente = enr["uuid"]
            continue

        valeurs = enr["valeurs"]
        erreurs_ligne = []

        existante = existantes_par_uuid.get(enr["uuid"])
        fusion = dict(existante) if existante else {}
        fusion["uuid"] = enr["uuid"]

        # Champs texte simples.
        for champ in _CHAMPS_TEXTE:
            if champ not in champs_presents:
                continue
            cellule = valeurs.get(champ, "").strip()
            if not cellule:
                fusion.pop(champ, None)
            else:
                fusion[champ] = cellule

        # estTime.
        if "estTime" in champs_presents:
            cellule = valeurs.get("estTime", "").strip()
            if not cellule:
                fusion.pop("estTime", None)
            else:
                try:
                    fusion["estTime"] = _normaliser_duree(cellule)
                except _ErreurCellule as exc:
                    erreurs_ligne.append({"ligne": enr["ligne"], "colonne": exc.colonne, "message": exc.message})

        # due.
        if "due" in champs_presents:
            cellule = valeurs.get("due", "").strip()
            if not cellule:
                fusion.pop("due", None)
            else:
                try:
                    fusion["due"] = _normaliser_date(cellule, "due")
                except _ErreurCellule as exc:
                    erreurs_ligne.append({"ligne": enr["ligne"], "colonne": exc.colonne, "message": exc.message})

        # scheduled -- cellule vide = etat du planning conserve (pas de pop),
        # sinon chaque reimport effacerait le planning (y compris les +fixed).
        if "scheduled" in champs_presents:
            cellule = valeurs.get("scheduled", "").strip()
            if cellule:
                try:
                    fusion["scheduled"] = _normaliser_date(cellule, "scheduled")
                except _ErreurCellule as exc:
                    erreurs_ligne.append({"ligne": enr["ligne"], "colonne": exc.colonne, "message": exc.message})

        # tags -- le tag "fixed" est toujours conserve s'il etait present.
        fige_avant = "fixed" in (existante.get("tags", []) if existante else [])
        if "tags" in champs_presents:
            cellule = valeurs.get("tags", "").strip()
            if not cellule:
                fusion["tags"] = ["fixed"] if fige_avant else []
                if not fusion["tags"]:
                    fusion.pop("tags", None)
            else:
                valides, invalides = _parser_tags(cellule)
                for jeton in invalides:
                    erreurs_ligne.append({
                        "ligne": enr["ligne"],
                        "colonne": "tags",
                        "message": f"Tag invalide : {jeton!r}",
                    })
                tags_finaux = list(dict.fromkeys(valides))  # dedoublonne, ordre conserve
                if fige_avant and "fixed" not in tags_finaux:
                    tags_finaux.append("fixed")
                fusion["tags"] = tags_finaux

        # depend_de.
        if "depends" in champs_presents:
            cellule = valeurs.get("depends", "").strip()
            if not cellule:
                fusion.pop("depends", None)
            else:
                jetons = [j.strip() for j in cellule.split(",") if j.strip()]
                predecesseurs = []
                for jeton in jetons:
                    if jeton == "^":
                        if uuid_ligne_precedente is None:
                            erreurs_ligne.append({
                                "ligne": enr["ligne"], "colonne": "depend_de",
                                "message": "'^' sans ligne precedente",
                            })
                            continue
                        cible = uuid_ligne_precedente
                    elif jeton in table_refs:
                        cible = table_refs[jeton]
                    else:
                        candidats = [
                            u for u in existantes_par_uuid
                            if u.lower().startswith(jeton.lower())
                            and existantes_par_uuid[u].get("status") != "deleted"
                        ]
                        if len(candidats) == 1:
                            cible = candidats[0]
                        elif len(candidats) > 1:
                            erreurs_ligne.append({
                                "ligne": enr["ligne"], "colonne": "depend_de",
                                "message": f"Prefixe ambigu : {jeton!r}",
                            })
                            continue
                        else:
                            erreurs_ligne.append({
                                "ligne": enr["ligne"], "colonne": "depend_de",
                                "message": f"Reference inconnue : {jeton!r}",
                            })
                            continue

                    if cible == enr["uuid"]:
                        erreurs_ligne.append({
                            "ligne": enr["ligne"], "colonne": "depend_de",
                            "message": "Une tache ne peut pas dependre d'elle-meme",
                        })
                        continue

                    predecesseurs.append(cible)
                    aretes.append({"de": cible, "vers": enr["uuid"]})
                    aretes_pour_cycles.append((cible, enr["uuid"]))

                predecesseurs = list(dict.fromkeys(predecesseurs))
                if predecesseurs:
                    fusion["depends"] = predecesseurs
                else:
                    fusion.pop("depends", None)

        uuid_ligne_precedente = enr["uuid"]

        erreurs.extend(erreurs_ligne)
        taches.append(fusion)

    # Cycles impliquant l'existant : on ajoute les aretes propres aux
    # dependances deja enregistrees sur les taches existantes.
    for t in taches_existantes:
        u = t.get("uuid")
        if not u:
            continue
        for dep in _deps_existantes(t):
            aretes_pour_cycles.append((dep, u))

    erreurs.extend(_detecter_cycles(aretes_pour_cycles, ligne_par_uuid))

    return ResultatAnalyse(taches, erreurs, aretes)


def _deps_existantes(tache):
    """Meme convention que main_fastapi._parse_depends : liste ou chaine."""
    brut = tache.get("depends")
    if not brut:
        return []
    if isinstance(brut, list):
        return brut
    if isinstance(brut, str):
        return [u.strip() for u in brut.split(",") if u.strip()]
    return []


def _detecter_cycles(aretes, ligne_par_uuid):
    graphe = {}
    for de, vers in aretes:
        graphe.setdefault(de, []).append(vers)

    couleur = {}
    erreurs = []
    cycles_signales = set()

    def dfs(noeud, pile):
        couleur[noeud] = 1
        pile.append(noeud)
        for suivant in graphe.get(noeud, []):
            etat = couleur.get(suivant, 0)
            if etat == 0:
                dfs(suivant, pile)
            elif etat == 1:
                indice = pile.index(suivant)
                cycle_noeuds = pile[indice:]
                cle = frozenset(cycle_noeuds)
                if cle not in cycles_signales:
                    cycles_signales.add(cle)
                    lignes = sorted(
                        ligne_par_uuid[n] for n in cycle_noeuds if n in ligne_par_uuid
                    )
                    if lignes:
                        message = "Cycle de dependances detecte (lignes {})".format(
                            ", ".join(str(l) for l in lignes)
                        )
                    else:
                        message = "Cycle de dependances detecte"
                    erreurs.append({
                        "ligne": lignes[0] if lignes else 0,
                        "colonne": "depend_de",
                        "message": message,
                    })
        pile.pop()
        couleur[noeud] = 2

    for noeud in list(graphe.keys()):
        if couleur.get(noeud, 0) == 0:
            dfs(noeud, [])

    return erreurs
