module Api
  module V1
    class TransactionsController < BaseController
      def index
        transactions = if current_user.superadmin?
          # superadminは全てのトランザクションを閲覧可能
          Transaction.includes(:user).all
        elsif current_user.role == 'admin'
          # adminはokiユーザー以外のトランザクションを閲覧可能
          Transaction.includes(:user)
                    .joins(:user)
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
            receipt_url: url_for(transaction.receipt),
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

        # OCR処理
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

          # 日付が確定したので、日付ベースのキーで再アップロード
          if transaction.date
            # 既存の添付を削除
            transaction.receipt.purge

            if is_pdf
              # PDFの場合はそのまま保存（圧縮しない）
              date_path = generate_date_based_key(transaction.date, 'receipt.pdf', transaction.user_id)

              # カスタムキーでアップロード
              blob = ActiveStorage::Blob.create_and_upload!(
                io: uploaded_file.tempfile,
                filename: 'receipt.pdf',
                content_type: 'application/pdf',
                key: date_path
              )

              transaction.receipt.attach(blob)
            else
              # 画像の場合は圧縮してJPEGで保存
              compressed_file = compress_image(uploaded_file)

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
      rescue StandardError => e
        Rails.logger.error "OCR処理エラー: #{e.message}"
        Rails.logger.error e.backtrace.join("\n")
        # エラーが発生してもトランザクション作成は継続
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
          # adminはokiユーザー以外のトランザクションにアクセス可能
          transaction = Transaction.includes(:user).find(params[:id])
          if transaction.user.user_id == 'oki'
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
        receipt_url = transaction.receipt.attached? ? url_for(transaction.receipt) : nil

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
          updated_at: transaction.updated_at&.iso8601,
          created_at: transaction.created_at&.iso8601
        }
      end
    end
  end
end
