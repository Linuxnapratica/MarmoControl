import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type AuditLogType = 
  | 'login_success' 
  | 'login_failure' 
  | 'user_create' 
  | 'user_update' 
  | 'user_delete'
  | 'security_access';

export interface AuditLogData {
  userId?: string | null;
  userName?: string | null;
  event: string;
  details?: string;
  targetUserId?: string;
  targetUserName?: string;
  type: AuditLogType;
  timestamp?: any;
}

/**
 * Logs an event to the audit_logs collection.
 */
export async function logEvent(data: AuditLogData) {
  try {
    const logsRef = collection(db, 'audit_logs');
    
    // Auto-fill current user if not provided
    const currentUserId = auth.currentUser?.uid || data.userId || 'anonymous';
    const currentUserName = auth.currentUser?.displayName || data.userName || 'Sistema';

    await addDoc(logsRef, {
      ...data,
      userId: currentUserId,
      userName: currentUserName,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}
