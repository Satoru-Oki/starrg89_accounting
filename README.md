# 経費管理システム

スプレッドシート風のインターフェースを持つ経費管理Webアプリケーション

## 技術スタック

### バックエンド
- Ruby on Rails 7.2
- PostgreSQL
- Devise (認証)
- Devise-JWT (トークン認証)
- CanCanCan (権限管理)

### フロントエンド
- React 18
- TypeScript
- Vite
- Material-UI
- React PDF
- Axios

## セットアップ手順

### 前提条件
- Docker & Docker Compose
- Node.js 18+
- Ruby 3.x

### 1. バックエンドのファイル権限を修正

```bash
sudo chown -R $USER:$USER backend/
```

### 2. 依存関係のインストール

#### フロントエンド
```bash
cd frontend
npm install
```

#### バックエンド
```bash
cd backend
bundle install
```

### 3. Dockerで起動

プロジェクトルートで以下を実行：

```bash
docker-compose up --build
```

### 4. データベースのセットアップ

別のターミナルで：

```bash
docker-compose exec backend rails db:create
docker-compose exec backend rails db:migrate
docker-compose exec backend rails db:seed
```

### 5. アクセス

- フロントエンド: http://localhost:5173
- バックエンドAPI: http://localhost:3000

## 機能

### 実装済み
- [x] ユーザー認証・ログイン画面
- [x] スプレッドシート風のデータ入力画面
- [x] Material-UIによる美しいUI
- [x] Docker環境

### 実装予定
- [ ] バックエンドAPIエンドポイント
- [ ] データベースモデル（User, Transaction, Category）
- [ ] PDFエクスポート機能
- [ ] ユーザー権限管理
- [ ] OCR機能（将来的に）
- [ ] 領収書・請求書ファイルの添付機能

## 開発メモ

### バックエンドの設定が必要な項目

1. **CORS設定の有効化**
   - `backend/config/initializers/cors.rb` をroot権限で編集

2. **Deviseの設定**
   ```bash
   docker-compose exec backend rails generate devise:install
   docker-compose exec backend rails generate devise User
   ```

3. **モデルの作成**
   ```bash
   docker-compose exec backend rails generate model Transaction date:date deposit_from_star:decimal payment:decimal category:string description:text receipt_status:string balance:decimal user:references
   docker-compose exec backend rails generate model Category name:string category_type:string
   ```

4. **コントローラーの作成**
   ```bash
   docker-compose exec backend rails generate controller Api::Transactions
   docker-compose exec backend rails generate controller Api::Auth
   ```

## ライセンス

Private
