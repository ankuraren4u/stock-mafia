resource "aws_db_subnet_group" "main" {
  name       = var.name
  subnet_ids = var.subnet_ids

  tags = {
    Name = var.name
  }
}

resource "aws_security_group" "main" {
  name_prefix = "${var.name}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  tags = {
    Name = "${var.name}-sg"
  }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier     = var.name
  engine                 = "aurora-mysql"
  engine_version         = var.engine_version
  database_name          = var.database_name
  master_username        = var.database_user
  master_password        = var.database_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.main.id]
  storage_encrypted      = true

  backup_retention_period      = var.backup_retention_period
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "sun:04:00-sun:05:00"

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = "${var.name}-final"

  tags = {
    Name = var.name
  }
}

resource "aws_rds_cluster_instance" "main" {
  count                = var.multi_az ? 2 : 1
  identifier           = "${var.name}-${count.index}"
  cluster_identifier   = aws_rds_cluster.main.id
  instance_class       = var.instance_class
  engine               = aws_rds_cluster.main.engine
  engine_version       = aws_rds_cluster.main.engine_version
  publicly_accessible  = false
  db_subnet_group_name = aws_db_subnet_group.main.name

  tags = {
    Name = "${var.name}-${count.index}"
  }
}
