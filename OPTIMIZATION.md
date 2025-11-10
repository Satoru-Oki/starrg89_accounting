# メモリ2GB環境での最適化ガイド

## メモリ使用量の見積もり

### 各サービスのメモリ制限設定

docker-compose.prod.ymlで設定済み：
- **PostgreSQL**: 400MB（最適化済み）
- **Rails Backend**: 600MB（スレッド数制限）
- **Frontend (Nginx)**: 100MB
- **Nginx (プロキシ)**: 100MB
- **合計**: 約1,200MB + システム予約（約200-300MB）

**残りメモリ**: 約500-600MB（バッファとして使用）

## 1. スワップファイルの設定（必須）

メモリ2GBの場合、スワップは必須です。VPSサーバーで以下を実行：

```bash
# スワップの状態確認
free -h

# 2GBのスワップファイルを作成
sudo fallocate -l 2G /swapfile

# パーミッション設定
sudo chmod 600 /swapfile

# スワップファイルをセットアップ
sudo mkswap /swapfile

# スワップを有効化
sudo swapon /swapfile

# 永続化（再起動後も有効）
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# スワップの使用傾向を調整（メモリを優先的に使用）
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# 確認
free -h
```

## 2. PostgreSQLの最適化

### 設定内容（docker-compose.prod.ymlに設定済み）

```
shared_buffers=128MB       # メモリの25-40%（400MBの約32%）
effective_cache_size=256MB # shared_buffersの2倍程度
maintenance_work_mem=64MB  # メンテナンス作業用
max_connections=50         # 同時接続数制限
```

### 定期的なメンテナンス

```bash
# VACUUM実行（週1回推奨）
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d accounting_app_production -c "VACUUM ANALYZE;"

# データベースサイズの確認
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d accounting_app_production -c "SELECT pg_size_pretty(pg_database_size('accounting_app_production'));"
```

## 3. Railsの最適化

### 環境変数で設定済み

```
RAILS_MAX_THREADS=3    # スレッド数を制限
WEB_CONCURRENCY=2      # ワーカープロセス数を制限
```

### 追加の最適化（必要に応じて）

backend/config/puma.rbを編集：

```ruby
# メモリ制限環境用の設定
max_threads_count = ENV.fetch("RAILS_MAX_THREADS") { 3 }
min_threads_count = ENV.fetch("RAILS_MIN_THREADS") { max_threads_count }
threads min_threads_count, max_threads_count

workers ENV.fetch("WEB_CONCURRENCY") { 2 }

preload_app!

# メモリ使用量の監視と自動再起動
before_fork do
  ActiveRecord::Base.connection_pool.disconnect! if defined?(ActiveRecord)
end

on_worker_boot do
  ActiveRecord::Base.establish_connection if defined?(ActiveRecord)
end
```

## 4. ログローテーションの設定

ディスク容量を節約するため、ログローテーションを設定：

```bash
# VPSサーバーで実行
sudo vim /etc/logrotate.d/docker-containers
```

以下を追加：

```
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=10M
    missingok
    delaycompress
    copytruncate
}
```

## 5. ビルド時のメモリ対策

ビルド時はメモリを多く消費するため、段階的にビルド：

```bash
# データベースとバックエンドのみ起動
docker compose -f docker-compose.prod.yml up -d db

# 次にバックエンドをビルド
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend

# フロントエンドをビルド
docker compose -f docker-compose.prod.yml build frontend
docker compose -f docker-compose.prod.yml up -d frontend

# 最後にNginxを起動
docker compose -f docker-compose.prod.yml up -d nginx
```

## 6. モニタリング

### リソース使用量の確認

```bash
# メモリ使用量
free -h

# コンテナごとのリソース使用量
docker stats

# ディスク使用量
df -h

# Dockerが使用している容量
docker system df
```

### アラート設定（推奨）

メモリ使用率が80%を超えたら警告を出すスクリプト：

```bash
# /usr/local/bin/memory-check.sh を作成
#!/bin/bash
MEMORY_USAGE=$(free | grep Mem | awk '{print ($3/$2) * 100.0}')
THRESHOLD=80

if (( $(echo "$MEMORY_USAGE > $THRESHOLD" | bc -l) )); then
    echo "Warning: Memory usage is ${MEMORY_USAGE}%" | mail -s "High Memory Usage Alert" your-email@example.com
fi
```

cronで定期実行：

```bash
# crontab -e で追加
*/30 * * * * /usr/local/bin/memory-check.sh
```

## 7. 不要なDockerリソースのクリーンアップ

定期的に実行：

```bash
# 使用していないイメージ、コンテナ、ボリュームを削除
docker system prune -a --volumes

# ビルドキャッシュのクリア
docker builder prune -a
```

## 8. パフォーマンス最適化のヒント

### アプリケーションレベル

1. **データベースインデックスの追加**
   - よく検索するカラムにインデックスを作成
   - `user_id`, `date` などにインデックス

2. **N+1クエリの最適化**
   - `includes`、`eager_load`を使用

3. **ページネーション**
   - 大量のデータを一度に取得しない
   - `kaminari`や`pagy`を使用

### フロントエンド

1. **画像の最適化**
   - 適切なサイズに圧縮
   - WebP形式の使用

2. **遅延ロード**
   - React.lazyでコンポーネントを遅延ロード

## 9. トラブルシューティング

### メモリ不足エラーが発生した場合

```bash
# コンテナを再起動
docker compose -f docker-compose.prod.yml restart

# それでも解決しない場合は、段階的に起動
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d db
sleep 10
docker compose -f docker-compose.prod.yml up -d backend
sleep 10
docker compose -f docker-compose.prod.yml up -d frontend nginx
```

### データベースが遅い場合

```bash
# VACUUMを実行
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d accounting_app_production -c "VACUUM FULL ANALYZE;"

# 接続数を確認
docker compose -f docker-compose.prod.yml exec db psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

## 10. アップグレード推奨ライン

以下の状況になったらメモリアップグレードを検討：

- 常時メモリ使用率が85%以上
- スワップ使用量が1GB以上
- 同時接続ユーザーが50人以上
- レスポンス時間が2秒以上

**推奨アップグレード**: 4GB RAM

## まとめ

メモリ2GBでも以下の対策で運用可能：

✅ スワップファイルの設定（2GB）
✅ メモリ制限の設定
✅ PostgreSQL最適化
✅ Rails設定の最適化
✅ 定期的なメンテナンス
✅ リソース監視

**同時アクセス数の目安**: 10-30人程度
**データベースレコード数**: 数万件まで快適

それ以上の規模になる場合は、メモリ4GB以上のプランへのアップグレードを推奨します。
