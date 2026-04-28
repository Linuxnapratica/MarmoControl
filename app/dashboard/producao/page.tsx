'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { db, storage } from '@/lib/firebase';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { collection, onSnapshot, addDoc, query, orderBy, limit, serverTimestamp, deleteDoc, doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Box, 
  Calendar, 
  User, 
  Layers, 
  Maximize, 
  Plus, 
  History,
  AlertCircle,
  Loader2,
  Trash2,
  Table as TableIcon,
  Pencil,
  PlusCircle,
  X,
  Settings,
  Check,
  Search,
  Eye,
  ImageIcon,
  Clock,
  ExternalLink,
  Upload,
  CheckCircle2,
  SquareStack,
  LayoutGrid,
  FlaskConical,
  Beaker,
  ArrowRightCircle,
  History as HistoryIcon,
  Printer,
  Camera
} from 'lucide-react';

interface BlockEntry {
  id: string;
  blockId: string;
  type: string;
  length: number;
  height: number;
  width: number;
  volume: number;
  entryDate: string;
  userId: string;
  userName: string;
  createdAt: any;
  status: 'ativo' | 'baixado'; // New: status field
}

interface SlabEntry {
  id: string;
  parentBlockId: string;
  materialType?: string; // New: Material type denormalized
  slabId: string;
  length: number;
  height: number;
  area: number;
  userId: string;
  userName: string;
  createdAt: any;
  photoUrl?: string; // Optinal photo URL
  status?: 'serrada' | 'acido' | 'resina' | 'polimento' | 'estoque' | 'cancelada' | 'quebrada';
  acidDate?: string;
  acidUserId?: string;
  acidUserName?: string;
  resinaDate?: string;
  resinaUserId?: string;
  resinaUserName?: string;
  polimentoDate?: string;
  polimentoUserId?: string;
  polimentoUserName?: string;
  finalizedDate?: string;
  finalizedUserId?: string;
  finalizedUserName?: string;
}

function ProducaoContent() {
  const { user, profile, hasPermission, isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const getSlabMaterial = (slab: SlabEntry) => {
    if (slab.materialType) return slab.materialType;
    const block = entries.find(e => e.blockId === slab.parentBlockId);
    return block?.type || 'N/A';
  };

  // Detailed tab permissions
  const availableTabs = [
    { id: 'entrada', label: 'ENTRADA', icon: Box, permission: 'entrada', color: 'text-cyan-500' },
    { id: 'serragem', label: 'SERRAGEM', icon: SquareStack, permission: 'serragem', color: 'text-blue-500' },
    { id: 'acido', label: 'ÁCIDO', icon: FlaskConical, permission: 'acido', color: 'text-amber-500' },
    { id: 'resina', label: 'RESINA', icon: Beaker, permission: 'resina', color: 'text-purple-500' },
    { id: 'polimento', label: 'POLIMENTO', icon: Layers, permission: 'polimento', color: 'text-emerald-500' },
    { id: 'estoque', label: 'ESTOQUE', icon: CheckCircle2, permission: 'estoque', color: 'text-green-600' },
    { id: 'quebrada', label: 'QUEBRADAS', icon: AlertCircle, permission: 'quebrada', color: 'text-rose-500' },
  ] as const;

  const userAvailableTabs = availableTabs.filter(tab => isAdmin || hasPermission('producao') || hasPermission(tab.permission));

  // Tabs state - URL as source of truth
  const tabParam = searchParams.get('tab');
  let activeTabCandidate = (tabParam && (['entrada', 'serragem', 'acido', 'resina', 'polimento', 'estoque', 'quebrada'] as const).includes(tabParam as any))
    ? tabParam as 'entrada' | 'serragem' | 'acido' | 'resina' | 'polimento' | 'estoque' | 'quebrada'
    : userAvailableTabs[0]?.id || 'entrada';

  // Ensure active tab is allowed
  if (!isAdmin && !hasPermission('producao') && !hasPermission(activeTabCandidate)) {
    activeTabCandidate = userAvailableTabs[0]?.id as any || 'entrada';
  }
  
  const activeTab = activeTabCandidate;

  const setActiveTab = (tab: 'entrada' | 'serragem' | 'acido' | 'resina' | 'polimento' | 'estoque' | 'quebrada') => {
    setSelectedSlabs([]);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  // State for block entry form
  const [blockId, setBlockId] = useState('');
  const [type, setType] = useState('');
  const [length, setLength] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [width, setWidth] = useState<number | ''>('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  
  // State for sawing form
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [numSlabs, setNumSlabs] = useState<number | ''>('');
  const [slabLength, setSlabLength] = useState<number | ''>('');
  const [slabHeight, setSlabHeight] = useState<number | ''>('');
  const [slabPhotoUrl, setSlabPhotoUrl] = useState(''); // New: photo URL for form
  const [sawingType, setSawingType] = useState<'parcial' | 'completa'>('parcial'); // New: partial or complete
  
  // State for list and loading
  const [entries, setEntries] = useState<BlockEntry[]>([]);
  const [slabs, setSlabs] = useState<SlabEntry[]>([]);
  const [materialTypes, setMaterialTypes] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlabs, setLoadingSlabs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // New: uploading state
  const [uploadProgress, setUploadProgress] = useState(0); // New: upload progress state

  // New: Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Material type management
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [isManagingMaterials, setIsManagingMaterials] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<{id: string, name: string} | null>(null);
  const [updatedMaterialName, setUpdatedMaterialName] = useState('');

  // Editing state
  const [editingEntry, setEditingEntry] = useState<BlockEntry | null>(null);
  const [editingSlab, setEditingSlab] = useState<SlabEntry | null>(null); // New: editing slab
  const [previewImage, setPreviewImage] = useState<string | null>(null); // New: image preview
  const [selectedSlabs, setSelectedSlabs] = useState<string[]>([]); // New: Bulk selection
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<string | null>(null);
  const [isDeleteSlabDialogOpen, setIsDeleteSlabDialogOpen] = useState<string | null>(null); // New: delete slab
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false); // New: bulk delete
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetIds, setUploadTargetIds] = useState<string[]>([]);
  const [isBatchUpload, setIsBatchUpload] = useState(false);

  // Auto-calculate volume for form
  const volume = (typeof length === 'number' && typeof height === 'number' && typeof width === 'number') 
    ? (length * height * width).toFixed(3).replace('.', ',') 
    : '0,000';

  useEffect(() => {
    // Check permission
    const hasAnyProductionPermission = isAdmin || hasPermission('producao') || 
      ['entrada', 'serragem', 'acido', 'resina', 'polimento', 'estoque', 'quebrada'].some(p => hasPermission(p));

    if (!user || !hasAnyProductionPermission) return;

    // Fetch block entries
    const qEntries = query(
      collection(db, 'blockEntries'), 
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribeEntries = onSnapshot(qEntries, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlockEntry[];
      setEntries(data);
      setLoading(false);
    });

    // Fetch material types
    const qMaterials = query(collection(db, 'materialTypes'), orderBy('name', 'asc'));
    const unsubscribeMaterials = onSnapshot(qMaterials, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      setMaterialTypes(data);
    });

    // Fetch slabs
    const qSlabs = query(
      collection(db, 'slabEntries'), 
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribeSlabs = onSnapshot(qSlabs, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SlabEntry[];
      setSlabs(data);
      setLoadingSlabs(false);
    });

    return () => {
      unsubscribeEntries();
      unsubscribeMaterials();
      unsubscribeSlabs();
    };
  }, [user, profile, hasPermission, isAdmin]);

  const handleAddMaterial = async () => {
    if (!newMaterialName.trim()) return;
    try {
      await addDoc(collection(db, 'materialTypes'), {
        name: newMaterialName.trim()
      });
      setNewMaterialName('');
      setIsAddingMaterial(false);
    } catch (error) {
      console.error('Error adding material type:', error);
      alert('Erro ao adicionar tipo de material.');
    }
  };

  const handleUpdateMaterial = async (id: string) => {
    if (!updatedMaterialName.trim()) return;
    try {
      await updateDoc(doc(db, 'materialTypes', id), {
        name: updatedMaterialName.trim()
      });
      setEditingMaterial(null);
      setUpdatedMaterialName('');
    } catch (error) {
      console.error('Error updating material type:', error);
      alert('Erro ao atualizar material.');
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este tipo de material?')) return;
    try {
      await deleteDoc(doc(db, 'materialTypes', id));
    } catch (error) {
      console.error('Error deleting material type:', error);
      alert('Erro ao excluir material.');
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    
    // Use a simpler path to avoid potential encoding issues
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const storageRef = ref(storage, `slabs/${user.uid}/${fileName}`);
    
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadProgress(progress);
        console.log('Upload is ' + progress + '% done');
      }, 
      (error) => {
        console.error('Full Error Object:', error);
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);
        
        setIsUploading(false);
        setUploadProgress(0);
        if (e.target) e.target.value = '';
        
        if (error.code === 'storage/retry-limit-exceeded') {
          alert('Erro de conexão persistente (Retry Limit Exceeded). Isso geralmente acontece por bloqueio de rede ou se o serviço de Storage não foi ativado no Console do Firebase. Verifique se o bucket existe.');
        } else if (error.code === 'storage/unauthorized') {
          alert('Erro de permissão: Suas regras de segurança do Storage podem estar bloqueando o acesso.');
        } else {
          alert(`Erro ao enviar a foto: ${error.message}`);
        }
      }, 
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          
          if (uploadTargetIds.length > 0) {
            const batch = writeBatch(db);
            uploadTargetIds.forEach(id => {
              if (!id) return;
              batch.update(doc(db, 'slabEntries', id), { photoUrl: url });
            });
            await batch.commit();
            alert(`${uploadTargetIds.length} chapa(s) atualizada(s) com a foto com sucesso!`);
            setUploadTargetIds([]);
          } else if (isEdit && editingSlab) {
            setEditingSlab({ ...editingSlab, photoUrl: url });
          } else {
            setSlabPhotoUrl(url);
          }
        } catch (err) {
          console.error('Error after upload:', err);
          alert('Erro ao processar a foto após o envio.');
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
          if (e.target) e.target.value = '';
        }
      }
    );
  };

  const triggerPhotoUpload = (ids: string[]) => {
    setUploadTargetIds(ids);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear to allow same file re-selection
      fileInputRef.current.click();
    }
  };

  const handleSawingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!hasPermission('producao') && !hasPermission('serragem') && !isAdmin)) return;

    if (!selectedBlockId || !numSlabs || !slabLength || !slabHeight) {
      alert('Preencha todos os campos da serragem.');
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const totalSlabsToCreate = Number(numSlabs);
      const area = Number((Number(slabLength) * Number(slabHeight)).toFixed(3));
      
      const blockEntry = entries.find(e => e.blockId === selectedBlockId);
      const materialType = blockEntry?.type || 'N/A';

      // Determine the next batch letter for this block
      const existingSlabsForBlock = slabs.filter(s => s.parentBlockId === selectedBlockId);
      const usedLetters = Array.from(new Set(
        existingSlabsForBlock.map(s => {
          // Extract the letter after the index/total pattern (e.g., 1/5A -> A, 1/10B -> B)
          const match = s.slabId.match(/\/(\d+)([A-Z]+)$/);
          return match ? match[2] : '';
        }).filter(l => l !== '')
      )).sort();

      let batchLetter = 'A';
      if (usedLetters.length > 0) {
        const lastLetter = usedLetters[usedLetters.length - 1];
        const charCode = lastLetter.charCodeAt(lastLetter.length - 1);
        if (charCode < 90) { // Z
          batchLetter = lastLetter.substring(0, lastLetter.length - 1) + String.fromCharCode(charCode + 1);
        } else {
          // Reset to AA, AB etc if Z is reached (standard Excel-like or simple increment)
          batchLetter = String.fromCharCode(65) + String.fromCharCode(65); 
        }
      }
      
      for (let i = 0; i < totalSlabsToCreate; i++) {
        const currentIdx = i + 1;
        // Simplified naming convention: [Idx]/[Total][Letter]
        const slabId = `${currentIdx}/${totalSlabsToCreate}${batchLetter}`;
        const newSlabRef = doc(collection(db, 'slabEntries'));
        
        batch.set(newSlabRef, {
          parentBlockId: selectedBlockId,
          materialType,
          slabId,
          length: Number(slabLength),
          height: Number(slabHeight),
          area,
          photoUrl: slabPhotoUrl || null, // Include photo URL
          status: 'serrada', // New: status for process tracking
          userId: user.uid,
          userName: profile?.name || user.email || 'Usuário',
          createdAt: serverTimestamp()
        });
      }

      // If sawing is complete, retire the block
      if (sawingType === 'completa') {
        // We need the doc ID of the block entry
        const blockDoc = entries.find(e => e.blockId === selectedBlockId);
        if (blockDoc) {
          const blockRef = doc(db, 'blockEntries', blockDoc.id);
          batch.update(blockRef, { status: 'baixado' });
        }
      }

      await batch.commit();
      
      // Clear sawing form
      setNumSlabs('');
      setSlabPhotoUrl('');
      setSawingType('parcial');
      alert(`${totalSlabsToCreate} chapas registradas com sucesso!`);
    } catch (error) {
      console.error('Error batch saving slabs:', error);
      alert('Erro ao registrar serragem.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle moving to acid
  const handleMoveToAcid = async (slabId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'slabEntries', slabId), {
        status: 'acido',
        acidDate: new Date().toISOString(),
        acidUserId: user.uid,
        acidUserName: profile?.name || user.email || 'Usuário'
      });
      alert('Chapa enviada para aplicação de ácido!');
    } catch (error) {
      console.error('Error moving to acid:', error);
      alert('Erro ao enviar para ácido.');
    }
  };

  // Unified bulk status update
  const handleBulkStatusUpdate = async (targetStatus: 'acido' | 'resina' | 'polimento' | 'estoque' | 'serrada' | 'quebrada', idsOverride?: string[]) => {
    const idsToUpdate = idsOverride || selectedSlabs;
    console.log('Bulk Status Update Triggered:', { targetStatus, idsToUpdate, user: user?.uid });
    
    const hasAnyProductionPermission = isAdmin || hasPermission('producao') || 
      ['entrada', 'serragem', 'acido', 'resina', 'polimento', 'estoque', 'quebrada'].some(p => hasPermission(p));

    if (idsToUpdate.length === 0 || !user || !hasAnyProductionPermission) {
      if (!user || !hasAnyProductionPermission) {
        alert('Você não tem permissão para realizar esta operação.');
      }
      console.warn('Blocked move: No IDs, no user or no permission.');
      return;
    }
    
    const statusLabels: Record<string, string> = {
      acido: 'Ácido',
      resina: 'Resina',
      polimento: 'Polimento',
      estoque: 'Estoque Final',
      serrada: 'Disponível (Serragem)'
    };

    // Remove confirm as it might be blocked in some environments or confusing
    // if (!idsOverride && !confirm(`Deseja mover ${idsToUpdate.length} chapa(s) para o processo de ${statusLabels[targetStatus]}?`)) return;

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();
      const userId = user.uid;
      const userName = profile?.name || user.email || 'Usuário';

      console.log(`Executing batch update for ${idsToUpdate.length} slabs to ${targetStatus}`);

      idsToUpdate.forEach(id => {
        if (!id) return;
        const slabRef = doc(db, 'slabEntries', id);
        const updateData: any = { 
          status: targetStatus,
          lastUpdated: timestamp // Global tracking
        };
        
        if (targetStatus === 'acido') {
          updateData.acidDate = timestamp;
          updateData.acidUserId = userId;
          updateData.acidUserName = userName;
        } else if (targetStatus === 'resina') {
          updateData.resinaDate = timestamp;
          updateData.resinaUserId = userId;
          updateData.resinaUserName = userName;
        } else if (targetStatus === 'polimento') {
          updateData.polimentoDate = timestamp;
          updateData.polimentoUserId = userId;
          updateData.polimentoUserName = userName;
        } else if (targetStatus === 'estoque') {
          updateData.finalizedDate = timestamp;
          updateData.finalizedUserId = userId;
          updateData.finalizedUserName = userName;
        } else if (targetStatus === 'serrada') {
          updateData.acidDate = null;
          updateData.resinaDate = null;
          updateData.polimentoDate = null;
          updateData.finalizedDate = null;
        } else if (targetStatus === 'quebrada') {
          updateData.brokenDate = timestamp;
          updateData.brokenUserId = userId;
          updateData.brokenUserName = userName;
        }

        batch.update(slabRef, updateData);
      });

      await batch.commit();
      console.log('Batch commit successful');
      
      if (!idsOverride) setSelectedSlabs([]);
      // Use localized success notification if needed, but alert is usually fine for confirmation
      alert(`${idsToUpdate.length} chapa(s) movida(s) para ${statusLabels[targetStatus]} com sucesso!`);
    } catch (error) {
      console.error(`Error moving slabs to ${targetStatus}:`, error);
      alert(`Erro ao mover chapa(s) para ${targetStatus}.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSlabs.length === 0 || !user) return;

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      selectedSlabs.forEach(id => {
        batch.delete(doc(db, 'slabEntries', id));
      });
      await batch.commit();
      
      setSelectedSlabs([]);
      setIsBulkDeleteOpen(false);
      alert('Chapas excluídas com sucesso!');
    } catch (error) {
      console.error('Error deleting slabs:', error);
      alert('Erro ao excluir chapas.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle backtrack process
  const handleRetrocederStatus = async (slabId: string, currentStatus: string) => {
    if (!user) return;
    
    let nextStatus: 'acido' | 'resina' | 'polimento' | 'estoque' | 'serrada' = 'serrada';
    let label = '';
    
    if (currentStatus === 'estoque') {
      nextStatus = 'polimento';
      label = 'Polimento';
    } else if (currentStatus === 'polimento') {
      nextStatus = 'resina';
      label = 'Resinamento';
    } else if (currentStatus === 'resina') {
      nextStatus = 'acido';
      label = 'Aplicação de Ácido';
    } else if (currentStatus === 'acido') {
      nextStatus = 'serrada';
      label = 'Serragem (Chapa Disponível)';
    }

    if (!confirm(`Deseja retornar esta chapa para o processo de ${label}?`)) return;
    
    // Using handleBulkStatusUpdate to keep it consistent
    await handleBulkStatusUpdate(nextStatus, [slabId]);
  };

  const handleBlockSelect = (blockId: string) => {
    setSelectedBlockId(blockId);
    if (blockId) {
      const block = entries.find(e => e.blockId === blockId);
      if (block) {
        setSlabLength(block.length);
        setSlabHeight(block.height);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!hasPermission('producao') && !hasPermission('entrada') && !isAdmin)) {
      alert('Você não tem permissão para realizar esta operação.');
      return;
    }

    if (!blockId || !type || !length || !height || !width) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'blockEntries'), {
        blockId,
        type,
        length: Number(length),
        height: Number(height),
        width: Number(width),
        volume: Number(volume),
        entryDate,
        status: 'ativo', // Default to active
        userId: user.uid,
        userName: profile?.name || user.email || 'Usuário',
        createdAt: serverTimestamp()
      });

      // Clear form
      setBlockId('');
      setType('');
      setLength('');
      setHeight('');
      setWidth('');
      alert('Entrada de bloco registrada com sucesso!');
    } catch (error) {
      console.error('Error saving block entry:', error);
      alert('Erro ao registrar entrada. Verifique suas permissões.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !user) return;

    setSubmitting(true);
    try {
      const entryRef = doc(db, 'blockEntries', editingEntry.id);
      const updatedVolume = Number((editingEntry.length * editingEntry.height * editingEntry.width).toFixed(3));
      
      await updateDoc(entryRef, {
        blockId: editingEntry.blockId,
        type: editingEntry.type,
        length: Number(editingEntry.length),
        height: Number(editingEntry.height),
        width: Number(editingEntry.width),
        volume: updatedVolume,
        entryDate: editingEntry.entryDate,
      });

      setEditingEntry(null);
      alert('Registro atualizado com sucesso!');
    } catch (error) {
      console.error('Error updating entry:', error);
      alert('Erro ao atualizar registro.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSlab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlab || !user) return;

    setSubmitting(true);
    try {
      const slabRef = doc(db, 'slabEntries', editingSlab.id);
      const updatedArea = Number((editingSlab.length * editingSlab.height).toFixed(3));
      
      await updateDoc(slabRef, {
        length: Number(editingSlab.length),
        height: Number(editingSlab.height),
        area: updatedArea,
        photoUrl: editingSlab.photoUrl || null
      });

      setEditingSlab(null);
      alert('Chapa atualizada com sucesso!');
    } catch (error) {
      console.error('Error updating slab:', error);
      alert('Erro ao atualizar chapa.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'blockEntries', id));
      setIsDeleteDialogOpen(null);
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Erro ao excluir registro.');
    }
  };

  const handleDeleteSlab = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'slabEntries', id));
      setIsDeleteSlabDialogOpen(null);
    } catch (error) {
      console.error('Error deleting slab:', error);
      alert('Erro ao excluir chapa.');
    }
  };

  // Filtered data
  const filteredEntries = entries.filter(e => {
    const searchLower = searchTerm.toLowerCase();
    const dateMatch = (!startDate || e.entryDate >= startDate) && (!endDate || e.entryDate <= endDate);
    
    if (!dateMatch) return false;
    
    return (
      e.blockId.toLowerCase().includes(searchLower) ||
      e.type.toLowerCase().includes(searchLower) ||
      (e.userName && e.userName.toLowerCase().includes(searchLower)) ||
      e.length.toString().includes(searchLower) ||
      e.height.toString().includes(searchLower) ||
      e.width.toString().includes(searchLower) ||
      e.volume.toString().includes(searchLower) ||
      (e.status && e.status.toLowerCase().includes(searchLower)) ||
      (e.entryDate && e.entryDate.includes(searchLower))
    );
  });

  // Helper to sort slabs by identification
  const sortSlabsByIdentification = (a: SlabEntry, b: SlabEntry) => {
    // Sort by Block ID first
    if (a.parentBlockId !== b.parentBlockId) {
      return a.parentBlockId.localeCompare(b.parentBlockId);
    }

    // Then by batch letter and index within batch
    // Pattern: [Idx]/[Total][Letter]
    const matchA = a.slabId.match(/^(\d+)\/(\d+)([A-Z]+)$/);
    const matchB = b.slabId.match(/^(\d+)\/(\d+)([A-Z]+)$/);

    if (matchA && matchB) {
      const letterA = matchA[3];
      const letterB = matchB[3];
      
      if (letterA !== letterB) {
        return letterA.localeCompare(letterB);
      }

      const idxA = parseInt(matchA[1], 10);
      const idxB = parseInt(matchB[1], 10);
      return idxA - idxB;
    }

    return a.slabId.localeCompare(b.slabId);
  };

  const filteredSlabs = slabs.filter(s => {
    const searchLower = searchTerm.toLowerCase();
    const material = getSlabMaterial(s).toLowerCase();
    
    // Date filtering based on status
    let itemDate = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toISOString().split('T')[0] : '';
    if (s.status === 'acido') itemDate = s.acidDate?.split('T')[0] || '';
    if (s.status === 'resina') itemDate = s.resinaDate?.split('T')[0] || '';
    if (s.status === 'polimento') itemDate = s.polimentoDate?.split('T')[0] || '';
    if (s.status === 'estoque') itemDate = s.finalizedDate?.split('T')[0] || '';
    
    const dateMatch = (!startDate || (itemDate && itemDate >= startDate)) && 
                      (!endDate || (itemDate && itemDate <= endDate));
    
    if (!dateMatch) return false;
    
    return (
      s.slabId.toLowerCase().includes(searchLower) ||
      s.parentBlockId.toLowerCase().includes(searchLower) ||
      material.includes(searchLower) ||
      (s.userName && s.userName.toLowerCase().includes(searchLower)) ||
      (s.acidUserName && s.acidUserName.toLowerCase().includes(searchLower)) ||
      (s.resinaUserName && s.resinaUserName.toLowerCase().includes(searchLower)) ||
      (s.polimentoUserName && s.polimentoUserName.toLowerCase().includes(searchLower)) ||
      (s.finalizedUserName && s.finalizedUserName.toLowerCase().includes(searchLower)) ||
      (s.length && s.length.toString().includes(searchLower)) ||
      (s.height && s.height.toString().includes(searchLower)) ||
      (s.area && s.area.toString().includes(searchLower)) ||
      (s.acidDate && s.acidDate.includes(searchLower)) ||
      (s.resinaDate && s.resinaDate.includes(searchLower)) ||
      (s.polimentoDate && s.polimentoDate.includes(searchLower)) ||
      (s.finalizedDate && s.finalizedDate.includes(searchLower))
    );
  });

  const exportToPDF = () => {
    const doc = new jsPDF();
    const titleMap: Record<string, string> = {
      entrada: 'Relatorio de Entrada de Blocos',
      serragem: 'Relatorio de Chapas Serradas',
      acido: 'Relatorio de Aplicacao de Acido',
      resina: 'Relatorio de Resinacao',
      polimento: 'Relatorio de Polimento',
      estoque: 'Relatorio de Estoque Final',
      quebradas: 'Relatorio de Chapas Quebradas'
    };
    
    const title = titleMap[activeTab] || 'Relatorio de Producao';
    
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);
    if (startDate || endDate) {
      doc.text(`Periodo: ${startDate || 'Inicio'} ate ${endDate || 'Fim'}`, 14, 27);
    }

    if (activeTab === 'entrada') {
      const tableData = filteredEntries.map(e => [
        e.blockId,
        e.type,
        `${e.length}x${e.height}x${e.width}`,
        e.volume.toFixed(3),
        e.entryDate || '',
        e.status || 'Ativo'
      ]);
      autoTable(doc, {
        head: [['ID Bloco', 'Material', 'Medidas (m)', 'Vol (m3)', 'Data Entrada', 'Status']],
        body: tableData,
        startY: (startDate || endDate) ? 35 : 30,
      });
    } else {
      const tabsMap: Record<string, string> = {
        serragem: 'serrada',
        acido: 'acido',
        resina: 'resina',
        polimento: 'polimento',
        estoque: 'estoque',
        quebradas: 'quebrada'
      };
      
      const currentStatus = tabsMap[activeTab] || 'serrada';
      const items = filteredSlabs.filter(s => s.status === currentStatus || (currentStatus === 'serrada' && !s.status));
      
      const tableData = items.map(s => [
        s.slabId,
        s.parentBlockId,
        getSlabMaterial(s),
        `${s.length}x${s.height}`,
        s.area.toFixed(2),
        s.userName || ''
      ]);

      autoTable(doc, {
        head: [['ID Chapa', 'Bloco', 'Material', 'Medidas (m)', 'Area (m2)', 'Operador']],
        body: tableData,
        startY: (startDate || endDate) ? 35 : 30,
      });
    }

    doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
  };

  // Stats calculation based on filtered data
  const displaySlabs = (filteredSlabs.filter(s => s.status === 'serrada' || !s.status)).sort(sortSlabsByIdentification);
  
  const totalSlabsCountResult = displaySlabs.length;
  const totalM2Result = displaySlabs.reduce((acc, curr) => acc + curr.area, 0).toFixed(2).replace('.', ',');

  const displayBlocks = filteredEntries;
  const totalBlocksCount = displayBlocks.length;
  const totalVolume = displayBlocks.reduce((acc, curr) => acc + curr.volume, 0).toFixed(3).replace('.', ',');

  const displayAcidSlabs = (filteredSlabs.filter(s => s.status === 'acido')).sort(sortSlabsByIdentification);
  const totalAcidCount = displayAcidSlabs.length;
  const totalAcidM2 = displayAcidSlabs.reduce((acc, curr) => acc + curr.area, 0).toFixed(2).replace('.', ',');

  const displayResinaSlabs = (filteredSlabs.filter(s => s.status === 'resina')).sort(sortSlabsByIdentification);
  const totalResinaCount = displayResinaSlabs.length;
  const totalResinaM2 = displayResinaSlabs.reduce((acc, curr) => acc + curr.area, 0).toFixed(2).replace('.', ',');

  const displayPolimentoSlabs = (filteredSlabs.filter(s => s.status === 'polimento')).sort(sortSlabsByIdentification);
  const totalPolimentoCount = displayPolimentoSlabs.length;
  const totalPolimentoM2 = displayPolimentoSlabs.reduce((acc, curr) => acc + curr.area, 0).toFixed(2).replace('.', ',');

  const displayEstoqueSlabs = (filteredSlabs.filter(s => s.status === 'estoque')).sort(sortSlabsByIdentification);
  const totalEstoqueCount = displayEstoqueSlabs.length;
  const totalEstoqueM2 = displayEstoqueSlabs.reduce((acc, curr) => acc + curr.area, 0).toFixed(2).replace('.', ',');

  const displayQuebradaSlabs = (filteredSlabs.filter(s => s.status === 'quebrada')).sort(sortSlabsByIdentification);
  const totalQuebradaCount = displayQuebradaSlabs.length;
  const totalQuebradaM2 = displayQuebradaSlabs.reduce((acc, curr) => acc + curr.area, 0).toFixed(2).replace('.', ',');

  if (!user) return null;

  if (!isAdmin && userAvailableTabs.length === 0) {
    return (
      <div className="bg-red-50 p-8 rounded-2xl border border-red-100 flex flex-col items-center text-center gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div>
          <h2 className="text-xl font-bold text-red-900">Acesso Negado</h2>
          <p className="text-red-700 mt-1">Você não possui permissão para acessar a tela de Produção.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Hidden file input for photos */}
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept="image/*"
        onChange={handleFileUpload}
      />
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Produção</h1>
          <p className="text-slate-500 text-sm">Gerenciamento de processos e entrada de materiais.</p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto no-print">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm"
              title="Data Inicial"
            />
            <span className="text-slate-400 text-xs">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm"
              title="Data Final"
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => {setStartDate(''); setEndDate('');}}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Limpar Datas"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-sm transition-all shadow-sm"
            />
            {searchTerm && (
              <span className="absolute -top-6 right-0 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-in zoom-in">
                {activeTab === 'entrada' ? totalBlocksCount : 
                 activeTab === 'serragem' ? totalSlabsCountResult : 
                 activeTab === 'acido' ? totalAcidCount : 
                 activeTab === 'resina' ? totalResinaCount : 
                 activeTab === 'polimento' ? totalPolimentoCount :
                 activeTab === 'estoque' ? totalEstoqueCount :
                 totalQuebradaCount} resultados
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 no-print">
            <div className="flex items-center gap-2">
              <button 
                onClick={exportToPDF}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Gerar PDF
              </button>
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50 transition shadow-sm no-print"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
            {activeTab === 'entrada' ? (
              <>
                <div className="px-4 py-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/20 hover:scale-105 transition-transform duration-300">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-80">Total Blocos</span>
                  <span className="text-lg font-black leading-none">{totalBlocksCount}</span>
                </div>
                <div className="px-4 py-2 bg-slate-800 rounded-xl text-white hover:bg-slate-700 transition-colors duration-300 border border-slate-700 shadow-sm">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-70">Volume Total</span>
                  <span className="text-lg font-black leading-none">{totalVolume} m³</span>
                </div>
              </>
            ) : activeTab === 'serragem' ? (
              <>
                <div className="px-4 py-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/20 hover:scale-105 transition-transform duration-300">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-80">Total Chapas</span>
                  <span className="text-lg font-black leading-none">{totalSlabsCountResult}</span>
                </div>
                <div className="px-4 py-2 bg-slate-800 rounded-xl text-white hover:bg-slate-700 transition-colors duration-300 border border-slate-700 shadow-sm">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-70">Total m²</span>
                  <span className="text-lg font-black leading-none">{totalM2Result} m²</span>
                </div>
              </>
            ) : activeTab === 'acido' ? (
              <>
                <div className="px-4 py-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/30 hover:scale-105 transition-all duration-300 ring-2 ring-blue-500/20 ring-offset-2 ring-offset-white">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-80 letter-spacing-widest">Em Ácido</span>
                  <span className="text-lg font-black leading-none">{totalAcidCount}</span>
                </div>
                <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-900 group hover:bg-white hover:border-slate-300 transition-all duration-300 shadow-sm">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 text-slate-400 group-hover:text-slate-500">Metragem Total</span>
                  <span className="text-lg font-black leading-none text-slate-700">{totalAcidM2} m²</span>
                </div>
              </>
            ) : activeTab === 'resina' ? (
              <>
                <div className="px-4 py-2 bg-purple-600 rounded-xl text-white shadow-lg shadow-purple-600/30 hover:scale-105 transition-all duration-300 ring-2 ring-purple-500/20 ring-offset-2 ring-offset-white">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-80 letter-spacing-widest">Em Resina</span>
                  <span className="text-lg font-black leading-none">{totalResinaCount}</span>
                </div>
                <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-900 group hover:bg-white hover:border-slate-300 transition-all duration-300 shadow-sm">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 text-slate-400 group-hover:text-slate-500">Metragem Total</span>
                  <span className="text-lg font-black leading-none text-slate-700">{totalResinaM2} m²</span>
                </div>
              </>
            ) : activeTab === 'polimento' ? (
              <>
                <div className="px-4 py-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-600/30 hover:scale-105 transition-all duration-300 ring-2 ring-emerald-500/20 ring-offset-2 ring-offset-white">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-80 letter-spacing-widest">Em Polimento</span>
                  <span className="text-lg font-black leading-none">{totalPolimentoCount}</span>
                </div>
                <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-900 group hover:bg-white hover:border-slate-300 transition-all duration-300 shadow-sm">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 text-slate-400 group-hover:text-slate-500">Metragem em Polimento</span>
                  <span className="text-lg font-black leading-none text-slate-700">{totalPolimentoM2} m²</span>
                </div>
              </>
            ) : activeTab === 'estoque' ? (
              <>
                <div className="px-4 py-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/30 hover:scale-105 transition-all duration-300 ring-2 ring-blue-500/20 ring-offset-2 ring-offset-white">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-80 letter-spacing-widest">Em Estoque</span>
                  <span className="text-lg font-black leading-none">{totalEstoqueCount}</span>
                </div>
                <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-900 group hover:bg-white hover:border-slate-300 transition-all duration-300 shadow-sm">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 text-slate-400 group-hover:text-slate-500">Metragem em Estoque</span>
                  <span className="text-lg font-black leading-none text-slate-700">{totalEstoqueM2} m²</span>
                </div>
              </>
            ) : (
              <>
                <div className="px-4 py-2 bg-red-600 rounded-xl text-white shadow-lg shadow-red-600/30 hover:scale-105 transition-all duration-300 ring-2 ring-red-500/20 ring-offset-2 ring-offset-white">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 opacity-80 letter-spacing-widest">Quebradas</span>
                  <span className="text-lg font-black leading-none">{totalQuebradaCount}</span>
                </div>
                <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-900 group hover:bg-white hover:border-slate-300 transition-all duration-300 shadow-sm">
                  <span className="text-[10px] font-bold uppercase block leading-none mb-1 text-slate-400 group-hover:text-slate-500">Metragem Quebrada</span>
                  <span className="text-lg font-black leading-none text-slate-700">{totalQuebradaM2} m²</span>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
        <div className="flex p-1 bg-slate-100 rounded-2xl w-fit">
          {userAvailableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === tab.id 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : tab.id === 'quebrada' && activeTab !== 'quebrada' 
                    ? 'text-slate-500 hover:text-red-600 hover:bg-white/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${tab.color}`} />
              {tab.label}
            </button>
          ))}
        </div>

      {activeTab === 'entrada' ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Seção Entrada de Blocos (Original content here but I'll need to wrap it) */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-cyan-600">
              <Box className="w-5 h-5 text-cyan-600" />
              <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Entrada de Blocos</h2>
            </div>
            {/* Form and Table code follows... */}

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Identificação do Bloco</label>
              <div className="relative">
                <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={blockId}
                  onChange={(e) => setBlockId(e.target.value)}
                  placeholder="Número ou ID do Bloco"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tipo de Material</label>
              <div className="relative group">
                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  required
                  value={type}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') {
                      setIsAddingMaterial(true);
                      setType('');
                    } else {
                      setType(e.target.value);
                    }
                  }}
                  className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
                >
                  <option value="">Selecionar Material</option>
                  {materialTypes.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                  <option value="ADD_NEW" className="font-bold text-blue-600">+ Adicionar Novo...</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={() => setIsManagingMaterials(true)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-blue-600 transition-colors"
                    title="Gerenciar Materiais"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <PlusCircle className="w-4 h-4 text-slate-400" />
                </div>
              </div>

              {/* Modal Inline para Adicionar Material */}
              <AnimatePresence>
                {isAddingMaterial && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-10 mt-1 p-3 bg-white border border-slate-200 rounded-xl shadow-xl w-64"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-900 uppercase">Novo Material</span>
                        <button onClick={() => setIsAddingMaterial(false)}>
                          <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                        </button>
                      </div>
                      <input
                        type="text"
                        autoFocus
                        value={newMaterialName}
                        onChange={(e) => setNewMaterialName(e.target.value)}
                        placeholder="Nome do material..."
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddMaterial();
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddMaterial}
                        className="w-full py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition"
                      >
                        SALVAR MATERIAL
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Data de Entrada</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Lançado por</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  disabled
                  value={profile?.name || user.email || ''}
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 text-sm cursor-not-allowed"
                />
              </div>
            </div>

            {/* Medidas */}
            <div className="md:col-span-3 lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Comprimento (m)</label>
                <div className="relative">
                  <Maximize className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={length}
                    onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0,00"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Altura (m)</label>
                <div className="relative">
                  <Maximize className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" />
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={height}
                    onChange={(e) => setHeight(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0,00"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Largura (m)</label>
                <div className="relative">
                  <Maximize className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 -rotate-45" />
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={width}
                    onChange={(e) => setWidth(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0,00"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider ml-1">Volume Total (m³)</label>
                <div className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-bold text-sm flex items-center justify-center">
                  {volume} m³
                </div>
              </div>
            </div>

            <div className="md:col-span-3 lg:col-span-4 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                REGISTRAR ENTRADA
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Tabela de Registros */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-600">
            <History className="w-5 h-5" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Histórico de Entradas</h2>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
            {entries.length} Registros Recentes
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Material</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Medidas (m)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Volume</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Data/Lançamento</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        <span className="text-xs text-slate-500 font-medium">Carregando histórico...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-400 italic text-sm">
                      Nenhum bloco encontrado para esta pesquisa.
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filteredEntries.map((entry, i) => (
                      <motion.tr 
                        key={entry.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="hover:bg-slate-50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 text-sm">
                            {entry.blockId}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[10px] font-medium text-slate-500">
                            {entry.length.toFixed(2).replace('.', ',')} x {entry.height.toFixed(2).replace('.', ',')} x {entry.width.toFixed(2).replace('.', ',')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-blue-600 text-sm">
                            {entry.volume.toFixed(3).replace('.', ',')} m³
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            entry.status === 'baixado' 
                              ? 'bg-amber-100 text-amber-700' 
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {entry.status === 'baixado' ? 'Baixado' : 'Ativo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-bold text-slate-900">
                              {(() => {
                                if (entry.createdAt?.toDate) {
                                  return entry.createdAt.toDate().toLocaleString('pt-BR');
                                }
                                const [year, month, day] = entry.entryDate.split('-').map(Number);
                                return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
                              })()}
                            </span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                              <User className="w-3 h-3" />
                              {entry.userName}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setIsDeleteDialogOpen(entry.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  ) : activeTab === 'serragem' ? (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Seção Serragem de Blocos */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 text-blue-600">
          <SquareStack className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Serragem de Blocos</h2>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <form onSubmit={handleSawingSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Bloco p/ Serrar</label>
              <div className="relative">
                <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  required
                  value={selectedBlockId}
                  onChange={(e) => handleBlockSelect(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
                >
                  <option value="">Selecione um Bloco</option>
                  {entries.filter(e => e.status !== 'baixado').map(e => (
                    <option key={e.id} value={e.blockId}>{e.blockId} ({e.type})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Quantidade de Chapas</label>
              <div className="relative">
                <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  required
                  min="1"
                  value={numSlabs}
                  onChange={(e) => setNumSlabs(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ex: 5"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Comp. Chapa (m)</label>
              <div className="relative">
                <Maximize className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  step="0.01"
                  required
                  value={slabLength}
                  onChange={(e) => setSlabLength(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0,00"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Altura (m)</label>
              <div className="relative">
                <Maximize className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" />
                <input
                  type="number"
                  step="0.01"
                  required
                  value={slabHeight}
                  onChange={(e) => setSlabHeight(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0,00"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tipo de Serragem</label>
              <div className="relative">
                <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  required
                  value={sawingType}
                  onChange={(e) => setSawingType(e.target.value as 'parcial' | 'completa')}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
                >
                  <option value="parcial">Parcial</option>
                  <option value="completa">Completa</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Foto da Chapa</label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="url"
                    value={slabPhotoUrl}
                    onChange={(e) => setSlabPhotoUrl(e.target.value)}
                    placeholder="URL ou arquivo →"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="relative cursor-pointer group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => handleFileUpload(e)}
                      disabled={isUploading}
                    />
                    <div className={`h-10 w-10 relative flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 group-hover:bg-slate-50 transition-colors shadow-sm ${isUploading ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-black text-blue-600 whitespace-nowrap bg-blue-50 px-1 rounded">
                            {uploadProgress}%
                          </span>
                        </>
                      ) : <Upload className="w-4 h-4" />}
                    </div>
                  </label>

                  {slabPhotoUrl && (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative h-10 w-10 rounded-xl overflow-hidden border border-slate-200 shadow-sm group"
                    >
                      <img 
                        src={slabPhotoUrl} 
                        alt="Preview" 
                        className="h-full w-full object-cover"
                        onError={() => {/* Silent fail for bad URLs */}}
                      />
                      <button 
                        type="button"
                        onClick={() => setSlabPhotoUrl('')}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-4">
                <div className="px-4 py-2 bg-blue-50 rounded-xl">
                  <span className="text-[10px] font-bold text-blue-600 block leading-none mb-1 uppercase">Área p/ Chapa</span>
                  <span className="text-sm font-black text-blue-700">
                    {((Number(slabLength || 0)) * (Number(slabHeight || 0))).toFixed(3).replace('.', ',')} m²
                  </span>
                </div>
                <div className="px-4 py-2 bg-slate-50 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 block leading-none mb-1 uppercase">Área Total do Lote</span>
                  <span className="text-sm font-black text-slate-700">
                    {((Number(slabLength || 0)) * (Number(slabHeight || 0)) * (Number(numSlabs || 0))).toFixed(3).replace('.', ',')} m²
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full md:w-auto px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                CADASTRAR LOTE DE CHAPAS
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Tabela de Chapas */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-600">
              <History className="w-5 h-5" />
              <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Histórico de Serragem</h2>
            </div>
            
            {selectedSlabs.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl"
              >
                <span className="text-[10px] font-black text-slate-400 uppercase border-r border-slate-700 pr-2 mr-1">
                  {selectedSlabs.length} selecionadas
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('acido')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-amber-600 text-white text-[9px] font-black rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                  >
                    <FlaskConical className="w-3 h-3" />
                    P/ ÁCIDO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('resina')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-purple-600 text-white text-[9px] font-black rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    <Beaker className="w-3 h-3" />
                    P/ RESINA
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('polimento')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    <Layers className="w-3 h-3" />
                    P/ POLIMENTO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('estoque')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white text-[9px] font-black rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    LANÇAR ESTOQUE OK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('quebrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-[9px] font-black rounded-lg hover:bg-red-600 transition disabled:opacity-50"
                  >
                    <AlertCircle className="w-3 h-3" />
                    QUEBRADA
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    EXCLUIR
                  </button>
                </div>
                <button
                  onClick={() => setSelectedSlabs([])}
                  className="p-1 text-slate-500 hover:text-white transition-colors ml-1 border-l border-slate-700 pl-2"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
            Últimas {slabs.length} chapas
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                    <th className="px-4 py-4 text-center">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={displaySlabs.length > 0 && displaySlabs.every(s => selectedSlabs.includes(s.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSlabs(displaySlabs.map(s => s.id));
                          } else {
                            setSelectedSlabs([]);
                          }
                        }}
                      />
                    </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Bloco de Origem</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center">Material</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Identificação Chapa</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Cód. Barras</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Medidas (m)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">M²</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Data / Hora</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingSlabs ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        <span className="text-xs text-slate-500 font-medium">Carregando chapas...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSlabs.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-10 text-center text-slate-400 italic text-sm">
                      Nenhuma chapa encontrada para esta pesquisa.
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {displaySlabs.map((slab, i) => (
                      <motion.tr 
                        key={slab.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.01 }}
                        className={`hover:bg-slate-50 transition-colors group ${selectedSlabs.includes(slab.id) ? 'bg-blue-50/50' : ''}`}
                      >
                        <td className="px-4 py-4 text-center">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={selectedSlabs.includes(slab.id)}
                            onChange={() => {
                              setSelectedSlabs(prev => 
                                prev.includes(slab.id) ? prev.filter(id => id !== slab.id) : [...prev, slab.id]
                              );
                            }}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                            {slab.parentBlockId}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-black text-slate-900 uppercase">
                            {getSlabMaterial(slab)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 text-sm">
                            {slab.slabId}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                            {slab.parentBlockId}-{slab.slabId}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {slab.status === 'acido' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-black uppercase ring-1 ring-amber-200">
                              <FlaskConical className="w-2.5 h-2.5" />
                              ÁCIDO
                            </span>
                          ) : slab.status === 'resina' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[9px] font-black uppercase ring-1 ring-purple-200">
                              <Beaker className="w-2.5 h-2.5" />
                              RESINA
                            </span>
                          ) : slab.status === 'polimento' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase ring-1 ring-emerald-200">
                              <Layers className="w-2.5 h-2.5" />
                              POLIMENTO
                            </span>
                          ) : slab.status === 'estoque' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[9px] font-black uppercase ring-1 ring-blue-200">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              ESTOQUE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase ring-1 ring-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              DISPONÍVEL
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {slab.photoUrl ? (
                            <button 
                              type="button"
                              onClick={() => setPreviewImage(slab.photoUrl || null)}
                              className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all group/photo relative"
                            >
                              <img src={slab.photoUrl} alt="Chapa" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity">
                                <Eye className="w-3 h-3 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 border-dashed flex items-center justify-center text-slate-300">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-900 text-sm font-bold tracking-tight">
                          {slab.length?.toFixed(2).replace('.', ',')} x {slab.height?.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-6 py-4 font-bold text-blue-600 text-sm">
                          {slab.area?.toFixed(3).replace('.', ',')} m²
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-bold text-slate-900">
                              {slab.createdAt?.toDate ? slab.createdAt.toDate().toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {slab.createdAt?.toDate ? slab.createdAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '...'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleBulkStatusUpdate('acido', [slab.id])}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md border border-amber-100 shadow-sm bg-white"
                                title="Enviar para Ácido"
                              >
                                <FlaskConical className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleBulkStatusUpdate('resina', [slab.id])}
                                className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-md border border-purple-100 shadow-sm bg-white"
                                title="Enviar para Resina"
                              >
                                <Beaker className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleBulkStatusUpdate('polimento', [slab.id])}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md border border-emerald-100 shadow-sm bg-white"
                                title="Enviar para Polimento"
                              >
                                <Layers className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleBulkStatusUpdate('estoque', [slab.id])}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md border border-blue-100 shadow-sm bg-white"
                                title="Lançar Estoque OK"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button
                              onClick={() => setEditingSlab(slab)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-2 border-l border-slate-100 pl-3"
                              title="Editar Chapa"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setIsDeleteSlabDialogOpen(slab.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir Chapa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  ) : activeTab === 'acido' ? (
    <div className="space-y-8 animate-in duration-500 fade-in slide-in-from-bottom-2">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-600">
            <FlaskConical className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Aplicação de Ácido em Progresso</h2>
          </div>

          <AnimatePresence>
            {selectedSlabs.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl"
              >
                <span className="text-[10px] font-black text-slate-400 uppercase pr-2 border-r border-slate-700 mr-1">
                  {selectedSlabs.length} selecionadas
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('serrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-600 text-white text-[9px] font-black rounded-lg hover:bg-slate-700 transition"
                  >
                    <HistoryIcon className="w-3 h-3" />
                    P/ SERRAGEM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('resina')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-purple-600 text-white text-[9px] font-black rounded-lg hover:bg-purple-700 transition"
                  >
                    <Beaker className="w-3 h-3" />
                    P/ RESINA
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('polimento')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 transition"
                  >
                    <Layers className="w-3 h-3" />
                    P/ POLIMENTO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('estoque')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white text-[9px] font-black rounded-lg hover:bg-blue-700 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    LANÇAR ESTOQUE OK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('quebrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-[9px] font-black rounded-lg hover:bg-red-600 transition"
                  >
                    <AlertCircle className="w-3 h-3" />
                    QUEBRADA
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    EXCLUIR
                  </button>
                </div>
                <button
                  onClick={() => setSelectedSlabs([])}
                  className="p-1 text-slate-500 hover:text-white transition-colors ml-1 border-l border-slate-700 pl-2"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-4 text-center">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={displayAcidSlabs.length > 0 && displayAcidSlabs.every(s => selectedSlabs.includes(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSlabs(displayAcidSlabs.map(s => s.id));
                        } else {
                          setSelectedSlabs([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Bloco</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center">Material</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Cód. Barras</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Medidas (m)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">M²</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Início Processo</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayAcidSlabs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-40">
                        <Beaker className="w-8 h-8 text-slate-400" />
                        <span className="text-sm italic">Nenhuma chapa em processo de ácido no momento.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayAcidSlabs.map((slab, i) => (
                    <tr key={slab.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedSlabs.includes(slab.id)}
                          onChange={() => {
                            setSelectedSlabs(prev => 
                              prev.includes(slab.id) ? prev.filter(id => id !== slab.id) : [...prev, slab.id]
                            );
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                          {slab.parentBlockId}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-black text-slate-900 uppercase">
                          {getSlabMaterial(slab)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm">{slab.slabId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {slab.parentBlockId}-{slab.slabId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {slab.photoUrl ? (
                          <button 
                            type="button"
                            onClick={() => setPreviewImage(slab.photoUrl || null)}
                            className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-blue-500 transition-all group/photo relative"
                          >
                            <img src={slab.photoUrl} alt="Chapa" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-dashed flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-900 text-sm font-bold tracking-tight">
                        {slab.length?.toFixed(2).replace('.', ',')} x {slab.height?.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-600 text-sm">
                        {slab.area?.toFixed(3).replace('.', ',')} m²
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {slab.acidDate ? new Date(slab.acidDate).toLocaleString('pt-BR') : '...'}
                          </span>
                          <span className="text-[9px] text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {slab.acidUserName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRetrocederStatus(slab.id, 'acido')}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="Retroceder para Serragem"
                          >
                            <HistoryIcon className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleBulkStatusUpdate('resina', [slab.id])}
                              className="px-3 py-1 bg-purple-600 text-white text-[9px] font-black rounded hover:bg-purple-700 transition"
                              title="Enviar p/ Resina"
                            >
                              RESINA
                            </button>
                            <button
                              onClick={() => handleBulkStatusUpdate('polimento', [slab.id])}
                              className="px-3 py-1 bg-emerald-600 text-white text-[9px] font-black rounded hover:bg-emerald-700 transition"
                              title="Enviar p/ Polimento"
                            >
                              POLIMENTO
                            </button>
                            <button
                              onClick={() => handleBulkStatusUpdate('estoque', [slab.id])}
                              className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black rounded hover:bg-blue-700 transition"
                              title="Lançar Estoque OK"
                            >
                              ESTOQUE OK
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      
      <section className="pt-4 border-t border-slate-100 italic text-[10px] text-slate-400 text-center">
        Chapas nesta tela estão aguardando ou em processo de aplicação de ácido.
      </section>
    </div>
  ) : activeTab === 'resina' ? (
    <div className="space-y-8 animate-in duration-500 fade-in slide-in-from-bottom-2">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-purple-600">
            <Beaker className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Resinamento em Progresso</h2>
          </div>

          <AnimatePresence>
            {selectedSlabs.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl"
              >
                <span className="text-[10px] font-black text-slate-400 uppercase pr-2 border-r border-slate-700 mr-1">
                  {selectedSlabs.length} selecionadas
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('serrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-600 text-white text-[9px] font-black rounded-lg hover:bg-slate-700 transition"
                  >
                    <HistoryIcon className="w-3 h-3" />
                    P/ SERRAGEM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('acido')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-amber-600 text-white text-[9px] font-black rounded-lg hover:bg-amber-700 transition"
                  >
                    <FlaskConical className="w-3 h-3" />
                    P/ ÁCIDO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('polimento')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 transition"
                  >
                    <Layers className="w-3 h-3" />
                    P/ POLIMENTO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('estoque')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white text-[9px] font-black rounded-lg hover:bg-blue-700 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    LANÇAR ESTOQUE OK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('quebrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-[9px] font-black rounded-lg hover:bg-red-600 transition"
                  >
                    <AlertCircle className="w-3 h-3" />
                    QUEBRADA
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition"
                  >
                    < Trash2 className="w-3 h-3" />
                    EXCLUIR
                  </button>
                </div>
                <button
                  onClick={() => setSelectedSlabs([])}
                  className="p-1 text-slate-500 hover:text-white transition-colors ml-1 border-l border-slate-700 pl-2"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                   <th className="px-6 py-4 text-center">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={displayResinaSlabs.length > 0 && displayResinaSlabs.every(s => selectedSlabs.includes(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSlabs(displayResinaSlabs.map(s => s.id));
                        } else {
                          setSelectedSlabs([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Bloco</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center">Material</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Cód. Barras</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Medidas (m)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">M²</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Início Resinamento</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayResinaSlabs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-40">
                        <Beaker className="w-8 h-8 text-slate-400" />
                        <span className="text-sm italic">Nenhuma chapa em processo de resinamento no momento.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayResinaSlabs.map((slab) => (
                    <tr key={slab.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedSlabs.includes(slab.id)}
                          onChange={() => {
                            setSelectedSlabs(prev => 
                              prev.includes(slab.id) ? prev.filter(id => id !== slab.id) : [...prev, slab.id]
                            );
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                          {slab.parentBlockId}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-black text-slate-900 uppercase">
                          {getSlabMaterial(slab)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm">{slab.slabId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {slab.parentBlockId}-{slab.slabId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {slab.photoUrl ? (
                          <button 
                            type="button"
                            onClick={() => setPreviewImage(slab.photoUrl || null)}
                            className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-blue-500 transition-all group/photo relative"
                          >
                            <img src={slab.photoUrl} alt="Chapa" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-dashed flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-900 text-sm font-bold tracking-tight">
                        {slab.length?.toFixed(2).replace('.', ',')} x {slab.height?.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-600 text-sm">
                        {slab.area?.toFixed(3).replace('.', ',')} m²
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {slab.resinaDate ? new Date(slab.resinaDate).toLocaleString('pt-BR') : '...'}
                          </span>
                          <span className="text-[9px] text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {slab.resinaUserName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRetrocederStatus(slab.id, 'resina')}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="Retroceder para Ácido"
                          >
                            <HistoryIcon className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleBulkStatusUpdate('acido', [slab.id])}
                              className="px-3 py-1 bg-amber-600 text-white text-[9px] font-black rounded hover:bg-amber-700 transition"
                              title="Enviar p/ Ácido"
                            >
                              ÁCIDO
                            </button>
                            <button
                              onClick={() => handleBulkStatusUpdate('polimento', [slab.id])}
                              className="px-3 py-1 bg-emerald-600 text-white text-[9px] font-black rounded hover:bg-emerald-700 transition"
                              title="Enviar p/ Polimento"
                            >
                              POLIMENTO
                            </button>
                            <button
                              onClick={() => handleBulkStatusUpdate('estoque', [slab.id])}
                              className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black rounded hover:bg-blue-700 transition"
                              title="Lançar Estoque OK"
                            >
                              ESTOQUE OK
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  ) : activeTab === 'estoque' ? (
    <div className="space-y-8 animate-in duration-500 fade-in slide-in-from-bottom-2">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Estoque Final (Prontas)</h2>
          </div>

          <AnimatePresence>
            {selectedSlabs.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl"
              >
                <span className="text-[10px] font-black text-slate-400 uppercase pr-2 border-r border-slate-700 mr-1">
                  {selectedSlabs.length} selecionadas
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('serrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-600 text-white text-[9px] font-black rounded-lg hover:bg-slate-700 transition"
                  >
                    <HistoryIcon className="w-3 h-3" />
                    P/ SERRAGEM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('polimento')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 transition"
                  >
                    <Layers className="w-3 h-3" />
                    P/ POLIMENTO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('quebrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-[9px] font-black rounded-lg hover:bg-red-600 transition"
                  >
                    <AlertCircle className="w-3 h-3" />
                    QUEBRADA
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    EXCLUIR
                  </button>
                </div>
                <button
                  onClick={() => setSelectedSlabs([])}
                  className="p-1 text-slate-500 hover:text-white transition-colors ml-1 border-l border-slate-700 pl-2"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-slate-200">
            <div className="flex flex-col px-3 border-r border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Total Chapas</span>
              <span className="text-lg font-black text-slate-900">{totalEstoqueCount}</span>
            </div>
            <div className="flex flex-col px-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Total M²</span>
              <span className="text-lg font-black text-blue-600">{totalEstoqueM2} m²</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-4 text-center">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={displayEstoqueSlabs.length > 0 && displayEstoqueSlabs.every(s => selectedSlabs.includes(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSlabs(displayEstoqueSlabs.map(s => s.id));
                        } else {
                          setSelectedSlabs([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Bloco</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center">Material</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Cód. Barras</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Medidas (m)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">M²</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Finalizada em</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayEstoqueSlabs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-40">
                        <CheckCircle2 className="w-8 h-8 text-slate-400" />
                        <span className="text-sm italic">Nenhuma chapa no estoque final no momento.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayEstoqueSlabs.map((slab) => (
                    <tr key={slab.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedSlabs.includes(slab.id)}
                          onChange={() => {
                            setSelectedSlabs(prev => 
                              prev.includes(slab.id) ? prev.filter(id => id !== slab.id) : [...prev, slab.id]
                            );
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                          {slab.parentBlockId}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-black text-slate-900 uppercase">
                          {getSlabMaterial(slab)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm">{slab.slabId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {slab.parentBlockId}-{slab.slabId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {slab.photoUrl ? (
                          <button 
                            type="button"
                            onClick={() => setPreviewImage(slab.photoUrl || null)}
                            className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-blue-500 transition-all group/photo relative"
                          >
                            <img src={slab.photoUrl} alt="Chapa" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-dashed flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-900 text-sm font-bold tracking-tight">
                        {slab.length?.toFixed(2).replace('.', ',')} x {slab.height?.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-600 text-sm">
                        {slab.area?.toFixed(3).replace('.', ',')} m²
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {(slab as any).finalizedDate ? new Date((slab as any).finalizedDate).toLocaleString('pt-BR') : '...'}
                          </span>
                          <span className="text-[9px] text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {(slab as any).finalizedUserName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRetrocederStatus(slab.id, 'estoque')}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="Retornar para Produção"
                          >
                            <HistoryIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  ) : activeTab === 'polimento' ? (
    <div className="space-y-8 animate-in duration-500 fade-in slide-in-from-bottom-2">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-600">
            <Layers className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Polimento em Progresso</h2>
          </div>

          <AnimatePresence>
            {selectedSlabs.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl"
              >
                <span className="text-[10px] font-black text-slate-400 uppercase pr-2 border-r border-slate-700 mr-1">
                  {selectedSlabs.length} selecionadas
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('serrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-600 text-white text-[9px] font-black rounded-lg hover:bg-slate-700 transition"
                  >
                    <HistoryIcon className="w-3 h-3" />
                    P/ SERRAGEM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('acido')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-amber-600 text-white text-[9px] font-black rounded-lg hover:bg-amber-700 transition"
                  >
                    <FlaskConical className="w-3 h-3" />
                    P/ ÁCIDO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('resina')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-purple-600 text-white text-[9px] font-black rounded-lg hover:bg-purple-700 transition"
                  >
                    <Beaker className="w-3 h-3" />
                    P/ RESINA
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerPhotoUpload(selectedSlabs)}
                    disabled={submitting || isUploading}
                    className="flex items-center gap-1.5 px-2 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg hover:bg-emerald-700 transition"
                  >
                    {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                    FOTO EM LOTE
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('estoque')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white text-[9px] font-black rounded-lg hover:bg-blue-700 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    LANÇAR ESTOQUE OK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('quebrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-[9px] font-black rounded-lg hover:bg-red-600 transition"
                  >
                    <AlertCircle className="w-3 h-3" />
                    QUEBRADA
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    EXCLUIR
                  </button>
                </div>
                <button
                  onClick={() => setSelectedSlabs([])}
                  className="p-1 text-slate-500 hover:text-white transition-colors ml-1 border-l border-slate-700 pl-2"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-4 text-center">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={displayPolimentoSlabs.length > 0 && displayPolimentoSlabs.every(s => selectedSlabs.includes(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSlabs(displayPolimentoSlabs.map(s => s.id));
                        } else {
                          setSelectedSlabs([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Bloco</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center">Material</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Cód. Barras</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Medidas (m)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">M²</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Início Polimento</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayPolimentoSlabs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-40">
                        <Loader2 className="w-8 h-8 text-slate-400" />
                        <span className="text-sm italic">Nenhuma chapa em processo de polimento no momento.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayPolimentoSlabs.map((slab) => (
                    <tr key={slab.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedSlabs.includes(slab.id)}
                          onChange={() => {
                            setSelectedSlabs(prev => 
                              prev.includes(slab.id) ? prev.filter(id => id !== slab.id) : [...prev, slab.id]
                            );
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                          {slab.parentBlockId}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-black text-slate-900 uppercase">
                          {getSlabMaterial(slab)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm">{slab.slabId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {slab.parentBlockId}-{slab.slabId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {slab.photoUrl ? (
                            <div className="relative group/photo-cell">
                              <button 
                                type="button"
                                onClick={() => setPreviewImage(slab.photoUrl || null)}
                                className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-blue-500 transition-all group/photo relative"
                              >
                                <img src={slab.photoUrl} alt="Chapa" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity">
                                  <Eye className="w-3 h-3 text-white" />
                                </div>
                              </button>
                              <button
                                onClick={() => triggerPhotoUpload([slab.id])}
                                className="absolute -top-1 -right-1 bg-white shadow-sm border border-slate-200 p-0.5 rounded-full text-slate-400 hover:text-blue-600 opacity-0 group-hover/photo-cell:opacity-100 transition-opacity"
                                title="Alterar Foto"
                              >
                                <Camera className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => triggerPhotoUpload([slab.id])}
                              className="w-10 h-10 rounded-lg bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-100 hover:border-slate-400 transition-colors group/upload-btn"
                              title="Adicionar Foto"
                            >
                              <Camera className="w-4 h-4 group-hover/upload-btn:scale-110 transition-transform" />
                              <span className="text-[8px] font-bold uppercase">Add</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-900 text-sm font-bold tracking-tight">
                        {slab.length?.toFixed(2).replace('.', ',')} x {slab.height?.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-600 text-sm">
                        {slab.area?.toFixed(3).replace('.', ',')} m²
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {slab.polimentoDate ? new Date(slab.polimentoDate).toLocaleString('pt-BR') : '...'}
                        </span>
                          <span className="text-[9px] text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {slab.polimentoUserName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRetrocederStatus(slab.id, 'polimento')}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="Retroceder para Resina"
                          >
                            <HistoryIcon className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleBulkStatusUpdate('acido', [slab.id])}
                              className="px-3 py-1 bg-amber-600 text-white text-[9px] font-black rounded hover:bg-amber-700 transition"
                              title="Enviar p/ Ácido"
                            >
                              ÁCIDO
                            </button>
                            <button
                              onClick={() => handleBulkStatusUpdate('resina', [slab.id])}
                              className="px-3 py-1 bg-purple-600 text-white text-[9px] font-black rounded hover:bg-purple-700 transition"
                              title="Enviar p/ Resina"
                            >
                              RESINA
                            </button>
                            <button
                              onClick={() => handleBulkStatusUpdate('estoque', [slab.id])}
                              className="px-4 py-1 bg-blue-600 text-white text-[9px] font-black rounded hover:bg-blue-700 transition flex items-center gap-2"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              ESTOQUE OK
                            </button>
                            <button
                              onClick={() => handleBulkStatusUpdate('quebrada', [slab.id])}
                              className="px-4 py-1 bg-red-500 text-white text-[9px] font-black rounded hover:bg-red-600 transition flex items-center gap-2"
                            >
                              <AlertCircle className="w-3 h-3" />
                              QUEBRADA
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  ) : (
    <div className="space-y-8 animate-in duration-500 fade-in slide-in-from-bottom-2">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-sm">Chapas Quebradas / Refugo</h2>
          </div>

          <AnimatePresence>
            {selectedSlabs.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl"
              >
                <span className="text-[10px] font-black text-slate-400 uppercase pr-2 border-r border-slate-700 mr-1">
                  {selectedSlabs.length} selecionadas
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate('serrada')}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-600 text-white text-[9px] font-black rounded-lg hover:bg-slate-700 transition"
                  >
                    <HistoryIcon className="w-3 h-3" />
                    REATIVAR (SERRAGEM)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    EXCLUIR PERMANENTE
                  </button>
                </div>
                <button
                  onClick={() => setSelectedSlabs([])}
                  className="p-1 text-slate-500 hover:text-white transition-colors ml-1 border-l border-slate-700 pl-2"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-slate-200">
            <div className="flex flex-col px-3 border-r border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Total Quebradas</span>
              <span className="text-lg font-black text-slate-900">{totalQuebradaCount}</span>
            </div>
            <div className="flex flex-col px-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Perda Total</span>
              <span className="text-lg font-black text-red-600">{totalQuebradaM2} m²</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-4 text-center">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={displayQuebradaSlabs.length > 0 && displayQuebradaSlabs.every(s => selectedSlabs.includes(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSlabs(displayQuebradaSlabs.map(s => s.id));
                        } else {
                          setSelectedSlabs([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Bloco</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center">Material</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Cód. Barras</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Foto</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Medidas (m)</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">M²</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Quebrada em</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayQuebradaSlabs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-40">
                        <AlertCircle className="w-8 h-8 text-slate-400" />
                        <span className="text-sm italic">Nenhuma chapa registrada como quebrada.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayQuebradaSlabs.map((slab) => (
                    <tr key={slab.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedSlabs.includes(slab.id)}
                          onChange={() => {
                            setSelectedSlabs(prev => 
                              prev.includes(slab.id) ? prev.filter(id => id !== slab.id) : [...prev, slab.id]
                            );
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                          {slab.parentBlockId}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-black text-slate-900 uppercase">
                          {getSlabMaterial(slab)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm">{slab.slabId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {slab.parentBlockId}-{slab.slabId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {slab.photoUrl ? (
                          <button 
                            type="button"
                            onClick={() => setPreviewImage(slab.photoUrl || null)}
                            className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-blue-500 transition-all group/photo relative"
                          >
                            <img src={slab.photoUrl} alt="Chapa" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-dashed flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-900 text-sm font-bold tracking-tight">
                        {slab.length?.toFixed(2).replace('.', ',')} x {slab.height?.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-600 text-sm">
                        {slab.area?.toFixed(3).replace('.', ',')} m²
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {(slab as any).brokenDate ? new Date((slab as any).brokenDate).toLocaleString('pt-BR') : '...'}
                          </span>
                          <span className="text-[9px] text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {(slab as any).brokenUserName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingSlab(slab)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="Editar Medidas"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleBulkStatusUpdate('serrada', [slab.id])}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                            title="Reativar Chapa"
                          >
                            <HistoryIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )}

      {/* Modal de Edição */}
      <AnimatePresence>
        {editingEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingEntry(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-bold text-slate-900">Editar Entrada de Bloco</h3>
                <button onClick={() => setEditingEntry(null)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              
              <form onSubmit={handleUpdate} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">ID do Bloco</label>
                    <input
                      type="text"
                      required
                      value={editingEntry.blockId}
                      onChange={(e) => setEditingEntry({...editingEntry, blockId: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</label>
                    <select
                      required
                      value={editingEntry.type}
                      onChange={(e) => setEditingEntry({...editingEntry, type: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm bg-white"
                    >
                      {materialTypes.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comp. (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editingEntry.length}
                      onChange={(e) => setEditingEntry({...editingEntry, length: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alt. (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editingEntry.height}
                      onChange={(e) => setEditingEntry({...editingEntry, height: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Larg. (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editingEntry.width}
                      onChange={(e) => setEditingEntry({...editingEntry, width: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data de Entrada</label>
                  <input
                    type="date"
                    required
                    value={editingEntry.entryDate}
                    onChange={(e) => setEditingEntry({...editingEntry, entryDate: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl mt-4">
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Volume Resultante:</span>
                  <span className="text-lg font-black text-blue-600">{(editingEntry.length * editingEntry.height * editingEntry.width).toFixed(3).replace('.', ',')} m³</span>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingEntry(null)}
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg hover:bg-slate-50 transition"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'SALVAR ALTERAÇÕES'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Exclusão */}
      <AnimatePresence>
        {isDeleteDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteDialogOpen(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Excluir Registro?</h3>
              <p className="text-slate-500 text-sm mb-6">Esta ação não pode ser desfeita. O registro do bloco será removido permanentemente.</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteDialogOpen(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg hover:bg-slate-50 transition"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => handleDelete(isDeleteDialogOpen)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-bold text-sm rounded-lg hover:bg-red-700 transition shadow-lg shadow-red-600/20"
                >
                  EXCLUIR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Gerenciar Materiais */}
      <AnimatePresence>
        {editingSlab && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingSlab(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-bold text-slate-900">Editar Chapa {editingSlab.slabId}</h3>
                <button onClick={() => setEditingSlab(null)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              
              <form onSubmit={handleUpdateSlab} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comprimento (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editingSlab.length}
                      onChange={(e) => setEditingSlab({...editingSlab, length: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Altura (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editingSlab.height}
                      onChange={(e) => setEditingSlab({...editingSlab, height: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Foto da Chapa</label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="url"
                        value={editingSlab.photoUrl || ''}
                        onChange={(e) => setEditingSlab({...editingSlab, photoUrl: e.target.value})}
                        placeholder="https://exemplo.com/foto.jpg"
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <label className="relative cursor-pointer group">
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => handleFileUpload(e, true)}
                          disabled={isUploading}
                        />
                        <div className={`h-10 w-10 relative flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 group-hover:bg-slate-50 transition-colors shadow-sm ${isUploading ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
                          {isUploading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-black text-blue-600 whitespace-nowrap bg-blue-50 px-1 rounded">
                                {uploadProgress}%
                              </span>
                            </>
                          ) : <Upload className="w-4 h-4" />}
                        </div>
                      </label>

                      {editingSlab.photoUrl && (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="relative h-10 w-10 rounded-lg overflow-hidden border border-slate-200 shadow-sm group"
                        >
                          <img 
                            src={editingSlab.photoUrl} 
                            alt="Preview" 
                            className="h-full w-full object-cover"
                          />
                          <button 
                            type="button"
                            onClick={() => setEditingSlab({...editingSlab, photoUrl: ''})}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl mt-4">
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">M² Resultante:</span>
                  <span className="text-lg font-black text-blue-600">{(editingSlab.length * editingSlab.height).toFixed(3).replace('.', ',')} m²</span>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingSlab(null)}
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg hover:bg-slate-50 transition"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'SALVAR ALTERAÇÕES'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Exclusão de Chapa */}
      <AnimatePresence>
        {isDeleteSlabDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteSlabDialogOpen(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Excluir Chapa?</h3>
              <p className="text-slate-500 text-sm mb-6">Esta ação não pode ser desfeita. O registro desta chapa será removido permanentemente.</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteSlabDialogOpen(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg hover:bg-slate-50 transition"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => handleDeleteSlab(isDeleteSlabDialogOpen)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-bold text-sm rounded-lg hover:bg-red-700 transition shadow-lg shadow-red-600/20"
                >
                  EXCLUIR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Gerenciar Materiais */}
      <AnimatePresence>
        {isManagingMaterials && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingMaterials(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-tight">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Gerenciar Tipos de Material
                </h3>
                <button onClick={() => setIsManagingMaterials(false)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-3">
                {materialTypes.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-10">Nenhum material cadastrado.</p>
                ) : (
                  materialTypes.map(m => (
                    <div key={m.id} className="flex items-center gap-2 p-2 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      {editingMaterial?.id === m.id ? (
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={updatedMaterialName}
                            onChange={(e) => setUpdatedMaterialName(e.target.value)}
                            className="flex-1 px-3 py-1 text-sm border border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateMaterial(m.id);
                              if (e.key === 'Escape') setEditingMaterial(null);
                            }}
                          />
                          <button 
                            onClick={() => handleUpdateMaterial(m.id)}
                            className="p-1 px-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingMaterial(null)}
                            className="p-1 px-2 border border-slate-200 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-medium text-slate-700">{m.name}</span>
                          <button 
                            onClick={() => {
                              setEditingMaterial(m);
                              setUpdatedMaterialName(m.name);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteMaterial(m.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação de Exclusão em Massa */}
      <AnimatePresence>
        {isBulkDeleteOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBulkDeleteOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative max-w-md w-full bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 pb-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Confirmar Exclusão</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Você está prestes a excluir <span className="font-bold text-red-600">{selectedSlabs.length}</span> chapas selecionadas. Esta ação é irreversível e removerá todos os dados permanentemente.
                </p>
              </div>
              <div className="p-6 bg-slate-50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOpen(false)}
                  className="flex-1 px-4 py-3 bg-white text-slate-600 rounded-xl font-bold text-sm border border-slate-200 hover:bg-slate-100 transition"
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  SIM, EXCLUIR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Modal de Preview de Imagem */}
      <AnimatePresence>
        {previewImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewImage(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative max-w-5xl w-full bg-white rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.3)]"
            >
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <a 
                  href={previewImage} 
                  download 
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all border border-white/10"
                  title="Abrir em nova aba"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
                <button 
                  onClick={() => setPreviewImage(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all border border-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="aspect-video w-full relative bg-slate-900 flex items-center justify-center">
                <img 
                  src={previewImage} 
                  alt="Chapa Preview" 
                  className="max-h-full max-w-full object-contain shadow-2xl"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Seção Exclusiva para Impressão */}
      <div className="print-only bg-white text-black">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-[#2980b9] mb-1 uppercase">
              {activeTab === 'entrada' ? 'Relatório de Entrada de Blocos' : 
               activeTab === 'serragem' ? 'Relatório de Chapas Serradas' :
               activeTab === 'acido' ? 'Relatório de Aplicação de Ácido' :
               activeTab === 'resina' ? 'Relatório de Resinação' :
               activeTab === 'polimento' ? 'Relatório de Polimento' :
               activeTab === 'estoque' ? 'Relatório de Estoque Final' :
               'Relatório de Chapas Quebradas'}
            </h1>
            <p className="text-[10px] text-slate-500">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
          </div>
          {(startDate || endDate) && (
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Período</p>
              <p className="text-xs text-slate-700 font-medium">{startDate || 'Início'} — {endDate || 'Fim'}</p>
            </div>
          )}
        </div>

        <table className="w-full text-left border-collapse mb-8 border border-slate-300">
          <thead>
            {activeTab === 'entrada' ? (
              <tr className="bg-[#2980b9] text-white">
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">ID Bloco</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Material</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Medidas (m)</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Vol (m³)</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Data</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Status</th>
              </tr>
            ) : (
              <tr className="bg-[#2980b9] text-white">
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">ID Chapa</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Bloco</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Material</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Medidas (m)</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Área (m²)</th>
                <th className="p-2 text-[10px] font-bold uppercase border border-slate-300">Op.</th>
              </tr>
            )}
          </thead>
          <tbody>
            {activeTab === 'entrada' ? (
              filteredEntries.map((e, i) => (
                <tr key={e.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 text-[10px] border border-slate-200 font-mono">{e.blockId}</td>
                  <td className="p-2 text-[10px] border border-slate-200">{e.type}</td>
                  <td className="p-2 text-[10px] border border-slate-200">{e.length}x{e.height}x{e.width}</td>
                  <td className="p-2 text-[10px] border border-slate-200 font-bold">{e.volume.toFixed(3)}</td>
                  <td className="p-2 text-[10px] border border-slate-200">{e.entryDate}</td>
                  <td className="p-2 text-[10px] border border-slate-200 capitalize">{e.status || 'Ativo'}</td>
                </tr>
              ))
            ) : (
              filteredSlabs.filter(s => {
                const tabsMap: Record<string, string> = {
                  serragem: 'serrada',
                  acido: 'acido',
                  resina: 'resina',
                  polimento: 'polimento',
                  estoque: 'estoque',
                  quebradas: 'quebrada'
                };
                const currentStatus = tabsMap[activeTab] || 'serrada';
                return s.status === currentStatus || (currentStatus === 'serrada' && !s.status);
              }).map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 text-[10px] border border-slate-200 font-mono">{s.slabId}</td>
                  <td className="p-2 text-[10px] border border-slate-200 font-mono">{s.parentBlockId}</td>
                  <td className="p-2 text-[10px] border border-slate-200">{getSlabMaterial(s)}</td>
                  <td className="p-2 text-[10px] border border-slate-200">{s.length}x{s.height}</td>
                  <td className="p-2 text-[10px] border border-slate-200 font-bold">{s.area.toFixed(2)}</td>
                  <td className="p-2 text-[10px] border border-slate-200 truncate max-w-[80px]">{s.userName}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-8 text-[8px] text-slate-400 text-center uppercase tracking-widest">
          mc marmo control - relatório de produção
        </div>
      </div>
    </div>
  );
}

export default function ProducaoPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    }>
      <ProducaoContent />
    </Suspense>
  );
}
