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
    PORT         = port
    DATABASE_URL = postgres.main.url
  }

  dev {
    command = "pnpm --filter @monii/web dev"
  }

  pre_deploy {
    command = "pnpm run db:migrate"
  }
}

cron "daily-sync" {
  build    = build.application
  command  = "pnpm --filter @monii/cli cli -- sync"
  schedule = "@daily"

  env = {
    DATABASE_URL             = postgres.main.url
    POWENS_API_BASE_URL      = config.powens_api_base_url
    POWENS_CLIENT_ID         = config.powens_client_id
    POWENS_CLIENT_SECRET     = secret.powens_client_secret
    POWENS_USER_ACCESS_TOKEN = secret.powens_user_access_token
    POWENS_API_TIME_ZONE      = config.powens_api_time_zone
    ACCOUNT_IDENTITY_FINGERPRINT_KEY = secret.account_identity_fingerprint_key
    ACCOUNT_IDENTITY_FINGERPRINT_KEY_VERSION = config.account_identity_fingerprint_key_version
  }
}
