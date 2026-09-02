terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "stockmafia-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "stockmafia-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "stockmafia"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
