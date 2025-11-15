class User < ApplicationRecord
  has_secure_password

  has_many :transactions, dependent: :destroy
  has_many :invoices, dependent: :destroy

  validates :user_id, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :name, presence: true
  validates :role, inclusion: { in: %w[superadmin admin user] }

  # superadminかどうかを判定
  def superadmin?
    role == 'superadmin'
  end

  # adminまたはsuperadminかどうかを判定
  def admin_or_superadmin?
    role == 'admin' || role == 'superadmin'
  end
end
