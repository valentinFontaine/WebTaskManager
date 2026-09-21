#!/usr/bin/env python3
"""Smoke test HTTP contre l'etage staging (uvicorn + Taskwarrior 3.5.0 amont).

Bibliotheque standard uniquement (urllib, json) : aucune dependance externe,
pour pouvoir tourner sur Termux sans rien installer de plus que le venv de
staging deja pose par seed-staging.sh.

Contrairement a pytest (entierement mocke), ce script exerce le vrai binaire
`task` a travers l'API reelle, sur la base de staging (~/.task-staging).
C'est le seul etage qui valide ce comportement : Playwright ne peut pas
tourner sur Termux (cf. deploy.sh / AGENTS.md), donc la couche navigateur
reste couverte par l'etage dev-pc uniquement.

Usage :
    python staging-smoke.py [base_url]   # defaut : http://127.0.0.1:8765

Sortie : une ligne OK/ECHEC par verification, code de sortie non nul si une
verification a echoue.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE_URL = "http://127.0.0.1:8765"

checks_total = 0
checks_failed = 0


def report(name, ok, detail=""):
    global checks_total, checks_failed
    checks_total += 1
    if ok:
        print(f"OK     {name}")
    else:
        checks_failed += 1
        suffix = f" -- {detail}" if detail else ""
        print(f"ECHEC  {name}{suffix}")


def request(base_url, method, path, payload=None):
    """Fait un appel HTTP et renvoie (status_code, objet_json_ou_None, corps_brut)."""
    url = base_url.rstrip("/") + path
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        status = e.code
    try:
        parsed = json.loads(body) if body else None
    except json.JSONDecodeError:
        parsed = None
    return status, parsed, body


def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    print(f"Smoke test staging contre {base_url}")
    print("")

    # ------------------------------------------------------------------
    # GET /api/tasks : les taches +seed doivent etre retrouvees.
    # ------------------------------------------------------------------
    status, body, raw = request(base_url, "GET", "/api/tasks?status=pending")
    ok = status == 200 and isinstance(body, dict) and body.get("success") is True
    report("GET /api/tasks renvoie 200 + JSON success=true", ok, f"status={status} body={raw[:200]}")

    tasks = (body or {}).get("tasks") or []
    seed_tasks = [t for t in tasks if "seed" in (t.get("tags") or [])]
    report(
        "GET /api/tasks retrouve des taches +seed",
        len(seed_tasks) > 0,
        f"{len(tasks)} tache(s) au total, 0 avec le tag seed" if not seed_tasks else "",
    )

    # ------------------------------------------------------------------
    # GET /api/tasks/planned
    # ------------------------------------------------------------------
    status, body, raw = request(base_url, "GET", "/api/tasks/planned")
    ok = status == 200 and isinstance(body, dict) and body.get("success") is True
    report("GET /api/tasks/planned renvoie 200 + JSON success=true", ok, f"status={status} body={raw[:200]}")

    # ------------------------------------------------------------------
    # GET /api/projects : le projet hierarchique seme doit apparaitre.
    # ------------------------------------------------------------------
    status, body, raw = request(base_url, "GET", "/api/projects")
    ok = status == 200 and isinstance(body, dict) and body.get("success") is True
    report("GET /api/projects renvoie 200 + JSON success=true", ok, f"status={status} body={raw[:200]}")

    projects = (body or {}).get("projects") or []
    has_hierarchical = any(p.startswith("Maison.Cuisine") or p == "Maison" for p in projects)
    report(
        "GET /api/projects retrouve le projet hierarchique seme (Maison / Maison.Cuisine)",
        has_hierarchical,
        f"projets recus : {projects}",
    )

    # ------------------------------------------------------------------
    # GET /api/contexts, si la route existe.
    # ------------------------------------------------------------------
    status, body, raw = request(base_url, "GET", "/api/contexts")
    if status == 404:
        print("SKIP   GET /api/contexts (route absente)")
    else:
        ok = status == 200 and isinstance(body, dict) and body.get("success") is True
        report("GET /api/contexts renvoie 200 + JSON success=true", ok, f"status={status} body={raw[:200]}")
        contexts = (body or {}).get("contexts") or []
        report(
            "GET /api/contexts retrouve pro et perso",
            "pro" in contexts and "perso" in contexts,
            f"contextes recus : {contexts}",
        )

    # ------------------------------------------------------------------
    # POST /api/task/add avec une description accentuee, relecture puis
    # suppression -- pour rester idempotent. C'est le defaut historique du
    # projet (accents corrompus par argv/encodage sous Windows).
    # ------------------------------------------------------------------
    description_accentuee = "Vérifier les accents éàûôç en staging"
    status, body, raw = request(
        base_url, "POST", "/api/task/add",
        {"description": description_accentuee, "tags": ["seed-smoke"]},
    )
    add_ok = status == 200 and isinstance(body, dict) and body.get("success") is True
    report("POST /api/task/add (description accentuee) reussit", add_ok, f"status={status} body={raw[:300]}")

    created_task = (body or {}).get("task") or {}
    created_uuid = created_task.get("uuid")

    accents_ok = created_task.get("description") == description_accentuee
    report(
        "La description accentuee revient intacte dans la reponse d'ajout",
        accents_ok,
        f"recu : {created_task.get('description')!r}",
    )

    if created_uuid:
        status, body, raw = request(base_url, "GET", "/api/tasks?status=pending")
        reread_ok = False
        if status == 200 and isinstance(body, dict):
            for t in (body.get("tasks") or []):
                if t.get("uuid") == created_uuid:
                    reread_ok = t.get("description") == description_accentuee
                    break
        report(
            "La description accentuee reste intacte apres relecture par GET /api/tasks",
            reread_ok,
        )

        # Nettoyage : supprime la tache creee pour rester idempotent.
        status, body, raw = request(base_url, "DELETE", f"/api/task/{created_uuid}/delete")
        cleanup_ok = status == 200 and isinstance(body, dict) and body.get("success") is True
        report("Nettoyage : suppression de la tache de smoke test", cleanup_ok, f"status={status} body={raw[:200]}")
    else:
        report("Relecture + nettoyage de la tache accentuee", False, "pas d'UUID recu a l'ajout, etapes sautees")

    # ------------------------------------------------------------------
    # estTime invalide (1h30, rejete par Taskwarrior) : l'API doit renvoyer
    # success:false proprement, jamais un 500.
    # ------------------------------------------------------------------
    status, body, raw = request(
        base_url, "POST", "/api/task/add",
        {"description": "Tache avec estTime invalide (smoke test)", "estTime": "1h30"},
    )
    no_crash = status != 500
    report("POST /api/task/add avec estTime invalide ne provoque pas de 500", no_crash, f"status={status}")

    clean_failure = status == 200 and isinstance(body, dict) and body.get("success") is False
    report(
        "POST /api/task/add avec estTime invalide (1h30) est refuse proprement (success:false)",
        clean_failure,
        f"status={status} body={raw[:300]}",
    )

    # Si l'ajout invalide a malgre tout cree une tache (ne devrait pas arriver
    # vu clean_failure), on nettoie pour ne pas polluer la base de staging.
    if isinstance(body, dict) and body.get("success") is True:
        leaked_uuid = (body.get("task") or {}).get("uuid")
        if leaked_uuid:
            request(base_url, "DELETE", f"/api/task/{leaked_uuid}/delete")

    # ------------------------------------------------------------------
    # Bilan
    # ------------------------------------------------------------------
    print("")
    print(f"Total : {checks_total} verification(s), {checks_failed} echec(s).")
    if checks_failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
