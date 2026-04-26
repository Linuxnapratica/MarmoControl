'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { motion } from 'motion/react';
import { 
  Users, 
  TrendingUp, 
  Package, 
  AlertCircle,
  Loader2,
  Layers,
  FlaskConical,
  Beaker,
  Clock,
  Printer,
  Calendar,
  X
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function DashboardPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number>(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rawSlabs, setRawSlabs] = useState<any[]>([]);
  const [rawUsers, setRawUsers] = useState<any[]>([]);

  useEffect(() => {
    setTimeout(() => setNow(Date.now()), 0);
    // Real-time listeners for stats
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setRawUsers(users.map(u => ({ 
        id: u.id, 
        name: u.name || u.displayName || 'Sem Nome', 
        email: u.email,
        photoURL: u.photoURL,
        lastOnline: u.lastOnline
      })));
    });

    const unsubAllSlabs = onSnapshot(collection(db, 'slabEntries'), (snapshot) => {
      const slabs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setRawSlabs(slabs);
      setLoading(false);
    });

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => {
      unsubUsers();
      unsubAllSlabs();
      clearInterval(interval);
    };
  }, []);

  const statsData = useMemo(() => {
    if (loading) return {
      usersCount: 0,
      onlineNowCount: 0,
      activeUsers: [],
      monthlyM2: 0,
      estoqueCount: 0,
      estoqueM2: 0,
      producingCount: 0,
      producingM2: 0,
      stages: {
        serrada: { count: 0, area: 0 },
        acido: { count: 0, area: 0 },
        resina: { count: 0, area: 0 },
        polimento: { count: 0, area: 0 }
      },
      activities: []
    };

    const filteredSlabs = rawSlabs.filter(s => {
      let itemDate = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toISOString().split('T')[0] : '';
      if (s.status === 'acido') itemDate = s.acidDate?.split('T')[0] || '';
      if (s.status === 'resina') itemDate = s.resinaDate?.split('T')[0] || '';
      if (s.status === 'polimento') itemDate = s.polimentoDate?.split('T')[0] || '';
      if (s.status === 'estoque') itemDate = s.finalizedDate?.split('T')[0] || '';
      
      const dateMatch = (!startDate || (itemDate && itemDate >= startDate)) && 
                        (!endDate || (itemDate && itemDate <= endDate));
      return dateMatch;
    });

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const monthlyFinalized = filteredSlabs.filter(s => {
      if (!s.finalizedDate) return false;
      const date = new Date(s.finalizedDate);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    
    const totalMonthlyM2 = monthlyFinalized.reduce((acc, curr) => acc + (curr.area || 0), 0);
    const producing = filteredSlabs.filter(s => ['serrada', 'acido', 'resina', 'polimento'].includes(s.status));
    
    const stages = {
      serrada: { count: 0, area: 0 },
      acido: { count: 0, area: 0 },
      resina: { count: 0, area: 0 },
      polimento: { count: 0, area: 0 }
    };

    filteredSlabs.forEach(s => {
      if (s.status === 'serrada' || !s.status) {
        stages.serrada.count++;
        stages.serrada.area += s.area || 0;
      } else if (s.status === 'acido') {
        stages.acido.count++;
        stages.acido.area += s.area || 0;
      } else if (s.status === 'resina') {
        stages.resina.count++;
        stages.resina.area += s.area || 0;
      } else if (s.status === 'polimento') {
        stages.polimento.count++;
        stages.polimento.area += s.area || 0;
      }
    });

    const slabsSerradasToday = rawSlabs.filter(s => {
      const createdAtDate = s.createdAt?.toDate ? s.createdAt.toDate() : (s.createdAt ? new Date(s.createdAt) : null);
      if (!createdAtDate) return false;
      const today = new Date();
      return createdAtDate.getDate() === today.getDate() && 
             createdAtDate.getMonth() === today.getMonth() && 
             createdAtDate.getFullYear() === today.getFullYear();
    }).length;

    const slabsPolidasToday = rawSlabs.filter(s => {
      if (s.status !== 'estoque' || !s.finalizedDate) return false;
      const finalizedDate = new Date(s.finalizedDate);
      const today = new Date();
      return finalizedDate.getDate() === today.getDate() && 
             finalizedDate.getMonth() === today.getMonth() && 
             finalizedDate.getFullYear() === today.getFullYear();
    }).length;

    const activities = rawSlabs
      .slice()
      .sort((a, b) => {
        const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
        const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
      })
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        type: 'slab',
        message: `Chapa ${s.slabId} (${s.parentBlockId}) - ${s.status === 'estoque' ? 'Finalizada' : (s.status || 'Serrada').charAt(0).toUpperCase() + (s.status || 'serrada').slice(1)}`,
        time: s.createdAt
      }));

    const onlineThreshold = now - 5 * 60 * 1000; // 5 minutes
    const onlineUsers = rawUsers.filter(u => {
      const lastSeen = u.lastOnline?.toDate?.()?.getTime() || 0;
      return lastSeen > onlineThreshold;
    });

    const estoqueSlabs = filteredSlabs.filter(s => s.status === 'estoque' || !s.status);

    return {
      usersCount: rawUsers.length,
      onlineNowCount: onlineUsers.length,
      activeUsers: onlineUsers,
      monthlyM2: totalMonthlyM2,
      estoqueCount: estoqueSlabs.length,
      estoqueM2: estoqueSlabs.reduce((acc, curr) => acc + (curr.area || 0), 0),
      producingCount: producing.length,
      producingM2: producing.reduce((acc, curr) => acc + (curr.area || 0), 0),
      slabsSerradasToday,
      slabsPolidasToday,
      stages,
      activities
    };
  }, [rawSlabs, rawUsers, startDate, endDate, loading]);

  const exportDashboardPDF = () => {
    const doc = new jsPDF();
    doc.text('Resumo Geral de producao', 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);
    if (startDate || endDate) {
      doc.text(`Periodo: ${startDate || 'Inicio'} ate ${endDate || 'Fim'}`, 14, 27);
    }

    const data = [
      ['Usuários Ativos', statsData.usersCount.toString()],
      ['Produção Mês Atual', `${statsData.monthlyM2.toFixed(2)}m²`],
      ['Estoque Atual', `${statsData.estoqueCount} Chapas (${statsData.estoqueM2.toFixed(2)}m²)`],
      ['Em Produção', `${statsData.producingCount} Chapas (${statsData.producingM2.toFixed(2)}m²)`],
      ['Estágio: Serrada', `${statsData.stages.serrada.count} Chapas (${statsData.stages.serrada.area.toFixed(2)}m²)`],
      ['Estágio: Ácido', `${statsData.stages.acido.count} Chapas (${statsData.stages.acido.area.toFixed(2)}m²)`],
      ['Estágio: Resina', `${statsData.stages.resina.count} Chapas (${statsData.stages.resina.area.toFixed(2)}m²)`],
      ['Estágio: Polimento', `${statsData.stages.polimento.count} Chapas (${statsData.stages.polimento.area.toFixed(2)}m²)`],
    ];

    autoTable(doc, {
      head: [['KPI', 'Valor']],
      body: data,
      startY: 35,
    });

    doc.save(`dashboard_resumo_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const stats = [
    { name: 'Usuários Online', value: statsData.onlineNowCount.toString(), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'Produção Mês Atual', value: `${statsData.monthlyM2.toFixed(2).replace('.', ',')}m²`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { name: 'Estoque Atual', value: `${statsData.estoqueCount} Chapas (${statsData.estoqueM2.toFixed(2).replace('.', ',')}m²)`, icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
    { name: 'Em Produção', value: `${statsData.producingCount} Chapas (${statsData.producingM2.toFixed(2).replace('.', ',')}m²)`, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Bem-vindo, {profile?.name ? profile.name.split(' ')[0] : 'Usuário'}!
          </h1>
          <p className="text-slate-500">Acompanhe as métricas do seu sistema em tempo real.</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="flex items-center gap-2 no-print">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm"
              />
            </div>
            <span className="text-slate-400 text-xs">até</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm"
              />
            </div>
            {(startDate || endDate) && (
              <button 
                onClick={() => {setStartDate(''); setEndDate('');}}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={exportDashboardPDF}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition shadow-sm no-print h-10"
            >
              <Printer className="w-4 h-4" />
              Gerar PDF
            </button>
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-100 transition shadow-sm no-print h-10"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.name}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300"
          >
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-none">
              {stat.name}
            </p>
            <div className="flex items-center justify-between">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
              ) : (
                <p className={`text-2xl font-black tracking-tight ${stat.name === 'Em Produção' ? 'text-rose-600' : 'text-slate-900'}`}>
                  {stat.value}
                </p>
              )}
              <div className={`p-2 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h2 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center justify-between">
            Usuários no Sistema
            <Users className="w-4 h-4 text-blue-300" />
          </h2>
          <div className="space-y-3">
            {statsData.activeUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                 <div className="relative">
                   <Users className="w-8 h-8 opacity-10" />
                   <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-slate-200 rounded-full border-2 border-white" />
                 </div>
                 <p className="text-xs text-center font-medium opacity-60">Nenhum usuário online no momento...</p>
              </div>
            ) : (
              statsData.activeUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3 p-2 group hover:bg-blue-50 rounded-lg transition-all border border-transparent hover:border-blue-100">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center border-2 border-white shadow-md ring-1 ring-slate-100 group-hover:ring-blue-200 transition-all">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-xs font-bold text-blue-600">
                          {user.name.split(' ').map((n: any) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white shadow-sm animate-pulse" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-black text-slate-800 truncate leading-tight">{user.name}</p>
                    <p className="text-[10px] text-emerald-600 font-bold tracking-tight uppercase">Online Agora</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[300px] flex flex-col">
          <h2 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center justify-between">
            Processos da Produção
            <TrendingUp className="w-4 h-4 text-slate-300" />
          </h2>
          <div className="space-y-4 flex-1 pt-2">
            {[
              { label: 'Serragem', key: 'serrada', icon: Layers, color: 'bg-blue-500', textColor: 'text-blue-500' },
              { label: 'Ácido', key: 'acido', icon: FlaskConical, color: 'bg-amber-500', textColor: 'text-amber-500' },
              { label: 'Resina', key: 'resina', icon: Beaker, color: 'bg-purple-500', textColor: 'text-purple-500' },
              { label: 'Polimento', key: 'polimento', icon: Layers, color: 'bg-emerald-500', textColor: 'text-emerald-500' },
            ].map((stage) => {
              const data = statsData.stages[stage.key as keyof typeof statsData.stages];
              const Icon = stage.icon;
              const percentage = statsData.producingCount > 0 
                ? (data.count / statsData.producingCount) * 100 
                : 0;
              
              return (
                <div key={stage.key} className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-tight">
                    <span className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                      <Icon className={`w-3 h-3 ${stage.textColor}`} />
                      {stage.label}
                    </span>
                    <span>{data.count} Chapas ({data.area.toFixed(2).replace('.', ',')}m²)</span>
                  </div>
                  <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      className={`absolute top-0 left-0 h-full ${stage.color} rounded-full`}
                    />
                  </div>
                </div>
              );
            })}
            
            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
               <div className="flex items-start gap-3">
                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Resumo da Produção</h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                      Há um total de <span className="font-bold text-slate-900">{statsData.producingCount} chapas</span> em trânsito pelos processos internos, totalizando <span className="font-bold text-slate-900">{statsData.producingM2.toFixed(2).replace('.', ',')}m²</span> de material sendo processado.
                    </p>
                  </div>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center justify-between">
            Atividade Diária
            <Clock className="w-4 h-4 text-slate-300" />
          </h2>
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
               <div className="flex items-center gap-3">
                 <div className="bg-blue-600 text-white p-2 rounded-lg">
                   <Layers className="w-4 h-4" />
                 </div>
                 <div>
                   <p className="text-xs font-bold text-blue-900 leading-none mb-1">Cortes Hoje</p>
                   <p className="text-sm text-blue-700 font-medium">{statsData.slabsSerradasToday} chapas serradas hoje</p>
                 </div>
               </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
               <div className="flex items-center gap-3">
                 <div className="bg-emerald-600 text-white p-2 rounded-lg">
                   <TrendingUp className="w-4 h-4" />
                 </div>
                 <div>
                   <p className="text-xs font-bold text-emerald-900 leading-none mb-1">Finalizadas Hoje</p>
                   <p className="text-sm text-emerald-700 font-medium">{statsData.slabsPolidasToday} chapas polidas hoje</p>
                 </div>
               </div>
            </div>
          </div>

          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Últimas Atividades</h3>
          <div className="space-y-4">
            {statsData.activities.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-2">
                 <Clock className="w-6 h-6 opacity-10" />
                 <p className="text-[10px] font-medium opacity-60">Nenhuma atividade recente encontrada...</p>
               </div>
            ) : (
              statsData.activities.map((activity) => {
                const date = activity.time?.toDate?.() || new Date(activity.time);
                const diff = Math.floor((now - date.getTime()) / 60000); // minutes
                let timeDesc = 'Agora mesmo';
                if (diff >= 1440) timeDesc = `Há ${Math.floor(diff / 1440)} dia(s)`;
                else if (diff >= 60) timeDesc = `Há ${Math.floor(diff / 60)} hora(s)`;
                else if (diff > 0) timeDesc = `Há ${diff} minuto(s)`;

                return (
                  <div key={activity.id} className="flex gap-3 items-start p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100 group">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0 group-hover:scale-150 transition-transform" />
                    <div className="overflow-hidden">
                      <p className="text-xs font-medium text-slate-800 truncate">{activity.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 tracking-tight border-l border-slate-200 pl-1.5 ml-0.5">{timeDesc}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Seção Exclusiva para Impressão */}
      <div className="print-only bg-white text-black">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-[#2980b9] mb-1">Resumo Geral de Produção</h1>
            <p className="text-[10px] text-slate-500">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
          </div>
          {(startDate || endDate) && (
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Período</p>
              <p className="text-xs text-slate-700 font-medium">{startDate || 'Início'} — {endDate || 'Fim'}</p>
            </div>
          )}
        </div>

        <table className="w-full text-left border-collapse mb-6">
          <thead>
            <tr className="bg-[#2980b9] text-white">
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">KPI</th>
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white">
              <td className="p-2 text-[10px] border border-slate-200">Usuários Ativos</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold">{statsData.usersCount}</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="p-2 text-[10px] border border-slate-200">Produção Mês Atual</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold">{statsData.monthlyM2.toFixed(2)} m²</td>
            </tr>
            <tr className="bg-white">
              <td className="p-2 text-[10px] border border-slate-200">Estoque Atual</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold">{statsData.estoqueCount} Chapas ({statsData.estoqueM2.toFixed(2)} m²)</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="p-2 text-[10px] border border-slate-200">Em Produção</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold text-[#c0392b]">{statsData.producingCount} Chapas ({statsData.producingM2.toFixed(2)} m²)</td>
            </tr>
          </tbody>
        </table>

        <h3 className="text-[10px] font-bold text-[#2980b9] uppercase mb-2">Distribuição por Estágio</h3>
        <table className="w-full text-left border-collapse mb-8">
          <thead>
            <tr className="bg-[#2980b9] text-white">
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Estágio</th>
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Qtd Chapas</th>
              <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Área Total (m²)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white">
              <td className="p-2 text-[10px] border border-slate-200 font-medium">Serrada</td>
              <td className="p-2 text-[10px] border border-slate-200">{statsData.stages.serrada.count}</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold">{statsData.stages.serrada.area.toFixed(2)} m²</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="p-2 text-[10px] border border-slate-200 font-medium">Ácido</td>
              <td className="p-2 text-[10px] border border-slate-200">{statsData.stages.acido.count}</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold">{statsData.stages.acido.area.toFixed(2)} m²</td>
            </tr>
            <tr className="bg-white">
              <td className="p-2 text-[10px] border border-slate-200 font-medium">Resina</td>
              <td className="p-2 text-[10px] border border-slate-200">{statsData.stages.resina.count}</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold">{statsData.stages.resina.area.toFixed(2)} m²</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="p-2 text-[10px] border border-slate-200 font-medium">Polimento</td>
              <td className="p-2 text-[10px] border border-slate-200">{statsData.stages.polimento.count}</td>
              <td className="p-2 text-[10px] border border-slate-200 font-bold">{statsData.stages.polimento.area.toFixed(2)} m²</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-8 text-[8px] text-slate-400 text-center uppercase tracking-widest">
          mc marmo control - relatório de sistema
        </div>
      </div>
    </div>
  );
}
