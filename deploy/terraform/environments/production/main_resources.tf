module "vpc" {
  source = "../../modules/vpc"

  name        = "${var.cluster_name}-vpc"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr

  availability_zones = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]

  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
  database_subnet_cidrs = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]
}

module "eks" {
  source = "../../modules/k8s"

  name            = var.cluster_name
  environment     = var.environment
  cluster_version = var.cluster_version

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  node_instance_types = ["t3.xlarge"]
  node_desired_size   = 3
  node_min_size       = 2
  node_max_size       = 10
}

module "rds" {
  source = "../../modules/rds"

  name               = "${var.cluster_name}-mysql"
  environment        = var.environment
  engine_version     = "8.0"
  instance_class     = var.db_instance_class
  allocated_storage  = 50
  database_name      = "stockmafia"
  database_user      = "stockmafia"
  database_password  = var.db_password
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.database_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]

  multi_az               = true
  backup_retention_period = 7
  skip_final_snapshot    = false
  deletion_protection    = true
}

module "elasticache" {
  source = "../../modules/elasticache"

  name        = "${var.cluster_name}-redis"
  environment = var.environment

  node_type      = var.redis_node_type
  num_cache_nodes = 1
  engine_version = "7.0"
  port           = 6379

  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]

  automatic_failover_enabled = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false
}

module "msk" {
  source = "../../modules/msk"

  name               = "${var.cluster_name}-kafka"
  environment        = var.environment
  kafka_version      = "3.7.0"
  instance_type      = var.kafka_instance_type
  number_of_brokers  = 3

  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
}

resource "aws_acm_certificate" "main" {
  count             = var.certificate_arn == "" ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  count   = var.certificate_arn == "" ? 1 : 0
  name    = tolist(aws_acm_certificate.main[0].domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.main[0].domain_validation_options)[0].resource_record_type
  zone_id = data.aws_route53_zone.main[0].zone_id
  records = [tolist(aws_acm_certificate.main[0].domain_validation_options)[0].resource_record_value]
  ttl     = 60
}

data "aws_route53_zone" "main" {
  count        = var.certificate_arn == "" ? 1 : 0
  name         = var.domain_name
  private_zone = false
}
