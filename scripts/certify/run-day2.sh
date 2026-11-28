#!/usr/bin/env bash
# Phase 4 & 5: Consumer Upgrade Certification (Day 2) and Upgrade Impact Analysis on the same Terraform State.
set -euo pipefail

STABLE_TAG="${1:?Usage: run-day2.sh <stable_tag> <candidate_ref> <release_type> <declared_breaking> <migration_doc_present> <output_json> [repo_url]}"
CANDIDATE_REF="${2:?Usage: run-day2.sh <stable_tag> <candidate_ref> <release_type> <declared_breaking> <migration_doc_present> <output_json> [repo_url]}"
RELEASE_TYPE="${3:-PATCH}"
DECLARED_BREAKING="${4:-false}"
MIGRATION_DOC_PRESENT="${5:-true}"
OUTPUT_JSON="${6:?Usage: run-day2.sh <stable_tag> <candidate_ref> <release_type> <declared_breaking> <migration_doc_present> <output_json> [repo_url]}"
REPO_URL="${7:-https://github.com/TomasAlric/terraform-module-release-please-poc.git}"
REPO_ROOT="$(pwd)"

EXPECTED_MODULE_HASH="$(
  git rev-parse 'HEAD^{tree}'
)"

WORK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/day2-cert-XXXXXX")"
SCENARIOS=("defaults" "custom" "optional_features" "contract_evolution" "breaking_migration")

DAY2_STATUS="FAIL"
UPGRADE_POLICY_STATUS="PASS"
IDEMPOTENCY_STATUS="PASS"
CLEANUP_STATUS="PASS"
CRITICAL_PRESERVATION="PASS"
CONTRACT_COMPATIBILITY="PASS"
UPGRADE_AUTHORIZATION="PASS"
FAILURE_REASON=""
VIOLATIONS_JSON="[]"
SCENARIO_RESULTS="[]"
TOTAL_CREATE=0
TOTAL_UPDATE=0
TOTAL_REPLACE=0
TOTAL_DELETE=0

cleanup_day2() {
  local exit_code=$?
  for scenario in "${SCENARIOS[@]}"; do
    local dir="$WORK_ROOT/$scenario"
    if [[ -d "$dir" && -f "$dir/terraform.tfstate" ]]; then
      local remaining
      remaining="$(jq '.resources | length' "$dir/terraform.tfstate" 2>/dev/null || echo 1)"
      if [[ "$remaining" != "0" ]]; then
        if (cd "$dir" && terraform destroy -auto-approve -input=false >/dev/null 2>&1); then
          remaining="$(jq '.resources | length' "$dir/terraform.tfstate" 2>/dev/null || echo 1)"
        fi
      fi
      if [[ "$remaining" != "0" ]]; then
        CLEANUP_STATUS="FAIL"
        FAILURE_REASON="${FAILURE_REASON:-Cleanup left residual resources in scenario $scenario}"
      fi
    fi
    rm -rf "$dir"
  done
  rm -rf "$WORK_ROOT"
  if [[ "${SIMULATE_CLEANUP_FAILURE:-false}" == "true" ]]; then
    CLEANUP_STATUS="FAIL"
    FAILURE_REASON="Simulated cleanup failure triggered via SIMULATE_CLEANUP_FAILURE=true"
  fi
  if [[ "$exit_code" -ne 0 && "$DAY2_STATUS" == "PASS" ]]; then
    DAY2_STATUS="FAIL"
  fi
  if [[ "$CLEANUP_STATUS" != "PASS" || "$UPGRADE_POLICY_STATUS" != "PASS" || "$IDEMPOTENCY_STATUS" != "PASS" ]]; then
    DAY2_STATUS="FAIL"
  fi

  jq -n \
    --arg result "$DAY2_STATUS" \
    --arg consumer_upgrade "$DAY2_STATUS" \
    --arg upgrade_impact_policy "$UPGRADE_POLICY_STATUS" \
    --arg post_upgrade_idempotency "$IDEMPOTENCY_STATUS" \
    --arg cleanup "$CLEANUP_STATUS" \
    --arg critical_preservation "$CRITICAL_PRESERVATION" \
    --arg contract_compatibility "$CONTRACT_COMPATIBILITY" \
    --arg upgrade_authorization "$UPGRADE_AUTHORIZATION" \
    --arg stable_tag "$STABLE_TAG" \
    --arg candidate_ref "$CANDIDATE_REF" \
    --arg failure_reason "$FAILURE_REASON" \
    --argjson create "$TOTAL_CREATE" \
    --argjson update "$TOTAL_UPDATE" \
    --argjson replace "$TOTAL_REPLACE" \
    --argjson delete "$TOTAL_DELETE" \
    --argjson violations "$VIOLATIONS_JSON" \
    --argjson scenarios "$SCENARIO_RESULTS" \
    '{
      result: $result,
      consumer_upgrade: $consumer_upgrade,
      upgrade_impact_policy: $upgrade_impact_policy,
      post_upgrade_idempotency: $post_upgrade_idempotency,
      cleanup: $cleanup,
      stable_tag: $stable_tag,
      candidate_ref: $candidate_ref,
      upgrade_impact: {
        create: $create,
        update: $update,
        replace: $replace,
        delete: $delete
      },
      upgrade_policy_details: {
        critical_resource_preservation: $critical_preservation,
        contract_compatibility: $contract_compatibility,
        upgrade_authorization: $upgrade_authorization
      },
      failure_reason: (if $failure_reason == "" then null else $failure_reason end),
      violations: $violations,
      scenarios: $scenarios
    }' > "$OUTPUT_JSON"
}
trap cleanup_day2 EXIT

write_baseline_config() {
  local scenario="$1"
  local dir="$2"
  mkdir -p "$dir"
  case "$scenario" in
    defaults)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${STABLE_TAG}"

  cluster_name = "upgrade-defaults"
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-defaults-v1"
    origin_version = "${STABLE_TAG}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    custom)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${STABLE_TAG}"

  cluster_name         = "upgrade-custom"
  cluster_version      = "1.32"
  bottlerocket_version = "1.25.0"
  architecture         = "arm64"
  capacity_model       = "SPOT"
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-custom-v1"
    origin_version = "${STABLE_TAG}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    optional_features)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${STABLE_TAG}"

  cluster_name         = "upgrade-optional"
  architecture         = "amd64"
  addons               = { coredns = "v1.11.1" }
  addon_channels       = { coredns = "stable" }
  addon_owners         = { coredns = "platform" }
  tags                 = { environment = "production", tier = "core" }
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-optional-v1"
    origin_version = "${STABLE_TAG}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    contract_evolution)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${STABLE_TAG}"

  cluster_name         = "upgrade-evolution"
  cluster_version      = "1.31"
  bottlerocket_version = "1.24.0"
  architecture         = "x86_64"
  capacity_model       = "ON_DEMAND"
  addons               = { coredns = "v1.11.0" }
  addon_channels       = { coredns = "stable" }
  addon_owners         = { coredns = "platform" }
  tags                 = { lifecycle = "baseline" }
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-evolution-v1"
    origin_version = "${STABLE_TAG}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    breaking_migration)
      # Historical breaking migration from v6.3.0 (capacity_type) to candidate (capacity_model)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=v6.3.0"

  cluster_name         = "upgrade-breaking-mig"
  cluster_version      = "1.31"
  bottlerocket_version = "1.24.0"
  architecture         = "arm64"
  capacity_type        = "SPOT"
  addons               = { dns = "v1" }
  addon_channels       = { dns = "stable" }
  tags                 = { migration = "v6-to-current" }
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-breaking-v1"
    origin_version = "v6.3.0"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
  esac
}

write_upgrade_config() {
  local scenario="$1"
  local dir="$2"
  case "$scenario" in
    defaults)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${CANDIDATE_REF}"

  cluster_name = "upgrade-defaults"
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-defaults-v1"
    origin_version = "${STABLE_TAG}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    custom)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${CANDIDATE_REF}"

  cluster_name         = "upgrade-custom"
  cluster_version      = "1.32"
  bottlerocket_version = "1.25.0"
  architecture         = "arm64"
  capacity_model       = "SPOT"
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-custom-v1"
    origin_version = "${STABLE_TAG}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    optional_features)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${CANDIDATE_REF}"

  cluster_name         = "upgrade-optional"
  architecture         = "amd64"
  addons               = { coredns = "v1.11.1" }
  addon_channels       = { coredns = "stable" }
  addon_owners         = { coredns = "platform" }
  tags                 = { environment = "production", tier = "core", upgraded = "true" }
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-optional-v1"
    origin_version = "${STABLE_TAG}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    contract_evolution)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${CANDIDATE_REF}"

  cluster_name         = "upgrade-evolution"
  cluster_version      = "1.32"
  bottlerocket_version = "1.25.0"
  architecture         = "x86_64"
  capacity_model       = "ON_DEMAND"
  addons               = { coredns = "v1.11.1" }
  addon_channels       = { coredns = "stable" }
  addon_owners         = { coredns = "platform" }
  tags                 = { lifecycle = "upgraded" }
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-evolution-v1"
    origin_version = "${STABLE_TAG}"
  }
}

resource "terraform_data" "upgrade_audit_trail" {
  input = {
    cluster_name = module.cluster.cluster.name
    target_ref   = "${CANDIDATE_REF}"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
    breaking_migration)
      cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${CANDIDATE_REF}"

  cluster_name         = "upgrade-breaking-mig"
  cluster_version      = "1.31"
  bottlerocket_version = "1.24.0"
  architecture         = "arm64"
  capacity_model       = "SPOT"
  addons               = { dns = "v1" }
  addon_channels       = { dns = "stable" }
  tags                 = { migration = "v6-to-current" }
}

resource "terraform_data" "data_integrity_marker" {
  input = {
    cluster_name   = module.cluster.cluster.name
    marker_token   = "integrity-breaking-v1"
    origin_version = "v6.3.0"
  }
}

output "cluster" {
  value = module.cluster.cluster
}

output "integrity_marker" {
  value = terraform_data.data_integrity_marker.output
}
EOF
      ;;
  esac
}

run_upgrade_scenario() {
  local scenario="$1"
  local dir="$WORK_ROOT/$scenario"
  write_baseline_config "$scenario" "$dir"

  # 9.1 Baseline Stable Provisioning
  terraform -chdir="$dir" init -input=false -no-color >/dev/null
  terraform -chdir="$dir" plan -input=false -no-color -out=baseline.tfplan >/dev/null
  terraform -chdir="$dir" apply -input=false -no-color baseline.tfplan >/dev/null

  local base_lineage base_serial base_cluster_id base_marker_id base_marker_token
  base_lineage="$(jq -r '.lineage' "$dir/terraform.tfstate")"
  base_serial="$(jq -r '.serial' "$dir/terraform.tfstate")"
  base_cluster_id="$(
    terraform -chdir="$dir" show -json |
    jq -r '.values.root_module.child_modules[0].resources[] | select(.address=="module.cluster.terraform_data.cluster") | .values.id'
  )"
  base_marker_id="$(
    terraform -chdir="$dir" show -json |
    jq -r '.values.root_module.resources[] | select(.address=="terraform_data.data_integrity_marker") | .values.id'
  )"
  base_marker_token="$(
    terraform -chdir="$dir" output -json | jq -r '.integrity_marker.value.marker_token'
  )"

  if [[ -z "$base_lineage" || -z "$base_cluster_id" || -z "$base_marker_id" ]]; then
    FAILURE_REASON="Baseline provisioning failed to record state identifiers in $scenario"
    return 1
  fi

  # 9.2 Switch to Candidate Reference in the SAME consumer directory and SAME state
  write_upgrade_config "$scenario" "$dir"
  terraform -chdir="$dir" init -upgrade -input=false -no-color >/dev/null

  local recorded_source
  recorded_source="$(jq -r '.Modules[] | select(.Key=="cluster") | .Source' "$dir/.terraform/modules/modules.json")"
  if [[ "$recorded_source" != *"ref=${CANDIDATE_REF}" ]]; then
    FAILURE_REASON="Upgraded module source ($recorded_source) does not match candidate ref ${CANDIDATE_REF}"
    return 1
  fi

  local downloaded_hash
  downloaded_hash="$(
    cd "$dir/.terraform/modules/cluster" &&
    git rev-parse 'HEAD^{tree}'
  )"
  if [[ "$downloaded_hash" != "$EXPECTED_MODULE_HASH" ]]; then
    FAILURE_REASON="Upgraded candidate module content hash ($downloaded_hash) differs from certified workspace hash ($EXPECTED_MODULE_HASH)"
    return 1
  fi

  terraform -chdir="$dir" validate -no-color >/dev/null
  terraform -chdir="$dir" plan -input=false -no-color -out=upgrade.tfplan >/dev/null
  terraform -chdir="$dir" show -json upgrade.tfplan > "$dir/upgrade-plan.json"

  # 10. Phase 5: Deterministic Upgrade Impact Analysis BEFORE Apply
  local impact_rc=0
  python3 "$REPO_ROOT/scripts/certify/analyze-plan.py" \
    --plan-json "$dir/upgrade-plan.json" \
    --scenario "$scenario" \
    --stable-version "$STABLE_TAG" \
    --candidate-ref "$CANDIDATE_REF" \
    --release-type "$RELEASE_TYPE" \
    --declared-breaking "$DECLARED_BREAKING" \
    --migration-doc-present "$MIGRATION_DOC_PRESENT" \
    --output-json "$dir/impact.json" >/dev/null || impact_rc=$?

  local c_create c_update c_replace c_delete
  c_create="$(jq '.counts.create' "$dir/impact.json")"
  c_update="$(jq '.counts.update' "$dir/impact.json")"
  c_replace="$(jq '.counts.replace' "$dir/impact.json")"
  c_delete="$(jq '.counts.delete' "$dir/impact.json")"
  TOTAL_CREATE=$((TOTAL_CREATE + c_create))
  TOTAL_UPDATE=$((TOTAL_UPDATE + c_update))
  TOTAL_REPLACE=$((TOTAL_REPLACE + c_replace))
  TOTAL_DELETE=$((TOTAL_DELETE + c_delete))

  if [[ "$(jq -r '.critical_resource_preservation' "$dir/impact.json")" != "PASS" ]]; then
    CRITICAL_PRESERVATION="FAIL"
  fi
  if [[ "$(jq -r '.contract_compatibility' "$dir/impact.json")" != "PASS" ]]; then
    CONTRACT_COMPATIBILITY="FAIL"
  fi
  if [[ "$(jq -r '.upgrade_authorization' "$dir/impact.json")" != "PASS" || "$impact_rc" -ne 0 ]]; then
    UPGRADE_AUTHORIZATION="FAIL"
    UPGRADE_POLICY_STATUS="FAIL"
    VIOLATIONS_JSON="$(jq -c '.violations' "$dir/impact.json")"
    FAILURE_REASON="$(jq -r '.violations[0] // "Upgrade impact policy blocked upgrade before apply"' "$dir/impact.json")"
    return 1
  fi

  # Apply approved upgrade plan
  terraform -chdir="$dir" apply -input=false -no-color upgrade.tfplan >/dev/null

  # Verify same state lineage, preserved cluster resource ID, preserved data integrity marker
  local post_lineage post_serial post_cluster_id post_marker_id post_marker_token
  post_lineage="$(jq -r '.lineage' "$dir/terraform.tfstate")"
  post_serial="$(jq -r '.serial' "$dir/terraform.tfstate")"
  post_cluster_id="$(
    terraform -chdir="$dir" show -json |
    jq -r '.values.root_module.child_modules[0].resources[] | select(.address=="module.cluster.terraform_data.cluster") | .values.id'
  )"
  post_marker_id="$(
    terraform -chdir="$dir" show -json |
    jq -r '.values.root_module.resources[] | select(.address=="terraform_data.data_integrity_marker") | .values.id'
  )"
  post_marker_token="$(
    terraform -chdir="$dir" output -json | jq -r '.integrity_marker.value.marker_token'
  )"

  if [[ "$post_lineage" != "$base_lineage" ]]; then
    FAILURE_REASON="State lineage changed during upgrade in $scenario ($base_lineage != $post_lineage)"
    return 1
  fi
  if [[ "$post_serial" -le "$base_serial" ]]; then
    FAILURE_REASON="State serial did not advance after upgrade apply in $scenario"
    return 1
  fi
  if [[ "$post_cluster_id" != "$base_cluster_id" ]]; then
    CRITICAL_PRESERVATION="FAIL"
    UPGRADE_POLICY_STATUS="FAIL"
    FAILURE_REASON="Critical cluster resource ID changed during upgrade in $scenario (resource was recreated!)"
    return 1
  fi
  if [[ "$post_marker_id" != "$base_marker_id" || "$post_marker_token" != "$base_marker_token" ]]; then
    CRITICAL_PRESERVATION="FAIL"
    FAILURE_REASON="Persistent data integrity marker corrupted during upgrade in $scenario"
    return 1
  fi

  # Post-upgrade contract checks per scenario
  local post_outputs
  post_outputs="$(terraform -chdir="$dir" output -json)"
  case "$scenario" in
    defaults)
      echo "$post_outputs" | jq -e '.cluster.value.name == "upgrade-defaults" and .cluster.value.version == "1.31" and .cluster.value.capacity_type == "ON_DEMAND"' >/dev/null
      ;;
    custom)
      echo "$post_outputs" | jq -e '.cluster.value.name == "upgrade-custom" and .cluster.value.version == "1.32" and .cluster.value.architecture == "arm64" and .cluster.value.capacity_type == "SPOT"' >/dev/null
      ;;
    optional_features)
      echo "$post_outputs" | jq -e '.cluster.value.name == "upgrade-optional" and .cluster.value.architecture == "x86_64" and .cluster.value.tags.upgraded == "true" and .cluster.value.addon_owners.coredns == "platform"' >/dev/null
      ;;
    contract_evolution)
      echo "$post_outputs" | jq -e '.cluster.value.name == "upgrade-evolution" and .cluster.value.version == "1.32" and .cluster.value.bottlerocket_version == "1.25.0" and .cluster.value.addons.coredns == "v1.11.1" and .cluster.value.tags.lifecycle == "upgraded"' >/dev/null
      ;;
    breaking_migration)
      echo "$post_outputs" | jq -e '.cluster.value.name == "upgrade-breaking-mig" and .cluster.value.capacity_type == "SPOT" and .cluster.value.architecture == "arm64" and .cluster.value.tags.migration == "v6-to-current"' >/dev/null
      ;;
  esac

  # Post-upgrade Idempotency Plan
  local idemp_rc=0
  terraform -chdir="$dir" plan -detailed-exitcode -input=false -no-color >/dev/null || idemp_rc=$?
  if [[ "$idemp_rc" -ne 0 ]]; then
    IDEMPOTENCY_STATUS="FAIL"
    FAILURE_REASON="Post-upgrade idempotency plan failed with exit code $idemp_rc in $scenario"
    return 1
  fi

  # 9.4 Cleanup
  terraform -chdir="$dir" destroy -auto-approve -input=false -no-color >/dev/null
  local remaining
  remaining="$(jq '.resources | length' "$dir/terraform.tfstate")"
  if [[ "$remaining" != "0" ]]; then
    CLEANUP_STATUS="FAIL"
    FAILURE_REASON="Post-upgrade destroy left $remaining resources in $scenario"
    return 1
  fi

  local lineage_hash cluster_id_hash marker_id_hash
  lineage_hash="$(printf '%s' "$post_lineage" | shasum -a 256 | awk '{print $1}')"
  cluster_id_hash="$(printf '%s' "$post_cluster_id" | shasum -a 256 | awk '{print $1}')"
  marker_id_hash="$(printf '%s' "$post_marker_id" | shasum -a 256 | awk '{print $1}')"

  SCENARIO_RESULTS="$(
    echo "$SCENARIO_RESULTS" | jq \
      --arg name "$scenario" \
      --arg lineage_sha256 "$lineage_hash" \
      --arg cluster_id_sha256 "$cluster_id_hash" \
      --arg marker_id_sha256 "$marker_id_hash" \
      --argjson base_serial "$base_serial" \
      --argjson post_serial "$post_serial" \
      --argjson impact "$(jq '.counts' "$dir/impact.json")" \
      '. + [{
        scenario: $name,
        same_state_lineage_preserved: true,
        state_lineage_sha256: $lineage_sha256,
        serial_before: $base_serial,
        serial_after: $post_serial,
        cluster_resource_id_preserved: true,
        cluster_resource_id_sha256: $cluster_id_sha256,
        data_integrity_marker_preserved: true,
        data_integrity_marker_sha256: $marker_id_sha256,
        impact: $impact,
        post_upgrade_idempotent: true,
        destroyed_cleanly: true
      }]'
  )"

  rm -rf "$dir"
}

for scenario in "${SCENARIOS[@]}"; do
  run_upgrade_scenario "$scenario"
done

DAY2_STATUS="PASS"
echo "Day 2 Consumer Upgrade Certification: PASS (${STABLE_TAG} -> ${CANDIDATE_REF})"
