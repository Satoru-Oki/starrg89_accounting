# バックエンドセットアップガイド

## ファイル権限の修正

まず、以下のコマンドでbackendディレクトリの権限を修正してください：

```bash
sudo chown -R $USER:$USER backend/
```

## 1. CORS設定の更新

`backend/config/initializers/cors.rb` を以下の内容に更新：

```ruby
# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "localhost:5173", "127.0.0.1:5173"

    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head],
      expose: ["Authorization"],
      credentials: true
  end
end
```

## 2. Deviseのインストールと設定

```bash
# Gemfileの更新は既に完了しています
cd backend
bundle install

# Deviseのインストール
rails generate devise:install
rails generate devise User name:string role:string

# JWTの設定
rails generate devise:jwt:secret
```

`config/environments/development.rb` に以下を追加：
```ruby
config.action_mailer.default_url_options = { host: 'localhost', port: 3000 }
```

## 3. データベースモデルの作成

```bash
# Transactionモデル
rails generate model Transaction \
  date:date \
  deposit_from_star:decimal \
  payment:decimal \
  category:string \
  description:text \
  receipt_status:string \
  balance:decimal \
  user:references

# Categoryモデル
rails generate model Category \
  name:string \
  category_type:string
```

## 4. コントローラーの作成

```bash
rails generate controller Api::V1::Transactions --skip-routes
rails generate controller Api::V1::Auth --skip-routes
rails generate controller Api::V1::Users --skip-routes
```

## 5. routes.rbの更新

`config/routes.rb`:

```ruby
Rails.application.routes.draw do
  devise_for :users, path: '', path_names: {
    sign_in: 'api/login',
    sign_out: 'api/logout',
    registration: 'api/signup'
  },
  controllers: {
    sessions: 'api/v1/sessions',
    registrations: 'api/v1/registrations'
  }

  namespace :api do
    namespace :v1 do
      resources :transactions
      get 'auth/validate', to: 'auth#validate'
      resources :users, only: [:index, :show, :update, :destroy]
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
```

## 6. Abilityモデルの作成（CanCanCan）

```bash
rails generate cancan:ability
```

`app/models/ability.rb`:

```ruby
class Ability
  include CanCan::Ability

  def initialize(user)
    user ||= User.new # guest user (not logged in)

    if user.role == 'admin'
      can :manage, :all
    else
      can :read, Transaction, user_id: user.id
      can :create, Transaction
      can :update, Transaction, user_id: user.id
      can :destroy, Transaction, user_id: user.id
    end
  end
end
```

## 7. コントローラーの実装

### `app/controllers/api/v1/auth_controller.rb`:

```ruby
module Api
  module V1
    class AuthController < ApplicationController
      before_action :authenticate_user!

      def validate
        render json: {
          user: {
            id: current_user.id,
            email: current_user.email,
            name: current_user.name,
            role: current_user.role
          }
        }
      end
    end
  end
end
```

### `app/controllers/api/v1/transactions_controller.rb`:

```ruby
module Api
  module V1
    class TransactionsController < ApplicationController
      before_action :authenticate_user!
      load_and_authorize_resource

      def index
        transactions = current_user.transactions.order(date: :desc)
        render json: transactions
      end

      def show
        render json: @transaction
      end

      def create
        @transaction = current_user.transactions.build(transaction_params)

        if @transaction.save
          render json: @transaction, status: :created
        else
          render json: { errors: @transaction.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        if @transaction.update(transaction_params)
          render json: @transaction
        else
          render json: { errors: @transaction.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        @transaction.destroy
        head :no_content
      end

      private

      def transaction_params
        params.require(:transaction).permit(
          :date,
          :deposit_from_star,
          :payment,
          :category,
          :description,
          :receipt_status
        )
      end
    end
  end
end
```

## 8. Userモデルの更新

`app/models/user.rb`:

```ruby
class User < ApplicationRecord
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: JwtDenylist

  has_many :transactions, dependent: :destroy

  validates :name, presence: true
  validates :role, inclusion: { in: %w[admin user] }

  after_initialize :set_default_role, if: :new_record?

  private

  def set_default_role
    self.role ||= 'user'
  end
end
```

## 9. Transactionモデルの更新

`app/models/transaction.rb`:

```ruby
class Transaction < ApplicationRecord
  belongs_to :user

  validates :date, presence: true
  validates :category, presence: true

  before_save :calculate_balance

  private

  def calculate_balance
    # 残高計算ロジック（前の取引の残高を考慮）
    previous_transaction = user.transactions
                                .where('date < ?', date)
                                .order(date: :desc)
                                .first

    previous_balance = previous_transaction&.balance || 0
    self.balance = previous_balance + (deposit_from_star || 0) - (payment || 0)
  end
end
```

## 10. データベースのマイグレーションとシード

```bash
rails db:create
rails db:migrate
```

`db/seeds.rb`:

```ruby
# 管理者ユーザーの作成
User.create!(
  email: 'admin@example.com',
  password: 'password',
  password_confirmation: 'password',
  name: '管理者',
  role: 'admin'
)

# 一般ユーザーの作成
User.create!(
  email: 'user@example.com',
  password: 'password',
  password_confirmation: 'password',
  name: '一般ユーザー',
  role: 'user'
)

puts "Seed data created successfully!"
```

```bash
rails db:seed
```

## 11. JWTDenylistモデルの作成（オプション）

JWT revocationのために：

```bash
rails generate model JwtDenylist jti:string exp:datetime
rails db:migrate
```

`app/models/jwt_denylist.rb`:

```ruby
class JwtDenylist < ApplicationRecord
  include Devise::JWT::RevocationStrategies::Denylist

  self.table_name = 'jwt_denylist'
end
```

## 完了

これでバックエンドの基本設定が完了です。Dockerを再起動してください：

```bash
docker-compose down
docker-compose up --build
```
