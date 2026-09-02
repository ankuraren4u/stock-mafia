output "endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "reader_endpoint" {
  value = aws_rds_cluster.main.reader_endpoint
}

output "port" {
  value = 3306
}

output "database_name" {
  value = aws_rds_cluster.main.database_name
}
