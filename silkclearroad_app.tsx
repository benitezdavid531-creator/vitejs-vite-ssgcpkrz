import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ReceiptText, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart,
  X,
  Check,
  Plane,
  Plus,
  Trash2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs 
} from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
// Usando variables globales del entorno inmersivo
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'silkclearroad-app';

// --- INVENTARIO INICIAL ---
const initialInventory = [
  { name: "Chompas acolchadas", stock: 6, cost: 62.83, suggestedPrice: 140.00 },
  { name: "Chaleco acolchado", stock: 1, cost: 45.69, suggestedPrice: 125.00 },
  { name: "Camisetas Polo", stock: 5, cost: 22.11, suggestedPrice: 35.00 },
  { name: "Camisas (Algodón)", stock: 3, cost: 27.90, suggestedPrice: 40.00 },
  { name: "Gorras", stock: 3, cost: 11.54, suggestedPrice: 25.00 }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sellPrice, setSellPrice] = useState('');

  // Import Calculator State
  const [importOrderName, setImportOrderName] = useState('');
  const [importFreightUS, setImportFreightUS] = useState('');
  const [importFreightEC, setImportFreightEC] = useState('');
  const [importItems, setImportItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const [newItemCost, setNewItemCost] = useState('');
  const [newItemWeight, setNewItemWeight] = useState('');
  const [newItemSuggestedPrice, setNewItemSuggestedPrice] = useState('');

  // 1. Auth Initializer
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Error autenticando:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching & Seeding
  useEffect(() => {
    if (!user) return;

    const inventoryRef = collection(db, 'artifacts', appId, 'users', user.uid, 'inventory');
    const salesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'sales');

    const seedDataIfNeeded = async () => {
      try {
        const snap = await getDocs(inventoryRef);
        if (snap.empty) {
          // Pre-populate inventory
          const promises = initialInventory.map(item => addDoc(inventoryRef, item));
          await Promise.all(promises);
        }
      } catch (error) {
        console.error("Error validando datos iniciales:", error);
      }
    };

    seedDataIfNeeded();

    // Listeners
    const unsubInventory = onSnapshot(inventoryRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordenar alfabéticamente
      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items);
      setIsLoading(false);
    }, (error) => console.error("Error cargando inventario:", error));

    const unsubSales = onSnapshot(salesRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSales(items);
    }, (error) => console.error("Error cargando ventas:", error));

    return () => {
      unsubInventory();
      unsubSales();
    };
  }, [user]);

  // --- DERIVED STATE (METRICS) ---
  const metrics = useMemo(() => {
    let totalSales = 0;
    let totalProfit = 0;
    sales.forEach(sale => {
      totalSales += Number(sale.salePrice) || 0;
      totalProfit += Number(sale.profit) || 0;
    });

    let totalItemsInStock = 0;
    let totalInventoryValue = 0;
    inventory.forEach(item => {
      totalItemsInStock += Number(item.stock) || 0;
      totalInventoryValue += (Number(item.stock) || 0) * (Number(item.cost) || 0);
    });

    return { totalSales, totalProfit, totalItemsInStock, totalInventoryValue };
  }, [sales, inventory]);

  // --- ACTIONS ---
  const openSellModal = (item) => {
    setSelectedItem(item);
    setSellPrice(item.suggestedPrice.toString());
    setIsSellModalOpen(true);
  };

  const closeSellModal = () => {
    setIsSellModalOpen(false);
    setSelectedItem(null);
    setSellPrice('');
  };

  const handleConfirmSale = async () => {
    if (!selectedItem || !user) return;
    
    const finalPrice = parseFloat(sellPrice);
    if (isNaN(finalPrice) || finalPrice <= 0) {
      // Ignorar entradas inválidas silenciosamente para evitar alerts
      return;
    }

    const profit = finalPrice - selectedItem.cost;

    try {
      // 1. Registrar Venta
      const salesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'sales');
      await addDoc(salesRef, {
        inventoryId: selectedItem.id,
        name: selectedItem.name,
        cost: selectedItem.cost,
        salePrice: finalPrice,
        profit: profit,
        timestamp: new Date().toISOString()
      });

      // 2. Reducir Stock
      const itemRef = doc(db, 'artifacts', appId, 'users', user.uid, 'inventory', selectedItem.id);
      await updateDoc(itemRef, {
        stock: selectedItem.stock - 1
      });

      closeSellModal();
    } catch (error) {
      console.error("Error registrando la venta:", error);
    }
  };

  const handleAddImportItem = () => {
    if (!newItemName || !newItemQty || !newItemCost || !newItemWeight || !newItemSuggestedPrice) return;
    
    const newItem = {
      id: Date.now().toString(),
      name: newItemName,
      qty: parseInt(newItemQty),
      baseCost: parseFloat(newItemCost),
      weight: parseFloat(newItemWeight),
      suggestedPrice: parseFloat(newItemSuggestedPrice)
    };
    
    setImportItems([...importItems, newItem]);
    setNewItemName('');
    setNewItemQty('');
    setNewItemCost('');
    setNewItemWeight('');
    setNewItemSuggestedPrice('');
  };

  const handleRemoveImportItem = (id) => {
    setImportItems(importItems.filter(item => item.id !== id));
  };

  const handleSaveImportToInventory = async () => {
    if (!user || importItems.length === 0) return;
    
    const totalFreightUS = parseFloat(importFreightUS) || 0;
    const totalFreightEC = parseFloat(importFreightEC) || 0;
    const totalFreight = totalFreightUS + totalFreightEC;
    
    const totalWeight = importItems.reduce((sum, item) => sum + (item.qty * item.weight), 0);
    const freightPerGram = totalWeight > 0 ? totalFreight / totalWeight : 0;

    try {
      const inventoryRef = collection(db, 'artifacts', appId, 'users', user.uid, 'inventory');
      
      const promises = importItems.map(item => {
        const finalUnitCost = item.baseCost + (freightPerGram * item.weight);
        return addDoc(inventoryRef, {
          name: item.name,
          stock: item.qty,
          cost: finalUnitCost,
          suggestedPrice: item.suggestedPrice
        });
      });
      
      await Promise.all(promises);
      
      // Reset form
      setImportOrderName('');
      setImportFreightUS('');
      setImportFreightEC('');
      setImportItems([]);
      setActiveTab('inventory');
    } catch (error) {
      console.error("Error guardando importación en inventario:", error);
    }
  };

  // --- RENDERERS ---
  const renderDashboard = () => (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-4">
        {/* Tarjeta de Ganancia Líquida (Destacada) */}
        <div className="bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp size={64} />
          </div>
          <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-1">Ganancia Líquida</p>
          <h2 className="text-4xl font-light text-white tracking-tight">
            ${metrics.totalProfit.toFixed(2)}
          </h2>
          <p className="text-emerald-500 text-xs mt-2 font-medium flex items-center">
            + Liquidez generada
          </p>
        </div>

        {/* Tarjeta de Ventas Totales */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-lg flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-1">Ventas Brutas</p>
            <h3 className="text-2xl font-light text-white">${metrics.totalSales.toFixed(2)}</h3>
          </div>
          <div className="bg-zinc-800/50 p-3 rounded-xl text-zinc-300">
            <DollarSign size={24} />
          </div>
        </div>

        {/* Tarjeta de Stock */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-lg flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-1">Mercadería en Stock</p>
            <h3 className="text-2xl font-light text-white">{metrics.totalItemsInStock} prendas</h3>
            <p className="text-zinc-500 text-xs mt-1">Valor costo: ${metrics.totalInventoryValue.toFixed(2)}</p>
          </div>
          <div className="bg-zinc-800/50 p-3 rounded-xl text-zinc-300">
            <Package size={24} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderInventory = () => (
    <div className="space-y-4 animate-in fade-in duration-300 pb-20">
      <h2 className="text-xl font-light text-white mb-4 tracking-wide border-b border-zinc-800 pb-2">Tu Colección</h2>
      {inventory.length === 0 && !isLoading && (
        <p className="text-zinc-500 text-center py-8">No hay artículos en el inventario.</p>
      )}
      
      {inventory.map(item => (
        <div key={item.id} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex flex-col space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-zinc-100 font-medium text-lg">{item.name}</h3>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${item.stock > 0 ? 'bg-zinc-800 text-zinc-300' : 'bg-red-900/30 text-red-400'}`}>
                Stock: {item.stock}
              </span>
            </div>
            <div className="text-right">
              <p className="text-zinc-500 text-xs uppercase tracking-wide">Costo Unit.</p>
              <p className="text-zinc-300 font-mono">${item.cost.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wide">Sugerido</p>
              <p className="text-white font-light">${item.suggestedPrice.toFixed(2)}</p>
            </div>
            
            <button 
              onClick={() => openSellModal(item)}
              disabled={item.stock <= 0}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                item.stock > 0 
                  ? 'bg-white text-black hover:bg-zinc-200 active:scale-95' 
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <ShoppingCart size={16} />
              <span>Vender</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderSales = () => {
    // Ordenar ventas de más reciente a más antigua
    const sortedSales = [...sales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return (
      <div className="space-y-4 animate-in fade-in duration-300 pb-20">
        <h2 className="text-xl font-light text-white mb-4 tracking-wide border-b border-zinc-800 pb-2">Historial de Ventas</h2>
        
        {sortedSales.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl">
            <ReceiptText className="mx-auto text-zinc-600 mb-3" size={32} />
            <p className="text-zinc-400 text-sm">Aún no has registrado ninguna venta.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedSales.map(sale => {
              const date = new Date(sale.timestamp);
              const formattedDate = date.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
              
              return (
                <div key={sale.id} className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-4 flex justify-between items-center">
                  <div className="flex-1">
                    <p className="text-zinc-200 font-medium text-sm">{sale.name}</p>
                    <div className="flex space-x-3 mt-1 text-xs">
                      <span className="text-zinc-500">{formattedDate}</span>
                      <span className="text-zinc-500">Costo: ${sale.cost.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-white text-sm font-medium">${sale.salePrice.toFixed(2)}</p>
                    <p className="text-emerald-500 text-xs font-medium">+{sale.profit.toFixed(2)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderImports = () => {
    const totalFreightUS = parseFloat(importFreightUS) || 0;
    const totalFreightEC = parseFloat(importFreightEC) || 0;
    const totalFreight = totalFreightUS + totalFreightEC;
    
    const totalWeight = importItems.reduce((sum, item) => sum + (item.qty * item.weight), 0);
    const freightPerGram = totalWeight > 0 ? totalFreight / totalWeight : 0;

    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-24">
        <h2 className="text-xl font-light text-white mb-4 tracking-wide border-b border-zinc-800 pb-2">Nueva Importación</h2>
        
        {/* Order Details */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 space-y-4">
          <h3 className="text-zinc-300 font-medium mb-2">Detalles del Pedido</h3>
          <input type="text" placeholder="Nombre/Número de Pedido" value={importOrderName} onChange={(e) => setImportOrderName(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Flete China-USA ($)</label>
              <input type="number" value={importFreightUS} onChange={(e) => setImportFreightUS(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Flete USA-ECU ($)</label>
              <input type="number" value={importFreightEC} onChange={(e) => setImportFreightEC(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" placeholder="0.00" />
            </div>
          </div>
        </div>

        {/* Add Item Form */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 space-y-4">
          <h3 className="text-zinc-300 font-medium mb-2">Agregar Prenda</h3>
          <input type="text" placeholder="Nombre de la prenda" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Cantidad" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" />
            <input type="number" placeholder="Peso Unit. (gramos)" value={newItemWeight} onChange={(e) => setNewItemWeight(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" />
            <input type="number" placeholder="Costo Base China ($)" value={newItemCost} onChange={(e) => setNewItemCost(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" />
            <input type="number" placeholder="PVP Sugerido ($)" value={newItemSuggestedPrice} onChange={(e) => setNewItemSuggestedPrice(e.target.value)} className="w-full bg-black border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors" />
          </div>
          <button onClick={handleAddImportItem} className="w-full bg-zinc-800 text-white font-medium py-3 rounded-lg flex items-center justify-center space-x-2 active:scale-95 transition-transform hover:bg-zinc-700">
            <Plus size={18} />
            <span>Agregar a la lista</span>
          </button>
        </div>

        {/* Items List & Summary */}
        {importItems.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-zinc-300 font-medium">Resumen y Costos Finales</h3>
            <div className="bg-emerald-900/20 border border-emerald-900/50 p-4 rounded-xl mb-4 text-sm">
              <p className="text-emerald-400">Peso Total: {(totalWeight / 1000).toFixed(2)} kg</p>
              <p className="text-emerald-400">Costo de flete por gramo: ${(freightPerGram).toFixed(4)}</p>
            </div>
            
            {importItems.map((item, index) => {
              const finalUnitCost = item.baseCost + (freightPerGram * item.weight);
              return (
                <div key={index} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex flex-col space-y-2 relative">
                  <button onClick={() => handleRemoveImportItem(item.id)} className="absolute top-3 right-3 text-zinc-500 hover:text-red-400"><Trash2 size={16} /></button>
                  <h4 className="font-medium text-white pr-6">{item.qty}x {item.name}</h4>
                  <div className="grid grid-cols-2 text-xs text-zinc-400 gap-y-1">
                    <p>Costo base: ${item.baseCost.toFixed(2)}</p>
                    <p>Peso: {item.weight}g</p>
                    <p>Flete unitario: ${(freightPerGram * item.weight).toFixed(2)}</p>
                    <p className="text-white font-medium">Final ECU: ${finalUnitCost.toFixed(2)}</p>
                  </div>
                </div>
              );
            })}

            <button onClick={handleSaveImportToInventory} className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center space-x-2 mt-6 active:scale-95 transition-transform shadow-lg shadow-white/10">
              <Check size={20} />
              <span>Guardar en Inventario</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-t-2 border-white rounded-full animate-spin mb-4"></div>
          <p className="text-zinc-500 font-light tracking-widest text-sm">CARGANDO SILKCLEARROAD...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800">
      {/* Mobile Wrapper */}
      <div className="max-w-md mx-auto min-h-screen relative shadow-2xl bg-zinc-950 flex flex-col border-x border-zinc-900">
        
        {/* Header */}
        <header className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 px-6 py-5">
          <h1 className="text-center text-xl font-light tracking-[0.2em] text-white">
            SILK<span className="font-semibold text-zinc-500">CLEAR</span>ROAD
          </h1>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto overflow-x-hidden">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'inventory' && renderInventory()}
          {activeTab === 'sales' && renderSales()}
          {activeTab === 'imports' && renderImports()}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 w-full max-w-md bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900 pb-safe">
          <div className="flex justify-between items-center p-2 px-4">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 flex flex-col items-center p-2 transition-colors ${activeTab === 'dashboard' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <LayoutDashboard size={22} className="mb-1" strokeWidth={activeTab === 'dashboard' ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium tracking-wide">Resumen</span>
            </button>
            <button 
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 flex flex-col items-center p-2 transition-colors ${activeTab === 'inventory' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <Package size={22} className="mb-1" strokeWidth={activeTab === 'inventory' ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium tracking-wide">Inventario</span>
            </button>
            <button 
              onClick={() => setActiveTab('imports')}
              className={`flex-1 flex flex-col items-center p-2 transition-colors ${activeTab === 'imports' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <Plane size={22} className="mb-1" strokeWidth={activeTab === 'imports' ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium tracking-wide">Importar</span>
            </button>
            <button 
              onClick={() => setActiveTab('sales')}
              className={`flex-1 flex flex-col items-center p-2 transition-colors ${activeTab === 'sales' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <ReceiptText size={22} className="mb-1" strokeWidth={activeTab === 'sales' ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium tracking-wide">Ventas</span>
            </button>
          </div>
        </nav>

        {/* Sell Modal Overlay */}
        {isSellModalOpen && selectedItem && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-zinc-900 border border-zinc-800 w-full rounded-3xl p-6 shadow-2xl mb-4 slide-in-from-bottom-10 animate-in duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-white">Registrar Venta</h3>
                <button onClick={closeSellModal} className="p-2 bg-zinc-800/50 rounded-full text-zinc-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-6">
                <p className="text-zinc-400 text-sm mb-1">Prenda seleccionada</p>
                <p className="text-white text-xl font-light">{selectedItem.name}</p>
                <div className="flex space-x-4 mt-2 text-sm">
                  <span className="text-zinc-500">Costo: ${selectedItem.cost.toFixed(2)}</span>
                  <span className="text-zinc-500">Sugerido: ${selectedItem.suggestedPrice.toFixed(2)}</span>
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-zinc-400 text-sm font-medium mb-2">Precio de Venta Real ($)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                  <input 
                    type="number"
                    step="0.01"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className="w-full bg-black border border-zinc-700 rounded-xl py-4 pl-8 pr-4 text-white text-lg focus:outline-none focus:border-white transition-colors"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                {Number(sellPrice) > 0 && (
                  <p className="text-emerald-500 text-sm mt-3 flex items-center justify-end">
                    Ganancia neta: +${(Number(sellPrice) - selectedItem.cost).toFixed(2)}
                  </p>
                )}
              </div>

              <button 
                onClick={handleConfirmSale}
                className="w-full bg-white text-black font-semibold py-4 rounded-xl flex items-center justify-center space-x-2 active:scale-95 transition-transform"
              >
                <Check size={20} />
                <span>Confirmar Venta</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}