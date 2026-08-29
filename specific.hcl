build "web" {
  dockerfile = "Dockerfile"
}

postgres "main" {}

service "web" {
  build   = build.web
  command = "pnpm start"

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
    command = "pnpm run dev"
  }

  pre_deploy {
    command = "pnpm run db:migrate"
  }
}
