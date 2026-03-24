import { useState, useEffect } from 'react';
import { supabase } from '../services/db/supabaseClient';
import { User } from '@supabase/supabase-js';
import { TeacherProfile } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadTeacherProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadTeacherProfile(session.user);
      } else {
        setTeacherProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadTeacherProfile = (authUser: User) => {
    // Load local rubrics keyed by the user ID to avoid DB schema changes.
    // In a prod app, this would be fetched from a 'teacher_profiles' table.
    const storageKey = `sg_pe_profile_${authUser.id}`;
    const saved = localStorage.getItem(storageKey);
    
    let profile: TeacherProfile = {
      id: authUser.id,
      email: authUser.email,
      name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
      avatar_url: authUser.user_metadata?.avatar_url,
      customRubrics: {}
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge saved rubrics with current user info
        profile = { ...profile, customRubrics: parsed.customRubrics || {} };
      } catch (e) {
        console.error("Failed to parse teacher profile from localStorage", e);
      }
    } else {
      // Save initial profile
      localStorage.setItem(storageKey, JSON.stringify(profile));
    }

    setTeacherProfile(profile);
    setLoading(false);
  };

  const updateTeacherProfile = (updatedProfile: TeacherProfile) => {
    if (!user) return;
    const storageKey = `sg_pe_profile_${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify(updatedProfile));
    setTeacherProfile(updatedProfile);
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) {
      console.error('Error logging in with Google:', error);
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
    setLoading(false);
  };

  return {
    user,
    teacherProfile,
    loading,
    signInWithGoogle,
    signOut,
    updateTeacherProfile
  };
};
