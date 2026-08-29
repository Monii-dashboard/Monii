build "application" {
  dockerfile = "Dockerfile"
}

postgres "main" {}

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
    DATABASE_URL = postgres.main.url
  }
}
