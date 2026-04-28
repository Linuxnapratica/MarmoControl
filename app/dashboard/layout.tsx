'use client';

import React, { Suspense } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  Users, 
  LogOut, 
  ChevronRight,
  Menu,
  X as XIcon,
  HardHat,
  User,
  ShieldAlert,
  Clock,
  ShieldCheck,
  ShoppingCart
} from 'lucide-react';
import { logout } from '@/lib/firebase';
import Link from 'next/link';
import Image from 'next/image';

function SidebarNav({ isSidebarOpen, expandedMenus, toggleMenu, profile, isAdmin, hasPermission }: any) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const menuItems: any[] = [
    { name: 'Painel', icon: LayoutDashboard, path: '/dashboard', permission: 'dashboard' },
    { 
      name: 'Produção', 
      icon: HardHat, 
      path: '/dashboard/producao', 
      permissionCheck: (hp: any) => hp('producao') || hp('entrada') || hp('serragem') || hp('acido') || hp('resina') || hp('polimento') || hp('estoque') || hp('quebrada')
    },
    { name: 'Saídas', icon: ShoppingCart, path: '/dashboard/saidas', permission: 'saidas' },
    { name: 'Usuário', icon: Users, path: '/dashboard/users', adminOnly: true },
    { name: 'Logs de Auditoria', icon: ShieldAlert, path: '/dashboard/audit-logs', adminOnly: true },
    { name: 'Perfil', icon: User, path: '/dashboard/perfil' },
  ];

  return (
    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
      {menuItems.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
        
        let allowed = true;
        if (!isAdmin) {
          if (item.permissionCheck) {
            allowed = item.permissionCheck(hasPermission);
          } else if (item.permission) {
            allowed = hasPermission(item.permission);
          }
        }
        
        if (!allowed) return null;
        const isActive = pathname === item.path;
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedMenus[item.name];
        const Icon = item.icon;
        
        return (
          <div key={item.name} className="space-y-1">
            {hasChildren ? (
              <button
                onClick={() => toggleMenu(item.name)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                  isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {isSidebarOpen && (
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ml-auto ${isExpanded ? 'rotate-90' : ''}`} />
                )}
              </button>
            ) : (
              <Link
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                  isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {isSidebarOpen && <span className="font-medium truncate">{item.name}</span>}
              </Link>
            )}

            {hasChildren && isExpanded && isSidebarOpen && (
              <div className="ml-7 space-y-1 mt-1 border-l border-slate-700 pl-3">
                {item.children!.map((child: any) => (
                  <Link
                    key={child.path}
                    href={child.path}
                    className={`block text-xs py-1.5 transition-colors ${
                      pathname === child.path.split('?')[0] && searchParams.get('tab') === child.path.split('tab=')[1]
                        ? 'text-white font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, isAdmin, isAuthorized, hasPermission, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [expandedMenus, setExpandedMenus] = React.useState<Record<string, boolean>>({ 'Produção': true });

  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }

    // Presence system
    if (user) {
      const updatePresence = async () => {
        try {
          const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          await updateDoc(doc(db, 'users', user.uid), {
            lastOnline: serverTimestamp()
          });
        } catch (error) {
          console.error('Error updating presence:', error);
        }
      };

      updatePresence();
      const interval = setInterval(updatePresence, 60000); // every minute
      return () => clearInterval(interval);
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600">
        <span className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Pending Authorization Screen
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 border border-slate-200 text-center space-y-6"
        >
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
            <Clock className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Acesso Pendente</h1>
            <p className="text-slate-500 text-sm">
              Olá, <span className="font-bold text-slate-900">{profile?.name}</span>. Seu cadastro foi recebido com sucesso.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3 text-left">
            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-bold block mb-1">Aguarde, seu cadastro está sendo avaliado.</span>
              Um administrador revisará sua solicitação e liberará os módulos do sistema em breve. Você receberá acesso assim que a avaliação for concluída.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 px-6 py-3 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all mx-auto font-bold text-xs uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              Sair da Conta
            </button>
          </div>
          
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">
            MARMOCONTROL - SISTEMA DE GESTÃO
          </p>
        </motion.div>
      </div>
    );
  }

  const toggleMenu = (name: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      {/* Sidebar - High Density styling */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-900 text-white flex flex-col shrink-0 transition-all duration-300 fixed inset-y-0 z-20 no-print`}
      >
        <div className="p-6 border-b border-slate-800 shrink-0">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-xs shrink-0">
              MC
            </div>
            {isSidebarOpen && <span>MarmoControl</span>}
          </h1>
        </div>

        <Suspense fallback={<div className="flex-1" />}>
          <SidebarNav 
            isSidebarOpen={isSidebarOpen} 
            expandedMenus={expandedMenus} 
            toggleMenu={toggleMenu}
            profile={profile}
            isAdmin={isAdmin}
            hasPermission={hasPermission}
          />
        </Suspense>

        <div className="p-4 border-t border-slate-800">
          <Link href="/dashboard/perfil" className="flex items-center gap-3 px-3 py-2 mb-4 hover:bg-slate-800 rounded-xl transition-colors">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden border border-slate-600">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                profile?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'MC'
              )}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-xs font-medium truncate text-white">{profile?.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{profile?.email}</p>
              </div>
            )}
          </Link>
          
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs text-slate-400 hover:text-red-400 transition-colors rounded-md"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {isSidebarOpen && <span className="font-medium">Sair do Sistema</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col bg-slate-50 h-full overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'pl-64' : 'pl-20'}`}>
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 sticky top-0 z-10 no-print">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              {isSidebarOpen ? <XIcon className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <h2 className="text-lg font-semibold text-slate-900 capitalize">
              {/* Removed redundant route name as it's visible on page titles */}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {profile?.role === 'admin' ? 'Administrador' : 'Membro'}
            </div>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-auto">
          <div className="max-w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
