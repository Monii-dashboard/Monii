build "web" {
  dockerfile = "Dockerfile"
}

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
    PORT = port
  }

  dev {
    command = "pnpm run dev"
  }
}
