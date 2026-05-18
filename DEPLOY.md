# XサーバーVPSへのデプロイ手順

## 前提条件

- XサーバーVPSのアカウントとサーバー
- ドメイン名（オプション、IPアドレスでも可）
- SSHアクセス可能な状態

## 1. GCP（Google Cloud Platform）の設定

### 1.1 Cloud Storageバケットの作成

画像アップロード機能で使用するGCSバケットを作成します。

```bash
# gcloudコマンドがインストールされていることを確認
# インストールされていない場合: https://cloud.google.com/sdk/docs/install

# プロジェクトを設定
gcloud config set project accounting-app-478114

# バケットを作成（リージョンは asia-northeast1 を推奨）
gsutil mb -l asia-northeast1 gs://your-bucket-name

# バケット名の例:
# - accounting-app-storage
# - accounting-app-478114-uploads
# - starrg89-accounting-app

# バケットのCORS設定（フロントエンドからのアップロードを許可）
echo '[
  {
    "origin": ["http://starrg89.xyz", "https://starrg89.xyz"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]' > cors.json

gsutil cors set cors.json gs://your-bucket-name

# 設定確認
gsutil cors get gs://your-bucket-name
```

### 1.2 サービスアカウントの権限確認

既に作成済みのサービスアカウントに、必要な権限が付与されていることを確認します。

```bash
# サービスアカウントのメールアドレスを確認
gcloud iam service-accounts list

# 必要な権限:
# - Storage Object Admin (roles/storage.objectAdmin)
# - Cloud Vision API User (roles/cloudvision.user)

# 権限の付与（まだの場合）
gcloud projects add-iam-policy-binding accounting-app-478114 \
  --member="serviceAccount:your-service-account@accounting-app-478114.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding accounting-app-478114 \
  --member="serviceAccount:your-service-account@accounting-app-478114.iam.gserviceaccount.com" \
  --role="roles/cloudvision.user"
```

## 2. VPSサーバーの初期設定

### 2.1 SSHでサーバーに接続

```bash
ssh root@your-vps-ip
```

### 2.2 必要なパッケージのインストール

```bash
# システムアップデート
apt update && apt upgrade -y

# 必要なツールのインストール
apt install -y curl git vim

# Dockerのインストール
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker Composeのインストール
apt install -y docker-compose-plugin

# Dockerの起動と自動起動設定
systemctl start docker
systemctl enable docker

# 動作確認
docker --version
docker compose version
```

### 2.3 一般ユーザーの作成（推奨）

```bash
# ユーザー作成
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy

# SSH鍵の設定（オプション）
su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# 公開鍵を ~/.ssh/authorized_keys に追加
```

## 3. アプリケーションのデプロイ

### 3.1 コードのアップロード

#### 方法A: Gitを使用（推奨）

```bash
# deployユーザーで作業
su - deploy

# リポジトリのクローン
cd ~
git clone <your-repository-url> accounting-app
cd accounting-app
```

#### 方法B: SCPでアップロード

ローカルPCから：
```bash
scp -r /path/to/accounting-app deploy@your-vps-ip:~/
```

### 3.2 環境変数ファイルの作成

```bash
cd ~/accounting-app

# サンプルファイルをコピー
cp .env.production.example .env.production

# 環境変数を編集
vim .env.production
```

**必ず以下の値を変更してください:**

```bash
# データベースパスワード（強力なものに変更）
DB_PASSWORD=強力なパスワードに変更

# ドメイン名またはIPアドレス
DOMAIN=your-domain.com

# Railsのシークレットキーを生成
# 以下のコマンドをローカルで実行して生成:
# docker compose run --rm backend bundle exec rails secret

RAILS_MASTER_KEY=生成したキー
SECRET_KEY_BASE=生成したキー

# GCP設定
GCP_PROJECT_ID=your-gcp-project-id
GCS_BUCKET=your-gcs-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=/rails/config/gcp-credentials.json
```

### 3.3 GCPサービスアカウントキーの配置

```bash
# GCPサービスアカウントキーをサーバーにアップロード
# ローカルPCから実行:
scp /path/to/your-service-account-key.json deploy@your-vps-ip:~/accounting-app/gcp-credentials.json

# サーバー上でファイルの配置を確認
ls -l ~/accounting-app/gcp-credentials.json

# 権限を設定（読み取り専用）
chmod 400 ~/accounting-app/gcp-credentials.json
```

**重要:** このファイルは機密情報を含むため、必ず安全に管理してください。

### 3.4 データベースのセットアップ

```bash
# 本番環境でコンテナを起動
docker compose -f docker-compose.prod.yml --env-file .env.production up -d db backend

# データベースの作成
docker compose -f docker-compose.prod.yml exec backend bundle exec rails db:create RAILS_ENV=production

# マイグレーション実行
docker compose -f docker-compose.prod.yml exec backend bundle exec rails db:migrate RAILS_ENV=production

# シードデータの投入（必要に応じて）
docker compose -f docker-compose.prod.yml exec backend bundle exec rails db:seed RAILS_ENV=production
```

### 3.5 アプリケーションの起動

```bash
# 全てのコンテナを起動
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# ログの確認
docker compose -f docker-compose.prod.yml logs -f

# コンテナの状態確認
docker compose -f docker-compose.prod.yml ps
```

## 4. SSL証明書の設定（Let's Encrypt）

### 4.1 初回のSSL証明書取得

```bash
# ドメインを設定していることを確認
# nginx/conf.d/app.confのyour-domain.comを実際のドメインに変更
vim nginx/conf.d/app.conf

# Certbotで証明書を取得
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d your-domain.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

### 4.2 Nginx設定でHTTPSを有効化

```bash
# nginx/conf.d/app.confを編集
vim nginx/conf.d/app.conf

# 以下の変更を実施:
# 1. HTTPSサーバーブロックのコメントを解除
# 2. your-domain.comを実際のドメインに変更
# 3. HTTPリダイレクトを有効化

# Nginxを再起動
docker compose -f docker-compose.prod.yml restart nginx
```

### 4.3 証明書の自動更新と反映の仕組み

Let's Encryptの証明書は90日で失効するため、自動更新と反映を以下の二重構造で実現しています。

**certbotコンテナ**: 12時間おきに `certbot renew` を実行し、有効期限が30日以内に迫った証明書を自動更新します（`docker-compose.prod.yml` の certbot サービス）。

**nginxコンテナ**: certbotが新しい証明書ファイルを生成しても、nginxは起動時に読み込んだ証明書をメモリに保持し続けるため、reloadしない限り新しい証明書を配信しません。この問題を解決するため、nginxコンテナの`command:`にバックグラウンドで6時間おきに `nginx -s reload` を実行するループを組み込んでいます：

```yaml
nginx:
  image: nginx:alpine
  # ...
  command: ["/bin/sh", "-c", "while :; do sleep 21600; nginx -s reload; done & exec nginx -g 'daemon off;'"]
```

これにより、証明書更新（最大12時間遅延）+ nginxへの反映（最大6時間遅延）で、**最悪でも18時間以内に新証明書が配信に反映**されます。

**動作確認**: nginxが現在クライアントに配信している証明書の期限は以下で確認できます。

```bash
echo | openssl s_client -servername your-domain.com -connect your-domain.com:443 2>/dev/null \
  | openssl x509 -noout -dates
```

`notAfter` がディスク上の証明書（`certbot certificates` で確認できる期限）と一致していれば正常です。両者がズレている場合は「トラブルシューティング」の該当項目を参照してください。

## 5. ファイアウォールの設定

```bash
# UFWのインストールと設定
apt install -y ufw

# 必要なポートを開放
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS

# ファイアウォールを有効化
ufw enable

# 状態確認
ufw status
```

## 6. 動作確認

### 6.1 アクセステスト

ブラウザで以下にアクセス：
- HTTP: http://your-domain.com または http://your-vps-ip
- HTTPS: https://your-domain.com（SSL設定後）

### 6.2 ログイン確認

初期ユーザーでログイン：
- **ユーザーID**: admin
- **パスワード**: starrg89（シードデータを投入した場合）

## 7. 運用管理

### 7.1 アプリケーションの更新

```bash
cd ~/accounting-app

# 最新コードを取得
git pull

# コンテナの再ビルドと再起動
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# マイグレーションがあれば実行
docker compose -f docker-compose.prod.yml exec backend bundle exec rails db:migrate RAILS_ENV=production
```

### 7.2 ログの確認

```bash
# 全てのログ
docker compose -f docker-compose.prod.yml logs -f

# 特定のサービスのログ
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f nginx
```

### 7.3 バックアップ

```bash
# データベースのバックアップ
docker compose -f docker-compose.prod.yml exec db pg_dump \
  -U postgres accounting_app_production > backup_$(date +%Y%m%d).sql

# バックアップの復元
docker compose -f docker-compose.prod.yml exec -T db psql \
  -U postgres accounting_app_production < backup_20250110.sql
```

### 7.4 コンテナの停止・再起動

```bash
# 停止
docker compose -f docker-compose.prod.yml down

# 起動
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 再起動
docker compose -f docker-compose.prod.yml restart
```

## トラブルシューティング

### データベース接続エラー

```bash
# データベースコンテナの状態確認
docker compose -f docker-compose.prod.yml ps db

# データベースログの確認
docker compose -f docker-compose.prod.yml logs db
```

### Nginxエラー

```bash
# Nginx設定のテスト
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# Nginxログの確認
docker compose -f docker-compose.prod.yml logs nginx
```

### SSL証明書の期限切れエラー（certbotは更新済みなのに発生する場合）

ブラウザで「証明書の有効期限切れ」と表示されるが、サーバー上の証明書ファイル自体は更新済みというケース。原因はnginxが古い証明書をメモリに保持し続けているため。

```bash
# 1. 実際にnginxが配信している証明書を確認
echo | openssl s_client -servername your-domain.com -connect your-domain.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# 2. ディスク上の証明書ファイルの期限を確認
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certificates

# 3. 両者の notAfter が異なる場合、nginxをreloadして反映
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

# 4. 再確認（1と同じコマンドを再実行）
```

セクション4.3の自動reload機構（6時間おきのループ）が有効であれば、放置しても最悪18時間以内に自動的に反映されます。

**事例**: 2026-05-18にこの問題が発生。証明書は2026-04-16にcertbotが自動更新済み（期限2026-07-15）だったが、nginxへの伝達機構が無かったため2026-05-16失効の古い証明書を配信し続けていた。対策として自動reloadループを導入。

### コンテナが起動しない

```bash
# コンテナの状態確認
docker compose -f docker-compose.prod.yml ps

# 詳細なログを確認
docker compose -f docker-compose.prod.yml logs --tail=100

# コンテナを再構築
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## セキュリティ推奨事項

1. **SSH設定の強化**
   - パスワード認証を無効化
   - SSH鍵認証のみを許可
   - デフォルトポート(22)を変更

2. **定期的なアップデート**
   - システムパッケージの更新
   - Dockerイメージの更新
   - SSL証明書の自動更新確認

3. **バックアップ**
   - データベースの定期バックアップ
   - アップロードファイルのバックアップ

4. **監視**
   - ログの定期確認
   - ディスク使用量の監視
   - メモリ使用量の監視

## 参考情報

- XサーバーVPSドキュメント: https://vps.xserver.ne.jp/support/
- Docker公式ドキュメント: https://docs.docker.com/
- Let's Encrypt: https://letsencrypt.org/
