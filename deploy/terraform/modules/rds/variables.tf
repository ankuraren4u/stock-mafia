variable "name" {
  type = string
}

variable "environment" {
  type = string
}

variable "engine_version" {
  type    = string
  default = "8.0"
}

variable "instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "allocated_storage" {
  type    = number
  default = 50
}

variable "database_name" {
  type = string
}

variable "database_user" {
  type = string
}

variable "database_password" {
  type      = string
  sensitive = true
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

variable "multi_az" {
  type    = bool
  default = true
}

variable "backup_retention_period" {
  type    = number
  default = 7
}

variable "skip_final_snapshot" {
  type    = bool
  default = false
}

variable "deletion_protection" {
  type    = bool
  default = true
}
