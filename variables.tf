variable "cluster_name" {
  type     = string
  nullable = false
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,62}$", var.cluster_name)) && !endswith(var.cluster_name, "-")
    error_message = "Use um nome DNS de até 63 caracteres."
  }
}

variable "cluster_version" {
  type     = string
  nullable = false
  default  = "1.31"
  validation {
    condition     = can(regex("^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$", var.cluster_version))
    error_message = "Use major.minor."
  }
}

variable "bottlerocket_version" {
  type     = string
  nullable = false
  default  = "1.24.0"
  validation {
    condition     = can(regex("^[0-9]+[.][0-9]+[.][0-9]+(-(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)([.](0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?([+][0-9A-Za-z-]+([.][0-9A-Za-z-]+)*)?$", var.bottlerocket_version))
    error_message = "Use major.minor.patch."
  }
}

variable "architecture" {
  type     = string
  nullable = false
  default  = "x86_64"
  validation {
    condition     = contains(["x86_64", "amd64", "arm64"], var.architecture)
    error_message = "Use x86_64, amd64 ou arm64."
  }
}

variable "capacity_model" {
  type     = string
  nullable = false
  default  = "ON_DEMAND"
  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.capacity_model)
    error_message = "Use ON_DEMAND ou SPOT."
  }
}

variable "addons" {
  type     = map(string)
  nullable = false
  default  = {}
  validation {
    condition     = alltrue([for name, version in var.addons : trimspace(name) != "" && try(trimspace(version) != "", false)])
    error_message = "Informe nome e versão de cada addon."
  }
}

variable "tags" {
  type     = map(string)
  nullable = false
  default  = {}
  validation {
    condition     = alltrue([for name, value in var.tags : trimspace(name) != "" && value != null])
    error_message = "Use chaves com nome e valores definidos."
  }
}

variable "addon_channels" {
  description = "Metadados opcionais de addons."
  type        = map(string)
  default     = {}
  nullable    = false
}

variable "addon_owners" {
  description = "Metadados opcionais de addons."
  type        = map(string)
  default     = {}
  nullable    = false
}
