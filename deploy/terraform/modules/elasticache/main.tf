resource "aws_elasticache_subnet_group" "main" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "main" {
  name_prefix = "${var.name}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.port
    to_port         = var.port
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  tags = {
    Name = "${var.name}-sg"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = var.name
  description          = "Redis cluster for ${var.name}"

  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_nodes
  port                 = var.port
  engine_version       = var.engine_version

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.main.id]

  automatic_failover_enabled = var.automatic_failover_enabled
  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  transit_encryption_enabled = var.transit_encryption_enabled

  snapshot_retention_limit = 3
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "sun:05:00-sun:07:00"

  tags = {
    Name = var.name
  }
}
