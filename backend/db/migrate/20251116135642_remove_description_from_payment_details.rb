class RemoveDescriptionFromPaymentDetails < ActiveRecord::Migration[7.2]
  def change
    remove_column :payment_details, :description, :text
  end
end
