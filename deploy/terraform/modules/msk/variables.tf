variable "name" {
  type = string
}

variable "environment" {
  type = string
}

variable "kafka_version" {
  type    = string
  default = "3.7.0"
}

variable "instance_type" {
  type    = string
  default = "kafka.m5.large"
}

variable "number_of_brokers" {
  type    = number
  default = 3
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
