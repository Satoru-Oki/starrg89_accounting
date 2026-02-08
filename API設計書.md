# API設計書 - Star R.G 89 経理清算システム

## 概要

本APIは、Star R.G 89の経理清算システムのバックエンドAPIです。Ruby on Rails 7.2で実装されており、フロントエンド（React）との通信に使用されます。

## 基本情報

- **バージョン**: v1
- **ベースURL**: `/api/v1`
- **認証方式**: JWT (JSON Web Token)
- **データ形式**: JSON
- **データベース**: PostgreSQL

## 認証

すべてのAPIエンドポイント（ログインを除く）は、HTTPヘッダーにJWTトークンを含める必要があります。

```
Authorization: Bearer {token}
```

トークンは `/api/v1/auth/login` エンドポイントから取得します。

## ユーザーロール

- **superadmin**: 全てのデータにアクセス可能
- **admin**: スーパー管理者とokiユーザー以外のデータにアクセス可能
- **user**: 自分のデータのみアクセス可能

---

# エンドポイント一覧

## 1. 認証API

### 1.1 ログイン

ユーザー認証を行い、JWTトークンを発行します。

- **エンドポイント**: `POST /api/v1/auth/login`
- **認証**: 不要

#### リクエスト

```json
{
  "userId": "string",
  "password": "string"
}
```

#### レスポンス（成功）

```json
{
  "token": "string",
  "user": {
    "id": 1,
    "user_id": "string",
    "name": "string",
    "email": "string",
    "role": "user|admin|superadmin"
  }
}
```

#### レスポンス（失敗）

- **ステータスコード**: 401 Unauthorized

```json
{
  "message": "Invalid credentials"
}
```

---

### 1.2 トークン検証

JWTトークンの有効性を検証し、ユーザー情報を返します。

- **エンドポイント**: `GET /api/v1/auth/validate`
- **認証**: 必要

#### レスポンス（成功）

```json
{
  "user": {
    "id": 1,
    "user_id": "string",
    "name": "string",
    "email": "string",
    "role": "user|admin|superadmin"
  }
}
```

#### レスポンス（失敗）

- **ステータスコード**: 401 Unauthorized

```json
{
  "errors": "エラーメッセージ"
}
```

---

### 1.3 ログアウト

- **エンドポイント**: `POST /api/v1/auth/logout`
- **認証**: 必要

#### レスポンス

```json
{
  "message": "Logged out successfully"
}
```

---

## 2. ユーザー管理API

### 2.1 ユーザー一覧取得

- **エンドポイント**: `GET /api/v1/users`
- **認証**: 必要（admin以上）
- **権限**: admin, superadmin

#### レスポンス

```json
[
  {
    "id": 1,
    "user_id": "string",
    "name": "string",
    "email": "string",
    "role": "user|admin|superadmin"
  }
]
```

---

### 2.2 ユーザー詳細取得

- **エンドポイント**: `GET /api/v1/users/:id`
- **認証**: 必要

#### レスポンス

```json
{
  "id": 1,
  "user_id": "string",
  "name": "string",
  "email": "string",
  "role": "user|admin|superadmin"
}
```

---

### 2.3 ユーザー作成

- **エンドポイント**: `POST /api/v1/users`
- **認証**: 必要（admin以上）
- **権限**: admin, superadmin

#### リクエスト

```json
{
  "user": {
    "user_id": "string",
    "name": "string",
    "email": "string",
    "password": "string",
    "password_confirmation": "string",
    "role": "user|admin|superadmin"
  }
}
```

#### レスポンス（成功）

- **ステータスコード**: 201 Created

```json
{
  "id": 1,
  "user_id": "string",
  "name": "string",
  "email": "string",
  "role": "user|admin|superadmin"
}
```

#### レスポンス（失敗）

- **ステータスコード**: 422 Unprocessable Entity

```json
{
  "errors": ["エラーメッセージ"]
}
```

---

### 2.4 ユーザー更新

- **エンドポイント**: `PATCH /api/v1/users/:id`
- **認証**: 必要（admin以上）
- **権限**: admin, superadmin

#### リクエスト

```json
{
  "user": {
    "user_id": "string",
    "name": "string",
    "email": "string",
    "password": "string",
    "password_confirmation": "string",
    "role": "user|admin|superadmin"
  }
}
```

#### レスポンス（成功）

```json
{
  "id": 1,
  "user_id": "string",
  "name": "string",
  "email": "string",
  "role": "user|admin|superadmin"
}
```

---

### 2.5 ユーザー削除

- **エンドポイント**: `DELETE /api/v1/users/:id`
- **認証**: 必要（admin以上）
- **権限**: admin, superadmin

#### レスポンス

- **ステータスコード**: 204 No Content

---

## 3. 取引管理API

### 3.1 取引一覧取得

- **エンドポイント**: `GET /api/v1/transactions`
- **認証**: 必要
- **権限**:
  - superadmin: 全データ
  - admin: スーパー管理者とokiユーザー以外のデータ
  - user: 自分のデータのみ

#### レスポンス

```json
[
  {
    "id": 1,
    "date": "2024-01-01",
    "deposit_from_star": 10000.0,
    "payment": 5000.0,
    "category": "string",
    "description": "string",
    "receipt_status": "未添付|領収書配置済",
    "payee": "string",
    "balance": 5000.0,
    "user_id": 1,
    "user_name": "string",
    "user_login_id": "string",
    "receipt_url": null,
    "has_receipt": true,
    "is_pdf": false,
    "updated_at": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

#### 備考

- **`receipt_url`は一覧では常に`null`**です（遅延読込パターン）。レシート画像のURLは詳細取得（`GET /transactions/:id`）時にのみ返されます。これはGCS署名付きURL生成のパフォーマンス最適化のためです。
- `has_receipt`フィールドでレシートの有無を判定し、必要時にフロントエンドが個別にURLを取得します。

---

### 3.2 取引詳細取得

- **エンドポイント**: `GET /api/v1/transactions/:id`
- **認証**: 必要

#### レスポンス

```json
{
  "id": 1,
  "date": "2024-01-01",
  "deposit_from_star": 10000.0,
  "payment": 5000.0,
  "category": "string",
  "description": "string",
  "receipt_status": "未添付|領収書配置済",
  "payee": "string",
  "balance": 5000.0,
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "receipt_url": "https://... (GCS署名付きURL)",
  "has_receipt": true,
  "is_pdf": false,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 3.3 取引作成

- **エンドポイント**: `POST /api/v1/transactions`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
date: "2024-01-01" (必須)
deposit_from_star: 10000.0
payment: 5000.0
category: "string"
description: "string"
receipt_status: "未添付|領収書配置済"
payee: "string"
receipt: File (画像またはPDF)
```

#### レスポンス（成功）

- **ステータスコード**: 201 Created

```json
{
  "id": 1,
  "date": "2024-01-01",
  "deposit_from_star": 10000.0,
  "payment": 5000.0,
  "category": "string",
  "description": "string",
  "receipt_status": "領収書配置済",
  "payee": "string",
  "balance": 5000.0,
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "receipt_url": "https://... (GCS署名付きURL)",
  "has_receipt": true,
  "is_pdf": false,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### 備考

- レシート画像が添付されている場合、OCR処理が自動で実行されます
- OCR処理により、日付・金額・支払先が自動抽出されます
- 画像は自動トリミング・台形補正・影除去・圧縮処理が実行されます
- PDFは500KB以上の場合、自動圧縮されます

---

### 3.4 取引更新

- **エンドポイント**: `PATCH /api/v1/transactions/:id`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
date: "2024-01-01"
deposit_from_star: 10000.0
payment: 5000.0
category: "string"
description: "string"
receipt_status: "未添付|領収書配置済"
payee: "string"
receipt: File (画像またはPDF)
```

#### レスポンス

```json
{
  "id": 1,
  "date": "2024-01-01",
  "deposit_from_star": 10000.0,
  "payment": 5000.0,
  "category": "string",
  "description": "string",
  "receipt_status": "領収書配置済",
  "payee": "string",
  "balance": 5000.0,
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "receipt_url": "https://... (GCS署名付きURL)",
  "has_receipt": true,
  "is_pdf": false,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### 備考

- `receipt_status`を「未添付」に変更すると、既存のレシート画像は削除されます

---

### 3.5 取引削除

- **エンドポイント**: `DELETE /api/v1/transactions/:id`
- **認証**: 必要

#### レスポンス

- **ステータスコード**: 204 No Content

---

### 3.6 レシートOCRデータ抽出

レシート画像から日付・金額・支払先をOCR抽出します。

- **エンドポイント**: `POST /api/v1/transactions/extract_receipt_data`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
receipt: File (画像またはPDF)
```

#### レスポンス（成功）

```json
{
  "date": "2024-01-01",
  "amount": 5000.0,
  "payee": "string",
  "raw_text": "OCR抽出された全テキスト"
}
```

#### レスポンス（失敗）

- **ステータスコード**: 422 Unprocessable Entity

```json
{
  "error": "レシート画像が必要です"
}
```

---

### 3.7 レシート枠検出

カメラプレビュー用にレシート画像の枠検出のみを実行します。

- **エンドポイント**: `POST /api/v1/transactions/detect_receipt_corners`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
receipt: File (画像)
```

#### レスポンス（検出成功）

```json
{
  "corners": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]],
  "detected": true
}
```

#### レスポンス（検出失敗）

```json
{
  "corners": null,
  "detected": false
}
```

---

### 3.8 領収書ディレクトリ取得

全ユーザーの領収書を年月日のツリー構造で取得します。

- **エンドポイント**: `GET /api/v1/transactions/receipt_directory`
- **認証**: 必要
- **権限**: superadmin

#### レスポンス

```json
{
  "receipt_tree": {
    "2024": {
      "01": {
        "15": [
          {
            "id": 1,
            "user_id": 1,
            "user_name": "string",
            "date": "2024-01-15",
            "amount": 5000.0,
            "payee": "string",
            "receipt_url": "https://...",
            "is_pdf": false
          }
        ]
      }
    }
  }
}
```

---

## 4. 請求書管理API

### 4.1 請求書一覧取得

- **エンドポイント**: `GET /api/v1/invoices`
- **認証**: 必要
- **権限**:
  - superadmin: 全データ
  - admin: スーパー管理者とokiユーザー以外のデータ
  - user: 自分のデータのみ

#### レスポンス

```json
[
  {
    "id": 1,
    "invoice_date": "2024-01-01",
    "invoice_amount": 100000.0,
    "client": "string",
    "description": "string",
    "status": "string",
    "user_id": 1,
    "user_name": "string",
    "user_login_id": "string",
    "invoice_file_url": "https://... | null",
    "has_file": true,
    "is_pdf": true,
    "updated_at": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

#### 備考

- `invoice_file_url`はファイル未添付時は`null`です。
- `has_file`でファイルの有無を判定できます。

---

### 4.2 請求書詳細取得

- **エンドポイント**: `GET /api/v1/invoices/:id`
- **認証**: 必要

#### レスポンス

```json
{
  "id": 1,
  "invoice_date": "2024-01-01",
  "invoice_amount": 100000.0,
  "client": "string",
  "description": "string",
  "status": "string",
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "invoice_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 4.3 請求書作成

- **エンドポイント**: `POST /api/v1/invoices`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
invoice_date: "2024-01-01"
invoice_amount: 100000.0
client: "string"
description: "string"
status: "string"
invoice_file: File (画像またはPDF)
```

#### レスポンス（成功）

- **ステータスコード**: 201 Created

```json
{
  "id": 1,
  "invoice_date": "2024-01-01",
  "invoice_amount": 100000.0,
  "client": "string",
  "description": "string",
  "status": "string",
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "invoice_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### 備考

- 請求書ファイルが添付されている場合、OCR処理が自動で実行されます
- OCR処理により、日付・金額・クライアント名が自動抽出されます

---

### 4.4 請求書更新

- **エンドポイント**: `PATCH /api/v1/invoices/:id`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
invoice_date: "2024-01-01"
invoice_amount: 100000.0
client: "string"
description: "string"
status: "string"
invoice_file: File (画像またはPDF)
remove_invoice_file: "true" (ファイル削除時)
```

#### レスポンス

```json
{
  "id": 1,
  "invoice_date": "2024-01-01",
  "invoice_amount": 100000.0,
  "client": "string",
  "description": "string",
  "status": "string",
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "invoice_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 4.5 請求書削除

- **エンドポイント**: `DELETE /api/v1/invoices/:id`
- **認証**: 必要

#### レスポンス

- **ステータスコード**: 204 No Content

---

### 4.6 請求書OCRデータ抽出

- **エンドポイント**: `POST /api/v1/invoices/extract_invoice_data`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
invoice_file: File (画像またはPDF)
```

#### レスポンス（成功）

```json
{
  "invoice_date": "2024-01-01",
  "invoice_amount": 100000.0,
  "client": "string",
  "raw_text": "OCR抽出された全テキスト"
}
```

---

### 4.7 請求書ディレクトリ取得

- **エンドポイント**: `GET /api/v1/invoices/invoice_directory`
- **認証**: 必要
- **権限**: superadmin

#### レスポンス

```json
{
  "invoice_tree": {
    "2024": {
      "01": {
        "15": [
          {
            "id": 1,
            "user_id": 1,
            "user_name": "string",
            "date": "2024-01-15",
            "amount": 100000.0,
            "payee": "string",
            "receipt_url": "https://...",
            "is_pdf": true
          }
        ]
      }
    }
  }
}
```

---

## 5. 収納明細管理API

スーパー管理者のみアクセス可能です。

### 5.1 収納明細一覧取得

- **エンドポイント**: `GET /api/v1/payment_details`
- **認証**: 必要
- **権限**: superadmin

#### レスポンス

```json
[
  {
    "id": 1,
    "deposit_date": "2024-01-01",
    "sales_amount": 100000.0,
    "commission_fee": 5000.0,
    "consumption_tax": 500.0,
    "transfer_amount": 94500.0,
    "user_id": 1,
    "user_name": "string",
    "user_login_id": "string",
    "payment_file_url": "https://... | null",
    "has_file": true,
    "is_pdf": true,
    "updated_at": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

#### 備考

- `payment_file_url`はファイル未添付時は`null`です。
- `has_file`でファイルの有無を判定できます。

---

### 5.2 収納明細詳細取得

- **エンドポイント**: `GET /api/v1/payment_details/:id`
- **認証**: 必要
- **権限**: superadmin

#### レスポンス

```json
{
  "id": 1,
  "deposit_date": "2024-01-01",
  "sales_amount": 100000.0,
  "commission_fee": 5000.0,
  "consumption_tax": 500.0,
  "transfer_amount": 94500.0,
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "payment_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 5.3 収納明細作成

- **エンドポイント**: `POST /api/v1/payment_details`
- **認証**: 必要
- **権限**: superadmin
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
deposit_date: "2024-01-01"
sales_amount: 100000.0
commission_fee: 5000.0
consumption_tax: 500.0
transfer_amount: 94500.0
payment_file: File (PDFのみ)
```

#### レスポンス（成功）

- **ステータスコード**: 201 Created

```json
{
  "id": 1,
  "deposit_date": "2024-01-01",
  "sales_amount": 100000.0,
  "commission_fee": 5000.0,
  "consumption_tax": 500.0,
  "transfer_amount": 94500.0,
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "payment_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### 備考

- PDFファイルのみアップロード可能です
- OCR処理により、入金日・売上金額・手数料・消費税・振込金額が自動抽出されます

---

### 5.4 収納明細更新

- **エンドポイント**: `PATCH /api/v1/payment_details/:id`
- **認証**: 必要
- **権限**: superadmin
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
deposit_date: "2024-01-01"
sales_amount: 100000.0
commission_fee: 5000.0
consumption_tax: 500.0
transfer_amount: 94500.0
payment_file: File (PDFのみ)
remove_payment_file: "true" (ファイル削除時)
```

#### レスポンス

```json
{
  "id": 1,
  "deposit_date": "2024-01-01",
  "sales_amount": 100000.0,
  "commission_fee": 5000.0,
  "consumption_tax": 500.0,
  "transfer_amount": 94500.0,
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "payment_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 5.5 収納明細削除

- **エンドポイント**: `DELETE /api/v1/payment_details/:id`
- **認証**: 必要
- **権限**: superadmin

#### レスポンス

- **ステータスコード**: 204 No Content

---

### 5.6 収納明細OCRデータ抽出

- **エンドポイント**: `POST /api/v1/payment_details/extract_payment_data`
- **認証**: 必要
- **権限**: superadmin
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
payment_file: File (PDFのみ)
```

#### レスポンス（成功）

```json
{
  "deposit_date": "2024-01-01",
  "sales_amount": 100000.0,
  "commission_fee": 5000.0,
  "consumption_tax": 500.0,
  "transfer_amount": 94500.0,
  "raw_text": "OCR抽出された全テキスト"
}
```

---

### 5.7 収納明細ディレクトリ取得

- **エンドポイント**: `GET /api/v1/payment_details/payment_directory`
- **認証**: 必要
- **権限**: superadmin

#### レスポンス

```json
{
  "payment_tree": {
    "2024": {
      "01": {
        "15": [
          {
            "id": 1,
            "user_id": 1,
            "user_name": "string",
            "date": "2024-01-15",
            "sales_amount": 100000.0,
            "transfer_amount": 94500.0,
            "payment_file_url": "https://...",
            "is_pdf": true
          }
        ]
      }
    }
  }
}
```

---

## 6. CL決済管理API

### 6.1 CL決済一覧取得

- **エンドポイント**: `GET /api/v1/cl_payments`
- **認証**: 必要
- **権限**:
  - superadmin: 全データ
  - admin: スーパー管理者とokiユーザー以外のデータ
  - user: 自分のデータのみ

#### レスポンス

```json
[
  {
    "id": 1,
    "payment_date": "2024-01-01",
    "payment_amount": 50000.0,
    "vendor": "string",
    "description": "string",
    "user_id": 1,
    "user_name": "string",
    "user_login_id": "string",
    "payment_file_url": "https://... | null",
    "has_file": true,
    "is_pdf": true,
    "updated_at": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

#### 備考

- `payment_file_url`はファイル未添付時は`null`です。
- `has_file`でファイルの有無を判定できます。

---

### 6.2 CL決済詳細取得

- **エンドポイント**: `GET /api/v1/cl_payments/:id`
- **認証**: 必要

#### レスポンス

```json
{
  "id": 1,
  "payment_date": "2024-01-01",
  "payment_amount": 50000.0,
  "vendor": "string",
  "description": "string",
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "payment_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 6.3 CL決済作成

- **エンドポイント**: `POST /api/v1/cl_payments`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
payment_date: "2024-01-01"
payment_amount: 50000.0
vendor: "string"
description: "string"
payment_file: File (画像またはPDF)
```

#### レスポンス（成功）

- **ステータスコード**: 201 Created

```json
{
  "id": 1,
  "payment_date": "2024-01-01",
  "payment_amount": 50000.0,
  "vendor": "string",
  "description": "string",
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "payment_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### 備考

- PDFまたは画像ファイルをアップロード可能です
- OCR処理により、日付・金額・ベンダー名が自動抽出されます

---

### 6.4 CL決済更新

- **エンドポイント**: `PATCH /api/v1/cl_payments/:id`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
payment_date: "2024-01-01"
payment_amount: 50000.0
vendor: "string"
description: "string"
payment_file: File (画像またはPDF)
remove_payment_file: "true" (ファイル削除時)
```

#### レスポンス

```json
{
  "id": 1,
  "payment_date": "2024-01-01",
  "payment_amount": 50000.0,
  "vendor": "string",
  "description": "string",
  "user_id": 1,
  "user_name": "string",
  "user_login_id": "string",
  "payment_file_url": "https://...",
  "is_pdf": true,
  "updated_at": "2024-01-01T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 6.5 CL決済削除

- **エンドポイント**: `DELETE /api/v1/cl_payments/:id`
- **認証**: 必要

#### レスポンス

- **ステータスコード**: 204 No Content

---

### 6.6 CL決済OCRデータ抽出

- **エンドポイント**: `POST /api/v1/cl_payments/extract_cl_payment_data`
- **認証**: 必要
- **Content-Type**: `multipart/form-data`

#### リクエスト

```
payment_file: File (画像またはPDF)
```

#### レスポンス（成功）

```json
{
  "date": "2024-01-01",
  "amount": 50000.0,
  "payee": "string",
  "raw_text": "OCR抽出された全テキスト"
}
```

---

### 6.7 CL決済ディレクトリ取得

- **エンドポイント**: `GET /api/v1/cl_payments/cl_payment_directory`
- **認証**: 必要
- **権限**: superadmin

#### レスポンス

```json
{
  "cl_payment_tree": {
    "2024": {
      "01": {
        "15": [
          {
            "id": 1,
            "user_id": 1,
            "user_name": "string",
            "date": "2024-01-15",
            "payment_amount": 50000.0,
            "vendor": "string",
            "description": "string",
            "payment_file_url": "https://...",
            "is_pdf": true
          }
        ]
      }
    }
  }
}
```

---

## データモデル

### User（ユーザー）

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| id | integer | PK | ユーザーID |
| user_id | string | NOT NULL, UNIQUE | ログインID |
| name | string | NOT NULL | ユーザー名 |
| email | string | NOT NULL, UNIQUE | メールアドレス |
| password_digest | string | NOT NULL | パスワードハッシュ |
| role | string | DEFAULT: 'user' | ロール（user/admin/superadmin） |
| created_at | datetime | NOT NULL | 作成日時 |
| updated_at | datetime | NOT NULL | 更新日時 |

---

### Transaction（取引）

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| id | integer | PK | 取引ID |
| user_id | integer | FK, NOT NULL | ユーザーID |
| date | date | NOT NULL | 取引日 |
| deposit_from_star | decimal(10,2) | | 入金額 |
| payment | decimal(10,2) | | 支払額 |
| category | string | | カテゴリ |
| description | text | | 説明 |
| receipt_status | string | | 領収書ステータス |
| payee | string | | 支払先 |
| balance | decimal(10,2) | | 残高 |
| created_at | datetime | NOT NULL | 作成日時 |
| updated_at | datetime | NOT NULL | 更新日時 |

**添付ファイル**: `receipt`（画像またはPDF）

---

### Invoice（請求書）

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| id | integer | PK | 請求書ID |
| user_id | integer | FK, NOT NULL | ユーザーID |
| invoice_date | date | | 請求日 |
| invoice_amount | decimal | | 請求金額 |
| client | string | | クライアント名 |
| description | text | | 説明 |
| status | string | | ステータス |
| created_at | datetime | NOT NULL | 作成日時 |
| updated_at | datetime | NOT NULL | 更新日時 |

**添付ファイル**: `invoice_file`（画像またはPDF）

---

### PaymentDetail（収納明細）

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| id | integer | PK | 収納明細ID |
| user_id | integer | FK, NOT NULL | ユーザーID |
| deposit_date | date | | 入金日 |
| sales_amount | decimal(10,2) | | 売上金額 |
| commission_fee | decimal(10,2) | | 手数料 |
| consumption_tax | decimal(10,2) | | 消費税 |
| transfer_amount | decimal(10,2) | | 振込金額 |
| created_at | datetime | NOT NULL | 作成日時 |
| updated_at | datetime | NOT NULL | 更新日時 |

**添付ファイル**: `payment_file`（PDFのみ）

---

### ClPayment（CL決済）

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| id | integer | PK | CL決済ID |
| user_id | integer | FK, NOT NULL | ユーザーID |
| payment_date | date | | 支払日 |
| payment_amount | decimal(10,2) | | 支払金額 |
| vendor | string | | ベンダー名 |
| description | text | | 説明 |
| created_at | datetime | NOT NULL | 作成日時 |
| updated_at | datetime | NOT NULL | 更新日時 |

**添付ファイル**: `payment_file`（画像またはPDF）

---

## エラーレスポンス

### 400 Bad Request

リクエストが不正な場合

```json
{
  "error": "エラーメッセージ"
}
```

---

### 401 Unauthorized

認証エラー

```json
{
  "errors": "エラーメッセージ"
}
```

または

```json
{
  "message": "Invalid credentials"
}
```

---

### 403 Forbidden

権限エラー

```json
{
  "error": "スーパー管理者のみアクセス可能です"
}
```

---

### 404 Not Found

リソースが見つからない場合

```json
{
  "error": "Not Found"
}
```

---

### 422 Unprocessable Entity

バリデーションエラー

```json
{
  "errors": [
    "エラーメッセージ1",
    "エラーメッセージ2"
  ]
}
```

---

## 画像・ファイル処理

### レシート画像処理（Transaction）

1. **自動トリミング**: レシート枠を自動検出し、台形補正を実行
2. **影除去**: 画像から影を除去
3. **圧縮**: 2400x2400px以内にリサイズし、JPEG品質85%で圧縮
4. **OCR**: Google Gemini Vision APIで日付・金額・支払先を抽出
5. **ストレージ**: 日付ベースのパス（`receipts/YYYY/MM/DD/user_{user_id}_{random}.jpg`）に保存

### 請求書画像処理（Invoice）

1. **自動トリミング**: 請求書枠を自動検出し、台形補正を実行
2. **圧縮**: 2400x2400px以内にリサイズし、JPEG品質85%で圧縮
3. **OCR**: Google Gemini Vision APIで日付・金額・クライアント名を抽出
4. **ストレージ**: 日付ベースのパス（`invoices/YYYY/MM/DD/user_{user_id}_{random}.jpg`）に保存

### PDF圧縮

1. **サイズチェック**: 500KB以下の場合は圧縮スキップ
2. **圧縮**: Ghostscriptで/screen設定（72dpi）による高圧縮率で圧縮
3. **比較**: 圧縮後のサイズが元より大きい場合は元のファイルを使用

### CL決済ファイル処理（ClPayment）

1. **PDF**: そのまま保存（圧縮なし）
2. **画像**: 2400x2400px以内にリサイズし、JPEG品質85%で圧縮
3. **OCR**: Google Gemini Vision APIで日付・金額・ベンダー名を抽出
4. **ストレージ**: 日付ベースのパス（`cl_payments/YYYY/MM/DD/user_{user_id}_{random}.{ext}`）に保存

### 収納明細ファイル処理（PaymentDetail）

1. **PDFのみ**: PDFファイルのみアップロード可能
2. **圧縮なし**: 元のPDFをそのまま保存
3. **OCR**: Google Gemini Vision APIで入金日・売上金額・手数料・消費税・振込金額を抽出
4. **ストレージ**: 日付ベースのパス（`payment_details/YYYY/MM/DD/user_{user_id}_{random}.pdf`）に保存

---

## フロントエンド実装例

### Axiosインスタンス設定

フロントエンドでは、以下のように設定されたAxiosインスタンスを使用しています。

**ファイル**: `frontend/src/services/api.ts`

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエストにトークンを追加
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// レスポンスエラーのハンドリング
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### API呼び出し例

#### ログイン

```typescript
const response = await api.post('/auth/login', {
  userId: 'user123',
  password: 'password'
});
const { token, user } = response.data;
localStorage.setItem('token', token);
```

#### 取引一覧取得

```typescript
const response = await api.get('/transactions');
const transactions = response.data;
```

#### レシート画像付き取引作成

```typescript
const formData = new FormData();
formData.append('date', '2024-01-01');
formData.append('payment', '5000');
formData.append('category', 'カテゴリ');
formData.append('receipt', fileObject);

const response = await api.post('/transactions', formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});
```

---

## パフォーマンス最適化

### N+1クエリ防止

全てのコントローラーの一覧取得で、ActiveStorageの添付ファイルとユーザー情報をeager loadingしています。

| エンドポイント | includes |
|---|---|
| `GET /transactions` | `includes(:user, receipt_attachment: :blob)` |
| `GET /invoices` | `includes(:user, invoice_file_attachment: :blob)` |
| `GET /payment_details` | `includes(:user, payment_file_attachment: :blob)` |
| `GET /cl_payments` | `includes(:user, payment_file_attachment: :blob)` |

### 署名付きURL遅延読込（Transactions）

取引一覧（`GET /transactions`）では、GCS署名付きURL生成のコストを避けるため、`receipt_url`を`null`で返します。フロントエンドはレシート表示が必要な時に、`GET /transactions/:id`で個別にURLを取得します。

### 署名付きURL有効期限

ActiveStorageのGCS署名付きURLの有効期限は**24時間**に設定されています（開発・本番共通）。

---

## 備考

- すべての日付は ISO 8601 形式（`YYYY-MM-DD`）で返されます
- すべてのタイムスタンプは ISO 8601 形式（`YYYY-MM-DDTHH:MM:SSZ`）で返されます
- 金額は小数点以下2桁まで保持されます
- ファイルアップロードは `multipart/form-data` 形式で送信します
- OCR処理はGoogle Gemini Vision APIを使用しています
- ファイルはGoogle Cloud Storageに保存されます（日付ベースのパス構造）
- 画像圧縮はVips（libvips）を使用しています
- PDF圧縮はGhostscriptを使用しています

---

## バージョン履歴

- **v1.0**: 初版リリース（2024-01-01）

---

## 作成情報

- **作成日**: 2025-12-27
- **対象システム**: Star R.G 89 経理清算システム
- **バックエンド**: Ruby on Rails 7.2.3
- **フロントエンド**: React 18.3 + TypeScript
- **データベース**: PostgreSQL
