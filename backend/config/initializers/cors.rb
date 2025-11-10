# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    # 環境に応じてオリジンを設定
    allowed_origins = if Rails.env.production?
      # 本番環境: ドメイン名とIPアドレスを許可
      domain = ENV.fetch('ALLOWED_HOSTS', 'starrg89.xyz')
      [
        "http://#{domain}",
        "https://#{domain}",
        "http://www.#{domain}",
        "https://www.#{domain}",
        "http://162.43.39.146"
      ]
    else
      # 開発環境: localhost を許可
      ["localhost:5173", "127.0.0.1:5173"]
    end

    origins allowed_origins

    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head],
      expose: ["Authorization"],
      credentials: true
  end
end
