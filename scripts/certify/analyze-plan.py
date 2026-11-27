#!/usr/bin/env python3
"""Phase 5: Deterministic Terraform Plan JSON Upgrade Impact Analyzer."""
import argparse
import json
import sys

CRITICAL_RESOURCES = {
    "module.cluster.terraform_data.cluster",
    "terraform_data.data_integrity_marker",
}

REQUIRED_CONTRACT_KEYS = {
    "addon_channels",
    "addon_owners",
    "addons",
    "architecture",
    "bottlerocket_version",
    "capacity_type",
    "name",
    "tags",
    "version",
}


def classify_actions(actions):
    if actions == ["no-op"] or actions == ["read"]:
        return "no_op"
    if actions == ["create"]:
        return "create"
    if actions == ["update"]:
        return "update"
    if actions == ["delete"]:
        return "delete"
    if set(actions) == {"create", "delete"} and len(actions) == 2:
        return "replace"
    return "unknown"


def is_critical_resource(address, resource_type, resource_name):
    if address in CRITICAL_RESOURCES:
        return True
    if address.startswith("module.cluster.") and resource_type == "terraform_data" and resource_name in {"cluster", "persistent_state"}:
        return True
    return False


def analyze_plan(plan, scenario, stable_version, candidate_ref, release_type, declared_breaking, migration_doc_present):
    counts = {
        "create": 0,
        "update": 0,
        "replace": 0,
        "delete": 0,
        "no_op": 0,
    }
    resource_details = []
    violations = []
    critical_preservation = "PASS"
    contract_compatibility = "PASS"

    for rc in plan.get("resource_changes", []):
        address = rc.get("address", "")
        rtype = rc.get("type", "")
        rname = rc.get("name", "")
        change = rc.get("change", {})
        actions = change.get("actions", [])
        action_class = classify_actions(actions)
        if action_class in counts:
            counts[action_class] += 1
        else:
            violations.append(f"UNKNOWN_PLAN_ACTION: Resource '{address}' has unrecognized actions {actions}")

        critical = is_critical_resource(address, rtype, rname)
        replace_paths = change.get("replace_paths", [])

        resource_details.append({
            "address": address,
            "action": action_class,
            "critical": critical,
            "replace_paths": replace_paths,
        })

        if critical and action_class == "replace":
            critical_preservation = "FAIL"
            violations.append(
                f"CRITICAL_REPLACE_BLOCKED: Critical resource '{address}' scheduled for replacement "
                f"(actions={actions}, replace_paths={replace_paths}) in scenario '{scenario}'. "
                f"Replacement of critical stateful infrastructure is blocked before apply."
            )
        elif critical and action_class == "delete":
            critical_preservation = "FAIL"
            violations.append(
                f"CRITICAL_DELETE_BLOCKED: Critical resource '{address}' scheduled for deletion in scenario '{scenario}'."
            )
        elif not critical and action_class in {"replace", "delete"}:
            critical_preservation = "FAIL"
            violations.append(
                f"UNAUTHORIZED_DESTRUCTIVE_CHANGE: Resource '{address}' scheduled for '{action_class}' without migration authorization."
            )

    # Public contract verification from planned_values and prior_state
    prior_outputs = (
        plan.get("prior_state", {})
        .get("values", {})
        .get("outputs", {})
    )
    planned_outputs = (
        plan.get("planned_values", {})
        .get("outputs", {})
    )
    output_changes = plan.get("output_changes", {})

    cluster_out_change = output_changes.get("cluster", {})
    if "delete" in cluster_out_change.get("actions", []) and "create" not in cluster_out_change.get("actions", []):
        contract_compatibility = "FAIL"
        violations.append("CONTRACT_DELETED: Public output 'cluster' is being deleted in plan.")

    prior_cluster = prior_outputs.get("cluster", {}).get("value")
    planned_cluster = planned_outputs.get("cluster", {}).get("value")
    if planned_cluster is None and cluster_out_change.get("after") is not None:
        planned_cluster = cluster_out_change.get("after")

    if not isinstance(planned_cluster, dict):
        contract_compatibility = "FAIL"
        violations.append(f"CONTRACT_INVALID_TYPE: Planned output 'cluster' is not an object in scenario '{scenario}'.")
    else:
        missing_keys = sorted(REQUIRED_CONTRACT_KEYS - set(planned_cluster.keys()))
        if missing_keys:
            contract_compatibility = "FAIL"
            violations.append(
                f"CONTRACT_MISSING_KEYS: Public output 'cluster' is missing required keys {missing_keys} in scenario '{scenario}'."
            )
        if isinstance(prior_cluster, dict):
            if planned_cluster.get("name") != prior_cluster.get("name"):
                contract_compatibility = "FAIL"
                violations.append(
                    f"CONTRACT_IDENTITY_DRIFT: Cluster name changed from '{prior_cluster.get('name')}' to '{planned_cluster.get('name')}'."
                )
        if planned_cluster.get("architecture") not in {"x86_64", "arm64"}:
            contract_compatibility = "FAIL"
            violations.append(
                f"CONTRACT_INVALID_ARCHITECTURE: Expected canonical 'x86_64' or 'arm64', got '{planned_cluster.get('architecture')}'."
            )
        if planned_cluster.get("capacity_type") not in {"ON_DEMAND", "SPOT"}:
            contract_compatibility = "FAIL"
            violations.append(
                f"CONTRACT_INVALID_CAPACITY: Expected 'ON_DEMAND' or 'SPOT', got '{planned_cluster.get('capacity_type')}'."
            )

    if declared_breaking and not migration_doc_present:
        contract_compatibility = "FAIL"
        violations.append(
            "MISSING_MIGRATION_DOCUMENTATION: Breaking change declared, but no migration documentation was provided."
        )

    upgrade_authorization = (
        "PASS"
        if critical_preservation == "PASS" and contract_compatibility == "PASS" and len(violations) == 0
        else "FAIL"
    )

    return {
        "scenario": scenario,
        "stable_version": stable_version,
        "candidate_ref": candidate_ref,
        "release_type": release_type,
        "declared_breaking": declared_breaking,
        "counts": counts,
        "critical_resource_preservation": critical_preservation,
        "contract_compatibility": contract_compatibility,
        "upgrade_authorization": upgrade_authorization,
        "resources": resource_details,
        "violations": violations,
        "ai_risk_assessment_extension": {
            "enabled": False,
            "schema_version": "1.0",
            "hook_point": "post_plan_deterministic_gate",
            "deterministic_authority": True,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan-json", required=True)
    parser.add_argument("--scenario", required=True)
    parser.add_argument("--stable-version", required=True)
    parser.add_argument("--candidate-ref", required=True)
    parser.add_argument("--release-type", default="PATCH")
    parser.add_argument("--declared-breaking", default="false")
    parser.add_argument("--migration-doc-present", default="true")
    parser.add_argument("--output-json", required=True)
    args = parser.parse_args()

    with open(args.plan_json, "r", encoding="utf-8") as f:
        plan = json.load(f)

    result = analyze_plan(
        plan=plan,
        scenario=args.scenario,
        stable_version=args.stable_version,
        candidate_ref=args.candidate_ref,
        release_type=args.release_type,
        declared_breaking=args.declared_breaking.lower() == "true",
        migration_doc_present=args.migration_doc_present.lower() == "true",
    )

    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        f.write("\n")

    print(json.dumps(result))
    if result["upgrade_authorization"] != "PASS":
        sys.exit(2)


if __name__ == "__main__":
    main()
