import { useState, useEffect, createContext, useContext } from 'react';
import { 
  LayoutDashboard, Receipt, Wallet, Settings, Plus, 
  ArrowDownRight, Landmark, PieChart, BarChart3,
  LogOut, Menu, X, AlertCircle, Pencil, Repeat, Search,
  Smartphone, TrendingUp, Download, Trash2
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// We use a mock configuration for the preview environment. 
// In a real deployed app (Vercel/Netlify), you would replace these with your actual Firebase/Supabase credentials.
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig =
  typeof window !== 'undefined' && window.__firebase_config
    ? JSON.parse(window.__firebase_config)
    : {};

let app, auth, db;
let useCloudSync = false;

try {
  if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    useCloudSync = true;
  }
} catch {
  console.warn("Cloud sync disabled. Using local storage fallback.");
}

const COLORS = {
  bg: '#0B0F14',
  card: '#151B23',
  border: '#252D39',
  primary: '#3B82F6',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  text: '#FFFFFF',
  textMuted: '#9CA3AF'
};

const CATEGORY_COLORS = {
  'Essentials': '#3B82F6', 
  'Wants': '#EC4899',      
  'Investments': '#10B981', 
  'Income': '#22C55E',     
  'Other': '#6B7280'       
};

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

const generateId = () => Math.random().toString(36).substr(2, 9);

// Turns an email into a stable, storage-safe key so each local account gets its own data bucket.
const makeUid = (email) => 'u_' + btoa(unescape(encodeURIComponent(email.trim().toLowerCase()))).replace(/[^a-zA-Z0-9]/g, '');

const FREQUENCY_DAYS = { weekly: 7, monthly: 30, yearly: 365 };

const advanceDate = (isoDate, frequency) => {
  const d = new Date(isoDate);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setDate(d.getDate() + (FREQUENCY_DAYS[frequency] || 7));
  return d.toISOString();
};

const FinanceContext = createContext(null);

const useFinanceData = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinanceData must be used within FinanceProvider');
  return context;
};

const FinanceProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [settings, setSettings] = useState({
    monthlySalary: 5000,
    currency: 'USD'
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  // On first load (local/no-sync mode): restore whichever session was last active, per-browser.
  useEffect(() => {
    if (!useCloudSync) {
      const savedUser = localStorage.getItem('fos_user');
      if (savedUser) setUser(JSON.parse(savedUser));
      setAuthLoading(false);
    }
  }, []);

  // Whenever the active user changes, load THAT user's own data bucket (per-user storage keys).
  useEffect(() => {
    if (useCloudSync) return;
    if (!user) {
      setAccounts([]);
      setTransactions([]);
      setRecurringTemplates([]);
      setDataLoaded(false);
      return;
    }
    const uid = user.uid;
    const savedAccounts = localStorage.getItem(`fos_accounts_${uid}`);
    const savedTxns = localStorage.getItem(`fos_transactions_${uid}`);
    const savedSettings = localStorage.getItem(`fos_settings_${uid}`);
    const savedRecurring = localStorage.getItem(`fos_recurring_${uid}`);

    setAccounts(savedAccounts ? JSON.parse(savedAccounts) : [{ id: 'acc_1', name: 'Main Bank', type: 'Bank', balance: 0 }]);
    setTransactions(savedTxns ? JSON.parse(savedTxns) : []);
    setSettings(savedSettings ? JSON.parse(savedSettings) : { monthlySalary: 5000, currency: 'USD' });
    setRecurringTemplates(savedRecurring ? JSON.parse(savedRecurring) : []);
    setDataLoaded(true);
  }, [user?.uid]);

  // Save to this user's local storage bucket whenever their data changes.
  useEffect(() => {
    if (!useCloudSync && dataLoaded && user) {
      const uid = user.uid;
      localStorage.setItem(`fos_accounts_${uid}`, JSON.stringify(accounts));
      localStorage.setItem(`fos_transactions_${uid}`, JSON.stringify(transactions));
      localStorage.setItem(`fos_settings_${uid}`, JSON.stringify(settings));
      localStorage.setItem(`fos_recurring_${uid}`, JSON.stringify(recurringTemplates));
    }
  }, [accounts, transactions, settings, recurringTemplates, dataLoaded, user]);

  // Persist the logged-in session itself (local/no-sync mode) so a refresh doesn't log them out.
  useEffect(() => {
    if (!useCloudSync) {
      if (user) localStorage.setItem('fos_user', JSON.stringify(user));
      else localStorage.removeItem('fos_user');
    }
  }, [user]);

  // Auth & Cloud Sync (If configured)
  useEffect(() => {
    if (useCloudSync && auth) {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
        if (!currentUser) {
            setAccounts([]);
            setTransactions([]);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Auto-generate any recurring transactions that have come due (rent, subscriptions, etc.)
  useEffect(() => {
    if (!dataLoaded || recurringTemplates.length === 0) return;
    const now = new Date();
    let dueFound = false;

    const updatedTemplates = recurringTemplates.map(t => t);
    const newTxns = [];
    const balanceDeltas = {};

    recurringTemplates.forEach((tpl, idx) => {
      let nextDue = new Date(tpl.nextDueDate);
      let safety = 0;
      while (nextDue <= now && safety < 24) {
        dueFound = true;
        const txn = {
          id: generateId(),
          amount: tpl.amount,
          merchant: tpl.merchant,
          category: tpl.category,
          type: tpl.type,
          accountId: tpl.accountId,
          date: nextDue.toISOString(),
          recurringId: tpl.id
        };
        newTxns.push(txn);
        balanceDeltas[tpl.accountId] = (balanceDeltas[tpl.accountId] || 0) + (tpl.type === 'expense' ? -tpl.amount : tpl.amount);
        nextDue = new Date(advanceDate(nextDue.toISOString(), tpl.frequency));
        safety++;
      }
      updatedTemplates[idx] = { ...tpl, nextDueDate: nextDue.toISOString() };
    });

    if (dueFound) {
      setTransactions(prev => [...newTxns, ...prev]);
      setAccounts(prev => prev.map(acc => balanceDeltas[acc.id] ? { ...acc, balance: acc.balance + balanceDeltas[acc.id] } : acc));
      setRecurringTemplates(updatedTemplates);
    }
    // Only re-check when a new user's data loads; per-session is enough for this local demo app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoaded]);

  const addTransaction = (txn) => {
    const newTxn = { ...txn, id: generateId(), date: new Date().toISOString() };
    setTransactions(prev => [newTxn, ...prev]);
    
    // Update account balance
    setAccounts(prev => prev.map(acc => {
      if (acc.id === txn.accountId) {
        return { 
          ...acc, 
          balance: txn.type === 'expense' ? acc.balance - txn.amount : acc.balance + txn.amount 
        };
      }
      return acc;
    }));
  };

  const editTransaction = (id, updates) => {
    setTransactions(prev => {
      const oldTxn = prev.find(t => t.id === id);
      if (!oldTxn) return prev;
      const newTxn = { ...oldTxn, ...updates, amount: Number(updates.amount ?? oldTxn.amount) };

      // Reverse the old transaction's effect, then apply the new one (handles account/amount/type changes).
      setAccounts(accPrev => accPrev.map(acc => {
        let balance = acc.balance;
        if (acc.id === oldTxn.accountId) {
          balance += oldTxn.type === 'expense' ? oldTxn.amount : -oldTxn.amount;
        }
        if (acc.id === newTxn.accountId) {
          balance += newTxn.type === 'expense' ? -newTxn.amount : newTxn.amount;
        }
        return balance !== acc.balance ? { ...acc, balance } : acc;
      }));

      return prev.map(t => t.id === id ? newTxn : t);
    });
  };

  const deleteTransaction = (id) => {
    const txn = transactions.find(t => t.id === id);
    if (!txn) return;

    setTransactions(prev => prev.filter(t => t.id !== id));
    
    // Reverse account balance impact
    setAccounts(prev => prev.map(acc => {
      if (acc.id === txn.accountId) {
        return { 
          ...acc, 
          balance: txn.type === 'expense' ? acc.balance + txn.amount : acc.balance - txn.amount 
        };
      }
      return acc;
    }));
  };

  const addAccount = (acc) => {
    setAccounts(prev => [...prev, { ...acc, id: generateId(), balance: Number(acc.balance) }]);
  };

  const deleteAccount = (id) => {
    // Remove the account
    setAccounts(prev => prev.filter(acc => acc.id !== id));
    // Remove all transactions associated with this account
    setTransactions(prev => prev.filter(txn => txn.accountId !== id));
  };

  const addRecurring = (tpl) => {
    const startDate = tpl.startDate ? new Date(tpl.startDate).toISOString() : new Date().toISOString();
    setRecurringTemplates(prev => [...prev, {
      id: generateId(),
      merchant: tpl.merchant,
      amount: Number(tpl.amount),
      category: tpl.category,
      type: tpl.type,
      accountId: tpl.accountId,
      frequency: tpl.frequency,
      nextDueDate: startDate
    }]);
  };

  const deleteRecurring = (id) => {
    setRecurringTemplates(prev => prev.filter(t => t.id !== id));
  };

  const login = async (email, password) => {
    if (useCloudSync && auth) {
        await signInWithEmailAndPassword(auth, email, password);
    } else {
        const users = JSON.parse(localStorage.getItem('fos_users') || '{}');
        const key = email.trim().toLowerCase();
        if (!users[key]) throw new Error('No account found for that email. Try signing up instead.');
        if (users[key] !== password) throw new Error('Incorrect password.');
        setUser({ email: key, uid: makeUid(key) });
    }
  };

  const signup = async (email, password) => {
    if (useCloudSync && auth) {
        await createUserWithEmailAndPassword(auth, email, password);
    } else {
        const users = JSON.parse(localStorage.getItem('fos_users') || '{}');
        const key = email.trim().toLowerCase();
        if (users[key]) throw new Error('An account with that email already exists. Try signing in instead.');
        if (!password || password.length < 4) throw new Error('Password must be at least 4 characters.');
        users[key] = password;
        localStorage.setItem('fos_users', JSON.stringify(users));
        setUser({ email: key, uid: makeUid(key) });
    }
  };

  const logout = async () => {
    if (useCloudSync && auth) {
        await signOut(auth);
    } else {
        setUser(null);
    }
  };

  const loginAsGuest = () => {
      setUser({ email: 'Guest (Local)', uid: 'guest_local' });
  };

  return (
    <FinanceContext.Provider value={{ 
      user, authLoading, login, signup, logout, loginAsGuest,
      accounts, transactions, settings, recurringTemplates,
      addTransaction, editTransaction, deleteTransaction, 
      addAccount, deleteAccount, 
      addRecurring, deleteRecurring,
      setSettings 
    }}>
      {children}
    </FinanceContext.Provider>
  );
};

const LoginScreen = () => {
  const { login, signup, loginAsGuest } = useFinanceData();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) await login(email, password);
      else await signup(email, password);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F14] p-4 text-white">
      <div className="w-full max-w-md bg-[#151B23] rounded-2xl p-8 border border-[#252D39] shadow-2xl">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Landmark className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold">Finance OS</h1>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm text-center">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
              required 
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
              required 
            />
          </div>
          
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium p-3 rounded-lg transition-colors mt-4"
          >
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>

          <button 
            type="button"
            onClick={loginAsGuest}
            className="w-full bg-[#151B23] border border-[#252D39] hover:bg-[#252D39] text-gray-300 font-medium p-3 rounded-lg transition-colors mt-2"
          >
            Continue as Guest (No Sync)
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { accounts, transactions, settings } = useFinanceData();
  
  // Calculate Totals
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  
  // Current month filtering
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const monthlyExpenses = transactions.filter(t => {
    const d = new Date(t.date);
    return t.type === 'expense' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  // 50-30-20 Rule Calculations based on Salary
  const salary = Number(settings.monthlySalary) || 0;
  
  const budgets = {
    'Essentials': salary * 0.50,
    'Wants': salary * 0.30,
    'Investments': salary * 0.20
  };

  const spent = {
    'Essentials': monthlyExpenses.filter(t => t.category === 'Essentials').reduce((sum, t) => sum + t.amount, 0),
    'Wants': monthlyExpenses.filter(t => t.category === 'Wants').reduce((sum, t) => sum + t.amount, 0),
    'Investments': monthlyExpenses.filter(t => t.category === 'Investments').reduce((sum, t) => sum + t.amount, 0)
  };

  const renderProgressBar = (label, spentAmt, budgetAmt, colorClass, bgClass) => {
    const percentage = Math.min((spentAmt / budgetAmt) * 100, 100) || 0;
    const isOver = spentAmt > budgetAmt;

    return (
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-white">{label}</span>
          <span className="text-gray-400">
            {formatCurrency(spentAmt, settings.currency)} / {formatCurrency(budgetAmt, settings.currency)}
          </span>
        </div>
        <div className={`h-3 w-full ${bgClass} rounded-full overflow-hidden border border-[#252D39]`}>
          <div 
            className={`h-full ${isOver ? 'bg-red-500' : colorClass} rounded-full transition-all duration-1000`} 
            style={{ width: `${percentage}%` }}
          />
        </div>
        {isOver && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Over budget</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-900/40 to-[#151B23] p-6 rounded-2xl border border-blue-500/20">
          <p className="text-blue-400 text-sm font-medium mb-1">Total Net Worth</p>
          <h2 className="text-4xl font-bold text-white">{formatCurrency(totalBalance, settings.currency)}</h2>
        </div>
        <div className="bg-[#151B23] p-6 rounded-2xl border border-[#252D39]">
          <p className="text-gray-400 text-sm font-medium mb-1">Monthly Salary Configured</p>
          <h2 className="text-3xl font-semibold text-white">{formatCurrency(salary, settings.currency)}</h2>
        </div>
      </div>

      {/* 50-30-20 Rule Section */}
      <div className="bg-[#151B23] rounded-2xl border border-[#252D39] p-6">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-blue-500" />
          The 50/30/20 Rule Progress
        </h3>
        
        {renderProgressBar('Essentials (50%)', spent['Essentials'], budgets['Essentials'], 'bg-blue-500', 'bg-blue-900/30')}
        {renderProgressBar('Wants (30%)', spent['Wants'], budgets['Wants'], 'bg-pink-500', 'bg-pink-900/30')}
        {renderProgressBar('Investments & Savings (20%)', spent['Investments'], budgets['Investments'], 'bg-emerald-500', 'bg-emerald-900/30')}
      </div>

      {/* Recent Transactions Snippet */}
      <div className="bg-[#151B23] rounded-2xl border border-[#252D39] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {transactions.slice(0, 5).map(txn => (
            <div key={txn.id} className="flex justify-between items-center p-3 hover:bg-[#0B0F14] rounded-lg transition-colors border border-transparent hover:border-[#252D39]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0B0F14] flex items-center justify-center border border-[#252D39]">
                  {txn.type === 'expense' ? <ArrowDownRight className="w-5 h-5 text-red-500" /> : <TrendingUp className="w-5 h-5 text-green-500" />}
                </div>
                <div>
                  <p className="font-medium text-white">{txn.merchant}</p>
                  <p className="text-xs text-gray-400">{txn.category}</p>
                </div>
              </div>
              <p className={`font-semibold ${txn.type === 'expense' ? 'text-white' : 'text-green-500'}`}>
                {txn.type === 'expense' ? '-' : '+'}{formatCurrency(txn.amount, settings.currency)}
              </p>
            </div>
          ))}
          {transactions.length === 0 && (
            <p className="text-gray-500 text-center py-4">No recent transactions.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const AccountsView = () => {
  const { accounts, addAccount, deleteAccount, settings } = useFinanceData();
  const [isAdding, setIsAdding] = useState(false);
  const [newAcc, setNewAcc] = useState({ name: '', type: 'Bank', balance: '' });

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newAcc.name || newAcc.balance === '') return;
    addAccount(newAcc);
    setNewAcc({ name: '', type: 'Bank', balance: '' });
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Accounts</h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          {isAdding ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
          {isAdding ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-[#151B23] p-5 rounded-xl border border-[#252D39] grid grid-cols-1 md:grid-cols-4 gap-4 items-end animate-in slide-in-from-top-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Account Name</label>
            <input 
              type="text" 
              value={newAcc.name} 
              onChange={e => setNewAcc({...newAcc, name: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" 
              placeholder="e.g. Chase Checkings"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select 
              value={newAcc.type} 
              onChange={e => setNewAcc({...newAcc, type: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white"
            >
              <option>Bank</option>
              <option>Wallet</option>
              <option>Cash</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Starting Balance</label>
            <input 
              type="number" 
              value={newAcc.balance} 
              onChange={e => setNewAcc({...newAcc, balance: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" 
              placeholder="0.00"
              required
            />
          </div>
          <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-lg font-medium hover:bg-blue-700 w-full h-[42px]">
            Save Account
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <div key={acc.id} className="group bg-[#151B23] p-6 rounded-2xl border border-[#252D39] hover:border-blue-500/50 transition-colors relative overflow-hidden">
            <button 
              onClick={() => deleteAccount(acc.id)}
              className="absolute top-4 right-4 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete Account"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 text-blue-400">
              {acc.type === 'Bank' ? <Landmark /> : acc.type === 'Wallet' ? <Smartphone /> : <Wallet />}
            </div>
            <p className="text-gray-400 text-sm mb-1">{acc.name}</p>
            <h3 className="text-2xl font-bold text-white">{formatCurrency(acc.balance, settings.currency)}</h3>
            <span className="inline-block mt-3 text-xs bg-[#0B0F14] text-gray-400 px-2 py-1 rounded border border-[#252D39]">
              {acc.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EMPTY_TXN = { amount: '', merchant: '', category: 'Essentials', type: 'expense', accountId: '' };

const TransactionsView = () => {
  const { transactions, accounts, addTransaction, editTransaction, deleteTransaction, settings } = useFinanceData();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formTxn, setFormTxn] = useState(EMPTY_TXN);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  const startAdd = () => {
    setEditingId(null);
    setFormTxn({ ...EMPTY_TXN, accountId: accounts[0]?.id || '' });
    setIsAdding(true);
  };

  const startEdit = (txn) => {
    setIsAdding(true);
    setEditingId(txn.id);
    setFormTxn({ amount: txn.amount, merchant: txn.merchant, category: txn.category, type: txn.type, accountId: txn.accountId });
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormTxn(EMPTY_TXN);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formTxn.amount || !formTxn.merchant || !formTxn.accountId) return;
    if (editingId) {
      editTransaction(editingId, { ...formTxn, amount: Number(formTxn.amount) });
    } else {
      addTransaction({ ...formTxn, amount: Number(formTxn.amount) });
    }
    cancelForm();
  };

  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = txn.merchant.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || txn.category === categoryFilter;
    const matchesType = typeFilter === 'All' || txn.type === typeFilter;
    return matchesSearch && matchesCategory && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Transactions</h2>
        <button 
          onClick={() => isAdding ? cancelForm() : startAdd()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          {isAdding ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
          {isAdding ? 'Cancel' : 'New Transaction'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-[#151B23] p-5 rounded-xl border border-[#252D39] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
           <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select 
              value={formTxn.type} 
              onChange={e => setFormTxn({...formTxn, type: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white"
            >
              <option value="expense">Expense (-)</option>
              <option value="income">Income (+)</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Amount</label>
            <input 
              type="number" 
              value={formTxn.amount} 
              onChange={e => setFormTxn({...formTxn, amount: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" 
              placeholder="0.00"
              required
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Merchant</label>
            <input 
              type="text" 
              value={formTxn.merchant} 
              onChange={e => setFormTxn({...formTxn, merchant: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" 
              placeholder="e.g. Amazon"
              required
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Category (50/30/20)</label>
            <select 
              value={formTxn.category} 
              onChange={e => setFormTxn({...formTxn, category: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white"
            >
              <option value="Essentials">Essentials (Needs)</option>
              <option value="Wants">Wants (Fun)</option>
              <option value="Investments">Investments/Savings</option>
              <option value="Income">Income</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Account</label>
            <select 
              value={formTxn.accountId} 
              onChange={e => setFormTxn({...formTxn, accountId: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white"
              required
            >
              <option value="" disabled>Select Account</option>
              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-lg font-medium hover:bg-blue-700 w-full h-[42px] lg:col-span-1">
            {editingId ? 'Save Changes' : 'Add'}
          </button>
        </form>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by merchant..."
            className="w-full bg-[#151B23] border border-[#252D39] rounded-lg p-2.5 pl-9 text-white text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select 
          value={categoryFilter} 
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-[#151B23] border border-[#252D39] rounded-lg p-2.5 text-white text-sm"
        >
          <option value="All">All Categories</option>
          <option value="Essentials">Essentials</option>
          <option value="Wants">Wants</option>
          <option value="Investments">Investments</option>
          <option value="Income">Income</option>
        </select>
        <select 
          value={typeFilter} 
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-[#151B23] border border-[#252D39] rounded-lg p-2.5 text-white text-sm"
        >
          <option value="All">All Types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>

      <div className="bg-[#151B23] rounded-2xl border border-[#252D39] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0B0F14] border-b border-[#252D39]">
                <th className="p-4 text-xs font-semibold text-gray-400 uppercase">Date</th>
                <th className="p-4 text-xs font-semibold text-gray-400 uppercase">Merchant</th>
                <th className="p-4 text-xs font-semibold text-gray-400 uppercase">Category</th>
                <th className="p-4 text-xs font-semibold text-gray-400 uppercase">Account</th>
                <th className="p-4 text-xs font-semibold text-gray-400 uppercase text-right">Amount</th>
                <th className="p-4 text-xs font-semibold text-gray-400 uppercase text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map(txn => {
                const acc = accounts.find(a => a.id === txn.accountId);
                const d = new Date(txn.date);
                return (
                  <tr key={txn.id} className="border-b border-[#252D39]/50 hover:bg-[#0B0F14] transition-colors">
                    <td className="p-4 text-sm text-gray-300">{d.toLocaleDateString()}</td>
                    <td className="p-4 text-sm text-white font-medium flex items-center gap-2">
                      {txn.merchant}
                      {txn.recurringId && <Repeat className="w-3.5 h-3.5 text-blue-400" title="Recurring transaction" />}
                    </td>
                    <td className="p-4">
                      <span className="text-xs bg-[#0B0F14] text-gray-300 px-2 py-1 rounded border border-[#252D39]">
                        {txn.category}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-400">{acc ? acc.name : 'Unknown'}</td>
                    <td className={`p-4 text-sm font-semibold text-right ${txn.type === 'expense' ? 'text-white' : 'text-green-500'}`}>
                      {txn.type === 'expense' ? '-' : '+'}{formatCurrency(txn.amount, settings.currency)}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button onClick={() => startEdit(txn)} className="text-gray-500 hover:text-blue-500 transition-colors">
                          <Pencil className="w-4 h-4 inline-block" />
                        </button>
                        <button onClick={() => deleteTransaction(txn.id)} className="text-gray-500 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4 inline-block" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-500">No transactions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PIE_COLORS = ['#3B82F6', '#EC4899', '#10B981', '#22C55E', '#6B7280'];

const AnalyticsView = () => {
  const { transactions, settings } = useFinanceData();

  // Last 6 months of expense totals
  const monthlyData = (() => {
    const buckets = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      buckets[key] = { name: key, Expenses: 0, Income: 0 };
    }
    transactions.forEach(t => {
      const d = new Date(t.date);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (buckets[key]) {
        if (t.type === 'expense') buckets[key].Expenses += t.amount;
        else buckets[key].Income += t.amount;
      }
    });
    return Object.values(buckets);
  })();

  // Category breakdown (expenses only, all time)
  const categoryData = (() => {
    const totals = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  })();

  const hasData = transactions.length > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Analytics</h2>

      <div className="bg-[#151B23] rounded-2xl border border-[#252D39] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Income vs. Expenses (Last 6 Months)</h3>
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#252D39" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#0B0F14', border: '1px solid #252D39', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
              <Legend />
              <Bar dataKey="Income" fill="#22C55E" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-12">Add some transactions to see your trends.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#151B23] rounded-2xl border border-[#252D39] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Spending by Category</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <RePieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry) => entry.name}>
                  {categoryData.map((entry, i) => <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value, settings.currency)} contentStyle={{ backgroundColor: '#0B0F14', border: '1px solid #252D39', borderRadius: 8 }} />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">No expenses recorded yet.</p>
          )}
        </div>

        <div className="bg-[#151B23] rounded-2xl border border-[#252D39] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Trend Line</h3>
          {hasData ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252D39" />
                <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#0B0F14', border: '1px solid #252D39', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                <Legend />
                <Line type="monotone" dataKey="Expenses" stroke="#EF4444" strokeWidth={2} />
                <Line type="monotone" dataKey="Income" stroke="#22C55E" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">Add some transactions to see your trends.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const RECURRING_EMPTY = { merchant: '', amount: '', category: 'Essentials', type: 'expense', accountId: '', frequency: 'monthly', startDate: '' };

const RecurringView = () => {
  const { recurringTemplates, accounts, addRecurring, deleteRecurring, settings } = useFinanceData();
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState(RECURRING_EMPTY);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.merchant || !form.amount || !form.accountId) return;
    addRecurring(form);
    setForm({ ...RECURRING_EMPTY, accountId: accounts[0]?.id || '' });
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Recurring Transactions</h2>
        <button
          onClick={() => { setIsAdding(!isAdding); setForm({ ...RECURRING_EMPTY, accountId: accounts[0]?.id || '' }); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          {isAdding ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
          {isAdding ? 'Cancel' : 'New Recurring'}
        </button>
      </div>

      <p className="text-sm text-gray-400">Rent, subscriptions, salary — anything that repeats. It'll auto-post as a transaction each time it's due, whenever you open the app.</p>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-[#151B23] p-5 rounded-xl border border-[#252D39] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white">
              <option value="expense">Expense (-)</option>
              <option value="income">Income (+)</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Amount</label>
            <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" placeholder="0.00" required />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Merchant / Label</label>
            <input type="text" value={form.merchant} onChange={e => setForm({...form, merchant: e.target.value})} className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" placeholder="e.g. Rent" required />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Category</label>
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white">
              <option value="Essentials">Essentials</option>
              <option value="Wants">Wants</option>
              <option value="Investments">Investments</option>
              <option value="Income">Income</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Account</label>
            <select value={form.accountId} onChange={e => setForm({...form, accountId: e.target.value})} className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" required>
              <option value="" disabled>Select Account</option>
              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Repeats</label>
            <select value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value})} className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Starts On</label>
            <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" />
          </div>
          <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-lg font-medium hover:bg-blue-700 w-full h-[42px] lg:col-span-1">
            Save
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recurringTemplates.map(tpl => {
          const acc = accounts.find(a => a.id === tpl.accountId);
          return (
            <div key={tpl.id} className="bg-[#151B23] p-5 rounded-2xl border border-[#252D39] flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Repeat className="w-4 h-4 text-blue-400" />
                  <p className="font-medium text-white">{tpl.merchant}</p>
                </div>
                <p className="text-sm text-gray-400 capitalize">{tpl.frequency} · {tpl.category} · {acc ? acc.name : 'Unknown account'}</p>
                <p className="text-xs text-gray-500 mt-1">Next: {new Date(tpl.nextDueDate).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className={`font-semibold ${tpl.type === 'expense' ? 'text-white' : 'text-green-500'}`}>
                  {tpl.type === 'expense' ? '-' : '+'}{formatCurrency(tpl.amount, settings.currency)}
                </p>
                <button onClick={() => deleteRecurring(tpl.id)} className="text-gray-500 hover:text-red-500 transition-colors mt-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        {recurringTemplates.length === 0 && (
          <p className="text-gray-500 col-span-2 text-center py-8">No recurring transactions set up yet.</p>
        )}
      </div>
    </div>
  );
};

const SettingsView = () => {
  const { settings, setSettings } = useFinanceData();

  const handleSave = (e) => {
    e.preventDefault();
    alert("Settings saved successfully!"); // Simple feedback for Settings
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
      
      <form onSubmit={handleSave} className="bg-[#151B23] p-6 rounded-2xl border border-[#252D39] space-y-6">
        <div>
          <h3 className="text-lg font-medium text-white mb-4">Budgeting Configuration</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Monthly Salary (For 50/30/20 Rule)</label>
              <input 
                type="number" 
                value={settings.monthlySalary} 
                onChange={e => setSettings({...settings, monthlySalary: Number(e.target.value)})}
                className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none" 
              />
              <p className="text-xs text-gray-500 mt-2">We use this to calculate your Essentials, Wants, and Investments limits.</p>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Currency Symbol</label>
              <select 
                value={settings.currency}
                onChange={e => setSettings({...settings, currency: e.target.value})}
                className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-3 text-white"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-[#252D39]">
          <h3 className="text-lg font-medium text-white mb-4">App Installation</h3>
          <div className="bg-[#0B0F14] p-4 rounded-xl border border-[#252D39] flex items-center justify-between">
            <div>
              <p className="font-medium text-white">Install Finance OS</p>
              <p className="text-sm text-gray-400">Download this app to your device home screen for quick access.</p>
            </div>
            <button 
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              onClick={() => {
                alert("To install on mobile:\n\niOS: Tap the Share button, then 'Add to Home Screen'.\n\nAndroid/Desktop: Tap the Install button in your browser address bar.");
              }}
            >
              <Download className="w-4 h-4"/> Install App
            </button>
          </div>
        </div>

        <button type="submit" className="w-full bg-white text-black font-semibold p-3 rounded-lg hover:bg-gray-200 transition-colors">
          Save Settings
        </button>
      </form>
    </div>
  );
};

const AppContent = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useFinanceData();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: Receipt },
    { id: 'recurring', label: 'Recurring', icon: Repeat },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'accounts', label: 'Accounts', icon: Wallet },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'transactions': return <TransactionsView />;
      case 'recurring': return <RecurringView />;
      case 'analytics': return <AnalyticsView />;
      case 'accounts': return <AccountsView />;
      case 'settings': return <SettingsView />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-[#0B0F14] text-white overflow-hidden font-sans">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-[#151B23] border-r border-[#252D39]">
        <div className="p-6 flex items-center gap-3 border-b border-[#252D39]">
          <div className="p-2 bg-blue-500/10 rounded-xl">
            <Landmark className="w-6 h-6 text-blue-500" />
          </div>
          <span className="text-xl font-bold tracking-tight">Finance OS</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-blue-600/10 text-blue-500 font-medium' 
                    : 'text-gray-400 hover:text-white hover:bg-[#0B0F14]'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-500' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#252D39]">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-xs">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email || 'Guest User'}</p>
            </div>
            <button onClick={logout} className="text-gray-500 hover:text-red-500 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-[#151B23] border-b border-[#252D39]">
          <div className="flex items-center gap-2">
             <Landmark className="w-6 h-6 text-blue-500" />
             <span className="font-bold">Finance OS</span>
          </div>
          <button onClick={() => setMobileMenuOpen(true)} className="text-white">
            <Menu className="w-6 h-6" />
          </button>
        </header>

        {/* Mobile Navigation Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-[#0B0F14] p-4 flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <span className="text-xl font-bold">Menu</span>
              <button onClick={() => setMobileMenuOpen(false)}><X className="w-8 h-8"/></button>
            </div>
            <nav className="flex-1 space-y-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl text-lg ${activeTab === item.id ? 'bg-blue-600 text-white' : 'bg-[#151B23] text-gray-300'}`}
                  >
                    <Icon className="w-6 h-6" /> {item.label}
                  </button>
                );
              })}
            </nav>
            <button onClick={logout} className="mt-auto p-4 flex items-center justify-center gap-2 text-red-500 border border-red-500/20 rounded-xl bg-red-500/10">
              <LogOut className="w-5 h-5" /> Logout
            </button>
          </div>
        )}

        {/* Scrollable Content View */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <FinanceProvider>
      <FinanceAppWrapper />
    </FinanceProvider>
  );
}

const FinanceAppWrapper = () => {
  const { user, authLoading } = useFinanceData();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AppContent />;
};
