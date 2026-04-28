import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, getDocFromServer, setDoc, query, collection, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { logEvent } from './audit';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use the explicit bucket URL with gs:// prefix for better reliability in some environments
export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

// Force shorter retry times to avoid "hanging" and see errors faster
storage.maxOperationRetryTime = 20000; // 20s
storage.maxUploadRetryTime = 20000;

// Use initializeFirestore with experimentalForceLongPolling for better stability in proxy environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

/**
 * Common logic to handle profile creation/sync after any login
 */
async function handleProfileSync(user: any) {
  const userRef = doc(db, 'users', user.uid);
  let userSnap;
  try {
    userSnap = await getDocFromServer(userRef);
  } catch (e) {
    userSnap = await getDoc(userRef);
  }
  
  const normalizedEmail = user.email ? user.email.trim().toLowerCase() : '';
  const isAdminEmail = normalizedEmail === 'marioalbuquerquelins@gmail.com';
  
  if (!userSnap.exists()) {
    // Check for pending invite
    const q = query(collection(db, 'users'), where('email', '==', normalizedEmail));
    const querySnap = await getDocs(q);
    
    if (!querySnap.empty) {
      const existingDoc = querySnap.docs[0];
      const existingData = existingDoc.data();
      if (existingDoc.id !== user.uid) {
        await deleteDoc(doc(db, 'users', existingDoc.id));
      }
      await setDoc(userRef, {
        uid: user.uid,
        name: user.displayName || 'Usuário Marmo',
        email: normalizedEmail,
        photoURL: user.photoURL || '',
        role: existingData.role || (isAdminEmail ? 'admin' : 'member'),
        phone: existingData.phone || '',
        createdAt: existingData.createdAt || new Date().toISOString(),
        permissions: existingData.permissions || {}
      });
    } else {
      await setDoc(userRef, {
        uid: user.uid,
        name: user.displayName || 'Usuário Marmo',
        email: normalizedEmail,
        photoURL: user.photoURL || '',
        role: isAdminEmail ? 'admin' : 'member',
        createdAt: new Date().toISOString(),
        permissions: {}
      });
    }
  } else {
    // Existing user sync
    const currentData = userSnap.data();
    const updates: any = {};
    if (isAdminEmail && currentData.role !== 'admin') updates.role = 'admin';
    if (!currentData.name || currentData.name === 'No Name') updates.name = user.displayName || 'Usuário Marmo';
    if (currentData.email !== normalizedEmail) updates.email = normalizedEmail;
    
    if (Object.keys(updates).length > 0) {
      await updateDoc(userRef, updates);
    }
  }

  // Log successful login
  await logEvent({
    userId: user.uid,
    userName: user.displayName || normalizedEmail,
    event: `Usuário ${normalizedEmail} realizou login com sucesso.`,
    type: 'login_success'
  });

  return user;
}

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return await handleProfileSync(result.user);
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return await handleProfileSync(result.user);
};

export const signUpWithEmail = async (email: string, pass: string, name: string, phone: string = '') => {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await createUserWithEmailAndPassword(auth, normalizedEmail, pass);
  const user = result.user;
  
  const userRef = doc(db, 'users', user.uid);
  const isAdminEmail = normalizedEmail === 'marioalbuquerquelins@gmail.com';
  let role = isAdminEmail ? 'admin' : 'member';
  let createdAt = new Date().toISOString();
  let userPhone = phone;
  let permissions = {};
  
  try {
    // Check for pending invite
    const q = query(collection(db, 'users'), where('email', '==', normalizedEmail));
    const querySnap = await getDocs(q);
    
    if (!querySnap.empty) {
      const existingDoc = querySnap.docs[0];
      const existingData = existingDoc.data();
      role = existingData.role || role;
      createdAt = existingData.createdAt || createdAt;
      userPhone = existingData.phone || userPhone;
      permissions = existingData.permissions || {};
      
      // Delete the placeholder doc if it's not the same as our new UID
      if (existingDoc.id !== user.uid) {
        await deleteDoc(doc(db, 'users', existingDoc.id));
      }
    }
  } catch (err) {
    console.error('Error checking for pending invites:', err);
  }

  await setDoc(userRef, {
    uid: user.uid,
    name: name || 'Usuário Marmo',
    email: normalizedEmail,
    phone: userPhone,
    photoURL: '',
    role: role,
    createdAt: createdAt,
    permissions: permissions
  });
  
  return user;
};

export const logout = () => signOut(auth);
