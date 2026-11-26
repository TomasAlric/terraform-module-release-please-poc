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
if tag != "v6.2.0":
    assert pr["user"]["login"] == "github-actions[bot]"
    assert release["body"].strip() in changelog
tree = commit["commit"]["tree"]["sha"]
log = github("run", "view", run_id, "--repo", repo, "--log")
assert re.search(r"\t[0-9ZT:.-]+ " + tree + r"\s*$", log, re.MULTILINE)
print(json.dumps({"tag": tag, "commit": commit["sha"], "tree": tree, "certified_head": run["head_sha"],
                  "pr": pr["html_url"], "ci": run["html_url"], "release": release["html_url"]}))
