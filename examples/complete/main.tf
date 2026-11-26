module "cluster" {
  source               = "../.."
  cluster_name         = "example"
  cluster_version      = "1.32"
  bottlerocket_version = "1.25.0"
  architecture         = "arm64"
  capacity_model       = "SPOT"
  addons               = { dns = "v1" }
  tags                 = { environment = "lab" }
}

output "cluster" {
  value = module.cluster.cluster
}
