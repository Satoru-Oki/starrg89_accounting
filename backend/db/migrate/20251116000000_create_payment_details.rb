class CreatePaymentDetails < ActiveRecord::Migration[7.2]
  def change
    create_table :payment_details do |t|
      t.references :user, null: false, foreign_key: true
      t.date :deposit_date
      t.decimal :sales_amount, precision: 10, scale: 2
      t.decimal :commission_fee, precision: 10, scale: 2
      t.decimal :consumption_tax, precision: 10, scale: 2
      t.decimal :transfer_amount, precision: 10, scale: 2
      t.text :description

      t.timestamps
    end
  end
end
