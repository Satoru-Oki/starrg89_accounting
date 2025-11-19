module Api
  module V1
    class ClPaymentsController < BaseController
      def index
        # ユーザーの役割に応じてデータを絞り込む
        if current_user.superadmin?
          # スーパー管理者は全データを閲覧可能
          cl_payments = ClPayment.includes(:user).order(payment_date: :asc, id: :asc)
        elsif current_user.admin?
          # 管理者はスーパー管理者とokiのデータは閲覧できない
          excluded_user_ids = User.where(role: 'superadmin').or(User.where(user_id: 'oki')).pluck(:id)
          cl_payments = ClPayment.includes(:user).where.not(user_id: excluded_user_ids).order(payment_date: :asc, id: :asc)
        else
          # 一般ユーザーは自分のデータのみ閲覧可能
          cl_payments = current_user.cl_payments.order(payment_date: :asc, id: :asc)
        end

        render json: cl_payments.map { |cp| cl_payment_json(cp) }
      end

      def show
        cl_payment = ClPayment.find(params[:id])
        render json: cl_payment_json(cl_payment)
      end

      def create
        cl_payment = current_user.cl_payments.new(cl_payment_params)

        # 支払いファイルが添付されている場合、OCR処理を実行
        if params[:payment_file].present?
          process_payment_file_ocr(cl_payment)
        end

        if cl_payment.save
          render json: cl_payment_json(cl_payment), status: :created
        else
          render json: { errors: cl_payment.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        cl_payment = ClPayment.find(params[:id])

        Rails.logger.info "Updating cl_payment with params: #{cl_payment_params.inspect}"

        # ファイルの削除リクエストがある場合は削除
        if params[:remove_payment_file] == 'true' && cl_payment.payment_file.attached?
          Rails.logger.info "Purging payment file for cl_payment #{cl_payment.id}"
          cl_payment.payment_file.purge
        end

        # 新しいファイルがアップロードされた場合
        if params[:payment_file].present?
          process_payment_file_ocr(cl_payment)
          cl_payment.save
          render json: cl_payment_json(cl_payment)
        else
          # ファイルがアップロードされていない場合は、通常の更新
          if cl_payment.update(cl_payment_params)
            render json: cl_payment_json(cl_payment)
          else
            render json: { errors: cl_payment.errors.full_messages }, status: :unprocessable_entity
          end
        end
      end

      def destroy
        cl_payment = ClPayment.find(params[:id])
        cl_payment.destroy
        head :no_content
      end

      # CL決済ファイルからOCRでデータを抽出
      def extract_cl_payment_data
        unless params[:payment_file].present?
          return render json: { error: 'ファイルが必要です' }, status: :unprocessable_entity
        end

        # OCR処理（アップロードされたファイルを直接使用）
        ocr_service = ReceiptOcrService.new
        result = ocr_service.extract_from_uploaded_file(params[:payment_file])

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

      # スーパー管理者がCL決済ディレクトリを一括閲覧
      def cl_payment_directory
        unless current_user.superadmin?
          render json: { error: 'スーパー管理者のみアクセス可能です' }, status: :forbidden
          return
        end

        # すべてのCL決済でファイル添付があるものを取得
        cl_payments_with_files = ClPayment.includes(:user, payment_file_attachment: :blob)
                                          .where.not(active_storage_attachments: { id: nil })
                                          .order(payment_date: :desc)

        # ツリー構造でデータを整理
        cl_payment_tree = {}

        cl_payments_with_files.each do |cl_payment|
          next unless cl_payment.payment_file.attached? && cl_payment.payment_date

          year = cl_payment.payment_date.year.to_s
          month = cl_payment.payment_date.month.to_s.rjust(2, '0')
          day = cl_payment.payment_date.day.to_s.rjust(2, '0')

          # ツリー構造を作成
          cl_payment_tree[year] ||= {}
          cl_payment_tree[year][month] ||= {}
          cl_payment_tree[year][month][day] ||= []

          # CL決済情報を追加
          cl_payment_tree[year][month][day] << {
            id: cl_payment.id,
            user_id: cl_payment.user_id,
            user_name: cl_payment.user.name,
            date: cl_payment.payment_date.iso8601,
            payment_amount: cl_payment.payment_amount&.to_f,
            vendor: cl_payment.vendor,
            description: cl_payment.description,
            payment_file_url: cl_payment.payment_file.url,
            is_pdf: cl_payment.payment_file.content_type == 'application/pdf'
          }
        end

        render json: { cl_payment_tree: cl_payment_tree }
      end

      private

      # 支払いファイルのOCR処理を実行してフィールドに値を設定
      def process_payment_file_ocr(cl_payment)
        uploaded_file = params[:payment_file]
        return unless uploaded_file

        # PDFまたは画像を受け付ける
        allowed_types = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
        unless allowed_types.include?(uploaded_file.content_type)
          raise StandardError, 'CL決済はPDFまたは画像ファイルのみアップロード可能です'
        end

        content_type = uploaded_file.content_type
        is_pdf = content_type == 'application/pdf'

        # まず画像/PDFを一時的に添付してOCR処理
        cl_payment.payment_file.attach(uploaded_file)

        # OCR処理（失敗しても続行）
        begin
          ocr_service = ReceiptOcrService.new
          result = ocr_service.extract_from_attachment(cl_payment.payment_file)

          unless result[:error]
            # OCRで読み取った値をフィールドに設定（既存の値がない場合のみ）
            ocr_date = result[:date] ? Date.parse(result[:date]) : nil
            cl_payment.payment_date ||= ocr_date if ocr_date
            cl_payment.payment_amount ||= result[:amount] if result[:amount]
            cl_payment.vendor ||= result[:payee] if result[:payee]
          end
        rescue StandardError => e
          Rails.logger.error "OCR処理エラー（保存は続行）: #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
          # OCRが失敗してもファイル保存処理は実行する
        end

        # 日付が確定したので、日付ベースのキーで再アップロード（OCRの成否に関わらず実行）
        if cl_payment.payment_date
          # 既存の添付を削除
          cl_payment.payment_file.purge

          if is_pdf
            # PDFの場合はそのまま保存
            date_path = generate_date_based_key(cl_payment.payment_date, uploaded_file.original_filename, cl_payment.user_id)

            # カスタムキーでアップロード
            uploaded_file.tempfile.rewind
            blob = ActiveStorage::Blob.create_and_upload!(
              io: uploaded_file.tempfile,
              filename: uploaded_file.original_filename,
              content_type: uploaded_file.content_type,
              key: date_path
            )

            cl_payment.payment_file.attach(blob)
          else
            # 画像の場合は圧縮して保存
            compressed_file = compress_image(uploaded_file)
            date_path = generate_date_based_key(cl_payment.payment_date, 'payment.jpg', cl_payment.user_id)

            # カスタムキーで再アップロード
            blob = ActiveStorage::Blob.create_and_upload!(
              io: compressed_file,
              filename: 'payment.jpg',
              content_type: 'image/jpeg',
              key: date_path
            )

            cl_payment.payment_file.attach(blob)
            compressed_file.close
            compressed_file.unlink
          end
        end
      end

      # 画像をJPEG形式に圧縮
      def compress_image(uploaded_file)
        require 'image_processing/vips'

        # 一時ファイルを作成
        tempfile = Tempfile.new(['compressed_payment', '.jpg'])

        begin
          # Vipsで画像を処理
          processed = ImageProcessing::Vips
            .source(uploaded_file.tempfile.path)
            .resize_to_limit(2400, 2400)
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
        "cl_payments/#{year}/#{month}/#{day}/user_#{user_id}_#{random_key}#{extension}"
      end

      def cl_payment_params
        # 許可するパラメータを明示的に指定
        permitted = params.permit(:payment_date, :payment_amount, :vendor, :description, :payment_file)

        Rails.logger.info "Received params: #{params.inspect}"
        Rails.logger.info "Permitted params: #{permitted.inspect}"

        # 空文字列をnullに変換
        permitted[:payment_date] = nil if permitted[:payment_date].blank?
        permitted[:payment_amount] = nil if permitted[:payment_amount].blank?
        permitted[:vendor] = nil if permitted[:vendor].blank?
        permitted[:description] = nil if permitted[:description].blank?

        permitted
      end

      def cl_payment_json(cl_payment)
        payment_file_url = cl_payment.payment_file.attached? ? cl_payment.payment_file.url : nil
        is_pdf = cl_payment.payment_file.attached? && cl_payment.payment_file.content_type == 'application/pdf'

        {
          id: cl_payment.id,
          payment_date: cl_payment.payment_date&.iso8601,
          payment_amount: cl_payment.payment_amount&.to_f,
          vendor: cl_payment.vendor,
          description: cl_payment.description,
          user_id: cl_payment.user_id,
          user_name: cl_payment.user.name,
          user_login_id: cl_payment.user.user_id,
          payment_file_url: payment_file_url,
          is_pdf: is_pdf,
          updated_at: cl_payment.updated_at&.iso8601,
          created_at: cl_payment.created_at&.iso8601
        }
      end
    end
  end
end
