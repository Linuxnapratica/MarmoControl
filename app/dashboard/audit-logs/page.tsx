'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { logEvent } from '@/lib/audit';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Search, 
  Lock, 
  Unlock, 
  Calendar, 
  User, 
  Clock, 
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  UserPlus,
  RefreshCcw,
  Trash2,
  ChevronRight
} from 'lucide-react';

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  event: string;
  details?: string;
  targetUserId?: string;
  targetUserName?: string;
  type: 'login_success' | 'login_failure' | 'user_create' | 'user_update' | 'user_delete' | 'security_access';
  timestamp: any;
}

export default function AuditLogsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [now, setNow] = useState(new Date());

  // Password for the audit logs section (as requested: "protegida por senha")
  // In a real app, this should be verified server-side or be a separate secret.
  const AUDIT_PASSWORD = 'admin_audit_logs'; 

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAdmin || !isUnlocked) return;

    const q = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AuditLog[];
      setLogs(logsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, isUnlocked]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === AUDIT_PASSWORD) {
      setIsUnlocked(true);
      setErrorMsg('');
      // Log successful access
      logEvent({
        event: 'Administrador desbloqueou acesso aos logs de auditoria.',
        type: 'security_access'
      });
    } else {
      setErrorMsg('Senha incorreta. Acesso negado.');
      // Log failed access attempt
      logEvent({
        event: 'TENTATIVA DE ACESSO NÃO AUTORIZADO aos logs de auditoria!',
        details: `Senha tentada: ${password}`,
        type: 'security_access'
      });
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'login_success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'login_failure': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'user_create': return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'user_update': return <RefreshCcw className="w-4 h-4 text-amber-500" />;
      case 'user_delete': return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'security_access': return <ShieldAlert className="w-4 h-4 text-purple-500" />;
      default: return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return 'N/A';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('pt-BR');
  };

  const filteredLogs = logs.filter(log => 
    log.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.targetUserName && log.targetUserName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-red-50 p-8 rounded-2xl border border-red-100 flex flex-col items-center text-center gap-4">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <div>
          <h2 className="text-xl font-bold text-red-900">Acesso Restrito</h2>
          <p className="text-red-700 mt-1">Apenas administradores seniores podem visualizar o log de auditoria.</p>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 w-full max-w-md text-center"
        >
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Logs de Auditoria</h2>
          <p className="text-slate-500 text-sm mb-8">Esta é uma área sensível. Por favor, insira a senha de mestre para visualizar os registros de segurança.</p>
          
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="relative">
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha de acesso"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center font-mono tracking-widest"
                autoFocus
              />
            </div>
            {errorMsg && (
              <p className="text-red-500 text-xs font-bold">{errorMsg}</p>
            )}
            <button 
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 group"
            >
              <Unlock className="w-4 h-4" />
              DESBLOQUEAR ACESSO
            </button>
          </form>
          <p className="mt-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Acesso monitorado • MC Security
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-emerald-500 w-2 h-2 rounded-full animate-pulse" />
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Logs de Auditoria</h1>
          </div>
          <p className="text-slate-500 text-sm">Registros em tempo real de todas as ações sensíveis no sistema MarmoControl.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input 
              type="text" 
              placeholder="Filtrar eventos ou usuários..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all w-64"
            />
          </div>
          <button 
            onClick={() => setIsUnlocked(false)}
            className="flex items-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-lg font-bold text-xs hover:bg-slate-50 transition"
          >
            <Lock className="w-3.5 h-3.5" />
            BLOQUEAR
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total de Eventos', value: logs.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Falhas de Segurança', value: logs.filter(l => l.type === 'login_failure').length, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Últimas 24h', value: logs.filter(l => {
            const date = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
            return date > new Date(now.getTime() - 24 * 60 * 60 * 1000);
          }).length, icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-xl flex items-center justify-center`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Evento</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Autor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Alvo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data/Hora</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic font-sans not-italic">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCcw className="w-8 h-8 text-blue-400 animate-spin" />
                      <p className="text-sm font-medium text-slate-400">Carregando registros...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center font-medium text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 p-2 bg-white rounded-lg border border-slate-200 group-hover:border-blue-200 transition-colors">
                          {getEventIcon(log.type)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 leading-tight mb-0.5">{log.event}</p>
                          <p className="text-[10px] text-slate-500 font-medium truncate max-w-[300px]">{log.details || 'Sem detalhes adicionais'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-slate-400" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">{log.userName}</p>
                          <p className="text-[9px] text-slate-400 font-mono">{log.userId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {log.targetUserName ? (
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3 h-3 text-slate-300" />
                          <div>
                            <p className="text-xs font-bold text-blue-700">{log.targetUserName}</p>
                            <p className="text-[9px] text-slate-400 font-mono">{log.targetUserId}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-900">{formatTimestamp(log.timestamp).split(' ')[0]}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{formatTimestamp(log.timestamp).split(' ')[1]}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <code className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                        {log.id.slice(0, 8)}
                      </code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-600 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-xl font-bold mb-2">Compromisso com a Transparência</h3>
          <p className="text-blue-100 text-sm max-w-2xl">
            Este log não pode ser alterado ou excluído. Todas as modificações em usuários e tentativas de acesso são registradas para garantir a integridade da operação marmoira. Em caso de discrepância, entre em contato com o suporte técnico.
          </p>
        </div>
        <ShieldAlert className="absolute -right-8 -bottom-8 w-48 h-48 text-white/5 rotate-12" />
      </div>
    </div>
  );
}
