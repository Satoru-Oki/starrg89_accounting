class PaymentDetail < ApplicationRecord
  belongs_to :user
  has_one_attached :payment_file
end
