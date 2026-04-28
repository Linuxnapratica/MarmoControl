'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  Save, 
  Layout, 
  Image as ImageIcon, 
  Type, 
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { logEvent } from '@/lib/audit';

export default function SettingsPage() {
  const { isAdmin, user, profile } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    appName: '',
    logoUrl: '',
    loginLogoUrl: '',
    loginWelcomeTitle: '',
    loginWelcomeSubtitle: '',
  });

  useEffect(() => {
    if (settings) {
      const newFormData = {
        appName: settings.appName || '',
        logoUrl: settings.logoUrl || '',
        loginLogoUrl: settings.loginLogoUrl || '',
        loginWelcomeTitle: settings.loginWelcomeTitle || '',
        loginWelcomeSubtitle: settings.loginWelcomeSubtitle || '',
      };
      
      // Only update if data actually changed to avoid cascading renders
      if (JSON.stringify(newFormData) !== JSON.stringify(formData)) {
        setFormData(newFormData);
      }
    }
  }, [settings, formData]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="p-4 bg-red-50 text-red-500 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Acesso Negado</h1>
          <p className="text-slate-500">Apenas administradores podem acessar as configurações do sistema.</p>
        </div>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setSuccess(false);
    setError(null);

    try {
      await setDoc(doc(db, 'settings', 'global'), {
        ...formData,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: profile?.name || 'Admin'
      }, { merge: true });

      await logEvent({
        event: 'Configurações do sistema atualizadas',
        details: `AppName: ${formData.appName}`,
        type: 'update'
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError('Falha ao salvar configurações. Verifique as permissões.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">Configurações do Sistema</h1>
            <p className="text-sm text-slate-500 font-medium">Personalize a identidade visual e os dizeres do sistema.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Branding Section */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <Globe className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight italic uppercase">Identidade Geral</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome do Sistema</label>
              <div className="relative">
                <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={formData.appName}
                  onChange={(e) => setFormData(prev => ({ ...prev, appName: e.target.value }))}
                  placeholder="Ex: MarmoControl"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">URL da Logomarca (Sidebar)</label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="url"
                  value={formData.logoUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="https://exemplo.com/logo.png"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                />
              </div>
              <p className="text-[10px] text-slate-400 ml-1">Logo que aparece no topo do menu lateral (2:1 ou square recomendado).</p>
            </div>
          </div>
        </section>

        {/* Login Screen Section */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <Layout className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight italic uppercase">Tela de Login</h2>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Título de Boas-vindas</label>
                <input
                  type="text"
                  value={formData.loginWelcomeTitle}
                  onChange={(e) => setFormData(prev => ({ ...prev, loginWelcomeTitle: e.target.value }))}
                  placeholder="Ex: Entre na sua conta"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Logomarca (Tela Login)</label>
                <input
                  type="url"
                  value={formData.loginLogoUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, loginLogoUrl: e.target.value }))}
                  placeholder="https://exemplo.com/login-logo.png"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subtítulo / Descrição</label>
              <textarea
                rows={3}
                value={formData.loginWelcomeSubtitle}
                onChange={(e) => setFormData(prev => ({ ...prev, loginWelcomeSubtitle: e.target.value }))}
                placeholder="Descreva seu sistema na tela de login..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium resize-none"
              />
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4">
          <div className="flex items-center gap-4">
            {success && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-green-600 font-bold text-sm bg-green-50 px-4 py-2 rounded-xl border border-green-100"
              >
                <CheckCircle2 className="w-4 h-4" />
                Configurações salvas!
              </motion.div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm bg-red-50 px-4 py-2 rounded-xl border border-red-100">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </form>

      {/* Preview Section */}
      <div className="mt-12 bg-slate-100/50 border border-dashed border-slate-300 rounded-[3rem] p-8">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 text-center">Visualização da Marca</h3>
        <div className="flex items-center justify-center gap-12">
          <div className="flex flex-col items-center gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Sidebar</p>
            <div className="bg-slate-900 p-4 rounded-xl flex items-center gap-3 min-w-[180px]">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-[10px] font-bold text-white overflow-hidden">
                {formData.logoUrl ? <img src={formData.logoUrl} alt="Logo Sidebar" className="w-full h-full object-cover" /> : formData.appName.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-white font-bold text-sm">{formData.appName || 'MarmoControl'}</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Login</p>
            <div className="bg-blue-600 p-6 rounded-xl flex flex-col gap-2 min-w-[200px] text-white">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center overflow-hidden">
                 {(formData.loginLogoUrl || formData.logoUrl) ? <img src={formData.loginLogoUrl || formData.logoUrl} alt="Logo Login" className="w-full h-full object-cover" /> : <Layout className="w-4 h-4" />}
              </div>
              <span className="font-bold text-lg">{formData.appName || 'MarmoControl'}</span>
              <span className="text-[8px] opacity-60 leading-tight line-clamp-2">{formData.loginWelcomeSubtitle || 'Sistema de gestão inteligente...'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
