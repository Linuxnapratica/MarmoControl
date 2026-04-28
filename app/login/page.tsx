'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { logEvent } from '@/lib/audit';
import { 
  LayoutDashboard, 
  LogIn, 
  ShieldCheck, 
  Mail, 
  Lock, 
  Eye,
  EyeOff,
  User as UserIcon,
  ArrowRight,
  Loader2,
  AlertCircle,
  Phone
} from 'lucide-react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') return;
      
      // Log failed login
      await logEvent({
        event: `Falha ao entrar com Google: ${email || 'Desconhecido'}`,
        details: `Erro: ${error.message}`,
        type: 'login_failure'
      });

      setErrorMsg('Falha ao entrar com Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name, phone);
      }
      router.push('/dashboard');
    } catch (error: any) {
      // Log failed login
      await logEvent({
        event: `Falha ao realizar ${mode === 'login' ? 'login' : 'cadastro'} por e-mail: ${email}`,
        details: `Erro: ${error.message} (Code: ${error.code})`,
        type: 'login_failure'
      });

      // Gracefully handle common errors in the UI instead of throwing/alerting
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        if (mode === 'login') {
          setErrorMsg('E-mail ou senha incorretos. Verifique seus dados e tente novamente.');
        } else {
          setErrorMsg('Erro nas credenciais. Verifique o e-mail ou tente outro.');
        }
      } else if (error.code === 'auth/operation-not-allowed') {
        setErrorMsg('Erro técnico: Login por e-mail desativado no Firebase.');
      } else if (error.code === 'auth/wrong-password') {
        setErrorMsg('Senha incorreta.');
      } else if (error.code === 'auth/email-already-in-use') {
        setErrorMsg('Este e-mail já possui uma conta ativa. Se você já foi cadastrado antes, tente fazer login em vez de criar uma nova conta.');
      } else if (error.code === 'auth/weak-password') {
        setErrorMsg('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setErrorMsg(error.message || 'Erro inesperado. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 md:p-8 font-sans">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Left Side - Info */}
        <div className="hidden lg:flex flex-col justify-between p-12 bg-blue-600 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center mb-6">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <h2 className="text-4xl font-bold tracking-tight mb-4">MarmoControl</h2>
            <p className="text-blue-100 text-lg max-w-sm">
              Gestão inteligente para marmorarias. Controle sua produção, estoque e equipe em um só lugar.
            </p>
          </div>

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4 text-blue-100">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <p className="font-bold text-sm">Segurança de Dados</p>
                <p className="text-xs opacity-75">Criptografia de ponta a ponta em todas as operações.</p>
              </div>
            </div>
          </div>

          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-20 w-60 h-60 bg-blue-500 rounded-full blur-3xl opacity-50" />
        </div>

        {/* Right Side - Form */}
        <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
          <div className="max-w-sm mx-auto w-full">
            <div className="mb-8 text-center lg:text-left">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
              </h3>
              <p className="text-slate-500 text-sm">
                {mode === 'login' 
                  ? 'Acesse sua conta para gerenciar sua marmoraria.' 
                  : 'Preencha os dados abaixo para começar.'}
              </p>
            </div>

            <div className="space-y-6">
              {errorMsg && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-xs font-medium flex gap-3 items-center"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </motion.div>
              )}

              {/* Google Button */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all font-bold text-slate-700 text-sm disabled:opacity-50"
              >
                <Image 
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                  alt="Google" 
                  width={18} 
                  height={18}
                  className="w-4.5 h-4.5" 
                  referrerPolicy="no-referrer"
                />
                Entrar com Google
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                  <span className="bg-white px-3 text-slate-400 font-sans">ou use seu e-mail</span>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <AnimatePresence mode="wait">
                  {mode === 'signup' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Nome Completo</label>
                        <div className="relative">
                          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Seu nome"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Telefone / WhatsApp</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="tel"
                            required={mode === 'signup'}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="(00) 00000-0000"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Endereço de E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sua Senha</label>
                    {mode === 'login' && (
                      <button type="button" className="text-[10px] font-bold text-blue-600 uppercase hover:underline">Esqueceu?</button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {mode === 'login' ? 'Entrar no Sistema' : 'Criar minha Conta'}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
                
                {mode === 'login' && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-3">
                    <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-700 leading-tight">
                      <span className="font-bold uppercase block mb-0.5">Aviso para Convidados</span>
                      Se o administrador já cadastrou seu e-mail, você ainda precisa criar uma senha. Clique em <strong>&quot;Cadastre-se aqui&quot;</strong> abaixo antes do primeiro acesso.
                    </p>
                  </div>
                )}
              </form>

              <div className="text-center pt-4">
                <p className="text-slate-500 text-xs">
                  {mode === 'login' ? 'Não tem uma conta?' : 'Já possui uma conta?'}
                  <button
                    onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                    className="ml-2 text-blue-600 font-bold hover:underline"
                  >
                    {mode === 'login' ? 'Cadastre-se aqui' : 'Faça login'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
