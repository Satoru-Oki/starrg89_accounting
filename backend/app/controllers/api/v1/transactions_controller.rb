module Api
  module V1
    class TransactionsController < BaseController
      def index
        transactions = if current_user.role == 'admin'
          Transaction.includes(:user).all
        else
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
        
        if transaction.save
          render json: transaction_json(transaction), status: :created
        else
          render json: { errors: transaction.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def update
        transaction = find_transaction
        
        Rails.logger.info "Updating transaction with params: #{transaction_params.inspect}"
        
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
      
      private
      
      def find_transaction
        if current_user.role == 'admin'
          Transaction.find(params[:id])
        else
          current_user.transactions.find(params[:id])
        end
      end
      
      def transaction_params
        # 許可するパラメータを明示的に指定
        permitted = params.permit(:date, :deposit_from_star, :payment, :category, :description, :receipt_status)
        
        Rails.logger.info "Received params: #{params.inspect}"
        Rails.logger.info "Permitted params: #{permitted.inspect}"
        
        permitted
      end
      
      def transaction_json(transaction)
        {
          id: transaction.id,
          date: transaction.date&.iso8601,
          deposit_from_star: transaction.deposit_from_star&.to_f,
          payment: transaction.payment&.to_f,
          category: transaction.category,
          description: transaction.description,
          receipt_status: transaction.receipt_status,
          balance: transaction.balance&.to_f,
          user_id: transaction.user_id,
          user_name: transaction.user.name,
          updated_at: transaction.updated_at&.iso8601,
          created_at: transaction.created_at&.iso8601
        }
      end
    end
  end
end
