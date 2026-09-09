build "application" {
  dockerfile = "Dockerfile"
}

postgres "main" {}

config "powens_api_base_url" {}

config "powens_client_id" {}

config "powens_api_time_zone" {
  default = "Europe/Paris"
}

config "account_identity_fingerprint_key_version" {
  default = "v1"
}

config "financial_log_detail" {
  default = "standard"
}

# Set `pretty_logs = true` in gitignored specific.local to make local terminal
# logs human-readable. Deployed environments retain structured JSON logs.
config "pretty_logs" {
  default = "false"
}

secret "powens_client_secret" {}

secret "powens_user_access_token" {}

secret "account_identity_fingerprint_key" {
  generated = true
}

service "web" {
  build   = build.application
  command = "pnpm --filter @monii/web start"

  endpoint {
    public = true

    health_check {
      path = "/"
    }
  }

  env = {
    PORT                 = port
    DATABASE_URL         = postgres.main.url
    FINANCIAL_LOG_DETAIL = config.financial_log_detail
    MONII_PRETTY_LOGS = config.pretty_logs
  }

  dev {
    command = "pnpm --filter @monii/web dev"
  }

  pre_deploy {
    command = "pnpm run db:migrate"
  }
}

service "storybook" {
  root = "apps/web"

  endpoint {
    public = true

    health_check {
      path = "/"
    }
  }

  env = {
    PORT = port
  }

  dev {
    command = "pnpm exec storybook dev --port $PORT --no-open"
  }
}

cron "daily-sync" {
  build    = build.application
  command  = "pnpm --filter @monii/cli cli -- sync"
  schedule = "@daily"

  env = {
    DATABASE_URL                             = postgres.main.url
    POWENS_API_BASE_URL                      = config.powens_api_base_url
    POWENS_CLIENT_ID                         = config.powens_client_id
    POWENS_CLIENT_SECRET                     = secret.powens_client_secret
    POWENS_USER_ACCESS_TOKEN                 = secret.powens_user_access_token
    POWENS_API_TIME_ZONE                     = config.powens_api_time_zone
    ACCOUNT_IDENTITY_FINGERPRINT_KEY         = secret.account_identity_fingerprint_key
    ACCOUNT_IDENTITY_FINGERPRINT_KEY_VERSION = config.account_identity_fingerprint_key_version
    FINANCIAL_LOG_DETAIL                     = config.financial_log_detail
    MONII_PRETTY_LOGS = config.pretty_logs
  }
}
