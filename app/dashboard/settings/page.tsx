'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';
import { db, storage } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  Save, 
  Layout, 
  Image as ImageIcon, 
  Type, 
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  Link as LinkIcon
} from 'lucide-react';
import { logEvent } from '@/lib/audit';

export default function SettingsPage() {
  const { isAdmin, user, profile } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState<{ [key: string]: boolean }>({});
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    appName: settings?.appName || '',
    logoUrl: settings?.logoUrl || '',
    logoSize: settings?.logoSize || 32,
    loginLogoUrl: settings?.loginLogoUrl || '',
    loginLogoSize: settings?.loginLogoSize || 48,
    loginWelcomeTitle: settings?.loginWelcomeTitle || '',
    loginWelcomeSubtitle: settings?.loginWelcomeSubtitle || '',
  });

  // Since settings can load later, we update formData if it's still at defaults
  const [hasDefaulted, setHasDefaulted] = useState(false);
  if (settings && !settingsLoading && !hasDefaulted && formData.appName === '') {
    setFormData({
      appName: settings.appName || '',
      logoUrl: settings.logoUrl || '',
      logoSize: settings.logoSize || 32,
      loginLogoUrl: settings.loginLogoUrl || '',
      loginLogoSize: settings.loginLogoSize || 48,
      loginWelcomeTitle: settings.loginWelcomeTitle || '',
      loginWelcomeSubtitle: settings.loginWelcomeSubtitle || '',
    });
    setHasDefaulted(true);
  }

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'loginLogoUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione uma imagem válida.');
      return;
    }

    setIsUploading(prev => ({ ...prev, [field]: true }));
    setError(null);

    try {
      const storageRef = ref(storage, `branding/${field}_${Date.now()}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      setFormData(prev => ({ ...prev, [field]: downloadURL }));
      
      await logEvent({
        event: `Imagem de branding (${field}) enviada`,
        details: `Arquivo: ${file.name}`,
        type: 'upload'
      });
    } catch (err: any) {
      console.error(err);
      setError('Erro ao enviar imagem. Verifique as permissões de armazenamento.');
    } finally {
      setIsUploading(prev => ({ ...prev, [field]: false }));
    }
  };

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                  <span>Logomarca (Sidebar)</span>
                  <span className="text-[8px] text-blue-500 italic lowercase tracking-normal">Recomendado square ou 2:1</span>
                </label>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="url"
                      value={formData.logoUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, logoUrl: e.target.value }))}
                      placeholder="URL da imagem..."
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-xs font-medium"
                    />
                  </div>
                  
                  <label className="cursor-pointer group">
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'logoUrl')}
                      disabled={isUploading['logoUrl']}
                    />
                    <div className="h-full px-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all">
                      {isUploading['logoUrl'] ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {formData.logoUrl && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-200 border border-slate-200 shrink-0">
                    <img src={formData.logoUrl} alt="Preview" className="w-full h-full object-contain" />
                  </div>
                  <div className="overflow-hidden flex-1">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Preview Atual</p>
                    <p className="text-[10px] text-slate-600 truncate max-w-xs">{formData.logoUrl}</p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tamanho da Logo (Sidebar)</label>
                  <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{formData.logoSize}px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="64"
                  step="2"
                  value={formData.logoSize}
                  onChange={(e) => setFormData(prev => ({ ...prev, logoSize: parseInt(e.target.value) }))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Logomarca (Login)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="url"
                      value={formData.loginLogoUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, loginLogoUrl: e.target.value }))}
                      placeholder="URL da imagem..."
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-xs font-medium"
                    />
                  </div>
                  
                  <label className="cursor-pointer group">
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'loginLogoUrl')}
                      disabled={isUploading['loginLogoUrl']}
                    />
                    <div className="h-full px-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all">
                      {isUploading['loginLogoUrl'] ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </div>
                  </label>
                </div>

                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tamanho da Logo (Login)</label>
                    <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{formData.loginLogoSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="24"
                    max="128"
                    step="4"
                    value={formData.loginLogoSize}
                    onChange={(e) => setFormData(prev => ({ ...prev, loginLogoSize: parseInt(e.target.value) }))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subtítulo / Descrição</label>
              <textarea
                rows={3}
                value={formData.loginWelcomeSubtitle}
                onChange={(e) => setFormData(prev => ({ ...prev, loginWelcomeSubtitle: e.target.value }))}
                placeholder="Descreva seu sistema na tela de login..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium resize-none shadow-sm"
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
              <div 
                className="bg-blue-600 rounded-lg flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                style={{ width: formData.logoSize, height: formData.logoSize }}
              >
                {formData.logoUrl ? <img src={formData.logoUrl} alt="Logo Sidebar" className="w-full h-full object-cover" /> : formData.appName.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-white font-bold text-sm">{formData.appName || 'MarmoControl'}</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Login</p>
            <div className="bg-blue-600 p-6 rounded-xl flex flex-col gap-2 min-w-[200px] text-white">
              <div 
                className="bg-white/20 rounded-lg flex items-center justify-center overflow-hidden"
                style={{ width: formData.loginLogoSize, height: formData.loginLogoSize }}
              >
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
