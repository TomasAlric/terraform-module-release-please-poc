#!/usr/bin/env bash
# Phase 3: Fresh Installation Certification (Day 0) via remote Git candidate reference.
set -euo pipefail

CANDIDATE_REF="${1:?Usage: run-day0.sh <candidate_ref> <output_json> [repo_url]}"
OUTPUT_JSON="${2:?Usage: run-day0.sh <candidate_ref> <output_json> [repo_url]}"
REPO_URL="${3:-https://github.com/TomasAlric/terraform-module-release-please-poc.git}"
REPO_ROOT="$(pwd)"

EXPECTED_MODULE_HASH="$(
  git rev-parse 'HEAD^{tree}'
)"

WORK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/day0-cert-XXXXXX")"
SCENARIOS=("fresh_defaults" "fresh_custom")
DAY0_STATUS="FAIL"
CLEANUP_STATUS="PASS"
IDEMPOTENCY_STATUS="PASS"
CONTRACTS_STATUS="PASS"
FAILURE_REASON=""
SCENARIO_RESULTS="[]"

cleanup_day0() {
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
        FAILURE_REASON="${FAILURE_REASON:-Cleanup left residual resources in $scenario}"
      fi
    fi
    rm -rf "$dir"
  done
  rm -rf "$WORK_ROOT"
  if [[ -d "$WORK_ROOT" ]]; then
    CLEANUP_STATUS="FAIL"
  fi
  if [[ "$exit_code" -ne 0 && "$DAY0_STATUS" == "PASS" ]]; then
    DAY0_STATUS="FAIL"
  fi
  if [[ "$CLEANUP_STATUS" != "PASS" ]]; then
    DAY0_STATUS="FAIL"
  fi
  jq -n \
    --arg result "$DAY0_STATUS" \
    --arg cleanup "$CLEANUP_STATUS" \
    --arg idempotency "$IDEMPOTENCY_STATUS" \
    --arg contracts "$CONTRACTS_STATUS" \
    --arg candidate_ref "$CANDIDATE_REF" \
    --arg expected_module_hash "$EXPECTED_MODULE_HASH" \
    --arg failure_reason "$FAILURE_REASON" \
    --argjson scenarios "$SCENARIO_RESULTS" \
    '{
      result: $result,
      fresh_installation: $result,
      terraform_contracts: $contracts,
      idempotency: $idempotency,
      cleanup: $cleanup,
      candidate_ref: $candidate_ref,
      expected_module_hash: $expected_module_hash,
      failure_reason: (if $failure_reason == "" then null else $failure_reason end),
      scenarios: $scenarios
    }' > "$OUTPUT_JSON"
}
trap cleanup_day0 EXIT

write_consumer_config() {
  local scenario="$1"
  local dir="$2"
  mkdir -p "$dir"
  if [[ "$scenario" == "fresh_defaults" ]]; then
    cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${CANDIDATE_REF}"

  cluster_name = "consumer-day0-defaults"
}

output "cluster" {
  value = module.cluster.cluster
}
EOF
  else
    cat > "$dir/main.tf" <<EOF
terraform {
  required_version = ">= 1.6.6, < 2.0.0"
}

module "cluster" {
  source = "git::${REPO_URL}?ref=${CANDIDATE_REF}"

  cluster_name         = "consumer-day0-custom"
  cluster_version      = "1.32"
  bottlerocket_version = "1.25.0+build.1"
  architecture         = "amd64"
  capacity_model       = "SPOT"
  addons               = { coredns = "v1.11.1", vpc_cni = "v1.18.0" }
  addon_channels       = { coredns = "stable", vpc_cni = "stable" }
  addon_owners         = { coredns = "platform", vpc_cni = "networking" }
  tags                 = { environment = "certification", phase = "day0" }
}

output "cluster" {
  value = module.cluster.cluster
}
EOF
  fi
}

run_scenario() {
  local scenario="$1"
  local dir="$WORK_ROOT/$scenario"
  write_consumer_config "$scenario" "$dir"

  # 1. Terraform Init
  terraform -chdir="$dir" init -input=false -no-color >/dev/null

  # Verify module was genuinely fetched from the remote candidate reference and matches certified content
  local recorded_source
  recorded_source="$(jq -r '.Modules[] | select(.Key=="cluster") | .Source' "$dir/.terraform/modules/modules.json")"
  if [[ "$recorded_source" != *"ref=${CANDIDATE_REF}" ]]; then
    FAILURE_REASON="Module source in modules.json ($recorded_source) does not match candidate ref ${CANDIDATE_REF}"
    return 1
  fi

  local downloaded_hash
  downloaded_hash="$(
    cd "$dir/.terraform/modules/cluster" &&
    git rev-parse 'HEAD^{tree}'
  )"
  if [[ "$downloaded_hash" != "$EXPECTED_MODULE_HASH" ]]; then
    FAILURE_REASON="Downloaded candidate module content hash ($downloaded_hash) differs from certified workspace hash ($EXPECTED_MODULE_HASH)"
    return 1
  fi

  # 2. Terraform Validate
  terraform -chdir="$dir" validate -no-color >/dev/null

  # 3. Terraform Plan
  terraform -chdir="$dir" plan -input=false -no-color -out=day0.tfplan >/dev/null

  # 4. Terraform Apply
  terraform -chdir="$dir" apply -input=false -no-color day0.tfplan >/dev/null

  # 5 & 6. Contract tests and outputs verification
  local outputs_json
  outputs_json="$(terraform -chdir="$dir" output -json)"
  if [[ "$scenario" == "fresh_defaults" ]]; then
    if ! echo "$outputs_json" | jq -e '
      .cluster.value.name == "consumer-day0-defaults" and
      .cluster.value.version == "1.31" and
      .cluster.value.bottlerocket_version == "1.24.0" and
      .cluster.value.architecture == "x86_64" and
      .cluster.value.capacity_type == "ON_DEMAND" and
      (.cluster.value.addons | length == 0) and
      (.cluster.value.addon_channels | length == 0) and
      (.cluster.value.addon_owners | length == 0) and
      (.cluster.value.tags | length == 0)
    ' >/dev/null; then
      CONTRACTS_STATUS="FAIL"
      FAILURE_REASON="Day 0 defaults contract assertion failed"
      return 1
    fi
  else
    if ! echo "$outputs_json" | jq -e '
      .cluster.value.name == "consumer-day0-custom" and
      .cluster.value.version == "1.32" and
      .cluster.value.bottlerocket_version == "1.25.0+build.1" and
      .cluster.value.architecture == "x86_64" and
      .cluster.value.capacity_type == "SPOT" and
      .cluster.value.addons.coredns == "v1.11.1" and
      .cluster.value.addons.vpc_cni == "v1.18.0" and
      .cluster.value.addon_channels.coredns == "stable" and
      .cluster.value.addon_owners.vpc_cni == "networking" and
      .cluster.value.tags.environment == "certification"
    ' >/dev/null; then
      CONTRACTS_STATUS="FAIL"
      FAILURE_REASON="Day 0 custom contract assertion failed"
      return 1
    fi
  fi

  # 7. Verify created resources in state
  local resource_id_hash
  resource_id_hash="$(
    terraform -chdir="$dir" show -json |
    jq -r '.values.root_module.child_modules[0].resources[] | select(.address=="module.cluster.terraform_data.cluster") | .values.id' |
    shasum -a 256 | awk '{print $1}'
  )"
  if [[ -z "$resource_id_hash" ]]; then
    FAILURE_REASON="Day 0 resource module.cluster.terraform_data.cluster not found in state"
    return 1
  fi

  # 8. Idempotency Terraform Plan
  local plan_rc=0
  terraform -chdir="$dir" plan -detailed-exitcode -input=false -no-color >/dev/null || plan_rc=$?
  if [[ "$plan_rc" -ne 0 ]]; then
    IDEMPOTENCY_STATUS="FAIL"
    FAILURE_REASON="Day 0 idempotency plan failed with exit code $plan_rc in $scenario"
    return 1
  fi

  # 9. Terraform Destroy
  terraform -chdir="$dir" destroy -auto-approve -input=false -no-color >/dev/null

  # 10. Verify cleanup in state
  local remaining_resources
  remaining_resources="$(jq '.resources | length' "$dir/terraform.tfstate")"
  if [[ "$remaining_resources" != "0" ]]; then
    CLEANUP_STATUS="FAIL"
    FAILURE_REASON="Day 0 destroy left $remaining_resources resources in $scenario"
    return 1
  fi
  rm -rf "$dir"

  SCENARIO_RESULTS="$(
    echo "$SCENARIO_RESULTS" | jq \
      --arg name "$scenario" \
      --arg source "$recorded_source" \
      --arg module_hash "$downloaded_hash" \
      --arg resource_digest "$resource_id_hash" \
      '. + [{
        scenario: $name,
        remote_source: $source,
        module_content_hash: $module_hash,
        resource_id_sha256: $resource_digest,
        contract_verified: true,
        idempotent: true,
        destroyed_cleanly: true
      }]'
  )"
}

for scenario in "${SCENARIOS[@]}"; do
  run_scenario "$scenario"
done

DAY0_STATUS="PASS"
echo "Day 0 Fresh Installation Certification: PASS (${CANDIDATE_REF})"
