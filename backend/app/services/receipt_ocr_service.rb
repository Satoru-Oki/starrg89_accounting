require 'net/http'
require 'json'

class ReceiptOcrService
  GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

  # 画像ファイルからOCRでテキストを抽出（Gemini Vision使用）
  def extract_receipt_data(image_path)
    begin
      # 画像処理を実行（枠検出、台形補正、影除去、明るさ補正）
      processor = ReceiptImageProcessor.new
      processing_result = processor.process_receipt_image(image_path)

      # 処理済み画像を使用（エラー時は元の画像）
      processed_image_path = processing_result[:processed_image_path]

      Rails.logger.info "画像処理結果: #{processing_result[:success] ? '成功' : '失敗'}"
      Rails.logger.info "角検出: #{processing_result[:corners_detected] ? 'あり' : 'なし'}"

      # 画像ファイルを読み込んでBase64エンコード
      image_data = File.binread(processed_image_path)
      base64_image = Base64.strict_encode64(image_data)

      # 画像の拡張子からMIMEタイプを判定
      mime_type = case File.extname(image_path).downcase
                  when '.jpg', '.jpeg' then 'image/jpeg'
                  when '.png' then 'image/png'
                  when '.pdf' then 'application/pdf'
                  else 'image/jpeg'
                  end

      # Gemini Vision APIリクエストボディ
      request_body = {
        contents: [
          {
            parts: [
              { text: build_extraction_prompt },
              {
                inline_data: {
                  mime_type: mime_type,
                  data: base64_image
                }
              }
            ]
          }
        ]
      }

      # Gemini APIに送信
      uri = URI("#{GEMINI_API_URL}?key=#{ENV['GEMINI_API_KEY']}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = 60

      request = Net::HTTP::Post.new(uri.request_uri)
      request['Content-Type'] = 'application/json'
      request.body = request_body.to_json

      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        Rails.logger.error "Gemini API Error: #{response.code} #{response.message}"
        Rails.logger.error "Response body: #{response.body}"
        return { error: "Gemini API Error: #{response.code}" }
      end

      # レスポンスをパース
      result = JSON.parse(response.body)
      full_response = result.dig('candidates', 0, 'content', 'parts', 0, 'text') || ''

      Rails.logger.info "Gemini API Response: #{full_response}"

      # JSON形式で返ってきたデータをパース
      parsed_data = parse_gemini_response(full_response)

      {
        date: parsed_data[:date],
        amount: parsed_data[:amount],
        payee: parsed_data[:payee],
        raw_text: full_response
      }
    rescue StandardError => e
      Rails.logger.error "Gemini API処理エラー: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      { error: e.message }
    end
  end

  # アップロードされたファイルから直接OCR（extract_receipt_dataエンドポイント用）
  def extract_from_uploaded_file(uploaded_file)
    return { error: '画像が添付されていません' } unless uploaded_file

    # アップロードされたファイルのtempfileパスを直接使用
    extract_receipt_data(uploaded_file.tempfile.path)
  end

  # Active Storageの添付ファイルからOCR
  def extract_from_attachment(attachment)
    return { error: '画像が添付されていません' } unless attachment.attached?

    # 一時ファイルに保存
    tempfile = Tempfile.new(['receipt', File.extname(attachment.filename.to_s)])
    begin
      attachment.download { |chunk| tempfile.write(chunk) }
      tempfile.rewind
      extract_receipt_data(tempfile.path)
    ensure
      tempfile.close
      tempfile.unlink
    end
  end

  # 収納明細用：アップロードされたファイルから直接OCR
  def extract_payment_detail_from_uploaded_file(uploaded_file)
    return { error: 'ファイルが添付されていません' } unless uploaded_file

    extract_payment_detail_data(uploaded_file.tempfile.path)
  end

  # 収納明細用：Active Storageの添付ファイルからOCR
  def extract_payment_detail_from_attachment(attachment)
    return { error: 'ファイルが添付されていません' } unless attachment.attached?

    # 一時ファイルに保存
    tempfile = Tempfile.new(['payment', File.extname(attachment.filename.to_s)])
    begin
      attachment.download { |chunk| tempfile.write(chunk) }
      tempfile.rewind
      extract_payment_detail_data(tempfile.path)
    ensure
      tempfile.close
      tempfile.unlink
    end
  end

  # 収納明細データの抽出（PDFのみ対応）
  def extract_payment_detail_data(file_path)
    begin
      # ファイルを読み込んでBase64エンコード
      file_data = File.binread(file_path)
      base64_file = Base64.strict_encode64(file_data)

      # ファイルの拡張子からMIMEタイプを判定
      mime_type = case File.extname(file_path).downcase
                  when '.pdf' then 'application/pdf'
                  else 'application/pdf'
                  end

      # Gemini Vision APIリクエストボディ
      request_body = {
        contents: [
          {
            parts: [
              { text: build_payment_detail_prompt },
              {
                inline_data: {
                  mime_type: mime_type,
                  data: base64_file
                }
              }
            ]
          }
        ]
      }

      # Gemini APIに送信
      uri = URI("#{GEMINI_API_URL}?key=#{ENV['GEMINI_API_KEY']}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.read_timeout = 60

      request = Net::HTTP::Post.new(uri.request_uri)
      request['Content-Type'] = 'application/json'
      request.body = request_body.to_json

      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        Rails.logger.error "Gemini API Error: #{response.code} #{response.message}"
        Rails.logger.error "Response body: #{response.body}"
        return { error: "Gemini API Error: #{response.code}" }
      end

      # レスポンスをパース
      result = JSON.parse(response.body)
      full_response = result.dig('candidates', 0, 'content', 'parts', 0, 'text') || ''

      Rails.logger.info "Gemini API Response (Payment Detail): #{full_response}"

      # JSON形式で返ってきたデータをパース
      parsed_data = parse_payment_detail_response(full_response)

      {
        deposit_date: parsed_data[:deposit_date],
        sales_amount: parsed_data[:sales_amount],
        commission_fee: parsed_data[:commission_fee],
        consumption_tax: parsed_data[:consumption_tax],
        transfer_amount: parsed_data[:transfer_amount],
        raw_text: full_response
      }
    rescue StandardError => e
      Rails.logger.error "Gemini API処理エラー: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      { error: e.message }
    end
  end

  private

  # Gemini用のプロンプトを生成
  def build_extraction_prompt
    <<~PROMPT
      この画像はレシートまたは請求書です。以下の情報を抽出してJSON形式で返してください。

      抽出してほしい情報：
      1. date: 日付（YYYY-MM-DD形式）
      2. amount: 合計金額（数値のみ、カンマなし）
      3. payee: 支払先（店舗名や会社名）

      ルール：
      - 日付は必ず YYYY-MM-DD 形式で返す（例: 2025-11-14）
      - 令和の場合は西暦に変換する（令和7年 = 2025年）
      - 金額は合計金額を抽出（小計ではなく、税込み総額）
      - 支払先はレシートの最上部に記載されている店舗名を抽出
      - 情報が見つからない場合はnullを返す

      回答形式（必ずこの形式で返してください）：
      ```json
      {
        "date": "YYYY-MM-DD",
        "amount": 1234,
        "payee": "店舗名"
      }
      ```

      画像を分析して、上記のJSON形式で情報を返してください。
    PROMPT
  end

  # Geminiのレスポンスをパース
  def parse_gemini_response(response)
    # JSONブロックを抽出（```json ... ``` の部分）
    json_match = response.match(/```json\s*(.*?)\s*```/m)

    if json_match
      json_str = json_match[1]
    else
      # ```がない場合は全体をJSONとして扱う
      json_str = response
    end

    begin
      data = JSON.parse(json_str, symbolize_names: true)

      # 日付のバリデーションと正規化
      date = nil
      if data[:date] && data[:date] != 'null'
        begin
          date = Date.parse(data[:date]).to_s
        rescue ArgumentError
          Rails.logger.warn "無効な日付形式: #{data[:date]}"
          date = nil
        end
      end

      # 金額のバリデーション
      amount = nil
      if data[:amount] && data[:amount] != 'null'
        amount = data[:amount].to_i
        amount = nil if amount <= 0
      end

      # 支払先のバリデーション
      payee = nil
      if data[:payee] && data[:payee] != 'null' && data[:payee].to_s.strip != ''
        payee = data[:payee].to_s.strip
      end

      {
        date: date,
        amount: amount,
        payee: payee
      }
    rescue JSON::ParserError => e
      Rails.logger.error "JSON パースエラー: #{e.message}"
      Rails.logger.error "Response: #{response}"

      # フォールバック: テキストから直接抽出を試みる
      {
        date: extract_date_fallback(response),
        amount: extract_amount_fallback(response),
        payee: extract_payee_fallback(response)
      }
    end
  end

  # フォールバック: テキストから日付を抽出
  def extract_date_fallback(text)
    # YYYY-MM-DD形式を探す
    if match = text.match(/(\d{4})-(\d{2})-(\d{2})/)
      begin
        Date.new(match[1].to_i, match[2].to_i, match[3].to_i).to_s
      rescue ArgumentError
        nil
      end
    end
  end

  # フォールバック: テキストから金額を抽出
  def extract_amount_fallback(text)
    # "amount": 1234 のような形式を探す
    if match = text.match(/"amount":\s*(\d+)/)
      match[1].to_i
    end
  end

  # フォールバック: テキストから支払先を抽出
  def extract_payee_fallback(text)
    # "payee": "店舗名" のような形式を探す
    if match = text.match(/"payee":\s*"([^"]+)"/)
      match[1]
    end
  end

  # 収納明細用のプロンプトを生成
  def build_payment_detail_prompt
    <<~PROMPT
      この画像は収納明細書（PDFファイル）です。以下の情報を抽出してJSON形式で返してください。

      抽出してほしい情報：
      1. deposit_date: 入金予定日（YYYY-MM-DD形式）
      2. sales_amount: 売上金額（数値のみ、カンマなし）
      3. commission_fee: 手数料（数値のみ、カンマなし）
      4. consumption_tax: 消費税（数値のみ、カンマなし）
      5. transfer_amount: 振込金額（数値のみ、カンマなし）

      ルール：
      - 日付は必ず YYYY-MM-DD 形式で返す（例: 2025-11-14）
      - 令和の場合は西暦に変換する（令和7年 = 2025年）
      - 金額はすべて数値のみ（カンマなし）
      - 情報が見つからない場合はnullを返す

      回答形式（必ずこの形式で返してください）：
      ```json
      {
        "deposit_date": "YYYY-MM-DD",
        "sales_amount": 1234,
        "commission_fee": 100,
        "consumption_tax": 50,
        "transfer_amount": 1084
      }
      ```

      画像を分析して、上記のJSON形式で情報を返してください。
    PROMPT
  end

  # 収納明細のレスポンスをパース
  def parse_payment_detail_response(response)
    # JSONブロックを抽出（```json ... ``` の部分）
    json_match = response.match(/```json\s*(.*?)\s*```/m)

    if json_match
      json_str = json_match[1]
    else
      # ```がない場合は全体をJSONとして扱う
      json_str = response
    end

    begin
      data = JSON.parse(json_str, symbolize_names: true)

      # 日付のバリデーションと正規化
      deposit_date = nil
      if data[:deposit_date] && data[:deposit_date] != 'null'
        begin
          deposit_date = Date.parse(data[:deposit_date]).to_s
        rescue ArgumentError
          Rails.logger.warn "無効な日付形式: #{data[:deposit_date]}"
          deposit_date = nil
        end
      end

      # 各金額フィールドのバリデーション
      sales_amount = validate_amount(data[:sales_amount])
      commission_fee = validate_amount(data[:commission_fee])
      consumption_tax = validate_amount(data[:consumption_tax])
      transfer_amount = validate_amount(data[:transfer_amount])

      {
        deposit_date: deposit_date,
        sales_amount: sales_amount,
        commission_fee: commission_fee,
        consumption_tax: consumption_tax,
        transfer_amount: transfer_amount
      }
    rescue JSON::ParserError => e
      Rails.logger.error "JSON パースエラー: #{e.message}"
      Rails.logger.error "Response: #{response}"

      {
        deposit_date: nil,
        sales_amount: nil,
        commission_fee: nil,
        consumption_tax: nil,
        transfer_amount: nil
      }
    end
  end

  # 金額のバリデーション
  def validate_amount(amount_data)
    return nil unless amount_data && amount_data != 'null'

    amount = amount_data.to_i
    amount > 0 ? amount : nil
  end
end
