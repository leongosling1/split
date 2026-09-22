import { supabase } from './supabase.js';

export async function signInWithGitHub(){
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.href }
  });
}
export async function signInWithGoogle(){
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
}
/* Passwordless: no password to remember, and no account-creation step —
   the same link both signs up a new person and signs in a returning one. */
export async function signInWithEmail(email){
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });
  if(error) throw error;
}
export async function signOut(){
  await supabase.auth.signOut();
}
export async function getSession(){
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(cb){
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return data.subscription;
}
export function displayName(user){
  if(!user) return '';
  return user.user_metadata?.user_name || user.user_metadata?.full_name || user.email || 'Account';
}
export function avatarUrl(user){
  return user?.user_metadata?.avatar_url || '';
}
