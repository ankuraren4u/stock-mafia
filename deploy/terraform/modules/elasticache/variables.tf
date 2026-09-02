variable "name" {
  type = string
}

variable "environment" {
  type = string
}

variable "node_type" {
  type    = string
  default = "cache.r6g.large"
}

variable "num_cache_nodes" {
  type    = number
  default = 1
}

variable "engine_version" {
  type    = string
  default = "7.0"
}

variable "port" {
  type    = number
  default = 6379
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "allowed_security_group_ids" {
  type    = list(string)
  default = []
}

variable "automatic_failover_enabled" {
  type    = bool
  default = false
}

variable "at_rest_encryption_enabled" {
  type    = bool
  default = true
}

variable "transit_encryption_enabled" {
  type    = bool
  default = false
}
