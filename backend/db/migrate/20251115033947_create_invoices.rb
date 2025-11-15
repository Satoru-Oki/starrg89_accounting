class CreateInvoices < ActiveRecord::Migration[7.2]
  def change
    create_table :invoices do |t|
      t.references :user, null: false, foreign_key: true
      t.date :invoice_date
      t.decimal :invoice_amount
      t.string :client
      t.text :description
      t.string :status

      t.timestamps
    end
  end
end
