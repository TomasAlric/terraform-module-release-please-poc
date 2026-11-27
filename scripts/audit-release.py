"""Uso: python3 scripts/audit-release.py TAG PR RUN_ID (checkout com gh autenticado)."""
import base64
import json
import re
import subprocess
import sys

tag, pull_number, run_id = sys.argv[1:]
repo = "TomasAlric/terraform-module-release-please-poc"


def github(*args):
    return subprocess.check_output(["gh", *args], text=True)


def api(path):
    return json.loads(github("api", f"repos/{repo}/{path}"))


def at_tag(path):
    content = api(f"contents/{path}?ref={tag}")
    return base64.b64decode(content["content"]).decode()


pr = api(f"pulls/{pull_number}")
release = api(f"releases/tags/{tag}")
commit = api(f"commits/{tag}")
run = api(f"actions/runs/{run_id}")
assert pr["merged"] and pr["merge_commit_sha"] == commit["sha"]
assert run["path"] == ".github/workflows/ci.yml" and run["event"] == "pull_request"
assert run["conclusion"] == "success" and run["head_sha"] == pr["head"]["sha"]
assert json.loads(at_tag(".release-please-manifest.json"))["."] == tag[1:]
changelog = at_tag("CHANGELOG.md")
assert tag[1:] in changelog and release["body"].strip()
owner = "TomasAlric"
bot = "github-actions[bot]"
# PR 12 was opened before the PAT migration and published afterwards.
legacy = {"v6.2.0": (1, owner, owner), "v6.2.1": (3, bot, bot),
          "v6.3.0": (8, bot, bot), "v7.0.0": (12, bot, owner)}
number, pr_author, publisher = legacy.get(tag, (int(pull_number), owner, owner))
assert pr["number"] == number and pr["user"]["login"] == pr_author
assert release["author"]["login"] == publisher
if tag != "v6.2.0":
    assert pr["base"]["ref"] == "main" and pr["head"]["ref"] == "release-please--branches--main"
    assert release["body"].strip() in changelog
tree = commit["commit"]["tree"]["sha"]
log = github("run", "view", run_id, "--repo", repo, "--log")
assert re.search(r"\t[0-9ZT:.-]+ " + tree + r"\s*$", log, re.MULTILINE)
result = {
    "tag": tag,
    "commit": commit["sha"],
    "tree": tree,
    "certified_head": run["head_sha"],
    "pr_author": pr_author,
    "publisher": publisher,
    "ci_actor": run["actor"]["login"],
    "candidate_commit_author": api(f"commits/{run['head_sha']}")["commit"]["author"]["name"],
    "pr": pr["html_url"],
    "ci": run["html_url"],
    "release": release["html_url"],
}
if any(a["name"] == "certification.json" for a in release.get("assets", [])):
    cert_raw = github("release", "download", tag, "--repo", repo, "--pattern", "certification.json", "--output", "-")
    cert_doc = json.loads(cert_raw)
    assert cert_doc["certified_tree"] == tree and cert_doc["merge_commit"] == commit["sha"]
    if cert_doc.get("policy_version", 1) >= 2:
        c = cert_doc["certification"]
        assert c["result"] == "PASS" and c["fresh_installation"] == "PASS" and c["consumer_upgrade"] == "PASS"
        assert c["terraform_contracts"] == "PASS" and c["upgrade_impact_policy"] == "PASS"
        assert c["post_upgrade_idempotency"] == "PASS" and c["cleanup"] == "PASS"
        result["release_candidate"] = cert_doc["release_candidate"]["reference"]
        result["upgrade_impact"] = cert_doc["upgrade_impact"]
        result["policy_version"] = cert_doc["policy_version"]
print(json.dumps(result))
