# バックエンドセットアップ手順

## 前提条件

バックエンドのファイルを編集するには、まず権限を修正する必要があります：

```bash
cd /home/satoruoki/projects/accounting-app
sudo chown -R $USER:$USER backend/
```

## 1. 依存関係のインストール

```bash
cd backend
bundle install
```

## 2. データベースの作成

Dockerを使用する場合：

```bash
docker-compose up -d db
docker-compose exec backend rails db:create
```

ローカルで実行する場合：

```bash
rails db:create
```

## 3. 必要な設定ファイル

### CORS設定 (`config/initializers/cors.rb`)

```ruby
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

### ルーティング (`config/routes.rb`)

```ruby
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
```

## 4. モデルの作成

### Userモデル

```bash
rails generate model User user_id:string name:string email:string password_digest:string role:string
```

### Transactionモデル

```bash
rails generate model Transaction user:references date:date deposit_from_star:decimal payment:decimal category:string description:text receipt_status:string balance:decimal
```

## 5. マイグレーションの実行

```bash
rails db:migrate
```

## 6. シードデータ

`db/seeds.rb`:

```ruby
# ユーザーの作成
admin = User.create!(
  user_id: 'admin',
  name: '管理者',
  email: 'admin@example.com',
  password: 'password',
  role: 'admin'
)

yamada = User.create!(
  user_id: 'yamada',
  name: '山田太郎',
  email: 'yamada@example.com',
  password: 'password',
  role: 'user'
)

sato = User.create!(
  user_id: 'sato',
  name: '佐藤花子',
  email: 'sato@example.com',
  password: 'password',
  role: 'user'
)

suzuki = User.create!(
  user_id: 'suzuki',
  name: '鈴木一郎',
  email: 'suzuki@example.com',
  password: 'password',
  role: 'user'
)

puts "Users created!"

# 取引データの作成
Transaction.create!([
  {
    user: yamada,
    date: '2025-09-01',
    deposit_from_star: 400000,
    category: '',
    description: '9月初期残高'
  },
  {
    user: yamada,
    date: '2025-10-01',
    payment: 13200,
    category: '施設費用',
    description: 'CDアツツキ',
    receipt_status: 'PDF配置済'
  },
  {
    user: sato,
    date: '2025-09-01',
    deposit_from_star: 300000,
    category: '',
    description: '9月初期残高'
  },
  {
    user: sato,
    date: '2025-10-05',
    payment: 5000,
    category: '交際費',
    description: '10月懇親会',
    receipt_status: 'PDF配置済'
  }
])

puts "Transactions created!"
```

シードの実行：

```bash
rails db:seed
```

## 7. サーバーの起動

Dockerを使用する場合：

```bash
docker-compose up
```

ローカルで実行する場合：

```bash
rails server -b 0.0.0.0
```

## 8. フロントエンドとの連携

フロントエンドの`.env`ファイルを更新：

```
VITE_API_URL=http://localhost:3000/api/v1
VITE_USE_MOCK_AUTH=false
```

## 9. 動作確認

### APIエンドポイントのテスト

```bash
# ログイン
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_id":"admin","password":"password"}'

# 取引一覧取得（要認証）
curl -X GET http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## トラブルシューティング

### ポート3000が使用中
```bash
# プロセスを確認
lsof -i :3000

# プロセスを終了
kill -9 PID
```

### データベース接続エラー
```bash
# PostgreSQLの起動確認
docker-compose ps

# データベースの再作成
rails db:drop db:create db:migrate db:seed
```
