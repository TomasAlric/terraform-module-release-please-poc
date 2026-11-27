locals {
  cluster = {
    name                 = var.cluster_name
    version              = var.cluster_version
    bottlerocket_version = var.bottlerocket_version
    architecture         = var.architecture == "amd64" ? "x86_64" : var.architecture
    capacity_type        = var.capacity_model
    addons               = tomap({ for k, v in var.addons : trimspace(k) => trimspace(v) })
    addon_channels       = tomap({ for k, v in var.addon_channels : trimspace(k) => trimspace(v) })
    addon_owners         = tomap({ for k, v in var.addon_owners : trimspace(k) => trimspace(v) })
    tags                 = tomap({ for k, v in var.tags : k => v if k != "upgraded" })
  }
}

resource "terraform_data" "cluster" {
  input = local.cluster
}
