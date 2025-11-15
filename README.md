# Star R.G 89 経理清算システム

<div align="center">

**スプレッドシート風のインターフェースを持つ経費・請求書統合管理Webアプリケーション**

[デモを見る](https://starrg89.xyz) | [技術スタック](#技術スタック) | [主要機能](#主要機能)

</div>

---

## 📖 プロジェクト概要

Star R.G 89 経理清算システムは、企業の経理業務を効率化するために開発された、モダンなWebベースの経費・請求書管理システムです。直感的なスプレッドシート風UIと、AI-OCR機能による自動データ抽出により、経理処理の時間を大幅に削減します。

### 🎯 解決する課題

- 📝 **手作業での入力ミス**: OCR機能により領収書・請求書から自動でデータを抽出
- 🔄 **データ管理の煩雑さ**: 領収書と請求書を統合的に管理
- 📊 **可視化の不足**: 直感的なインターフェースでデータを一覧表示
- 🔐 **権限管理**: ロールベースのアクセス制御で安全なデータ管理

---

## ✨ 主要機能

### 🧾 領収書管理
- スプレッドシート風の直感的なデータ入力
- 領収書画像のアップロード（JPG/PDF対応）
- OCRによる自動データ抽出（日付、金額、支払先）
- 画像の自動圧縮・トリミング
- ステータス管理（領収書配置済/確認中/未添付）
- ディレクトリビューで日付別整理

### 💰 請求書管理
- 請求書の登録・編集・削除
- OCRによる請求データ自動抽出
- 支払いステータス管理（支払い済/未払い）
- 請求書ディレクトリでの一覧表示
- 領収書と統合されたUI

### 🔐 ユーザー管理
- ロールベースアクセス制御（superadmin/admin/user）
- JWT認証によるセキュアなAPI通信
- ユーザーごとのデータ管理

### 📄 データエクスポート
- PDFレポート生成
- 月次/ユーザー別のフィルタリング
- カスタマイズ可能な出力形式

### 🎨 レスポンシブUI
- Material-UI v5によるモダンなデザイン
- モバイル対応（スマートフォン・タブレット）
- ダークモード対応（予定）

---

## 🛠 技術スタック

### Frontend
<div>
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Material--UI-5.16-007FFF?style=flat-square&logo=mui&logoColor=white" alt="Material-UI" />
</div>

- **React 18.3** - UIライブラリ
- **TypeScript 5.5** - 型安全な開発
- **Vite 5.4** - 高速なビルドツール
- **Material-UI v5** - UIコンポーネントライブラリ
- **MUI X Data Grid** - 高機能なデータグリッド
- **React Router v6** - クライアントサイドルーティング
- **Axios** - HTTP通信
- **browser-image-compression** - クライアントサイド画像圧縮
- **React PDF** - PDF生成

### Backend
<div>
  <img src="https://img.shields.io/badge/Ruby-3.2.9-CC342D?style=flat-square&logo=ruby&logoColor=white" alt="Ruby" />
  <img src="https://img.shields.io/badge/Rails-7.2.3-CC0000?style=flat-square&logo=rubyonrails&logoColor=white" alt="Rails" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
</div>

- **Ruby on Rails 7.2** - Webアプリケーションフレームワーク
- **PostgreSQL 15** - リレーショナルデータベース
- **Puma** - Webサーバー
- **Rack CORS** - CORS対応
- **BCrypt** - パスワードハッシュ化
- **ActiveStorage** - ファイルアップロード管理

### AI & Cloud Services
<div>
  <img src="https://img.shields.io/badge/Google_Cloud-4285F4?style=flat-square&logo=google-cloud&logoColor=white" alt="Google Cloud" />
</div>

- **Google Cloud Vision API** - OCR処理
- **Google Cloud Storage** - ファイルストレージ
- **Gemini API** - AI処理（拡張機能）

### Infrastructure & DevOps
<div>
  <img src="https://img.shields.io/badge/Docker-24.0-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Nginx-1.29-009639?style=flat-square&logo=nginx&logoColor=white" alt="Nginx" />
</div>

- **Docker & Docker Compose** - コンテナ化
- **Nginx** - リバースプロキシ
- **Let's Encrypt** - SSL/TLS証明書
- **GitHub Actions** - CI/CD（予定）

---

## 🏗 アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                         Client (Browser)                     │
│                React + TypeScript + Material-UI              │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (Port 80/443)                   │
│                   SSL Termination & Routing                  │
└──────────────┬────────────────────────┬─────────────────────┘
               │                        │
               ▼                        ▼
┌──────────────────────┐    ┌──────────────────────────────┐
│   Frontend Container │    │    Backend Container         │
│    (Static Files)    │    │  Rails API + Puma Server     │
└──────────────────────┘    └──────────┬───────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
         ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐
         │   PostgreSQL    │  │ Google Cloud │  │ Google Cloud│
         │   Database      │  │   Storage    │  │  Vision API │
         └─────────────────┘  └──────────────┘  └─────────────┘
```

### データフロー

1. **画像アップロード**
   - クライアント側で画像を圧縮
   - バックエンドでさらに最適化
   - Google Cloud Vision APIでOCR処理
   - 抽出データを確認画面で表示
   - ユーザー確認後、GCSに保存

2. **データ管理**
   - JWT認証によるセキュアなAPI通信
   - ロールベースのアクセス制御
   - リアルタイムデータ更新

---

## 🚀 技術的ハイライト

### 1. 高度な画像処理パイプライン
- **クライアントサイド**: `browser-image-compression`で初期圧縮
- **サーバーサイド**: ImageMagick/Vipsで最適化
- **PDF処理**: Ghostscriptによる段階的圧縮
- **自動トリミング**: Google Cloud Vision APIで領収書領域を検出・自動トリミング

### 2. OCR処理の最適化
```ruby
# OCRで抽出したデータをフィールドに自動マッピング
result = ocr_service.extract_from_attachment(receipt)
unless result[:error]
  ocr_date = result[:date] ? Date.parse(result[:date]) : nil
  transaction.date ||= ocr_date if ocr_date
  transaction.payment ||= result[:amount] if result[:amount]
  transaction.payee ||= result[:payee] if result[:payee]
end
```

### 3. リアルタイムデータ更新
- DataGridのセル編集による即時更新
- 画像アップロード時の自動保存
- 楽観的UI更新によるレスポンシブな体験

### 4. セキュリティ対策
- JWT認証によるステートレス認証
- BCryptによるパスワードハッシュ化
- CORS設定による安全なAPI通信
- ロールベースアクセス制御

---

## 📦 セットアップ手順

### 前提条件
- Docker & Docker Compose
- GCP アカウント（Cloud Vision API、Cloud Storage有効化）
- ドメイン（本番環境の場合）

### 1. リポジトリのクローン
```bash
git clone https://github.com/Satoru-Oki/starrg89_accounting.git
cd starrg89_accounting
```

### 2. 環境変数の設定
```bash
# .env.productionを作成
cp .env.example .env.production

# 以下の項目を設定
# - DB_PASSWORD: データベースパスワード
# - SECRET_KEY_BASE: Rails secret key
# - GCP_PROJECT_ID: GCPプロジェクトID
# - GCS_BUCKET: GCSバケット名
# - GEMINI_API_KEY: Gemini APIキー
```

### 3. GCP認証情報の配置
```bash
# GCP認証情報JSONファイルを配置
cp /path/to/your-credentials.json ./gcp-credentials.json
```

### 4. 本番環境での起動
```bash
# コンテナのビルドと起動
docker compose -f docker-compose.prod.yml up -d

# データベースの作成とマイグレーション
docker compose -f docker-compose.prod.yml exec backend bundle exec rails db:create RAILS_ENV=production
docker compose -f docker-compose.prod.yml exec backend bundle exec rails db:migrate RAILS_ENV=production
```

### 5. アクセス
- 本番環境: https://starrg89.xyz
- ログイン情報: 管理者に問い合わせ

---

## 📸 スクリーンショット

### ログイン画面
シンプルで使いやすいログインインターフェース

### 領収書管理画面
スプレッドシート風のデータ入力と一覧表示

### 請求書管理画面
請求書の登録と支払いステータス管理

### OCR確認画面
抽出されたデータを確認・修正可能

### ディレクトリビュー
日付別に整理された領収書・請求書の一覧

---

## 🎯 今後の展望

- [ ] **ダッシュボード機能** - 月次・年次の集計グラフ
- [ ] **承認フロー** - 多段階の承認プロセス
- [ ] **メール通知** - 承認依頼・ステータス変更通知
- [ ] **API拡張** - RESTful APIの公開
- [ ] **モバイルアプリ** - React Nativeによるネイティブアプリ
- [ ] **AI機能強化** - Gemini APIによる自動仕訳提案
- [ ] **多言語対応** - 英語・中国語対応
- [ ] **監査ログ** - すべての操作履歴の記録

---

## 👨‍💻 開発者

**Satoru Oki**

- GitHub: [@Satoru-Oki](https://github.com/Satoru-Oki)
- Email: お問い合わせフォームより

---

## 📝 ライセンス

このプロジェクトは私的利用のために開発されました。

---

## 🙏 謝辞

このプロジェクトの開発にあたり、以下の技術・サービスを使用させていただきました：

- [Ruby on Rails](https://rubyonrails.org/)
- [React](https://react.dev/)
- [Material-UI](https://mui.com/)
- [Google Cloud Platform](https://cloud.google.com/)
- [Docker](https://www.docker.com/)

---

<div align="center">

**⭐ このプロジェクトが役に立った場合は、スターをつけていただけると嬉しいです！**

Made with ❤️ by Satoru Oki

</div>
