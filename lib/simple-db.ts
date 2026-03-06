// Simple in-memory database for development
// This will be replaced with proper database in production

interface Business {
  id: string;
  phone: string;
  name: string | null;
  language: string;
  createdAt: Date;
}

interface Transaction {
  id: string;
  businessId: string;
  customerId: string | null;
  itemName: string | null;
  quantity: number | null;
  unit: string | null;
  price: number;
  type: string;
  date: Date;
  aiConfidence: number | null;
  sourceType: string | null;
  sourceImageUrl: string | null;
  rawText: string | null;
  isConfirmed: boolean;
  createdAt: Date;
}

interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  totalUdhar: number;
  createdAt: Date;
}

class SimpleDatabase {
  private businesses: Map<string, Business> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  private customers: Map<string, Customer> = new Map();

  // Business operations
  async findBusinessByPhone(phone: string): Promise<Business | null> {
    for (const business of Array.from(this.businesses.values())) {
      if (business.phone === phone) {
        return business;
      }
    }
    return null;
  }

  async createBusiness(data: { phone: string; name?: string | null; language?: string }): Promise<Business> {
    const id = `business_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const business: Business = {
      id,
      phone: data.phone,
      name: data.name || null,
      language: data.language || "hi",
      createdAt: new Date(),
    };
    this.businesses.set(id, business);
    return business;
  }

  async findBusinessById(id: string): Promise<Business | null> {
    return this.businesses.get(id) || null;
  }

  // Transaction operations
  async createTransaction(data: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
    const id = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transaction: Transaction = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async getTransactionsByBusiness(businessId: string): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    for (const transaction of Array.from(this.transactions.values())) {
      if (transaction.businessId === businessId) {
        transactions.push(transaction);
      }
    }
    return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  // Customer operations
  async createCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
    const id = `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customer: Customer = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.customers.set(id, customer);
    return customer;
  }

  async getCustomersByBusiness(businessId: string): Promise<Customer[]> {
    const customers: Customer[] = [];
    for (const customer of Array.from(this.customers.values())) {
      if (customer.businessId === businessId) {
        customers.push(customer);
      }
    }
    return customers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findCustomerById(id: string): Promise<Customer | null> {
    return this.customers.get(id) || null;
  }

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer | null> {
    const customer = this.customers.get(id);
    if (!customer) return null;
    
    const updatedCustomer = { ...customer, ...data };
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }
}

export const db = new SimpleDatabase();
