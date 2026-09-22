# Sable static hosting (#6) — a private S3 bucket behind CloudFront.
#
# HOSTING ONLY. Accounts and sync stay with whatever VITE_BACKEND selects; this
# stack knows nothing about them. Deliberately contains nothing billed by the
# hour — no NAT gateway, no load balancer, no always-on compute — so an idle
# month costs nothing and the floor is genuinely zero.
#
#   cd infra
#   terraform init
#   terraform apply -var 'alert_email=you@example.com'
#
# Tear the whole thing down with `terraform destroy` (empty the bucket first —
# see force_destroy below).

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# --- bucket ------------------------------------------------------------------

resource "aws_s3_bucket" "site" {
  # bucket_prefix rather than bucket: S3 names are globally unique across all of
  # AWS, so a fixed guess can collide and fail the apply. Nobody ever sees this
  # name — CloudFront is its only reader.
  bucket_prefix = "${var.name}-"

  # Left at the default false on purpose: `terraform destroy` then refuses while
  # objects remain, so tearing the stack down can never silently delete the
  # contents in one step.
  force_destroy = false
}

# The bucket is never public. CloudFront reads it through the Origin Access
# Control below — this block is what makes the unguessable CloudFront URL the
# only way in, rather than the bucket also being directly readable or listable.
resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# --- cloudfront --------------------------------------------------------------

# Origin Access Control is the current mechanism; Origin Access Identity is
# legacy. CloudFront signs its origin requests with SigV4 and the bucket policy
# trusts only this one distribution.
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Looked up by name rather than hardcoding the well-known UUIDs.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "${var.name} — Sable app"
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true

  # North America + Europe only: cheapest class, and the audience for this app
  # is one person in Milton Keynes.
  price_class = "PriceClass_100"

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # CachingOptimized honours the Cache-Control headers the deploy script
    # writes onto each object, so the rules live in exactly one place
    # (src/deploy/cacheControl.js) instead of being split between object
    # metadata and edge policy.
    cache_policy_id = data.aws_cloudfront_cache_policy.optimized.id
  }

  # The service worker gets caching disabled outright. dist/sw.js changes on
  # every build (the precache manifest is injected into it), but CACHE_NAME
  # inside it is hand-bumped — so the browser only takes a new worker when it
  # sees different bytes here. An edge-cached sw.js means deploys silently never
  # land, with nothing in the console to explain why. Belt and braces alongside
  # the per-deploy invalidation.
  ordered_cache_behavior {
    path_pattern           = "/sw.js"
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.disabled.id
  }

  # SPA deep links. There is no object at /gallery, and because the bucket
  # policy grants GetObject but not ListBucket, S3 answers a miss with 403
  # (AccessDenied) rather than 404 — so both are mapped back to the shell for
  # React Router to resolve client-side.
  #
  # Trade-off: a genuinely missing image also becomes index.html with a 200. The
  # <img> fails to render either way, so what the user sees is unchanged, but it
  # does make a missing file harder to spot in devtools. The precise alternative
  # is a CloudFront Function that rewrites only navigation requests — more
  # moving parts than this app needs.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # The default *.cloudfront.net certificate. A custom domain would need an
    # ACM certificate in us-east-1 — and would also make the URL guessable,
    # which matters here because the reference images are public-but-unlisted.
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    sid       = "AllowCloudFrontRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    # Without this, any CloudFront distribution in any AWS account could read
    # the bucket.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json

  # The policy opens the bucket to CloudFront; the access block must already be
  # in place when it lands.
  depends_on = [aws_s3_bucket_public_access_block.site]
}

# --- cost guardrail ----------------------------------------------------------

# Fires on forecast as well as actual spend, so the warning arrives before the
# bill rather than with it. AWS Budgets is free for the first two budgets.
resource "aws_budgets_budget" "cost" {
  count = var.alert_email == "" ? 0 : 1

  name         = "${var.name}-monthly"
  budget_type  = "COST"
  time_unit    = "MONTHLY"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"

  notification {
    notification_type          = "FORECASTED"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    notification_type          = "ACTUAL"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }
}
