#!/usr/bin/env python3
"""Phase 6: Infrastructure Certification Aggregator Gate."""
import argparse
import json
import os
import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def load_json(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview-json", required=True)
    parser.add_argument("--contracts-json", required=True)
    parser.add_argument("--day0-json", required=True)
    parser.add_argument("--day2-json", required=True)
    parser.add_argument("--prepare-result", required=True)
    parser.add_argument("--contracts-result", required=True)
    parser.add_argument("--day0-result", required=True)
    parser.add_argument("--day2-result", required=True)
    parser.add_argument("--expected-head-sha", required=True)
    parser.add_argument("--expected-tested-sha", required=True)
    parser.add_argument("--output-json", required=True)
    args = parser.parse_args()

    failures = []
    incompatibilities = []

    preview = load_json(args.preview_json)
    contracts = load_json(args.contracts_json)
    day0 = load_json(args.day0_json)
    day2 = load_json(args.day2_json)

    # 1. Check mandatory job results (no skipped, cancelled, or failed jobs allowed)
    job_results = {
        "prepare_candidate": args.prepare_result,
        "contract_tests": args.contracts_result,
        "fresh_installation": args.day0_result,
        "consumer_upgrade": args.day2_result,
    }
    for job_name, res in job_results.items():
        if res != "success":
            failures.append(f"Mandatory job '{job_name}' did not succeed (status: {res}).")

    # 2. Check evidence presence
    if not preview:
        failures.append("Missing mandatory Release Version Preview & Candidate evidence (preview.json).")
    if not contracts:
        failures.append("Missing mandatory Terraform Contract Tests evidence (contracts.json).")
    if not day0:
        failures.append("Missing mandatory Fresh Installation (Day 0) evidence (day0.json).")
    if not day2:
        failures.append("Missing mandatory Consumer Upgrade (Day 2) evidence (day2.json).")

    current_tree = git("rev-parse", "HEAD^{tree}")
    current_main = git("rev-parse", "origin/main")

    if preview:
        # 3. Verify revision & tree identity
        if preview.get("head_sha") != args.expected_head_sha:
            failures.append(
                f"Candidate head_sha ({preview.get('head_sha')}) does not match PR head ({args.expected_head_sha})."
            )
        if preview.get("tested_sha") != args.expected_tested_sha:
            failures.append(
                f"Candidate tested_sha ({preview.get('tested_sha')}) does not match current merge commit ({args.expected_tested_sha})."
            )
        if preview.get("tree_sha") != current_tree:
            failures.append(
                f"Candidate tree_sha ({preview.get('tree_sha')}) does not match current checkout tree ({current_tree})."
            )
        # 4. Verify base branch has not advanced / is not stale
        if preview.get("base_stale") or preview.get("base_sha") != current_main:
            failures.append(
                preview.get("stale_reason")
                or f"Base branch main advanced to {current_main} (candidate tested against {preview.get('base_sha')})."
            )
        try:
            subprocess.check_call(["git", "merge-base", "--is-ancestor", current_main, args.expected_head_sha])
        except subprocess.CalledProcessError:
            failures.append(
                f"PR head {args.expected_head_sha[:7]} is behind origin/main ({current_main[:7]}); strict recertification required."
            )

    # 5. Evaluate individual validation statuses
    st_contracts = "PASS" if (contracts and contracts.get("result") == "PASS" and args.contracts_result == "success") else "FAIL"
    st_fresh = "PASS" if (day0 and day0.get("fresh_installation") == "PASS" and args.day0_result == "success") else "FAIL"
    st_upgrade = "PASS" if (day2 and day2.get("consumer_upgrade") == "PASS" and args.day2_result == "success") else "FAIL"
    st_policy = "PASS" if (day2 and day2.get("upgrade_impact_policy") == "PASS") else "FAIL"
    st_idempotency = (
        "PASS"
        if (
            day0
            and day0.get("idempotency") == "PASS"
            and day2
            and day2.get("post_upgrade_idempotency") == "PASS"
        )
        else "FAIL"
    )
    st_cleanup = (
        "PASS"
        if (
            day0
            and day0.get("cleanup") == "PASS"
            and day2
            and day2.get("cleanup") == "PASS"
        )
        else "FAIL"
    )

    if contracts and contracts.get("failure_reason"):
        failures.append(contracts["failure_reason"])
        incompatibilities.append(contracts["failure_reason"])
    if day0 and day0.get("failure_reason"):
        failures.append(day0["failure_reason"])
    if day2 and day2.get("failure_reason"):
        failures.append(day2["failure_reason"])
    if day2 and day2.get("violations"):
        for v in day2["violations"]:
            if v not in failures:
                failures.append(v)
            incompatibilities.append(v)

    # Check CERTIFICATION_HOLD_VERSION gate from Phase 1 (preserved for regression compatibility)
    hold_version = os.getenv("CERTIFICATION_HOLD_VERSION", "").strip()
    source_branch = os.getenv("SOURCE_BRANCH", "").strip()
    if hold_version and source_branch.startswith("release-please--"):
        with open(".release-please-manifest.json", "r", encoding="utf-8") as mf:
            manifest_ver = json.load(mf).get(".")
        if manifest_ver == hold_version:
            failures.append(f"Release version {manifest_ver} held by CERTIFICATION_HOLD_VERSION policy variable.")

    overall = (
        "PASS"
        if (
            not failures
            and st_contracts == "PASS"
            and st_fresh == "PASS"
            and st_upgrade == "PASS"
            and st_policy == "PASS"
            and st_idempotency == "PASS"
            and st_cleanup == "PASS"
        )
        else "FAIL"
    )

    upgrade_impact = (
        day2.get("upgrade_impact", {"create": 0, "update": 0, "replace": 0, "delete": 0})
        if day2
        else {"create": 0, "update": 0, "replace": 0, "delete": 0}
    )
    upgrade_policy_details = (
        day2.get(
            "upgrade_policy_details",
            {
                "critical_resource_preservation": st_policy,
                "contract_compatibility": st_policy,
                "upgrade_authorization": st_policy,
            },
        )
        if day2
        else {
            "critical_resource_preservation": "FAIL",
            "contract_compatibility": "FAIL",
            "upgrade_authorization": "FAIL",
        }
    )

    report = {
        "repository": preview.get("repository") if preview else "TomasAlric/terraform-module-release-please-poc",
        "pr_number": preview.get("pr_number") if preview else 0,
        "version": preview.get("expected_next_version") if preview else None,
        "previous_stable_version": preview.get("current_stable_version") if preview else None,
        "release_candidate": {
            "reference": preview.get("candidate_tag") if preview else None,
            "commit_sha": preview.get("candidate_commit_sha") if preview else None,
            "head_sha": preview.get("head_sha") if preview else args.expected_head_sha,
            "base_sha": preview.get("base_sha") if preview else None,
            "tested_sha": preview.get("tested_sha") if preview else args.expected_tested_sha,
            "tree_sha": current_tree,
        },
        "certification": {
            "result": overall,
            "fresh_installation": st_fresh,
            "consumer_upgrade": st_upgrade,
            "terraform_contracts": st_contracts,
            "upgrade_impact_policy": st_policy,
            "post_upgrade_idempotency": st_idempotency,
            "cleanup": st_cleanup,
        },
        "upgrade_impact": upgrade_impact,
        "upgrade_policy_details": upgrade_policy_details,
        "equivalence_contract": preview.get("equivalence_contract") if preview else None,
        "equivalence_fingerprint": preview.get("equivalence_fingerprint") if preview else None,
        "evidence_reuse": preview.get("evidence_reuse") if preview else None,
        "detected_incompatibilities": incompatibilities,
        "failures": failures,
        "preview": preview,
    }

    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
        f.write("\n")

    # Emit single-line machine-verifiable evidence record to job log for pre-publication verify.py
    compact_evidence = {
        "repository": report["repository"],
        "pr_number": report["pr_number"],
        "version": report["version"],
        "previous_stable_version": report["previous_stable_version"],
        "release_candidate": report["release_candidate"],
        "certification": report["certification"],
        "upgrade_impact": report["upgrade_impact"],
        "equivalence_contract": report["equivalence_contract"],
        "equivalence_fingerprint": report["equivalence_fingerprint"],
        "evidence_reuse": report["evidence_reuse"],
    }
    print(f"CERTIFICATION_EVIDENCE_JSON={json.dumps(compact_evidence, separators=(',', ':'))}")

    if overall != "PASS":
        for fail in failures:
            print(f"::error::{fail}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
