module Api
  module V1
    class TransactionsController < BaseController
      def index
        transactions = if current_user.superadmin?
          # superadminは全てのトランザクションを閲覧可能
          Transaction.includes(:user).all
        elsif current_user.role == 'admin'
          # adminはスーパー管理者とokiユーザー以外のトランザクションを閲覧可能
          Transaction.includes(:user)
                    .joins(:user)
                    .where.not(users: { role: 'superadmin' })
                    .where.not(users: { user_id: 'oki' })
        else
          # 一般ユーザーは自分のトランザクションのみ閲覧可能
          current_user.transactions
        end

        render json: transactions.map { |t| transaction_json(t) }
      end
      
      def show
        transaction = find_transaction
        render json: transaction_json(transaction)
      end
      
      def create
        transaction = current_user.transactions.new(transaction_params)

        # レシート画像が添付されている場合、OCR処理を実行
        if params[:receipt].present?
          process_receipt_ocr(transaction)
        end

        if transaction.save
          render json: transaction_json(transaction), status: :created
        else
          render json: { errors: transaction.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def update
        transaction = find_transaction

        Rails.logger.info "Updating transaction with params: #{transaction_params.inspect}"

        # レシート画像が新たに添付された場合、OCR処理を実行
        if params[:receipt].present?
          process_receipt_ocr(transaction)
        end

        if transaction.update(transaction_params)
          render json: transaction_json(transaction)
        else
          render json: { errors: transaction.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def destroy
        transaction = find_transaction
        transaction.destroy
        head :no_content
      end

      # レシート画像からOCRでデータを抽出
      def extract_receipt_data
        unless params[:receipt].present?
          return render json: { error: 'レシート画像が必要です' }, status: :unprocessable_entity
        end

        # OCR処理（アップロードされたファイルを直接使用）
        ocr_service = ReceiptOcrService.new
        result = ocr_service.extract_from_uploaded_file(params[:receipt])

        if result[:error]
          render json: { error: result[:error] }, status: :unprocessable_entity
        else
          render json: {
            date: result[:date],
            amount: result[:amount],
            payee: result[:payee],
            raw_text: result[:raw_text]
          }
        end
      end

      # 管理者がレシートディレクトリを一括閲覧
      def receipt_directory
        unless current_user.superadmin?
          return render json: { error: 'スーパー管理者のみアクセス可能です' }, status: :forbidden
        end

        # すべてのトランザクションでレシート添付があるものを取得
        transactions_with_receipts = Transaction.includes(:user, receipt_attachment: :blob)
                                               .where.not(active_storage_attachments: { id: nil })
                                               .order(date: :desc)

        # ツリー構造でデータを整理
        receipt_tree = {}

        transactions_with_receipts.each do |transaction|
          next unless transaction.receipt.attached? && transaction.date

          year = transaction.date.year.to_s
          month = transaction.date.month.to_s.rjust(2, '0')
          day = transaction.date.day.to_s.rjust(2, '0')

          # ツリー構造を作成
          receipt_tree[year] ||= {}
          receipt_tree[year][month] ||= {}
          receipt_tree[year][month][day] ||= []

          # レシート情報を追加
          receipt_tree[year][month][day] << {
            id: transaction.id,
            user_id: transaction.user_id,
            user_name: transaction.user.name,
            date: transaction.date.iso8601,
            amount: transaction.payment&.to_f,
            payee: transaction.payee,
            receipt_url: transaction.receipt.url,
            is_pdf: transaction.receipt.content_type == 'application/pdf'
          }
        end

        render json: { receipt_tree: receipt_tree }
      end

      private

      # レシート画像のOCR処理を実行してフィールドに値を設定
      def process_receipt_ocr(transaction)
        uploaded_file = params[:receipt]
        return unless uploaded_file

        # ファイルタイプを確認
        content_type = uploaded_file.content_type
        is_pdf = content_type == 'application/pdf'

        # まず画像/PDFを一時的に添付してOCR処理
        transaction.receipt.attach(uploaded_file)

        # OCR処理（失敗しても続行）
        begin
          ocr_service = ReceiptOcrService.new
          result = ocr_service.extract_from_attachment(transaction.receipt)

          unless result[:error]
            # OCRで読み取った値をフィールドに設定（既存の値がない場合のみ）
            ocr_date = result[:date] ? Date.parse(result[:date]) : nil
            transaction.date ||= ocr_date if ocr_date
            transaction.payment ||= result[:amount] if result[:amount]
            transaction.payee ||= result[:payee] if result[:payee]

            # レシート添付済みとして記録
            transaction.receipt_status = 'レシート画像配置済'
          end
        rescue StandardError => e
          Rails.logger.error "OCR処理エラー（圧縮は続行）: #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
          # OCRが失敗しても圧縮処理は実行する
        end

        # 日付が確定したので、日付ベースのキーで再アップロード（OCRの成否に関わらず実行）
        if transaction.date
            # 既存の添付を削除
            transaction.receipt.purge

            if is_pdf
              # PDFの場合は圧縮して保存
              compressed_file = compress_pdf(uploaded_file)
              date_path = generate_date_based_key(transaction.date, 'receipt.pdf', transaction.user_id)

              # カスタムキーでアップロード
              blob = ActiveStorage::Blob.create_and_upload!(
                io: compressed_file,
                filename: 'receipt.pdf',
                content_type: 'application/pdf',
                key: date_path
              )

              transaction.receipt.attach(blob)

              # 圧縮で作成した一時ファイルをクリーンアップ（元のファイルと異なる場合のみ）
              if compressed_file != uploaded_file.tempfile
                compressed_file.close
                compressed_file.unlink
              end
            else
              # 画像の場合は自動トリミング→圧縮してJPEGで保存
              trimmed_file = trim_receipt_image(uploaded_file)
              compressed_file = compress_image_from_tempfile(trimmed_file)

              # 日付ベースのキーを生成（拡張子は.jpgに固定）
              date_path = generate_date_based_key(transaction.date, 'receipt.jpg', transaction.user_id)

              # カスタムキーで再アップロード
              blob = ActiveStorage::Blob.create_and_upload!(
                io: compressed_file,
                filename: 'receipt.jpg',
                content_type: 'image/jpeg',
                key: date_path
              )

              transaction.receipt.attach(blob)
              compressed_file.close
              compressed_file.unlink
            end
          end
      end

      # レシート画像を自動トリミング
      def trim_receipt_image(uploaded_file)
        trimming_service = ReceiptTrimmingService.new
        trimming_service.trim_receipt(uploaded_file)
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
          # エラー時は元のファイルを返す
          tempfile
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

      # PDFを圧縮（段階的に圧縮レベルを上げて500KB以下を目指す）
      def compress_pdf(uploaded_file)
        # 元のファイルサイズを確認
        original_size = File.size(uploaded_file.tempfile.path)
        original_kb = (original_size / 1024.0).round(2)

        # 500KB以下なら圧縮しない
        if original_size <= 500 * 1024
          Rails.logger.info "PDFサイズが500KB以下のため、圧縮をスキップします: #{original_kb}KB"
          return uploaded_file.tempfile
        end

        Rails.logger.info "PDF圧縮開始: 元のサイズ #{original_kb}KB"

        # 段階1: /ebook設定で圧縮（150dpi）
        result_file = compress_pdf_with_settings(uploaded_file.tempfile.path, '/ebook', '150dpi標準品質')
        result_size = File.size(result_file.path)
        result_kb = (result_size / 1024.0).round(2)

        if result_size <= 500 * 1024
          Rails.logger.info "段階1(/ebook)で目標達成: #{result_kb}KB"
          return result_file
        end

        # 段階2: /screen設定で圧縮（72dpi）
        Rails.logger.info "段階1で#{result_kb}KB、段階2(/screen)を実行"
        result_file.close
        result_file.unlink

        result_file = compress_pdf_with_settings(uploaded_file.tempfile.path, '/screen', '72dpi標準品質')
        result_size = File.size(result_file.path)
        result_kb = (result_size / 1024.0).round(2)

        if result_size <= 500 * 1024
          Rails.logger.info "段階2(/screen)で目標達成: #{result_kb}KB"
          return result_file
        end

        # 段階3: カスタム設定で強力に圧縮（96dpi + JPEG品質60）
        Rails.logger.info "段階2で#{result_kb}KB、段階3(カスタム低品質)を実行"
        result_file.close
        result_file.unlink

        result_file = compress_pdf_custom_aggressive(uploaded_file.tempfile.path)
        result_size = File.size(result_file.path)
        result_kb = (result_size / 1024.0).round(2)

        if result_size <= 500 * 1024
          Rails.logger.info "段階3(カスタム)で目標達成: #{result_kb}KB"
        else
          Rails.logger.warn "段階3でも#{result_kb}KB、これ以上の圧縮は困難です"
        end

        result_file
      rescue StandardError => e
        Rails.logger.error "PDF圧縮エラー: #{e.message}"
        Rails.logger.error e.backtrace.join("\n")
        uploaded_file.tempfile
      end

      # 指定されたプリセット設定でPDFを圧縮
      def compress_pdf_with_settings(input_path, preset, description)
        tempfile = Tempfile.new(['compressed_receipt', '.pdf'])

        result = system(
          'gs',
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          "-dPDFSETTINGS=#{preset}",
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          "-sOutputFile=#{tempfile.path}",
          input_path
        )

        if result
          tempfile.rewind
          tempfile
        else
          Rails.logger.error "PDF圧縮(#{description})コマンドが失敗しました"
          tempfile.close
          tempfile.unlink
          # エラー時は元のファイルを一時ファイルとして返す
          temp = Tempfile.new(['fallback_receipt', '.pdf'])
          FileUtils.cp(input_path, temp.path)
          temp.rewind
          temp
        end
      end

      # カスタム設定で強力にPDFを圧縮（96dpi + JPEG品質60）
      def compress_pdf_custom_aggressive(input_path)
        tempfile = Tempfile.new(['compressed_receipt', '.pdf'])

        result = system(
          'gs',
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          '-dDownsampleColorImages=true',
          '-dDownsampleGrayImages=true',
          '-dDownsampleMonoImages=true',
          '-dColorImageResolution=96',
          '-dGrayImageResolution=96',
          '-dMonoImageResolution=150',
          '-dColorImageDownsampleType=/Bicubic',
          '-dGrayImageDownsampleType=/Bicubic',
          '-dAutoFilterColorImages=false',
          '-dAutoFilterGrayImages=false',
          '-dColorImageFilter=/DCTEncode',
          '-dGrayImageFilter=/DCTEncode',
          '-c', '.setpdfwrite << /ColorImageDict << /QFactor 0.76 /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >> >> setdistillerparams',
          '-f', input_path,
          "-sOutputFile=#{tempfile.path}"
        )

        if result
          tempfile.rewind
          tempfile
        else
          Rails.logger.error "PDF圧縮(カスタム強力)コマンドが失敗しました"
          tempfile.close
          tempfile.unlink
          # エラー時は元のファイルを一時ファイルとして返す
          temp = Tempfile.new(['fallback_receipt', '.pdf'])
          FileUtils.cp(input_path, temp.path)
          temp.rewind
          temp
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
        "receipts/#{year}/#{month}/#{day}/user_#{user_id}_#{random_key}#{extension}"
      end

      def find_transaction
        if current_user.superadmin?
          # superadminは全てのトランザクションにアクセス可能
          Transaction.find(params[:id])
        elsif current_user.role == 'admin'
          # adminはスーパー管理者とokiユーザー以外のトランザクションにアクセス可能
          transaction = Transaction.includes(:user).find(params[:id])
          if transaction.user.role == 'superadmin' || transaction.user.user_id == 'oki'
            raise ActiveRecord::RecordNotFound
          end
          transaction
        else
          # 一般ユーザーは自分のトランザクションのみアクセス可能
          current_user.transactions.find(params[:id])
        end
      end
      
      def transaction_params
        # 許可するパラメータを明示的に指定
        permitted = params.permit(:date, :deposit_from_star, :payment, :category, :description, :receipt_status, :payee, :receipt)

        Rails.logger.info "Received params: #{params.inspect}"
        Rails.logger.info "Permitted params: #{permitted.inspect}"

        permitted
      end
      
      def transaction_json(transaction)
        receipt_url = transaction.receipt.attached? ? transaction.receipt.url : nil
        is_pdf = transaction.receipt.attached? && transaction.receipt.content_type == 'application/pdf'

        {
          id: transaction.id,
          date: transaction.date&.iso8601,
          deposit_from_star: transaction.deposit_from_star&.to_f,
          payment: transaction.payment&.to_f,
          category: transaction.category,
          description: transaction.description,
          receipt_status: transaction.receipt_status,
          payee: transaction.payee,
          balance: transaction.balance&.to_f,
          user_id: transaction.user_id,
          user_name: transaction.user.name,
          user_login_id: transaction.user.user_id,
          receipt_url: receipt_url,
          is_pdf: is_pdf,
          updated_at: transaction.updated_at&.iso8601,
          created_at: transaction.created_at&.iso8601
        }
      end
    end
  end
end
