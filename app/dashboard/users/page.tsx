'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { logEvent } from '@/lib/audit';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Image from 'next/image';
import { 
  UserPlus, 
  MoreVertical, 
  Mail, 
  Tag, 
  Shield, 
  Trash2,
  AlertCircle,
  X,
  Check,
  Phone,
  Calendar,
  MapPin,
  Briefcase,
  Settings,
  Pencil,
  Loader2,
  Printer
} from 'lucide-react';

interface UserData {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'member';
  photoURL?: string;
  createdAt?: string;
  birthDate?: string;
  function?: string;
  address?: string;
  addressNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  isPending?: boolean;
  permissions?: Record<string, boolean>;
}

export default function UsersPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member');
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const screens = [
    { id: 'dashboard', name: 'Painel Geral' },
    { id: 'vendas', name: 'Vendas/Pedidos' },
    { id: 'producao', name: 'Produção (Geral)' },
    { id: 'entrada', name: 'Produção - Entrada' },
    { id: 'serragem', name: 'Produção - Serragem' },
    { id: 'acido', name: 'Produção - Ácido' },
    { id: 'resina', name: 'Produção - Resina' },
    { id: 'polimento', name: 'Produção - Polimento' },
    { id: 'estoque', name: 'Produção - Estoque' },
    { id: 'quebrada', name: 'Produção - Quebradas' },
    { id: 'saidas', name: 'Saídas (Expedição/Vendas)' },
    { id: 'financeiro', name: 'Financeiro' },
    { id: 'relatorios', name: 'Relatórios' },
    { id: 'usuarios', name: 'Usuários' },
  ];

  const brazilianStates = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userData = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as UserData[];
      // Sort by role then name
      userData.sort((a, b) => {
        if (a.role === b.role) return a.name.localeCompare(b.name);
        return a.role === 'admin' ? -1 : 1;
      });
      setUsers(userData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const filteredUsers = users.filter((u) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      (u.phone && u.phone.toLowerCase().includes(searchLower)) ||
      u.role.toLowerCase().includes(searchLower) ||
      (u.function && u.function.toLowerCase().includes(searchLower)) ||
      (u.city && u.city.toLowerCase().includes(searchLower)) ||
      (u.state && u.state.toLowerCase().includes(searchLower))
    );
  });

  const exportUsersPDF = () => {
    const doc = new jsPDF();
    doc.text('Relatorio de Usuarios', 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);
    
    const tableData = filteredUsers.map(u => [
      u.name || '',
      u.email || '',
      u.role === 'admin' ? 'Administrador' : 'Operador',
      u.isPending ? 'Pendente' : 'Ativo'
    ]);

    autoTable(doc, {
      head: [['Nome', 'Email', 'Funcao', 'Status']],
      body: tableData,
      startY: 30,
    });

    doc.save(`usuarios_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    setSubmitting(true);

    const normalizedEmail = newEmail.trim().toLowerCase();
    
    try {
      // Check if user already exists
      const q = query(collection(db, 'users'), where('email', '==', normalizedEmail));
      const querySnap = await getDocs(q);
      
      let targetId = `pending_${Date.now()}`;
      let isUpdate = false;

      if (!querySnap.empty) {
        // If user already exists, we'll update that document instead of erroring
        targetId = querySnap.docs[0].id;
        isUpdate = true;
      }

      const userData = {
        email: normalizedEmail,
        phone: newPhone,
        role: newRole,
        name: isUpdate ? querySnap.docs[0].data().name : 'Pendente (Aguardando Login)',
        isPending: true,
        createdAt: isUpdate ? querySnap.docs[0].data().createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', targetId), userData, { merge: true });

      // Log user creation/update
      await logEvent({
        event: `${isUpdate ? 'Gestor re-ativou/atualizou' : 'Gestor criou novo'} usuário pendente: ${normalizedEmail}`,
        targetUserId: targetId,
        targetUserName: normalizedEmail,
        type: isUpdate ? 'user_update' : 'user_create'
      });

      setIsModalOpen(false);
      setNewEmail('');
      setNewPhone('');
      setNewRole('member');
    } catch (error) {
      console.error(error);
      alert('Erro ao cadastrar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    try {
      const userRef = doc(db, 'users', editingUser.uid);
      // Remove uid from data to update and normalize email
      const { uid, ...data } = editingUser;
      if (data.email) data.email = data.email.trim().toLowerCase();
      
      await updateDoc(userRef, data as any);

      // Log user update
      await logEvent({
        event: `Gestor atualizou dados do usuário: ${editingUser.email}`,
        targetUserId: editingUser.uid,
        targetUserName: editingUser.name,
        type: 'user_update'
      });

      setEditingUser(null);
    } catch (error) {
      console.error('Failed to update user', error);
      alert('Erro ao atualizar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRoleValue = currentRole === 'admin' ? 'member' : 'admin';
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRoleValue });
      
      const targetUser = users.find(u => u.uid === userId);
      // Log toggle role
      await logEvent({
        event: `Gestor alterou nível de acesso de ${targetUser?.name || userId} para ${newRoleValue}`,
        targetUserId: userId,
        targetUserName: targetUser?.name,
        type: 'user_update'
      });
    } catch (error) {
      console.error('Failed to update role', error);
      alert('Erro ao atualizar permissão. Verifique se você tem permissões de administrador.');
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      const targetUser = users.find(u => u.uid === userId);
      const userEmail = targetUser?.email;

      await deleteDoc(doc(db, 'users', userId));

      // Check for any other documents with the same email (duplicates or stray pending docs)
      if (userEmail) {
        const q = query(collection(db, 'users'), where('email', '==', userEmail.toLowerCase()));
        const snap = await getDocs(q);
        const batchDeletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(batchDeletePromises);
      }

      // Log deletion
      await logEvent({
        event: `Gestor excluiu o usuário: ${targetUser?.name || userId} (${userEmail})`,
        targetUserId: userId,
        targetUserName: targetUser?.name,
        type: 'user_delete'
      });
    } catch (error) {
      console.error('Failed to delete user', error);
      alert('Erro ao excluir usuário.');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-red-50 p-8 rounded-2xl border border-red-100 flex flex-col items-center text-center gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div>
          <h2 className="text-xl font-bold text-red-900">Acesso Negado</h2>
          <p className="text-red-700 mt-1">Apenas administradores podem visualizar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Gerenciamento de Usuários</h1>
          <p className="text-slate-500 text-sm">Visualize e altere as permissões dos usuários cadastrados.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Shield className="w-4 h-4" />
            </span>
            <input 
              type="text" 
              placeholder="Pesquisar usuários..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all w-48 sm:w-64"
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 no-print"
          >
            <UserPlus className="w-4 h-4" />
            Novo Usuário
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={exportUsersPDF}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition shadow-sm no-print"
            >
              <Printer className="w-4 h-4" />
              Gerar PDF
            </button>
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-50 transition shadow-sm no-print"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          </div>
        </div>
      </header>

      {/* Modal Novo Usuário */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 uppercase tracking-tight text-sm">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  Cadastrar Novo Usuário
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Endereço de E-mail</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    placeholder="ex: funcionario@empresa.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nível de Acesso</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewRole('member')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                        newRole === 'member' 
                          ? 'bg-blue-50 border-blue-200 text-blue-700' 
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      MEMBRO
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRole('admin')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                        newRole === 'admin' 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20' 
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      ADMIN
                    </button>
                  </div>
                </div>
                <div className="pt-4">
                  <button
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Confirmar Cadastro
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Editar Usuário */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 my-8"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 leading-tight">Configurar Perfil</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{editingUser.email}</p>
                  </div>
                </div>
                <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
                {/* Informações Pessoais */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6 md:col-span-2">
                    <h4 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5" /> Informações Básicas
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nome Completo</label>
                        <input
                          type="text"
                          value={editingUser.name}
                          onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cargo / Função</label>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={editingUser.function || ''}
                            onChange={(e) => setEditingUser({...editingUser, function: e.target.value})}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                            placeholder="Ex: Laminador, Vendedor..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Telefone de Contato</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="tel"
                        value={editingUser.phone || ''}
                        onChange={(e) => setEditingUser({...editingUser, phone: e.target.value})}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data de Nascimento</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="date"
                        value={editingUser.birthDate || ''}
                        onChange={(e) => setEditingUser({...editingUser, birthDate: e.target.value})}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Logradouro / Rua</label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={editingUser.address || ''}
                            onChange={(e) => setEditingUser({...editingUser, address: e.target.value})}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                            placeholder="Nome da rua..."
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Número</label>
                        <input
                          type="text"
                          value={editingUser.addressNumber || ''}
                          onChange={(e) => setEditingUser({...editingUser, addressNumber: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          placeholder="Ex: 123"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bairro</label>
                        <input
                          type="text"
                          value={editingUser.neighborhood || ''}
                          onChange={(e) => setEditingUser({...editingUser, neighborhood: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          placeholder="Bairro..."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cidade</label>
                        <input
                          type="text"
                          value={editingUser.city || ''}
                          onChange={(e) => setEditingUser({...editingUser, city: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          placeholder="Cidade..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estado (UF)</label>
                        <select
                          value={editingUser.state || ''}
                          onChange={(e) => setEditingUser({...editingUser, state: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm bg-white"
                        >
                          <option value="">UF</option>
                          {brazilianStates.map(uf => (
                            <option key={uf} value={uf}>{uf}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CEP</label>
                        <input
                          type="text"
                          value={editingUser.cep || ''}
                          onChange={(e) => {
                            const formatted = formatCEP(e.target.value);
                            if (formatted.length <= 9) {
                              setEditingUser({...editingUser, cep: formatted});
                            }
                          }}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          placeholder="00000-000"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Permissões de Telas */}
                <div className="space-y-6 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> Permissões de Acesso às Telas
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {screens.map(screen => (
                      <label 
                        key={screen.id} 
                        className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
                      >
                        <span className="text-sm font-medium text-slate-700">{screen.name}</span>
                        <div className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={editingUser.permissions?.[screen.id] ?? (editingUser.role === 'admin')}
                            onChange={(e) => {
                              const perms = { ...(editingUser.permissions || {}) };
                              perms[screen.id] = e.target.checked;
                              setEditingUser({ ...editingUser, permissions: perms });
                            }}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-8 flex gap-3 sticky bottom-0 bg-white">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-700 font-bold text-sm hover:bg-slate-50 transition"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    SALVAR ALTERAÇÕES
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contato</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Permissão</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic font-sans not-italic">
              {filteredUsers.map((user, i) => (
                <motion.tr 
                  key={user.uid}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <Image 
                          src={user.photoURL} 
                          className="w-8 h-8 rounded-full border border-slate-100 shrink-0"
                          alt={user.name}
                          width={32}
                          height={32}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${user.isPending ? 'opacity-50 grayscale' : ''}`}>
                          {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <span className={`font-bold text-sm text-slate-900 truncate max-w-[200px] block ${user.isPending ? 'text-slate-400 italic' : ''}`}>
                          {user.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium block truncate max-w-[200px]">{user.function || 'Função não definida'}</span>
                        {user.isPending && (
                          <span className="text-[9px] text-amber-500 font-bold uppercase tracking-tighter">Aguardando login</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="space-y-0.5">
                      <div className="text-sm text-slate-700 font-medium">{user.email}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5" />
                        {user.phone || 'N/D'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                        user.role === 'admin' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role}
                      </span>
                      {user.role === 'member' && user.permissions && (
                        <span className="text-[8px] text-slate-400 font-bold uppercase">
                          {Object.values(user.permissions).filter(Boolean).length} Telas Liberadas
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2">
                       <button 
                        onClick={() => setEditingUser(user)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                        title="Configurar Perfil"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => toggleRole(user.uid, user.role)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                        title="Inverter Cargo"
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteUser(user.uid)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredUsers.length === 0 && !loading && (
          <div className="p-20 text-center text-slate-400">
            Nenhum usuário encontrado{searchTerm ? ` para "${searchTerm}"` : ''}.
          </div>
        )}
      </div>

      {/* Seção Exclusiva para Impressão */}
      <div className="print-only bg-white text-black">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-[#2980b9] mb-1 uppercase">Relatório de Usuários</h1>
            <p className="text-[10px] text-slate-500">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
          </div>
        </div>

        <table className="w-full text-left border-collapse border border-slate-300">
          <thead>
            <tr className="bg-[#2980b9] text-white">
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Nome</th>
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">E-mail</th>
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Função</th>
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u, i) => (
              <tr key={u.uid} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="p-2 text-[10px] border border-slate-200 font-medium">{u.name}</td>
                <td className="p-2 text-[10px] border border-slate-200">{u.email}</td>
                <td className="p-2 text-[10px] border border-slate-200 capitalize">{u.role === 'admin' ? 'Administrador' : 'Operador'}</td>
                <td className="p-2 text-[10px] border border-slate-200">{u.isPending ? 'Pendente' : 'Ativo'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 text-[8px] text-slate-400 text-center uppercase tracking-widest">
          mc marmo control - gestão de usuários
        </div>
      </div>
    </div>
  );
}
