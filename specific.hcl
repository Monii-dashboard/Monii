build "web" {
  base    = "node"
  command = "pnpm run build"
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
