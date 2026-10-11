import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const AVAILABLE_MODELS = [
  { id: 'User', name: 'Users (Staff & Admins)', category: 'Auth & Staff', primaryKey: 'id', description: 'System logins, roles, and credentials' },
  { id: 'Table', name: 'Tables', category: 'Floor & Orders', primaryKey: 'id', description: 'Restaurant floor tables and occupancy statuses' },
  { id: 'Order', name: 'Orders', category: 'Floor & Orders', primaryKey: 'id', description: 'Customer dining & takeaway orders' },
  { id: 'OrderItem', name: 'Order Items', category: 'Floor & Orders', primaryKey: 'id', description: 'Individual line items with quantities and notes' },
  { id: 'Payment', name: 'Payments', category: 'Finance', primaryKey: 'id', description: 'Settlements, payment channels, and discounts' },
  { id: 'Cancellation', name: 'Cancellations', category: 'Finance & Audit', primaryKey: 'id', description: 'Manager-approved item cancellations and reasons' },
  { id: 'Category', name: 'Categories', category: 'Catalog', primaryKey: 'id', description: 'Menu classifications (Food, Drinks, Spirits)' },
  { id: 'MenuItem', name: 'Menu Items', category: 'Catalog', primaryKey: 'id', description: 'Products, prices, stock levels, and bottle links' },
  { id: 'Ingredient', name: 'Ingredients', category: 'Inventory', primaryKey: 'id', description: 'Raw materials (coffee beans, milk, sugar) with cost' },
  { id: 'Recipe', name: 'Recipes', category: 'Inventory', primaryKey: 'id', description: 'Depletion formulas mapping items to ingredients' },
  { id: 'InventoryLog', name: 'Inventory Logs', category: 'Inventory', primaryKey: 'id', description: 'Stock movement and adjustment history' },
  { id: 'ShiftLog', name: 'Shift Logs', category: 'Auth & Staff', primaryKey: 'id', description: 'Clock in and clock out records' },
  { id: 'StaffMember', name: 'Staff Members', category: 'Staff Meals', primaryKey: 'id', description: 'Employees eligible for kitchen meal rations' },
  { id: 'StaffMenuItem', name: 'Staff Menu Items', category: 'Staff Meals', primaryKey: 'id', description: 'Dishes prepared exclusively for staff' },
  { id: 'StaffIngredient', name: 'Staff Ingredients', category: 'Staff Meals', primaryKey: 'id', description: 'Separate inventory for staff kitchen' },
  { id: 'StaffRecipe', name: 'Staff Recipes', category: 'Staff Meals', primaryKey: 'id', description: 'Formulas for staff meal preparation' },
  { id: 'StaffMeal', name: 'Staff Meals', category: 'Staff Meals', primaryKey: 'id', description: 'Served staff meal sessions' },
  { id: 'StaffMealItem', name: 'Staff Meal Items', category: 'Staff Meals', primaryKey: 'id', description: 'Dishes logged within a staff meal session' },
  { id: 'DevAuditLog', name: 'Developer Audit Logs', category: 'System', primaryKey: 'id', description: 'Self-audit trail of portal mutations' },
]

export async function GET() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  return NextResponse.json({ models: AVAILABLE_MODELS })
}
