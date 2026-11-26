locals {
  cluster = {
    name                 = var.cluster_name
    version              = var.cluster_version
    bottlerocket_version = var.bottlerocket_version
    architecture         = var.architecture
    capacity_type        = var.capacity_type
    addons               = var.addons
    tags                 = var.tags
  }
}

resource "terraform_data" "cluster" {
  input = local.cluster
}
