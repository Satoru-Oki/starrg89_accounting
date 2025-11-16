module Api
  module V1
    class InvoicesController < BaseController
      def index
        invoices = if current_user.superadmin?
          # superadminは全てのインボイスを閲覧可能
          Invoice.includes(:user).order(invoice_date: :asc, id: :asc)
        elsif current_user.role == 'admin'
          # adminはスーパー管理者とokiユーザー以外のインボイスを閲覧可能
          Invoice.includes(:user)
                    .joins(:user)
                    .where.not(users: { role: 'superadmin' })
                    .where.not(users: { user_id: 'oki' })
                    .order(invoice_date: :asc, id: :asc)
        else
          # 一般ユーザーは自分のインボイスのみ閲覧可能
          current_user.invoices.order(invoice_date: :asc, id: :asc)
        end

        render json: invoices.map { |i| invoice_json(i) }
      end
      
      def show
        invoice = find_invoice
        render json: invoice_json(invoice)
      end

      def create
        invoice = current_user.invoices.new(invoice_params)

        # インボイスファイルが添付されている場合、OCR処理を実行
        if params[:invoice_file].present?
          process_invoice_file_ocr(invoice)
        end

        if invoice.save
          render json: invoice_json(invoice), status: :created
        else
          render json: { errors: invoice.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def update
        invoice = find_invoice

        Rails.logger.info "Updating invoice with params: #{invoice_params.inspect}"

        # インボイスファイルの削除リクエストがある場合は削除
        if params[:remove_invoice_file] == 'true' && invoice.invoice_file.attached?
          Rails.logger.info "Purging invoice file for invoice #{invoice.id}"
          invoice.invoice_file.purge
        end

        # インボイスファイルが新たに添付された場合、OCR処理を実行
        if params[:invoice_file].present?
          process_invoice_file_ocr(invoice)
        end

        if invoice.update(invoice_params)
          render json: invoice_json(invoice)
        else
          render json: { errors: invoice.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def destroy
        invoice = find_invoice
        invoice.destroy
        head :no_content
      end

      # インボイスファイルからOCRでデータを抽出
      def extract_invoice_data
        unless params[:invoice_file].present?
          return render json: { error: 'インボイスファイルが必要です' }, status: :unprocessable_entity
        end

        # OCR処理（アップロードされたファイルを直接使用）
        ocr_service = ReceiptOcrService.new
        result = ocr_service.extract_from_uploaded_file(params[:invoice_file])

        if result[:error]
          render json: { error: result[:error] }, status: :unprocessable_entity
        else
          render json: {
            invoice_date: result[:date],
            invoice_amount: result[:amount],
            client: result[:payee],
            raw_text: result[:raw_text]
          }
        end
      end

      # 管理者がインボイスディレクトリを一括閲覧
      def invoice_directory
        unless current_user.superadmin?
          return render json: { error: 'スーパー管理者のみアクセス可能です' }, status: :forbidden
        end

        # すべてのインボイスでファイル添付があるものを取得
        invoices_with_files = Invoice.includes(:user, invoice_file_attachment: :blob)
                                               .where.not(active_storage_attachments: { id: nil })
                                               .order(invoice_date: :desc)

        # ツリー構造でデータを整理
        invoice_tree = {}

        invoices_with_files.each do |invoice|
          next unless invoice.invoice_file.attached? && invoice.invoice_date

          year = invoice.invoice_date.year.to_s
          month = invoice.invoice_date.month.to_s.rjust(2, '0')
          day = invoice.invoice_date.day.to_s.rjust(2, '0')

          # ツリー構造を作成
          invoice_tree[year] ||= {}
          invoice_tree[year][month] ||= {}
          invoice_tree[year][month][day] ||= []

          # インボイス情報を追加（フロントエンドのReceiptItemインターフェースに合わせる）
          invoice_tree[year][month][day] << {
            id: invoice.id,
            user_id: invoice.user_id,
            user_name: invoice.user.name,
            date: invoice.invoice_date.iso8601,
            amount: invoice.invoice_amount&.to_f,
            payee: invoice.client,
            receipt_url: invoice.invoice_file.url,
            is_pdf: invoice.invoice_file.content_type == 'application/pdf'
          }
        end

        render json: { invoice_tree: invoice_tree }
      end

      private

      # インボイスファイルのOCR処理を実行してフィールドに値を設定
      def process_invoice_file_ocr(invoice)
        uploaded_file = params[:invoice_file]
        return unless uploaded_file

        # ファイルタイプを確認
        content_type = uploaded_file.content_type
        is_pdf = content_type == 'application/pdf'

        # まず画像/PDFを一時的に添付してOCR処理
        invoice.invoice_file.attach(uploaded_file)

        # OCR処理（失敗しても続行）
        begin
          ocr_service = ReceiptOcrService.new
          result = ocr_service.extract_from_attachment(invoice.invoice_file)

          unless result[:error]
            # OCRで読み取った値をフィールドに設定（既存の値がない場合のみ）
            ocr_date = result[:date] ? Date.parse(result[:date]) : nil
            invoice.invoice_date ||= ocr_date if ocr_date
            invoice.invoice_amount ||= result[:amount] if result[:amount]
            invoice.client ||= result[:payee] if result[:payee]
          end
        rescue StandardError => e
          Rails.logger.error "OCR処理エラー（圧縮は続行）: #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
          # OCRが失敗しても圧縮処理は実行する
        end

        # 日付が確定したので、日付ベースのキーで再アップロード（OCRの成否に関わらず実行）
        if invoice.invoice_date
            # 既存の添付を削除
            invoice.invoice_file.purge

            if is_pdf
              # PDFの場合は圧縮して保存
              compressed_file = compress_pdf(uploaded_file)
              date_path = generate_date_based_key(invoice.invoice_date, 'invoice.pdf', invoice.user_id)

              # カスタムキーでアップロード
              blob = ActiveStorage::Blob.create_and_upload!(
                io: compressed_file,
                filename: 'invoice.pdf',
                content_type: 'application/pdf',
                key: date_path
              )

              invoice.invoice_file.attach(blob)

              # 圧縮で作成した一時ファイルをクリーンアップ（元のファイルと異なる場合のみ）
              if compressed_file != uploaded_file.tempfile
                compressed_file.close
                compressed_file.unlink
              end
            else
              # 画像の場合は自動トリミング→圧縮してJPEGで保存
              trimmed_file = trim_invoice_image(uploaded_file)
              compressed_file = compress_image_from_tempfile(trimmed_file)

              # 日付ベースのキーを生成（拡張子は.jpgに固定）
              date_path = generate_date_based_key(invoice.invoice_date, 'invoice.jpg', invoice.user_id)

              # カスタムキーで再アップロード
              blob = ActiveStorage::Blob.create_and_upload!(
                io: compressed_file,
                filename: 'invoice.jpg',
                content_type: 'image/jpeg',
                key: date_path
              )

              invoice.invoice_file.attach(blob)
              compressed_file.close
              compressed_file.unlink
            end
          end
      end

      # インボイス画像を自動処理（枠検出、台形補正、影除去）
      def trim_invoice_image(uploaded_file)
        processor = ReceiptImageProcessor.new
        result = processor.process_receipt_image(uploaded_file.tempfile.path)

        if result[:success]
          # 処理済み画像のパスからTempfileを作成して返す
          processed_file = Tempfile.new(['processed_invoice', '.jpg'])
          FileUtils.cp(result[:processed_image_path], processed_file.path)
          processed_file.rewind
          processed_file
        else
          # エラー時は元の画像を返す
          Rails.logger.warn "画像処理に失敗しました。元の画像を使用します: #{result[:error]}"
          uploaded_file.tempfile
        end
      end

      # Tempfileから画像をJPEG形式に圧縮
      def compress_image_from_tempfile(tempfile)
        require 'image_processing/vips'

        # 一時ファイルを作成
        compressed_tempfile = Tempfile.new(['compressed_receipt', '.jpg'])

        begin
          # Vipsで画像を処理
          processed = ImageProcessing::Vips
            .source(tempfile.path)
            .resize_to_limit(1200, 1200)
            .convert('jpg')
            .saver(quality: 85)
            .call

          # 処理済み画像を一時ファイルにコピー
          FileUtils.cp(processed.path, compressed_tempfile.path)
          processed.close
          processed.unlink

          # 元のトリミング済みファイルをクリーンアップ
          if tempfile.respond_to?(:close) && tempfile.respond_to?(:unlink)
            tempfile.close
            tempfile.unlink
          end

          compressed_tempfile.rewind
          compressed_tempfile
        rescue StandardError => e
          Rails.logger.error "画像圧縮エラー: #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
          compressed_tempfile.close
          compressed_tempfile.unlink
          # エラー時は元のファイルを新しいTempfileにコピー
          begin
            new_tempfile = Tempfile.new(['receipt', '.jpg'])
            tempfile.rewind
            IO.copy_stream(tempfile, new_tempfile)
            new_tempfile.rewind
            new_tempfile
          rescue => copy_error
            Rails.logger.error "Tempfile copy error: #{copy_error.message}"
            # コピーも失敗した場合は元のtempfileを返す
            tempfile.rewind
            tempfile
          end
        end
      end

      # 画像をJPEG形式に圧縮
      def compress_image(uploaded_file)
        require 'image_processing/vips'

        # 一時ファイルを作成
        tempfile = Tempfile.new(['compressed_receipt', '.jpg'])

        begin
          # Vipsで画像を処理
          processed = ImageProcessing::Vips
            .source(uploaded_file.tempfile.path)
            .resize_to_limit(1200, 1200)
            .convert('jpg')
            .saver(quality: 85)
            .call

          # 処理済み画像を一時ファイルにコピー
          FileUtils.cp(processed.path, tempfile.path)
          processed.close
          processed.unlink

          tempfile.rewind
          tempfile
        rescue StandardError => e
          Rails.logger.error "画像圧縮エラー: #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
          tempfile.close
          tempfile.unlink
          # エラー時は元のファイルを返す
          uploaded_file.tempfile
        end
      end

      # PDFを圧縮（/screen設定で1回のみ圧縮して高速化）
      def compress_pdf(uploaded_file)
        # 元のファイルサイズを確認
        original_size = File.size(uploaded_file.tempfile.path)
        original_kb = (original_size / 1024.0).round(2)

        # 500KB以下なら圧縮しない（ただし新しいTempfileにコピーして返す）
        if original_size <= 500 * 1024
          Rails.logger.info "PDFサイズが500KB以下のため、圧縮をスキップします: #{original_kb}KB"
          # 元のファイルを新しいTempfileにコピー
          tempfile = Tempfile.new(['receipt', '.pdf'])
          uploaded_file.tempfile.rewind
          IO.copy_stream(uploaded_file.tempfile, tempfile)
          tempfile.rewind
          return tempfile
        end

        Rails.logger.info "PDF圧縮開始: 元のサイズ #{original_kb}KB"

        # 一時ファイルを作成
        tempfile = Tempfile.new(['compressed_receipt', '.pdf'])

        begin
          # /screen設定で圧縮（72dpi、高圧縮率）
          result = system(
            'gs',
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            '-dPDFSETTINGS=/screen',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            "-sOutputFile=#{tempfile.path}",
            uploaded_file.tempfile.path
          )

          if result
            compressed_size = File.size(tempfile.path)
            compressed_kb = (compressed_size / 1024.0).round(2)
            Rails.logger.info "PDF圧縮成功: #{original_kb}KB → #{compressed_kb}KB"

            # 圧縮後のサイズが元より大きい場合は元のファイルを使用
            if compressed_size >= original_size
              Rails.logger.info "圧縮後のサイズが大きいため、元のファイルを使用します"
              tempfile.close
              tempfile.unlink
              # 元のファイルを新しいTempfileにコピー
              new_tempfile = Tempfile.new(['receipt', '.pdf'])
              uploaded_file.tempfile.rewind
              IO.copy_stream(uploaded_file.tempfile, new_tempfile)
              new_tempfile.rewind
              return new_tempfile
            end

            tempfile.rewind
            tempfile
          else
            Rails.logger.error "PDF圧縮コマンドが失敗しました"
            tempfile.close
            tempfile.unlink
            # 元のファイルを新しいTempfileにコピー
            new_tempfile = Tempfile.new(['receipt', '.pdf'])
            uploaded_file.tempfile.rewind
            IO.copy_stream(uploaded_file.tempfile, new_tempfile)
            new_tempfile.rewind
            new_tempfile
          end
        rescue StandardError => e
          Rails.logger.error "PDF圧縮エラー: #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
          tempfile.close
          tempfile.unlink
          # 元のファイルを新しいTempfileにコピー
          new_tempfile = Tempfile.new(['receipt', '.pdf'])
          uploaded_file.tempfile.rewind
          IO.copy_stream(uploaded_file.tempfile, new_tempfile)
          new_tempfile.rewind
          new_tempfile
        end
      end

      # 日付ベースのキーを生成
      def generate_date_based_key(date, filename, user_id)
        year = date.year
        month = date.month.to_s.rjust(2, '0')
        day = date.day.to_s.rjust(2, '0')

        # ランダムなキーを生成
        random_key = SecureRandom.base58(24)
        extension = File.extname(filename)

        # ファイル名にユーザーIDを含める
        "invoices/#{year}/#{month}/#{day}/user_#{user_id}_#{random_key}#{extension}"
      end

      def find_invoice
        if current_user.superadmin?
          # superadminは全てのインボイスにアクセス可能
          Invoice.find(params[:id])
        elsif current_user.role == 'admin'
          # adminはスーパー管理者とokiユーザー以外のインボイスにアクセス可能
          invoice = Invoice.includes(:user).find(params[:id])
          if invoice.user.role == 'superadmin' || invoice.user.user_id == 'oki'
            raise ActiveRecord::RecordNotFound
          end
          invoice
        else
          # 一般ユーザーは自分のインボイスのみアクセス可能
          current_user.invoices.find(params[:id])
        end
      end
      
      def invoice_params
        # 許可するパラメータを明示的に指定
        permitted = params.permit(:invoice_date, :invoice_amount, :client, :description, :status, :invoice_file)

        Rails.logger.info "Received params: #{params.inspect}"
        Rails.logger.info "Permitted params: #{permitted.inspect}"

        # 空文字列をnullに変換（数値フィールド）
        permitted[:invoice_amount] = nil if permitted[:invoice_amount].blank?

        permitted
      end
      
      def invoice_json(invoice)
        invoice_file_url = invoice.invoice_file.attached? ? invoice.invoice_file.url : nil
        is_pdf = invoice.invoice_file.attached? && invoice.invoice_file.content_type == 'application/pdf'

        {
          id: invoice.id,
          invoice_date: invoice.invoice_date&.iso8601,
          invoice_amount: invoice.invoice_amount&.to_f,
          client: invoice.client,
          description: invoice.description,
          status: invoice.status,
          user_id: invoice.user_id,
          user_name: invoice.user.name,
          user_login_id: invoice.user.user_id,
          invoice_file_url: invoice_file_url,
          is_pdf: is_pdf,
          updated_at: invoice.updated_at&.iso8601,
          created_at: invoice.created_at&.iso8601
        }
      end
    end
  end
end
