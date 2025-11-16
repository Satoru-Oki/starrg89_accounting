#!/bin/bash
# PostgreSQL Database Restore Script for Production Environment
# 本番環境（XサーバーVPS）でPostgreSQLデータベースを復元します
#
# 使い方:
#   chmod +x restore_db.sh
#   ./restore_db.sh <バックアップファイルのパス>
#
# 例:
#   ./restore_db.sh gs://accounting-app-backups/postgres/backup_20250116_020000.sql.gz

set -e  # エラーが発生したら即座に終了

# ===== 設定 =====
# アプリケーションディレクトリ（本番環境）
APP_DIR="$HOME/accounting-app"

# 一時ディレクトリ
TEMP_DIR="/tmp/postgres_restore"

# Docker Composeファイルのパス
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"

# データベース名
DB_NAME="accounting_app_production"
DB_USER="postgres"

# ===== 引数チェック =====
if [ $# -eq 0 ]; then
    echo "エラー: バックアップファイルのGCSパスを指定してください"
    echo ""
    echo "使い方:"
    echo "  $0 <GCSバックアップファイルのパス>"
    echo ""
    echo "例:"
    echo "  $0 gs://accounting-app-backups/postgres/backup_20250116_020000.sql.gz"
    echo ""

    # GCS上の利用可能なバックアップを表示
    if command -v gsutil &> /dev/null; then
        echo "GCS上の利用可能なバックアップ（最新5件）:"
        gsutil ls -l gs://accounting-app-backups/postgres/ | grep "\.gz$" | tail -5 || echo "  (なし)"
    else
        echo "⚠ gsutilコマンドが見つかりません"
    fi
    exit 1
fi

BACKUP_FILE="$1"

# ===== メイン処理 =====
echo "========== データベース復元開始 =========="
echo "日時: $(date '+%Y-%m-%d %H:%M:%S')"
echo "バックアップファイル: $BACKUP_FILE"
echo ""

# GCSパスの確認
if [[ "$BACKUP_FILE" != gs://* ]]; then
    echo "✗ エラー: GCSパス（gs://で始まる）を指定してください"
    echo "例: gs://accounting-app-backups/postgres/backup_20250116_020000.sql.gz"
    exit 1
fi

# gsutilコマンドの確認
if ! command -v gsutil &> /dev/null; then
    echo "✗ エラー: gsutilコマンドが見つかりません"
    echo "Google Cloud SDKをインストールしてください"
    exit 1
fi

# 確認プロンプト
read -p "⚠️  WARNING: 現在のデータベースは上書きされます。続行しますか？ (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "復元をキャンセルしました"
    exit 0
fi

# 一時ディレクトリの作成
mkdir -p "$TEMP_DIR"

# GCSからバックアップをダウンロード
echo "GCSからバックアップをダウンロード中..."
TEMP_FILE="$TEMP_DIR/$(basename "$BACKUP_FILE")"
if gsutil cp "$BACKUP_FILE" "$TEMP_FILE"; then
    echo "✓ ダウンロード完了: $TEMP_FILE"
else
    echo "✗ GCSからのダウンロード失敗"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# ファイルが圧縮されているか確認
if [[ "$TEMP_FILE" == *.gz ]]; then
    echo "バックアップファイルを解凍中..."
    SQL_FILE="${TEMP_FILE%.gz}"
    if gunzip -c "$TEMP_FILE" > "$SQL_FILE"; then
        echo "✓ 解凍完了: $SQL_FILE"
    else
        echo "✗ 解凍失敗"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
else
    SQL_FILE="$TEMP_FILE"
fi

# データベースの復元
echo "データベースを復元中..."
if docker compose -f "$COMPOSE_FILE" exec -T db psql \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    < "$SQL_FILE"; then
    echo "✓ データベース復元完了"
else
    echo "✗ データベース復元失敗"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# 一時ファイルのクリーンアップ
echo "一時ファイルを削除中..."
rm -rf "$TEMP_DIR"
echo "✓ クリーンアップ完了"

echo "========== データベース復元完了 =========="
echo ""

exit 0
