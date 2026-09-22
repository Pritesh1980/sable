variable "name" {
  type        = string
  default     = "sable"
  description = "Prefix for the bucket, OAC and budget names."
}

variable "region" {
  type        = string
  default     = "eu-west-2"
  description = <<-EOT
    Region for the S3 bucket (London — nearest to Milton Keynes). CloudFront
    itself is global, so this only decides where the origin bytes live.
  EOT
}

variable "alert_email" {
  type        = string
  default     = ""
  description = <<-EOT
    Optional. Email address for the monthly cost alert. Leave blank to skip
    creating a budget at all.
  EOT
}

variable "monthly_budget_usd" {
  type        = number
  default     = 1
  description = <<-EOT
    Alert when forecast or actual monthly spend crosses this, in USD. Expected
    real cost for this stack is a few pence a month, so £1 is a smoke alarm,
    not a ceiling — it should never fire.
  EOT
}
