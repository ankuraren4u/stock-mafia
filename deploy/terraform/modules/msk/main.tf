resource "aws_security_group" "main" {
  name_prefix = "${var.name}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 9092
    to_port         = 9092
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  ingress {
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  tags = {
    Name = "${var.name}-sg"
  }
}

resource "aws_msk_cluster" "main" {
  cluster_name           = var.name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.number_of_brokers

  broker_node_group_info {
    instance_type   = var.instance_type
    client_subnets  = var.subnet_ids
    security_groups = [aws_security_group.main.id]

    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
    encryption_at_rest_kms_key_arn = aws_kms_key.main.arn
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.main.name
      }
    }
  }

  tags = {
    Name = var.name
  }
}

resource "aws_kms_key" "main" {
  description             = "MSK cluster encryption key"
  deletion_window_in_days = 7
}

resource "aws_cloudwatch_log_group" "main" {
  name              = "/msk/${var.name}"
  retention_in_days = 30
}
