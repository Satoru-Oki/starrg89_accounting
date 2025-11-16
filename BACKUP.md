# バックアップ＆リストアガイド

Star R.G 89 経理清算システムのバックアップとリストア手順を説明します。

## 📋 目次

1. [概要](#概要)
2. [事前準備（Google Cloud SDK）](#事前準備google-cloud-sdk)
3. [GCSバックアップ環境の構築](#gcsバックアップ環境の構築)
4. [自動バックアップの設定](#自動バックアップの設定)
5. [手動バックアップ](#手動バックアップ)
6. [データベースの復元](#データベースの復元)
7. [トラブルシューティング](#トラブルシューティング)

---

## 概要

### バックアップ対象

| データ種別 | 保存場所 | バックアップ方法 |
|-----------|---------|----------------|
| **PostgreSQLデータベース** | XサーバーVPS（Dockerボリューム） | 日次GCSバックアップ |
| **画像ファイル（領収書・請求書）** | Google Cloud Storage | オブジェクトバージョニング |

### バックアップ設定

- **頻度**: 毎日深夜2時（自動実行）
- **保持期間**:
  - データベース: 90日間（GCS上）
  - 画像: 現在版は永続、古いバージョンは365日
- **バックアップ先**: Google Cloud Storage
  - データベース: `gs://accounting-app-backups/postgres/`
  - 画像: `gs://accounting-app-receipts-20251114`（バージョニング有効）

### 重要な注意事項

⚠️ **Xサーバーのローカルディスクにはバックアップを保存しません**
- バックアップはすべてGCSに保存されます
- Xサーバー上では一時的にバックアップファイルを作成し、GCSへのアップロード後に削除します
- これにより、Xサーバーのディスク容量を節約できます

---

## 事前準備（Google Cloud SDK）

バックアップスクリプトを実行するには、**Google Cloud SDK**が必要です。

### 1. Google Cloud SDKのインストール

本番環境（XサーバーVPS）にSSHでログインし、以下を実行します。

```bash
# deployユーザーでログイン
ssh deploy@your-vps-ip

# Google Cloud SDKインストールスクリプトをダウンロード・実行
curl https://sdk.cloud.google.com | bash

# シェルの再起動（設定を反映）
exec -l $SHELL

# インストール確認
gcloud --version
gsutil --version
```

**期待される出力:**
```
Google Cloud SDK 460.0.0
gsutil version: 5.27
```

### 2. GCP認証設定

サービスアカウントキーで認証します。

```bash
# サービスアカウントキーで認証
gcloud auth activate-service-account \
  --key-file=~/accounting-app/gcp-credentials.json

# プロジェクトを設定
gcloud config set project accounting-app-478114

# 認証確認
gcloud auth list
```

**期待される出力:**
```
                  Credentialed Accounts
ACTIVE  ACCOUNT
*       your-service-account@accounting-app-478114.iam.gserviceaccount.com
```

---

## GCSバックアップ環境の構築

### 1. バックアップ用GCSバケットの作成

データベースバックアップ用のGCSバケットを作成します。

```bash
# バックアップ用バケットを作成（東京リージョン）
gsutil mb -l asia-northeast1 gs://accounting-app-backups

# 確認
gsutil ls
```

**期待される出力:**
```
gs://accounting-app-backups/
gs://accounting-app-receipts-20251114/
```

### 2. データベースバックアップのライフサイクルポリシー設定

古いバックアップを自動的に削除するポリシーを設定します。

```bash
# ライフサイクルポリシーファイルを作成
cat > ~/db_backup_lifecycle.json <<'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 90,
          "matchesPrefix": ["postgres/"]
        }
      }
    ]
  }
}
EOF

# ポリシーを適用
gsutil lifecycle set ~/db_backup_lifecycle.json gs://accounting-app-backups

# 確認
gsutil lifecycle get gs://accounting-app-backups
```

**設定内容:**
- PostgreSQLバックアップは90日後に自動削除
- 月額コストを低く抑えつつ、十分な復元可能期間を確保

### 3. 画像バケットのバージョニング設定

領収書・請求書画像のバケットでオブジェクトバージョニングを有効化します。

```bash
# オブジェクトバージョニングを有効化
gsutil versioning set on gs://accounting-app-receipts-20251114

# 確認
gsutil versioning get gs://accounting-app-receipts-20251114
```

**期待される出力:**
```
gs://accounting-app-receipts-20251114: Enabled
```

### 4. 画像バケットのライフサイクルポリシー

古いバージョンを自動削除するポリシーを設定します。

```bash
# ライフサイクルポリシーファイルを作成
cat > ~/receipts_lifecycle.json <<'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 365,
          "isLive": false
        }
      }
    ]
  }
}
EOF

# ポリシーを適用
gsutil lifecycle set ~/receipts_lifecycle.json gs://accounting-app-receipts-20251114

# 確認
gsutil lifecycle get gs://accounting-app-receipts-20251114
```

**設定内容:**
- 削除・上書きされた古いバージョンは365日後に自動削除
- 現在のバージョン（isLive: true）は永続的に保持

---

## 自動バックアップの設定

### 1. スクリプトのセットアップ

```bash
# アプリケーションディレクトリに移動
cd ~/accounting-app

# スクリプトに実行権限を付与
chmod +x scripts/backup_db.sh
chmod +x scripts/restore_db.sh
```

### 2. 手動テスト実行

自動化する前に、スクリプトが正常に動作することを確認します。

```bash
# バックアップスクリプトを実行
./scripts/backup_db.sh
```

**期待される出力:**
```
========== バックアップ開始 ==========
日時: 2025-01-16 14:30:00
PostgreSQLデータベースのバックアップを実行中...
✓ データベースバックアップ完了: backup_20250116_143000.sql
バックアップサイズ: 12K
バックアップファイルを圧縮中...
✓ 圧縮完了: backup_20250116_143000.sql.gz (圧縮後: 3.2K)
GCSへバックアップをアップロード中...
✓ GCSアップロード完了: gs://accounting-app-backups/postgres/backup_20250116_143000.sql.gz
GCS上のバックアップファイル数: 1
一時ファイルをクリーンアップ中...
✓ クリーンアップ完了
========== バックアップ完了 ==========
```

### 3. GCSバックアップの確認

```bash
# GCS上のバックアップファイルを確認
gsutil ls -lh gs://accounting-app-backups/postgres/

# 最新5件のバックアップを表示
gsutil ls -lh gs://accounting-app-backups/postgres/ | tail -6
```

### 4. cronジョブの設定

毎日深夜2時に自動実行するようにcronを設定します。

```bash
# cronエディタを開く
crontab -e
```

以下の行を追加します：

```cron
# Star R.G 89 経理清算システム - 毎日深夜2時にデータベースバックアップ
0 2 * * * $HOME/accounting-app/scripts/backup_db.sh
```

**設定の説明:**
- `0 2 * * *`: 毎日2時0分に実行
- 標準出力・エラー出力はメールで通知されます（cronデーモンの設定による）

### 5. cron設定の確認

```bash
# 設定されたcronジョブを確認
crontab -l

# cronサービスが稼働しているか確認
sudo systemctl status cron
```

---

## 手動バックアップ

緊急時や重要な変更前に手動でバックアップを取得できます。

### 基本的な手動バックアップ

```bash
cd ~/accounting-app
./scripts/backup_db.sh
```

### バックアップの確認

```bash
# GCS上のバックアップ一覧を表示（最新10件）
gsutil ls -lh gs://accounting-app-backups/postgres/ | tail -11

# 特定のバックアップの詳細情報を表示
gsutil ls -L gs://accounting-app-backups/postgres/backup_20250116_020000.sql.gz
```

---

## データベースの復元

### 1. 利用可能なバックアップの確認

```bash
# GCS上のバックアップを確認
gsutil ls -lh gs://accounting-app-backups/postgres/

# 最新5件のバックアップを表示
gsutil ls -lh gs://accounting-app-backups/postgres/ | grep "\.gz$" | tail -5
```

### 2. GCSバックアップからの復元

```bash
cd ~/accounting-app

# リストアスクリプトを実行（GCSパスを指定）
./scripts/restore_db.sh gs://accounting-app-backups/postgres/backup_20250116_020000.sql.gz
```

**実行例:**
```
========== データベース復元開始 ==========
日時: 2025-01-16 15:00:00
バックアップファイル: gs://accounting-app-backups/postgres/backup_20250116_020000.sql.gz

⚠️  WARNING: 現在のデータベースは上書きされます。続行しますか？ (yes/no): yes
GCSからバックアップをダウンロード中...
✓ ダウンロード完了: /tmp/postgres_restore/backup_20250116_020000.sql.gz
バックアップファイルを解凍中...
✓ 解凍完了: /tmp/postgres_restore/backup_20250116_020000.sql
データベースを復元中...
✓ データベース復元完了
一時ファイルを削除中...
✓ クリーンアップ完了
========== データベース復元完了 ==========
```

### 3. 復元後の確認

```bash
# アプリケーションコンテナを再起動
docker compose -f ~/accounting-app/docker-compose.prod.yml restart backend

# Webブラウザでアクセスして動作確認
# https://starrg89.xyz
```

---

## トラブルシューティング

### バックアップスクリプトが失敗する

#### エラー: `gsutil: command not found`

```bash
# Google Cloud SDKがインストールされているか確認
which gsutil

# インストールされていない場合
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# 認証
gcloud auth activate-service-account \
  --key-file=~/accounting-app/gcp-credentials.json
gcloud config set project accounting-app-478114
```

#### エラー: `docker compose command not found`

```bash
# Dockerがインストールされているか確認
docker --version

# Docker Composeがインストールされているか確認
docker compose version

# インストールされていない場合
sudo apt install -y docker-compose-plugin
```

#### エラー: `Permission denied`

```bash
# スクリプトに実行権限を付与
chmod +x ~/accounting-app/scripts/backup_db.sh

# deployユーザーがdockerグループに所属しているか確認
groups

# 所属していない場合
sudo usermod -aG docker deploy
# ログアウト・ログインして再試行
```

#### エラー: `AccessDeniedException: 403`

サービスアカウントに正しい権限がありません。

```bash
# GCPコンソールで以下の権限を付与:
# - roles/storage.objectAdmin (Storage Object Admin)
# - roles/cloudvision.user (Cloud Vision API User)

# 権限確認
gcloud projects get-iam-policy accounting-app-478114 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:*"
```

### リストアが失敗する

#### エラー: `No URLs matched`

指定したGCSパスが存在しません。

```bash
# 正しいバックアップファイルのパスを確認
gsutil ls gs://accounting-app-backups/postgres/

# 正しいパスで再実行
./scripts/restore_db.sh gs://accounting-app-backups/postgres/backup_YYYYMMDD_HHMMSS.sql.gz
```

#### エラー: `database "accounting_app_production" does not exist`

```bash
# データベースが作成されているか確認
docker compose -f ~/accounting-app/docker-compose.prod.yml exec db psql -U postgres -l

# データベースが存在しない場合
docker compose -f ~/accounting-app/docker-compose.prod.yml exec backend \
  bundle exec rails db:create RAILS_ENV=production
```

### cronジョブが実行されない

#### cronの動作確認

```bash
# cronサービスの状態確認
sudo systemctl status cron

# 停止している場合は起動
sudo systemctl start cron
sudo systemctl enable cron

# cronログの確認（Ubuntu/Debian）
grep CRON /var/log/syslog | tail -20
```

#### スクリプトのパス確認

cronジョブでは環境変数が異なるため、フルパスを使用してください。

```bash
crontab -e
```

以下のように修正：
```cron
0 2 * * * /home/deploy/accounting-app/scripts/backup_db.sh
```

---

## バックアップの監視

### バックアップ成功の確認

```bash
# GCS上の最新バックアップを確認
gsutil ls -lh gs://accounting-app-backups/postgres/ | tail -3

# 特定日のバックアップを検索
gsutil ls gs://accounting-app-backups/postgres/ | grep "20250116"
```

### バックアップサイズの確認

```bash
# データベースバックアップの合計サイズ
gsutil du -sh gs://accounting-app-backups/postgres/

# 画像バケットの合計サイズ
gsutil du -sh gs://accounting-app-receipts-20251114/
```

### 画像のバージョニング確認

```bash
# 特定ファイルの全バージョンを表示
gsutil ls -a gs://accounting-app-receipts-20251114/path/to/receipt.jpg

# バージョン数の確認
gsutil ls -a gs://accounting-app-receipts-20251114/ | wc -l
```

---

## 画像の復元（バージョニング）

誤って削除・上書きした画像ファイルを復元できます。

### 削除した画像の復元

```bash
# 削除されたファイルのバージョン履歴を確認
gsutil ls -a gs://accounting-app-receipts-20251114/path/to/deleted_receipt.jpg

# 特定バージョンをコピーして復元
gsutil cp gs://accounting-app-receipts-20251114/path/to/deleted_receipt.jpg#<generation> \
  gs://accounting-app-receipts-20251114/path/to/deleted_receipt.jpg
```

### 上書きされた画像の復元

```bash
# ファイルのバージョン履歴を確認
gsutil ls -la gs://accounting-app-receipts-20251114/path/to/overwritten_receipt.jpg

# 古いバージョンをダウンロード
gsutil cp gs://accounting-app-receipts-20251114/path/to/overwritten_receipt.jpg#<generation> \
  ./restored_receipt.jpg

# 確認後、必要に応じて再アップロード
```

---

## バックアップファイルの命名規則

```
backup_YYYYMMDD_HHMMSS.sql.gz

例:
backup_20250116_020000.sql.gz → 2025年1月16日 2時0分0秒
backup_20250117_020000.sql.gz → 2025年1月17日 2時0分0秒
```

---

## 推奨されるバックアップ戦略

| レベル | 方法 | 頻度 | 保持期間 | 用途 |
|-------|------|------|---------|------|
| **日次** | 自動バックアップ（cron） | 毎日2時 | 90日 | 日常的な復元 |
| **週次** | 手動バックアップ（重要な更新前） | 必要に応じて | 90日 | 大きな変更前の保険 |
| **月次** | 長期保存用バックアップ | 月初 | 手動管理 | 監査・コンプライアンス |

---

## コスト見積もり

現在のデータ量（DB: ~10KB、画像: ~50MB）の場合：

### 月額コスト

| 項目 | データ量 | 単価 | 月額 |
|------|---------|------|------|
| DBバックアップ（90日分） | ~900KB | $0.023/GB | ~¥0.03 |
| 画像（現在版） | 50MB | $0.023/GB | ~¥0.15 |
| 画像（古いバージョン10%想定） | 5MB | $0.023/GB | ~¥0.01 |
| **合計** | | | **~¥0.19/月** |

### 1年後の想定コスト（月間100トランザクション追加）

| 項目 | データ量 | 月額 |
|------|---------|------|
| DBバックアップ | ~7MB | ~¥0.20 |
| 画像 | ~700MB | ~¥2.00 |
| **合計** | | **~¥2.20/月** |

**💰 実質的には、バックアップのコストは非常に低く、事業リスクと比較して十分に導入価値があります。**

---

## 緊急時の連絡先

バックアップ・リストアに関する問題が発生した場合：

1. まずこのドキュメントのトラブルシューティングを確認
2. GCSコンソールでバックアップの存在を確認
3. システム管理者に連絡

---

## 参考情報

- [Google Cloud Storage ドキュメント](https://cloud.google.com/storage/docs)
- [オブジェクトバージョニング](https://cloud.google.com/storage/docs/object-versioning)
- [ライフサイクル管理](https://cloud.google.com/storage/docs/lifecycle)
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)

---

**最終更新日**: 2025-01-16
