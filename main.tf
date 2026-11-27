locals {
  cluster = {
    name                 = var.cluster_name
    version              = var.cluster_version
    bottlerocket_version = var.bottlerocket_version
    architecture         = var.architecture == "amd64" ? "x86_64" : var.architecture
    capacity_type        = var.capacity_model
    addons               = var.addons
    addon_channels       = var.addon_channels
    addon_owners         = var.addon_owners
    maintenance_window   = var.maintenance_window
    tags                 = var.tags
  }
}

resource "terraform_data" "cluster" {
  input = local.cluster
}
