Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      # 認証
      post 'auth/login', to: 'auth#login'
      get 'auth/validate', to: 'auth#validate'
      post 'auth/logout', to: 'auth#logout'

      # ユーザー管理
      resources :users, only: [:index, :show, :create, :update, :destroy]

      # 取引管理
      resources :transactions
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
