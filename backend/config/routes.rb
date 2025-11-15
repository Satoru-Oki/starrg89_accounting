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
      resources :transactions do
        collection do
          post 'extract_receipt_data', to: 'transactions#extract_receipt_data'
          get 'receipt_directory', to: 'transactions#receipt_directory'
        end
      end

      # 請求書管理
      resources :invoices do
        collection do
          post 'extract_invoice_data', to: 'invoices#extract_invoice_data'
          get 'invoice_directory', to: 'invoices#invoice_directory'
        end
      end
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
