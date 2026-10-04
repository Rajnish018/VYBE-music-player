import { create } from 'zustand';
import { authApi, favoritesApi, loadSession, saveSession, clearSession, tracksApi } from '../lib/api';
import { normalizeTrack } from '../utils/track';

export const useStore=create((set,get)=>({
 token:'',user:null,initialized:false,initializing:true,tracks:[],favorites:[],loading:false,error:'',
 async initialize(){if(get().initialized)return; const s=await loadSession(); if(!s.token){set({initialized:true,initializing:false});return;} try{const [me,tracks,favs]=await Promise.all([authApi.me(s.token),tracksApi.library(s.token),favoritesApi.all(s.token)]); const user=me?.user||s.user; set({token:s.token,user,tracks:tracks.map(normalizeTrack),favorites:favs.map(normalizeTrack),initialized:true,initializing:false});}catch(e){await clearSession();set({token:'',user:null,initialized:true,initializing:false,error:e.message});}},
 async login(email,password,register=false){set({loading:true,error:''});try{const data=register?await authApi.register({email,password}):await authApi.login({email,password});await saveSession(data.token,data.user); const [tracks,favs]=await Promise.all([tracksApi.library(data.token),favoritesApi.all(data.token)]);set({token:data.token,user:data.user,tracks:tracks.map(normalizeTrack),favorites:favs.map(normalizeTrack),loading:false});return data;}catch(e){set({loading:false,error:e.message});throw e;}},
 async logout(){try{if(get().token)await authApi.logout(get().token)}catch{} await clearSession();set({token:'',user:null,tracks:[],favorites:[]});},
 async refresh(){if(!get().token)return;set({loading:true});try{const [tracks,favs]=await Promise.all([tracksApi.library(get().token),favoritesApi.all(get().token)]);set({tracks:tracks.map(normalizeTrack),favorites:favs.map(normalizeTrack),loading:false});}catch(e){set({loading:false,error:e.message});}},
 async toggleFavorite(track){const token=get().token;const id=track.id;const exists=get().favorites.some(x=>String(x.id)===String(id)); try{if(exists){await favoritesApi.remove(id,token);set(s=>({favorites:s.favorites.filter(x=>String(x.id)!==String(id))}));}else{await favoritesApi.add(id,token);set(s=>({favorites:[normalizeTrack(track),...s.favorites]}));}}catch(e){set({error:e.message});}},
 async saveToLibrary(track){try{const data=await tracksApi.save(track.id,get().token);const saved=normalizeTrack(data?.track||track);set(s=>({tracks:s.tracks.some(x=>String(x.id)===String(saved.id))?s.tracks:[...s.tracks,saved]}));return saved;}catch(e){set({error:e.message});throw e;}}
}));
