class Transaction < ApplicationRecord
  belongs_to :user
  
  validates :date, presence: true
  validates :user, presence: true
  
  after_commit :recalculate_user_balances, on: [:create, :update, :destroy]
  
  scope :by_date, -> { order(date: :asc, id: :asc) }
  scope :for_user, ->(user_id) { where(user_id: user_id) }
  scope :for_month, ->(year, month) { where('EXTRACT(YEAR FROM date) = ? AND EXTRACT(MONTH FROM date) = ?', year, month) }
  
  private
  
  def recalculate_user_balances
    return unless user_id
    
    # 同じユーザーの全取引を日付順に取得
    transactions = Transaction.where(user_id: user_id).by_date
    
    # 残高を順次計算して更新
    current_balance = 0
    transactions.each do |transaction|
      deposit = transaction.deposit_from_star || 0
      payment = transaction.payment || 0
      current_balance += deposit - payment
      
      # update_columnを使用してコールバックをスキップ
      transaction.update_column(:balance, current_balance) if transaction.balance != current_balance
    end
  end
end
