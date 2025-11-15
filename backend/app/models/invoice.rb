class Invoice < ApplicationRecord
  belongs_to :user
  has_one_attached :invoice_file

  validates :invoice_date, presence: true
  validates :status, inclusion: { in: ['支払い済', '未払い'] }
end
