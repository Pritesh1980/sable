# Read by scripts/deployAws.mjs via `terraform -chdir=infra output -json`.
# Renaming these breaks the deploy script.

output "bucket_name" {
  value       = aws_s3_bucket.site.id
  description = "S3 bucket holding the built site (private)."
}

output "distribution_id" {
  value       = aws_cloudfront_distribution.site.id
  description = "CloudFront distribution id — used for invalidations."
}

output "app_url" {
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
  description = "The app's URL. Unguessable, but public to anyone who has it."
}
