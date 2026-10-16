import React, { useEffect, useState } from 'react';
import { Printer, Plus, Pencil, Trash2, UserPlus, ToggleLeft, ToggleRight, Loader2, Utensils, Calendar, Clock, User, Package } from 'lucide-react';
import Portal from '@/components/Portal';
import { printTicketHtml } from '@/lib/printer';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  shift: string;
  active: boolean;
}

interface StaffMenuItem {
  id: string;
  name: string;
  mealType: string;
}

interface StaffIngredient {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minThreshold: number;
}

interface StaffRecipe {
  id: string;
  staffMenuItemId: string;
  staffIngredientId: string;
  quantity: number;
  staffIngredient: StaffIngredient;
}

interface StaffMeal {
  id: string;
  staffMember: { id: string; name: string; role: string; shift: string };
  mealType: string;
  servedAt: string;
  items: { id: string; name: string; quantity: number }[];
}

export default function StaffMealPanel({ from, to }: { from: string; to: string }) {
  const [role, setRole] = useState('WAITER');
  const [activeTab, setActiveTab] = useState<'logs' | 'roster' | 'menu' | 'inventory'>('logs');

  // Data States
  const [meals, setMeals] = useState<StaffMeal[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [menuItems, setMenuItems] = useState<StaffMenuItem[]>([]);
  const [ingredients, setIngredients] = useState<StaffIngredient[]>([]);
  const [recipes, setRecipes] = useState<StaffRecipe[]>([]);

  // Loading States
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  
  // Filter States
  const [staffFilter, setStaffFilter] = useState('');
  const [mealTypeFilter, setMealTypeFilter] = useState('');

  // Toast / Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal States
  const [showMealModal, setShowMealModal] = useState(false);
  const [mealForm, setMealForm] = useState({ staffMemberId: '', mealType: 'BREAKFAST', staffMenuItemId: '', servedAt: '' });
  const [savingMeal, setSavingMeal] = useState(false);

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ id: '', name: '', role: 'Waiter', shift: 'Morning' });
  const [savingStaff, setSavingStaff] = useState(false);

  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuForm, setMenuForm] = useState({ id: '', name: '', mealType: 'BREAKFAST' });
  const [savingMenuBtn, setSavingMenuBtn] = useState(false);

  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [ingredientForm, setIngredientForm] = useState({ id: '', name: '', unit: 'pieces', quantity: '0', minThreshold: '0' });
  const [savingIngredient, setSavingIngredient] = useState(false);

  // Recipe manager (inside Inventory tab)
  const [recipeMenuItemId, setRecipeMenuItemId] = useState('');
  const [recipeLineForm, setRecipeLineForm] = useState({ staffIngredientId: '', quantity: '1' });
  const [savingRecipe, setSavingRecipe] = useState(false);

  // Fetch Session User Role
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.role) {
          const userRole = data.role;
          setRole(userRole);
          if (userRole === 'MANAGER') {
            setActiveTab(prev => (prev === 'roster' || prev === 'inventory' ? 'logs' : prev));
          } else if (userRole === 'WAITER' || userRole === 'CASHIER') {
            setActiveTab('logs');
          }
        }
      })
      .catch(err => console.error('Error fetching session:', err));
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch functions
  const fetchMeals = async () => {
    setLoadingMeals(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (staffFilter) params.set('staffMemberId', staffFilter);
      if (mealTypeFilter) params.set('mealType', mealTypeFilter);

      const res = await fetch(`/api/staff-meals?${params.toString()}`);
      if (res.ok) setMeals(await res.json());
    } catch (err) {
      console.error('Error fetching meals:', err);
    } finally {
      setLoadingMeals(false);
    }
  };

  const fetchStaff = async () => {
    setLoadingStaff(true);
    try {
      const res = await fetch('/api/staff-members');
      if (res.ok) setStaff(await res.json());
    } catch (err) {
      console.error('Error fetching staff roster:', err);
    } finally {
      setLoadingStaff(false);
    }
  };

  const fetchMenu = async () => {
    setLoadingMenu(true);
    try {
      const res = await fetch('/api/staff-menu-items');
      if (res.ok) setMenuItems(await res.json());
    } catch (err) {
      console.error('Error fetching staff menu:', err);
    } finally {
      setLoadingMenu(false);
    }
  };

  useEffect(() => {
    fetchMeals();
  }, [from, to, staffFilter, mealTypeFilter]);

  const fetchInventory = async () => {
    setLoadingInventory(true);
    try {
      const [ingRes, recRes, menuRes] = await Promise.all([
        fetch('/api/staff-ingredients'),
        fetch('/api/staff-recipes'),
        fetch('/api/staff-menu-items'),
      ]);
      if (ingRes.ok) setIngredients(await ingRes.json());
      if (recRes.ok) setRecipes(await recRes.json());
      if (menuRes.ok) setMenuItems(await menuRes.json());
    } catch (err) {
      console.error('Error fetching staff inventory:', err);
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'roster') {
      fetchStaff();
    } else if (activeTab === 'menu') {
      fetchMenu();
    } else if (activeTab === 'inventory') {
      fetchInventory();
    }
  }, [activeTab]);

  // Load dropdown resources when opening Add Meal Modal
  const openAddMeal = async () => {
    // Fetch latest active staff and menu items to populate dropdowns
    const [staffRes, menuRes] = await Promise.all([
      fetch('/api/staff-members'),
      fetch('/api/staff-menu-items')
    ]);

    let fetchedStaff: StaffMember[] = [];
    let fetchedMenu: StaffMenuItem[] = [];

    if (staffRes.ok) {
      fetchedStaff = await staffRes.json();
      setStaff(fetchedStaff);
    }
    if (menuRes.ok) {
      fetchedMenu = await menuRes.json();
      setMenuItems(fetchedMenu);
    }

    const activeStaff = fetchedStaff.filter(s => s.active);
    const initialStaffId = activeStaff.length > 0 ? activeStaff[0].id : '';
    const initialMealType = 'BREAKFAST';
    const filteredMenu = fetchedMenu.filter(item => item.mealType === initialMealType);
    const initialMenuItemId = filteredMenu.length > 0 ? filteredMenu[0].id : '';

    // Initialize date time in local offset format: YYYY-MM-DDTHH:MM
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - (offset * 60 * 1000));
    const localISO = localNow.toISOString().slice(0, 16);

    setMealForm({
      staffMemberId: initialStaffId,
      mealType: initialMealType,
      staffMenuItemId: initialMenuItemId,
      servedAt: localISO
    });
    setShowMealModal(true);
  };

  const handleMealSubmit = async () => {
    if (!mealForm.staffMemberId || !mealForm.mealType || !mealForm.staffMenuItemId) {
      showToast('Please fill in all meal form fields', 'error');
      return;
    }

    setSavingMeal(true);
    try {
      const res = await fetch('/api/staff-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mealForm)
      });

      if (res.ok) {
        showToast('Staff meal logged successfully!');
        setShowMealModal(false);
        fetchMeals();
        // Dispatch custom event to trigger sidebar sync count update if offline
        window.dispatchEvent(new Event('db-write-success'));
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to log meal', 'error');
      }
    } catch (err) {
      showToast('Network error logging meal', 'error');
    } finally {
      setSavingMeal(false);
    }
  };

  // Staff CRUD Operations
  const openAddStaff = () => {
    setStaffForm({ id: '', name: '', role: 'Waiter', shift: 'Morning' });
    setShowStaffModal(true);
  };

  const openEditStaff = (member: StaffMember) => {
    setStaffForm({ id: member.id, name: member.name, role: member.role, shift: member.shift });
    setShowStaffModal(true);
  };

  const handleStaffSubmit = async () => {
    if (!staffForm.name || !staffForm.role) {
      showToast('Name and Role are required', 'error');
      return;
    }

    setSavingStaff(true);
    try {
      const isEdit = !!staffForm.id;
      const url = isEdit ? `/api/staff-members/${staffForm.id}` : '/api/staff-members';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm)
      });

      if (res.ok) {
        showToast(isEdit ? 'Staff member updated!' : 'Staff member added!');
        setShowStaffModal(false);
        fetchStaff();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save staff member', 'error');
      }
    } catch (err) {
      showToast('Network error saving staff', 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaffActive = async (member: StaffMember) => {
    try {
      const res = await fetch(`/api/staff-members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !member.active })
      });

      if (res.ok) {
        showToast(member.active ? 'Staff member deactivated' : 'Staff member activated');
        fetchStaff();
      } else {
        showToast('Failed to update status', 'error');
      }
    } catch (err) {
      showToast('Network error updating status', 'error');
    }
  };

  const handleDeleteStaffMember = async (member: StaffMember) => {
    if (!confirm(`Permanently delete "${member.name}"? This will remove them from the roster.`)) return;
    try {
      const res = await fetch(`/api/staff-members/${member.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`${member.name} deleted from roster`);
        fetchStaff();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to delete staff member', 'error');
      }
    } catch {
      showToast('Network error deleting staff member', 'error');
    }
  };

  const handleClearAllLogs = async () => {
    if (!confirm('Clear ALL staff meal logs? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/staff-meals/clear-all', { method: 'DELETE' });
      if (res.ok) {
        showToast('All meal logs cleared');
        fetchMeals();
      } else {
        showToast('Failed to clear meal logs', 'error');
      }
    } catch {
      showToast('Network error clearing logs', 'error');
    }
  };

  // Food Menu CRUD Operations
  const openAddMenu = () => {
    setMenuForm({ id: '', name: '', mealType: 'BREAKFAST' });
    setShowMenuModal(true);
  };

  const openEditMenu = (item: StaffMenuItem) => {
    setMenuForm({ id: item.id, name: item.name, mealType: item.mealType });
    setShowMenuModal(true);
  };

  const handleMenuSubmit = async () => {
    if (!menuForm.name || !menuForm.mealType) {
      showToast('Name and Meal Type are required', 'error');
      return;
    }

    setSavingMenuBtn(true);
    try {
      const isEdit = !!menuForm.id;
      const url = isEdit ? `/api/staff-menu-items/${menuForm.id}` : '/api/staff-menu-items';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuForm)
      });

      if (res.ok) {
        showToast(isEdit ? 'Menu item updated!' : 'Menu item added!');
        setShowMenuModal(false);
        fetchMenu();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save menu item', 'error');
      }
    } catch (err) {
      showToast('Network error saving menu item', 'error');
    } finally {
      setSavingMenuBtn(false);
    }
  };

  const handleDeleteMenu = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff menu item?')) return;
    try {
      const res = await fetch(`/api/staff-menu-items/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Menu item deleted');
        fetchMenu();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to delete menu item', 'error');
      }
    } catch (err) {
      showToast('Network error deleting item', 'error');
    }
  };

  // Staff Inventory (ingredients) CRUD — ADMIN only
  const openAddIngredient = () => {
    setIngredientForm({ id: '', name: '', unit: 'pieces', quantity: '0', minThreshold: '0' });
    setShowIngredientModal(true);
  };

  const openEditIngredient = (ing: StaffIngredient) => {
    setIngredientForm({
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      quantity: String(ing.quantity),
      minThreshold: String(ing.minThreshold),
    });
    setShowIngredientModal(true);
  };

  const handleIngredientSubmit = async () => {
    if (!ingredientForm.name || !ingredientForm.unit) {
      showToast('Name and unit are required', 'error');
      return;
    }
    setSavingIngredient(true);
    try {
      const isEdit = !!ingredientForm.id;
      const url = isEdit ? `/api/staff-ingredients/${ingredientForm.id}` : '/api/staff-ingredients';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ingredientForm.name,
          unit: ingredientForm.unit,
          quantity: Number(ingredientForm.quantity) || 0,
          minThreshold: Number(ingredientForm.minThreshold) || 0,
        }),
      });
      if (res.ok) {
        showToast(isEdit ? 'Ingredient updated!' : 'Ingredient added!');
        setShowIngredientModal(false);
        fetchInventory();
        window.dispatchEvent(new Event('db-write-success'));
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save ingredient', 'error');
      }
    } catch (err) {
      showToast('Network error saving ingredient', 'error');
    } finally {
      setSavingIngredient(false);
    }
  };

  const handleDeleteIngredient = async (id: string) => {
    if (!confirm('Delete this ingredient? Any recipe lines using it will also be removed.')) return;
    try {
      const res = await fetch(`/api/staff-ingredients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Ingredient deleted');
        fetchInventory();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to delete ingredient', 'error');
      }
    } catch (err) {
      showToast('Network error deleting ingredient', 'error');
    }
  };

  // Recipe lines (food → ingredient consumption) — ADMIN only
  const handleAddRecipeLine = async () => {
    if (!recipeMenuItemId || !recipeLineForm.staffIngredientId || !(Number(recipeLineForm.quantity) > 0)) {
      showToast('Pick a food, an ingredient, and a quantity > 0', 'error');
      return;
    }
    setSavingRecipe(true);
    try {
      const res = await fetch('/api/staff-recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffMenuItemId: recipeMenuItemId,
          staffIngredientId: recipeLineForm.staffIngredientId,
          quantity: Number(recipeLineForm.quantity),
        }),
      });
      if (res.ok) {
        showToast('Recipe line saved!');
        setRecipeLineForm({ staffIngredientId: '', quantity: '1' });
        fetchInventory();
        window.dispatchEvent(new Event('db-write-success'));
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save recipe line', 'error');
      }
    } catch (err) {
      showToast('Network error saving recipe line', 'error');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleDeleteRecipeLine = async (id: string) => {
    try {
      const res = await fetch(`/api/staff-recipes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Recipe line removed');
        fetchInventory();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to remove recipe line', 'error');
      }
    } catch (err) {
      showToast('Network error removing recipe line', 'error');
    }
  };

  // Printing Action
  const handlePrintReceipt = (meal: StaffMeal) => {
    const servedDateStr = new Date(meal.servedAt).toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' });
    const html = `<html>
      <head>
        <title>Staff Meal Receipt</title>
        <style>
          @page { margin: 0; }
          *, *:before, *:after { box-sizing: border-box; }
          body { margin: 0; padding: 15px 20px; font-family: Courier New, monospace; width: 100%; font-size: 13px; color: #000; background: #fff; font-weight: bold; }
          hr { border-top: 1px dashed #000; border-bottom: none; border-left: none; border-right: none; margin: 8px 0; }
        </style>
      </head>
      <body>
      <div style="text-align:center;margin-bottom:10px;">
        <b style="font-size:18px;letter-spacing:2px;">Kogna Coffee</b><br/>
        <span style="font-size:11px;">Addis Ababa, Ethiopia</span>
        <hr/>
        <b>STAFF MEAL RECEIPT</b>
      </div>
      <div style="margin-bottom:10px;font-size:13px;line-height:1.5;">
        <b>Staff Name:</b> ${meal.staffMember.name}<br/>
        <b>Role:</b> ${meal.staffMember.role || '-'}<br/>
        <b>Shift:</b> ${meal.staffMember.shift || '-'}<br/>
        <b>Meal Type:</b> ${meal.mealType}<br/>
        <b>Date & Time:</b> ${servedDateStr}
      </div>
      <hr/>
      <div style="font-size:13px;font-weight:bold;margin-bottom:4px;display:flex;justify-content:space-between;">
        <span>ITEM TAKEN</span>
        <span>QTY</span>
      </div>
      <hr/>
      ${meal.items.map(i => `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>${i.name}</span>
        <span>${i.quantity}</span>
      </div>`).join('')}
      <hr/>
      <div style="text-align:center;font-size:12px;font-weight:900;color:#000;letter-spacing:1.5px;margin-top:8px;">
        <b>MEBA TECH PRO</b>
      </div>
    </body></html>`;
    printTicketHtml(html);
  };

  const canAddMeal = ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'].includes(role);
  const canAccessFoodMenu = ['ADMIN', 'MANAGER'].includes(role);
  const canAccessRoster = role === 'ADMIN';
  const canAccessInventory = role === 'ADMIN';

  return (
    <div className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', marginTop: '24px', padding: 0 }}>
      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`} style={{ zIndex: 9999 }}>
          {toast.message}
        </div>
      )}

      {/* Tabs & Top Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--black-border)', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn btn-sm ${activeTab === 'logs' ? 'btn-gold' : 'btn-ghost'}`} 
            onClick={() => setActiveTab('logs')}
          >
            Meal Logs
          </button>
          {canAccessRoster && (
            <button 
              className={`btn btn-sm ${activeTab === 'roster' ? 'btn-gold' : 'btn-ghost'}`} 
              onClick={() => setActiveTab('roster')}
            >
              Staff Roster
            </button>
          )}
          {canAccessFoodMenu && (
            <button
              className={`btn btn-sm ${activeTab === 'menu' ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => setActiveTab('menu')}
            >
              Food Menu
            </button>
          )}
          {canAccessInventory && (
            <button
              className={`btn btn-sm ${activeTab === 'inventory' ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => setActiveTab('inventory')}
            >
              Inventory
            </button>
          )}
        </div>
        <div>
          {activeTab === 'logs' && canAddMeal && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-gold btn-sm" onClick={openAddMeal}>
                <Plus size={14} /> Log Meal
              </button>
              {(role === 'ADMIN' || role === 'MANAGER') && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger-light)', borderColor: 'rgba(239,68,68,0.3)' }}
                  onClick={handleClearAllLogs}
                  title="Clear all meal logs"
                >
                  <Trash2 size={14} /> Clear Logs
                </button>
              )}
            </div>
          )}
          {activeTab === 'roster' && canAccessRoster && (
            <button className="btn btn-gold btn-sm" onClick={openAddStaff}>
              <UserPlus size={14} /> Add Staff
            </button>
          )}
          {activeTab === 'menu' && canAccessFoodMenu && (
            <button className="btn btn-gold btn-sm" onClick={openAddMenu}>
              <Plus size={14} /> Add Menu Item
            </button>
          )}
          {activeTab === 'inventory' && canAccessInventory && (
            <button className="btn btn-gold btn-sm" onClick={openAddIngredient}>
              <Plus size={14} /> Add Ingredient
            </button>
          )}
        </div>
      </div>

      {/* Main Panel Content */}
      <div style={{ padding: '20px' }}>
        {/* Tab 1: MEAL LOGS */}
        {activeTab === 'logs' && (
          <div>
            {/* Filters Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1', minWidth: '180px' }}>
                <select 
                  className="input" 
                  value={staffFilter} 
                  onChange={e => setStaffFilter(e.target.value)}
                  style={{ padding: '8px 12px', fontSize: '14px' }}
                >
                  <option value="">All Staff Members</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1', minWidth: '180px' }}>
                <select 
                  className="input" 
                  value={mealTypeFilter} 
                  onChange={e => setMealTypeFilter(e.target.value)}
                  style={{ padding: '8px 12px', fontSize: '14px' }}
                >
                  <option value="">All Meal Types</option>
                  <option value="BREAKFAST">Breakfast</option>
                  <option value="LUNCH">Lunch</option>
                  <option value="DINNER">Dinner</option>
                </select>
              </div>
            </div>

            {/* Logs Table */}
            {loadingMeals ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)', gap: '10px' }}>
                <Loader2 className="ob-spin" size={20} /> Loading staff meals...
              </div>
            ) : meals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                No staff meals recorded for the selected period.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '13px' }}>Staff Member</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '13px' }}>Meal Type</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '13px' }}>Food Item</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '13px' }}>Served At</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '13px', width: '120px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meals.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--black-border)' }} className="card-hover-row">
                        <td style={{ padding: '14px 16px', fontSize: '14px' }}>
                          <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{m.staffMember.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.staffMember.role} · {m.staffMember.shift}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '14px' }}>
                          <span style={{ 
                            fontSize: '11px', padding: '3px 8px', borderRadius: '12px', fontWeight: '600',
                            background: m.mealType === 'BREAKFAST' ? 'rgba(67, 56, 202, 0.1)' : m.mealType === 'LUNCH' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: m.mealType === 'BREAKFAST' ? 'var(--gold)' : m.mealType === 'LUNCH' ? 'var(--success)' : 'var(--warning)'
                          }}>
                            {m.mealType}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '14px', color: 'var(--text-primary)' }}>
                          {m.items.map(i => (
                            <div key={i.id}>{i.name}</div>
                          ))}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                            {new Date(m.servedAt).toLocaleDateString()}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            <Clock size={11} />
                            {new Date(m.servedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <button 
                            className="btn btn-outline btn-sm" 
                            style={{ padding: '6px 10px', height: '30px' }} 
                            onClick={() => handlePrintReceipt(m)}
                            title="Print Receipt"
                          >
                            <Printer size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: STAFF ROSTER */}
        {activeTab === 'roster' && (
          <div>
            {loadingStaff ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)', gap: '10px' }}>
                <Loader2 className="ob-spin" size={20} /> Loading staff list...
              </div>
            ) : staff.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                No staff members listed. Click "Add Staff" to create one.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {staff.map(s => (
                  <div key={s.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', padding: '16px', opacity: s.active ? 1 : 0.6, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(67, 56, 202, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontWeight: 'bold' }}>
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{s.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.role} · {s.shift} Shift</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--black-border)', paddingTop: '12px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: s.active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.15)', color: s.active ? 'var(--success)' : 'var(--text-muted)', fontWeight: '600' }}>
                        {s.active ? 'Active' : 'Inactive'}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '6px' }} onClick={() => openEditStaff(s)}>
                          <Pencil size={13} />
                        </button>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          style={{ padding: '6px', color: s.active ? 'var(--danger)' : 'var(--success)' }} 
                          onClick={() => handleToggleStaffActive(s)}
                          title={s.active ? 'Deactivate Member' : 'Activate Member'}
                        >
                          {s.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '6px', color: 'var(--danger-light)' }}
                          onClick={() => handleDeleteStaffMember(s)}
                          title="Delete staff member"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: FOOD MENU */}
        {activeTab === 'menu' && (
          <div>
            {loadingMenu ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)', gap: '10px' }}>
                <Loader2 className="ob-spin" size={20} /> Loading staff menu...
              </div>
            ) : menuItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                No menu items found. Click "Add Menu Item" to configure the menu.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {['BREAKFAST', 'LUNCH', 'DINNER'].map(type => {
                  const filtered = menuItems.filter(item => item.mealType === type);
                  return (
                    <div key={type} className="card" style={{ padding: '16px', background: 'var(--black-card)', border: '1px solid var(--black-border)' }}>
                      <h4 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--black-border)', paddingBottom: '8px', marginBottom: '12px', fontSize: '15px', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Utensils size={14} /> {type.toLowerCase()} Menu
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {filtered.length === 0 ? (
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>No items in this section</div>
                        ) : (
                          filtered.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--black-hover)', borderRadius: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>{item.name}</span>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px' }} onClick={() => openEditMenu(item)}>
                                  <Pencil size={12} />
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => handleDeleteMenu(item.id)}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: INVENTORY (admin + manager) */}
        {activeTab === 'inventory' && canAccessInventory && (
          <div>
            {loadingInventory ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)', gap: '10px' }}>
                <Loader2 className="ob-spin" size={20} /> Loading staff inventory...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                {/* Section 1: Ingredient stock */}
                <div>
                  <h4 style={{ color: 'var(--gold)', fontSize: '15px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Package size={16} /> Kitchen Ingredients
                  </h4>
                  {ingredients.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No staff ingredients yet. Click "Add Ingredient" to stock the staff kitchen.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                      {ingredients.map(ing => {
                        const low = ing.quantity <= ing.minThreshold;
                        return (
                          <div key={ing.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', padding: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>{ing.name}</div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px' }} onClick={() => openEditIngredient(ing)} title="Edit / restock">
                                  <Pencil size={12} />
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => handleDeleteIngredient(ing.id)} title="Delete">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                              <span style={{ fontSize: '22px', fontWeight: '700', color: low ? 'var(--danger)' : 'var(--text-primary)' }}>{ing.quantity}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ing.unit}</span>
                            </div>
                            {low && (
                              <span style={{ display: 'inline-block', marginTop: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)', fontWeight: '600' }}>
                                Low stock (min {ing.minThreshold})
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section 2: Recipe / auto-deduct mapping */}
                <div>
                  <h4 style={{ color: 'var(--gold)', fontSize: '15px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Utensils size={16} /> Meal Recipes
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Define which ingredients (and how much per serving) each staff food consumes. These amounts are deducted automatically when a meal is logged.
                  </p>

                  <div style={{ maxWidth: '460px', marginBottom: '14px' }}>
                    <label className="input-label">Food Item</label>
                    <select
                      className="input"
                      value={recipeMenuItemId}
                      onChange={e => { setRecipeMenuItemId(e.target.value); setRecipeLineForm({ staffIngredientId: '', quantity: '1' }); }}
                    >
                      <option value="">Select a food item...</option>
                      {menuItems.map(mi => (
                        <option key={mi.id} value={mi.id}>{mi.name} ({mi.mealType})</option>
                      ))}
                    </select>
                  </div>

                  {recipeMenuItemId && (
                    <div className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', padding: '16px', maxWidth: '560px' }}>
                      {recipes.filter(r => r.staffMenuItemId === recipeMenuItemId).length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '14px' }}>
                          No ingredients mapped to this food yet.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                          {recipes.filter(r => r.staffMenuItemId === recipeMenuItemId).map(r => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--black-hover)', borderRadius: '6px' }}>
                              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{r.staffIngredient.name}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>{r.quantity} {r.staffIngredient.unit}</span>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => handleDeleteRecipeLine(r.id)} title="Remove">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add a recipe line */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', borderTop: '1px solid var(--black-border)', paddingTop: '14px', flexWrap: 'wrap' }}>
                        <div style={{ flex: '2', minWidth: '140px' }}>
                          <label className="input-label">Ingredient</label>
                          <select
                            className="input"
                            value={recipeLineForm.staffIngredientId}
                            onChange={e => setRecipeLineForm(f => ({ ...f, staffIngredientId: e.target.value }))}
                          >
                            <option value="">Select...</option>
                            {ingredients.map(ing => (
                              <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: '1', minWidth: '90px' }}>
                          <label className="input-label">Per serving</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="input"
                            value={recipeLineForm.quantity}
                            onChange={e => setRecipeLineForm(f => ({ ...f, quantity: e.target.value }))}
                          />
                        </div>
                        <button className="btn btn-gold btn-sm" onClick={handleAddRecipeLine} disabled={savingRecipe || ingredients.length === 0}>
                          <Plus size={14} /> {savingRecipe ? 'Saving...' : 'Add'}
                        </button>
                      </div>
                      {ingredients.length === 0 && (
                        <p style={{ color: 'var(--warning-light)', fontSize: '12px', marginTop: '8px' }}>Add ingredients above first.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- MODAL DIALOGS --- */}

      {/* 1. Add Meal Modal */}
      {showMealModal && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowMealModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: 'var(--text-primary)' }}>Log Staff Meal</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="input-label">Staff Member</label>
                  <select 
                    className="input" 
                    value={mealForm.staffMemberId} 
                    onChange={e => setMealForm(f => ({ ...f, staffMemberId: e.target.value }))}
                  >
                    <option value="" disabled>Select staff member...</option>
                    {staff.filter(s => s.active).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                  {staff.filter(s => s.active).length === 0 && (
                    <p style={{ color: 'var(--danger-light)', fontSize: '12px', marginTop: '4px' }}>No active staff members found.</p>
                  )}
                </div>

                <div>
                  <label className="input-label">Meal Type</label>
                  <select 
                    className="input" 
                    value={mealForm.mealType} 
                    onChange={e => {
                      const newType = e.target.value;
                      const filtered = menuItems.filter(item => item.mealType === newType);
                      const defaultItem = filtered.length > 0 ? filtered[0].id : '';
                      setMealForm(f => ({ ...f, mealType: newType, staffMenuItemId: defaultItem }));
                    }}
                  >
                  <option value="BREAKFAST">Breakfast</option>
                  <option value="LUNCH">Lunch</option>
                  <option value="DINNER">Dinner</option>
                </select>
              </div>

              <div>
                <label className="input-label">Food Item</label>
                <select 
                  className="input" 
                  value={mealForm.staffMenuItemId} 
                  onChange={e => setMealForm(f => ({ ...f, staffMenuItemId: e.target.value }))}
                >
                  <option value="" disabled>Select food item...</option>
                  {menuItems.filter(item => item.mealType === mealForm.mealType).map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                {menuItems.filter(item => item.mealType === mealForm.mealType).length === 0 && (
                  <p style={{ color: 'var(--warning-light)', fontSize: '12px', marginTop: '4px' }}>No food items configured for {mealForm.mealType.toLowerCase()}.</p>
                )}
              </div>

              <div>
                <label className="input-label">Date & Time</label>
                <input 
                  type="datetime-local" 
                  className="input" 
                  value={mealForm.servedAt} 
                  onChange={e => setMealForm(f => ({ ...f, servedAt: e.target.value }))} 
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button 
                className="btn btn-gold" 
                style={{ flex: 1 }} 
                onClick={handleMealSubmit} 
                disabled={savingMeal || staff.filter(s => s.active).length === 0 || menuItems.filter(item => item.mealType === mealForm.mealType).length === 0}
              >
                {savingMeal ? 'Logging...' : 'Log Meal'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowMealModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      </Portal>
    )}

      {/* 2. Add/Edit Staff Modal */}
      {showStaffModal && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowStaffModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: 'var(--text-primary)' }}>
                {staffForm.id ? 'Edit Staff Member' : 'Add Staff Member'}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="input-label">Full Name</label>
                  <input 
                    className="input" 
                    placeholder="e.g. Abebe Bekele"
                    value={staffForm.name} 
                    onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} 
                  />
                </div>

                <div>
                  <label className="input-label">Role</label>
                  <input 
                    className="input" 
                    placeholder="e.g. Waiter, Chef, Bartender, Cleaner"
                    value={staffForm.role} 
                    onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))} 
                  />
                </div>

                <div>
                  <label className="input-label">Shift</label>
                  <select 
                    className="input" 
                    value={staffForm.shift} 
                    onChange={e => setStaffForm(f => ({ ...f, shift: e.target.value }))}
                  >
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Night">Night</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleStaffSubmit} disabled={savingStaff}>
                  {savingStaff ? 'Saving...' : staffForm.id ? 'Save Changes' : 'Add Staff'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowStaffModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 3. Add/Edit Menu Item Modal */}
      {showMenuModal && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowMenuModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: 'var(--text-primary)' }}>
                {menuForm.id ? 'Edit Staff Menu Item' : 'Add Staff Menu Item'}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="input-label">Item Name</label>
                  <input 
                    className="input" 
                    placeholder="e.g. Shakshuka"
                    value={menuForm.name} 
                    onChange={e => setMenuForm(f => ({ ...f, name: e.target.value }))} 
                  />
                </div>

                <div>
                  <label className="input-label">Meal Type Category</label>
                  <select 
                    className="input" 
                    value={menuForm.mealType} 
                    onChange={e => setMenuForm(f => ({ ...f, mealType: e.target.value }))}
                  >
                    <option value="BREAKFAST">Breakfast</option>
                    <option value="LUNCH">Lunch</option>
                    <option value="DINNER">Dinner</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleMenuSubmit} disabled={savingMenuBtn}>
                  {savingMenuBtn ? 'Saving...' : menuForm.id ? 'Save Changes' : 'Add Menu Item'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowMenuModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 4. Add/Edit Ingredient Modal */}
      {showIngredientModal && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowIngredientModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: 'var(--text-primary)' }}>
                {ingredientForm.id ? 'Edit Ingredient' : 'Add Staff Ingredient'}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="input-label">Ingredient Name</label>
                  <input 
                    className="input" 
                    placeholder="e.g. Eggs, Rice, Cooking Oil" 
                    value={ingredientForm.name} 
                    onChange={e => setIngredientForm(f => ({ ...f, name: e.target.value }))} 
                  />
                </div>

                <div>
                  <label className="input-label">Unit</label>
                  <select 
                    className="input" 
                    value={ingredientForm.unit} 
                    onChange={e => setIngredientForm(f => ({ ...f, unit: e.target.value }))}
                  >
                    <option value="pieces">pieces</option>
                    <option value="grams">grams</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="liters">liters</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="input-label">Current Quantity</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="any" 
                      className="input" 
                      value={ingredientForm.quantity} 
                      onChange={e => setIngredientForm(f => ({ ...f, quantity: e.target.value }))} 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="input-label">Low-stock at</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="any" 
                      className="input" 
                      value={ingredientForm.minThreshold} 
                      onChange={e => setIngredientForm(f => ({ ...f, minThreshold: e.target.value }))} 
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleIngredientSubmit} disabled={savingIngredient}>
                  {savingIngredient ? 'Saving...' : ingredientForm.id ? 'Save Changes' : 'Add Ingredient'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowIngredientModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
