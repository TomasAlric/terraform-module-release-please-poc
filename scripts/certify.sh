#!/usr/bin/env bash
set -euo pipefail
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate
terraform test -no-color
terraform -chdir=examples/complete init -backend=false -input=false
terraform -chdir=examples/complete validate
jq -e 'keys == ["packages"] and (.packages | keys == ["."]) and (.packages["."] | ."release-type" == "terraform-module" and ."include-component-in-tag" == false and ."include-v-in-tag" == true and ([."changelog-sections"[].type] | sort == ["feat","fix","perf"]))' release-please-config.json
jq -e 'keys == ["."] and (.["."] | test("^(0|[1-9][0-9]*)\[.](0|[1-9][0-9]*)\[.](0|[1-9][0-9]*)$"))' .release-please-manifest.json
