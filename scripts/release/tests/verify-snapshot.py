"""Replay a read-only GitHub verification with one incompatible observation at a time."""
import ast
import functools
import json
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import verify

merge, tag, number = sys.argv[1:]
number = int(number)
command = functools.cache(verify.command)
# Read the historical allowlist as data. No historical Python code is executed.
source = command("git", "show", merge + ":scripts/release/verify.py")
policy = next(node.value for node in ast.parse(source).body if isinstance(node, ast.Assign)
              and any(isinstance(name, ast.Name) and name.id == "CI_POLICY" for name in node.targets))
verify.CI_POLICY = ast.literal_eval(policy)
with patch.object(verify, "command", command):
    control = verify.verify(merge, tag, number)
assert control["result"] == "success"

for case in ("cancelled", "failed", "other workflow", "other head", "other attempt",
             "missing job", "incomplete evidence", "marker outside gate", "other metadata", "stale candidate ref"):
    def replay(*args):
        value = command(*args)
        if args[:2] == ("gh", "api"):
            data = json.loads(value)
            if "workflow_runs" in data:
                run = data["workflow_runs"][0]
                if case in ("cancelled", "failed"):
                    run["conclusion"] = case
                if case == "other workflow":
                    run["path"] = ".github/workflows/other.yml"
                if case == "other head":
                    run["head_sha"] = "0" * 40
            if "jobs" in data and case == "missing job":
                data["jobs"] = [j for j in data["jobs"] if j["name"] != "Terraform Contract Tests"]
            if "merged_at" in data and case == "other metadata":
                data["body"] += "\nupdated metadata"
            return json.dumps(data)
        if args[:3] == ("gh", "run", "view"):
            if case == "incomplete evidence":
                return value.replace("CERTIFICATION_EVIDENCE_JSON=", "MISSING=")
            if case == "marker outside gate":
                return value.replace("Evaluate Infrastructure Certification Gate\t", "Other step\t")
            if case == "other attempt":
                return value.replace('"attempt":"1"', '"attempt":"0"')
        if args[:2] == ("git", "ls-remote") and case == "stale candidate ref":
            return ""
        return value

    with patch.object(verify, "command", replay):
        try:
            verify.verify(merge, tag, number)
        except SystemExit as exc:
            print("PASS denied", case, str(exc))
        else:
            raise AssertionError(case)
