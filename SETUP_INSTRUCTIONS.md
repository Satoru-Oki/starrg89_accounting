# セットアップ手順

## 現在の状況

### ✅ 完了済み
- フロントエンド（React + Vite + Material-UI + react-pdf）の実装完了
- ログイン画面
- スプレッドシート風のデータ入力画面
- PDFエクスポート機能
- 認証コンテキスト
- APIクライアント設定

### ⏳ 未完了（バックエンド）
- Rails APIの設定（権限の問題で未完了）
- データベースモデル
- APIエンドポイント
- 認証機能

## 次のステップ

### ステップ1: バックエンドのファイル権限を修正

```bash
cd /home/satoruoki/projects/accounting-app
sudo chown -R $USER:$USER backend/
```

### ステップ2: バックエンドの設定を完了

詳細は `backend_setup_guide.md` を参照してください。

主な作業：
1. CORS設定の有効化
2. Deviseのインストール
3. データベースモデルの作成
4. コントローラーの実装
5. ルーティングの設定

### ステップ3: 依存関係のインストール

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

### ステップ4: Dockerで起動

```bash
# プロジェクトルートで
docker-compose up --build
```

### ステップ5: データベースのセットアップ

```bash
docker-compose exec backend rails db:create
docker-compose exec backend rails db:migrate
docker-compose exec backend rails db:seed
```

## アクセス先

起動後、以下のURLでアクセスできます：

- **フロントエンド**: http://localhost:5173
- **バックエンドAPI**: http://localhost:3000

## 初期ログイン情報（シード実行後）

- **管理者**
  - メール: admin@example.com
  - パスワード: password

- **一般ユーザー**
  - メール: user@example.com
  - パスワード: password

## トラブルシューティング

### バックエンドのファイルが編集できない
- `sudo chown -R $USER:$USER backend/` を実行してください

### Dockerコンテナが起動しない
- `docker-compose down` を実行してから再度 `docker-compose up --build` してください

### フロントエンドが表示されない
- `frontend/.env` ファイルで `VITE_API_URL` が正しく設定されているか確認してください

### データベース接続エラー
- PostgreSQLコンテナが起動しているか確認：`docker-compose ps`
- データベースを作成：`docker-compose exec backend rails db:create`

## 開発メモ

### フロントエンドの構造

```
frontend/src/
├── components/          # 再利用可能なコンポーネント
│   ├── PDFExport.tsx   # PDF出力機能
│   └── PrivateRoute.tsx # 認証保護ルート
├── contexts/           # Reactコンテキスト
│   └── AuthContext.tsx # 認証状態管理
├── pages/              # ページコンポーネント
│   ├── Login.tsx       # ログイン画面
│   ├── Dashboard.tsx   # ダッシュボード
│   └── TransactionTable.tsx # メインのデータ入力画面
├── services/           # APIクライアント
│   └── api.ts          # Axios設定
├── types/              # TypeScript型定義
│   └── index.ts
├── App.tsx             # アプリケーションルート
├── main.tsx            # エントリーポイント
└── index.css           # グローバルスタイル
```

### 主要機能

1. **認証機能**
   - JWT トークンベースの認証
   - ログイン/ログアウト
   - 保護されたルート

2. **取引管理**
   - スプレッドシート風のUI（Material-UI DataGrid）
   - 行の追加・編集・削除
   - リアルタイムでのデータ保存

3. **PDFエクスポート**
   - react-pdfを使用
   - 取引データをPDF形式でダウンロード

4. **ユーザー権限**
   - 管理者と一般ユーザーの区別
   - CanCanCanによる権限管理（バックエンド側）

## 将来の拡張予定

- [ ] 領収書・請求書ファイルのアップロード機能
- [ ] OCR機能による自動データ入力
- [ ] グラフ・チャートによるデータ可視化
- [ ] 月次・年次レポート
- [ ] データのインポート/エクスポート（CSV, Excel）
- [ ] 複数の支払い方法の管理
- [ ] カテゴリーのカスタマイズ
