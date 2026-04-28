'use client'

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  limit, 
  addDoc, 
  updateDoc, 
  doc, 
  writeBatch,
  where,
  getDocs,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  ShoppingCart, 
  Users, 
  Search, 
  Calendar, 
  Package, 
  Plus, 
  CheckCircle2, 
  Trash2, 
  ArrowRight,
  MoreVertical,
  LogOut,
  ChevronDown,
  UserPlus,
  ArrowUpRight,
  History,
  Check,
  X,
  Printer,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logEvent } from '@/lib/audit';
import Image from 'next/image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Client {
  id: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface SlabEntry {
  id: string;
  parentBlockId: string;
  slabId: string;
  length: number;
  height: number;
  area: number;
  status: string;
  userName: string;
  createdAt: string;
  photoUrl?: string;
  materialType?: string;
}

interface SlabOutlet {
  id: string;
  clientId: string;
  clientName: string;
  slabIds: string[];
  totalM2: number;
  totalItems: number;
  outletDate: string;
  notes?: string;
  userName: string;
  createdAt: string;
}

export default function SaidasPage() {
  const { user, profile, hasPermission, isAdmin } = useAuth();
  const [slabs, setSlabs] = useState<SlabEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [outlets, setOutlets] = useState<SlabOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedSlabs, setSelectedSlabs] = useState<string[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Client Form
  const [clientName, setClientName] = useState('');
  const [clientDoc, setClientDoc] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  useEffect(() => {
    if (!user || (!hasPermission('saidas') && !isAdmin)) return;

    // Fetch in-stock slabs (status 'estoque')
    const qSlabs = query(
      collection(db, 'slabEntries'),
      where('status', '==', 'estoque'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeSlabs = onSnapshot(qSlabs, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SlabEntry[];
      setSlabs(data);
      setLoading(false);
    });

    // Fetch clients
    const qClients = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubscribeClients = onSnapshot(qClients, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Client[];
      setClients(data);
    });

    // Fetch recent outlets
    const qOutlets = query(collection(db, 'slabOutlets'), orderBy('createdAt', 'desc'), limit(10));
    const unsubscribeOutlets = onSnapshot(qOutlets, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SlabOutlet[];
      setOutlets(data);
    });

    return () => {
      unsubscribeSlabs();
      unsubscribeClients();
      unsubscribeOutlets();
    };
  }, [user, profile, hasPermission, isAdmin]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    setIsSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'clients'), {
        name: clientName.trim(),
        document: clientDoc.trim(),
        phone: clientPhone.trim(),
        createdAt: new Date().toISOString()
      });
      setSelectedClient(docRef.id);
      setShowClientModal(false);
      setClientName('');
      setClientDoc('');
      setClientPhone('');
    } catch (error) {
      console.error(error);
      alert('Erro ao criar cliente');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSlabSelection = (id: string) => {
    setSelectedSlabs(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const generatePDF = () => {
    const client = clients.find(c => c.id === selectedClient);
    const selectedSlabData = slabs.filter(s => selectedSlabs.includes(s.id));
    
    const doc = new jsPDF();
    const title = `Relatório de Saída - ${client?.name || 'Cliente'}`;
    
    doc.setFontSize(20);
    doc.text('Relatório de Expedição', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Cliente: ${client?.name || 'Não informado'}`, 14, 32);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 37);
    doc.text(`Total de Chapas: ${selectedSlabs.length}`, 14, 42);
    doc.text(`Total M2: ${selectedTotalArea.toFixed(2).replace('.', ',')}`, 14, 47);
    doc.text(`Emitido por: ${profile?.name || 'Sistema'}`, 14, 52);

    const tableData = selectedSlabData.map(s => [
      s.slabId,
      s.parentBlockId,
      `${s.length} x ${s.height}`,
      s.area.toFixed(2).replace('.', ',')
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['ID Chapa', 'Bloco de Origem', 'Medidas (cm)', 'Área (m²)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`saida_${client?.name?.toLowerCase().replace(/\s+/g, '_') || 'cliente'}_${new Date().getTime()}.pdf`);
  };

  const handleFinishOutlet = async () => {
    if (!selectedClient || selectedSlabs.length === 0) {
      alert('Selecione um cliente e ao menos uma chapa.');
      return;
    }

    const client = clients.find(c => c.id === selectedClient);
    if (!client) return;

    setIsSubmitting(true);
    const batch = writeBatch(db);

    try {
      const selectedSlabData = slabs.filter(s => selectedSlabs.includes(s.id));
      const totalM2 = selectedSlabData.reduce((acc, curr) => acc + curr.area, 0);

      // 1. Create Outlet Record
      const outletRef = doc(collection(db, 'slabOutlets'));
      batch.set(outletRef, {
        clientId: selectedClient,
        clientName: client.name,
        slabIds: selectedSlabs,
        totalM2,
        totalItems: selectedSlabs.length,
        outletDate: new Date().toISOString(),
        userId: user?.uid,
        userName: profile?.name || 'Sistema',
        createdAt: new Date().toISOString()
      });

      // 2. Update status of slabs to 'vendido'
      selectedSlabs.forEach(id => {
        const slabRef = doc(db, 'slabEntries', id);
        batch.update(slabRef, { 
          status: 'vendido',
          updatedAt: new Date().toISOString(),
          outletId: outletRef.id
        });
      });

      await batch.commit();

      // Log event
      await logEvent({
        event: `Gestor registrou saída de ${selectedSlabs.length} chapas para ${client.name}`,
        details: `M2 Total: ${totalM2.toFixed(2)}`,
        type: 'user_update'
      });

      setSelectedSlabs([]);
      setSelectedClient('');
      setShowReviewModal(false);
      alert('Saída registrada com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao registrar saída');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSlabs = slabs.filter(s => 
    s.slabId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.parentBlockId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedTotalArea = slabs
    .filter(s => selectedSlabs.includes(s.id))
    .reduce((acc, curr) => acc + curr.area, 0);

  if (!isAdmin && !hasPermission('saidas')) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Acesso Negado</h2>
        <p className="text-slate-500">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Search & Client Selection */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm sticky top-0 z-10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">Expedição / Saídas</h1>
              <p className="text-sm text-slate-500">Gerencie a saída de chapas em estoque para clientes.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48 text-right hidden sm:block">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Total Selecionado</p>
              <p className="text-lg font-black text-blue-600 leading-none mt-1">{selectedSlabs.length} itens / {selectedTotalArea.toFixed(2).replace('.', ',')} m²</p>
            </div>
            
            <button
              onClick={() => setShowReviewModal(true)}
              disabled={isSubmitting || selectedSlabs.length === 0 || !selectedClient}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all"
            >
              <ArrowUpRight className="w-4 h-4" />
              Finalizar Saída
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Bloco ou Chapa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            />
          </div>

          <div className="relative group flex gap-2">
            <div className="relative flex-1">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all font-medium appearance-none"
              >
                <option value="">Selecione um Cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <button
              onClick={() => setShowClientModal(true)}
              className="p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-200 transition-colors"
              title="Novo Cliente"
            >
              <UserPlus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-800 rounded-2xl border border-amber-100">
            <History className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-tight">Últimas Saídas:</span>
            <div className="flex -space-x-2">
              {outlets.slice(0, 3).map(o => (
                <div key={o.id} className="w-6 h-6 rounded-full bg-white border border-amber-200 flex items-center justify-center text-[8px] font-bold" title={o.clientName}>
                  {o.clientName.substring(0, 1)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Slabs List */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Chapas em Estoque ({filteredSlabs.length})</h2>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              SELECIONADAS
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64 bg-white rounded-3xl border border-slate-100">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredSlabs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border border-slate-100 border-dashed text-center p-8">
              <Package className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Nenhuma chapa em estoque disponível.</p>
              <p className="text-xs text-slate-400 mt-1">Verifique se as chapas foram devidamente movidas para o estoque na tela de produção.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredSlabs.map(slab => (
                  <motion.div
                    layout
                    key={slab.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => toggleSlabSelection(slab.id)}
                    className={`relative p-4 rounded-3xl border cursor-pointer transition-all ${
                      selectedSlabs.includes(slab.id) 
                        ? 'bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500' 
                        : 'bg-white border-slate-100 shadow-sm hover:border-slate-300'
                    }`}
                  >
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 mb-3 group">
                      {slab.photoUrl ? (
                        <Image
                          src={slab.photoUrl}
                          alt={slab.slabId}
                          fill
                          className="object-cover group-hover:scale-110 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                      
                      <div className="absolute top-2 right-2">
                        {selectedSlabs.includes(slab.id) ? (
                          <div className="bg-blue-600 text-white p-1 rounded-lg">
                            <Check className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="bg-white/90 p-1 rounded-lg backdrop-blur text-slate-400">
                            <Plus className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Bloco: {slab.parentBlockId}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">{slab.materialType || 'CHAPA'}</span>
                      </div>
                      <h3 className="font-black text-slate-900 tracking-tight">{slab.slabId}</h3>
                      <div className="flex items-center gap-4 text-xs font-medium text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 rotate-45 rotate-90" />
                          {slab.length} cm
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />
                          {slab.height} cm
                        </span>
                      </div>
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-600 bg-blue-100/50 px-2 py-1 rounded-xl">
                          {slab.area.toFixed(2).replace('.', ',')} m²
                        </span>
                        <span className="text-[10px] text-slate-400">{new Date(slab.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Info / Summary Panel */}
        <div className="space-y-6">
          {/* Outlet Summary */}
          <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Resumo da Saída</p>
                <ShoppingCart className="w-4 h-4 text-blue-400" />
              </div>

              <div>
                <p className="text-4xl font-black tracking-tight">{selectedSlabs.length}</p>
                <p className="text-xs font-medium text-slate-400">Chapas Selecionadas</p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                <div>
                  <p className="text-xl font-bold leading-tight">{selectedTotalArea.toFixed(2).replace('.', ',')}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Total M²</p>
                </div>
                <div>
                  <p className="text-xl font-bold leading-tight">
                    {selectedClient ? clients.find(c => c.id === selectedClient)?.name.split(' ')[0] : '-'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Cliente</p>
                </div>
              </div>

              <button
                onClick={() => setShowReviewModal(true)}
                disabled={isSubmitting || selectedSlabs.length === 0 || !selectedClient}
                className="w-full py-4 bg-blue-600 rounded-2xl font-extrabold text-sm hover:bg-blue-500 active:scale-95 transition-all shadow-xl shadow-blue-900/40 flex items-center justify-center gap-2 mt-4 disabled:opacity-30 disabled:shadow-none"
              >
                REGISTRAR SAÍDA
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Recent Outlets List */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Saídas Recentes</h2>
            <div className="space-y-4">
              {outlets.map(outlet => (
                <div key={outlet.id} className="group p-3 hover:bg-slate-50 rounded-2xl transition-colors border-b border-slate-50 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate flex-1">{outlet.clientName}</p>
                    <span className="text-[8px] font-bold text-slate-400">{new Date(outlet.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-blue-600">{outlet.totalItems} Chapas / {outlet.totalM2.toFixed(2)} m²</p>
                    <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-blue-500" />
                  </div>
                </div>
              ))}
              {outlets.length === 0 && (
                <p className="text-xs text-center text-slate-400 py-4">Nenhuma saída registrada.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Client Modal */}
      <AnimatePresence>
        {showClientModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClientModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Novo Cliente</h2>
                  <p className="text-sm text-slate-500">Cadastre um cliente para realizar saídas.</p>
                </div>
                <button 
                  onClick={() => setShowClientModal(false)}
                  className="p-3 hover:bg-slate-100 rounded-2xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleCreateClient} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Nome do Cliente</label>
                  <input
                    required
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: Marmoraria Silva"
                    className="w-full px-6 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">CPF / CNPJ</label>
                    <input
                      type="text"
                      value={clientDoc}
                      onChange={(e) => setClientDoc(e.target.value)}
                      placeholder="00.000.000/0001-00"
                      className="w-full px-6 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Telefone</label>
                    <input
                      type="text"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-6 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting || !clientName.trim()}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 disabled:opacity-30 active:scale-95 transition-all shadow-xl shadow-slate-200"
                  >
                    {isSubmitting ? 'CADASTRANDO...' : 'CADASTRAR E SELECIONAR'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Review & Report Modal */}
      <AnimatePresence>
        {showReviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReviewModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Relatório de Saída</h2>
                    <p className="text-sm text-slate-500">Revise os detalhes antes de finalizar a operação.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowReviewModal(false)}
                  className="p-3 hover:bg-slate-100 rounded-2xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                {/* Client Info Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</p>
                    <p className="font-bold text-slate-900">{clients.find(c => c.id === selectedClient)?.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documento</p>
                    <p className="font-medium text-slate-700">{clients.find(c => c.id === selectedClient)?.document || 'Não informado'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data de Saída</p>
                    <p className="font-medium text-slate-700">{new Date().toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>

                {/* Slabs Table */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-2">Detalhamento das Chapas</h3>
                  <div className="overflow-hidden rounded-3xl border border-slate-100">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Foto</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID Chapa</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Medidas (cm)</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Área (m²)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slabs.filter(s => selectedSlabs.includes(s.id)).map(slab => (
                          <tr key={slab.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3">
                              <div className="w-12 h-12 relative rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                                {slab.photoUrl ? (
                                  <Image
                                    src={slab.photoUrl}
                                    alt={slab.slabId}
                                    fill
                                    className="object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <Package className="w-4 h-4" />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-black text-slate-900 text-sm tracking-tight">{slab.slabId}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Bloco: {slab.parentBlockId}</p>
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-500 text-xs uppercase">{slab.materialType || 'CHAPA'}</td>
                            <td className="px-6 py-4 text-center font-medium text-slate-600 text-xs">{slab.length} x {slab.height}</td>
                            <td className="px-6 py-4 text-right font-black text-blue-600 text-sm">{slab.area.toFixed(2).replace('.', ',')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-blue-50/50">
                          <td colSpan={3} className="px-6 py-5 text-right font-bold text-slate-500 text-xs">TOTAL GERAL:</td>
                          <td className="px-6 py-5 text-right font-black text-blue-600 text-lg">{selectedTotalArea.toFixed(2).replace('.', ',')} m²</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <button
                  onClick={generatePDF}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-slate-600 border-2 border-slate-100 rounded-2xl font-bold text-sm hover:border-slate-300 hover:bg-slate-50 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Relatório
                </button>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowReviewModal(false)}
                    className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
                  >
                    Voltar e Editar
                  </button>
                  <button
                    onClick={handleFinishOutlet}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all"
                  >
                    {isSubmitting ? 'Finalizando...' : (
                      <>
                        Confirmar e Finalizar Saída
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
