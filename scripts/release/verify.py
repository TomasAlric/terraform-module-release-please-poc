"""Verify a Release Please candidate using read-only repository and Actions data."""
import argparse
import hashlib
import json
import os
import re
import subprocess

REPO = "TomasAlric/terraform-module-release-please-poc"
BRANCH = "release-please--branches--main"
CI_POLICY = {
    "scripts/release/baseline.cjs": "0b5c25d9a60b267933eaf253ef4b7eae981a7103",
    "scripts/release/preview.cjs": "0abc075e738774dbb61dbba021698213efea112c",
    ".github/workflows/ci.yml": "7cee3eda812844af81096e9308973ae4ac471d3b",
    "scripts/certify.sh": "062e851fab50d0e46c7c639522affd663a078c31",
    "scripts/certify/analyze-plan.py": "e28894b8fbead601723aac633821755838556dc1",
    "scripts/certify/run-day0.sh": "e91c0476925caae04143f8879e080cc3ac22ead1",
    "scripts/certify/run-day2.sh": "05aee70781fc88d3c4469fe555e5515bfb40011d",
    "scripts/certify/aggregate-gate.py": "0b9d32d9e6ba6418ddde1d9853e54d1dfd2e0745",
}
REQUIRED_JOBS = {
    "Release Version Preview & Candidate",
    "Terraform Contract Tests",
    "Fresh Installation Certification",
    "Consumer Upgrade & Impact Analysis",
    "Terraform certification",
}
REQUIRED_CERT_KEYS = (
    "result",
    "fresh_installation",
    "consumer_upgrade",
    "terraform_contracts",
    "upgrade_impact_policy",
    "post_upgrade_idempotency",
    "cleanup",
)


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
    by_name = {j["name"]: j for j in jobs}
    require(len(by_name) == len(jobs), "ambiguous job identities")
    for req_name in REQUIRED_JOBS:
        require(req_name in by_name, f"missing mandatory certification job: {req_name}")
        j = by_name[req_name]
        require(j["conclusion"] == "success" and j["head_sha"] == head
                and j["completed_at"] <= pr["merged_at"], f"job '{req_name}' did not certify before merge")
    matches = [j for j in jobs if j["name"] == "Terraform certification"]
    require(len(matches) == 1, "missing or ambiguous certification job")
    job = matches[0]
    log = command("gh", "run", "view", str(run_id), "--repo", REPO, "--attempt", str(attempt), "--log")

    def logged_sha(step):
        found = re.findall(r"^Terraform certification\t" + step + r"\t[0-9T:Z.-]+ ([a-f0-9]{40})$", log, re.M)
        require(len(found) == 1, "missing or ambiguous SHA in certification log")
        return found[0]

    synthetic = logged_sha(r"Run actions/checkout@[a-f0-9]{40}")
    tree = logged_sha(r'Run echo "Terraform 1\.6\.6[^\t]*')
    tested = api(f"git/commits/{synthetic}")
    base = command("git", "rev-parse", merge + "^")
    require([p["sha"] for p in tested["parents"]] == [base, head], "different tested base or head")
    require(tested["tree"]["sha"] == tree == command("git", "rev-parse", merge + "^{tree}"),
            "published content differs from tested tree")

    ev_matches = re.findall(r"^Terraform certification\tEvaluate Infrastructure Certification Gate\t[0-9T:Z.-]+ CERTIFICATION_EVIDENCE_JSON=(\{[^\r\n]+\})$", log, re.M)
    require(len(ev_matches) == 1, "missing or ambiguous CERTIFICATION_EVIDENCE_JSON in log")
    evidence = json.loads(ev_matches[0])
    require(evidence.get("repository") == REPO and int(evidence.get("pr_number", 0)) == number,
            "evidence repository or pull request mismatch")
    require(evidence.get("version") == tag[1:], "evidence predicted version does not match release tag")
    metadata = json.dumps([pr["title"].strip(), (pr["body"] or "").strip()], ensure_ascii=False, separators=(",", ":"))
    require(evidence.get("metadata_digest") == hashlib.sha256(metadata.encode()).hexdigest(), "PR metadata changed")
    require(evidence.get("policy_version") == 3 and evidence.get("workflow_run_id") == str(run_id)
            and evidence.get("attempt") == str(attempt) and evidence.get("evidence_reuse", {}).get("reused") is False,
            "run, attempt, policy or fresh evidence mismatch")
    rc = evidence.get("release_candidate", {})
    require(rc.get("reference") and rc.get("tree_sha") == tree and rc.get("head_sha") == head,
            "evidence release candidate coordinates mismatch")
    cert = evidence.get("certification", {})
    for k in REQUIRED_CERT_KEYS:
        require(cert.get(k) == "PASS", f"certification check '{k}' did not PASS")

    rc_tag_ref = f"refs/tags/{rc['reference']}"
    remote_rc = command("git", "ls-remote", "origin", rc_tag_ref)
    require(rc.get("tested_sha") == synthetic and rc.get("base_sha") == base
            and rc.get("commit_sha") in {synthetic, head}
            and command("git", "rev-parse", rc["commit_sha"] + "^{tree}") == tree,
            "candidate content or tested revision mismatch")
    require(rc["reference"].startswith(f"{tag}-rc.pr{number}.{head[:7]}"), "unexpected candidate reference")
    require(remote_rc.split() == [rc["commit_sha"], rc_tag_ref], f"release candidate tag {rc['reference']} not found on origin")

    return dict(
        repository=REPO,
        version=tag[1:],
        previous_stable_version=evidence.get("previous_stable_version"),
        pull_request=number,
        candidate_head=head,
        certified_tree=tree,
        merge_commit=merge,
        tested_merge=synthetic,
        base=base,
        run_id=run_id,
        attempt=attempt,
        job_id=job["id"],
        result="success",
        policy_version=3,
        certified_at=job["completed_at"],
        release_candidate=dict(
            reference=rc["reference"],
            commit_sha=rc["commit_sha"],
            tree_sha=tree,
            head_sha=head,
            base_sha=base,
            tested_sha=synthetic,
        ),
        certification=cert,
        upgrade_impact=evidence.get("upgrade_impact", {"create": 0, "update": 0, "replace": 0, "delete": 0}),
        equivalence_fingerprint=evidence.get("equivalence_fingerprint"),
        evidence_reuse=evidence.get("evidence_reuse"),
        publication=dict(
            release_pr=number,
            published_sha=merge,
            certified_tree=tree,
            workflow_run_id=str(run_id),
            policy_version="3.0",
        ),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("merge")
    parser.add_argument("tag")
    parser.add_argument("number", type=int)
    args = parser.parse_args()
    print(json.dumps(verify(args.merge, args.tag, args.number)))
