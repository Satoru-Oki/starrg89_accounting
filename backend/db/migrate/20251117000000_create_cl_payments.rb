class CreateClPayments < ActiveRecord::Migration[7.2]
  def change
    create_table :cl_payments do |t|
      t.references :user, null: false, foreign_key: true
      t.date :payment_date
      t.decimal :payment_amount, precision: 10, scale: 2
      t.string :vendor
      t.text :description

      t.timestamps
    end
  end
end
