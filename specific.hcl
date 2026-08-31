build "application" {
  dockerfile = "Dockerfile"
}

postgres "main" {}

config "powens_api_base_url" {}

config "powens_client_id" {}

secret "powens_client_secret" {}

secret "powens_user_access_token" {}

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
  }
}
