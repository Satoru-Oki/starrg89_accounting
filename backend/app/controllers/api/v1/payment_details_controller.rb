module Api
  module V1
    class PaymentDetailsController < BaseController
      before_action :ensure_superadmin

      def index
        # superadminのみが全ての収納明細を閲覧可能
        payment_details = PaymentDetail.includes(:user, payment_file_attachment: :blob).order(deposit_date: :asc, id: :asc)
        render json: payment_details.map { |pd| payment_detail_json(pd) }
      end

      def show
        payment_detail = PaymentDetail.find(params[:id])
        render json: payment_detail_json(payment_detail)
      end

      def create
        payment_detail = current_user.payment_details.new(payment_detail_params)

        # ファイルが添付されている場合、OCR処理を実行
        if params[:payment_file].present?
          process_payment_file_ocr(payment_detail)
        end

        if payment_detail.save
          render json: payment_detail_json(payment_detail), status: :created
        else
          render json: { errors: payment_detail.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        payment_detail = PaymentDetail.find(params[:id])

        Rails.logger.info "Updating payment_detail with params: #{payment_detail_params.inspect}"

        # ファイルの削除リクエストがある場合は削除
        if params[:remove_payment_file] == 'true' && payment_detail.payment_file.attached?
          Rails.logger.info "Purging payment file for payment_detail #{payment_detail.id}"
          payment_detail.payment_file.purge
        end

        # 新しいPDFがアップロードされた場合は、OCR結果を優先
        if params[:payment_file].present?
          # OCR処理を実行
          process_payment_file_ocr(payment_detail)
          # OCRで取得した値を保存
          payment_detail.save
          render json: payment_detail_json(payment_detail)
        else
          # PDFがアップロードされていない場合は、通常の更新
          if payment_detail.update(payment_detail_params)
            render json: payment_detail_json(payment_detail)
          else
            render json: { errors: payment_detail.errors.full_messages }, status: :unprocessable_entity
          end
        end
      end

      def destroy
        payment_detail = PaymentDetail.find(params[:id])
        payment_detail.destroy
        head :no_content
      end

      # ファイルからOCRでデータを抽出
      def extract_payment_data
        unless params[:payment_file].present?
          return render json: { error: 'ファイルが必要です' }, status: :unprocessable_entity
        end

        # OCR処理（アップロードされたファイルを直接使用）
        ocr_service = ReceiptOcrService.new
        result = ocr_service.extract_payment_detail_from_uploaded_file(params[:payment_file])

        if result[:error]
          render json: { error: result[:error] }, status: :unprocessable_entity
        else
          render json: {
            deposit_date: result[:deposit_date],
            sales_amount: result[:sales_amount],
            commission_fee: result[:commission_fee],
            consumption_tax: result[:consumption_tax],
            transfer_amount: result[:transfer_amount],
            raw_text: result[:raw_text]
          }
        end
      end

      # スーパー管理者が収納明細ディレクトリを一括閲覧
      def payment_directory
        # すべての収納明細でファイル添付があるものを取得
        payment_details_with_files = PaymentDetail.includes(:user, payment_file_attachment: :blob)
                                               .where.not(active_storage_attachments: { id: nil })
                                               .order(deposit_date: :desc)

        # ツリー構造でデータを整理
        payment_tree = {}

        payment_details_with_files.each do |payment_detail|
          next unless payment_detail.payment_file.attached? && payment_detail.deposit_date

          year = payment_detail.deposit_date.year.to_s
          month = payment_detail.deposit_date.month.to_s.rjust(2, '0')
          day = payment_detail.deposit_date.day.to_s.rjust(2, '0')

          # ツリー構造を作成
          payment_tree[year] ||= {}
          payment_tree[year][month] ||= {}
          payment_tree[year][month][day] ||= []

          # 収納明細情報を追加
          payment_tree[year][month][day] << {
            id: payment_detail.id,
            user_id: payment_detail.user_id,
            user_name: payment_detail.user.name,
            date: payment_detail.deposit_date.iso8601,
            sales_amount: payment_detail.sales_amount&.to_f,
            transfer_amount: payment_detail.transfer_amount&.to_f,
            payment_file_url: payment_detail.payment_file.url,
            is_pdf: payment_detail.payment_file.content_type == 'application/pdf'
          }
        end

        render json: { payment_tree: payment_tree }
      end

      private

      # PDFファイルのOCR処理を実行してフィールドに値を設定
      def process_payment_file_ocr(payment_detail)
        uploaded_file = params[:payment_file]
        return unless uploaded_file

        # PDFのみを受け付ける
        unless uploaded_file.content_type == 'application/pdf'
          raise StandardError, '収納明細はPDFファイルのみアップロード可能です'
        end

        # OCR処理（アップロードされたファイルから直接実行）
        begin
          ocr_service = ReceiptOcrService.new
          result = ocr_service.extract_payment_detail_from_uploaded_file(uploaded_file)

          unless result[:error]
            # OCRで読み取った値をフィールドに設定（新しいPDFがアップロードされた場合は上書き）
            ocr_date = result[:deposit_date] ? Date.parse(result[:deposit_date]) : nil
            payment_detail.deposit_date = ocr_date if ocr_date
            payment_detail.sales_amount = result[:sales_amount] if result[:sales_amount]
            payment_detail.commission_fee = result[:commission_fee] if result[:commission_fee]
            payment_detail.consumption_tax = result[:consumption_tax] if result[:consumption_tax]
            payment_detail.transfer_amount = result[:transfer_amount] if result[:transfer_amount]
          end
        rescue StandardError => e
          Rails.logger.error "OCR処理エラー: #{e.message}"
          Rails.logger.error e.backtrace.join("\n")
          # OCRが失敗してもファイルアップロードは実行する
        end

        # 日付が確定したので、日付ベースのキーでアップロード
        if payment_detail.deposit_date
          date_path = generate_date_based_key(payment_detail.deposit_date, 'payment.pdf', payment_detail.user_id)

          # カスタムキーでアップロード（圧縮なし）
          uploaded_file.tempfile.rewind
          blob = ActiveStorage::Blob.create_and_upload!(
            io: uploaded_file.tempfile,
            filename: 'payment.pdf',
            content_type: 'application/pdf',
            key: date_path
          )

          payment_detail.payment_file.attach(blob)
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
        "payment_details/#{year}/#{month}/#{day}/user_#{user_id}_#{random_key}#{extension}"
      end

      def ensure_superadmin
        unless current_user.superadmin?
          render json: { error: 'スーパー管理者のみアクセス可能です' }, status: :forbidden
        end
      end

      def payment_detail_params
        # 許可するパラメータを明示的に指定
        permitted = params.permit(:deposit_date, :sales_amount, :commission_fee, :consumption_tax, :transfer_amount, :payment_file)

        Rails.logger.info "Received params: #{params.inspect}"
        Rails.logger.info "Permitted params: #{permitted.inspect}"

        # 空文字列をnullに変換
        permitted[:deposit_date] = nil if permitted[:deposit_date].blank?
        permitted[:sales_amount] = nil if permitted[:sales_amount].blank?
        permitted[:commission_fee] = nil if permitted[:commission_fee].blank?
        permitted[:consumption_tax] = nil if permitted[:consumption_tax].blank?
        permitted[:transfer_amount] = nil if permitted[:transfer_amount].blank?

        permitted
      end

      def payment_detail_json(payment_detail)
        payment_file_url = payment_detail.payment_file.attached? ? payment_detail.payment_file.url : nil
        is_pdf = payment_detail.payment_file.attached? && payment_detail.payment_file.content_type == 'application/pdf'

        {
          id: payment_detail.id,
          deposit_date: payment_detail.deposit_date&.iso8601,
          sales_amount: payment_detail.sales_amount&.to_f,
          commission_fee: payment_detail.commission_fee&.to_f,
          consumption_tax: payment_detail.consumption_tax&.to_f,
          transfer_amount: payment_detail.transfer_amount&.to_f,
          user_id: payment_detail.user_id,
          user_name: payment_detail.user.name,
          user_login_id: payment_detail.user.user_id,
          payment_file_url: payment_file_url,
          is_pdf: is_pdf,
          updated_at: payment_detail.updated_at&.iso8601,
          created_at: payment_detail.created_at&.iso8601
        }
      end
    end
  end
end
