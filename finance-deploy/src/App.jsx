import { useState, useEffect, createContext, useContext } from 'react';
import { 
  LayoutDashboard, Receipt, Wallet, Settings, Plus, 
  ArrowDownRight, Landmark, PieChart,
  LogOut, Menu, X, AlertCircle,
  Smartphone, TrendingUp, Download, Trash2
} from 'lucide-react';

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

const FinanceContext = createContext(null);

const useFinanceData = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinanceData must be used within FinanceProvider');
  return context;
};

const FinanceProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(useCloudSync);
  
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState({ 
    monthlySalary: 5000, 
    currency: 'USD' 
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load initial local data if not using cloud sync
  useEffect(() => {
    if (!useCloudSync) {
      const savedAccounts = localStorage.getItem('fos_accounts');
      const savedTxns = localStorage.getItem('fos_transactions');
      const savedSettings = localStorage.getItem('fos_settings');
      
      if (savedAccounts) setAccounts(JSON.parse(savedAccounts));
      else setAccounts([{ id: 'acc_1', name: 'Main Bank', type: 'Bank', balance: 0 }]);
      
      if (savedTxns) setTransactions(JSON.parse(savedTxns));
      if (savedSettings) setSettings(JSON.parse(savedSettings));
      
      setDataLoaded(true);
      setAuthLoading(false);
    }
  }, []);

  // Save to local storage whenever data changes (Fallback)
  useEffect(() => {
    if (!useCloudSync && dataLoaded) {
      localStorage.setItem('fos_accounts', JSON.stringify(accounts));
      localStorage.setItem('fos_transactions', JSON.stringify(transactions));
      localStorage.setItem('fos_settings', JSON.stringify(settings));
    }
  }, [accounts, transactions, settings, dataLoaded]);

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

  const login = async (email, password) => {
    if (useCloudSync && auth) {
        await signInWithEmailAndPassword(auth, email, password);
    } else {
        setUser({ email, uid: 'local_user' });
    }
  };

  const signup = async (email, password) => {
    if (useCloudSync && auth) {
        await createUserWithEmailAndPassword(auth, email, password);
    } else {
        setUser({ email, uid: 'local_user' });
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
      setUser({ email: 'Guest (Local)', uid: 'local_user' });
  };

  return (
    <FinanceContext.Provider value={{ 
      user, authLoading, login, signup, logout, loginAsGuest,
      accounts, transactions, settings, 
      addTransaction, deleteTransaction, 
      addAccount, deleteAccount, 
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

const TransactionsView = () => {
  const { transactions, accounts, addTransaction, deleteTransaction, settings } = useFinanceData();
  const [isAdding, setIsAdding] = useState(false);
  const [newTxn, setNewTxn] = useState({ amount: '', merchant: '', category: 'Essentials', type: 'expense', accountId: '' });

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newTxn.amount || !newTxn.merchant || !newTxn.accountId) return;
    addTransaction({ ...newTxn, amount: Number(newTxn.amount) });
    setNewTxn({ amount: '', merchant: '', category: 'Essentials', type: 'expense', accountId: accounts[0]?.id || '' });
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Transactions</h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          {isAdding ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
          {isAdding ? 'Cancel' : 'New Transaction'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-[#151B23] p-5 rounded-xl border border-[#252D39] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
           <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select 
              value={newTxn.type} 
              onChange={e => setNewTxn({...newTxn, type: e.target.value})}
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
              value={newTxn.amount} 
              onChange={e => setNewTxn({...newTxn, amount: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" 
              placeholder="0.00"
              required
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Merchant</label>
            <input 
              type="text" 
              value={newTxn.merchant} 
              onChange={e => setNewTxn({...newTxn, merchant: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white" 
              placeholder="e.g. Amazon"
              required
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">Category (50/30/20)</label>
            <select 
              value={newTxn.category} 
              onChange={e => setNewTxn({...newTxn, category: e.target.value})}
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
              value={newTxn.accountId} 
              onChange={e => setNewTxn({...newTxn, accountId: e.target.value})}
              className="w-full bg-[#0B0F14] border border-[#252D39] rounded-lg p-2.5 text-white"
              required
            >
              <option value="" disabled>Select Account</option>
              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-lg font-medium hover:bg-blue-700 w-full h-[42px] lg:col-span-1">
            Add
          </button>
        </form>
      )}

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
              {transactions.map(txn => {
                const acc = accounts.find(a => a.id === txn.accountId);
                const d = new Date(txn.date);
                return (
                  <tr key={txn.id} className="border-b border-[#252D39]/50 hover:bg-[#0B0F14] transition-colors">
                    <td className="p-4 text-sm text-gray-300">{d.toLocaleDateString()}</td>
                    <td className="p-4 text-sm text-white font-medium">{txn.merchant}</td>
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
                      <button onClick={() => deleteTransaction(txn.id)} className="text-gray-500 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4 inline-block" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
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
    { id: 'accounts', label: 'Accounts', icon: Wallet },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'transactions': return <TransactionsView />;
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