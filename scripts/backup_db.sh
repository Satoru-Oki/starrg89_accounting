#!/bin/bash
# PostgreSQL Database Backup Script for Production Environment
# 本番環境（XサーバーVPS）でPostgreSQLデータベースをGCSにバックアップします
#
# 使い方:
#   chmod +x backup_db.sh
#   ./backup_db.sh

set -e  # エラーが発生したら即座に終了

# ===== 設定 =====
# アプリケーションディレクトリ（本番環境）
APP_DIR="$HOME/accounting-app"

# 一時ディレクトリ（バックアップ作成用）
TEMP_DIR="/tmp/postgres_backup"

# 日時（バックアップファイル名に使用）
DATE=$(date +%Y%m%d_%H%M%S)

# GCSバケット
GCS_BUCKET="gs://accounting-app-backups"

# Docker Composeファイルのパス
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"

# データベース名
DB_NAME="accounting_app_production"
DB_USER="postgres"

# バックアップファイル名
BACKUP_FILE="backup_${DATE}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# ===== メイン処理 =====
echo "========== バックアップ開始 =========="
echo "日時: $(date '+%Y-%m-%d %H:%M:%S')"

# gsutilコマンドの確認
if ! command -v gsutil &> /dev/null; then
    echo "✗ エラー: gsutilコマンドが見つかりません"
    echo "Google Cloud SDKをインストールしてください"
    exit 1
fi

# 一時ディレクトリの作成
mkdir -p "$TEMP_DIR"

# PostgreSQLバックアップの実行
echo "PostgreSQLデータベースのバックアップを実行中..."
if docker compose -f "$COMPOSE_FILE" exec -T db pg_dump \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --clean \
    --if-exists \
    > "$TEMP_DIR/$BACKUP_FILE"; then
    echo "✓ データベースバックアップ完了: $BACKUP_FILE"
else
    echo "✗ データベースバックアップ失敗"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# バックアップファイルのサイズを確認
BACKUP_SIZE=$(du -h "$TEMP_DIR/$BACKUP_FILE" | cut -f1)
echo "バックアップサイズ: $BACKUP_SIZE"

# バックアップファイルの圧縮
echo "バックアップファイルを圧縮中..."
if gzip "$TEMP_DIR/$BACKUP_FILE"; then
    COMPRESSED_SIZE=$(du -h "$TEMP_DIR/$COMPRESSED_FILE" | cut -f1)
    echo "✓ 圧縮完了: $COMPRESSED_FILE (圧縮後: $COMPRESSED_SIZE)"
else
    echo "✗ 圧縮失敗"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# GCSへのアップロード
echo "GCSへバックアップをアップロード中..."
if gsutil cp "$TEMP_DIR/$COMPRESSED_FILE" "$GCS_BUCKET/postgres/"; then
    echo "✓ GCSアップロード完了: $GCS_BUCKET/postgres/$COMPRESSED_FILE"

    # GCS上のバックアップ数を表示
    BACKUP_COUNT=$(gsutil ls "$GCS_BUCKET/postgres/" | wc -l)
    echo "GCS上のバックアップファイル数: $BACKUP_COUNT"
else
    echo "✗ GCSアップロード失敗"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# 一時ファイルの削除
echo "一時ファイルをクリーンアップ中..."
rm -rf "$TEMP_DIR"
echo "✓ クリーンアップ完了"

echo "========== バックアップ完了 =========="
echo ""

exit 0
