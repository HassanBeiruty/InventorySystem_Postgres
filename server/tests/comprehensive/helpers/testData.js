/**
 * Test data generator for comprehensive tests
 */

class TestDataGenerator {
	constructor() {
		this.counter = Date.now();
	}

	generateUser() {
		this.counter++;
		return {
			email: `testuser${this.counter}@example.com`,
			password: 'TestPassword123!'
		};
	}

	generateCustomer() {
		this.counter++;
		return {
			name: `Test Customer ${this.counter}`,
			phone: `+961${Math.floor(Math.random() * 10000000)}`,
			address: `Test Address ${this.counter}`,
			credit_limit: Math.floor(Math.random() * 5000) + 1000
		};
	}

	generateSupplier() {
		this.counter++;
		return {
			name: `Test Supplier ${this.counter}`,
			phone: `+961${Math.floor(Math.random() * 10000000)}`,
			address: `Test Address ${this.counter}`
		};
	}

	generateCategory() {
		this.counter++;
		return {
			name: `Test Category ${this.counter}`,
			description: `Test category description ${this.counter}`
		};
	}

	generateProduct(categoryId = null) {
		this.counter++;
		return {
			name: `Test Product ${this.counter}`,
			barcode: `BAR${this.counter}`,
			description: `Test product description ${this.counter}`,
			sku: `SKU${this.counter}`,
			shelf: `Shelf-${Math.floor(Math.random() * 10)}`,
			category_id: categoryId
		};
	}

	generateInvoice(type = 'buy', customerId = null, supplierId = null, items = []) {
		this.counter++;
		const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0);
		return {
			invoice_type: type,
			customer_id: customerId,
			supplier_id: supplierId,
			total_amount: totalAmount,
			is_paid: false,
			due_date: null,
			items: items
		};
	}

	generateInvoiceItem(productId, quantity = 10, unitPrice = 20.00) {
		return {
			product_id: productId,
			quantity: quantity,
			unit_price: unitPrice,
			total_price: quantity * unitPrice,
			price_type: 'wholesale',
			is_private_price: false
		};
	}

	generatePayment(amount, currency = 'USD', exchangeRate = 1.0) {
		return {
			paid_amount: amount,
			currency_code: currency,
			exchange_rate_on_payment: exchangeRate,
			payment_method: 'cash',
			notes: `Test payment ${this.counter}`
		};
	}

	generateProductPrice(productId, wholesalePrice = 50.00, retailPrice = 75.00) {
		return {
			product_id: productId,
			wholesale_price: wholesalePrice,
			retail_price: retailPrice,
			effective_date: new Date().toISOString().split('T')[0]
		};
	}

	generateExchangeRate(currency = 'LBP', rate = 89500) {
		return {
			currency_code: currency,
			rate_to_usd: rate,
			effective_date: new Date().toISOString().split('T')[0],
			is_active: true
		};
	}
}

module.exports = TestDataGenerator;

