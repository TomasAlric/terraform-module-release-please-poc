variables {
  cluster_name = "poc"
}

run "defaults" {
  command = plan
  assert {
    condition     = output.cluster.name == "poc" && output.cluster.version == "1.31" && output.cluster.bottlerocket_version == "1.24.0" && output.cluster.architecture == "x86_64" && output.cluster.capacity_type == "ON_DEMAND" && length(output.cluster.addons) == 0 && length(output.cluster.tags) == 0
    error_message = "O contrato default mudou."
  }
}

run "custom_contract" {
  command = apply
  variables {
    cluster_name         = "custom"
    cluster_version      = "1.32"
    bottlerocket_version = "1.25.0"
    architecture         = "arm64"
    capacity_type        = "SPOT"
    addons               = { dns = "v1" }
    tags                 = { env = "poc" }
  }
  assert {
    condition     = output.cluster.name == "custom" && output.cluster.version == "1.32" && output.cluster.bottlerocket_version == "1.25.0" && output.cluster.architecture == "arm64" && output.cluster.capacity_type == "SPOT" && output.cluster.addons == tomap({ dns = "v1" }) && output.cluster.tags == tomap({ env = "poc" })
    error_message = "A configuração aplicada diverge dos inputs."
  }
}

run "invalid_cluster_name" {
  command = plan
  variables {
    cluster_name = "Invalid"
  }
  expect_failures = [var.cluster_name]
}

run "invalid_cluster_version" {
  command = plan
  variables {
    cluster_version = "latest"
  }
  expect_failures = [var.cluster_version]
}

run "invalid_bottlerocket_version" {
  command = plan
  variables {
    bottlerocket_version = "edge"
  }
  expect_failures = [var.bottlerocket_version]
}

run "invalid_architecture" {
  command = plan
  variables {
    architecture = "x86"
  }
  expect_failures = [var.architecture]
}

run "invalid_capacity_type" {
  command = plan
  variables {
    capacity_type = "AUTO"
  }
  expect_failures = [var.capacity_type]
}

run "invalid_addons" {
  command = plan
  variables {
    addons = { dns = "" }
  }
  expect_failures = [var.addons]
}

run "invalid_tags" {
  command = plan
  variables {
    tags = { "" = "lab" }
  }
  expect_failures = [var.tags]
}

run "invalid_trailing_hyphen" {
  command = plan
  variables {
    cluster_name = "poc-"
  }
  expect_failures = [var.cluster_name]
}
