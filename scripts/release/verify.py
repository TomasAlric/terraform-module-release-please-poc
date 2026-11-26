"""Verify a Release Please candidate using read-only repository and Actions data."""
import argparse
import json
import os
import re
import subprocess

REPO = "TomasAlric/terraform-module-release-please-poc"
BRANCH = "release-please--branches--main"
CI_POLICY = {
    ".github/workflows/ci.yml": "eb8727117b6c6c57ccad6edaa7c795c3e518e81e",
    "scripts/certify.sh": "ce110163a3aa0dee9fe0261bf4ae7fdf54e1b658",
}


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def api(path):
    return json.loads(command("gh", "api", f"repos/{REPO}/{path}"))


def require(condition, message):
    if not condition:
        raise SystemExit(f"Certification denied: {message}")


def verify(merge, tag, number):
    require(re.fullmatch(r"v\d+\.\d+\.\d+", tag) and re.fullmatch(r"[0-9a-f]{40}", merge),
            "invalid release coordinates")
    pr = api(f"pulls/{number}")
    head = pr["head"]["sha"]
    require(pr["merged"] and pr["merge_commit_sha"] == merge and pr["base"]["ref"] == "main"
            and pr["head"]["ref"] == BRANCH and pr["head"]["repo"]["full_name"] == REPO
            and pr["user"]["id"] == 82914085, "unexpected pull request or merge SHA")
    command("git", "merge-base", "--is-ancestor", merge, "HEAD")
    rules = api("rules/branches/main")
    checks = [r["parameters"] for r in rules if r["type"] == "required_status_checks"]
    require(any(r["type"] == "pull_request" for r in rules) and any(
        c["strict_required_status_checks_policy"] and
        {"context": "Terraform certification", "integration_id": 15368} in c["required_status_checks"]
        for c in checks), "main requires a protected PR and the strict Actions check")
    for path, blob in CI_POLICY.items():
        require(command("git", "rev-parse", f"{merge}:{path}") == blob, f"unreviewed CI policy: {path}")
    version = json.loads(command("git", "show", f"{merge}:.release-please-manifest.json"))
    require(version == {".": tag[1:]}, "manifest mismatch")
    runs = api(f"actions/workflows/ci.yml/runs?head_sha={head}&event=pull_request&per_page=1")
    require(runs["workflow_runs"], "missing candidate CI")
    run = runs["workflow_runs"][0]
    run_id, attempt = run["id"], run["run_attempt"]
    expected = os.getenv("EXPECTED_CERTIFICATION_RUN")
    require(not expected or str(run_id) == expected, "run differs from required evidence")
    require(run["conclusion"] == "success" and run["head_sha"] == head
            and run["path"] == ".github/workflows/ci.yml" and run["head_branch"] == BRANCH
            and run["head_repository"]["full_name"] == REPO, "CI identity or result mismatch")
    jobs = api(f"actions/runs/{run_id}/attempts/{attempt}/jobs")["jobs"]
    matches = [j for j in jobs if j["name"] == "Terraform certification"]
    require(len(matches) == 1, "missing or ambiguous certification job")
    job = matches[0]
    require(job["conclusion"] == "success" and job["head_sha"] == head
            and job["completed_at"] <= pr["merged_at"], "current attempt did not certify before merge")
    log = command("gh", "run", "view", str(run_id), "--repo", REPO, "--attempt", str(attempt), "--log")
    def logged_sha(step):
        matches = re.findall(r"^Terraform certification\t" + step + r"\t[0-9T:Z.-]+ ([a-f0-9]{40})$", log, re.M)
        require(len(matches) == 1, "missing or ambiguous SHA in certification log")
        return matches[0]
    synthetic = logged_sha(r"Run actions/checkout@[a-f0-9]{40}")
    tree = logged_sha(r'Run echo "Terraform 1\.6\.6[^\t]*')
    tested = api(f"git/commits/{synthetic}")
    base = command("git", "rev-parse", merge + "^")
    require([p["sha"] for p in tested["parents"]] == [base, head], "different tested base or head")
    require(tested["tree"]["sha"] == tree == command("git", "rev-parse", merge + "^{tree}"),
            "published content differs from tested tree")
    return dict(repository=REPO, version=tag[1:], pull_request=number, candidate_head=head,
                certified_tree=tree, merge_commit=merge, tested_merge=synthetic, base=base,
                run_id=run_id, attempt=attempt, job_id=job["id"], result="success",
                policy_version=1, certified_at=job["completed_at"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("merge")
    parser.add_argument("tag")
    parser.add_argument("number", type=int)
    args = parser.parse_args()
    print(json.dumps(verify(args.merge, args.tag, args.number)))
