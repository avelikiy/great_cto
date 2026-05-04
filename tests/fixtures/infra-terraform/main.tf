terraform {
  required_version = ">= 1.5"
  required_providers { aws = { source = "hashicorp/aws" } }
}
provider "aws" { region = "us-east-1" }
resource "aws_s3_bucket" "data" { bucket = "fixture-data" }
